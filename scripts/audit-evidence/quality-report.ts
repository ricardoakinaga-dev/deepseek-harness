/** Deterministic AUD-09 measurements from saved corpus, reconciliation, and optional preflight JSON. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { decisionsSchema, reportSchema, requirementsSchema } from './contracts.ts'
import type { PreflightResult } from './preflight.ts'
import { attachSessionChecks, reconcileAudit } from './reconcile.ts'
import { aliasesInput } from './file-paths.ts'
import type { ReconciliationResult } from './reconcile.ts'
import type { CorpusManifest, SessionMetrics } from './session-corpus.ts'

type Tokens = SessionMetrics['totals']['tokens']
type Counts = Omit<SessionMetrics['totals'], 'tokens'>
type CorpusSession = Pick<SessionMetrics, 'sessionId' | 'role' | 'parentSessionId' | 'parentStatus' | 'sha256' | 'totals'>
type RevisionStatus = 'matched' | 'unknown' | 'mismatch'
type PreflightStatus = PreflightResult['status']
const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const
const COUNT_FIELDS = ['modelCalls', 'missingUsageCalls', 'toolCalls', 'toolErrors', 'modelErrors'] as const
const OUTCOMES = ['RESOLVED', 'OPEN', 'PENDING'] as const
const PREFLIGHT_STATUSES = ['READY', 'BLOCKED', 'PASS', 'FAIL'] as const
const PREFLIGHT_CATEGORIES = ['ready', 'setup', 'execution', 'product'] as const
const PREFLIGHT_ISSUES = [
  'CWD_UNAVAILABLE', 'COMMAND_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE', 'ENV_MISSING',
  'SEARCH_CREDENTIAL_MISSING', 'CURRENT_SOURCE_UNAVAILABLE', 'COMMAND_START_FAILED', 'TEST_INTERRUPTED',
] as const

/**
 * File passed to `--preflight`:
 * ```json
 * {
 *   "schemaVersion": 1, "auditId": "audit-1", "revision": "unknown",
 *   "checks": [{ "id": "test", "result": {
 *     "status": "READY", "category": "ready", "executed": false,
 *     "issues": [], "currentSources": []
 *   } }]
 * }
 * ```
 * Each `result` is one complete JSON result from `preflight.ts --spec FILE [--run]`.
 */
export interface QualityPreflight {
  schemaVersion: 1
  auditId: string
  revision: string
  checks: Array<{ id: string; result: PreflightResult }>
}

