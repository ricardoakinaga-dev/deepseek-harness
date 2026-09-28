import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReconciliationResult } from './reconcile.ts'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function run(status: 'RESOLVED' | 'PENDING', testOutcome: 'PASS' | 'NOT_RUN', reviewerOmitsTest = false) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-audit-evidence-'))
  directories.push(directory)
  const revision = '0123456789abcdef'
  const observedAt = '2026-09-28T12:00:00Z'
  const requirements = { schemaVersion: 1, auditId: 'case', revision, independentReviewer: 'reviewer',
    findings: [{ id: 'A24-03', requiredScopes: reviewerOmitsTest ? ['source', 'test'] : ['test'] }] }
  const report = { schemaVersion: 1, auditId: 'case', agentId: 'web', revision, observedAt, findings: [{
    id: 'A24-03', scope: 'test', status: testOutcome === 'PASS' ? 'RESOLVED' : 'UNVERIFIED',
    confidence: testOutcome === 'PASS' ? 'high' : 'low',
    summary: 'retry path', evidence: [{ id: 'test-1', kind: 'test-run', outcome: testOutcome,
      reference: 'test-output.txt', observedAt, revision, command: 'pnpm test retry',
      ...(testOutcome === 'PASS' ? { exitCode: 0 } : {}) }],
    limitations: testOutcome === 'PASS' ? [] : ['test environment unavailable'],
  }] }
  if (reviewerOmitsTest) report.findings.unshift({ id: 'A24-03', scope: 'source', status: 'RESOLVED',
    confidence: 'high', summary: 'source passes', evidence: [{ id: 'source-1', kind: 'source-read', outcome: 'PASS',
      reference: 'source.ts:10', observedAt, revision, command: 'pnpm test retry', exitCode: 0 }], limitations: [] })
  const decisions = { schemaVersion: 1, auditId: 'case', parentAgentId: 'parent', revision,
    decisions: [{ id: 'A24-03', status, rationale: 'current evidence', evidenceIds: status === 'RESOLVED' ?
      (reviewerOmitsTest ? ['source-1', 'test-1'] : ['test-1']) : [], adjudications: [] }] }
  const reviewer = { ...report, agentId: 'reviewer', findings: report.findings.map(finding => ({ ...finding,
    evidence: finding.evidence.map(item => ({ ...item, id: `review-${item.id}` })) })) }
  if (reviewerOmitsTest) reviewer.findings = reviewer.findings.filter(finding => finding.scope === 'source')
  for (const [name, contents] of Object.entries({ requirements, report, reviewer, decisions })) {
    writeFileSync(join(directory, `${name}.json`), JSON.stringify(contents))
  }
  return spawnSync(process.execPath, [
    '--import', 'tsx/esm', resolve('scripts/audit-evidence/reconcile.ts'),
    '--requirements', join(directory, 'requirements.json'),
    '--reports', join(directory, 'report.json'),
    join(directory, 'reviewer.json'),
    '--decisions', join(directory, 'decisions.json'), '--require-closed',
  ], { cwd: resolve('.'), encoding: 'utf8' })
}

describe('reconciliation command', () => {
  it('publishes a resolved finding only after an executed passing check', () => {
    const result = run('RESOLVED', 'PASS')
    expect(result.status).toBe(0)
    expect((JSON.parse(result.stdout) as ReconciliationResult).totals.resolved).toBe(1)
  })

  it('returns a distinct pending status when the required test did not run', () => {
    const result = run('PENDING', 'NOT_RUN')
    expect(result.status).toBe(1)
    expect((JSON.parse(result.stdout) as ReconciliationResult).findings[0]?.recommendedStatus).toBe('PENDING')
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
