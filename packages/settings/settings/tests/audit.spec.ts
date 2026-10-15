/** Audited effective config survives log serialization and live profile reloads. */
import { expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { serializeSessionLog } from '@deepseek-ai/dsh-session-log-export'
import { auditConfiguration, installRuntimeAudit } from '../src/audit.ts'
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