/** Sanitized measurements over one exact set of corpus file hashes. */
export interface QualityReport {
  schemaVersion: 1
  auditId: string
  revisionIdentity: {
    status: RevisionStatus
    corpusRevision: string | null
    reconciliationRevision: string
    preflightRevision: string | null
    limitation: string | null
  }
  corpus: {
    sessionCount: number
    childCount: number
    parentCount: number
    missingParentCount: number
    sessionHashes: Array<{ sessionId: string; sha256: string }>
    hashVerification: 'manifest-only' | 'verified-required-sessions'
    limitation: string
  }
  tokens: { children: Tokens; parents: Tokens; total: Tokens; missingUsageCalls: number }
  calls: { model: number; tool: number }
  reconciliation: {
    valid: boolean
    closureStatus: 'invalid' | 'pending' | 'open' | 'unverified' | 'resolved'
    errorCount: number
    resolved: number
    claimedResolved?: number
    open: number
    pending: number
    conflicts: number
    conflictingFindingIds: string[]
    unsupportedClaims: number
    missingFindings: Array<{ id: string; scopes: string[] }>
    evidenceVerification: 'ids-only' | 'recomputed-from-records'
    limitation: string
  }
  preflight: {
    status: 'provided' | 'not-provided'
    checkCount: number
    failureCount: number
    failedCount: number
    blockedCount: number
    readyCount: number
    passedCount: number
    failures: Array<{ id: string; status: 'FAIL' | 'BLOCKED'; category: PreflightResult['category'] }>
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}

function onlyKeys(value: Record<string, unknown>, path: string, keys: readonly string[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${path} has unsupported field`)
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`)
  return value
}

function safeId(value: unknown, path: string): string {
  const id = string(value, path)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(id)) throw new Error(`${path} must be a safe identifier`)
  return id
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${path} must be a non-negative safe integer`)
  return value
}

function option<const T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  if (typeof value === 'string' && choices.some(choice => choice === value)) return value as T
  throw new Error(`${path} has an invalid value`)
}

function sum(left: number, right: number, path: string): number {
  const total = left + right
  if (!Number.isSafeInteger(total)) throw new Error(`${path} exceeds safe integer range`)
  return total
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function emptyTokens(): Tokens {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }
}

function emptyCounts(): Counts {
  return { modelCalls: 0, missingUsageCalls: 0, toolCalls: 0, toolErrors: 0, modelErrors: 0 }
}

function parseTokens(value: unknown, path: string): Tokens {
  const source = object(value, path)
  const result = emptyTokens()
  for (const field of TOKEN_FIELDS) result[field] = integer(source[field], `${path}.${field}`)
  return result
}

function parseTotals(value: unknown, path: string): SessionMetrics['totals'] {
  const source = object(value, path)
  const result = { ...emptyCounts(), tokens: parseTokens(source.tokens, `${path}.tokens`) }
  for (const field of COUNT_FIELDS) result[field] = integer(source[field], `${path}.${field}`)
  return result
}

function addTotals(target: SessionMetrics['totals'], source: SessionMetrics['totals'], path: string): void {
  for (const field of COUNT_FIELDS) target[field] = sum(target[field], source[field], path)
  for (const field of TOKEN_FIELDS) target.tokens[field] = sum(target.tokens[field], source.tokens[field], path)
}

function parseCorpus(value: unknown): { revision: string | null; revisionStatus: CorpusManifest['revisionStatus']; revisionLimitation: string | null; sessions: CorpusSession[] } {
  const source = object(value, 'corpus')
  if (source.schemaVersion !== 1) throw new Error('corpus.schemaVersion must be 1')
  const revisionStatus = option(source.revisionStatus, 'corpus.revisionStatus', ['known', 'unknown'])
  let revision: string | null = null
  let revisionLimitation: string | null = null
  if (revisionStatus === 'known') {
    revision = string(source.revision, 'corpus.revision')
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision) || source.revisionLimitation !== null) throw new Error('corpus known revision must be a full hash without limitation')
  } else {
    if (source.revision !== null) throw new Error('corpus unknown revision must be null')
    revisionLimitation = string(source.revisionLimitation, 'corpus.revisionLimitation')
  }
  const seen = new Set<string>()
  const sessions = array(source.sessions, 'corpus.sessions').map((entry, index): CorpusSession => {
    const path = `corpus.sessions[${index}]`
    const session = object(entry, path)
    const sessionId = safeId(session.sessionId, `${path}.sessionId`)
    if (seen.has(sessionId)) throw new Error('duplicate corpus session id')
    seen.add(sessionId)
    const sha256 = string(session.sha256, `${path}.sha256`)
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${path}.sha256 must be SHA-256`)
    const totals = parseTotals(session.totals, `${path}.totals`)
    const stepTotals = { ...emptyCounts(), tokens: emptyTokens() }
    const stepIds = new Set<string>()
    for (const [stepIndex, entry] of array(session.steps, `${path}.steps`).entries()) {
      const step = object(entry, `${path}.steps[${stepIndex}]`)
      const turn = integer(step.turn, `${path}.steps[${stepIndex}].turn`)
      const number = integer(step.step, `${path}.steps[${stepIndex}].step`)
      const key = `${turn}:${number}`
      if (stepIds.has(key)) throw new Error(`${path} has duplicate step`)
      stepIds.add(key)
      addTotals(stepTotals, parseTotals(step, `${path}.steps[${stepIndex}]`), path)
    }
    for (const field of COUNT_FIELDS) if (totals[field] !== stepTotals[field]) throw new Error(`${path}.totals.${field} differs from steps`)
    for (const field of TOKEN_FIELDS) if (totals.tokens[field] !== stepTotals.tokens[field]) throw new Error(`${path}.totals.tokens.${field} differs from steps`)
    const role = option(session.role, `${path}.role`, ['child', 'parent'])
    const parentStatus = option(session.parentStatus, `${path}.parentStatus`, ['linked', 'unavailable', 'none'])
    const parentSessionId = session.parentSessionId === null ? null : safeId(session.parentSessionId, `${path}.parentSessionId`)
    return { sessionId, role, parentSessionId, parentStatus, sha256, totals }
  })
  if (sessions.length === 0) throw new Error('corpus needs at least one session')
  const parents = new Set(sessions.filter(session => session.role === 'parent').map(session => session.sessionId))
  if (parents.size > 1 || !sessions.some(session => session.role === 'child')) throw new Error('corpus needs children and at most one parent')
  for (const session of sessions) {
    if (session.role === 'parent' && session.parentStatus === 'linked') throw new Error('parent cannot be linked inside this corpus')
    if (session.parentStatus === 'none' && session.parentSessionId !== null) throw new Error('parent status contradicts parent id')
    if (session.parentStatus !== 'none' && session.parentSessionId === null) throw new Error('parent status requires parent id')
    const parentId = session.parentSessionId
    if (session.parentStatus === 'linked' && (parentId === null || !parents.has(parentId))) {
      throw new Error('linked parent is missing from corpus')
    }
    if (session.parentStatus === 'unavailable' && parentId !== null && parents.has(parentId)) {
      throw new Error('available parent marked unavailable')
    }
  }
  const parentIds = [...parents]
  if (parentIds.length === 1) {
    for (const session of sessions.filter(item => item.role === 'child')) {
      if (session.parentStatus !== 'linked' || session.parentSessionId !== parentIds[0]) {
        throw new Error('child parent lineage differs from available corpus parent')
      }
    }
  }
  return { revision, revisionStatus, revisionLimitation, sessions }
}

