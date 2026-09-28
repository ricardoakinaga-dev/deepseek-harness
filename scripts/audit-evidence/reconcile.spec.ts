import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decisionsSchema, reportSchema, requirementsSchema } from './contracts.ts'
import { reconcileAudit } from './reconcile.ts'

const revision = '0123456789abcdef'
const observedAt = '2026-09-28T12:00:00Z'

function evidence(id: string, kind: 'source-read' | 'test-run' | 'advisory-read' | 'runtime-observation', outcome: 'PASS' | 'FAIL') {
  return { id, kind, outcome, reference: `${id}:10`, observedAt, revision,
    ...(kind === 'test-run' ? { command: 'pnpm test focused', exitCode: outcome === 'PASS' ? 0 : 1 } : {}) }
}

function requirements(scopes: Array<'source' | 'test' | 'dependency' | 'runtime'> = ['source', 'test']) {
  return requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
    independentReviewer: 'rag',
    findings: [{ id: 'A24-03', requiredScopes: scopes }] })
}

function report(agentId: string, findings: Array<Record<string, unknown>>) {
  return reportSchema.parse({ schemaVersion: 1, auditId: 'audit-1', agentId, revision, observedAt, findings })
}

function decisions(status: 'RESOLVED' | 'OPEN' | 'PENDING', evidenceIds: string[], adjudications: Array<Record<string, unknown>> = []) {
  return decisionsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
    decisions: [{ id: 'A24-03', status, rationale: 'Inspeção registrada', evidenceIds, adjudications }] })
}

