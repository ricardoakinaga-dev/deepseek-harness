/** Validate complete, candidate-bound task delivery records before claiming closure. */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const STATES = ['PENDING', 'CODE_DONE', 'LOCAL_VERIFIED', 'LIVE_VERIFIED', 'BLOCKED_EXTERNAL', 'ACCEPTED'] as const
type State = typeof STATES[number]
type RecordValue = Record<string, unknown>

/** One immutable observation tied to the candidate used for a task decision. */
export interface TaskEvidence {
  readonly scope: 'local' | 'live'
  readonly candidate: string
  readonly command: string
  readonly exitCode: number | null
  readonly outcome: 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED'
  readonly reference: string
}

/** Status of one required ID; liveRequired is specified before accepting it. */
export interface TaskEntry {
  readonly id: string
  readonly state: State
  readonly liveRequired: boolean
  readonly evidence: readonly TaskEvidence[]
  readonly limitation: string | null
}

/** One exact set of required IDs and their candidate-bound outcomes. */
export interface TaskLedger {
  readonly schemaVersion: 1
  readonly objective: string
  readonly candidate: string
  readonly requiredIds: readonly string[]
  readonly items: readonly TaskEntry[]
}

/** Reviewed scope supplied separately from the agent-written delivery ledger. */
export interface TaskRequirements {
  readonly schemaVersion: 1
  readonly objective: string
  readonly candidate: string
  readonly requiredIds: readonly string[]
  readonly liveRequiredIds: readonly string[]
}

