import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { reportSchema } from './contracts.ts'
import { verifyChildSession } from './session-checks.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(command = 'pnpm test', output = 'ok\n[exit code: 0]', isError = false, result = true, meta?: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-session-check-'))
  roots.push(root)
  const events = [
    { type: 'session', version: 4, id: 'child-1', createdAt: 0, origin: 'subagent', parentSession: 'parent-1' },
    { type: 'tool/call', seq: 0, time: 1, data: { turn: 1, step: 1, callId: 'call-1', name: 'bash',
      arguments: JSON.stringify({ command }) } },
    ...result ? [{ type: 'tool/result', seq: 1, time: 2, surfaceOp: 'append', data: { turn: 1, step: 1,
      ...meta === undefined ? {} : { meta },
      message: { toolCallId: 'call-1', isError, content: [{ type: 'text', text: output }] } } }] : [],
  ]
  const path = join(root, 'session.v4.jsonl')
  writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`)
  return path
}

function report(command = 'pnpm test', exitCode = 0) {
  return reportSchema.parse({ schemaVersion: 1, auditId: 'audit', agentId: 'child', revision: 'revision',
    observedAt: '2026-09-29T00:00:00Z', findings: [{ id: 'A', scope: 'test',
      status: exitCode === 0 ? 'RESOLVED' : 'OPEN', confidence: 'high', summary: 'check', limitations: [],
      evidence: [{ id: 'check-1', kind: 'test-run', outcome: exitCode === 0 ? 'PASS' : 'FAIL',
        reference: 'output', observedAt: '2026-09-29T00:00:00Z', revision: 'revision', command, exitCode }] }] })
}

describe('child Session check reconciliation', () => {
  it('accepts an exact command and completed zero exit', () => {
    expect(verifyChildSession(report(), fixture()).errors).toEqual([])
  })

  it('accepts foreground zero exit from durable metadata without a text marker', () => {
    const meta = { kind: 'bash-foreground-exit', exitCode: 0, signal: null, timedOut: false, aborted: false, stopped: false }
    expect(verifyChildSession(report(), fixture('pnpm test', 'passed', false, true, meta)).errors).toEqual([])
  })

  it('rejects a child log without subagent origin and parent lineage', () => {
    const path = fixture()
    const events = readFileSync(path, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const header = events[0]
    if (!header) throw new Error('missing Session header')
    delete header['origin']
    delete header['parentSession']
    writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`)

    expect(verifyChildSession(report(), path).errors).toContain(
      'child: Session header does not establish subagent origin and parent lineage')
  })

  it('rejects a report bound to another Session ID or byte hash', () => {
    const path = fixture()
    expect(verifyChildSession({ ...report(), sessionId: 'another-child' }, path).errors).toContain(
      'child: report Session ID differs from log')
    expect(verifyChildSession({ ...report(), sessionSha256: '0'.repeat(64) }, path).errors).toContain(
      'child: report Session SHA-256 differs from log')
  })

  it('rejects a test artifact reference that does not identify its Session call', () => {
    const path = fixture()
    const sessionSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    expect(verifyChildSession({ ...report(), sessionSha256 }, path).errors).toContain(
      'child:check-1: evidence reference does not identify the recorded tool call')
  })

  it('selects a repeated command by its recorded tool call ID', () => {
    const path = fixture()
    const events = readFileSync(path, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    events.push({ type: 'tool/call', seq: 2, time: 3, data: { turn: 1, step: 2, callId: 'call-2', name: 'bash',
      arguments: JSON.stringify({ command: 'pnpm test' }) } })
    events.push({ type: 'tool/result', seq: 3, time: 4, surfaceOp: 'append', data: { turn: 1, step: 2, message: {
      toolCallId: 'call-2', isError: false, content: [{ type: 'text', text: 'passed\n[exit code: 0]' }],
    } } })
    writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`)
    const sessionSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    const bound = { ...report(), sessionSha256 }
    const finding = bound.findings[0]
    if (!finding) throw new Error('missing fixture finding')
    const check = finding.evidence[0]
    if (!check) throw new Error('missing fixture check')
    check.reference = `session:${sessionSha256}#call-2`
    expect(verifyChildSession(bound, path).errors).toEqual([])
    check.command = 'pnpm lint'
    expect(verifyChildSession(bound, path).errors).toContain(
      'child:check-1: reported command differs from Session call')
  })

  it('rejects timeout or background metadata despite success text', () => {
    const timedOut = { kind: 'bash-foreground-exit', exitCode: 0, signal: null, timedOut: true, aborted: false, stopped: false }
    expect(verifyChildSession(report(), fixture('pnpm test', 'passed', false, true, timedOut)).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
    expect(verifyChildSession(report(), fixture('pnpm test', 'passed', false, true, null)).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
    expect(verifyChildSession(report(), fixture('pnpm test', 'passed', false, true,
      { ...timedOut, timedOut: false, stopped: true })).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
  })

  it('rejects a declared command absent from the Session', () => {
    expect(verifyChildSession(report(), fixture('pnpm lint')).errors).toContain(
      'child:check-1: expected one matching shell call, found 0')
  })

  it('rejects a false passing exit and preserves a genuine failure', () => {
    const path = fixture('pnpm test', 'failed\n[exit code: 7]')
    expect(verifyChildSession(report(), path).errors).toContain('child:check-1: reported exit code differs from Session result')
    expect(verifyChildSession(report('pnpm test', 7), path).errors).toEqual([])
  })

  it('reads the persistent bash exit marker even though its tool name is bash', () => {
    const path = fixture('pnpm test', 'failed\n[Command finished with exit code 7]')
    expect(verifyChildSession(report(), path).errors).toContain('child:check-1: reported exit code differs from Session result')
    expect(verifyChildSession(report('pnpm test', 7), path).errors).toEqual([])
  })

  it('rejects interrupted or missing tool results', () => {
    expect(verifyChildSession(report(), fixture('pnpm test', '[timed out after 500ms]')).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
    expect(verifyChildSession(report(), fixture('pnpm test', 'ok', false, false)).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
  })

  it('rejects an unpaired Bash call behind a resolved finding', () => {
    const path = fixture()
    const events = readFileSync(path, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    events.push({ type: 'tool/call', seq: 2, time: 3, data: { turn: 1, step: 2, callId: 'call-2', name: 'bash',
      arguments: JSON.stringify({ command: 'pnpm test --other' }) } })
    writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`)
    expect(verifyChildSession(report(), path).errors).toContain(
      'child: Session has 1 Bash call(s) without a result; resolved report needs direct adjudication')
  })

  it('rejects an orphan result and an interrupted Bash call behind a resolved finding', () => {
    const path = fixture()
    const events = readFileSync(path, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    events.push({ type: 'tool/result', seq: 2, time: 3, surfaceOp: 'append', data: { turn: 1, step: 2,
      message: { toolCallId: 'missing-call', isError: false, content: [{ type: 'text', text: 'passed' }] } } })
    events.push({ type: 'tool/call', seq: 3, time: 4, data: { turn: 1, step: 3, callId: 'call-2', name: 'bash',
      arguments: JSON.stringify({ command: 'pnpm test --other' }) } })
    events.push({ type: 'tool/result', seq: 4, time: 5, surfaceOp: 'append', data: { turn: 1, step: 3,
      meta: { kind: 'bash-foreground-exit', exitCode: 0, signal: null, timedOut: true, aborted: false, stopped: false },
      message: { toolCallId: 'call-2', isError: false, content: [{ type: 'text', text: 'partial' }] } } })
    writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`)
    const errors = verifyChildSession(report(), path).errors
    expect(errors).toContain('child: orphan tool result has no recorded call')
    expect(errors).toContain('child: Session has 1 Bash call(s) without a completed exit; resolved report needs direct adjudication')
  })

  it('rejects one recorded Bash execution reused as two executed test claims', () => {
    const path = fixture()
    const sessionSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    const bound = { ...report(), sessionSha256 }
    const finding = bound.findings[0]
    if (!finding) throw new Error('missing fixture finding')
    finding.evidence[0]!.reference = `session:${sessionSha256}#call-1`
    finding.evidence.push({ ...finding.evidence[0]!, id: 'check-2' })
    expect(verifyChildSession(bound, path).errors).toContain(
      'child:check-2: Bash call is reused by another executed test claim')
  })

  it('rejects a result assigned to a different turn or step', () => {
    const path = fixture()
    const events = readFileSync(path, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const result = events[2]
    if (!result || typeof result.data !== 'object' || result.data === null) throw new Error('missing fixture result')
    result.data = { ...result.data, step: 99 }
    writeFileSync(path, `${events.map(event => JSON.stringify(event)).join('\n')}\n`)
    expect(verifyChildSession(report(), path).errors).toContain('child: tool result step differs from its Bash call')
  })

  it('rejects a shell result with no explicit completion marker', () => {
    expect(verifyChildSession(report(), fixture('pnpm test', 'partial output')).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
    expect(verifyChildSession(report(), fixture('pnpm test', '[still running after 100ms; moved to background job 1]')).errors)
      .toContain('child:check-1: Session does not establish a completed shell exit')
  })

  it('rejects an infrastructure error even if it contains success text', () => {
    expect(verifyChildSession(report(), fixture('pnpm test', 'ok', true)).errors).toContain(
      'child:check-1: Session does not establish a completed shell exit')
    expect(verifyChildSession(report(), fixture('pnpm test', 'ok', true)).errors).toContain(
      'child: Session has 1 tool error(s); resolved report needs direct adjudication')
  })

  it('rejects a resolved source claim when its child Session contains an import error', () => {
    const source = reportSchema.parse({ schemaVersion: 1, auditId: 'audit', agentId: 'child', revision: 'revision',
      observedAt: '2026-09-29T00:00:00Z', findings: [{ id: 'A', scope: 'source', status: 'RESOLVED',
        confidence: 'high', summary: 'read source', limitations: [], evidence: [{ id: 'read-1', kind: 'source-read',
          outcome: 'PASS', reference: 'src/index.ts', observedAt: '2026-09-29T00:00:00Z', revision: 'revision' }] }] })
    expect(verifyChildSession(source, fixture('python -m importcheck', 'ImportError', true)).errors).toContain(
      'child: Session has 1 tool error(s); resolved report needs direct adjudication')
    expect(verifyChildSession(source, fixture('python -m importcheck', 'ImportError\n[exit code: 1]')).errors).toContain(
      'child: Session has 1 failed shell call(s); resolved report needs direct adjudication')
  })
})
