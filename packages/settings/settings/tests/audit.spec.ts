/** Audited effective config survives log serialization and live profile reloads. */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PluginPackages, type RuntimeIdentity } from '@deepseek-ai/dsh-app-boot'
import { expect, it, vi, onTestFinished } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { Context } from '@deepseek-ai/cordis'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import Hmr from '@deepseek-ai/dsh-hmr'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import LlmRuntime, { EMPTY_RESPONSE_CODE } from '@deepseek-ai/dsh-llm'
import * as NativeApiKey from '@deepseek-ai/dsh-llm-deepseek-api-key'
import * as NativeAccount from '@deepseek-ai/dsh-llm-deepseek-account'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { serializeSessionLog } from '@deepseek-ai/dsh-session-log-export'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { auditConfiguration, installRuntimeAudit, readRuntimePluginIdentities } from '../src/audit.ts'
import { plainConfig } from '../src/schema.ts'
import { configurationFixture } from './configuration-fixture.ts'

async function publish(ctx: Context, session: Session): Promise<void> {
  const unused = (): never => { throw new Error('audit fixture does not drive a model') }
  const agent: Agent = {
    id: session.id, session, ctx, options: {}, status: 'idle',
    inbox: { nextTurn: [], nextStep: [], clear: unused, append: unused, prepend: unused, replace: unused, remove: unused, splice: unused },
    send: unused, followup: unused, steer: unused, inject: unused, cancel: unused,
    whenIdle: () => Promise.resolve(), runMaintenance: task => task(new AbortController().signal),
  }
  await ctx.agents.register(agent)
}

it('audits changed active siblings after a watched profile patch partially fails', async () => {
  const { ctx, profile } = await configurationFixture({ schema: z.object({
    count: z.number().default(2).volatile().extra('extra', { audit: true }),
    fail: z.boolean().default(false),
  }), apply: (_ctx, config) => { if (Reflect.get(config as object, 'fail') === true) throw new Error('partial activation rejected') } })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  await publish(ctx, ctx.sessions.create())
  let successful = 0
  ctx.on('app-boot/config-reload', () => { successful += 1 })
  writeFileSync(profile.patchPath, JSON.stringify([
    { id: 'first', config: { count: 4 } }, { id: 'second', config: { fail: true } },
  ]))
  await vi.waitFor(() => { expect(plainConfig(ctx.loader.resolve('include:first').fiber!.config)).toMatchObject({ count: 4 }) })
  await ctx.hmr.runExclusive(async () => {})
  expect(successful).toBe(0)
  expect(readRuntimePluginIdentities(ctx).some(row => row.id === 'include:second')).toBe(false)
  expect(events.at(-1)?.data).toMatchObject({ reason: 'reload', configuration: [
    { id: 'include:first', plugin: 'cordis:probe', values: { count: 4 } },
    { id: 'include:second', plugin: 'cordis:probe', values: null },
  ] })
})

it('projects marked defaults, nested arrays and route maps without unmarked or unknown fields', () => {
  const schema = z.object({
    effort: z.dict(z.string()).extra('extra', { audit: true }),
    rows: z.array(z.object({ count: z.number().extra('extra', { audit: true }), token: z.string().role('secret') })),
    token: z.string().role('secret'),
    reference: z.string().role('credential-ref'),
  })
  expect(auditConfiguration(schema, {
    effort: { codex: 'medium' }, rows: [{ count: 2, token: 'hidden', extra: 'hidden' }],
    token: 'hidden', reference: 'CREDENTIAL', extra: 'hidden',
  })).toEqual({ effort: { codex: 'medium' }, rows: [{ count: 2 }] })
  expect(auditConfiguration(z.object({ x: z.string() }), { x: 'hidden' })).toBeUndefined()
})

it.each(['secret', 'credential-ref'])('rejects marked %s roles at every container even without configured values', (role) => {
  const secret = z.string().role(role)
  for (const field of [secret, z.object({ nested: secret }), z.array(secret), z.dict(secret), z.union([z.string(), secret])]) {
    expect(() => auditConfiguration(z.object({ field: field.extra('extra', { audit: true }) }), {})).toThrow('must not contain')
  }
  expect(() => auditConfiguration(z.object({ field: z.object({ x: z.string().extra('extra', { audit: true }) }).role(role) }), {})).toThrow('must not contain')
})

it.each(['secret', 'credential-ref'])('rejects audited dictionary keys marked %s before logging any value', (role) => {
  const keys = z.string().role(role)
  const schema = z.object({ routes: z.dict(z.number(), keys).extra('extra', { audit: true }) })
  expect(() => auditConfiguration(schema, { routes: { PRIVATE_KEY: 1 } })).toThrow('must not contain')
  expect(() => auditConfiguration(schema, {})).toThrow('must not contain')
  const descendant = z.dict(z.object({ count: z.number().extra('extra', { audit: true }) }), keys)
  expect(() => auditConfiguration(descendant, { PRIVATE_KEY: { count: 1 } })).toThrow('must not contain')
})

