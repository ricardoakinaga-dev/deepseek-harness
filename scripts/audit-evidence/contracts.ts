/** Versioned evidence records exchanged by delegated audit reports. */

/** The independent observation needed to close one aspect of a finding. */
export const AUDIT_SCOPES = ['source', 'test', 'dependency', 'runtime', 'external'] as const
/** A finding status applies only to its named scope and target revision. */
export const AUDIT_STATUSES = ['RESOLVED', 'OPEN', 'PARTIAL', 'UNVERIFIED', 'BLOCKED'] as const
/** The kind of procedure actually performed, rather than a proposed check. */
export const EVIDENCE_KINDS = [
  'source-read', 'test-run', 'advisory-read', 'runtime-observation', 'external-authority',
] as const

/** One observation, including its actual outcome and source revision. */
export interface AuditEvidence {
  id: string
  kind: typeof EVIDENCE_KINDS[number]
  outcome: 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED'
  reference: string
  observedAt: string
  revision: string
  command?: string
  exitCode?: number | null
  note?: string
}

/** One scoped conclusion with direct observations and explicit limitations. */
export interface AuditFinding {
  id: string
  scope: typeof AUDIT_SCOPES[number]
  status: typeof AUDIT_STATUSES[number]
  confidence: 'high' | 'medium' | 'low'
  summary: string
  evidence: AuditEvidence[]
  limitations: string[]
}

/** A self-contained result from one agent for one audited revision. */
export interface AuditReport {
  schemaVersion: 1
  auditId: string
  agentId: string
  revision: string
  observedAt: string
  taskScope?: string
  files?: string[]
  sessionId?: string
  sessionSha256?: string
  findings: AuditFinding[]
}

/** The parent's declared completion requirements for each tracked finding. */
export interface AuditRequirements {
  schemaVersion: 1
  auditId: string
  revision: string
  independentReviewer: string
  findings: Array<{ id: string; requiredScopes: AuditFinding['scope'][] }>
}

/** A direct parent observation that resolves disputed or missing child evidence. */
export interface AuditAdjudication {
  scope: AuditFinding['scope']
  rationale: string
  evidence: AuditEvidence
}

/** One parent's written disposition for an audit finding. */
export interface AuditDecision {
  id: string
  status: 'RESOLVED' | 'OPEN' | 'PENDING'
  rationale: string
  evidenceIds: string[]
  adjudications: AuditAdjudication[]
}

/** The parent decisions bound to the same audit and revision as child reports. */
export interface AuditDecisions {
  schemaVersion: 1
  auditId: string
  parentAgentId: string
  revision: string
  sessionId?: string
  sessionSha256?: string
  decisions: AuditDecision[]
}

const evidenceForScope: Record<AuditFinding['scope'], AuditEvidence['kind']> = {
  source: 'source-read', test: 'test-run', dependency: 'advisory-read',
  runtime: 'runtime-observation', external: 'external-authority',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key} is not supported`)
  }
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`)
  return value
}

