/** Read-only, content-free metrics for local v4 Session JSONL files. */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type JsonRecord = Record<string, unknown>
type TokenField = 'inputTokens' | 'outputTokens' | 'totalTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'reasoningTokens'
const TOKEN_FIELDS: readonly TokenField[] = [
  'inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
]
type Tokens = Record<TokenField, number>
const SUMMARY_SESSION_LIMIT = 10

/** Metrics for one turn and step; absent provider usage increments missingUsageCalls. */
export interface StepMetrics {
  turn: number
  step: number
  modelCalls: number
  missingUsageCalls: number
  toolCalls: number
  toolErrors: number
  modelErrors: number
  tokens: Tokens
}

/** A sanitized summary of one immutable JSONL generation. */
export interface SessionMetrics {
  role: 'child' | 'parent'
  sessionId: string
  parentSessionId: string | null
  parentStatus: 'linked' | 'unavailable' | 'none'
  sha256: string
  eventCounts: Record<string, number>
  eventCount: number
  toolPairing: { matched: number; unmatchedCalls: number; orphanResults: number; duplicateResults: number }
  steps: StepMetrics[]
  totals: Omit<StepMetrics, 'turn' | 'step'>
  createdAt: number
  firstEventAt: number | null
  lastEventAt: number | null
  durationMs: number
}

/** A known revision is a full hash; unknown records an unverified source revision. */
export interface CorpusManifest {
  schemaVersion: 1
  revision: string | null
  revisionStatus: 'known' | 'unknown'
  revisionLimitation: string | null
  sessions: SessionMetrics[]
}

const UNKNOWN_REVISION_LIMITATION = 'Historical audited revision is not established; file hashes identify only the supplied bytes.'

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid JSON record')
  return value as JsonRecord
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('invalid non-negative integer')
  return value
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value)) throw new Error('invalid identifier')
  return value
}

function toolId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('invalid tool call id')
  return value
}

function eventType(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_/-]{0,99}$/.test(value)) throw new Error('invalid event type')
  return value
}

function tokens(): Tokens {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }
}

function addUsage(target: Tokens, value: unknown): boolean {
  if (value === undefined) return false
  const source = record(value)
  for (const field of TOKEN_FIELDS) {
    if (source[field] !== undefined) target[field] += integer(source[field])
  }
  if (source.inputTokens === undefined || source.outputTokens === undefined) throw new Error('incomplete token usage')
  return true
}

function streamUsage(value: unknown): { usage: unknown; error: boolean } {
  if (!Array.isArray(value)) throw new Error('invalid assistant stream')
  let usage: unknown
  let error = false
  for (const entry of value) {
    const streamRecord = record(entry)
    if (streamRecord.type !== 'chunk') continue
    const chunk = record(streamRecord.chunk)
    if (chunk.type === 'usage') usage = chunk.usage
    if (chunk.type === 'finish' && chunk.reason === 'error') error = true
  }
  return { usage, error }
}

function stepOf(value: JsonRecord, steps: Map<string, StepMetrics>): StepMetrics {
  const turn = integer(value.turn)
  const step = integer(value.step)
  const key = `${turn}:${step}`
  let metrics = steps.get(key)
  if (!metrics) {
    metrics = { turn, step, modelCalls: 0, missingUsageCalls: 0, toolCalls: 0, toolErrors: 0, modelErrors: 0, tokens: tokens() }
    steps.set(key, metrics)
  }
  return metrics
}