it('projects audited descendants in a provider dictionary without credentials or arbitrary siblings', () => {
  const schema = z.object({ providers: z.dict(z.object({
    apiKeyEnv: z.string().role('credential-ref'), headers: z.dict(z.string()),
    retryPolicy: z.union([
      z.object({ mode: z.const('normal'), retries: z.number() }),
      z.object({ mode: z.const('always') }),
    ]).extra('extra', { audit: true }),
  })) })
  expect(auditConfiguration(schema, { providers: {
    codex: { apiKeyEnv: 'CREDENTIAL', headers: { Authorization: 'secret' }, retryPolicy: { mode: 'normal', retries: 5 } },
  } })).toEqual({ providers: { codex: { retryPolicy: { mode: 'normal', retries: 5 } } } })
  const ambiguous = z.union([
    z.object({ x: z.string().extra('extra', { audit: true }) }),
    z.object({ x: z.string().role('secret') }),
  ])
  expect(() => auditConfiguration(ambiguous, { x: 'secret' })).toThrow('must not contain')
})

it('rejects unconstrained schemas and non-finite audited values', () => {
  expect(() => auditConfiguration(z.any().extra('extra', { audit: true }), {})).toThrow('does not support')
  expect(() => auditConfiguration(z.number().extra('extra', { audit: true }), Infinity)).toThrow('finite JSON')
})

it('records actual resolved route effort, changed values after real reload, and no credentials in serialized logs', async () => {
  const { ctx } = await configurationFixture({ schema: z.object({
    ordinary: z.string(), token: z.string().role('secret').volatile(),
    compactionReasoningEffortByRoute: z.dict(z.string()).default({ codex: 'medium' }).volatile().extra('extra', { audit: true }),
  }) })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const events: SessionEvent[] = []
  const children: SessionEvent[] = []
  ctx.on('session/event', (owner, event) => { (owner.header.parentSession === undefined ? events : children).push(event) })
  const session = ctx.sessions.create()
  await publish(ctx, session)
  const child = ctx.sessions.fork(session)
  await publish(ctx, child)
  const auditEvents = () => events.filter(event => event.type === 'runtime/audit')
  expect(auditEvents()).toHaveLength(1)
  expect(auditEvents()[0]?.data).toMatchObject({ reason: 'initial', profile: 'test', runtime: null, startedBundles: ['test-bundle'] })
  expect(children.filter(event => event.type === 'runtime/audit')).toHaveLength(1)
  await ctx.settings.update('first', { compactionReasoningEffortByRoute: { codex: 'high' } })
  expect(auditEvents()).toHaveLength(2)
  expect(auditEvents()[1]?.data).toEqual({ reason: 'reload', configuration: [{ id: 'include:first', plugin: 'cordis:probe', values: { compactionReasoningEffortByRoute: { codex: 'high' } } }] })
  await ctx.settings.update('first', { token: 'replaced-secret' })
  expect(auditEvents()).toHaveLength(2)
  await expect(ctx.settings.update('first', { compactionReasoningEffortByRoute: { codex: 4 } })).rejects.toThrow()
  expect(auditEvents()).toHaveLength(2)
  const exported = serializeSessionLog(session.header, events)
  expect(exported).toContain('compactionReasoningEffortByRoute')
  expect(exported).toContain('medium')
  expect(exported).toContain('high')
  expect(exported).not.toContain('token')
  expect(exported).not.toContain('private')
  expect(exported).not.toContain('replaced-secret')
  // Detached seed admission covers the same declared payload that persistence reads.
  const restored = Session.create(session.id, events, session.header)
  expect(restored.seq).toBe(events.length + 1)
})

it.each(['configuration', 'module'])('records removal and stops after disposal on %s reload', async (kind) => {
  const { ctx } = await configurationFixture()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const events: SessionEvent[] = []
  ctx.on('session/event', (_session, event) => { events.push(event) })
  await publish(ctx, ctx.sessions.create())
  let rows = [{ id: 'probe', plugin: 'probe', values: { limit: 1 } }]
  const fiber = ctx.plugin((ctx: Context) => { installRuntimeAudit(ctx, () => rows) })
  await fiber.await()
  const reload = (): void => {
    if (kind === 'module') ctx.emit('hmr/reload', new Map())
    else ctx.emit('app-boot/config-reload')
  }
  rows = []
  reload()
  await Promise.resolve()
  expect(events.at(-1)?.data).toEqual({ reason: 'reload', configuration: [{ id: 'probe', plugin: 'probe', values: null }] })
  await fiber.dispose()
  const count = events.length
  reload()
  expect(events).toHaveLength(count)
})

