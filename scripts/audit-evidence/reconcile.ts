/** Reconcile delegated findings against parent completion requirements. */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  AUDIT_SCOPES,
  decisionsSchema,
  reportSchema,
  requirementsSchema,
  type AuditDecisions,
  type AuditReport,
  type AuditRequirements,
} from './contracts.ts'
import { aliasesInput } from './file-paths.ts'
import { verifyChildSession, type ChildSessionCheck } from './session-checks.ts'

type Scope = typeof AUDIT_SCOPES[number]
type Outcome = 'RESOLVED' | 'OPEN' | 'PENDING'

/** The retained child disagreement and the parent's direct observation, if any. */
export interface ScopeResult {
  scope: Scope
  outcome: Outcome
  childStatuses: Array<{ agentId: string; status: AuditReport['findings'][number]['status'] }>
  conflict: boolean
  adjudicated: boolean
  evidenceIds: string[]
}

/** One finding's mechanically checked parent disposition. */
export interface FindingResult {
  id: string
  status: Outcome
  recommendedStatus: Outcome
  scopes: ScopeResult[]
  conflict: boolean
}

/** A report that keeps pending work and every validation error visible. */
export interface ReconciliationResult {
  schemaVersion: 1
  auditId: string
  revision: string
  valid: boolean
  findings: FindingResult[]
  errors: string[]
  sessionChecks?: ChildSessionCheck[]
  totals: { resolved: number; open: number; pending: number; conflicts: number }
}

const evidenceKindForScope: Record<Scope, AuditReport['findings'][number]['evidence'][number]['kind']> = {
  source: 'source-read',
  test: 'test-run',
  dependency: 'advisory-read',
  runtime: 'runtime-observation',
  external: 'external-authority',
}