/** Read one file without returning its path, messages, tool names, arguments, or results. */
export async function readSession(path: string, role: 'child' | 'parent'): Promise<SessionMetrics> {
  const bytes = await readFile(path)
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n')
  if (lines.at(-1) === '') lines.pop()
  if (lines.length < 1 || lines.some(line => !line.trim())) throw new Error('empty or blank JSONL record')
  const parse = (line: string): JsonRecord => {
    try {
      return record(JSON.parse(line))
    } catch {
      throw new Error('invalid JSONL record')
    }
  }
  const headerLine = lines[0]
  if (headerLine === undefined) throw new Error('missing session header')
  const header = parse(headerLine)
  if (header.type !== 'session' || header.version !== 4) throw new Error('expected v4 session header')
  const sessionId = identifier(header.id)
  const parentSessionId = header.parentSession === undefined ? null : identifier(header.parentSession)
  if (role === 'child' && (header.origin !== 'subagent' || parentSessionId === null)) {
    throw new Error('child session must declare subagent origin and parent session')
  }
  const createdAt = integer(header.createdAt)
  const eventCounts = new Map<string, number>()
  const steps = new Map<string, StepMetrics>()
  const calls = new Map<string, boolean>()
  let matched = 0
  let orphanResults = 0
  let duplicateResults = 0
  let firstEventAt: number | null = null
  let lastEventAt: number | null = null
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index]
    if (line === undefined) throw new Error('missing JSONL record')
    const event = parse(line)
    const type = eventType(event.type)
    if (integer(event.seq) !== index - 1) throw new Error('non-contiguous event sequence')
    const time = integer(event.time)
    if (time < createdAt || (lastEventAt !== null && time < lastEventAt)) throw new Error('non-monotonic event time')
    firstEventAt ??= time
    lastEventAt = time
    const data = record(event.data)
    eventCounts.set(type, (eventCounts.get(type) ?? 0) + 1)
    switch (type) {
      case 'step/start':
      case 'step/end':
        stepOf(data, steps)
        break
      case 'assistant/message':
      case 'assistant/attempt': {
        const step = stepOf(data, steps)
        step.modelCalls++
        const stream = streamUsage(data.stream)
        if (!addUsage(step.tokens, type === 'assistant/message' ? (data.usage ?? stream.usage) : stream.usage)) step.missingUsageCalls++
        if (stream.error) step.modelErrors++
        break
      }
      case 'tool/call': {
        const step = stepOf(data, steps)
        const key = `${step.turn}:${step.step}:${toolId(data.callId)}`
        if (calls.has(key)) throw new Error('duplicate tool call id in step')
        calls.set(key, false)
        step.toolCalls++
        break
      }
      case 'tool/result': {
        const step = stepOf(data, steps)
        const message = record(data.message)
        const key = `${step.turn}:${step.step}:${toolId(message.toolCallId)}`
        if (event.surfaceOp !== 'append') {
          if (event.surfaceOp === undefined || typeof event.surfaceOp !== 'object') throw new Error('invalid tool result surface operation')
          break
        }
        if (typeof message.isError !== 'boolean') throw new Error('invalid tool result error flag')
        if (message.isError) step.toolErrors++
        if (!calls.has(key)) orphanResults++
        else if (calls.get(key)) duplicateResults++
        else { calls.set(key, true); matched++ }
        break
      }
      default:
        break
    }
  }
  const orderedSteps = [...steps.values()].sort((a, b) => a.turn - b.turn || a.step - b.step)
  const totals = { modelCalls: 0, missingUsageCalls: 0, toolCalls: 0, toolErrors: 0, modelErrors: 0, tokens: tokens() }
  for (const step of orderedSteps) {
    totals.modelCalls += step.modelCalls
    totals.missingUsageCalls += step.missingUsageCalls
    totals.toolCalls += step.toolCalls
    totals.toolErrors += step.toolErrors
    totals.modelErrors += step.modelErrors
    for (const field of TOKEN_FIELDS) totals.tokens[field] += step.tokens[field]
  }
  return {
    role, sessionId, parentSessionId, parentStatus: parentSessionId === null ? 'none' : 'unavailable',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    eventCounts: Object.fromEntries([...eventCounts].sort(([a], [b]) => a.localeCompare(b))),
    eventCount: lines.length - 1,
    toolPairing: { matched, unmatchedCalls: [...calls.values()].filter(found => !found).length, orphanResults, duplicateResults },
    steps: orderedSteps, totals, createdAt, firstEventAt, lastEventAt, durationMs: (lastEventAt ?? createdAt) - createdAt,
  }
}