it('audits changed module defaults once and rejects newly secret fields without recording them', async () => {
  const { ctx } = await configurationFixture()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const session = ctx.sessions.create()
  await publish(ctx, session)
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  let schema = z.object({ count: z.number().default(1).extra('extra', { audit: true }) })
  const fiber = ctx.plugin((ctx: Context) => {
    installRuntimeAudit(ctx, () => [{ id: 'probe', plugin: 'probe', values: auditConfiguration(schema, schema({})) ?? null }])
  })
  await fiber.await()
  expect(events.at(-1)?.data).toMatchObject({ configuration: [{ values: { count: 1 } }] })
  schema = z.object({ count: z.number().default(2).extra('extra', { audit: true }) })
  const append = vi.spyOn(session, 'append').mockImplementationOnce(() => { throw new Error('append rejected') })
  expect(() => { ctx.emit('hmr/reload', new Map()) }).toThrow('append rejected')
  append.mockRestore()
  expect(events).toHaveLength(1)
  ctx.emit('hmr/reload', new Map())
  expect(events.at(-1)?.data).toEqual({ reason: 'reload', configuration: [{ id: 'probe', plugin: 'probe', values: { count: 2 } }] })
  ctx.emit('hmr/reload', new Map())
  ctx.emit('app-boot/config-reload')
  expect(events).toHaveLength(2)
  schema = z.object({ count: z.number().default(3).role('secret').extra('extra', { audit: true }) })
  expect(() => { ctx.emit('hmr/reload', new Map()) }).toThrow('must not contain')
  expect(events).toHaveLength(2)
  await fiber.dispose()
  ctx.emit('hmr/reload', new Map())
  expect(events).toHaveLength(2)
})

it('refuses publication when an audited secret is configured and permits settings without sessions', async () => {
  const { ctx } = await configurationFixture({ schema: z.object({ ordinary: z.string(), token: z.string().role('secret').extra('extra', { audit: true }) }) })
  expect(ctx.settings).toBeDefined()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await expect(publish(ctx, ctx.sessions.create())).rejects.toThrow('must not contain')
  expect(ctx.agents.list()).toHaveLength(0)
})

it('publishes audit after every Session baseline and only for announced agents', async () => {
  const { ctx } = await configurationFixture()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  let announced = false
  let delivered = 0
  ctx.on('session/created', () => { announced = true })
  ctx.on('session/event', (_session, event) => {
    if (event.type !== 'runtime/audit') return
    expect(announced).toBe(true)
    delivered++
  })
  const session = ctx.sessions.create()
  expect(delivered).toBe(0)
  await publish(ctx, session)
  expect(delivered).toBe(1)
  ctx.sessions.create()
  await ctx.fiber.dispose()
  expect(delivered).toBe(1)
})

it('preserves optional audited containers, sparse values and scalar union alternatives without unknown keys', () => {
  const child = z.object({ limit: z.number().extra('extra', { audit: true }) })
  const schema = z.object({
    empty: z.object({ limit: z.number() }).extra('extra', { audit: true }),
    absent: child, dict: z.dict(child), array: z.array(child),
    flag: z.union([z.const(false), z.object({ mode: z.string() })]).extra('extra', { audit: true }),
    choice: z.union([z.array(z.string()), z.dict(z.number()), z.string()]).extra('extra', { audit: true }),
  })
  expect(auditConfiguration(schema, { empty: {}, absent: {}, dict: { b: {}, a: { limit: 2 } }, array: [{}, { limit: 3 }], flag: false, choice: 'auto' }))
    .toEqual({ empty: {}, dict: { a: { limit: 2 } }, array: [null, { limit: 3 }], flag: false, choice: 'auto' })
  expect(auditConfiguration(schema, { flag: { mode: 'normal' } })).toEqual({ flag: { mode: 'normal' } })
  expect(auditConfiguration(z.const(null).extra('extra', { audit: true }), null)).toBeNull()
})

it('does not advance recorded config after append rejection, and retries it on the next successful reload', async () => {
  const { ctx } = await configurationFixture({ schema: z.object({
    ordinary: z.string(), count: z.number().default(1).volatile().extra('extra', { audit: true }),
  }) })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const session = ctx.sessions.create()
  const firstAppend = vi.spyOn(session, 'append').mockImplementationOnce(() => { throw new Error('append rejected') })
  await expect(publish(ctx, session)).rejects.toThrow('append rejected')
  firstAppend.mockRestore()
  await publish(ctx, session)
  const events: SessionEvent[] = []
  ctx.on('session/event', (_session, event) => { events.push(event) })
  const reloadAppend = vi.spyOn(session, 'append').mockImplementationOnce(() => { throw new Error('append rejected') })
  await expect(ctx.settings.update('first', { count: 4 })).rejects.toThrow('append rejected')
  reloadAppend.mockRestore()
  await ctx.settings.update('first', { count: 4 })
  expect(events.filter(event => event.type === 'runtime/audit')).toHaveLength(1)
  expect(events.at(-1)?.data).toMatchObject({ reason: 'reload', configuration: [{ values: { count: 4 } }] })
  ctx.sessions.create()
  ctx.emit('app-boot/config-reload')
  expect(events.filter(event => event.type === 'runtime/audit')).toHaveLength(1)
})


