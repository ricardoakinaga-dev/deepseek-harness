/** Runtime audit normalization preserves availability and configuration while stabilizing host identity. */
import assert from 'node:assert/strict'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { isDeepStrictEqual } from 'node:util'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hash(record: Record<string, unknown>, key: string, token: string): void {
  const value = record[key]
  if (value === null || value === undefined) return
  if (value !== token && (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))) {
    throw new Error(`runtime audit ${key} is not a SHA-256 digest`)
  }
  record[key] = token
}

function source(value: unknown): void {
  if (!object(value)) return
  if (value.revision !== '{{runtime.revision}}'
    && (typeof value.revision !== 'string' || !/^[a-f0-9]{40,64}$/u.test(value.revision))) {
    throw new Error('runtime audit source revision is unavailable or malformed')
  }
  if (typeof value.dirty !== 'boolean') throw new Error('runtime audit source dirty flag is malformed')
  value.revision = '{{runtime.revision}}'
  value.dirty = false
  hash(value, 'contentSha256', '{{runtime.contentSha256}}')
}

/** Stabilize only declared runtime identity fields, preserving unknown payloads and availability.
 * @param record Parsed Session event; other event types remain untouched.
 * @param repositoryRoot Known checkout root used only for declared plugin module specifiers.
 */
export function normalizeRuntimeAudit(record: Record<string, unknown>, repositoryRoot?: string): void {
  if (record.type !== 'runtime/audit' || !object(record.data)) return
  const data = record.data
  if (repositoryRoot !== undefined) {
    const root = resolve(repositoryRoot) + sep
    const url = pathToFileURL(root).href
    for (const entries of [data.plugins, data.configuration]) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        if (!object(entry) || typeof entry.plugin !== 'string') continue
        if (entry.plugin.startsWith(url)) entry.plugin = `file://{{repo}}/${entry.plugin.slice(url.length)}`
        else if (entry.plugin.startsWith(root)) entry.plugin = `{{repo}}/${entry.plugin.slice(root.length).split(sep).join('/')}`
      }
    }
  }
  if (object(data.runtime)) {
    const runtime = data.runtime
    for (const key of ['nodeVersion', 'platform', 'arch']) {
      if (typeof runtime[key] === 'string') runtime[key] = `{{runtime.${key}}}`
    }
    if (object(runtime.launcher)) hash(runtime.launcher, 'sha256', '{{runtime.launcher.sha256}}')
    source(runtime.source)
    if (object(runtime.build)) {
      hash(runtime.build, 'manifestSha256', '{{runtime.build.manifestSha256}}')
      hash(runtime.build, 'inputsSha256', '{{runtime.build.inputsSha256}}')
      source(runtime.build.source)
    }
  }
  if (Array.isArray(data.plugins)) {
    for (const plugin of data.plugins) {
      if (!object(plugin)) continue
      hash(plugin, 'moduleSha256', '{{plugin.moduleSha256}}')
      if (object(plugin.package)) hash(plugin.package, 'manifestSha256', '{{plugin.manifestSha256}}')
    }
  }
}

/** Check the raw identity before normalization against an independent launch-time observation.
 * @param log Complete raw Session JSONL, before any refresh write-back.
 * @param expected Identity observed immediately before starting the executing launcher.
 * @returns Number of initial audit records checked; zero means the composition did not audit runtime identity.
 * @throws When any captured identity differs from the independently observed launch identity.
 */
export function assertRuntimeAuditIdentity(log: string, expected: object): number {
  let checked = 0
  for (const line of log.split('\n')) {
    if (line.trim().length === 0) continue
    const record = JSON.parse(line) as Record<string, unknown>
    if (record.type !== 'runtime/audit' || !object(record.data) || record.data.reason !== 'initial') continue
    if (!isDeepStrictEqual(record.data.runtime, expected)) throw new Error('captured runtime identity differs from the launch-time observation')
    checked += 1
  }
  return checked
}

/**
 * Require a new current-writer Session's own initial audit to match its launch observation.
 * @param log - Raw newly persisted Session, including its header and inherited seed marker.
 * @param expected - Runtime identity independently observed immediately before launch.
 * @returns Number of own initial audits checked; inherited parent audits are excluded.
 */
export function assertFreshRuntimeAuditIdentity(log: string, expected: object): number {
  const [header, ...events] = log.trimEnd().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
  assert.equal(header?.type, 'session', 'runtime identity check requires a Session header')
  assert.equal(header.version, SESSION_FORMAT_VERSION, 'runtime identity check requires current-writer output')
  const boundary = header.isSeeded === true ? events.findLastIndex(event =>
    event.type === 'session/end-seed' && typeof event.data === 'object' && event.data !== null
    && 'inherited' in event.data && event.data.inherited === true) : -1
  if (header.isSeeded === true) assert.ok(boundary >= 0, 'seeded Session has no inherited end-seed marker')
  const own = events.slice(boundary + 1).map(event => JSON.stringify(event)).join('\n')
  const checked = assertRuntimeAuditIdentity(own, expected)
  assert.ok(checked > 0, 'fresh Session has no own initial runtime audit')
  return checked
}
