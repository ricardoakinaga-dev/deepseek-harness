import { describe, expect, it } from 'vitest'
import { assertRuntimeAuditIdentity, normalizeRuntimeAudit } from '../src/runtime-audit.ts'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { scrubSessionSnapshot } from '../src/normalize.ts'

function audit() {
  return { type: 'runtime/audit', data: { reason: 'initial', profile: 'sdk', configuration: [{ id: 'provider', values: { retryPolicy: { maxRetries: 2 } } }],
    runtime: { version: '0.2.0', nodeVersion: 'v24.0.0', platform: 'linux', arch: 'x64',
      launcher: { kind: 'source', sha256: 'a'.repeat(64) }, source: { revision: 'b'.repeat(40), dirty: true, contentSha256: 'c'.repeat(64) }, build: null },
    plugins: [{ id: 'provider', plugin: 'provider', moduleSha256: 'd'.repeat(64), package: { name: 'provider', version: '1.0', manifestSha256: 'e'.repeat(64) } }],
  } }
}

describe('runtime audit snapshot identity', () => {
  it.each([null, '0.2.0'])('preserves disk observation qualifiers and build version %s', (version) => {
    const event = { type: 'runtime/audit', data: { runtime: {
      version, versionSource: version === null ? 'unavailable' : 'embedded-build-observation',
      launcher: { kind: 'artifact', sha256: 'a'.repeat(64), sha256Source: 'disk-observation' },
      source: null, build: { manifestSha256: 'b'.repeat(64), inputsSha256: 'c'.repeat(64),
        inputsSource: version === null ? null : 'disk-observation', inputCount: 3, version, source: null },
    } } }
    normalizeRuntimeAudit(event)
    expect(event.data.runtime).toMatchObject({
      version, versionSource: version === null ? 'unavailable' : 'embedded-build-observation',
      launcher: { kind: 'artifact', sha256: '{{runtime.launcher.sha256}}', sha256Source: 'disk-observation' },
      build: { version, inputsSource: version === null ? null : 'disk-observation', inputCount: 3, source: null },
    })
  })

  it('checks raw identity before stabilizing only declared host fields', () => {
    const event = audit()
    const raw = JSON.stringify(event)
    expect(assertRuntimeAuditIdentity(raw, structuredClone(event.data.runtime))).toBe(1)
    expect(() => assertRuntimeAuditIdentity(raw, { ...event.data.runtime, launcher: { kind: 'source', sha256: 'f'.repeat(64) } })).toThrow('differs')
    const configuration = structuredClone(event.data.configuration)
    normalizeRuntimeAudit(event)
    expect(event.data.runtime.source).toEqual({ revision: '{{runtime.revision}}', dirty: false, contentSha256: '{{runtime.contentSha256}}' })
    expect(event.data.runtime.launcher.kind).toBe('source')
    expect(event.data.runtime.build).toBeNull()
    expect(event.data.plugins[0]?.package).toMatchObject({ name: 'provider', version: '1.0' })
    expect(event.data.configuration).toEqual(configuration)
    const stable = structuredClone(event)
    normalizeRuntimeAudit(event)
    expect(event).toEqual(stable)
  })

  it('preserves unknown availability and rejects malformed declared hashes', () => {
    const event = { type: 'runtime/audit', data: { reason: 'initial', runtime: null, plugins: [{ id: 'builtin', moduleSha256: null, package: null }] } }
    const original = structuredClone(event)
    normalizeRuntimeAudit(event)
    expect(event).toEqual(original)
    const malformed = audit()
    malformed.data.runtime.launcher.sha256 = 'incorrect'
    expect(() => { normalizeRuntimeAudit(malformed) }).toThrow('SHA-256')
    expect(assertRuntimeAuditIdentity('{"type":"turn/start"}', {})).toBe(0)
  })

  it('does not rewrite identity-looking fields in unrelated events', () => {
    const event = { ...audit(), type: 'vendor/audit' }
    const original = structuredClone(event)
    normalizeRuntimeAudit(event)
    expect(event).toEqual(original)
  })

  it('stabilizes only checkout-rooted declared plugin specifiers', () => {
    const root = resolve('checkout')
    const plugin = pathToFileURL(resolve(root, 'fixtures', 'provider.mjs')).href
    const event = { type: 'runtime/audit', data: {
      plugins: [{ plugin, moduleSha256: null, package: null }],
      configuration: [{ plugin, values: { userText: plugin } }], userText: plugin,
    } }
    normalizeRuntimeAudit(event, root)
    expect(event.data.plugins[0]?.plugin).toBe('file://{{repo}}/fixtures/provider.mjs')
    expect(event.data.configuration[0]?.plugin).toBe('file://{{repo}}/fixtures/provider.mjs')
    expect(event.data.configuration[0]?.values.userText).toBe(plugin)
    expect(event.data.userText).toBe(plugin)
    const fixture = scrubSessionSnapshot(`{"type":"session"}\n${JSON.stringify({ ...event, data: {
      plugins: [{ plugin, moduleSha256: null, package: null }], userText: plugin,
    } })}`, { repositoryRoot: root })
    expect(fixture).toContain('file://{{repo}}/fixtures/provider.mjs')
    expect(fixture).toContain(`"userText":${JSON.stringify(plugin)}`)
  })
})