it('never selects fields from an inactive union alternative', () => {
  const schema = z.union([
    z.object({ mode: z.const('safe').required(), name: z.string() }),
    z.object({ mode: z.const('other').required(), token: z.string() }),
  ]).extra('extra', { audit: true })
  expect(auditConfiguration(schema, { mode: 'safe', name: 'public', token: 'must-stay-private' }))
    .toEqual({ mode: 'safe', name: 'public' })
})

it('audits effective pi provider retry defaults while excluding credential and header values', async () => {
  const { Config } = await import('@deepseek-ai/dsh-llm-pi-ai')
  const config = Config({ providers: { route: {
    api: 'openai-completions', baseURL: 'https://example.invalid/v1', apiKeyEnv: 'PRIVATE_REFERENCE',
    headers: { Authorization: 'PRIVATE_HEADER' }, models: [{ id: 'test', contextWindow: 4096, maxTokens: 128 }],
  } } })
  expect(auditConfiguration(Config, plainConfig(config))).toEqual({ providers: { route: { retryPolicy: {
    mode: 'normal', maxRetries: 5, retryableCodes: [EMPTY_RESPONSE_CODE, 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
    backoff: { initialDelayMs: 500, maxDelayMs: 10000, jitterRatio: 0.1 },
  } } } })
  expect(JSON.stringify(auditConfiguration(Config, plainConfig(config)))).not.toContain('PRIVATE')
})


it('keeps historical unknown runtime facts unchanged and records only the current publication in a real profile', async () => {
  const runtime: RuntimeIdentity = {
    version: '1.2.3', nodeVersion: 'v24.0.0', platform: 'linux', arch: 'x64',
    versionSource: 'embedded-build-observation',
    launcher: { kind: 'artifact', sha256: 'a'.repeat(64), sha256Source: 'disk-observation' }, source: null,
    build: { version: '1.2.3', inputsSource: 'disk-observation', manifestSha256: 'b'.repeat(64), inputsSha256: 'c'.repeat(64), inputCount: 2, source: null },
  }
  const { ctx } = await configurationFixture({ runtimeIdentity: runtime })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const session = ctx.sessions.create()
  const events: SessionEvent[] = []
  ctx.on('session/event', (_owner, event) => { events.push(event) })
  const historicalRuntime = { version: '1.0.0', nodeVersion: 'v24.0.0', platform: 'linux', arch: 'x64',
    launcher: { kind: 'artifact' as const, sha256: 'd'.repeat(64) }, source: null, build: null }
  const historical = session.append('runtime/audit', {
    reason: 'initial', runtime: historicalRuntime, profile: 'previous', startedBundles: [], configuration: [], plugins: [],
  })
  const before = JSON.stringify(historical)
  await publish(ctx, session)
  expect(JSON.stringify(historical)).toBe(before)
  const audits = events.filter(event => event.type === 'runtime/audit')
  expect(audits).toHaveLength(2)
  const current = audits[1]?.data
  if (current?.reason !== 'initial') throw new Error('missing initial audit')
  expect(current.runtime).toEqual(runtime)
  for (const id of ['include:first', 'include:second']) {
    expect(current.plugins).toContainEqual({ id, plugin: 'cordis:probe', moduleSha256: null, package: null })
  }
  const exported = serializeSessionLog(session.header, events)
  const restored = Session.create(session.id, events, session.header)
  expect(restored.snapshotEvents().find(event => event.type === 'runtime/audit')?.data).toMatchObject({ runtime: historicalRuntime })
  expect(exported).toContain('manifestSha256')
  expect(exported).not.toContain('private')
})

it('records plugin-only reloads and rolls them back after an append failure', async () => {
  const { ctx } = await configurationFixture()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const session = ctx.sessions.create()
  await publish(ctx, session)
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  let plugins = [{ id: 'plugin', plugin: 'test', moduleSha256: 'a'.repeat(64),
    package: { name: 'test', version: '1.0.0', manifestSha256: 'b'.repeat(64) } }]
  const fiber = ctx.plugin((ctx: Context) => { installRuntimeAudit(ctx, () => [], () => plugins) })
  await fiber.await()
  expect(events.at(-1)?.data).toMatchObject({ reason: 'initial', plugins })
  plugins = [{ ...plugins[0]!, moduleSha256: 'c'.repeat(64) }]
  const append = vi.spyOn(session, 'append').mockImplementationOnce(() => { throw new Error('append rejected') })
  expect(() => { ctx.emit('hmr/reload', new Map()) }).toThrow('append rejected')
  append.mockRestore()
  ctx.emit('hmr/reload', new Map())
  expect(events.at(-1)?.data).toEqual({ reason: 'reload', configuration: [], plugins })
  const count = events.length
  ctx.emit('app-boot/config-reload')
  expect(events).toHaveLength(count)
  await fiber.dispose()
})

it('audits explicit always retry mode with resolved backoff and no inactive normal fields', async () => {
  const { Config } = await import('@deepseek-ai/dsh-llm-pi-ai')
  const config = Config({ providers: { route: {
    apiKeyEnv: 'PRIVATE_REFERENCE', headers: { Authorization: 'PRIVATE_HEADER' },
    retryPolicy: { mode: 'always', backoff: { initialDelayMs: 800 } },
  } } })
  expect(auditConfiguration(Config, plainConfig(config))).toEqual({ providers: { route: { retryPolicy: {
    mode: 'always', backoff: { initialDelayMs: 800, maxDelayMs: 10000, jitterRatio: 0.1 },
  } } } })
})


it('does not identify current disk bytes as loaded code across configuration reload, module replacement and rollback', async () => {
  const { ctx, profile } = await configurationFixture()
  await ctx.plugin(PluginPackages)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const packageDir = join(profile.dir, 'audit-probe')
  mkdirSync(packageDir, { recursive: true })
  symlinkSync(packageDir, join(profile.dir, 'node_modules', 'audit-probe'), 'junction')
  const manifest = join(packageDir, 'package.json')
  writeFileSync(manifest, '{"name":"audit-probe","version":"1.2.3","exports":"./index.mjs"}\n')
  const module = join(packageDir, 'index.mjs')
  const implementation = (value: string): string => `export const apply = ctx => { ctx.provide('auditLoadedProbe', ${JSON.stringify(value)}) }\n`
  writeFileSync(module, implementation('original'))
  const tree = ctx.loader.resolve('include').subtree!
  const entry = ctx.loader.resolve(await tree.create({ name: 'audit-probe' }))
  await ctx.loader.await()
  expect(ctx.get('auditLoadedProbe')).toBe('original')
  const selected = () => readRuntimePluginIdentities(ctx).find(row => row.id === entry.id)
  expect(selected()).toEqual({ id: entry.id, plugin: 'audit-probe', moduleSha256: null, package: null })
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  await publish(ctx, ctx.sessions.create())
  writeFileSync(module, implementation('replacement'))
  writeFileSync(manifest, '{"name":"audit-probe","version":"9.9.9","exports":"./index.mjs"}\n')
  ctx.emit('app-boot/config-reload')
  expect(ctx.get('auditLoadedProbe')).toBe('original')
  expect(selected()).toMatchObject({ moduleSha256: null, package: null })
  expect(events).toHaveLength(1)
  const replace = async (): Promise<void> => {
    const stashed = Reflect.get(ctx.hmr, 'stashed') as Set<string>
    stashed.add(pathToFileURL(module).href)
    const reload = Reflect.get(ctx.hmr, 'partialReload') as () => Promise<void>
    await reload.call(ctx.hmr)
  }
  await replace()
  expect(ctx.get('auditLoadedProbe')).toBe('replacement')
  expect(events).toHaveLength(2)
  const replaced = events.at(-1)?.data
  if (replaced?.reason !== 'reload') throw new Error('missing module replacement audit')
  expect(replaced.plugins).toContainEqual(selected())
  writeFileSync(module, "export const apply = () => { throw new Error('replacement rejected') }\n")
  await expect(replace()).rejects.toThrow('replacement rejected')
  expect(ctx.get('auditLoadedProbe')).toBe('replacement')
  ctx.emit('app-boot/config-reload')
  expect(selected()).toMatchObject({ moduleSha256: null, package: null })
  expect(events).toHaveLength(2)
})

it.each([false, true])('settles watched module attempts after rejected replacement (rollback failure: %s)', async (failRollback) => {
  const { ctx, profile } = await configurationFixture({ hmr: false })
  const originalDisposing = Promise.withResolvers<undefined>()
  const releaseOriginal = Promise.withResolvers<undefined>()
  const replacementDisposing = Promise.withResolvers<undefined>()
  const releaseReplacement = Promise.withResolvers<undefined>()
  onTestFinished(() => { releaseOriginal.resolve(undefined); releaseReplacement.resolve(undefined) })
  const control = {
    rejectOriginal: false,
    replacementError: new Error('watched replacement rejected'),
    rollbackError: new Error('original resource unavailable'),
    originalDisposing, releaseOriginal, replacementDisposing, releaseReplacement,
  }
  ctx.provide('auditModuleControl', control)
  const packageDir = join(profile.dir, 'watched-audit-probe')
  mkdirSync(packageDir, { recursive: true })
  symlinkSync(packageDir, join(profile.dir, 'node_modules', 'watched-audit-probe'), 'junction')
  writeFileSync(join(packageDir, 'package.json'), '{"name":"watched-audit-probe","exports":"./index.mjs"}\n')
  const filename = join(packageDir, 'index.mjs')
  writeFileSync(filename, `export const apply = ctx => {
    const control = ctx.get('auditModuleControl')
    if (control.rejectOriginal) throw control.rollbackError
    ctx.effect(() => async () => {
      control.originalDisposing.resolve(undefined)
      await control.releaseOriginal.promise
    })
    ctx.provide('auditLoadedProbe', 'original')
  }\n`)
  const entry = ctx.loader.resolve(await ctx.loader.resolve('include').subtree!.create({ name: 'watched-audit-probe' }))
  await ctx.loader.await()
  expect(ctx.get('auditLoadedProbe')).toBe('original')
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, { base: profile.dir, root: [filename], ignored: [], debounce: 0,
    awaitWriteFinish: { stabilityThreshold: 30, pollInterval: 10 } })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const events: SessionEvent<'runtime/audit'>[] = []
  const notifications: string[][] = []
  let successful = 0
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  ctx.on('hmr/config-settled', (paths) => { notifications.push([...paths]) })
  ctx.on('hmr/reload', () => { successful += 1 })
  await publish(ctx, ctx.sessions.create())
  expect(events[0]?.data.plugins).toContainEqual(expect.objectContaining({ id: entry.id }))
  const completed = Promise.withResolvers<undefined>()
  const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation((error) => {
    if (error === control.replacementError) completed.resolve(undefined)
  })
  onTestFinished(() => { warn.mockRestore() })
  control.rejectOriginal = failRollback
  writeFileSync(filename, `export const apply = ctx => {
    const control = ctx.get('auditModuleControl')
    ctx.effect(() => async () => {
      control.replacementDisposing.resolve(undefined)
      await control.releaseReplacement.promise
    })
    throw control.replacementError
  }\n`)
  await originalDisposing.promise
  expect(events).toHaveLength(1)
  expect(notifications).toHaveLength(0)
  releaseOriginal.resolve(undefined)
  await replacementDisposing.promise
  expect(events).toHaveLength(1)
  expect(notifications).toHaveLength(0)
  releaseReplacement.resolve(undefined)
  await completed.promise
  await ctx.hmr.runExclusive(async () => {})
  expect(successful).toBe(0)
  expect(warn.mock.calls.at(-1)?.[0]).toBe(control.replacementError)
  expect(warn.mock.calls.some(([error]) => error === control.rollbackError)).toBe(failRollback)
  expect(readRuntimePluginIdentities(ctx).some(row => row.id === entry.id)).toBe(!failRollback)
  if (failRollback) {
    expect(events).toHaveLength(2)
    const last = events.at(-1)?.data
    expect(last?.reason).toBe('reload')
    expect(last?.plugins?.some(row => row.id === entry.id)).toBe(false)
    await expect(entry.fiber!.await()).rejects.toBe(control.rollbackError)
  } else {
    expect(ctx.get('auditLoadedProbe')).toBe('original')
    expect(events).toHaveLength(1)
  }
  expect(notifications).toEqual([[filename]])
})