type ReconcileView = Pick<ReconciliationResult, 'auditId' | 'revision' | 'valid' | 'totals' | 'errors'> & {
  sessionChecks?: NonNullable<ReconciliationResult['sessionChecks']>
  findings: Array<{
    id: string
    status: 'RESOLVED' | 'OPEN' | 'PENDING'
    conflict: boolean
    scopes: Array<{
      scope: string
      outcome: 'RESOLVED' | 'OPEN' | 'PENDING'
      conflict: boolean
      childStatuses: unknown[]
    }>
  }>
}

function parseReconciliation(value: unknown): ReconcileView {
  const source = object(value, 'reconciliation')
  if (source.schemaVersion !== 1) throw new Error('reconciliation.schemaVersion must be 1')
  const errors = array(source.errors, 'reconciliation.errors').map((entry, index) => string(entry, `reconciliation.errors[${index}]`))
  if (typeof source.valid !== 'boolean' || source.valid !== (errors.length === 0)) throw new Error('reconciliation.valid contradicts errors')
  const seen = new Set<string>()
  const findings = array(source.findings, 'reconciliation.findings').map((entry, index) => {
    const path = `reconciliation.findings[${index}]`
    const finding = object(entry, path)
    const id = safeId(finding.id, `${path}.id`)
    if (seen.has(id)) throw new Error('duplicate reconciliation finding id')
    seen.add(id)
    const scopes = array(finding.scopes, `${path}.scopes`).map((entry, scopeIndex) => {
      const scopePath = `${path}.scopes[${scopeIndex}]`
      const scope = object(entry, scopePath)
      const name = option(scope.scope, `${scopePath}.scope`, ['source', 'test', 'dependency', 'runtime', 'external'])
      const childStatuses = array(scope.childStatuses, `${scopePath}.childStatuses`)
      const statuses = new Set<string>()
      const agents = new Set<string>()
      for (const [statusIndex, entry] of childStatuses.entries()) {
        const child = object(entry, `${scopePath}.childStatuses[${statusIndex}]`)
        const agentId = safeId(child.agentId, `${scopePath}.childStatuses[${statusIndex}].agentId`)
        if (agents.has(agentId)) throw new Error(`${scopePath} has duplicate child agent`)
        agents.add(agentId)
        statuses.add(option(child.status, `${scopePath}.childStatuses[${statusIndex}].status`, ['RESOLVED', 'OPEN', 'PARTIAL', 'UNVERIFIED', 'BLOCKED']))
      }
      if (typeof scope.conflict !== 'boolean' || scope.conflict !== (statuses.size > 1)) throw new Error(`${scopePath}.conflict contradicts child statuses`)
      if (typeof scope.adjudicated !== 'boolean') throw new Error(`${scopePath}.adjudicated must be boolean`)
      const outcome = option(scope.outcome, `${scopePath}.outcome`, OUTCOMES)
      if (!scope.adjudicated) {
        const status = [...statuses][0]
        const expected = statuses.size === 1 && (status === 'RESOLVED' || status === 'OPEN') ? status : 'PENDING'
        if (outcome !== expected && outcome !== 'PENDING') {
          throw new Error(`${scopePath}.outcome contradicts child statuses`)
        }
      }
      const evidenceIds = array(scope.evidenceIds, `${scopePath}.evidenceIds`)
        .map((entry, idIndex) => safeId(entry, `${scopePath}.evidenceIds[${idIndex}]`))
      if (outcome !== 'PENDING' && evidenceIds.length === 0) {
        throw new Error(`${scopePath} closed outcome requires supporting evidence ids`)
      }
      return { scope: name, outcome, childStatuses, conflict: scope.conflict }
    })
    if (new Set(scopes.map(scope => scope.scope)).size !== scopes.length) throw new Error(`${path} has duplicate scope`)
    const status = option(finding.status, `${path}.status`, OUTCOMES)
    const recommendedStatus = option(finding.recommendedStatus, `${path}.recommendedStatus`, OUTCOMES)
    const expectedStatus = scopes.some(scope => scope.outcome === 'PENDING') ? 'PENDING'
      : scopes.some(scope => scope.outcome === 'OPEN') ? 'OPEN' : 'RESOLVED'
    if (recommendedStatus !== expectedStatus) throw new Error(`${path}.recommendedStatus contradicts scopes`)
    if (status !== 'PENDING' && status !== recommendedStatus) {
      throw new Error(`${path}.status contradicts recommendedStatus`)
    }
    if (typeof finding.conflict !== 'boolean' || finding.conflict !== scopes.some(scope => scope.conflict)) throw new Error(`${path}.conflict contradicts scopes`)
    return { id, status, conflict: finding.conflict, scopes }
  })
  if (findings.length === 0) throw new Error('reconciliation needs at least one finding')
  const totals = object(source.totals, 'reconciliation.totals')
  const parsedTotals = {
    resolved: integer(totals.resolved, 'reconciliation.totals.resolved'),
    open: integer(totals.open, 'reconciliation.totals.open'),
    pending: integer(totals.pending, 'reconciliation.totals.pending'),
    conflicts: integer(totals.conflicts, 'reconciliation.totals.conflicts'),
  }
  if (parsedTotals.resolved !== findings.filter(item => item.status === 'RESOLVED').length ||
    parsedTotals.open !== findings.filter(item => item.status === 'OPEN').length ||
    parsedTotals.pending !== findings.filter(item => item.status === 'PENDING').length ||
    parsedTotals.conflicts !== findings.filter(item => item.conflict).length) throw new Error('reconciliation totals contradict findings')
  const sessionChecks = source.sessionChecks === undefined ? undefined
    : array(source.sessionChecks, 'reconciliation.sessionChecks').map((entry, index) => {
      const check = object(entry, `reconciliation.sessionChecks[${index}]`)
      const sha256 = string(check.sha256, `reconciliation.sessionChecks[${index}].sha256`)
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('invalid Session SHA-256 in reconciliation')
      return { agentId: safeId(check.agentId, `reconciliation.sessionChecks[${index}].agentId`),
        sessionId: safeId(check.sessionId, `reconciliation.sessionChecks[${index}].sessionId`), sha256,
        role: option(check.role, `reconciliation.sessionChecks[${index}].role`, ['child', 'parent'] as const),
        parentSessionId: check.parentSessionId === null ? null
          : safeId(check.parentSessionId, `reconciliation.sessionChecks[${index}].parentSessionId`),
        errors: array(check.errors, `reconciliation.sessionChecks[${index}].errors`)
          .map((error, errorIndex) => string(error, `reconciliation.sessionChecks[${index}].errors[${errorIndex}]`)) }
    })
  if (sessionChecks && (new Set(sessionChecks.map(check => check.sessionId)).size !== sessionChecks.length ||
    new Set(sessionChecks.map(check => check.agentId)).size !== sessionChecks.length)) {
    throw new Error('duplicate Session check identity')
  }
  return { auditId: safeId(source.auditId, 'reconciliation.auditId'), revision: safeId(source.revision, 'reconciliation.revision'),
    valid: source.valid, findings, errors, totals: parsedTotals, ...sessionChecks === undefined ? {} : { sessionChecks } }
}

