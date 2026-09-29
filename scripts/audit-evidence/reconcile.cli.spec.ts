import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReconciliationResult } from './reconcile.ts'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function run(status: 'RESOLVED' | 'OPEN' | 'PENDING', testOutcome: 'PASS' | 'FAIL' | 'NOT_RUN', reviewerOmitsTest = false,
  sessionExit?: number, taskMetadata = true, toolError = false, reuseSession = false,
  requireClosed = true, outputCollision: boolean | 'symlink' = false, includeParentSession = true,
  childParentSessionId = 'session-parent') {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-audit-evidence-'))
  directories.push(directory)
  const revision = '0123456789abcdef'
  const observedAt = '2026-09-28T12:00:00Z'
  const requirements = { schemaVersion: 1, auditId: 'case', revision, independentReviewer: 'reviewer',
    findings: [{ id: 'A24-03', requiredScopes: reviewerOmitsTest ? ['source', 'test'] : ['test'] }] }
  const sessionBindings = new Map<string, { sessionId: string; sessionSha256: string }>()
  if (sessionExit !== undefined) {
    for (const agent of ['web', 'reviewer']) {
      const sessionId = `session-${reuseSession ? 'web' : agent}`
      const events = [
        { type: 'session', version: 4, id: sessionId, createdAt: 0, origin: 'subagent', parentSession: childParentSessionId },
        { type: 'tool/call', seq: 0, time: 1, data: { turn: 1, step: 1, callId: 'call-1', name: 'bash',
          arguments: JSON.stringify({ command: 'pnpm test retry' }) } },
        { type: 'tool/result', seq: 1, time: 2, surfaceOp: 'append', data: { turn: 1, step: 1, message: { toolCallId: 'call-1',
          isError: toolError, content: [{ type: 'text', text: sessionExit === 0 ? 'passed\n[exit code: 0]' : `failed\n[exit code: ${sessionExit}]` }] } } },
      ]
      const bytes = `${events.map(event => JSON.stringify(event)).join('\n')}\n`
      writeFileSync(join(directory, `${agent}.session.v4.jsonl`), bytes)
      sessionBindings.set(agent, { sessionId, sessionSha256: createHash('sha256').update(bytes).digest('hex') })
    }
    const parentBytes = `${JSON.stringify({ type: 'session', version: 4, id: 'session-parent', createdAt: 0 })}\n`
    writeFileSync(join(directory, 'parent.session.v4.jsonl'), parentBytes)
    sessionBindings.set('parent', { sessionId: 'session-parent',
      sessionSha256: createHash('sha256').update(parentBytes).digest('hex') })
  }
  const report = { schemaVersion: 1, auditId: 'case', agentId: 'web', revision, observedAt,
    ...taskMetadata ? { taskScope: 'Verify retry path', files: ['src/retry.ts'] } : {},
    ...(sessionBindings.get('web') ?? {}), findings: [{
      id: 'A24-03', scope: 'test', status: testOutcome === 'PASS' ? 'RESOLVED' : testOutcome === 'FAIL' ? 'OPEN' : 'UNVERIFIED',
      confidence: testOutcome === 'NOT_RUN' ? 'low' : 'high',
      summary: 'retry path', evidence: [{ id: 'test-1', kind: 'test-run', outcome: testOutcome,
        reference: sessionBindings.get('web') ? `session:${sessionBindings.get('web')?.sessionSha256}#call-1` : 'test-output.txt',
        observedAt, revision, command: 'pnpm test retry',
        ...testOutcome === 'NOT_RUN' ? {} : { exitCode: testOutcome === 'PASS' ? 0 : 7 } }],
      limitations: testOutcome === 'NOT_RUN' ? ['test environment unavailable'] : [],
    }] }
  if (reviewerOmitsTest) report.findings.unshift({ id: 'A24-03', scope: 'source', status: 'RESOLVED',
    confidence: 'high', summary: 'source passes', evidence: [{ id: 'source-1', kind: 'source-read', outcome: 'PASS',
      reference: 'source.ts:10', observedAt, revision, command: 'pnpm test retry', exitCode: 0 }], limitations: [] })
  const decisions = { schemaVersion: 1, auditId: 'case', parentAgentId: 'parent', revision,
    ...(sessionBindings.get('parent') ?? {}),
    decisions: [{ id: 'A24-03', status, rationale: 'current evidence', evidenceIds: status !== 'PENDING' ?
      (reviewerOmitsTest ? ['source-1', 'test-1'] : ['test-1']) : [], adjudications: [] }] }
  const reviewer = { ...report, agentId: 'reviewer', ...(sessionBindings.get('reviewer') ?? {}),
    findings: report.findings.map(finding => ({ ...finding,
      evidence: finding.evidence.map(item => ({ ...item, id: `review-${item.id}`,
        reference: item.kind === 'test-run' && sessionBindings.get('reviewer')
          ? `session:${sessionBindings.get('reviewer')?.sessionSha256}#call-1` : item.reference })) })) }
  if (reviewerOmitsTest) reviewer.findings = reviewer.findings.filter(finding => finding.scope === 'source')
  for (const [name, contents] of Object.entries({ requirements, report, reviewer, decisions })) {
    writeFileSync(join(directory, `${name}.json`), JSON.stringify(contents))
  }
  if (outputCollision === 'symlink') {
    symlinkSync(join(directory, 'web.session.v4.jsonl'), join(directory, 'output-alias.json'))
  }
  const result = spawnSync(process.execPath, [
    '--import', 'tsx/esm', resolve('scripts/audit-evidence/reconcile.ts'),
    '--requirements', join(directory, 'requirements.json'),
    '--reports', join(directory, 'report.json'),
    join(directory, 'reviewer.json'),
    '--decisions', join(directory, 'decisions.json'),
    ...requireClosed ? ['--require-closed'] : [],
    ...outputCollision ? ['--output', join(directory,
      outputCollision === 'symlink' ? 'output-alias.json' : 'web.session.v4.jsonl')] : [],
    ...sessionExit === undefined ? [] : ['--session', `web=${join(directory, 'web.session.v4.jsonl')}`,
      '--session', `reviewer=${join(directory, 'reviewer.session.v4.jsonl')}`,
      ...includeParentSession ? ['--session', `parent=${join(directory, 'parent.session.v4.jsonl')}`] : []],
  ], { cwd: resolve('.'), encoding: 'utf8' })
  return { ...result, directory }
}