it('audits actual nested Include state after watched reload attempts, including failed activation', async () => {
  let rejectActivation = false
  const { ctx, profile } = await configurationFixture({ watchFiles: true, schema: z.object({
    count: z.number().min(1).default(7).volatile().extra('extra', { audit: true }),
    remount: z.number().default(0),
  }), apply: () => { if (rejectActivation) throw new Error('activation rejected') } })
  const watcher = Reflect.get(ctx.hmr, 'watcher') as {
    on(event: 'add', listener: (filename: string) => void): object
    off(event: 'add', listener: (filename: string) => void): object
  }
  const added = Promise.withResolvers<undefined>()
  const onAdd = (filename: string): void => { if (filename === 'nested.yml') added.resolve(undefined) }
  watcher.on('add', onAdd)
  writeFileSync(join(profile.dir, 'nested.yml'), '- id: nested-probe\n  name: cordis:probe\n')
  try { await added.promise } finally { watcher.off('add', onAdd) }
  const tree = ctx.loader.resolve('include').subtree!
  const nestedId = await tree.create({ name: 'cordis:include', config: { path: 'nested.yml' } })
  await ctx.loader.await()
  const childId = `${nestedId}:nested-probe`
  const plugin = readRuntimePluginIdentities(ctx).find(row => row.id === childId)
  expect(plugin).toMatchObject({ plugin: 'cordis:probe', moduleSha256: null, package: null })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  await publish(ctx, ctx.sessions.create())
  expect(events.at(-1)?.data.configuration).toContainEqual(
    { id: childId, plugin: 'cordis:probe', values: { count: 7 } },
  )
  const reloadFile = async (content: string): Promise<void> => {
    const completed = Promise.withResolvers<undefined>()
    const unsubscribe = ctx.on('hmr/config-settled', (filenames) => {
      if (filenames.includes(join(profile.dir, 'nested.yml'))) completed.resolve(undefined)
    })
    try {
      writeFileSync(join(profile.dir, 'nested.yml'), content)
      await completed.promise
    } finally { unsubscribe() }
  }
  await reloadFile('- id: nested-probe\n  name: cordis:probe\n  config: { count: 9 }\n')
  expect(events.at(-1)?.data).toMatchObject({ reason: 'reload', configuration: [
    { id: childId, plugin: 'cordis:probe', values: { count: 9 } },
  ] })
  const beforeFailure = events.length
  await reloadFile('not: [valid YAML\n')
  expect(events).toHaveLength(beforeFailure)
  expect(plainConfig(ctx.loader.resolve(childId).fiber!.config)).toMatchObject({ count: 9 })
  await reloadFile('- id: nested-probe\n  name: cordis:probe\n  config: { count: 0 }\n')
  expect(events).toHaveLength(beforeFailure)
  expect(plainConfig(ctx.loader.resolve(childId).fiber!.config)).toMatchObject({ count: 9 })
  rejectActivation = true
  await reloadFile('- id: nested-probe\n  name: cordis:probe\n  config: { count: 9, remount: 1 }\n')
  expect(readRuntimePluginIdentities(ctx).some(row => row.id === childId)).toBe(false)
  expect(events.at(-1)?.data).toMatchObject({ reason: 'reload', configuration: [
    { id: childId, plugin: 'cordis:probe', values: null },
  ] })
  rejectActivation = false
  await reloadFile('- id: nested-probe\n  name: cordis:probe\n  config: { count: 11, remount: 2 }\n')
  expect(events.at(-1)?.data.configuration).toContainEqual(
    { id: childId, plugin: 'cordis:probe', values: { count: 11 } },
  )
  await reloadFile('[]\n')
  expect(events.at(-1)?.data).toMatchObject({ reason: 'reload', configuration: [
    { id: childId, plugin: 'cordis:probe', values: null },
  ] })
  const removed = events.at(-1)?.data
  if (removed?.reason !== 'reload') throw new Error('missing nested removal audit')
  expect(removed.plugins?.some(row => row.id === childId)).toBe(false)
})