/** Machine-readable validation result. `complete` never follows a missing row. */
export interface TaskLedgerResult {
  readonly valid: boolean
  readonly complete: boolean
  readonly accepted: number
  readonly total: number
  readonly errors: readonly string[]
}

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function keys(value: RecordValue, allowed: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unsupported field`)
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Check every required row and reject unverified or cross-candidate acceptance. */
export function validateTaskLedger(value: unknown, requirements: unknown): TaskLedgerResult {
  const errors: string[] = []
  if (!record(value)) return { valid: false, complete: false, accepted: 0, total: 0, errors: ['ledger: expected object'] }
  if (!record(requirements)) return { valid: false, complete: false, accepted: 0, total: 0, errors: ['requirements: expected object'] }
  keys(requirements, ['schemaVersion', 'objective', 'candidate', 'requiredIds', 'liveRequiredIds'], 'requirements', errors)
  if (requirements['schemaVersion'] !== 1) errors.push('requirements.schemaVersion: expected 1')
  if (!nonempty(requirements['objective'])) errors.push('requirements.objective: required')
  if (value['objective'] !== requirements['objective']) errors.push('ledger.objective: differs from reviewed requirements')
  if (typeof requirements['candidate'] !== 'string' || !/^[0-9a-f]{64}$/.test(requirements['candidate'])) {
    errors.push('requirements.candidate: expected SHA-256 fingerprint')
  }
  if (value['candidate'] !== requirements['candidate']) errors.push('ledger.candidate: differs from reviewed requirements')
  const expected = requirements['requiredIds']
  if (!Array.isArray(expected) || expected.length === 0) errors.push('requirements.requiredIds: expected non-empty array')
  const expectedIds = new Set<string>(Array.isArray(expected) ? expected.filter(nonempty) : [])
  if (Array.isArray(expected) && expectedIds.size !== expected.length) errors.push('requirements.requiredIds: duplicate or invalid ID')
  const liveExpected = requirements['liveRequiredIds']
  if (!Array.isArray(liveExpected)) errors.push('requirements.liveRequiredIds: expected array')
  const liveIds = new Set<string>(Array.isArray(liveExpected) ? liveExpected.filter(nonempty) : [])
  if (Array.isArray(liveExpected) && liveIds.size !== liveExpected.length) errors.push('requirements.liveRequiredIds: duplicate or invalid ID')
  for (const id of liveIds) if (!expectedIds.has(id)) errors.push(`${id}: live requirement is not in requiredIds`)
  keys(value, ['schemaVersion', 'objective', 'candidate', 'requiredIds', 'items'], 'ledger', errors)
  if (value['schemaVersion'] !== 1) errors.push('ledger.schemaVersion: expected 1')
  if (!nonempty(value['objective'])) errors.push('ledger.objective: required')
  const candidate = value['candidate']
  if (typeof candidate !== 'string' || !/^[0-9a-f]{64}$/.test(candidate)) errors.push('ledger.candidate: expected SHA-256 fingerprint')
  const required = value['requiredIds']
  if (!Array.isArray(required) || required.length === 0) errors.push('ledger.requiredIds: expected non-empty array')
  const ids = new Set<string>()
  if (Array.isArray(required)) {
    for (const id of required) {
      if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9-]{1,63}$/.test(id)) errors.push('ledger.requiredIds: invalid ID')
      else if (ids.has(id)) errors.push(`${id}: duplicate required ID`)
      else ids.add(id)
    }
  }
  for (const id of expectedIds) if (!ids.has(id)) errors.push(`${id}: required ID was removed from ledger`)
  for (const id of ids) if (!expectedIds.has(id)) errors.push(`${id}: ID is absent from reviewed requirements`)
  const items = value['items']
  if (!Array.isArray(items)) errors.push('ledger.items: expected array')
  const seen = new Set<string>()
  let accepted = 0
  if (Array.isArray(items)) for (const [index, item] of items.entries()) {
    const path = `ledger.items[${index}]`
    if (!record(item)) { errors.push(`${path}: expected object`); continue }
    keys(item, ['id', 'state', 'liveRequired', 'evidence', 'limitation'], path, errors)
    const id = item['id']
    if (!nonempty(id)) { errors.push(`${path}.id: required`); continue }
    if (seen.has(id)) errors.push(`${id}: duplicate task row`)
    seen.add(id)
    if (!ids.has(id)) errors.push(`${id}: ID is not required by the objective`)
    const state = item['state']
    if (!STATES.includes(state as State)) errors.push(`${id}: invalid state`)
    if (typeof item['liveRequired'] !== 'boolean') errors.push(`${id}: liveRequired must be boolean`)
    else if (item['liveRequired'] !== liveIds.has(id)) errors.push(`${id}: liveRequired differs from reviewed requirements`)
    const evidence = item['evidence']
    if (!Array.isArray(evidence)) errors.push(`${id}: evidence must be an array`)
    if (item['limitation'] !== null && !nonempty(item['limitation'])) errors.push(`${id}: limitation must be text or null`)
    let localPass = false
    let livePass = false
    let validPass = false
    if (Array.isArray(evidence)) for (const [evidenceIndex, observation] of evidence.entries()) {
      const evidencePath = `${id}.evidence[${evidenceIndex}]`
      if (!record(observation)) { errors.push(`${evidencePath}: expected object`); continue }
      keys(observation, ['scope', 'candidate', 'command', 'exitCode', 'outcome', 'reference'], evidencePath, errors)
      if (!['local', 'live'].includes(observation['scope'] as string)) errors.push(`${evidencePath}: invalid scope`)
      if (observation['candidate'] !== candidate) errors.push(`${evidencePath}: candidate fingerprint differs from ledger`)
      if (!nonempty(observation['command'])) errors.push(`${evidencePath}: command required`)
      if (!nonempty(observation['reference'])) errors.push(`${evidencePath}: reference required`)
      const outcome = observation['outcome']
      if (!['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED'].includes(outcome as string)) errors.push(`${evidencePath}: invalid outcome`)
      const exitCode = observation['exitCode']
      if (outcome === 'PASS' && exitCode !== 0) errors.push(`${evidencePath}: PASS requires exitCode 0`)
      if (outcome !== 'PASS' && exitCode === 0) errors.push(`${evidencePath}: non-PASS cannot have exitCode 0`)
      if (exitCode !== null && (!Number.isSafeInteger(exitCode) || (exitCode as number) < 0)) errors.push(`${evidencePath}: invalid exitCode`)
      if (outcome === 'PASS' && exitCode === 0 && observation['candidate'] === candidate) {
        validPass = true
        if (observation['scope'] === 'live') livePass = true
        else localPass = true
      }
    }
    if (state === 'ACCEPTED') {
      accepted += 1
      if (!validPass || !localPass) errors.push(`${id}: ACCEPTED requires a local PASS bound to this candidate`)
      if (item['liveRequired'] === true && !livePass) errors.push(`${id}: ACCEPTED requires a live PASS bound to this candidate`)
      if (item['limitation'] !== null) errors.push(`${id}: ACCEPTED cannot retain a limitation`)
    }
    if (state === 'LIVE_VERIFIED' && !livePass) errors.push(`${id}: LIVE_VERIFIED requires a live PASS`)
    if (state === 'LOCAL_VERIFIED' && !localPass) errors.push(`${id}: LOCAL_VERIFIED requires a local PASS`)
    if (state === 'BLOCKED_EXTERNAL' && !nonempty(item['limitation'])) errors.push(`${id}: BLOCKED_EXTERNAL requires a limitation`)
  }
  for (const id of ids) if (!seen.has(id)) errors.push(`${id}: missing task row`)
  const total = ids.size
  return { valid: errors.length === 0, complete: errors.length === 0 && accepted === total,
    accepted, total, errors }
}

function main(argv: readonly string[]): number {
  const [requirementsPath, ledgerPath, mode] = argv
  if (requirementsPath === undefined || ledgerPath === undefined || argv.length > 3
    || (mode !== undefined && mode !== '--require-complete')) {
    process.stderr.write('Usage: task-ledger.ts REQUIREMENTS.json LEDGER.json [--require-complete]\n')
    return 2
  }
  try {
    const requirements: unknown = JSON.parse(readFileSync(requirementsPath, 'utf8'))
    const ledger: unknown = JSON.parse(readFileSync(ledgerPath, 'utf8'))
    const result = validateTaskLedger(ledger, requirements)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return !result.valid ? 2 : mode === '--require-complete' && !result.complete ? 1 : 0
  } catch (error) {
    process.stderr.write(`task ledger could not be read: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
