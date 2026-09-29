import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { buildManifest, compareManifests, readSession, type CorpusManifest } from './session-corpus.ts'

const REVISION = 'a'.repeat(40)
const OTHER_REVISION = 'b'.repeat(40)
const source = fileURLToPath(new URL('./session-corpus.ts', import.meta.url))
const directories: string[] = []

interface ComparisonSummary {
  delta: { tokens: { inputTokens: number } }
  matchedSessionCount: number
  sessions?: unknown
  outputFile?: string
}

interface ManifestSummary {
  revisionLimitation: string
  sessions: Array<{ sessionId: string; totalTokens: number }>
  outputFile: string
}

async function fixture(name: string, records: object[]): Promise<{ path: string; text: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-corpus-'))
  directories.push(dir)
  const path = join(dir, `${name}.jsonl`)
  const text = `${records.map(record => JSON.stringify(record)).join('\n')}\n`
  await writeFile(path, text)
  return { path, text }
}

const header = (id: string, parentSession?: string) => ({
  type: 'session', version: 4, id, createdAt: 1000, isSeeded: false,
  ...(parentSession ? { parentSession, origin: 'subagent' } : {}), cwd: '/private/secret/workspace',
})
const event = (seq: number, type: string, data: object, extra: object = {}) => ({ type, seq, time: 1010 + seq * 10, data, ...extra })
const usage = (inputTokens: number, outputTokens: number) => ({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens })

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('session corpus', () => {
  it('keeps the local benchmark reduction tied to one immutable source and both findings', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/read-benchmark.txt', import.meta.url))
    const resultPath = fileURLToPath(new URL('./fixtures/local-read-benchmark.json', import.meta.url))
    const source = await readFile(fixturePath)
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as {
      sourceSha256: string
      baseline: { inputTokens: number; found: Record<string, number> }
      candidate: { inputTokens: number; found: Record<string, number> }
      inputReductionPercent: number
    }
    expect(createHash('sha256').update(source).digest('hex')).toBe(result.sourceSha256)
    expect(result.baseline.found).toEqual({ BUG_A: 20, BUG_B: 130 })
    expect(result.candidate.found).toEqual(result.baseline.found)
    expect((result.baseline.inputTokens - result.candidate.inputTokens) / result.baseline.inputTokens * 100)
      .toBe(result.inputReductionPercent)
    expect(result.inputReductionPercent).toBeGreaterThanOrEqual(25)
  })

  it('records same-model audit findings with over 25% fewer input tokens in the bounded read run', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/audit-read-benchmark.txt', import.meta.url))
    const resultPath = fileURLToPath(new URL('./fixtures/local-audit-read-benchmark.json', import.meta.url))
    const source = await readFile(fixturePath)
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as {
      sourceSha256: string
      baseline: { inputTokens: number; citedRows: number[] }
      candidate: { inputTokens: number; citedRows: number[] }
      inputReductionPercent: number
    }
    expect(createHash('sha256').update(source).digest('hex')).toBe(result.sourceSha256)
    expect(result.baseline.citedRows).toEqual([20, 30, 75, 130, 140, 170])
    expect(result.candidate.citedRows).toEqual(result.baseline.citedRows)
    expect((result.baseline.inputTokens - result.candidate.inputTokens) / result.baseline.inputTokens * 100)
      .toBe(result.inputReductionPercent)
    expect(result.inputReductionPercent).toBeGreaterThanOrEqual(25)
  })

  it('retains only sanitized metrics for the supplied five-child corpus', async () => {
    const path = fileURLToPath(new URL('./fixtures/2026-09-28-audit-corpus.json', import.meta.url))
    const raw = await readFile(path, 'utf8')
    const manifest = JSON.parse(raw) as CorpusManifest
    expect(manifest.revisionStatus).toBe('unknown')
    expect(manifest.sessions.filter(session => session.role === 'child')).toHaveLength(5)
    const parent = manifest.sessions.find(session => session.role === 'parent')!
    expect(manifest.sessions.filter(session => session.role === 'child').every(session =>
      session.parentSessionId === parent.sessionId && session.parentStatus === 'linked')).toBe(true)
    expect(manifest.sessions.filter(session => session.role === 'child')
      .reduce((sum, session) => sum + session.totals.tokens.inputTokens, 0)).toBe(635283)
    expect(manifest.sessions.every(session => /^[0-9a-f]{64}$/.test(session.sha256))).toBe(true)
    expect(raw).not.toMatch(/\/home\/|PRIVATE|"(?:messages|arguments|content|apiKey)"/)
    const recordPath = fileURLToPath(new URL('./fixtures/2026-09-28-source-revision.json', import.meta.url))
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as {
      parentSessionSha256: string
      observedBaseCommit: string
      dirtyWorkingTreeObservation: { changedPathCount: number }
      effectiveRevisionStatus: string
    }
    expect(record.parentSessionSha256).toBe(parent.sha256)
    expect(record.observedBaseCommit).toMatch(/^[0-9a-f]{40}$/)
    expect(record.dirtyWorkingTreeObservation.changedPathCount).toBe(177)
    expect(record.effectiveRevisionStatus).toBe('unknown')
  })

  it('summarizes child lineage, paired tools, error counts, usage, and time without exposing content', async () => {
    const child = await fixture('child', [
      header('child-1', 'parent-1'),
      event(0, 'step/start', { turn: 0, step: 0 }),
      event(1, 'assistant/attempt', { turn: 0, step: 0, stream: [
        { type: 'chunk', chunk: { type: 'usage', usage: usage(2, 1) } },
        { type: 'chunk', chunk: { type: 'finish', reason: 'error' } },
      ] }),
      event(2, 'assistant/message', { turn: 0, step: 0, usage: usage(3, 4), stream: [], message: { content: 'PRIVATE MESSAGE' } }),
      event(3, 'tool/call', { turn: 0, step: 0, callId: 'call|1', name: 'secret_tool', arguments: 'PRIVATE ARGUMENTS' }),
      event(4, 'tool/result', { turn: 0, step: 0, message: { toolCallId: 'call|1', isError: true, content: 'PRIVATE RESULT' } }, { surfaceOp: 'append' }),
      event(5, 'tool/result', { turn: 0, step: 0, message: { toolCallId: 'call|1', isError: true, content: 'PRIVATE REPLACEMENT' } }, { surfaceOp: { op: 'replace', startSeq: 4, endSeq: 4 } }),
      event(6, 'step/end', { turn: 0, step: 0 }),
    ])
    const parent = await fixture('parent', [header('parent-1'), event(0, 'step/start', { turn: 0, step: 0 })])
    const manifest = await buildManifest(REVISION, [child.path], parent.path)
    const childMetrics = manifest.sessions.find(session => session.role === 'child')!
    expect(childMetrics.parentStatus).toBe('linked')
    expect(childMetrics.parentSessionId).toBe('parent-1')
    expect(childMetrics.sha256).toBe(createHash('sha256').update(child.text).digest('hex'))
    expect(childMetrics.eventCounts).toEqual({ 'assistant/attempt': 1, 'assistant/message': 1, 'step/end': 1, 'step/start': 1, 'tool/call': 1, 'tool/result': 2 })
    expect(childMetrics.toolPairing).toEqual({ matched: 1, unmatchedCalls: 0, orphanResults: 0, duplicateResults: 0 })
    expect(childMetrics.steps).toEqual([{ turn: 0, step: 0, modelCalls: 2, missingUsageCalls: 0,
      toolCalls: 1, toolErrors: 1, modelErrors: 1,
      tokens: { inputTokens: 5, outputTokens: 5, totalTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } }])
    expect(childMetrics).toMatchObject({ eventCount: 7, createdAt: 1000, firstEventAt: 1010, lastEventAt: 1070, durationMs: 70 })
    expect(JSON.stringify(manifest)).not.toMatch(/PRIVATE|secret|\/private\/|dsh-corpus-/)
  })

  it('marks absent parent unavailable and reports unmatched, orphan, and duplicate results', async () => {
    const child = await fixture('child', [
      header('child-2', 'missing-parent'),
      event(0, 'tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'x', arguments: '{}' }),
      event(1, 'tool/call', { turn: 1, step: 1, callId: 'call-2', name: 'x', arguments: '{}' }),
      event(2, 'tool/result', { turn: 1, step: 1, message: { toolCallId: 'call-1', isError: false } }, { surfaceOp: 'append' }),
      event(3, 'tool/result', { turn: 1, step: 1, message: { toolCallId: 'call-1', isError: false } }, { surfaceOp: 'append' }),
      event(4, 'tool/result', { turn: 1, step: 1, message: { toolCallId: 'call-3', isError: false } }, { surfaceOp: 'append' }),
      event(5, 'assistant/message', { turn: 1, step: 1, stream: [] }),
    ])
    const manifest = await buildManifest(REVISION, [child.path])
    expect(manifest.sessions[0]!.parentStatus).toBe('unavailable')
    expect(manifest.sessions[0]!.toolPairing).toEqual({ matched: 1, unmatchedCalls: 1, orphanResults: 1, duplicateResults: 1 })
    expect(manifest.sessions[0]!.totals.missingUsageCalls).toBe(1)
    const absent = await buildManifest(REVISION, [child.path], join(dirname(child.path), 'missing-parent.jsonl'))
    expect(absent.sessions[0]!.parentStatus).toBe('unavailable')
  })

  it('sorts child sessions and compares signed metrics only for matching ids', async () => {
    const a = await fixture('a', [header('a-child', 'parent-a'), event(0, 'assistant/message', { turn: 0, step: 0, stream: [], usage: usage(1, 2) })])
    const b = await fixture('b', [header('b-child', 'parent-b')])
    const left = await buildManifest(REVISION, [b.path, a.path])
    expect(left.sessions.map(session => session.sessionId)).toEqual(['a-child', 'b-child'])
    const right = structuredClone(left)
    right.revision = OTHER_REVISION
    right.sessions[0]!.totals.tokens.inputTokens = 4
    right.sessions[0]!.totals.toolCalls = 2
    right.sessions[0]!.totals.toolErrors = 1
    right.sessions.pop()
    const result = compareManifests(left, right)
    expect(result).toMatchObject({ revisionMatch: false, leftRevision: REVISION, rightRevision: OTHER_REVISION, onlyLeft: ['b-child'], onlyRight: [] })
    expect(result.sessions[0]!.delta).toMatchObject({ toolCalls: 2, toolErrors: 1, tokens: { inputTokens: 3 } })
    expect(result.sessions[0]!.sha256Match).toBe(true)
    expect(compareManifests(left, left).revisionMatch).toBe(true)
    Object.assign(right.sessions[0]!.totals, { content: 'PRIVATE COMPARISON TEXT' })
    expect(JSON.stringify(compareManifests(left, right))).not.toContain('PRIVATE COMPARISON TEXT')
    const leftFile = await fixture('left-manifest', [left])
    const rightFile = await fixture('right-manifest', [right])
    const cli = spawnSync('pnpm', ['exec', 'tsx', source, 'compare', leftFile.path, rightFile.path], { encoding: 'utf8' })
    expect(cli.status).toBe(0)
    const comparisonSummary = JSON.parse(cli.stdout) as ComparisonSummary
    expect(comparisonSummary.delta.tokens.inputTokens).toBe(3)
    expect(comparisonSummary.matchedSessionCount).toBe(1)
    expect(comparisonSummary.sessions).toBeUndefined()
    expect(cli.stdout).not.toContain('PRIVATE COMPARISON TEXT')
    const comparisonPath = join(dirname(leftFile.path), 'comparison.json')
    const saved = spawnSync('pnpm', ['exec', 'tsx', source, 'compare', leftFile.path, rightFile.path, '--output', comparisonPath], { encoding: 'utf8' })
    expect(saved.status).toBe(0)
    expect((JSON.parse(saved.stdout) as ComparisonSummary).outputFile).not.toMatch(/^\//)
    const savedComparison = JSON.parse(await readFile(comparisonPath, 'utf8')) as ReturnType<typeof compareManifests>
    expect(savedComparison.sessions[0]?.delta.tokens.inputTokens).toBe(3)
    expect((await readFile(comparisonPath, 'utf8'))).not.toContain('PRIVATE COMPARISON TEXT')
  })

  it('keeps stdout bounded while saving every step of a long parent and an unknown revision', async () => {
    const child = await fixture('child', [header('child-long', 'parent-long')])
    const parent = await fixture('parent', [
      header('parent-long'),
      ...Array.from({ length: 400 }, (_, step) => [
        event(step * 2, 'step/start', { turn: 0, step }),
        event(step * 2 + 1, 'assistant/message', { turn: 0, step, stream: [], usage: usage(2, 1), message: { content: 'PRIVATE PARENT TEXT' } }),
      ]).flat(),
    ])
    const outputPath = join(dirname(child.path), 'manifest.json')
    const cli = spawnSync('pnpm', ['exec', 'tsx', source, 'manifest', '--revision', 'unknown', '--child', child.path, '--parent', parent.path, '--output', outputPath], { encoding: 'utf8' })
    expect(cli.status).toBe(0)
    expect(cli.stdout.length).toBeLessThan(1500)
    const summary = JSON.parse(cli.stdout) as ManifestSummary
    expect(summary).toMatchObject({ revision: null, revisionStatus: 'unknown', sessionCount: 2, missingParentCount: 0, omittedSessionCount: 0 })
    expect(summary.revisionLimitation).toMatch(/not established/)
    expect(summary.sessions.map((session: { sessionId: string }) => session.sessionId)).toEqual(['child-long', 'parent-long'])
    expect(summary.sessions.find(session => session.sessionId === 'parent-long')?.totalTokens).toBe(1200)
    expect(summary.outputFile).not.toMatch(/^\//)
    const saved = JSON.parse(await readFile(outputPath, 'utf8')) as CorpusManifest
    expect(saved.sessions.find(session => session.sessionId === 'parent-long')?.steps).toHaveLength(400)
    expect(saved.sessions.find(session => session.sessionId === 'parent-long')?.sha256)
      .toBe(createHash('sha256').update(parent.text).digest('hex'))
    expect(JSON.stringify(saved)).not.toContain('PRIVATE PARENT TEXT')
    expect((await readdir(dirname(outputPath))).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('never matches unknown revisions and rejects invalid known revision claims', async () => {
    const child = await fixture('child', [header('child-unknown', 'parent-unknown')])
    const unknown = await buildManifest('unknown', [child.path])
    const known = await buildManifest(REVISION, [child.path])
    expect(compareManifests(unknown, unknown).revisionMatch).toBe(false)
    expect(compareManifests(known, unknown).revisionMatch).toBe(false)
    expect(unknown).toMatchObject({ revision: null, revisionStatus: 'unknown' })
    expect(unknown.revisionLimitation).toContain('not established')
    const malformed = structuredClone(unknown)
    malformed.revision = REVISION
    expect(() => compareManifests(malformed, known)).toThrow(/unknown revision/)
  })

  it('rejects malformed JSONL, sequence gaps, invalid usage, and a mismatched parent', async () => {
    const malformed = await fixture('bad-json', [header('bad')])
    await writeFile(malformed.path, '{broken\n')
    await expect(readSession(malformed.path, 'child')).rejects.toThrow()
    const gap = await fixture('gap', [header('child-3', 'parent-3'), event(1, 'step/start', { turn: 0, step: 0 })])
    await expect(readSession(gap.path, 'child')).rejects.toThrow(/sequence/)
    const badUsage = await fixture('usage', [header('child-4', 'parent-4'), event(0, 'assistant/message', { turn: 0, step: 0, stream: [], usage: { inputTokens: -1, outputTokens: 2 } })])
    await expect(readSession(badUsage.path, 'child')).rejects.toThrow(/integer/)
    const child = await fixture('child', [header('child-5', 'parent-5')])
    const parent = await fixture('parent', [header('other-parent')])
    await expect(buildManifest(REVISION, [child.path], parent.path)).rejects.toThrow(/parent session id mismatch/)
    await expect(buildManifest('short', [child.path])).rejects.toThrow(/revision/)
  })

  it('requires child role and parent lineage in the v4 header', async () => {
    const standalone = await fixture('standalone', [header('standalone-child')])

    await expect(readSession(standalone.path, 'child')).rejects.toThrow(/subagent origin and parent session/)
  })

  it('returns a nonzero CLI exit without leaking malformed input or its path', async () => {
    const malformed = await fixture('sensitive-name', [header('bad')])
    await writeFile(malformed.path, 'PRIVATE BAD JSON\n')
    const outputPath = join(dirname(malformed.path), 'manifest.json')
    const result = spawnSync('pnpm', ['exec', 'tsx', source, 'manifest', '--revision', REVISION, '--child', malformed.path, '--output', outputPath], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Invalid session corpus input.\n')
    await expect(readFile(outputPath)).rejects.toThrow()
    const missingOutput = spawnSync('pnpm', ['exec', 'tsx', source, 'manifest', '--revision', REVISION, '--child', malformed.path], { encoding: 'utf8' })
    expect(missingOutput.status).toBe(1)
    expect(missingOutput.stdout).toBe('')
  })
})