it.each([false, true])('awaits removed nested resources before watched Include settlement and audit (activation failure: %s)', async (failActivation) => {
  const { ctx, profile } = await configurationFixture({ hmr: false })
  const started = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const drained = Promise.withResolvers<undefined>()
  const settled = Promise.withResolvers<undefined>()
  let removing = false
  let released = false
  onTestFinished(() => { release.resolve(undefined) })
  ctx.loader.builtins.heldAudit = { apply(owner: Context) {
    owner.effect(() => async () => {
      removing = true
      started.resolve(undefined)
      await release.promise
      released = true
    })
  } }
  ctx.loader.builtins.failedRemovalAudit = {
    Config: z.object({ fail: z.boolean().default(false) }),
    apply(_owner: Context, config: { fail: boolean }) { if (config.fail) throw new Error('nested replacement rejected') },
  }
  const filename = join(profile.dir, 'held-nested.yml')
  writeFileSync(filename, '- id: held\n  name: cordis:heldAudit\n- id: failing\n  name: cordis:failedRemovalAudit\n')
  const nestedId = await ctx.loader.resolve('include').subtree!.create({ name: 'cordis:include', config: { path: filename } })
  await ctx.loader.await()
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, { base: profile.dir, root: ['held-nested.yml'], ignored: [], debounce: 0,
    awaitWriteFinish: { stabilityThreshold: 30, pollInterval: 10 } })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  await publish(ctx, ctx.sessions.create())
  let notifications = 0
  ctx.on('hmr/config-settled', (filenames) => {
    if (!filenames.includes(filename)) return
    notifications += 1
    settled.resolve(undefined)
  })
  const originalAwait = ctx.loader.await.bind(ctx.loader)
  const observedAwait = vi.spyOn(ctx.loader, 'await').mockImplementation(async () => {
    await originalAwait()
    if (removing) drained.resolve(undefined)
  })
  onTestFinished(() => { observedAwait.mockRestore() })
  writeFileSync(filename, failActivation ? '- id: failing\n  name: cordis:failedRemovalAudit\n  config: { fail: true }\n' : '[]\n')
  await started.promise
  await drained.promise
  await Promise.resolve()
  expect(notifications).toBe(0)
  expect(events).toHaveLength(1)
  expect(released).toBe(false)
  release.resolve(undefined)
  await settled.promise
  expect(released).toBe(true)
  expect(notifications).toBe(1)
  expect(events.at(-1)?.data.reason).toBe('reload')
  expect(readRuntimePluginIdentities(ctx).some(row => row.id === `${nestedId}:held`)).toBe(false)
  expect(readRuntimePluginIdentities(ctx).some(row => row.id === `${nestedId}:failing`)).toBe(false)
  if (failActivation) await expect(ctx.loader.resolve(`${nestedId}:failing`).fiber!.await()).rejects.toThrow('nested replacement rejected')
})

