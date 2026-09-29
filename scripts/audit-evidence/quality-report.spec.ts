import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decisionsSchema, reportSchema, requirementsSchema } from './contracts.ts'
import { parsePreflightSpec, preflightAudit } from './preflight.ts'
import { reconcileAudit } from './reconcile.ts'
import type { ReconciliationResult } from './reconcile.ts'
import { buildManifest, type CorpusManifest, type SessionMetrics } from './session-corpus.ts'
import { buildQualityReport, type QualityPreflight, type QualityReport } from './quality-report.ts'

const revision = 'a'.repeat(40)
const directories: string[] = []

function session(sessionId: string, role: 'child' | 'parent', inputTokens: number, parentSessionId: string | null = null): SessionMetrics {
  const tokens = { inputTokens, outputTokens: 2, totalTokens: inputTokens + 2, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }
  const counts = { modelCalls: 1, missingUsageCalls: 0, toolCalls: 1, toolErrors: 0, modelErrors: 0 }
  return {
    sessionId, role, parentSessionId, parentStatus: parentSessionId === null ? 'none' : 'linked',
    sha256: createHash('sha256').update(sessionId).digest('hex'),
    eventCounts: { 'assistant/message': 1 }, eventCount: 1,
    toolPairing: { matched: 0, unmatchedCalls: 1, orphanResults: 0, duplicateResults: 0 },
    steps: [{ turn: 0, step: 0, ...counts, tokens: { ...tokens } }],
    totals: { ...counts, tokens: { ...tokens } }, createdAt: 1000, firstEventAt: 1010, lastEventAt: 1010, durationMs: 10,
  }
}

function corpus(): CorpusManifest {
  return { schemaVersion: 1, revision, revisionStatus: 'known', revisionLimitation: null,
    sessions: [session('parent-1', 'parent', 3), session('child-1', 'child', 8, 'parent-1')] }
}

function reconciliation(): ReconciliationResult {
  return {
    schemaVersion: 1, auditId: 'audit-1', revision, valid: false,
    findings: [{ id: 'F1', status: 'PENDING', recommendedStatus: 'PENDING', conflict: true, scopes: [
      { scope: 'source', outcome: 'PENDING', childStatuses: [{ agentId: 'one', status: 'RESOLVED' }, { agentId: 'two', status: 'OPEN' }], conflict: true, adjudicated: false, evidenceIds: [] },
      { scope: 'test', outcome: 'PENDING', childStatuses: [], conflict: false, adjudicated: false, evidenceIds: [] },
    ] }],
    errors: ['F1: unknown evidence missing-e'],
    totals: { resolved: 0, open: 0, pending: 1, conflicts: 1 },
  }
}

function preflight(): QualityPreflight {
  return { schemaVersion: 1, auditId: 'audit-1', revision, checks: [
    { id: 'test', result: { status: 'READY', category: 'ready', executed: false, issues: [], currentSources: [] } },
    { id: 'search', result: { status: 'BLOCKED', category: 'setup', executed: false,
      issues: [{ code: 'SEARCH_CREDENTIAL_MISSING', subject: 'AUDIT_SEARCH_KEY', remedy: 'PRIVATE CREDENTIAL DETAIL' }], currentSources: [] } },
    { id: 'source', result: { status: 'PASS', category: 'product', executed: true, issues: [], currentSources: [], exitCode: 0 } },
    { id: 'dependency', result: { status: 'FAIL', category: 'product', executed: true, issues: [], currentSources: [], exitCode: 7 } },
  ] }
}