describe('delegated audit reconciliation', () => {
  it('accepts current source and an executed successful test for the same finding', () => {
    const child = report('web', [
      { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'upload corrigido', evidence: [evidence('web-src', 'source-read', 'PASS')], limitations: [] },
      { id: 'A24-03', scope: 'test', status: 'RESOLVED', confidence: 'high', summary: 'retry aprovado', evidence: [evidence('web-test', 'test-run', 'PASS')], limitations: [] },
    ])
    const reviewer = report('rag', [
      { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'upload corrigido',
        evidence: [evidence('rag-src', 'source-read', 'PASS')], limitations: [] },
      { id: 'A24-03', scope: 'test', status: 'RESOLVED', confidence: 'high', summary: 'retry aprovado',
        evidence: [evidence('rag-test', 'test-run', 'PASS')], limitations: [] },
    ])
    const result = reconcileAudit(requirements(), [child, reviewer], decisions('RESOLVED', ['web-src', 'web-test']))
    expect(result.valid).toBe(true)
    expect(result.findings[0]!.status).toBe('RESOLVED')
    expect(result.totals).toEqual({ resolved: 1, open: 0, pending: 0, conflicts: 0 })
  })

  it('keeps A24-07 pending when children disagree and runtime evidence is absent', () => {
    const positive = report('infra', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'code path', evidence: [evidence('infra-src', 'source-read', 'PASS')], limitations: [] }])
    const negative = report('rag', [
      { id: 'A24-03', scope: 'source', status: 'OPEN', confidence: 'high', summary: 'missing upgrade path', evidence: [evidence('rag-src', 'source-read', 'FAIL')], limitations: [] },
      { id: 'A24-03', scope: 'runtime', status: 'UNVERIFIED', confidence: 'low', summary: 'runtime not observed', evidence: [], limitations: ['No runtime observation'] },
    ])
    const pending = reconcileAudit(requirements(['source', 'runtime']), [positive, negative], decisions('PENDING', []))
    expect(pending.valid).toBe(true)
    expect(pending.findings[0]!.conflict).toBe(true)
    expect(pending.findings[0]!.recommendedStatus).toBe('PENDING')
    const falsePass = reconcileAudit(requirements(['source', 'runtime']), [positive, negative], decisions('RESOLVED', ['infra-src']))
    expect(falsePass.valid).toBe(false)
    expect(falsePass.errors).toContain('A24-03: parent RESOLVED conflicts with observed PENDING')
  })

  it('accepts an explicit parent reinspection of disputed source and missing runtime', () => {
    const positive = report('infra', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'code path', evidence: [evidence('infra-src', 'source-read', 'PASS')], limitations: [] }])
    const negative = report('rag', [
      { id: 'A24-03', scope: 'source', status: 'OPEN', confidence: 'high', summary: 'old finding', evidence: [evidence('rag-src', 'source-read', 'FAIL')], limitations: [] },
      { id: 'A24-03', scope: 'runtime', status: 'UNVERIFIED', confidence: 'low', summary: 'runtime not observed', evidence: [], limitations: ['No runtime observation'] },
    ])
    const parent = decisions('RESOLVED', ['parent-src', 'parent-runtime'], [
      { scope: 'source', rationale: 'reran inspection at same revision', evidence: evidence('parent-src', 'source-read', 'PASS') },
      { scope: 'runtime', rationale: 'observed upgrade on disposable database', evidence: evidence('parent-runtime', 'runtime-observation', 'PASS') },
    ])
    const result = reconcileAudit(requirements(['source', 'runtime']), [positive, negative], parent)
    expect(result.valid).toBe(true)
    expect(result.findings[0]!.scopes[0]!.adjudicated).toBe(true)
    expect(result.findings[0]!.conflict).toBe(true)
  })

  it('rejects a dependency conclusion without an advisory that was actually read', () => {
    expect(() => report('api', [{ id: 'A24-03', scope: 'dependency', status: 'RESOLVED', confidence: 'high', summary: 'CVE fixed',
      evidence: [{ id: 'search', kind: 'advisory-read', outcome: 'BLOCKED', reference: 'search unavailable', observedAt, revision }], limitations: [] }])).toThrow()
  })

  it('rejects a test described as successful without a command and zero exit status', () => {
    expect(() => report('web', [{ id: 'A24-03', scope: 'test', status: 'RESOLVED', confidence: 'high', summary: 'test file read',
      evidence: [{ id: 'read-test', kind: 'test-run', outcome: 'PASS', reference: 'test.spec.ts:10', observedAt, revision }], limitations: [] }])).toThrow()
  })

  it('rejects child evidence recorded for a different revision', () => {
    expect(() => report('web', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'stale',
      evidence: [{ ...evidence('old', 'source-read', 'PASS'), revision: 'old' }], limitations: [] }])).toThrow()
  })

  it('rejects a false closure that contains failed source evidence or hides a reported test scope', () => {
    expect(() => report('web', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high',
      summary: 'mixed evidence', evidence: [evidence('good', 'source-read', 'PASS'), evidence('bad', 'source-read', 'FAIL')],
      limitations: [] }])).toThrow('conflicting failed evidence')
    const builder = report('web', [
      { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'source passes',
        evidence: [evidence('web-src', 'source-read', 'PASS')], limitations: [] },
      { id: 'A24-03', scope: 'test', status: 'OPEN', confidence: 'high', summary: 'test fails',
        evidence: [evidence('web-test', 'test-run', 'FAIL')], limitations: [] },
    ])
    const reviewer = report('rag', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high',
      summary: 'source passes', evidence: [evidence('rag-src', 'source-read', 'PASS')], limitations: [] }])
    const result = reconcileAudit(requirements(['source']), [builder, reviewer], decisions('RESOLVED', ['web-src']))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('undeclared reported scope A24-03:test from web')
  })

  it('requires a distinct reviewer report covering the finding', () => {
    const builder = report('web', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high',
      summary: 'source', evidence: [evidence('web-src', 'source-read', 'PASS')], limitations: [] }])
    const absent = reconcileAudit(requirements(['source']), [builder], decisions('RESOLVED', ['web-src']))
    expect(absent.valid).toBe(false)
    expect(absent.errors).toContain('missing independent reviewer report rag')
    const empty = reconcileAudit(requirements(['source']), [builder, report('rag', [])], decisions('RESOLVED', ['web-src']))
    expect(empty.valid).toBe(false)
    expect(empty.errors).toContain('independent reviewer omitted finding A24-03')
    const selfReviewer = requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'parent', findings: [{ id: 'A24-03', requiredScopes: ['source'] }] })
    const selfReview = reconcileAudit(selfReviewer, [builder, report('parent', [{ id: 'A24-03', scope: 'source',
      status: 'RESOLVED', confidence: 'high', summary: 'source',
      evidence: [evidence('parent-src', 'source-read', 'PASS')], limitations: [] }])], decisions('RESOLVED', ['web-src']))
    expect(selfReview.valid).toBe(false)
    expect(selfReview.errors).toContain('independent reviewer must differ from parent agent')
  })

  it('rejects closure when the reviewer omits one required scope', () => {
    const builder = report('web', [
      { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'source passes', evidence: [evidence('web-src', 'source-read', 'PASS')], limitations: [] },
      { id: 'A24-03', scope: 'test', status: 'RESOLVED', confidence: 'high', summary: 'test passes', evidence: [evidence('web-test', 'test-run', 'PASS')], limitations: [] },
    ])
    const reviewer = report('rag', [
      { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'source passes', evidence: [evidence('rag-src', 'source-read', 'PASS')], limitations: [] },
    ])
    const result = reconcileAudit(requirements(), [builder, reviewer], decisions('RESOLVED', ['web-src', 'web-test']))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('independent reviewer omitted scope A24-03:test')
  })

  it('keeps a reviewer-only passing scope pending without a builder or parent observation', () => {
    const builder = report('web', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high',
      summary: 'source passes', evidence: [evidence('web-src', 'source-read', 'PASS')], limitations: [] }])
    const reviewer = report('rag', [
      { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'source passes',
        evidence: [evidence('rag-src', 'source-read', 'PASS')], limitations: [] },
      { id: 'A24-03', scope: 'test', status: 'RESOLVED', confidence: 'high', summary: 'test passes',
        evidence: [evidence('rag-test', 'test-run', 'PASS')], limitations: [] },
    ])
    const result = reconcileAudit(requirements(), [builder, reviewer], decisions('RESOLVED', ['web-src', 'rag-test']))
    expect(result.valid).toBe(false)
    expect(result.findings[0]?.scopes[1]?.outcome).toBe('PENDING')
    expect(result.errors).toContain('A24-03: parent RESOLVED conflicts with observed PENDING')
  })

  it('rejects a planted R27-02 false pass without changing the reviewed source', () => {
    const path = fileURLToPath(new URL('./fixtures/r27-02-csrf.ts.txt', import.meta.url))
    const before = createHash('sha256').update(readFileSync(path)).digest('hex')
    const reviewPath = fileURLToPath(new URL('./fixtures/r27-02-review.json', import.meta.url))
    const recordedReview = JSON.parse(readFileSync(reviewPath, 'utf8')) as {
      sourceSha256: string
      mutationSentinelBefore: string
      mutationSentinelAfter: string
      status: string
    }
    expect(recordedReview).toMatchObject({ sourceSha256: before, mutationSentinelBefore: before,
      mutationSentinelAfter: before, status: 'OPEN' })
    const recordPath = fileURLToPath(new URL('./fixtures/r27-02-review-session.json', import.meta.url))
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
      sourceSha256: string
      rawSessionSha256: string
      reviewerSessionId: string
      taskPromptCount: number
      inheritedAuditConversation: boolean
      priorAuditTurnCount: number
      toolCallCount: number
      sourceReadOutput: string
      sourceReadOutputSha256: string
      review: { findingId: string; scope: string; status: string; readOnly: boolean }
    }
    expect(record).toMatchObject({ sourceSha256: before, reviewerSessionId: '01a0e814-137d-77b2-92c1-6fd0891a883a',
      taskPromptCount: 1, inheritedAuditConversation: false, priorAuditTurnCount: 0, toolCallCount: 1,
      review: { findingId: 'R27-02', scope: 'source', status: 'OPEN', readOnly: true } })
    expect(record.rawSessionSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(createHash('sha256').update(record.sourceReadOutput).digest('hex'))
      .toBe(record.sourceReadOutputSha256)
    expect(record.sourceReadOutput).toContain('if (supplied && supplied !== request.session.csrfToken) return false')
    expect(record.sourceReadOutput).toContain('return true')
    const builder = report('web', [{ id: 'R27-02', scope: 'source', status: 'RESOLVED', confidence: 'high',
      summary: 'CSRF token enforced', evidence: [{ ...evidence('builder-source', 'source-read', 'PASS'),
        reference: 'fixtures/r27-02-csrf.ts.txt:7' }], limitations: [] }])
    const reviewer = report('rag', [{ id: 'R27-02', scope: 'source', status: 'OPEN', confidence: 'high',
      summary: 'missing header bypasses rejection', evidence: [{ ...evidence('review-source', 'source-read', 'FAIL'),
        reference: 'fixtures/r27-02-csrf.ts.txt:8' }], limitations: [] }])
    const required = requirementsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', revision,
      independentReviewer: 'rag', findings: [{ id: 'R27-02', requiredScopes: ['source'] }] })
    const parent = decisionsSchema.parse({ schemaVersion: 1, auditId: 'audit-1', parentAgentId: 'parent', revision,
      decisions: [{ id: 'R27-02', status: 'RESOLVED', rationale: 'builder claim', evidenceIds: ['builder-source'], adjudications: [] }] })
    const result = reconcileAudit(required, [builder, reviewer], parent)
    expect(result.valid).toBe(false)
    expect(result.findings[0]?.scopes[0]?.conflict).toBe(true)
    expect(result.errors).toContain('R27-02: parent RESOLVED conflicts with observed PENDING')
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before)
  })

  it('rejects an executed test with a contradictory exit code even in a pending finding', () => {
    expect(() => report('web', [{ id: 'A24-03', scope: 'test', status: 'UNVERIFIED', confidence: 'low',
      summary: 'test still pending', limitations: ['No successful test'], evidence: [{
        id: 'bad-test', kind: 'test-run', outcome: 'PASS', reference: 'test output', observedAt, revision,
        command: 'pnpm test focused', exitCode: 1,
      }] }])).toThrow('executed test requires a command and matching exit code')
  })

  it('requires explicit confidence and rejects evidence observed after report delivery', () => {
    expect(() => report('web', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED',
      summary: 'source', evidence: [evidence('src', 'source-read', 'PASS')], limitations: [] }])).toThrow('confidence')
    expect(() => report('web', [{ id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high',
      summary: 'source', evidence: [{ ...evidence('src', 'source-read', 'PASS'), observedAt: '2026-09-28T13:00:00Z' }],
      limitations: [] }])).toThrow('after report delivery')
  })
})