it('reopens persisted runtime audit records without inventing historical identity', async () => {
  const { ctx, home } = await configurationFixture()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(home, 'audit-sessions'), compression: 'none' })
  const events: SessionEvent[] = []
  ctx.on('session/event', (_session, event) => { events.push(event) })
  const session = ctx.sessions.create()
  await publish(ctx, session)
  const writer = await ctx.sessionPersistence.create(session.header)
  try { await writer.append(events) } finally { await writer.close() }
  for (const access of ['read', 'write'] as const) {
    const reader = await ctx.sessionPersistence.open(session.id, access)
    try {
      const stored = await reader.read()
      expect(stored.events).toEqual(events)
      expect(stored.events.find(event => event.type === 'runtime/audit')?.data).toMatchObject({ runtime: null })
      const resumed = Session.create(session.id, stored.events, reader.header)
      expect(resumed.header.id).toBe(session.id)
    } finally { await reader.close() }
  }
})

it('records registered native provider retry defaults and effective updates without credential references', async () => {
  const { ctx } = await configurationFixture({ hmr: false })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  Object.assign(ctx.loader.builtins, { nativeApiKey: NativeApiKey, nativeAccount: NativeAccount })
  const nativeId = await ctx.loader.create({ name: 'cordis:nativeApiKey', config: { apiKeyEnv: 'PRIVATE_REFERENCE' } })
  await ctx.loader.create({ name: 'cordis:nativeAccount' })
  await ctx.loader.await()
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  await publish(ctx, ctx.sessions.create())
  const expected = () => ctx.llm.listProviders().map(({ id }) => ({ provider: id, policy: ctx.llm.providerRetryPolicy(id) }))
    .sort((a, b) => a.provider.localeCompare(b.provider))
  expect(events.at(-1)?.data).toMatchObject({ providerRetryPolicies: expected() })
  const policies = expected()
  expect(policies).toHaveLength(2)
  expect(policies.every(({ policy }) => policy.mode === 'normal' && policy.maxRetries === 5)).toBe(true)
  await ctx.loader.resolve(nativeId).update({ config: { apiKeyEnv: 'PRIVATE_REFERENCE', retryPolicy: { mode: 'always' } } })
  await ctx.loader.await()
  ctx.emit('app-boot/config-reload')
  expect(events.at(-1)?.data).toMatchObject({ reason: 'reload', providerRetryPolicies: expected() })
  expect(ctx.llm.providerRetryPolicy('deepseek-official').mode).toBe('always')
  expect(JSON.stringify(events)).not.toContain('PRIVATE_REFERENCE')
})

