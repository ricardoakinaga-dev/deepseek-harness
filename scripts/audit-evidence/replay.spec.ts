/** The reconciler's public CLI persists JSON; it does not create a Session or emit Session events. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AuditDecisions, AuditEvidence, AuditReport, AuditRequirements } from './contracts.ts'
import type { ReconciliationResult } from './reconcile.ts'

const cli = fileURLToPath(new URL('./reconcile.ts', import.meta.url))
const sessionEvents = fileURLToPath(new URL(
  '../../snapshots/session/audit-evidence-reconciliation/events.test.mjs',
  import.meta.url,
))
const revision = '0123456789abcdef'
const observedAt = '2026-09-28T12:00:00Z'

function evidence(id: string, outcome: AuditEvidence['outcome']): AuditEvidence {
  return { id, kind: 'source-read', outcome, reference: `src/${id}.ts:1`, observedAt, revision }
}

async function writeJson(path: string, value: object): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function runCli(args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(name)))
  const result = spawnSync('pnpm', ['exec', 'tsx', cli, ...args], { encoding: 'utf8', env, timeout: 60_000 })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  return result
}

describe('audit evidence through the public reconciliation CLI', () => {
  it('persists both disputed findings as pending and refuses an unsupported parent closure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-audit-replay-'))
    try {
      const requirements: AuditRequirements = {
        schemaVersion: 1, auditId: 'audit-keyless', revision, independentReviewer: 'infra',
        findings: [
          { id: 'A24-03', requiredScopes: ['source', 'test'] },
          { id: 'A24-07', requiredScopes: ['source', 'dependency', 'external'] },
        ],
      }
      const positive: AuditReport = {
        schemaVersion: 1, auditId: 'audit-keyless', agentId: 'web', revision, observedAt,
        findings: [
          { id: 'A24-03', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'Code path present',
            evidence: [evidence('web-03-source', 'PASS')], limitations: [] },
          { id: 'A24-03', scope: 'test', status: 'UNVERIFIED', confidence: 'high', summary: 'Test source inspected only',
            evidence: [{ id: 'web-03-test-read', kind: 'test-run', outcome: 'NOT_RUN',
              reference: 'a24-03.test.ts', observedAt, revision }], limitations: ['No test command was executed'] },
          { id: 'A24-07', scope: 'source', status: 'OPEN', confidence: 'high', summary: 'Source path absent',
            evidence: [evidence('web-07-source', 'FAIL')], limitations: [] },
        ],
      }
      const negative: AuditReport = {
        schemaVersion: 1, auditId: 'audit-keyless', agentId: 'infra', revision, observedAt,
        findings: [
          { id: 'A24-03', scope: 'source', status: 'OPEN', confidence: 'high', summary: 'Code path incomplete',
            evidence: [evidence('infra-03-source', 'FAIL')], limitations: [] },
          { id: 'A24-03', scope: 'test', status: 'UNVERIFIED', confidence: 'high', summary: 'Test not executed',
            evidence: [{ id: 'infra-03-test', kind: 'test-run', outcome: 'NOT_RUN',
              reference: 'a24-03.test.ts', observedAt, revision }], limitations: ['No test command was executed'] },
          { id: 'A24-07', scope: 'source', status: 'RESOLVED', confidence: 'high', summary: 'Source path present',
            evidence: [evidence('infra-07-source', 'PASS')], limitations: [] },
          { id: 'A24-07', scope: 'dependency', status: 'UNVERIFIED', confidence: 'high',
            summary: 'Dependency source missing',
            evidence: [{ id: 'infra-07-dependency', kind: 'advisory-read', outcome: 'NOT_RUN',
              reference: 'a24-07.dependency.ts', observedAt, revision }],
            limitations: ['Dependency source is missing'] },
          { id: 'A24-07', scope: 'external', status: 'BLOCKED', confidence: 'high', summary: 'Provider check unavailable',
            evidence: [{ id: 'infra-07-external', kind: 'external-authority', outcome: 'BLOCKED',
              reference: 'provider credential unavailable', observedAt, revision }],
            limitations: ['No provider credential was available'] },
        ],
      }
      const decisions: AuditDecisions = {
        schemaVersion: 1, auditId: 'audit-keyless', parentAgentId: 'parent', revision,
        decisions: [
          { id: 'A24-03', status: 'PENDING', rationale: 'Parent inspected the disputed source; the test was only read',
            evidenceIds: ['parent-03-source'], adjudications: [{ scope: 'source',
              rationale: 'Direct inspection of the disputed source', evidence: evidence('parent-03-source', 'PASS') }] },
          { id: 'A24-07', status: 'PENDING', rationale: 'Source reports conflict, dependency source is missing, and credential is absent', evidenceIds: [], adjudications: [] },
        ],
      }
      const paths = {
        requirements: join(directory, 'requirements.json'),
        web: join(directory, 'web.json'),
        infra: join(directory, 'infra.json'),
        decisions: join(directory, 'decisions.json'),
        webSession: join(directory, 'web.session.v4.jsonl'),
        infraSession: join(directory, 'infra.session.v4.jsonl'),
        parentSession: join(directory, 'parent.session.v4.jsonl'),
        output: join(directory, 'result.json'),
      }
      const bindChildSession = async (report: AuditReport, agentId: string, path: string): Promise<void> => {
        const sessionId = `session-${agentId}`
        const bytes = `${JSON.stringify({ type: 'session', version: 4, id: sessionId, createdAt: 0,
          origin: 'subagent', parentSession: 'session-parent' })}\n`
        await writeFile(path, bytes)
        report.taskScope = `Inspect ${agentId} audit scopes`
        report.files = []
        report.sessionId = sessionId
        report.sessionSha256 = createHash('sha256').update(bytes).digest('hex')
      }
      const parentBytes = `${JSON.stringify({ type: 'session', version: 4, id: 'session-parent', createdAt: 0 })}\n`
      await Promise.all([
        bindChildSession(positive, 'web', paths.webSession),
        bindChildSession(negative, 'infra', paths.infraSession),
      ])
      await Promise.all([
        writeJson(paths.requirements, requirements), writeJson(paths.web, positive),
        writeJson(paths.infra, negative), writeJson(paths.decisions, decisions),
        writeFile(paths.parentSession, parentBytes),
      ])
      const args = ['--requirements', paths.requirements, '--reports', paths.web, paths.infra,
        '--decisions', paths.decisions, '--output', paths.output,
        '--session', `web=${paths.webSession}`, '--session', `infra=${paths.infraSession}`,
        '--session', `parent=${paths.parentSession}`]

      const pending = runCli([...args, '--require-closed'])
      expect(pending.status).toBe(1)
      expect(pending.stdout).toBe('')
      expect(pending.stderr).toBe('')
      const persisted = JSON.parse(await readFile(paths.output, 'utf8')) as ReconciliationResult
      expect(persisted).toMatchObject({ valid: true, errors: [],
        totals: { resolved: 0, open: 0, pending: 2, conflicts: 2 } })
      expect(persisted.findings.map(finding => [finding.id, finding.status, finding.recommendedStatus]))
        .toEqual([['A24-03', 'PENDING', 'PENDING'], ['A24-07', 'PENDING', 'PENDING']])
      expect(persisted.findings[0]?.scopes).toMatchObject([
        { scope: 'source', conflict: true, adjudicated: true, outcome: 'RESOLVED', evidenceIds: ['parent-03-source'], childStatuses: [
          { agentId: 'web', status: 'RESOLVED' }, { agentId: 'infra', status: 'OPEN' },
        ] },
        { scope: 'test', conflict: false, outcome: 'PENDING', evidenceIds: [], childStatuses: [
          { agentId: 'web', status: 'UNVERIFIED' }, { agentId: 'infra', status: 'UNVERIFIED' },
        ] },
      ])
      expect(persisted.findings[1]?.scopes).toMatchObject([
        { scope: 'source', conflict: true, outcome: 'PENDING', evidenceIds: [], childStatuses: [
          { agentId: 'web', status: 'OPEN' }, { agentId: 'infra', status: 'RESOLVED' },
        ] },
        { scope: 'dependency', outcome: 'PENDING', evidenceIds: [], childStatuses: [
          { agentId: 'infra', status: 'UNVERIFIED' },
        ] },
        { scope: 'external', outcome: 'PENDING', evidenceIds: [], childStatuses: [
          { agentId: 'infra', status: 'BLOCKED' },
        ] },
      ])
      const childEvidenceIds = new Set([positive, negative].flatMap(report =>
        report.findings.flatMap(finding => finding.evidence.map(item => item.id))))
      for (const finding of persisted.findings) {
        for (const scope of finding.scopes) {
          const parentEvidenceIds = decisions.decisions.find(decision => decision.id === finding.id)
            ?.adjudications.map(adjudication => adjudication.evidence.id) ?? []
          expect(scope.evidenceIds.every(id => childEvidenceIds.has(id) || parentEvidenceIds.includes(id))).toBe(true)
        }
      }
      expect(persisted.findings[0]?.scopes[0]?.evidenceIds).toEqual(decisions.decisions[0]?.evidenceIds)

      const optionalClosure = runCli(args)
      expect(optionalClosure.status).toBe(1)
      expect(JSON.parse(await readFile(paths.output, 'utf8'))).toEqual(persisted)

      decisions.decisions[0]!.status = 'RESOLVED'
      decisions.decisions[0]!.evidenceIds = ['parent-03-source', 'web-03-test-read']
      await writeJson(paths.decisions, decisions)
      const falseClosure = runCli([...args, '--require-closed'])
      expect(falseClosure.status).toBe(2)
      const rejected = JSON.parse(await readFile(paths.output, 'utf8')) as ReconciliationResult
      expect(rejected.valid).toBe(false)
      expect(rejected.errors).toContain('A24-03: parent RESOLVED conflicts with observed PENDING')
      expect(rejected.errors).toContain('A24-03:test: parent RESOLVED lacks supporting evidence id')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('audit evidence recorded Session', () => {
  it('checks the parent and child event relationship in the committed fixture', () => {
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(name)))
    const result = spawnSync(process.execPath, ['--test', sessionEvents], {
      encoding: 'utf8', env, timeout: 10_000,
    })
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })
})