function timestamp(value: unknown, path: string): string {
  const text = string(value, path)
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${path} must be an ISO timestamp with timezone`)
  }
  return text
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function oneOf<const T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value === 'string') {
    const found = options.find(option => option === value)
    if (found) return found
  }
  throw new Error(`${path} must be one of ${options.join(', ')}`)
}

function version(value: unknown, path: string): 1 {
  if (value !== 1) throw new Error(`${path} must be 1`)
  return 1
}

function parseEvidence(value: unknown, path: string): AuditEvidence {
  const item = record(value, path, ['id', 'kind', 'outcome', 'reference', 'observedAt', 'revision', 'command', 'exitCode', 'note'])
  const evidence: AuditEvidence = {
    id: string(item.id, `${path}.id`),
    kind: oneOf(item.kind, `${path}.kind`, EVIDENCE_KINDS),
    outcome: oneOf(item.outcome, `${path}.outcome`, ['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED']),
    reference: string(item.reference, `${path}.reference`),
    observedAt: timestamp(item.observedAt, `${path}.observedAt`),
    revision: string(item.revision, `${path}.revision`),
  }
  if (item.command !== undefined) evidence.command = string(item.command, `${path}.command`)
  if (item.exitCode !== undefined) {
    if (item.exitCode !== null && (typeof item.exitCode !== 'number' || !Number.isInteger(item.exitCode))) {
      throw new Error(`${path}.exitCode must be an integer or null`)
    }
    evidence.exitCode = item.exitCode
  }
  if (item.note !== undefined) evidence.note = string(item.note, `${path}.note`)
  if (evidence.kind === 'test-run' && (evidence.outcome === 'PASS' || evidence.outcome === 'FAIL')) {
    if (!evidence.command || evidence.exitCode === undefined || evidence.exitCode === null ||
      (evidence.outcome === 'PASS' && evidence.exitCode !== 0) ||
      (evidence.outcome === 'FAIL' && evidence.exitCode === 0)) {
      throw new Error(`${path}: executed test requires a command and matching exit code`)
    }
  }
  if ((evidence.outcome === 'NOT_RUN' || evidence.outcome === 'BLOCKED') && evidence.exitCode !== undefined && evidence.exitCode !== null) {
    throw new Error(`${path}: an unexecuted check cannot have an exit code`)
  }
  return evidence
}

function parseFinding(value: unknown, path: string): AuditFinding {
  const item = record(value, path, ['id', 'scope', 'status', 'confidence', 'summary', 'evidence', 'limitations'])
  const finding: AuditFinding = {
    id: string(item.id, `${path}.id`),
    scope: oneOf(item.scope, `${path}.scope`, AUDIT_SCOPES),
    status: oneOf(item.status, `${path}.status`, AUDIT_STATUSES),
    confidence: oneOf(item.confidence, `${path}.confidence`, ['high', 'medium', 'low']),
    summary: string(item.summary, `${path}.summary`),
    evidence: list(item.evidence, `${path}.evidence`).map((entry, index) => parseEvidence(entry, `${path}.evidence[${index}]`)),
    limitations: list(item.limitations, `${path}.limitations`).map((entry, index) => string(entry, `${path}.limitations[${index}]`)),
  }
  const matching = finding.evidence.filter(entry => entry.kind === evidenceForScope[finding.scope])
  if (finding.status === 'RESOLVED' && !matching.some(entry => entry.outcome === 'PASS' &&
    (entry.kind !== 'test-run' || (entry.command && entry.exitCode === 0)))) {
    throw new Error(`${path}: RESOLVED ${finding.scope} needs successful ${evidenceForScope[finding.scope]} evidence`)
  }
  if (finding.status === 'OPEN' && !matching.some(entry => entry.outcome === 'FAIL' &&
    (entry.kind !== 'test-run' || (entry.command && typeof entry.exitCode === 'number' && entry.exitCode !== 0)))) {
    throw new Error(`${path}: OPEN ${finding.scope} needs failed ${evidenceForScope[finding.scope]} evidence`)
  }
  if (finding.status === 'RESOLVED' && matching.some(entry => entry.outcome === 'FAIL')) {
    throw new Error(`${path}: RESOLVED ${finding.scope} contains conflicting failed evidence`)
  }
  if (finding.status === 'OPEN' && matching.some(entry => entry.outcome === 'PASS')) {
    throw new Error(`${path}: OPEN ${finding.scope} contains conflicting successful evidence`)
  }
  if ((finding.status === 'UNVERIFIED' || finding.status === 'BLOCKED') && finding.limitations.length === 0) {
    throw new Error(`${path}: ${finding.status} needs a limitation`)
  }
  return finding
}

function parseReport(value: unknown): AuditReport {
  const item = record(value, 'report', ['schemaVersion', 'auditId', 'agentId', 'revision', 'observedAt',
    'taskScope', 'files', 'sessionId', 'sessionSha256', 'findings'])
  const report: AuditReport = {
    schemaVersion: version(item.schemaVersion, 'report.schemaVersion'),
    auditId: string(item.auditId, 'report.auditId'),
    agentId: string(item.agentId, 'report.agentId'),
    revision: string(item.revision, 'report.revision'),
    observedAt: timestamp(item.observedAt, 'report.observedAt'),
    ...item.taskScope === undefined ? {} : { taskScope: string(item.taskScope, 'report.taskScope') },
    ...item.files === undefined ? {} : { files: list(item.files, 'report.files')
      .map((entry, index) => string(entry, `report.files[${index}]`)) },
    ...item.sessionId === undefined ? {} : { sessionId: string(item.sessionId, 'report.sessionId') },
    ...item.sessionSha256 === undefined ? {} : { sessionSha256: string(item.sessionSha256, 'report.sessionSha256') },
    findings: list(item.findings, 'report.findings').map((entry, index) => parseFinding(entry, `report.findings[${index}]`)),
  }
  if (report.files && new Set(report.files).size !== report.files.length) throw new Error('report.files has duplicates')
  if (report.sessionSha256 && !/^[0-9a-f]{64}$/.test(report.sessionSha256)) throw new Error('report.sessionSha256 must be SHA-256')
  const seen = new Set<string>()
  for (const finding of report.findings) {
    const key = `${finding.id}:${finding.scope}`
    if (seen.has(key)) throw new Error(`duplicate finding scope ${key}`)
    seen.add(key)
    for (const evidence of finding.evidence) {
      if (evidence.revision !== report.revision) throw new Error(`evidence ${evidence.id} revision differs from report revision`)
      if (Date.parse(evidence.observedAt) > Date.parse(report.observedAt)) throw new Error(`evidence ${evidence.id} was observed after report delivery`)
    }
  }
  return report
}

function parseRequirements(value: unknown): AuditRequirements {
  const item = record(value, 'requirements', ['schemaVersion', 'auditId', 'revision', 'independentReviewer', 'findings'])
  const findings = list(item.findings, 'requirements.findings').map((entry, index) => {
    const finding = record(entry, `requirements.findings[${index}]`, ['id', 'requiredScopes'])
    const requiredScopes = list(finding.requiredScopes, `requirements.findings[${index}].requiredScopes`)
      .map((scope, scopeIndex) => oneOf(scope, `requirements.findings[${index}].requiredScopes[${scopeIndex}]`, AUDIT_SCOPES))
    if (requiredScopes.length === 0) throw new Error(`requirements.findings[${index}] needs a required scope`)
    return { id: string(finding.id, `requirements.findings[${index}].id`), requiredScopes }
  })
  if (findings.length === 0) throw new Error('requirements.findings needs a finding')
  return { schemaVersion: version(item.schemaVersion, 'requirements.schemaVersion'),
    auditId: string(item.auditId, 'requirements.auditId'), revision: string(item.revision, 'requirements.revision'),
    independentReviewer: string(item.independentReviewer, 'requirements.independentReviewer'), findings }
}

function parseDecisions(value: unknown): AuditDecisions {
  const item = record(value, 'decisions', ['schemaVersion', 'auditId', 'parentAgentId', 'revision',
    'sessionId', 'sessionSha256', 'decisions'])
  const decisions = list(item.decisions, 'decisions.decisions').map((entry, index): AuditDecision => {
    const path = `decisions.decisions[${index}]`
    const decision = record(entry, path, ['id', 'status', 'rationale', 'evidenceIds', 'adjudications'])
    return {
      id: string(decision.id, `${path}.id`),
      status: oneOf(decision.status, `${path}.status`, ['RESOLVED', 'OPEN', 'PENDING']),
      rationale: string(decision.rationale, `${path}.rationale`),
      evidenceIds: list(decision.evidenceIds, `${path}.evidenceIds`).map((id, idIndex) => string(id, `${path}.evidenceIds[${idIndex}]`)),
      adjudications: list(decision.adjudications, `${path}.adjudications`).map((entry, adjudicationIndex): AuditAdjudication => {
        const location = `${path}.adjudications[${adjudicationIndex}]`
        const adjudication = record(entry, location, ['scope', 'rationale', 'evidence'])
        return { scope: oneOf(adjudication.scope, `${location}.scope`, AUDIT_SCOPES),
          rationale: string(adjudication.rationale, `${location}.rationale`),
          evidence: parseEvidence(adjudication.evidence, `${location}.evidence`) }
      }),
    }
  })
  const parsed: AuditDecisions = { schemaVersion: version(item.schemaVersion, 'decisions.schemaVersion'),
    auditId: string(item.auditId, 'decisions.auditId'), parentAgentId: string(item.parentAgentId, 'decisions.parentAgentId'),
    revision: string(item.revision, 'decisions.revision'),
    ...item.sessionId === undefined ? {} : { sessionId: string(item.sessionId, 'decisions.sessionId') },
    ...item.sessionSha256 === undefined ? {} : { sessionSha256: string(item.sessionSha256, 'decisions.sessionSha256') },
    decisions }
  if (parsed.sessionSha256 && !/^[0-9a-f]{64}$/.test(parsed.sessionSha256)) {
    throw new Error('decisions.sessionSha256 must be SHA-256')
  }
  return parsed
}

/** Parse untrusted report JSON into a versioned, internally consistent record. */
export const reportSchema = { parse: parseReport }
/** Parse untrusted parent requirements JSON. */
export const requirementsSchema = { parse: parseRequirements }
/** Parse untrusted parent decisions JSON. */
export const decisionsSchema = { parse: parseDecisions }
