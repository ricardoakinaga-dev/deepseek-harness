import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const directory = fileURLToPath(new URL('.', import.meta.url))
const seed = join(directory, 'workspace')
const expected = join(directory, 'workspace.expected')
const reconciler = fileURLToPath(new URL('../../../scripts/audit-evidence/reconcile.ts', import.meta.url))
const tsx = createRequire(import.meta.url).resolve('tsx/cli')
const sourceFiles = ['a24-03.test.ts', 'a24-03.ts', 'a24-07.ts']

function session(name) {
  return readFileSync(join(directory, name), 'utf8').trimEnd().split('\n').map(line => JSON.parse(line))
}

function finalText(events) {
  return events.filter(event => event.type === 'assistant/message').at(-1)?.data.message.content
    .filter(block => block.type === 'text').map(block => block.text).join('')
}

function toolText(event) {
  return event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

function toolResult(events, call) {
  const result = events.find(event => event.type === 'tool/result'
    && event.data.message.toolCallId === call.data.callId)
  assert.ok(result, `missing result for ${call.data.name}`)
  assert.equal(result.data.message.isError, false)
  assert.ok(events.indexOf(call) < events.indexOf(result))
  return result
}

function revision() {
  const digest = createHash('sha256')
  for (const name of sourceFiles) {
    digest.update(name).update('\0').update(readFileSync(join(seed, name))).update('\0')
  }
  return digest.digest('hex')
}

function checkChild(parent, call, catalog, child, filename, agentId, requiredReads) {
  const task = JSON.parse(call.data.arguments)
  const childTask = child.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
  assert.equal(call.data.name, 'subagent')
  assert.equal(task.run_in_background, false)
  assert.doesNotMatch(task.prompt, /\b(?:PENDING|RESOLVED|OPEN|UNVERIFIED|BLOCKED)\b/)
  assert.equal(childTask.data.content[0].text, task.prompt)
  assert.equal(child[0].parentSession, parent[0].id)
  assert.equal(catalog.data.childId, child[0].id)
  assert.equal(catalog.data.childCreatedAt, child[0].createdAt)
  assert.ok(parent.indexOf(call) < parent.indexOf(catalog))
  const parentResult = toolResult(parent, call)
  assert.ok(parent.indexOf(catalog) < parent.indexOf(parentResult))
  assert.deepEqual(parentResult.sourceEventSeqs, [parent.indexOf(call) - 1])
  assert.equal(toolText(parentResult), finalText(child))
  assert.equal(child.filter(event => event.type === 'request/header').length, 1)
  assert.equal(child.at(-1).data.reason.kind, 'completed')

  const calls = child.filter(event => event.type === 'tool/call')
  const reads = calls.filter(event => event.data.name === 'read')
  const shell = calls.filter(event => event.data.name === 'bash')
  const writes = calls.filter(event => event.data.name === 'write')
  assert.equal(calls.length, requiredReads.length + 2)
  assert.deepEqual(reads.map(event => JSON.parse(event.data.arguments).file_path).sort(), [...requiredReads].sort())
  assert.equal(shell.length, 1)
  assert.equal(writes.length, 1)
  for (const read of reads) assert.ok(child.indexOf(toolResult(child, read)) < child.indexOf(writes[0]))
  const missingCommand = JSON.parse(shell[0].data.arguments).command
  assert.match(missingCommand, /test -e a24-07\.dependency\.ts/)
  assert.doesNotMatch(missingCommand, /\b(?:vitest|tsx|node --test|ls|find)\b/)
  assert.match(toolText(toolResult(child, shell[0])), /DEPENDENCY_MISSING/)
  assert.ok(child.indexOf(toolResult(child, shell[0])) < child.indexOf(writes[0]))
  const written = JSON.parse(writes[0].data.arguments)
  assert.equal(written.file_path, filename)
  assert.match(toolText(toolResult(child, writes[0])), /Created file/)
  assert.equal(existsSync(join(seed, filename)), false, `${filename} must be created by the child`)
  const report = JSON.parse(written.content)
  assert.deepEqual(report, JSON.parse(readFileSync(join(expected, filename), 'utf8')))
  assert.equal(report.agentId, agentId)
  assert.equal(report.revision, revision())
  for (const finding of report.findings) {
    for (const evidence of finding.evidence) {
      assert.equal(evidence.revision, revision())
      assert.ok(evidence.id.startsWith(`${agentId}-`))
    }
    if (finding.status === 'RESOLVED') assert.ok(finding.evidence.some(item => item.outcome === 'PASS'))
    if (finding.status === 'OPEN') assert.ok(finding.evidence.some(item => item.outcome === 'FAIL'))
  }
  return { report, parentResult }
}

function runCli(requirements, web, infra, decisions) {
  const result = spawnSync(process.execPath, [
    tsx, reconciler, '--requirements', requirements, '--reports', web, infra,
    '--decisions', decisions, '--require-closed',
  ], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.stderr, '')
  return result
}

test('independent child reports and parent decisions flow through the public reconciler', () => {
  const parent = session('session.v4.jsonl')
  const reviewer = session('session.1.v4.jsonl')
  const builder = session('session.2.v4.jsonl')
  const parentCalls = parent.filter(event => event.type === 'tool/call')
  const catalogs = parent.filter(event => event.type === 'subagent/catalog')
  const parentTask = parent.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    .data.content[0].text
  assert.doesNotMatch(parentTask, /\b(?:PENDING|RESOLVED|OPEN|UNVERIFIED|BLOCKED)\b/)
  assert.deepEqual(parentCalls.map(event => event.data.name), [
    'subagent', 'subagent', 'read', 'read', 'read', 'read', 'write', 'bash',
  ])
  assert.equal(catalogs.length, 2)
  assert.equal(parent.filter(event => event.type === 'request/header').length, 1)
  for (const events of [parent, reviewer, builder]) {
    assert.equal(events.filter(event => event.type === 'assistant/attempt').length, 0)
    assert.equal(events.at(-1).data.reason.kind, 'completed')
    for (const message of events.filter(event => event.type === 'assistant/message')) {
      assert.equal(message.data.stream.at(-1)?.chunk?.type, 'finish')
    }
  }

  const infra = checkChild(parent, parentCalls[0], catalogs[0], reviewer, 'infra.json', 'infra', [
    'infra-assignment.md', 'requirements.json', 'a24-03.ts', 'a24-03.test.ts', 'a24-07.ts',
  ])
  const web = checkChild(parent, parentCalls[1], catalogs[1], builder, 'web.json', 'web', [
    'web-assignment.md', 'a24-03.ts', 'a24-03.test.ts', 'a24-07.ts',
  ])
  const evidenceIds = [infra.report, web.report]
    .flatMap(report => report.findings.flatMap(finding => finding.evidence.map(item => item.id)))
  assert.equal(new Set(evidenceIds).size, evidenceIds.length)
  assert.notEqual(reviewer[0].id, builder[0].id)
  assert.ok(parent.indexOf(infra.parentResult) < parent.indexOf(parentCalls[1]))
  assert.ok(parent.indexOf(web.parentResult) < parent.indexOf(parentCalls[2]))

  const parentReads = parentCalls.slice(2, 6)
  assert.deepEqual(parentReads.map(call => JSON.parse(call.data.arguments).file_path).sort(), [
    'parent-assignment.md', 'requirements.json', 'infra.json', 'web.json',
  ].sort())
  for (const call of parentReads) {
    assert.ok(parent.indexOf(toolResult(parent, call)) < parent.indexOf(parentCalls[6]))
  }
  const reportReads = parentReads.filter(call => ['infra.json', 'web.json']
    .includes(JSON.parse(call.data.arguments).file_path))
  for (const call of reportReads) {
    const filename = JSON.parse(call.data.arguments).file_path
    const result = toolResult(parent, call)
    assert.match(toolText(result), new RegExp(`"agentId"\\s*:\\s*"${filename.slice(0, -5)}"`))
    assert.equal(result.data.meta.lines.map(line => line.text).join('\n'),
      readFileSync(join(expected, filename), 'utf8').trimEnd())
  }
  assert.equal(existsSync(join(seed, 'decisions.json')), false)
  const decisionCall = parentCalls[6]
  const decisionWrite = JSON.parse(decisionCall.data.arguments)
  assert.equal(decisionWrite.file_path, 'decisions.json')
  assert.match(toolText(toolResult(parent, decisionCall)), /Created file/)
  const decisions = JSON.parse(decisionWrite.content)
  assert.deepEqual(decisions, JSON.parse(readFileSync(join(expected, 'decisions.json'), 'utf8')))
  assert.equal(decisions.parentAgentId, 'parent')

  const requiredRevision = revision()
  assert.match(requiredRevision, /^[a-f0-9]{64}$/)
  const requirements = JSON.parse(readFileSync(join(seed, 'requirements.json'), 'utf8'))
  assert.equal(requirements.revision, requiredRevision)
  assert.equal(requirements.independentReviewer, 'infra')
  assert.equal(decisions.revision, requiredRevision)
  assert.equal(existsSync(join(seed, 'a24-07.dependency.ts')), false)
  assert.equal(existsSync(join(expected, 'a24-07.dependency.ts')), false)
  for (const report of [infra.report, web.report]) {
    assert.equal(report.revision, requiredRevision)
    const testFinding = report.findings.find(item => item.id === 'A24-03' && item.scope === 'test')
    assert.equal(testFinding.status, 'UNVERIFIED')
    assert.deepEqual(testFinding.evidence.map(item => [item.kind, item.outcome]), [['test-run', 'NOT_RUN']])
    assert.equal('command' in testFinding.evidence[0], false)
    assert.equal('exitCode' in testFinding.evidence[0], false)
  }
  assert.deepEqual(infra.report.findings.map(item => [item.id, item.scope]), [
    ['A24-03', 'source'], ['A24-03', 'test'], ['A24-07', 'source'],
    ['A24-07', 'dependency'], ['A24-07', 'external'],
  ])
  const dependency = infra.report.findings.find(item => item.scope === 'dependency')
  assert.equal(dependency.evidence[0].kind, 'advisory-read')
  assert.equal(dependency.status, 'UNVERIFIED')
  assert.equal(dependency.evidence[0].outcome, 'NOT_RUN')
  assert.equal('command' in dependency.evidence[0], false)
  assert.equal('exitCode' in dependency.evidence[0], false)
  assert.ok(dependency.limitations.some(item => /missing|absent/i.test(item)))
  const external = infra.report.findings.find(item => item.scope === 'external')
  assert.equal(external.evidence[0].outcome, 'BLOCKED')
  assert.match(external.evidence[0].reference, /credential/i)

  const cliCall = parentCalls[7]
  const command = JSON.parse(cliCall.data.arguments).command
  assert.match(command, /\bexec tsx scripts\/audit-evidence\/reconcile\.ts\b/)
  assert.match(command, /--requirements .*requirements\.json/)
  assert.match(command, /--reports .*web\.json.*infra\.json/)
  assert.match(command, /--decisions .*decisions\.json/)
  assert.match(command, /--require-closed/)
  assert.ok(parent.indexOf(toolResult(parent, decisionCall)) < parent.indexOf(cliCall))
  const cliResult = toolResult(parent, cliCall)
  assert.deepEqual(cliResult.sourceEventSeqs, [parent.indexOf(cliCall) - 1])
  assert.ok(parent.indexOf(cliResult) < parent.findLastIndex(event => event.type === 'assistant/message'))
  const output = toolText(cliResult)
  const exitMarker = '\nEXIT_CODE=1\n'
  assert.ok(output.endsWith(exitMarker), 'the closure exit status must be observed by bash')
  const persisted = JSON.parse(output.slice(0, -exitMarker.length))
  assert.equal(persisted.revision, requiredRevision)
  assert.equal(persisted.valid, true)
  assert.deepEqual(persisted.errors, [])
  assert.deepEqual(persisted.totals, { resolved: 0, open: 0, pending: 2, conflicts: 2 })
  assert.deepEqual(persisted.findings.map(item => [item.id, item.status, item.recommendedStatus]), [
    ['A24-03', 'PENDING', 'PENDING'], ['A24-07', 'PENDING', 'PENDING'],
  ])
  for (const finding of persisted.findings) {
    for (const scope of finding.scopes) {
      const fromReports = [web.report, infra.report].flatMap(report => report.findings
        .filter(item => item.id === finding.id && item.scope === scope.scope)
        .map(item => ({ agentId: report.agentId, status: item.status })))
      assert.deepEqual(scope.childStatuses, fromReports)
    }
    assert.equal(finding.scopes.find(scope => scope.scope === 'source').conflict, true)
  }
  assert.deepEqual(decisions.decisions.map(item => [item.id, item.status]), [
    ['A24-03', 'PENDING'], ['A24-07', 'PENDING'],
  ])

  const requirementsPath = join(expected, 'requirements.json')
  const webPath = join(expected, 'web.json')
  const infraPath = join(expected, 'infra.json')
  const decisionsPath = join(expected, 'decisions.json')
  const direct = runCli(requirementsPath, webPath, infraPath, decisionsPath)
  assert.equal(direct.status, 1)
  assert.deepEqual(JSON.parse(direct.stdout), persisted)

  const temp = mkdtempSync(join(tmpdir(), 'dsh-aud08-events-'))
  try {
    const falseClosure = structuredClone(decisions)
    falseClosure.decisions.find(item => item.id === 'A24-03').status = 'RESOLVED'
    const falsePath = join(temp, 'false-closure.json')
    writeFileSync(falsePath, JSON.stringify(falseClosure))
    const falseResult = runCli(requirementsPath, webPath, infraPath, falsePath)
    assert.equal(falseResult.status, 2)
    const falseOutput = JSON.parse(falseResult.stdout)
    assert.equal(falseOutput.valid, false)
    assert.ok(falseOutput.errors.some(error => /A24-03: parent RESOLVED conflicts with observed PENDING/.test(error)))

    const missingScope = structuredClone(infra.report)
    missingScope.findings = missingScope.findings.filter(item => !(item.id === 'A24-07' && item.scope === 'external'))
    const missingPath = join(temp, 'missing-scope.json')
    writeFileSync(missingPath, JSON.stringify(missingScope))
    const missingResult = runCli(requirementsPath, webPath, missingPath, decisionsPath)
    assert.equal(missingResult.status, 2)
    const missingOutput = JSON.parse(missingResult.stdout)
    assert.equal(missingOutput.valid, false)
    assert.ok(missingOutput.errors.includes('independent reviewer omitted scope A24-07:external'))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }

  const answer = finalText(parent)
  assert.match(answer, /A24-03.*PENDING/is)
  assert.match(answer, /A24-07.*PENDING/is)
  assert.match(answer, /(?:valid|validity).*true|schema valid/i)
  assert.match(answer, /(?:not closed|pending|not approved)/i)
  assert.match(answer, /test.*(?:not run|unexecuted|UNVERIFIED)/is)
  assert.match(answer, /dependenc.*(?:missing|absent)/is)
  assert.match(answer, /(?:credential|provider).*BLOCKED|BLOCKED.*(?:credential|provider)/is)
})