function completedEvidence(evidence: AuditReport['findings'][number]['evidence'][number], outcome: 'PASS' | 'FAIL'): boolean {
  return evidence.outcome === outcome && (evidence.kind !== 'test-run' || (
    Boolean(evidence.command) && typeof evidence.exitCode === 'number' &&
    (outcome === 'PASS' ? evidence.exitCode === 0 : evidence.exitCode !== 0)
  ))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/**
 * Reconcile reports from one revision, requiring a parent observation to settle child disagreements.
 * @param requirements - Scopes the parent declared necessary before child execution.
 * @param reports - Parsed child reports from the same audit candidate.
 * @param decisions - The parent's written dispositions and direct adjudications.
 * @returns Validated findings, retained conflicts, and diagnostics.
 */
export function reconcileAudit(
  requirements: AuditRequirements,
  reports: AuditReport[],
  decisions: AuditDecisions,
): ReconciliationResult {
  const errors: string[] = []
  if (reports.length < 2) errors.push('a builder report and an independent reviewer report are required')
  if (!reports.some(report => report.agentId === requirements.independentReviewer)) {
    errors.push(`missing independent reviewer report ${requirements.independentReviewer}`)
  }
  if (!reports.some(report => report.agentId !== requirements.independentReviewer)) {
    errors.push('missing builder report distinct from the independent reviewer')
  }
  if (requirements.independentReviewer === decisions.parentAgentId) {
    errors.push('independent reviewer must differ from parent agent')
  }
  if (reports.some(report => report.agentId === decisions.parentAgentId)) {
    errors.push('parent agent cannot submit a child report')
  }
  if (decisions.auditId !== requirements.auditId || decisions.revision !== requirements.revision) {
    errors.push('parent decisions identify a different audit or revision')
  }
  const agentIds = new Set<string>()
  const evidenceOwners = new Map<string, string>()
  const declaredIds = new Set<string>()
  const requiredScopesById = new Map<string, ReadonlySet<Scope>>()
  const decisionIds = new Set<string>()
  for (const [index, requirement] of requirements.findings.entries()) {
    if (declaredIds.has(requirement.id)) errors.push(`duplicate requirement ${requirement.id}`)
    declaredIds.add(requirement.id)
    requiredScopesById.set(requirement.id, new Set(requirement.requiredScopes))
    if (unique(requirement.requiredScopes).length !== requirement.requiredScopes.length) {
      errors.push(`duplicate required scope for ${requirement.id} at index ${index}`)
    }
  }
  const reviewer = reports.find(report => report.agentId === requirements.independentReviewer)
  for (const requirement of requirements.findings) {
    if (reviewer) {
      if (!reviewer.findings.some(finding => finding.id === requirement.id)) {
        errors.push(`independent reviewer omitted finding ${requirement.id}`)
      } else {
        for (const scope of requirement.requiredScopes) {
          if (!reviewer.findings.some(finding => finding.id === requirement.id && finding.scope === scope)) {
            errors.push(`independent reviewer omitted scope ${requirement.id}:${scope}`)
          }
        }
      }
    }
  }
  for (const report of reports) {
    if (report.auditId !== requirements.auditId || report.revision !== requirements.revision) {
      errors.push(`report ${report.agentId} identifies a different audit or revision`)
    }
    if (agentIds.has(report.agentId)) errors.push(`duplicate report agent ${report.agentId}`)
    agentIds.add(report.agentId)
    for (const finding of report.findings) {
      if (!declaredIds.has(finding.id)) errors.push(`untracked finding ${finding.id} from ${report.agentId}`)
      else if (!requiredScopesById.get(finding.id)?.has(finding.scope)) {
        errors.push(`undeclared reported scope ${finding.id}:${finding.scope} from ${report.agentId}`)
      }
      for (const evidence of finding.evidence) {
        if (evidenceOwners.has(evidence.id)) errors.push(`duplicate evidence id ${evidence.id}`)
        evidenceOwners.set(evidence.id, finding.id)
      }
    }
  }
  for (const decision of decisions.decisions) {
    if (decisionIds.has(decision.id)) errors.push(`duplicate parent decision ${decision.id}`)
    decisionIds.add(decision.id)
    if (!declaredIds.has(decision.id)) errors.push(`parent decision for untracked finding ${decision.id}`)
    for (const evidence of decision.adjudications.map(item => item.evidence)) {
      if (evidence.revision !== requirements.revision) errors.push(`parent evidence ${evidence.id} has a different revision`)
      if (evidenceOwners.has(evidence.id)) errors.push(`duplicate evidence id ${evidence.id}`)
      evidenceOwners.set(evidence.id, decision.id)
    }
  }

  const findings: FindingResult[] = []
  for (const requirement of requirements.findings) {
    const decision = decisions.decisions.find(item => item.id === requirement.id)
    if (!decision) errors.push(`missing parent decision ${requirement.id}`)
    const scopes: ScopeResult[] = []
    for (const scope of requirement.requiredScopes) {
      const childFindings = reports.flatMap(report => report.findings
        .filter(finding => finding.id === requirement.id && finding.scope === scope)
        .map(finding => ({ agentId: report.agentId, finding })))
      const builderObserved = childFindings.some(item => item.agentId !== requirements.independentReviewer)
      const statuses = unique(childFindings.map(item => item.finding.status))
      const conflict = statuses.length > 1
      const adjudications = decision?.adjudications.filter(item => item.scope === scope) ?? []
      if (adjudications.length > 1) errors.push(`multiple parent adjudications for ${requirement.id}:${scope}`)
      const adjudication = adjudications[0]
      let outcome: Outcome = 'PENDING'
      let evidenceIds: string[] = []
      const agreedStatus = statuses[0]
      if (builderObserved && !conflict && (agreedStatus === 'RESOLVED' || agreedStatus === 'OPEN')) {
        outcome = agreedStatus
        const evidenceOutcome = outcome === 'RESOLVED' ? 'PASS' : 'FAIL'
        evidenceIds = childFindings.flatMap(item => item.finding.evidence
          .filter(evidence => evidence.kind === evidenceKindForScope[scope] && completedEvidence(evidence, evidenceOutcome))
          .map(evidence => evidence.id))
      }
      if (adjudication) {
        const evidence = adjudication.evidence
        if (evidence.kind !== evidenceKindForScope[scope]) {
          errors.push(`parent adjudication for ${requirement.id}:${scope} used ${evidence.kind}`)
        } else if (completedEvidence(evidence, 'PASS')) {
          outcome = 'RESOLVED'
          evidenceIds = [evidence.id]
        } else if (completedEvidence(evidence, 'FAIL')) {
          outcome = 'OPEN'
          evidenceIds = [evidence.id]
        } else {
          outcome = 'PENDING'
          evidenceIds = []
        }
      }
      scopes.push({
        scope, outcome,
        childStatuses: childFindings.map(item => ({ agentId: item.agentId, status: item.finding.status })),
        conflict,
        adjudicated: Boolean(adjudication),
        evidenceIds,
      })
    }
    const recommendedStatus: Outcome = scopes.some(item => item.outcome === 'PENDING')
      ? 'PENDING'
      : scopes.some(item => item.outcome === 'OPEN') ? 'OPEN' : 'RESOLVED'
    const status = decision?.status ?? 'PENDING'
    if (decision && status !== 'PENDING' && status !== recommendedStatus) {
      errors.push(`${requirement.id}: parent ${status} conflicts with observed ${recommendedStatus}`)
    }
    if (decision) {
      for (const adjudication of decision.adjudications) {
        if (!requirement.requiredScopes.includes(adjudication.scope)) {
          errors.push(`${requirement.id}: parent adjudicated undeclared scope ${adjudication.scope}`)
        }
      }
      const allowedEvidence = new Set(scopes.flatMap(item => item.evidenceIds))
      for (const evidenceId of decision.evidenceIds) {
        if (evidenceOwners.get(evidenceId) !== requirement.id) errors.push(`${requirement.id}: unknown evidence ${evidenceId}`)
      }
      if (status !== 'PENDING') {
        const selected = new Set(decision.evidenceIds)
        const requiredScopes = status === 'RESOLVED' ? scopes : scopes.filter(item => item.outcome === 'OPEN')
        for (const scopeResult of requiredScopes) {
          if (!scopeResult.evidenceIds.some(id => selected.has(id) && allowedEvidence.has(id))) {
            errors.push(`${requirement.id}:${scopeResult.scope}: parent ${status} lacks supporting evidence id`)
          }
        }
      }
    }
    findings.push({ id: requirement.id, status, recommendedStatus, scopes, conflict: scopes.some(item => item.conflict) })
  }
  return {
    schemaVersion: 1,
    auditId: requirements.auditId,
    revision: requirements.revision,
    valid: errors.length === 0,
    findings,
    errors,
    totals: {
      resolved: findings.filter(item => item.status === 'RESOLVED').length,
      open: findings.filter(item => item.status === 'OPEN').length,
      pending: findings.filter(item => item.status === 'PENDING').length,
      conflicts: findings.filter(item => item.conflict).length,
    },
  }
}

function parseArgs(argv: string[]): {
  requirements: string
  reports: string[]
  decisions: string
  output: string | undefined
  sessions: Map<string, string>
} {
  const parsed = { requirements: '', reports: [] as string[], decisions: '', output: undefined as string | undefined,
    sessions: new Map<string, string>() }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--require-closed') continue
    if (flag === '--reports') {
      while (true) {
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) break
        parsed.reports.push(next)
        index++
      }
      continue
    }
    const value = argv[++index]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a path`)
    if (flag === '--requirements') parsed.requirements = value
    else if (flag === '--report') parsed.reports.push(value)
    else if (flag === '--decisions') parsed.decisions = value
    else if (flag === '--output') parsed.output = value
    else if (flag === '--session') {
      const separator = value.indexOf('=')
      if (separator < 1 || separator === value.length - 1) throw new Error('--session requires AGENT_ID=PATH')
      const agentId = value.slice(0, separator)
      if (parsed.sessions.has(agentId)) throw new Error(`duplicate Session for ${agentId}`)
      parsed.sessions.set(agentId, value.slice(separator + 1))
    }
    else throw new Error(`unknown option ${flag}`)
  }
  if (!parsed.requirements || !parsed.decisions || parsed.reports.length === 0) {
    throw new Error('usage: reconcile.ts --requirements FILE --reports FILE... --decisions FILE [--output FILE] [--require-closed]')
  }
  return parsed
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Demote resolved evidence after verification errors and keep finding totals consistent. */
function demoteUnverifiedScopes(result: ReconciliationResult): void {
  for (const finding of result.findings) {
    for (const scope of finding.scopes) {
      if (scope.outcome === 'RESOLVED') scope.outcome = 'PENDING'
    }
    finding.recommendedStatus = finding.scopes.some(scope => scope.outcome === 'PENDING') ? 'PENDING'
      : finding.scopes.some(scope => scope.outcome === 'OPEN') ? 'OPEN' : 'RESOLVED'
    if (finding.status === 'RESOLVED' || finding.recommendedStatus === 'PENDING') finding.status = 'PENDING'
  }
  result.totals = {
    resolved: result.findings.filter(finding => finding.status === 'RESOLVED').length,
    open: result.findings.filter(finding => finding.status === 'OPEN').length,
    pending: result.findings.filter(finding => finding.status === 'PENDING').length,
    conflicts: result.findings.filter(finding => finding.conflict).length,
  }
}

/**
 * Verify every child report against one distinct raw Session generation.
 * @param result - Reconciliation to update with Session errors and open dispositions.
 * @param reports - Parsed child reports.
 * @param sessions - Raw Session paths keyed by report agent ID.
 * @param decisions - Parent observations and the identity binding for parent Session verification.
 */
export function attachSessionChecks(result: ReconciliationResult, reports: AuditReport[], sessions: ReadonlyMap<string, string>,
  decisions: AuditDecisions): void {
  result.sessionChecks = []
  const observedSessions = new Set<string>()
  const expectedAgents = new Set(reports.map(report => report.agentId))
  for (const report of reports) {
    if (!report.taskScope || !report.files || !report.sessionId || !report.sessionSha256) {
      result.errors.push(`${report.agentId}: Session verification requires taskScope, files, sessionId, and sessionSha256`)
    }
    const sessionPath = sessions.get(report.agentId)
    if (sessionPath === undefined) {
      result.errors.push(`missing Session log for ${report.agentId}`)
      continue
    }
    const check = verifyChildSession(report, sessionPath, 'child')
    result.sessionChecks.push(check)
    result.errors.push(...check.errors)
    if (observedSessions.has(check.sessionId)) result.errors.push(`${report.agentId}: Session ID is reused by another child report`)
    observedSessions.add(check.sessionId)
  }
  const adjudications = decisions.decisions.flatMap(decision => decision.adjudications)
    .filter(item => item.evidence.kind === 'test-run' &&
      (item.evidence.outcome === 'PASS' || item.evidence.outcome === 'FAIL'))
  const parentRequired = adjudications.length > 0 || result.findings.some(finding =>
    finding.scopes.some(scope => scope.outcome === 'RESOLVED'))
  if (parentRequired) expectedAgents.add(decisions.parentAgentId)
  const parentSessionPath = sessions.get(decisions.parentAgentId)
  if (parentRequired && parentSessionPath === undefined) {
    result.errors.push(`missing Session log for ${decisions.parentAgentId}`)
  }
  if (adjudications.length > 0 && (!decisions.sessionId || !decisions.sessionSha256)) {
    result.errors.push(`${decisions.parentAgentId}: parent test adjudication requires sessionId and sessionSha256`)
  }
  if (parentSessionPath !== undefined) {
    expectedAgents.add(decisions.parentAgentId)
    const findings: AuditReport['findings'] = adjudications.map(item => ({
      id: item.evidence.id, scope: item.scope,
      status: item.evidence.outcome === 'PASS' ? 'RESOLVED' : 'OPEN',
      confidence: 'high', summary: item.rationale, evidence: [item.evidence], limitations: [],
    }))
    const check = verifyChildSession({ agentId: decisions.parentAgentId,
      ...decisions.sessionId === undefined ? {} : { sessionId: decisions.sessionId },
      ...decisions.sessionSha256 === undefined ? {} : { sessionSha256: decisions.sessionSha256 },
      findings }, parentSessionPath, 'parent')
    result.sessionChecks.push(check)
    result.errors.push(...check.errors)
    for (const child of result.sessionChecks.filter(item => item.role === 'child')) {
      if (child.parentSessionId !== check.sessionId) {
        result.errors.push(`${child.agentId}: parent Session ID differs from child-declared parent lineage`)
      }
    }
    if (observedSessions.has(check.sessionId)) {
      result.errors.push(`${decisions.parentAgentId}: Session ID is reused by another report`)
    }
    observedSessions.add(check.sessionId)
  }
  for (const agentId of sessions.keys()) {
    if (!expectedAgents.has(agentId)) result.errors.push(`Session log has no report or test adjudication for ${agentId}`)
  }
  result.valid = result.errors.length === 0
  if (!result.valid) demoteUnverifiedScopes(result)
}

/**
 * Run the file-backed reconciliation command without changing source reports.
 * @param argv - CLI arguments after the script name.
 * @returns Process exit status: 0 closed, 1 open or pending, 2 invalid input.
 */
export function runReconciliation(argv: string[]): number {
  try {
    const args = parseArgs(argv)
    const output = args.output
    if (output && [args.requirements, args.decisions, ...args.reports, ...args.sessions.values()]
      .some(path => aliasesInput(output, path))) {
      throw new Error('--output must differ from every input file')
    }
    const requirements = requirementsSchema.parse(readJson(args.requirements))
    const reports = args.reports.map(path => reportSchema.parse(readJson(path)))
    const decisions = decisionsSchema.parse(readJson(args.decisions))
    const result = reconcileAudit(requirements, reports, decisions)
    const executedTests = reports.some(report => report.findings.some(finding => finding.evidence.some(evidence =>
      evidence.kind === 'test-run' && (evidence.outcome === 'PASS' || evidence.outcome === 'FAIL')))) ||
      decisions.decisions.some(decision => decision.adjudications.some(item => item.evidence.kind === 'test-run' &&
        (item.evidence.outcome === 'PASS' || item.evidence.outcome === 'FAIL')))
    const resolvedScopes = result.findings.some(finding => finding.scopes.some(scope => scope.outcome === 'RESOLVED'))
    if (args.sessions.size === 0 && (resolvedScopes || executedTests)) {
      result.errors.push('Session verification NOT_RUN for resolved claims or executed tests; provide --session for every child report')
    }
    if (args.sessions.size > 0) {
      attachSessionChecks(result, reports, args.sessions, decisions)
    }
    result.valid = result.errors.length === 0
    if (!result.valid && args.sessions.size === 0) demoteUnverifiedScopes(result)
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (args.output) writeFileSync(args.output, serialized)
    else process.stdout.write(serialized)
    if (!result.valid) return 2
    return result.totals.pending > 0 || result.totals.open > 0 ? 1 : 0
  } catch (error) {
    process.stderr.write(`audit-evidence: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runReconciliation(process.argv.slice(2))
}