describe('reconciliation command', () => {
  it('rejects resolved findings without the child Session files', () => {
    const result = run('RESOLVED', 'PASS')
    expect(result.status).toBe(2)
    const rejected = JSON.parse(result.stdout) as ReconciliationResult
    expect(rejected.errors).toContain(
      'Session verification NOT_RUN for resolved claims or executed tests; provide --session for every child report')
    expect(rejected.totals.resolved).toBe(0)
  })

  it('rejects resolved findings without Sessions even when closure is optional', () => {
    const result = run('RESOLVED', 'PASS', false, undefined, true, false, false, false)
    expect(result.status).toBe(2)
    expect((JSON.parse(result.stdout) as ReconciliationResult).totals.resolved).toBe(0)
  })

  it('refuses to overwrite an input Session with reconciliation output', () => {
    const result = run('RESOLVED', 'PASS', false, 0, true, false, false, true, true)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--output must differ from every input file')
    expect(JSON.parse(readFileSync(join(result.directory, 'web.session.v4.jsonl'), 'utf8').split('\n')[0] ?? '')).toMatchObject(
      { type: 'session', version: 4 })
  })

  it('refuses to overwrite an input Session through a symlink', () => {
    const result = run('RESOLVED', 'PASS', false, 0, true, false, false, true, 'symlink')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--output must differ from every input file')
    expect(JSON.parse(readFileSync(join(result.directory, 'web.session.v4.jsonl'), 'utf8').split('\n')[0] ?? '')).toMatchObject(
      { type: 'session', version: 4 })
  })

  it('binds a parent test adjudication to its own Session call and result', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-parent-audit-'))
    directories.push(directory)
    const revision = '0123456789abcdef'
    const observedAt = '2026-09-28T12:00:00Z'
    const writeJson = (name: string, value: unknown) => {
      writeFileSync(join(directory, `${name}.json`), JSON.stringify(value))
    }
    writeJson('requirements', { schemaVersion: 1, auditId: 'case', revision, independentReviewer: 'reviewer',
      findings: [{ id: 'A', requiredScopes: ['test'] }] })
    const childBindings = ['builder', 'reviewer'].map((agentId) => {
      const sessionId = `session-${agentId}`
      const bytes = `${JSON.stringify({ type: 'session', version: 4, id: sessionId, createdAt: 0,
        origin: 'subagent', parentSession: 'session-parent' })}\n`
      writeFileSync(join(directory, `${agentId}.jsonl`), bytes)
      const sessionSha256 = createHash('sha256').update(bytes).digest('hex')
      writeJson(agentId, { schemaVersion: 1, auditId: 'case', agentId, revision, observedAt,
        taskScope: 'Inspect test scope', files: [], sessionId, sessionSha256,
        findings: [{ id: 'A', scope: 'test', status: 'UNVERIFIED', confidence: 'low', summary: 'not run',
          limitations: ['no child test'], evidence: [{ id: `${agentId}-pending`, kind: 'test-run', outcome: 'NOT_RUN',
            reference: 'not-run', observedAt, revision }] }] })
      return `${agentId}=${join(directory, `${agentId}.jsonl`)}`
    })
    const parentPath = join(directory, 'parent.jsonl')
    const parentEvents = [
      { type: 'session', version: 4, id: 'session-parent', createdAt: 0 },
      { type: 'tool/call', seq: 0, time: 1, data: { turn: 1, step: 1, callId: 'parent-call', name: 'bash',
        arguments: JSON.stringify({ command: 'pnpm test adjudicate' }) } },
      { type: 'tool/result', seq: 1, time: 2, surfaceOp: 'append', data: { turn: 1, step: 1,
        message: { toolCallId: 'parent-call', isError: false, content: [{ type: 'text', text: 'passed\n[exit code: 0]' }] } } },
    ]
    const bytes = `${parentEvents.map(event => JSON.stringify(event)).join('\n')}\n`
    writeFileSync(parentPath, bytes)
    const sessionSha256 = createHash('sha256').update(bytes).digest('hex')
    writeJson('decisions', { schemaVersion: 1, auditId: 'case', parentAgentId: 'parent', revision,
      sessionId: 'session-parent', sessionSha256,
      decisions: [{ id: 'A', status: 'RESOLVED', rationale: 'direct test', evidenceIds: ['parent-test'],
        adjudications: [{ scope: 'test', rationale: 'direct test', evidence: { id: 'parent-test', kind: 'test-run',
          outcome: 'PASS', reference: `session:${sessionSha256}#parent-call`, observedAt, revision,
          command: 'pnpm test adjudicate', exitCode: 0 } }] }] })
    const invoke = (includeParent: boolean) => spawnSync(process.execPath, ['--import', 'tsx/esm',
      resolve('scripts/audit-evidence/reconcile.ts'), '--requirements', join(directory, 'requirements.json'),
      '--reports', join(directory, 'builder.json'), join(directory, 'reviewer.json'),
      '--decisions', join(directory, 'decisions.json'), '--require-closed',
      ...childBindings.flatMap(binding => ['--session', binding]),
      ...includeParent ? ['--session', `parent=${parentPath}`] : [],
    ], { cwd: resolve('.'), encoding: 'utf8' })
    const missing = invoke(false)
    expect(missing.status).toBe(2)
    expect((JSON.parse(missing.stdout) as ReconciliationResult).errors).toContain('missing Session log for parent')
    const verified = invoke(true)
    expect(verified.status).toBe(0)
    expect((JSON.parse(verified.stdout) as ReconciliationResult).sessionChecks).toHaveLength(3)

    const childPath = join(directory, 'builder.jsonl')
    const childHeader = JSON.parse(readFileSync(childPath, 'utf8').split('\n')[0] ?? '') as Record<string, unknown>
    childHeader.parentSession = 'session-other-parent'
    const childBytes = `${JSON.stringify(childHeader)}\n`
    writeFileSync(childPath, childBytes)
    const reportPath = join(directory, 'builder.json')
    const childReport = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>
    childReport.sessionSha256 = createHash('sha256').update(childBytes).digest('hex')
    writeFileSync(reportPath, JSON.stringify(childReport))
    const mismatchedParent = invoke(true)
    expect(mismatchedParent.status).toBe(2)
    expect((JSON.parse(mismatchedParent.stdout) as ReconciliationResult).errors)
      .toContain('builder: parent Session ID differs from child-declared parent lineage')
  })

  it('binds each child test claim to an actual Session tool result', () => {
    const passing = run('RESOLVED', 'PASS', false, 0)
    expect(passing.status).toBe(0)
    expect((JSON.parse(passing.stdout) as ReconciliationResult).sessionChecks).toHaveLength(3)
    const forged = run('RESOLVED', 'PASS', false, 7)
    expect(forged.status).toBe(2)
    const result = JSON.parse(forged.stdout) as ReconciliationResult
    expect(result.errors).toContain(
      'web:test-1: reported exit code differs from Session result')
    expect(result.findings[0]?.status).toBe('PENDING')
    expect(result.totals.resolved).toBe(0)
  })

  it('rejects a verified child report without its task remit and file list', () => {
    const result = run('RESOLVED', 'PASS', false, 0, false)
    expect(result.status).toBe(2)
    expect((JSON.parse(result.stdout) as ReconciliationResult).errors).toContain(
      'web: Session verification requires taskScope, files, sessionId, and sessionSha256')
  })

  it('keeps an import-failing child unresolved despite a declared PASS', () => {
    const result = run('RESOLVED', 'PASS', false, 0, true, true)
    expect(result.status).toBe(2)
    const rejected = JSON.parse(result.stdout) as ReconciliationResult
    expect(rejected.errors).toContain('web: Session has 1 tool error(s); resolved report needs direct adjudication')
    expect(rejected.totals.resolved).toBe(0)
  })

  it('rejects one Session reused for two independent child reports', () => {
    const result = run('RESOLVED', 'PASS', false, 0, true, false, true)
    expect(result.status).toBe(2)
    expect((JSON.parse(result.stdout) as ReconciliationResult).errors).toContain(
      'reviewer: Session ID is reused by another child report')
  })

  it('requires and matches the raw parent Session before closing child findings', () => {
    const missing = run('RESOLVED', 'PASS', false, 0, true, false, false, true, false, false)
    expect(missing.status).toBe(2)
    expect((JSON.parse(missing.stdout) as ReconciliationResult).errors).toContain('missing Session log for parent')
    const mismatched = run('RESOLVED', 'PASS', false, 0, true, false, false, true, false, true, 'session-other-parent')
    expect(mismatched.status).toBe(2)
    expect((JSON.parse(mismatched.stdout) as ReconciliationResult).errors)
      .toContain('web: parent Session ID differs from child-declared parent lineage')
  })

  it('keeps mixed-scope findings pending when Session verification fails', () => {
    const result = run('OPEN', 'FAIL', true, 7, true, true)
    expect(result.status).toBe(2)
    const rejected = JSON.parse(result.stdout) as ReconciliationResult
    expect(rejected.findings[0]).toMatchObject({ status: 'PENDING', recommendedStatus: 'PENDING' })
    expect(rejected.findings[0]?.scopes).toMatchObject([
      { scope: 'source', outcome: 'PENDING' },
      { scope: 'test', outcome: 'OPEN' },
    ])
    expect(rejected.totals).toMatchObject({ open: 0, pending: 1, resolved: 0 })
  })

  it('retains a supported OPEN disposition when Session verification fails', () => {
    const result = run('OPEN', 'FAIL', false, 7, true, false, true)
    expect(result.status).toBe(2)
    const rejected = JSON.parse(result.stdout) as ReconciliationResult
    expect(rejected.findings[0]?.status).toBe('OPEN')
    expect(rejected.totals).toMatchObject({ open: 1, resolved: 0 })
  })

  it('returns a distinct pending status when the required test did not run', () => {
    const result = run('PENDING', 'NOT_RUN')
    expect(result.status).toBe(1)
    expect((JSON.parse(result.stdout) as ReconciliationResult).findings[0]?.recommendedStatus).toBe('PENDING')
  })

  it('returns pending even without the optional closure flag', () => {
    const result = run('PENDING', 'NOT_RUN', false, undefined, true, false, false, false)
    expect(result.status).toBe(1)
  })

  it('returns an incomplete status for an open finding', () => {
    const result = run('OPEN', 'FAIL', false, 7, true, false, false, false)
    expect(result.status).toBe(1)
    expect((JSON.parse(result.stdout) as ReconciliationResult).totals.open).toBe(1)
  })

  it("rejects a parent's false resolved claim over an unexecuted test", () => {
    const result = run('RESOLVED', 'NOT_RUN')
    expect(result.status).toBe(2)
    expect((JSON.parse(result.stdout) as ReconciliationResult).errors)
      .toContain('A24-03: parent RESOLVED conflicts with observed PENDING')
  })

  it('rejects closure through the public command when the reviewer omits a required test scope', () => {
    const result = run('RESOLVED', 'PASS', true)
    expect(result.status).toBe(2)
    expect((JSON.parse(result.stdout) as ReconciliationResult).errors)
      .toContain('independent reviewer omitted scope A24-03:test')
  })

  it('rejects false closure of both recorded candidate conflicts through the public command', () => {
    const root = resolve('snapshots/session/audit-evidence-reconciliation')
    const result = spawnSync(process.execPath, [
      '--import', 'tsx/esm', resolve('scripts/audit-evidence/reconcile.ts'),
      '--requirements', join(root, 'workspace/requirements.json'),
      '--reports', join(root, 'workspace.expected/web.json'), join(root, 'workspace.expected/infra.json'),
      '--decisions', resolve('scripts/audit-evidence/fixtures/candidate-false-resolved-decisions.json'),
      '--require-closed',
    ], { cwd: resolve('.'), encoding: 'utf8' })
    expect(result.status).toBe(2)
    const rejected = JSON.parse(result.stdout) as ReconciliationResult
    expect(rejected.valid).toBe(false)
    expect(rejected.errors).toContain('A24-03: parent RESOLVED conflicts with observed PENDING')
    expect(rejected.errors).toContain('A24-07: parent RESOLVED conflicts with observed PENDING')
  })
})