/** Build a deterministic manifest; a supplied parent must match each child's declared lineage. */
export async function buildManifest(revision: string, childPaths: readonly string[], parentPath?: string): Promise<CorpusManifest> {
  if (revision !== 'unknown' && !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(revision)) throw new Error('revision must be unknown or a full lowercase commit hash')
  if (childPaths.length === 0) throw new Error('at least one child is required')
  const children = await Promise.all(childPaths.map(path => readSession(path, 'child')))
  let parent: SessionMetrics | undefined
  if (parentPath !== undefined) {
    try {
      parent = await readSession(parentPath, 'parent')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  const ids = new Set<string>()
  for (const child of children) {
    if (ids.has(child.sessionId)) throw new Error('duplicate child session id')
    ids.add(child.sessionId)
    if (parent && child.parentSessionId !== parent.sessionId) throw new Error('parent session id mismatch')
    if (parent) child.parentStatus = 'linked'
  }
  if (parent && ids.has(parent.sessionId)) throw new Error('parent is also a child')
  return {
    schemaVersion: 1,
    revision: revision === 'unknown' ? null : revision,
    revisionStatus: revision === 'unknown' ? 'unknown' : 'known',
    revisionLimitation: revision === 'unknown' ? UNKNOWN_REVISION_LIMITATION : null,
    sessions: [...children, ...parent ? [parent] : []].sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
  }
}

type ComparisonRow = { sessionId: string; sha256Match: boolean; left: SessionMetrics['totals']; right: SessionMetrics['totals']; delta: SessionMetrics['totals'] }

function sanitizedTotals(value: SessionMetrics['totals']): SessionMetrics['totals'] {
  return {
    modelCalls: value.modelCalls, missingUsageCalls: value.missingUsageCalls,
    toolCalls: value.toolCalls, toolErrors: value.toolErrors, modelErrors: value.modelErrors,
    tokens: Object.fromEntries(TOKEN_FIELDS.map(field => [field, value.tokens[field]])) as Tokens,
  }
}

/** Compare equal session ids with signed right-minus-left metric deltas and exact revision identity. */
export function compareManifests(left: CorpusManifest, right: CorpusManifest): {
  schemaVersion: 1
  revisionMatch: boolean
  leftRevision: string | null
  rightRevision: string | null
  leftRevisionStatus: 'known' | 'unknown'
  rightRevisionStatus: 'known' | 'unknown'
  onlyLeft: string[]
  onlyRight: string[]
  sessions: ComparisonRow[]
} {
  const leftVersion: unknown = left.schemaVersion
  const rightVersion: unknown = right.schemaVersion
  if (leftVersion !== 1 || rightVersion !== 1) throw new Error('invalid manifest version')
  for (const manifest of [left, right]) {
    const status: unknown = manifest.revisionStatus
    if (status === 'known') {
      if (typeof manifest.revision !== 'string' || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(manifest.revision) || manifest.revisionLimitation !== null) throw new Error('invalid known revision')
    } else if (status === 'unknown') {
      if (manifest.revision !== null || manifest.revisionLimitation !== UNKNOWN_REVISION_LIMITATION) throw new Error('invalid unknown revision')
    } else throw new Error('invalid revision status')
  }
  const index = (manifest: CorpusManifest): Map<string, SessionMetrics> => {
    if (!Array.isArray(manifest.sessions)) throw new Error('invalid manifest sessions')
    const result = new Map<string, SessionMetrics>()
    for (const session of manifest.sessions) {
      const id = identifier(session.sessionId)
      if (result.has(id) || !/^[0-9a-f]{64}$/.test(session.sha256)) throw new Error('invalid manifest session')
      const totals = record(session.totals)
      const tokenCounts = record(totals.tokens)
      for (const key of ['modelCalls', 'missingUsageCalls', 'toolCalls', 'toolErrors', 'modelErrors']) integer(totals[key])
      for (const key of TOKEN_FIELDS) integer(tokenCounts[key])
      result.set(id, session)
    }
    return result
  }
  const a = index(left)
  const b = index(right)
  const onlyLeft = [...a.keys()].filter(id => !b.has(id)).sort()
  const onlyRight = [...b.keys()].filter(id => !a.has(id)).sort()
  const sessions = [...a.keys()].filter(id => b.has(id)).sort().map((sessionId) => {
    const l = a.get(sessionId)
    const r = b.get(sessionId)
    if (l === undefined || r === undefined) throw new Error('missing compared session')
    const deltaTokens = tokens()
    for (const field of TOKEN_FIELDS) deltaTokens[field] = r.totals.tokens[field] - l.totals.tokens[field]
    return {
      sessionId, sha256Match: l.sha256 === r.sha256,
      left: sanitizedTotals(l.totals), right: sanitizedTotals(r.totals),
      delta: {
        modelCalls: r.totals.modelCalls - l.totals.modelCalls,
        missingUsageCalls: r.totals.missingUsageCalls - l.totals.missingUsageCalls,
        toolCalls: r.totals.toolCalls - l.totals.toolCalls,
        toolErrors: r.totals.toolErrors - l.totals.toolErrors,
        modelErrors: r.totals.modelErrors - l.totals.modelErrors,
        tokens: deltaTokens,
      },
    }
  })
  return {
    schemaVersion: 1,
    revisionMatch: left.revisionStatus === 'known' && right.revisionStatus === 'known' && left.revision === right.revision,
    leftRevision: left.revision, rightRevision: right.revision,
    leftRevisionStatus: left.revisionStatus, rightRevisionStatus: right.revisionStatus,
    onlyLeft, onlyRight, sessions,
  }
}

function displayOutputPath(path: string): string {
  return relative(process.cwd(), resolve(path)) || '.'
}

async function writeJsonAtomically(path: string, value: object, inputPaths: readonly string[]): Promise<void> {
  const destination = resolve(path)
  if (inputPaths.some(input => resolve(input) === destination)) throw new Error('output would replace an input file')
  const temporary = join(dirname(destination), `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function manifestSummary(manifest: CorpusManifest, outputPath: string): object {
  return {
    revision: manifest.revision,
    revisionStatus: manifest.revisionStatus,
    revisionLimitation: manifest.revisionLimitation,
    sessionCount: manifest.sessions.length,
    sessions: manifest.sessions.slice(0, SUMMARY_SESSION_LIMIT).map(session => ({
      sessionId: session.sessionId,
      modelCalls: session.totals.modelCalls,
      toolCalls: session.totals.toolCalls,
      toolErrors: session.totals.toolErrors,
      modelErrors: session.totals.modelErrors,
      totalTokens: session.totals.tokens.totalTokens,
    })),
    omittedSessionCount: Math.max(0, manifest.sessions.length - SUMMARY_SESSION_LIMIT),
    missingParentCount: manifest.sessions.filter(session => session.parentStatus === 'unavailable').length,
    outputFile: displayOutputPath(outputPath),
  }
}

function comparisonSummary(comparison: ReturnType<typeof compareManifests>, outputPath?: string): object {
  const delta = { modelCalls: 0, missingUsageCalls: 0, toolCalls: 0, toolErrors: 0, modelErrors: 0, tokens: tokens() }
  let changedFileCount = 0
  for (const session of comparison.sessions) {
    if (!session.sha256Match) changedFileCount++
    delta.modelCalls += session.delta.modelCalls
    delta.missingUsageCalls += session.delta.missingUsageCalls
    delta.toolCalls += session.delta.toolCalls
    delta.toolErrors += session.delta.toolErrors
    delta.modelErrors += session.delta.modelErrors
    for (const field of TOKEN_FIELDS) delta.tokens[field] += session.delta.tokens[field]
  }
  return {
    revisionMatch: comparison.revisionMatch,
    leftRevision: comparison.leftRevision,
    rightRevision: comparison.rightRevision,
    leftRevisionStatus: comparison.leftRevisionStatus,
    rightRevisionStatus: comparison.rightRevisionStatus,
    matchedSessionCount: comparison.sessions.length,
    onlyLeftCount: comparison.onlyLeft.length,
    onlyRightCount: comparison.onlyRight.length,
    changedFileCount,
    delta,
    ...outputPath === undefined ? {} : { outputFile: displayOutputPath(outputPath) },
  }
}

async function main(args: string[]): Promise<void> {
  if (args[0] === 'compare' && (args.length === 3 || (args.length === 5 && args[3] === '--output' && args[4]))) {
    const leftPath = args[1]
    const rightPath = args[2]
    if (leftPath === undefined || rightPath === undefined) throw new Error('comparison paths are required')
    const left = JSON.parse(await readFile(leftPath, 'utf8')) as CorpusManifest
    const right = JSON.parse(await readFile(rightPath, 'utf8')) as CorpusManifest
    const comparison = compareManifests(left, right)
    const outputPath = args[4]
    if (outputPath !== undefined) await writeJsonAtomically(outputPath, comparison, [leftPath, rightPath])
    process.stdout.write(`${JSON.stringify(comparisonSummary(comparison, outputPath))}\n`)
    return
  }
  if (args[0] !== 'manifest') throw new Error('expected manifest or compare command')
  let revision: string | undefined
  let parent: string | undefined
  let outputPath: string | undefined
  const children: string[] = []
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || !flag) throw new Error('missing option value')
    if (flag === '--revision' && revision === undefined) revision = value
    else if (flag === '--parent' && parent === undefined) parent = value
    else if (flag === '--child') children.push(value)
    else if (flag === '--output' && outputPath === undefined) outputPath = value
    else throw new Error('invalid or duplicate option')
  }
  if (outputPath === undefined) throw new Error('manifest output file is required')
  const manifest = await buildManifest(revision ?? '', children, parent)
  await writeJsonAtomically(outputPath, manifest, [...children, ...parent === undefined ? [] : [parent]])
  process.stdout.write(`${JSON.stringify(manifestSummary(manifest, outputPath))}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('Invalid session corpus input.\n')
    process.exitCode = 1
  })
}