it('keeps the registered pi-ai retry policy when a conflicting configuration cannot replace its routes', async () => {
  const { ctx } = await configurationFixture({ hmr: false })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  Object.assign(ctx.loader.builtins, { nativeApiKey: NativeApiKey, piAi: PiAi })
  await ctx.loader.create({ name: 'cordis:nativeApiKey' })
  const route = { api: 'openai-completions', baseURL: 'https://example.invalid/v1',
    models: [{ id: 'audit-model', contextWindow: 4096, maxTokens: 128 }], retryPolicy: { mode: 'normal' } }
  const id = await ctx.loader.create({ name: 'cordis:piAi', config: { providers: { route } } })
  await ctx.loader.await()
  const events: SessionEvent<'runtime/audit'>[] = []
  ctx.on('session/event', (_session, event) => { if (event.type === 'runtime/audit') events.push(event) })
  await publish(ctx, ctx.sessions.create())
  await ctx.loader.resolve(id).update({ config: { providers: {
    route: { ...route, retryPolicy: { mode: 'always' } }, 'deepseek-official': route,
  } } })
  await ctx.loader.await()
  ctx.emit('app-boot/config-reload')
  expect(ctx.llm.providerRetryPolicy('route').mode).toBe('normal')
  expect(events.at(-1)?.data.configuration.find(row => row.id === id)?.values).toMatchObject({ providers: {
    route: { retryPolicy: { mode: 'always' } }, 'deepseek-official': { retryPolicy: { mode: 'normal' } },
  } })
  const lastPolicies = events.flatMap(event => event.data.providerRetryPolicies ?? []).filter(row => row.provider === 'route').at(-1)
  expect(lastPolicies?.policy.mode).toBe('normal')
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    auditLoadedProbe: string
    auditModuleControl: {
      rejectOriginal: boolean
      replacementError: Error
      rollbackError: Error
      originalDisposing: PromiseWithResolvers<undefined>
      releaseOriginal: PromiseWithResolvers<undefined>
      replacementDisposing: PromiseWithResolvers<undefined>
      releaseReplacement: PromiseWithResolvers<undefined>
    }
  }
}
