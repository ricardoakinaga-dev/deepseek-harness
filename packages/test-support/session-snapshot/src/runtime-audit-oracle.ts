/** Mode-specific audit oracles retain source and artifact availability independently. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

type RecordValue = Record<string, unknown>

interface AuditRow {
  session: number
  event: RecordValue
}

function records(log: string): RecordValue[] {
  return log.trimEnd().split('\n').filter(Boolean).map(line => JSON.parse(line) as RecordValue)
}

function auditRow(value: unknown): AuditRow {
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value)
    && 'session' in value && typeof value.session === 'number' && Number.isSafeInteger(value.session) && value.session > 0
    && 'event' in value && typeof value.event === 'object' && value.event !== null && !Array.isArray(value.event)
    && 'type' in value.event && value.event.type === 'runtime/audit', 'malformed runtime audit oracle row')
  return { session: value.session, event: value.event }
}

/**
 * Compare normalized, independently identity-checked audits with their explicit mode oracle.
 * @param directory - Scenario owning the canonical Session and both mode oracles.
 * @param mode - Executing launcher's independently observed kind.
 * @param logs - Normalized current Session comparisons, in canonical role order.
 * @param refresh - Whether the explicit fixture workflow may write this mode's oracle.
 * @returns The verified mode records; replay never creates or repairs an oracle.
 */
export async function verifyRuntimeAuditOracle(
  directory: string, mode: 'source' | 'artifact', logs: readonly string[], refresh: boolean,
): Promise<AuditRow[]> {
  const actual = logs.flatMap((log, index) => records(log)
    .filter(event => event.type === 'runtime/audit').map(event => ({ session: index + 1, event })))
  if (actual.length === 0) return []
  const path = join(directory, `runtime-audit.${mode}.expected.jsonl`)
  if (refresh) await writeFile(path, actual.map(row => JSON.stringify(row)).join('\n') + '\n')
  const expected = records(await readFile(path, 'utf8')).map(auditRow)
  assert.deepEqual(actual, expected, `${mode} runtime audit oracle differs`)
  return expected
}

/**
 * Select verified mode audit payloads in the expected SDK notification projection.
 * @param notifications - Canonical expected notification records.
 * @param canonical - Canonical expected Sessions before mode substitution.
 * @param oracle - Mode rows already checked against actual normalized Sessions.
 * @returns Expected notifications retaining their original envelopes and other payloads.
 */
export function withRuntimeAuditNotificationOracle(
  notifications: readonly RecordValue[], canonical: readonly string[], oracle: readonly AuditRow[],
): RecordValue[] {
  const pairs = canonical.flatMap((log, index) => {
    const selected = oracle.filter(row => row.session === index + 1)
    return records(log).filter(event => event.type === 'runtime/audit').map((event, ordinal) => ({
      canonical: event, selected: selected[ordinal]?.event,
    }))
  })
  return notifications.map((notification) => {
    if (notification.method !== 'session.event') return notification
    const params = notification.params as RecordValue
    const event = params.event as RecordValue
    if (event.type !== 'runtime/audit') return notification
    const matches = pairs.filter(pair => isDeepStrictEqual(pair.canonical.data, event.data))
    const selected = matches[0]?.selected
    assert.ok(selected !== undefined, 'notification audit has no selected Session oracle')
    assert.ok(matches.every(pair => isDeepStrictEqual(pair.selected, selected)), 'notification audit has ambiguous Session roles')
    return { ...notification, params: { ...params, event: { ...event, data: selected.data } } }
  })
}

/**
 * Replace only canonical expected audit rows after the selected oracle matches actual output.
 * @param logs - Strictly restored canonical expected Sessions.
 * @param oracle - Selected mode rows returned by the successful independent comparison.
 * @returns Expected Sessions whose other records remain byte-identical.
 */
export function withRuntimeAuditOracle(logs: readonly string[], oracle: readonly AuditRow[]): string[] {
  let used = 0
  const output = logs.map((log, index) => {
    const selected = oracle.filter(row => row.session === index + 1)
    let cursor = 0
    const replaced = log.split('\n').map((line) => {
      if (!line.trim()) return line
      const record = JSON.parse(line) as RecordValue
      if (record.type !== 'runtime/audit') return line
      const row = selected[cursor++]
      assert.ok(row, `runtime audit oracle missing Session role ${index + 1} row ${cursor}`)
      used += 1
      return JSON.stringify(row.event)
    }).join('\n')
    assert.equal(cursor, selected.length, `runtime audit oracle count differs for Session role ${index + 1}`)
    return replaced
  })
  assert.equal(used, oracle.length, 'runtime audit oracle has an unknown Session role')
  return output
}