function fixture(name: string, value: object): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-quality-'))
  directories.push(directory)
  const path = join(directory, `${name}.json`)
  writeFileSync(path, `${JSON.stringify(value)}\n`)
  return path
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('AUD-09 quality report', () => {
  it('requires raw child Sessions before a closed report becomes resolved', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-quality-raw-'))
    directories.push(directory)
    const reports: string[] = []
    const sessions: string[] = []
    for (const agentId of ['builder', 'reviewer']) {
      const sessionId = `session-${agentId}`
      const events = [
        { type: 'session', version: 4, id: sessionId, createdAt: 0, origin: 'subagent', parentSession: 'session-parent' },
        { type: 'tool/call', seq: 0, time: 1, data: { turn: 1, step: 1, callId: 'call-1', name: 'bash',
          arguments: JSON.stringify({ command: 'pnpm test' }) } },
        { type: 'tool/result', seq: 1, time: 2, surfaceOp: 'append', data: { turn: 1, step: 1,
          meta: { kind: 'bash-foreground-exit', exitCode: 0, signal: null, timedOut: false, aborted: false, stopped: false },
          message: { toolCallId: 'call-1', isError: false, content: [{ type: 'text', text: 'passed' }] } } },
      ]
      const bytes = `${events.map(event => JSON.stringify(event)).join('\n')}\n`
      const sessionPath = join(directory, `${agentId}.v4.jsonl`)
      writeFileSync(sessionPath, bytes)
      sessions.push(sessionPath)
      const sessionSha256 = createHash('sha256').update(bytes).digest('hex')
      const report = { schemaVersion: 1, auditId: 'audit-1', agentId, revision,
        observedAt: '2026-09-29T00:00:00Z', taskScope: 'Run focused test', files: ['src/check.ts'], sessionId, sessionSha256,
        findings: [{ id: 'F1', scope: 'test', status: 'RESOLVED', confidence: 'high', summary: 'test passed', limitations: [],
          evidence: [{ id: `${agentId}-e`, kind: 'test-run', outcome: 'PASS', reference: `session:${sessionSha256}#call-1`,
            observedAt: '2026-09-29T00:00:00Z', revision, command: 'pnpm test', exitCode: 0 }] }] }
      const reportPath = join(directory, `${agentId}.json`)
      writeFileSync(reportPath, JSON.stringify(report))
      reports.push(reportPath)
    }
    const parentEvents = [
      { type: 'session', version: 4, id: 'session-parent', createdAt: 0 },
      { type: 'tool/call', seq: 0, time: 1, data: { turn: 1, step: 1, callId: 'parent-call', name: 'bash',
        arguments: JSON.stringify({ command: 'pnpm test' }) } },
      { type: 'tool/result', seq: 1, time: 2, surfaceOp: 'append', data: { turn: 1, step: 1,
        meta: { kind: 'bash-foreground-exit', exitCode: 0, signal: null, timedOut: false, aborted: false, stopped: false },
        message: { toolCallId: 'parent-call', isError: false, content: [{ type: 'text', text: 'passed' }] } } },
    ]
    const parentPath = join(directory, 'parent.v4.jsonl')
    const parentBytes = `${parentEvents.map(event => JSON.stringify(event)).join('\n')}\n`
    writeFileSync(parentPath, parentBytes)
    const parentSha256 = createHash('sha256').update(parentBytes).digest('hex')
    const corpusPath = fixture('raw-corpus', await buildManifest(revision, sessions, parentPath))
    const requirementsPath = fixture('raw-requirements', { schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'reviewer', findings: [{ id: 'F1', requiredScopes: ['test'] }] })
    const decisionsPath = fixture('raw-decisions', { schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      sessionId: 'session-parent', sessionSha256: parentSha256,
      decisions: [{ id: 'F1', status: 'RESOLVED', rationale: 'both passed', evidenceIds: ['builder-e'], adjudications: [] }] })
    const args = ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'), '--corpus', corpusPath,
      '--requirements', requirementsPath, '--report', reports[0] ?? '', '--report', reports[1] ?? '', '--decisions', decisionsPath]
    const unverified = spawnSync('pnpm', args, { encoding: 'utf8' })
    expect(unverified.status).toBe(1)
    expect((JSON.parse(unverified.stdout) as QualityReport).reconciliation).toMatchObject(
      { closureStatus: 'unverified', resolved: 0, claimedResolved: 1 })
    const verified = spawnSync('pnpm', [...args, '--session', `builder=${sessions[0]}`,
      '--session', `reviewer=${sessions[1]}`, '--session', `parent=${parentPath}`], { encoding: 'utf8' })
    expect(verified.status).toBe(0)
    const verifiedReport = JSON.parse(verified.stdout) as QualityReport
    expect(verifiedReport.reconciliation.closureStatus).toBe('resolved')
    expect(verifiedReport.corpus.hashVerification).toBe('verified-required-sessions')
    const mismatchedCorpusPath = fixture('raw-corpus-mismatched-revision',
      await buildManifest('b'.repeat(40), sessions, parentPath))
    const mismatchedArgs = [...args]
    mismatchedArgs[mismatchedArgs.indexOf('--corpus') + 1] = mismatchedCorpusPath
    const mismatchedRevision = spawnSync('pnpm', [...mismatchedArgs,
      '--session', `builder=${sessions[0]}`, '--session', `reviewer=${sessions[1]}`,
      '--session', `parent=${parentPath}`], { encoding: 'utf8' })
    expect(mismatchedRevision.status).toBe(1)
    expect((JSON.parse(mismatchedRevision.stdout) as QualityReport)).toMatchObject({
      revisionIdentity: { status: 'mismatch' },
      reconciliation: { closureStatus: 'unverified', resolved: 0, claimedResolved: 1 },
    })
    const unknownCorpus = await buildManifest(revision, sessions, parentPath)
    unknownCorpus.revision = null
    unknownCorpus.revisionStatus = 'unknown'
    unknownCorpus.revisionLimitation = 'Historical audited revision is not established; file hashes identify only the supplied bytes.'
    const unknownCorpusPath = fixture('raw-corpus-unknown-revision', unknownCorpus)
    const unknownRevisionArgs = [...args]
    unknownRevisionArgs[unknownRevisionArgs.indexOf('--corpus') + 1] = unknownCorpusPath
    const unknownRevision = spawnSync('pnpm', [...unknownRevisionArgs,
      '--session', `builder=${sessions[0]}`, '--session', `reviewer=${sessions[1]}`,
      '--session', `parent=${parentPath}`], { encoding: 'utf8' })
    expect(unknownRevision.status).toBe(1)
    expect((JSON.parse(unknownRevision.stdout) as QualityReport)).toMatchObject({
      revisionIdentity: { status: 'unknown' },
      reconciliation: { closureStatus: 'unverified', resolved: 0, claimedResolved: 1 },
    })
    writeFileSync(decisionsPath, JSON.stringify({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      sessionId: 'session-parent', sessionSha256: parentSha256,
      decisions: [{ id: 'F1', status: 'RESOLVED', rationale: 'parent reran test', evidenceIds: ['parent-e'],
        adjudications: [{ scope: 'test', rationale: 'parent reran test', evidence: { id: 'parent-e', kind: 'test-run',
          outcome: 'PASS', reference: `session:${parentSha256}#parent-call`,
          observedAt: '2026-09-29T00:00:00Z', revision, command: 'pnpm test', exitCode: 0 } }] }] }))
    const parentVerified = spawnSync('pnpm', [...args, '--session', `builder=${sessions[0]}`,
      '--session', `reviewer=${sessions[1]}`, '--session', `parent=${parentPath}`], { encoding: 'utf8' })
    expect(parentVerified.status).toBe(0)
    const missingParent = spawnSync('pnpm', [...args, '--session', `builder=${sessions[0]}`,
      '--session', `reviewer=${sessions[1]}`], { encoding: 'utf8' })
    expect(missingParent.status).toBe(2)
    expect((JSON.parse(missingParent.stdout) as QualityReport).reconciliation.closureStatus).toBe('invalid')
  })

  it('marks an executed failed test unverified until its raw Session is supplied', () => {
    const observedAt = '2026-09-29T00:00:00Z'
    const reports = ['builder', 'reviewer'].map(agentId => reportSchema.parse({
      schemaVersion: 1, auditId: 'audit-1', agentId, revision, observedAt,
      findings: [{ id: 'F1', scope: 'test', status: 'OPEN', confidence: 'high', summary: 'test failed', limitations: [],
        evidence: [{ id: `${agentId}-e`, kind: 'test-run', outcome: 'FAIL', reference: 'declared-output',
          observedAt, revision, command: 'pnpm test', exitCode: 7 }] }],
    }))
    const requirements = requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'reviewer', findings: [{ id: 'F1', requiredScopes: ['test'] }] })
    const decisions = decisionsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      decisions: [{ id: 'F1', status: 'OPEN', rationale: 'failed test', evidenceIds: ['builder-e'], adjudications: [] }] })
    const reconciled = reconcileAudit(requirements, reports, decisions)
    expect(reconciled.valid).toBe(true)
    expect(buildQualityReport(corpus(), reconciled).reconciliation.closureStatus).toBe('unverified')
    const cli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', fixture('open-corpus', corpus()), '--reconcile', fixture('open-reconciliation', reconciled)],
    { encoding: 'utf8' })
    expect(cli.status).toBe(1)
    expect((JSON.parse(cli.stdout) as QualityReport).reconciliation.closureStatus).toBe('unverified')
  })

  it('returns nonzero for open and invalid quality reports', () => {
    const observedAt = '2026-09-29T00:00:00Z'
    const reports = ['builder', 'reviewer'].map(agentId => reportSchema.parse({
      schemaVersion: 1, auditId: 'audit-1', agentId, revision, observedAt,
      findings: [{ id: 'F1', scope: 'source', status: 'OPEN', confidence: 'high', summary: 'source issue', limitations: [],
        evidence: [{ id: `${agentId}-e`, kind: 'source-read', outcome: 'FAIL', reference: 'source.ts:1', observedAt, revision }] }],
    }))
    const requirements = requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'reviewer', findings: [{ id: 'F1', requiredScopes: ['source'] }] })
    const decisions = decisionsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      decisions: [{ id: 'F1', status: 'OPEN', rationale: 'source remains open', evidenceIds: ['builder-e'], adjudications: [] }] })
    const open = reconcileAudit(requirements, reports, decisions)
    expect(open).toMatchObject({ valid: true, totals: { resolved: 0, open: 1, pending: 0 } })
    const script = resolve('scripts/audit-evidence/quality-report.ts')
    const openCli = spawnSync('pnpm', ['exec', 'tsx', script, '--corpus', fixture('open-corpus', corpus()),
      '--reconcile', fixture('open-reconciliation', open)], { encoding: 'utf8' })
    expect(openCli.status).toBe(1)
    expect((JSON.parse(openCli.stdout) as QualityReport).reconciliation.closureStatus).toBe('open')

    const invalidCli = spawnSync('pnpm', ['exec', 'tsx', script, '--corpus', fixture('invalid-corpus', corpus()),
      '--reconcile', fixture('invalid-reconciliation', reconciliation())], { encoding: 'utf8' })
    expect(invalidCli.status).toBe(2)
    expect((JSON.parse(invalidCli.stdout) as QualityReport).reconciliation.closureStatus).toBe('invalid')
  })

  it('rejects a parent test Session cataloged as a child', () => {
    const manifest = corpus()
    const disguised = session('pretend-parent', 'child', 5, 'parent-1')
    manifest.sessions.push(disguised)
    const checked = reconciliation()
    checked.sessionChecks = [
      { agentId: 'builder', sessionId: manifest.sessions[1]!.sessionId,
        sha256: manifest.sessions[1]!.sha256, role: 'child', parentSessionId: 'parent-1', errors: [] },
      { agentId: 'parent', sessionId: disguised.sessionId, sha256: disguised.sha256,
        role: 'parent', parentSessionId: 'parent-1', errors: [] },
    ]
    expect(() => buildQualityReport(manifest, checked, undefined,
      { rawSessionVerified: true, parentAgentId: 'parent' })).toThrow(/corpus hashes/)
  })

  it('recomputes the recorded keyless candidate from child reports and preflight results', () => {
    const root = resolve('snapshots/session/audit-evidence-reconciliation')
    const records = resolve('scripts/audit-evidence/fixtures')
    const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
    const sourceRevision = createHash('sha256')
    for (const name of ['a24-03.test.ts', 'a24-03.ts', 'a24-07.ts']) {
      sourceRevision.update(name).update('\0').update(readFileSync(join(root, 'workspace', name))).update('\0')
    }
    const revisionHash = sourceRevision.digest('hex')
    const requirements = requirementsSchema.parse(read(join(root, 'workspace/requirements.json')))
    const reports = ['web.json', 'infra.json'].map(name => reportSchema.parse(read(join(root, 'workspace.expected', name))))
    const decisions = decisionsSchema.parse(read(join(root, 'workspace.expected/decisions.json')))
    const corpusInput = read(join(records, 'candidate-keyless-corpus.json'))
    const preflightInput = read(join(records, 'candidate-keyless-preflight.json'))
    const expected = read(join(records, 'candidate-keyless-quality.json'))
    const result = buildQualityReport(corpusInput, reconcileAudit(requirements, reports, decisions), preflightInput,
      { recomputedFromRecords: true })
    const rawCorpus = corpusInput as CorpusManifest
    type RecordingLink = {
      revision: string
      sessions: Array<{
        snapshotFile: string
        snapshotSha256: string
        rawSessionId: string
        rawSessionSha256: string
        createdAt: number
        role: 'parent' | 'child'
        write: { file: string
          contentSha256: string }
      }>
    }
    const recordingLink = read(join(records, 'candidate-keyless-recording-link.json')) as RecordingLink
    type CandidateEvent = { type: string; createdAt?: number; data?: { name?: string; arguments?: string } }
    const parseEvent = (line: string): CandidateEvent => {
      const value: unknown = JSON.parse(line)
      if (value === null || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
        throw new Error('invalid snapshot event')
      }
      return value as CandidateEvent
    }
    const snapshots = ['session.v4.jsonl', 'session.1.v4.jsonl', 'session.2.v4.jsonl']
      .map(name => readFileSync(join(root, name), 'utf8').trimEnd().split('\n').map(parseEvent))
    const snapshotHeaders = snapshots.map(events => events[0]?.createdAt)
    if (snapshotHeaders.some(timestamp => typeof timestamp !== 'number')) throw new Error('missing snapshot creation time')
    const rawParent = rawCorpus.sessions.find(item => item.role === 'parent')
    const rawChildren = rawCorpus.sessions.filter(item => item.role === 'child')
    expect(rawParent?.createdAt).toBe(snapshotHeaders[0])
    expect(rawChildren.map(item => item.createdAt).sort()).toEqual(snapshotHeaders.slice(1)
      .sort())
    expect(rawChildren.every(item => item.parentSessionId === rawParent?.sessionId)).toBe(true)
    expect(recordingLink.revision).toBe(revisionHash)
    expect(recordingLink.sessions.map(item => item.snapshotFile))
      .toEqual(['session.v4.jsonl', 'session.1.v4.jsonl', 'session.2.v4.jsonl'])
    for (const link of recordingLink.sessions) {
      const bytes = readFileSync(join(root, link.snapshotFile))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(link.snapshotSha256)
      const rawSession = rawCorpus.sessions.find(item => item.sessionId === link.rawSessionId)
      expect(rawSession).toMatchObject({ sha256: link.rawSessionSha256, createdAt: link.createdAt, role: link.role })
      const linkedEvents = bytes.toString('utf8').trimEnd().split('\n').map(parseEvent)
      const writeEvent = linkedEvents.find(event => event.type === 'tool/call' && event.data?.name === 'write')
      if (typeof writeEvent?.data?.arguments !== 'string') throw new Error('linked snapshot omitted write')
      const writeArgs: unknown = JSON.parse(writeEvent.data.arguments)
      if (writeArgs === null || typeof writeArgs !== 'object' || !('file_path' in writeArgs) ||
        !('content' in writeArgs) || typeof writeArgs.content !== 'string') throw new Error('invalid linked write')
      expect(writeArgs.file_path).toBe(link.write.file)
      expect(createHash('sha256').update(writeArgs.content).digest('hex')).toBe(link.write.contentSha256)
    }
    for (const [index, name] of ['infra.json', 'web.json'].entries()) {
      const write = snapshots[index + 1]?.find(event => event.type === 'tool/call' && event.data?.name === 'write')
      if (typeof write?.data?.arguments !== 'string') throw new Error(`snapshot child omitted ${name}`)
      const writeArgs: unknown = JSON.parse(write.data.arguments)
      if (writeArgs === null || typeof writeArgs !== 'object' || !('file_path' in writeArgs) ||
        !('content' in writeArgs) || typeof writeArgs.content !== 'string') throw new Error('invalid snapshot write')
      expect(writeArgs.file_path).toBe(name)
      const writtenReport: unknown = JSON.parse(writeArgs.content)
      expect(writtenReport).toEqual(reportSchema.parse(read(join(root, 'workspace.expected', name))))
    }
    const parentWrite = snapshots[0]?.find(event => event.type === 'tool/call' && event.data?.name === 'write')
    if (typeof parentWrite?.data?.arguments !== 'string') throw new Error('snapshot parent omitted decisions.json')
    const parentWriteArgs: unknown = JSON.parse(parentWrite.data.arguments)
    if (parentWriteArgs === null || typeof parentWriteArgs !== 'object' ||
      !('file_path' in parentWriteArgs) || !('content' in parentWriteArgs) ||
      typeof parentWriteArgs.content !== 'string') throw new Error('invalid snapshot parent write')
    expect(parentWriteArgs.file_path).toBe('decisions.json')
    const writtenDecisions: unknown = JSON.parse(parentWriteArgs.content)
    expect(writtenDecisions).toEqual(decisions)
    expect(requirements.revision).toBe(revisionHash)
    expect(result).toEqual(expected)
    expect(result.revisionIdentity.status).toBe('matched')
    expect(result.reconciliation).toMatchObject({ valid: true, closureStatus: 'pending', conflicts: 2,
      evidenceVerification: 'recomputed-from-records' })
    expect(result.preflight).toMatchObject({ status: 'provided', blockedCount: 1, readyCount: 1 })
    const preflight = preflightInput as QualityPreflight
    const environment = { ...process.env }
    delete environment.EXA_API_KEY
    const searchSource = readFileSync(resolve('packages/web/web-search-exa/src/index.ts'), 'utf8')
    expect(searchSource).toContain("launchEnvironmentOf(ctx).get('EXA_API_KEY')")
    expect(searchSource).toContain('config.apiKey ??')
    const searchTest = readFileSync(resolve('packages/web/web-search-exa/tests/exa.e2e.ts'), 'utf8')
    expect(searchTest).toContain('process.env.EXA_API_KEY')
    for (const check of preflight.checks) {
      const declaration = parsePreflightSpec(read(join(records, `candidate-keyless-${check.id}-preflight-spec.json`)))
      expect(preflightAudit(declaration, { baseDir: records, env: environment })).toEqual(check.result)
    }
  })

  it('aggregates conflicts, unsupported claims, missing scopes, preflight failures, tokens, and exact revision', () => {
    const report = buildQualityReport(corpus(), reconciliation(), preflight())
    expect(report.revisionIdentity).toEqual({ status: 'matched', corpusRevision: revision, reconciliationRevision: revision,
      preflightRevision: revision, limitation: 'Revision labels match; source bytes were not independently verified by this report.' })
    expect(report.corpus).toMatchObject({ sessionCount: 2, childCount: 1, parentCount: 1, missingParentCount: 0,
      sessionHashes: [{ sessionId: 'child-1' }, { sessionId: 'parent-1' }],
      hashVerification: 'manifest-only' })
    expect(report.corpus.limitation).toContain('not rehashed')
    expect(report.tokens).toMatchObject({ children: { inputTokens: 8, totalTokens: 10 }, parents: { inputTokens: 3, totalTokens: 5 },
      total: { inputTokens: 11, totalTokens: 15 }, missingUsageCalls: 0 })
    expect(report.calls).toEqual({ model: 2, tool: 2 })
    expect(report.reconciliation).toMatchObject({ valid: false, errorCount: 1, conflicts: 1, conflictingFindingIds: ['F1'],
      closureStatus: 'invalid', resolved: 0, pending: 1, unsupportedClaims: 1, missingFindings: [{ id: 'F1', scopes: ['test'] }],
      evidenceVerification: 'ids-only' })
    expect(report.reconciliation.limitation).toContain('not revalidated')
    expect(report.preflight).toEqual({ status: 'provided', checkCount: 4, failureCount: 2, failedCount: 1, blockedCount: 1,
      readyCount: 1, passedCount: 1,
      failures: [{ id: 'dependency', status: 'FAIL', category: 'product' }, { id: 'search', status: 'BLOCKED', category: 'setup' }] })
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|"reason"|arguments|message/)
    expect(JSON.stringify(report)).not.toContain('modelComparison')
  })

  it('is order independent for corpus sessions and preflight checks', () => {
    const first = buildQualityReport(corpus(), reconciliation(), preflight())
    const reorderedCorpus = corpus()
    reorderedCorpus.sessions.reverse()
    const reorderedPreflight = preflight()
    reorderedPreflight.checks.reverse()
    expect(JSON.stringify(buildQualityReport(reorderedCorpus, reconciliation(), reorderedPreflight))).toBe(JSON.stringify(first))
  })

  it('counts unsupported claims from the reconciler’s actual diagnostics', () => {
    const requirements = requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'reviewer',
      findings: [{ id: 'F2', requiredScopes: ['source', 'test'] }] })
    const builder = reportSchema.parse({ schemaVersion: 1, auditId: 'audit-1', agentId: 'child', revision,
      observedAt: '2026-09-28T12:00:00Z', findings: [{ id: 'F2', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'Source checked',
        evidence: [{ id: 'source-e', kind: 'source-read', outcome: 'PASS', reference: 'source.ts:1',
          observedAt: '2026-09-28T12:00:00Z', revision }], limitations: [] }] })
    const reviewer = reportSchema.parse({ schemaVersion: 1, auditId: 'audit-1', agentId: 'reviewer', revision,
      observedAt: '2026-09-28T12:00:00Z', findings: [{ id: 'F2', scope: 'source', status: 'RESOLVED', confidence: 'medium', summary: 'Independent source check',
        evidence: [{ id: 'review-source-e', kind: 'source-read', outcome: 'PASS', reference: 'source.ts:2',
          observedAt: '2026-09-28T12:00:00Z', revision }], limitations: [] }] })
    const decisions = decisionsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      decisions: [{ id: 'F2', status: 'PENDING', rationale: 'Missing test result', evidenceIds: ['missing-e'], adjudications: [] }] })
    const result = reconcileAudit(requirements, [builder, reviewer], decisions)
    expect(result.valid).toBe(false)
    const quality = buildQualityReport(corpus(), result)
    expect(result.errors).toContain('independent reviewer omitted scope F2:test')
    expect(quality.reconciliation.unsupportedClaims).toBe(2)
    expect(quality.reconciliation.missingFindings).toEqual([{ id: 'F2', scopes: ['test'] }])
    const cli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', fixture('record-corpus', corpus()), '--requirements', fixture('record-requirements', requirements),
      '--report', fixture('record-builder', builder), '--report', fixture('record-reviewer', reviewer),
      '--decisions', fixture('record-decisions', decisions)], { encoding: 'utf8' })
    expect(cli.status).toBe(2)
    expect((JSON.parse(cli.stdout) as QualityReport).reconciliation).toMatchObject({
      valid: false, closureStatus: 'invalid', unsupportedClaims: 2,
      evidenceVerification: 'recomputed-from-records',
    })
  })

  it('marks closed findings invalid when reviewer coverage or reported scopes fail', () => {
    const requirements = requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'reviewer', findings: [{ id: 'F2', requiredScopes: ['source'] }] })
    const builder = reportSchema.parse({ schemaVersion: 1, auditId: 'audit-1', agentId: 'builder', revision,
      observedAt: '2026-09-28T12:00:00Z', findings: [{ id: 'F2', scope: 'source', status: 'RESOLVED',
        confidence: 'high', summary: 'Builder observation', limitations: [], evidence: [
          { id: 'builder-e', kind: 'source-read', outcome: 'PASS', reference: 'source.ts:1',
            observedAt: '2026-09-28T12:00:00Z', revision },
        ] }] })
    const reviewer = reportSchema.parse({ schemaVersion: 1, auditId: 'audit-1', agentId: 'reviewer', revision,
      observedAt: '2026-09-28T12:00:00Z', findings: [{ id: 'F2', scope: 'source', status: 'RESOLVED',
        confidence: 'medium', summary: 'Independent observation', limitations: [], evidence: [
          { id: 'reviewer-e', kind: 'source-read', outcome: 'PASS', reference: 'source.ts:2',
            observedAt: '2026-09-28T12:00:00Z', revision },
        ] }] })
    const decisions = decisionsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      decisions: [{ id: 'F2', status: 'RESOLVED', rationale: 'Both observations agree',
        evidenceIds: ['builder-e'], adjudications: [] }] })
    const clean = reconcileAudit(requirements, [builder, reviewer], decisions)
    expect(clean.valid).toBe(true)
    expect(buildQualityReport(corpus(), clean).reconciliation).toMatchObject({
      resolved: 0, claimedResolved: 1, closureStatus: 'unverified', unsupportedClaims: 0,
    })
    const rawCli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', fixture('closed-corpus', corpus()), '--requirements', fixture('closed-requirements', requirements),
      '--report', fixture('closed-builder', builder), '--report', fixture('closed-reviewer', reviewer),
      '--decisions', fixture('closed-decisions', decisions)], { encoding: 'utf8' })
    expect(rawCli.status).toBe(1)
    expect((JSON.parse(rawCli.stdout) as QualityReport).reconciliation).toMatchObject({
      valid: true, closureStatus: 'unverified', evidenceVerification: 'recomputed-from-records',
    })

    const checkedCorpus = corpus()
    checkedCorpus.sessions.push(session('child-2', 'child', 5, 'parent-1'))
    const checked = { ...clean, sessionChecks: checkedCorpus.sessions.filter(item => item.role === 'child')
      .map((item, index) => ({ agentId: index === 0 ? 'builder' : 'reviewer', sessionId: item.sessionId,
        sha256: item.sha256, role: 'child' as const, parentSessionId: item.parentSessionId, errors: [] })) }
    expect(buildQualityReport(checkedCorpus, checked, undefined, { rawSessionVerified: true }).reconciliation.closureStatus)
      .toBe('resolved')
    const firstCheck = checked.sessionChecks[0]
    if (!firstCheck) throw new Error('missing checked child')
    firstCheck.sha256 = '0'.repeat(64)
    expect(() => buildQualityReport(checkedCorpus, checked)).toThrow(/Session checks differ/)
    const wrongLineage = structuredClone(checked)
    wrongLineage.sessionChecks[0]!.parentSessionId = 'unrelated-parent'
    expect(() => buildQualityReport(checkedCorpus, wrongLineage)).toThrow(/Session checks differ/)

    const missingReviewer = reconcileAudit(requirements, [builder], decisions)
    expect(missingReviewer.errors).toContain('missing independent reviewer report reviewer')
    expect(buildQualityReport(corpus(), missingReviewer).reconciliation.missingFindings)
      .toEqual([{ id: 'F2', scopes: ['source'] }])
    const omittedFinding = reconcileAudit(requirements, [builder, { ...reviewer, findings: [] }], decisions)
    expect(omittedFinding.errors).toContain('independent reviewer omitted finding F2')
    const extraScope = reportSchema.parse({ ...builder, findings: [...builder.findings,
      { id: 'F2', scope: 'external', status: 'PARTIAL', confidence: 'low',
        summary: 'Outside declared scopes', evidence: [], limitations: [] }] })
    const undeclaredScope = reconcileAudit(requirements, [extraScope, reviewer], decisions)
    expect(undeclaredScope.errors).toContain('undeclared reported scope F2:external from builder')

    for (const result of [missingReviewer, omittedFinding, undeclaredScope]) {
      expect(result.totals.resolved).toBe(1)
      expect(buildQualityReport(corpus(), result).reconciliation).toMatchObject({
        valid: false, closureStatus: 'invalid', resolved: 0, claimedResolved: 1, unsupportedClaims: 1,
      })
    }
    const corpusPath = fixture('coverage-corpus', corpus())
    const reconciliationPath = fixture('coverage-reconciliation', missingReviewer)
    const cli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', corpusPath, '--reconcile', reconciliationPath], { encoding: 'utf8' })
    expect(cli.status).toBe(2)
    expect((JSON.parse(cli.stdout) as QualityReport).reconciliation.closureStatus).toBe('invalid')
  })

  it('rejects forged RESOLVED totals over pending scopes even when valid and errors claim success', () => {
    const forged = reconciliation()
    forged.valid = true
    forged.errors = []
    forged.findings[0]!.status = 'RESOLVED'
    forged.totals = { resolved: 1, open: 0, pending: 0, conflicts: 1 }
    expect(() => buildQualityReport(corpus(), forged)).toThrow(/status contradicts recommendedStatus/)
    const corpusPath = fixture('forged-corpus', corpus())
    const reconciliationPath = fixture('forged-reconciliation', forged)
    const cli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', corpusPath, '--reconcile', reconciliationPath], { encoding: 'utf8' })
    expect(cli.status).toBe(2)
    expect(cli.stdout).toBe('')
  })

  it.each(['RESOLVED', 'OPEN'] as const)('rejects %s closure without scope evidence IDs', (status) => {
    const forged = reconciliation()
    forged.valid = true
    forged.errors = []
    forged.findings[0]!.status = status
    forged.findings[0]!.recommendedStatus = status
    for (const scope of forged.findings[0]!.scopes) {
      scope.adjudicated = true
      scope.outcome = status
    }
    forged.totals = { resolved: status === 'RESOLVED' ? 1 : 0, open: status === 'OPEN' ? 1 : 0,
      pending: 0, conflicts: 1 }
    expect(() => buildQualityReport(corpus(), forged)).toThrow(/requires supporting evidence ids/)
  })

  it('rejects a forged unadjudicated scope outcome and accepts structurally supported closure', () => {
    const forged = reconciliation()
    forged.findings[0]!.scopes[0]!.outcome = 'RESOLVED'
    expect(() => buildQualityReport(corpus(), forged)).toThrow(/outcome contradicts child statuses/)

    const closed = reconciliation()
    closed.valid = true
    closed.errors = []
    const finding = closed.findings[0]!
    const sourceScope = finding.scopes[0]!
    sourceScope.childStatuses = [{ agentId: 'one', status: 'RESOLVED' }]
    sourceScope.conflict = false
    sourceScope.outcome = 'RESOLVED'
    sourceScope.evidenceIds = ['source-e']
    const testScope = finding.scopes[1]!
    testScope.adjudicated = true
    testScope.outcome = 'RESOLVED'
    testScope.evidenceIds = ['parent-test-e']
    finding.status = 'RESOLVED'
    finding.recommendedStatus = 'RESOLVED'
    finding.conflict = false
    closed.totals = { resolved: 1, open: 0, pending: 0, conflicts: 0 }
    expect(buildQualityReport(corpus(), closed).reconciliation).toMatchObject(
      { resolved: 0, claimedResolved: 1, closureStatus: 'unverified' })
  })

  it('labels manifest hashes as unverified when raw JSONL bytes are unavailable', () => {
    const altered = corpus()
    altered.sessions[0]!.sha256 = '0'.repeat(64)
    const report = buildQualityReport(altered, reconciliation())
    expect(report.corpus.sessionHashes).toContainEqual({ sessionId: 'parent-1', sha256: '0'.repeat(64) })
    expect(report.corpus.hashVerification).toBe('manifest-only')
    expect(report.corpus.limitation).toContain('raw session files were not rehashed')
  })

  it('marks unknown and mismatched revision identity without claiming a model comparison', () => {
    const unknown = corpus()
    unknown.revision = null
    unknown.revisionStatus = 'unknown'
    unknown.revisionLimitation = 'Historical source commit was not established.'
    const report = buildQualityReport(unknown, reconciliation())
    expect(report.revisionIdentity).toMatchObject({ status: 'unknown', corpusRevision: null,
      limitation: 'Historical source commit was not established.' })
    expect(report.preflight).toMatchObject({ status: 'not-provided', checkCount: 0, failureCount: 0, readyCount: 0 })
    expect(buildQualityReport(unknown, reconciliation(), preflight()).revisionIdentity.status).toBe('unknown')
    const unknownReconciliation = reconciliation()
    unknownReconciliation.revision = 'unknown'
    const unknownPreflight = preflight()
    unknownPreflight.revision = 'unknown'
    expect(buildQualityReport(unknown, unknownReconciliation, unknownPreflight).revisionIdentity.status).toBe('unknown')
    const mismatched = corpus()
    mismatched.revision = 'b'.repeat(40)
    expect(buildQualityReport(mismatched, reconciliation()).revisionIdentity.status).toBe('mismatch')
    const differentPreflight = preflight()
    differentPreflight.revision = 'b'.repeat(40)
    expect(buildQualityReport(unknown, reconciliation(), differentPreflight).revisionIdentity.status).toBe('mismatch')
  })

  it('rejects child lineage that points away from an available corpus parent', () => {
    const mismatched = corpus()
    const child = mismatched.sessions.find(item => item.role === 'child')!
    child.parentSessionId = 'parent-unavailable'
    child.parentStatus = 'unavailable'
    expect(() => buildQualityReport(mismatched, reconciliation()))
      .toThrow('child parent lineage differs from available corpus parent')
  })

  it('rejects contradictory totals, duplicate sessions, invalid known hashes, and preflight claims without reasons', () => {
    const wrongTotals = corpus()
    wrongTotals.sessions[0]!.totals.tokens.inputTokens++
    expect(() => buildQualityReport(wrongTotals, reconciliation())).toThrow(/differs from steps/)
    const duplicate = corpus()
    duplicate.sessions.push(structuredClone(duplicate.sessions[0]!))
    expect(() => buildQualityReport(duplicate, reconciliation())).toThrow(/duplicate corpus session/)
    const noChildren = corpus()
    noChildren.sessions.splice(1)
    expect(() => buildQualityReport(noChildren, reconciliation())).toThrow(/needs children/)
    const shortRevision = corpus()
    shortRevision.revision = 'a'.repeat(8)
    expect(() => buildQualityReport(shortRevision, reconciliation())).toThrow(/full hash/)
    const noFindings = reconciliation()
    noFindings.findings = []
    noFindings.totals = { resolved: 0, open: 0, pending: 0, conflicts: 0 }
    expect(() => buildQualityReport(corpus(), noFindings)).toThrow(/at least one finding/)
    const falsePass = preflight()
    falsePass.checks[2]!.result.exitCode = 7
    expect(() => buildQualityReport(corpus(), reconciliation(), falsePass)).toThrow(/inconsistent executed result/)
    const oldFormat = { schemaVersion: 1, auditId: 'audit-1', revision, checks: [{ id: 'legacy', outcome: 'BLOCKED', reason: 'missing' }] }
    expect(() => buildQualityReport(corpus(), reconciliation(), oldFormat)).toThrow(/unsupported field/)
    const emptyPreflight = preflight()
    emptyPreflight.checks = []
    expect(() => buildQualityReport(corpus(), reconciliation(), emptyPreflight)).toThrow(/at least one result/)
    const wrongAudit = preflight()
    wrongAudit.auditId = 'other-audit'
    expect(() => buildQualityReport(corpus(), reconciliation(), wrongAudit)).toThrow(/audit id/)
  })

  it('reads real preflightAudit results from a file and separates blocked setup from an executed FAIL', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-quality-preflight-'))
    directories.push(directory)
    writeFileSync(join(directory, 'source.ts'), 'export const current = true\n')
    const blocked = preflightAudit({ cwd: '.', command: [process.execPath, '-e', 'process.exit(0)'],
      search: { credentialEnv: 'AUDIT_SEARCH_KEY', currentSources: ['source.ts'] } },
    { baseDir: directory, env: {}, run: true })
    const failed = preflightAudit({ cwd: '.', command: [process.execPath, '-e', 'process.exit(7)'] },
      { baseDir: directory, env: {}, run: true })
    const ready = preflightAudit({ cwd: '.', command: [process.execPath, '-e', 'process.exit(0)'] },
      { baseDir: directory, env: {}, run: false })
    expect(blocked).toMatchObject({ status: 'BLOCKED', category: 'setup', executed: false })
    expect(failed).toMatchObject({ status: 'FAIL', category: 'product', executed: true, exitCode: 7 })
    const preflightPath = fixture('preflight-real', { schemaVersion: 1, auditId: 'audit-1', revision,
      checks: [{ id: 'search', result: blocked }, { id: 'test', result: failed }, { id: 'readiness', result: ready }] })
    const corpusPath = fixture('corpus-real', corpus())
    const reconciliationPath = fixture('reconciliation-real', reconciliation())
    const cli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', corpusPath, '--reconcile', reconciliationPath, '--preflight', preflightPath], { encoding: 'utf8' })
    expect(cli.status).toBe(2)
    const report = JSON.parse(cli.stdout) as QualityReport
    expect(report.preflight).toEqual({ status: 'provided', checkCount: 3, failureCount: 2, failedCount: 1, blockedCount: 1,
      readyCount: 1, passedCount: 0,
      failures: [{ id: 'search', status: 'BLOCKED', category: 'setup' }, { id: 'test', status: 'FAIL', category: 'product' }] })
    expect(cli.stdout).not.toMatch(/AUDIT_SEARCH_KEY|source\.ts|Search|remedy/)
  })

  it('reads CLI JSON, writes the same report to a file, and rejects malformed input', () => {
    const corpusPath = fixture('corpus', corpus())
    const reconciliationPath = fixture('reconciliation', reconciliation())
    const preflightPath = fixture('preflight', preflight())
    const script = resolve('scripts/audit-evidence/quality-report.ts')
    const cli = spawnSync('pnpm', ['exec', 'tsx', script, '--corpus', corpusPath, '--reconcile', reconciliationPath, '--preflight', preflightPath], { encoding: 'utf8' })
    expect(cli.status).toBe(2)
    expect(JSON.parse(cli.stdout)).toEqual(buildQualityReport(corpus(), reconciliation(), preflight()))
    const outputPath = join(resolve(corpusPath, '..'), 'quality.json')
    const saved = spawnSync('pnpm', ['exec', 'tsx', script, '--corpus', corpusPath, '--reconcile', reconciliationPath, '--preflight', preflightPath, '--output', outputPath], { encoding: 'utf8' })
    expect(saved.status).toBe(2)
    expect(saved.stdout).toBe('')
    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(JSON.parse(cli.stdout))
    const bad = fixture('bad', { schemaVersion: 2 })
    const invalid = spawnSync('pnpm', ['exec', 'tsx', script, '--corpus', bad, '--reconcile', reconciliationPath], { encoding: 'utf8' })
    expect(invalid.status).toBe(2)
    expect(invalid.stdout).toBe('')
    expect(invalid.stderr).toBe('audit-evidence: invalid quality report input\n')
  })

  it('refuses an output symlink that aliases the corpus input', () => {
    const corpusPath = fixture('corpus-alias', corpus())
    const reconciliationPath = fixture('reconciliation-alias', reconciliation())
    const aliasPath = join(resolve(corpusPath, '..'), 'output-alias.json')
    symlinkSync(corpusPath, aliasPath)
    const original = readFileSync(corpusPath, 'utf8')
    const cli = spawnSync('pnpm', ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', corpusPath, '--reconcile', reconciliationPath, '--output', aliasPath], { encoding: 'utf8' })
    expect(cli.status).toBe(2)
    expect(readFileSync(corpusPath, 'utf8')).toBe(original)
  })

  it('produces stable candidate output on two public record-mode runs', () => {
    const root = resolve('snapshots/session/audit-evidence-reconciliation')
    const records = resolve('scripts/audit-evidence/fixtures')
    const args = ['exec', 'tsx', resolve('scripts/audit-evidence/quality-report.ts'),
      '--corpus', join(records, 'candidate-keyless-corpus.json'),
      '--requirements', join(root, 'workspace/requirements.json'),
      '--report', join(root, 'workspace.expected/web.json'),
      '--report', join(root, 'workspace.expected/infra.json'),
      '--decisions', join(root, 'workspace.expected/decisions.json'),
      '--preflight', join(records, 'candidate-keyless-preflight.json')]
    const first = spawnSync('pnpm', args, { encoding: 'utf8' })
    const second = spawnSync('pnpm', args, { encoding: 'utf8' })
    expect(first.status).toBe(1)
    expect(second.status).toBe(1)
    const expected = readFileSync(join(records, 'candidate-keyless-quality.json'), 'utf8')
    expect(first.stdout).toBe(second.stdout)
    expect(first.stdout).toBe(expected)
    expect(createHash('sha256').update(first.stdout).digest('hex'))
      .toBe('5eb2408ad48b279c8e671c956d79e501870ddabddb834886583f5ded1ec30264')
  })
})
