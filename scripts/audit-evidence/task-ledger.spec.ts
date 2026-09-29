import { describe, expect, it } from 'vitest'
import { validateTaskLedger } from './task-ledger.ts'

const candidate = 'a'.repeat(64)
const requiredIds = Array.from({ length: 20 }, (_, index) => `RA29-${String(index + 1).padStart(2, '0')}`)
const requirements = { schemaVersion: 1, objective: 'Implement all 20 improvements', requiredIds,
  liveRequiredIds: ['RA29-03'] }

function accepted() {
  return { schemaVersion: 1, objective: requirements.objective, candidate, requiredIds: [...requiredIds],
    items: requiredIds.map(id => ({ id, state: 'ACCEPTED', liveRequired: id === 'RA29-03', limitation: null as string | null,
      evidence: [{ scope: 'local', candidate, command: 'make validate', exitCode: 0 as number | null,
        outcome: 'PASS', reference: `checks/${id}.json` },
      ...id === 'RA29-03' ? [{ scope: 'live', candidate, command: 'make postgres-runtime', exitCode: 0,
        outcome: 'PASS', reference: `checks/${id}-live.json` }] : []] })) }
}

describe('task delivery ledger', () => {
  it('accepts the reviewed 20-ID scope with candidate-bound local and live checks', () => {
    expect(validateTaskLedger(accepted(), requirements)).toMatchObject({ valid: true, complete: true, accepted: 20, total: 20 })
  })

  it('keeps a pending ID open even when the other 19 have passing checks', () => {
    const ledger = accepted()
    ledger.items[19]!.state = 'PENDING'
    expect(validateTaskLedger(ledger, requirements)).toMatchObject({ valid: true, complete: false, accepted: 19, total: 20 })
  })

  it('rejects an omitted ID even when the model narrows its own required list', () => {
    const ledger = accepted()
    ledger.items.pop()
    ledger.requiredIds.pop()
    expect(validateTaskLedger(ledger, requirements).errors).toContain('RA29-20: required ID was removed from ledger')
  })

  it('rejects a passing claim for an unexecuted or different-candidate check', () => {
    const ledger = accepted()
    ledger.items[0]!.evidence[0]!.exitCode = null
    ledger.items[1]!.evidence[0]!.candidate = 'b'.repeat(64)
    const result = validateTaskLedger(ledger, requirements)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('RA29-01.evidence[0]: PASS requires exitCode 0')
    expect(result.errors).toContain('RA29-02.evidence[0]: candidate fingerprint differs from ledger')
  })

  it('rejects a locally verified live requirement and a partial browser matrix', () => {
    const ledger = accepted()
    ledger.items[2]!.evidence.pop()
    ledger.items[6]!.state = 'LOCAL_VERIFIED'
    ledger.items[6]!.limitation = '319 of 321 browser cases passed'
    const result = validateTaskLedger(ledger, requirements)
    expect(result.complete).toBe(false)
    expect(result.errors).toContain('RA29-03: ACCEPTED requires a live PASS bound to this candidate')
  })

  it('returns distinct complete, partial, and invalid exit codes through the public command', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-task-ledger-'))
    const requirementsPath = join(directory, 'requirements.json')
    const ledgerPath = join(directory, 'ledger.json')
    try {
      writeFileSync(requirementsPath, JSON.stringify(requirements))
      const run = (ledger: ReturnType<typeof accepted>) => {
        writeFileSync(ledgerPath, JSON.stringify(ledger))
        return spawnSync(process.execPath, ['--import', 'tsx/esm', resolve('scripts/audit-evidence/task-ledger.ts'),
          requirementsPath, ledgerPath, '--require-complete'], { cwd: resolve('.'), encoding: 'utf8' })
      }
      expect(run(accepted()).status).toBe(0)
      const partial = accepted()
      partial.items[19]!.state = 'PENDING'
      expect(run(partial).status).toBe(1)
      const narrowed = accepted()
      narrowed.items.pop()
      narrowed.requiredIds.pop()
      const rejected = run(narrowed)
      expect(rejected.status).toBe(2)
      expect(rejected.stdout).toContain('RA29-20: required ID was removed from ledger')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
