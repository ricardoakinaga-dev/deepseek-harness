import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import SessionStore, { SessionSeq, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import * as PermissionInvariant from '@deepseek-ai/dsh-permission-presets/invariant'
import PermissionPresetService from '@deepseek-ai/dsh-permission-presets'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { installPresetHistoryLease } from '../src/preset-history.ts'
import type { PresetHistoryLease } from '../src/preset-history.ts'

class PermissionProbe extends Service {
  readonly names = ['safe', 'trusted']

  constructor(ctx: Context) {
    super(ctx, 'permissionPresets')
  }
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(PermissionProbe)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(PermissionInvariant)
  return ctx
}

async function setupProvider(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.provide('shell', {
    sandboxMode: 'workspace-write',
    resolve() { throw new Error('permission invariant tests do not execute bash') },
    run() { throw new Error('permission invariant tests do not execute bash') },
    start() { throw new Error('permission invariant tests do not execute bash') },
  })
  ctx.provide('approval', { config: { policy: 'ask' } })
  await ctx.plugin(PermissionPresetService)
  return ctx
}

function presetEvent(preset: string): SessionEvent {
  return { type: 'permission/preset', seq: SessionSeq(0), time: 0, data: { preset } }
}

async function mountHistoryLease(ctx: Context, onCreated?: (session: Session) => void) {
  let lease!: PresetHistoryLease
  const plugin = Object.assign((scope: Context) => {
    lease = installPresetHistoryLease(scope, (message) => { throw new Error(message) }, onCreated)
  }, { inject: ['sessions'] as const })
  const fiber = await ctx.plugin(plugin)
  return { fiber, lease }
}

describe('permission invariants', () => {
  it('shares the exact preset history fold across provider leases and requires a live fold for eventful reactivation', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    let seeded = false
    const first = await mountHistoryLease(ctx, (session) => {
      if (seeded) return
      seeded = true
      session.append('permission/preset', { preset: 'safe' })
    })
    const second = await mountHistoryLease(ctx)
    const session = ctx.sessions.create()
    expect(first.lease.readCurrent(session).observedPresets).toEqual(new Set(['safe']))
    expect(second.lease.readCurrent(session).lastSeq).toBe(session.seq - 1)

    await first.fiber.dispose()
    session.append('permission/preset', { preset: 'trusted' })
    expect(second.lease.readCurrent(session).observedPresets).toEqual(new Set(['safe', 'trusted']))
    const reloaded = await mountHistoryLease(ctx)
    expect(reloaded.lease.readCurrent(session).lastSeq).toBe(session.seq - 1)

    await second.fiber.dispose()
    await reloaded.fiber.dispose()
    session.append('permission/preset', { preset: 'trusted' })
    await expect(mountHistoryLease(ctx)).rejects.toThrow(/eventful Session has no exact preset history fold/)

    const emptyCtx = new Context()
    await emptyCtx.plugin(SessionStore)
    const empty = emptyCtx.sessions.create()
    const firstEmptyLease = await mountHistoryLease(emptyCtx)
    expect(firstEmptyLease.lease.readCurrent(empty).lastSeq).toBe(-1)
    await firstEmptyLease.fiber.dispose()
    const reactivated = await mountHistoryLease(emptyCtx)
    expect(reactivated.lease.readCurrent(empty).lastSeq).toBe(-1)
  })

  it('does not heal a session/event that arrived before its creation baseline', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await mountHistoryLease(ctx)
    const session = ctx.sessions.prepare()
    expect(() => { ctx.emit('session/event', session, presetEvent('safe')) }).not.toThrow()
    const detach = ctx.sessions.enter(session)
    try {
      expect(() => { ctx.sessions.announce(session) }).toThrow(/arrived before a valid creation baseline/)
    } finally {
      detach()
    }
  })

  it('accepts configured preset events and ignores other session data', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    expect(() => session.append('permission/preset', { preset: 'safe' })).not.toThrow()
    expect(() => session.append('sandbox/mode', { mode: 'read-only' })).not.toThrow()
    expect(() => { ctx.emit('tools/change') }).not.toThrow()
  })

  it('rejects a durable preset that the active table cannot resolve', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    const history = await mountHistoryLease(ctx)
    const before = history.lease.readCurrent(session)
    expect(() => session.append('permission/preset', { preset: 'missing' }))
      .toThrow(/unknown preset "missing"/)
    expect(history.lease.readCurrent(session)).toEqual(before)
    await history.fiber.dispose()
  })

  it('rejects an unknown preset already present on late registration', async () => {
    const ctx = await setupProvider()
    const missing = presetEvent('missing')
    ctx.sessions.create(undefined, { seed: [missing] })
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(PermissionInvariant).then(() => undefined)).rejects.toThrow(/unknown preset "missing"/)
  })

  it('admits Auto history only while its integration is registered', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    expect(() => session.append('permission/preset', { preset: 'auto' }))
      .toThrow(/unavailable preset "auto"/)
  })
})
