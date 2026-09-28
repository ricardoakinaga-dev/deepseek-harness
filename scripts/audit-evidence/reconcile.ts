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
  requireClosed: boolean
} {
  const parsed = { requirements: '', reports: [] as string[], decisions: '', output: undefined as string | undefined, requireClosed: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--require-closed') { parsed.requireClosed = true; continue }
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

/**
 * Run the file-backed reconciliation command without changing source reports.
 * @param argv - CLI arguments after the script name.
 * @returns Process exit status: 0 valid, 1 pending when required closed, 2 invalid input.
 */
export function runReconciliation(argv: string[]): number {
  try {
    const args = parseArgs(argv)
    const output = args.output
    if (output && [args.requirements, args.decisions, ...args.reports].some(path => resolve(path) === resolve(output))) {
      throw new Error('--output must differ from every input file')
    }
    const requirements = requirementsSchema.parse(readJson(args.requirements))
    const reports = args.reports.map(path => reportSchema.parse(readJson(path)))
    const decisions = decisionsSchema.parse(readJson(args.decisions))
    const result = reconcileAudit(requirements, reports, decisions)
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (args.output) writeFileSync(args.output, serialized)
    else process.stdout.write(serialized)
    if (!result.valid) return 2
    return args.requireClosed && result.totals.pending > 0 ? 1 : 0
  } catch (error) {
    process.stderr.write(`audit-evidence: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runReconciliation(process.argv.slice(2))
}