function parsePreflightResult(value: unknown, path: string): PreflightResult {
  const source = object(value, path)
  onlyKeys(source, path, ['status', 'category', 'executed', 'issues', 'currentSources', 'exitCode'])
  const status: PreflightStatus = option(source.status, `${path}.status`, PREFLIGHT_STATUSES)
  const category = option(source.category, `${path}.category`, PREFLIGHT_CATEGORIES)
  if (typeof source.executed !== 'boolean') throw new Error(`${path}.executed must be boolean`)
  const issues = array(source.issues, `${path}.issues`).map((entry, index) => {
    const issuePath = `${path}.issues[${index}]`
    const issue = object(entry, issuePath)
    onlyKeys(issue, issuePath, ['code', 'subject', 'remedy'])
    return {
      code: option(issue.code, `${issuePath}.code`, PREFLIGHT_ISSUES),
      subject: string(issue.subject, `${issuePath}.subject`),
      remedy: string(issue.remedy, `${issuePath}.remedy`),
    }
  })
  const currentSources = array(source.currentSources, `${path}.currentSources`).map((entry, index) => {
    const sourcePath = `${path}.currentSources[${index}]`
    const current = object(entry, sourcePath)
    onlyKeys(current, sourcePath, ['path', 'sha256'])
    const sha256 = string(current.sha256, `${sourcePath}.sha256`)
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${sourcePath}.sha256 must be SHA-256`)
    return { path: string(current.path, `${sourcePath}.path`), sha256 }
  })
  const exitCode = source.exitCode === undefined ? undefined : integer(source.exitCode, `${path}.exitCode`)
  if (status === 'READY' && (category !== 'ready' || source.executed || issues.length !== 0 || exitCode !== undefined)) {
    throw new Error(`${path} has inconsistent READY fields`)
  }
  if (status === 'BLOCKED' && ((category !== 'setup' && category !== 'execution') || issues.length === 0 || exitCode !== undefined ||
    (category === 'setup' && source.executed))) throw new Error(`${path} has inconsistent BLOCKED fields`)
  if ((status === 'PASS' || status === 'FAIL') && (category !== 'product' || !source.executed || issues.length !== 0 ||
    exitCode === undefined || (status === 'PASS' ? exitCode !== 0 : exitCode === 0))) {
    throw new Error(`${path} has inconsistent executed result fields`)
  }
  return { status, category, executed: source.executed, issues, currentSources,
    ...exitCode === undefined ? {} : { exitCode } }
}

function parsePreflight(value: unknown): QualityPreflight {
  const source = object(value, 'preflight')
  onlyKeys(source, 'preflight', ['schemaVersion', 'auditId', 'revision', 'checks'])
  if (source.schemaVersion !== 1) throw new Error('preflight.schemaVersion must be 1')
  const seen = new Set<string>()
  const inputChecks = array(source.checks, 'preflight.checks')
  if (inputChecks.length === 0) throw new Error('preflight.checks needs at least one result')
  const checks = inputChecks.map((entry, index) => {
    const path = `preflight.checks[${index}]`
    const check = object(entry, path)
    onlyKeys(check, path, ['id', 'result'])
    const id = safeId(check.id, `${path}.id`)
    if (seen.has(id)) throw new Error('duplicate preflight check id')
    seen.add(id)
    return { id, result: parsePreflightResult(check.result, `${path}.result`) }
  })
  return { schemaVersion: 1, auditId: safeId(source.auditId, 'preflight.auditId'),
    revision: safeId(source.revision, 'preflight.revision'), checks }
}

function unsupportedClaim(error: string): boolean {
  return /: parent (?:RESOLVED|OPEN) (?:conflicts with observed|lacks supporting evidence id)/.test(error)
    || /: unknown evidence /.test(error)
    || /^parent adjudication for .+ used /.test(error)
    || /^undeclared reported scope .+ from .+$/.test(error)
    || /^missing independent reviewer report .+$/.test(error)
    || /^independent reviewer omitted finding .+$/.test(error)
    || /^independent reviewer omitted scope .+$/.test(error)
}

/** Validate input records and aggregate measurements without inferring model performance. */
export function buildQualityReport(corpusInput: unknown, reconciliationInput: unknown, preflightInput?: unknown,
  options: { recomputedFromRecords?: boolean; rawSessionVerified?: boolean; parentAgentId?: string } = {}): QualityReport {
  const corpus = parseCorpus(corpusInput)
  const reconciliation = parseReconciliation(reconciliationInput)
  const preflight = preflightInput === undefined ? undefined : parsePreflight(preflightInput)
  if (preflight && preflight.auditId !== reconciliation.auditId) throw new Error('preflight audit id differs from reconciliation')
  const preflightRevision = preflight?.revision ?? null
  const revisionStatus: RevisionStatus = preflightRevision !== null && preflightRevision !== reconciliation.revision
    ? 'mismatch'
    : corpus.revisionStatus === 'unknown' ? 'unknown'
      : corpus.revision === reconciliation.revision ? 'matched' : 'mismatch'
  const children = { ...emptyCounts(), tokens: emptyTokens() }
  const parents = { ...emptyCounts(), tokens: emptyTokens() }
  for (const session of corpus.sessions) addTotals(session.role === 'child' ? children : parents, session.totals, 'corpus total')
  if (reconciliation.sessionChecks !== undefined) {
    const childSessions = corpus.sessions.filter(session => session.role === 'child')
    if (childSessions.some(session => !reconciliation.sessionChecks?.some(check =>
      check.sessionId === session.sessionId && check.sha256 === session.sha256 &&
      check.role === 'child' && check.parentSessionId === session.parentSessionId)) ||
      reconciliation.sessionChecks.some(check => check.errors.length > 0 || !corpus.sessions.some(session =>
        session.sessionId === check.sessionId && session.sha256 === check.sha256 &&
        session.role === check.role && session.parentSessionId === check.parentSessionId &&
        check.role === (check.agentId === options.parentAgentId ? 'parent' : 'child')))) {
      throw new Error('Session checks differ from the corpus hashes')
    }
  }
  if (options.rawSessionVerified && reconciliation.sessionChecks === undefined) {
    throw new Error('raw Session verification requires Session checks')
  }
  const total = { ...emptyCounts(), tokens: emptyTokens() }
  addTotals(total, children, 'corpus total')
  addTotals(total, parents, 'corpus total')
  const failures = preflight?.checks.filter(check => check.result.status === 'FAIL' || check.result.status === 'BLOCKED')
    .map(check => ({ id: check.id, status: check.result.status as 'FAIL' | 'BLOCKED', category: check.result.category }))
    .sort((a, b) => compareIds(a.id, b.id)) ?? []
  const unverifiedTest = !options.rawSessionVerified && reconciliation.findings.some(finding =>
    finding.scopes.some(scope => scope.scope === 'test' && scope.outcome !== 'PENDING'))
  return {
    schemaVersion: 1,
    auditId: reconciliation.auditId,
    revisionIdentity: {
      status: revisionStatus,
      corpusRevision: corpus.revision,
      reconciliationRevision: reconciliation.revision,
      preflightRevision,
      limitation: revisionStatus === 'unknown' ? corpus.revisionLimitation
        : revisionStatus === 'mismatch' ? 'Input revisions differ.'
          : 'Revision labels match; source bytes were not independently verified by this report.',
    },
    corpus: {
      sessionCount: corpus.sessions.length,
      childCount: corpus.sessions.filter(session => session.role === 'child').length,
      parentCount: corpus.sessions.filter(session => session.role === 'parent').length,
      missingParentCount: corpus.sessions.filter(session => session.parentStatus === 'unavailable').length,
      sessionHashes: corpus.sessions.map(session => ({ sessionId: session.sessionId, sha256: session.sha256 }))
        .sort((a, b) => compareIds(a.sessionId, b.sessionId)),
      hashVerification: options.rawSessionVerified ? 'verified-required-sessions' : 'manifest-only',
      limitation: options.rawSessionVerified
        ? 'Required child Sessions and a parent Session for any resolved scope or parent test adjudication were rehashed; other corpus Sessions remain manifest-only.'
        : 'Session SHA-256 values came from the corpus manifest; raw session files were not rehashed.',
    },
    tokens: { children: children.tokens, parents: parents.tokens, total: total.tokens, missingUsageCalls: total.missingUsageCalls },
    calls: { model: total.modelCalls, tool: total.toolCalls },
    reconciliation: {
      valid: reconciliation.valid,
      closureStatus: !reconciliation.valid ? 'invalid'
        : unverifiedTest ? 'unverified'
          : reconciliation.totals.pending > 0 ? 'pending'
            : reconciliation.totals.open > 0 ? 'open'
              : !options.rawSessionVerified || revisionStatus !== 'matched' ? 'unverified' : 'resolved',
      errorCount: reconciliation.errors.length,
      resolved: options.rawSessionVerified && reconciliation.valid && revisionStatus === 'matched'
        ? reconciliation.totals.resolved : 0,
      ...!options.rawSessionVerified || !reconciliation.valid || revisionStatus !== 'matched'
        ? reconciliation.totals.resolved > 0 ? { claimedResolved: reconciliation.totals.resolved } : {}
        : {},
      open: reconciliation.totals.open,
      pending: reconciliation.totals.pending,
      conflicts: reconciliation.totals.conflicts,
      conflictingFindingIds: reconciliation.findings.filter(finding => finding.conflict).map(finding => finding.id).sort(),
      unsupportedClaims: reconciliation.errors.filter(unsupportedClaim).length,
      missingFindings: reconciliation.findings.map(finding => ({ id: finding.id,
        scopes: finding.scopes.filter(scope => scope.childStatuses.length === 0 ||
          reconciliation.errors.includes(`independent reviewer omitted scope ${finding.id}:${scope.scope}`) ||
          reconciliation.errors.includes(`independent reviewer omitted finding ${finding.id}`) ||
          reconciliation.errors.some(error => error.startsWith('missing independent reviewer report ')))
          .map(scope => scope.scope).sort() }))
        .filter(finding => finding.scopes.length > 0).sort((a, b) => compareIds(a.id, b.id)),
      evidenceVerification: options.recomputedFromRecords ? 'recomputed-from-records' : 'ids-only',
      limitation: options.recomputedFromRecords
        ? 'Reconciliation was recomputed from records; source observations and reviewer independence were not independently verified.'
        : 'Evidence IDs were checked in reconciliation JSON; source observations and parent selection were not revalidated.',
    },
    preflight: {
      status: preflight ? 'provided' : 'not-provided',
      checkCount: preflight?.checks.length ?? 0,
      failureCount: failures.length,
      failedCount: failures.filter(check => check.status === 'FAIL').length,
      blockedCount: failures.filter(check => check.status === 'BLOCKED').length,
      readyCount: preflight?.checks.filter(check => check.result.status === 'READY').length ?? 0,
      passedCount: preflight?.checks.filter(check => check.result.status === 'PASS').length ?? 0,
      failures,
    },
  }
}

interface QualityArgs {
  corpus: string
  reconciliation?: string
  requirements?: string
  reports: string[]
  sessions: Map<string, string>
  decisions?: string
  preflight?: string
  output?: string
}

function argsOf(argv: string[]): QualityArgs {
  const result: QualityArgs = { corpus: '', reports: [], sessions: new Map() }
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('missing CLI option value')
    if (flag === '--corpus' && !result.corpus) result.corpus = value
    else if (flag === '--reconcile' && !result.reconciliation) result.reconciliation = value
    else if (flag === '--requirements' && result.requirements === undefined) result.requirements = value
    else if (flag === '--report') result.reports.push(value)
    else if (flag === '--session') {
      const separator = value.indexOf('=')
      if (separator < 1 || separator === value.length - 1) throw new Error('session requires AGENT_ID=PATH')
      const agentId = value.slice(0, separator)
      if (result.sessions.has(agentId)) throw new Error('duplicate Session agent ID')
      result.sessions.set(agentId, value.slice(separator + 1))
    }
    else if (flag === '--decisions' && result.decisions === undefined) result.decisions = value
    else if (flag === '--preflight' && result.preflight === undefined) result.preflight = value
    else if (flag === '--output' && result.output === undefined) result.output = value
    else throw new Error('invalid or duplicate CLI option')
  }
  const recordMode = Boolean(result.requirements || result.decisions || result.reports.length)
  if (!result.corpus || (recordMode ? Boolean(result.reconciliation) || !result.requirements ||
    !result.decisions || result.reports.length === 0 : !result.reconciliation)) {
    throw new Error('corpus and either reconciliation or complete source records are required')
  }
  if (!recordMode && result.sessions.size > 0) throw new Error('raw Session checks require source reports')
  const output = result.output
  if (output !== undefined) {
    const inputs = [result.corpus, result.reconciliation, result.requirements, ...result.reports,
      ...result.sessions.values(), result.decisions, result.preflight]
    if (inputs.some(path => path !== undefined && aliasesInput(output, path))) {
      throw new Error('output must differ from input files')
    }
  }
  return result
}

/** Execute the JSON CLI; malformed input fails with status 2 and no report. */
export function runQualityReport(argv: string[]): number {
  try {
    const args = argsOf(argv)
    const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
    const reports = args.reports.map(path => reportSchema.parse(read(path)))
    const decisions = args.decisions ? decisionsSchema.parse(read(args.decisions)) : undefined
    const recordReconciliation = args.requirements && decisions
      ? reconcileAudit(requirementsSchema.parse(read(args.requirements)), reports, decisions)
      : undefined
    if (args.sessions.size > 0 && recordReconciliation && decisions) {
      attachSessionChecks(recordReconciliation, reports, args.sessions, decisions)
    }
    const reconciliation = recordReconciliation ?? (args.reconciliation ? read(args.reconciliation) : undefined)
    if (reconciliation === undefined) throw new Error('missing reconciliation input')
    const report = buildQualityReport(read(args.corpus), reconciliation,
      args.preflight ? read(args.preflight) : undefined,
      { recomputedFromRecords: Boolean(args.requirements), rawSessionVerified: args.sessions.size > 0,
        ...decisions === undefined ? {} : { parentAgentId: decisions.parentAgentId } })
    const json = `${JSON.stringify(report, null, 2)}\n`
    if (args.output) writeFileSync(args.output, json)
    else process.stdout.write(json)
    if (args.sessions.size > 0 && recordReconciliation && !recordReconciliation.valid) return 2
    if (report.reconciliation.closureStatus === 'invalid') return 2
    return report.reconciliation.closureStatus === 'resolved' ? 0 : 1
  } catch {
    process.stderr.write('audit-evidence: invalid quality report input\n')
    return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runQualityReport(process.argv.slice(2))
}
