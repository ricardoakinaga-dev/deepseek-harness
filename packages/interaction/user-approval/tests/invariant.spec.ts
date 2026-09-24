import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionLogOffset,
  SessionSeq,
} from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'
import * as ApprovalInvariant from '@deepseek-ai/dsh-user-approval/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { installApprovalSessionLease } from '../src/session-state.ts'
import type { ApprovalSessionLease } from '../src/session-state.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(ApprovalInvariant)
  return ctx
}

function startTurn(session: Session): void {
  session.append('turn/start', { turn: 1 })
}

async function mountApprovalStateLease(ctx: Context) {
  let lease!: ApprovalSessionLease
  const plugin = Object.assign((scope: Context) => {
    lease = installApprovalSessionLease(scope, (message) => { throw new Error(message) })
  }, { inject: ['sessions'] as const })
  const fiber = await ctx.plugin(plugin)
  return { fiber, lease }
}

describe('approval invariants', () => {
  it('accepts paired audit events and closed policy values', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    startTurn(session)
    const id = ApprovalRequestId('ask-1')
    session.append('approval/asked', { id, toolName: 'bash' })
    session.append('approval/decided', { id, outcome: 'allowed-once' })
    session.append('approval/policy', { policy: 'never' })
  })

  it('rebuilds an unmatched question from an existing session', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(ApprovalService)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    const id = ApprovalRequestId('ask-resume')
    session.append('approval/asked', { id, toolName: 'bash' })
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(ApprovalInvariant)
    expect(() => session.append('approval/decided', { id, outcome: 'cancelled' })).not.toThrow()
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  })

  it('folds restored and forked creation baselines with a constructor marker', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const service = await ctx.plugin(ApprovalService)
    const stateFiber = await mountApprovalStateLease(ctx)
    const id = SessionId('approval-restored-baseline')
    const requestId = ApprovalRequestId('approval-restored-pending')
    const seed: SessionEvent[] = [
      { type: 'turn/start', seq: SessionSeq(0), time: 0, data: { turn: 1 } },
      { type: 'approval/policy', seq: SessionSeq(1), time: 1, data: { policy: 'never' } },
      { type: 'approval/asked', seq: SessionSeq(2), time: 2, data: { id: requestId, toolName: 'bash' } },
      { type: 'turn/end', seq: SessionSeq(3), time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    const restored = ctx.sessions.prepare(id, {
      seed,
      meta: { id, version: SESSION_FORMAT_VERSION, createdAt: 0, isSeeded: false },
      inheritedEventCount: SessionLogOffset(0),
      eventState: 'detached',
    })
    const detach = ctx.sessions.enter(restored)
    try {
      ctx.sessions.announce(restored)
    } catch (error: unknown) {
      detach()
      throw error
    }

    expect(stateFiber.lease.readCurrent(restored)).toMatchObject({
      lastSeq: restored.seq - 1,
      openTurn: null,
      latestPolicy: 'never',
    })
    expect(stateFiber.lease.readCurrent(restored).pendingIds).toEqual(new Set([requestId]))
    expect(ctx.approval.overrideOf(restored)).toBe('never')

    const fork = ctx.sessions.fork(restored, SessionSeq(3), SessionId('approval-fork-baseline'))
    expect(stateFiber.lease.readCurrent(fork)).toMatchObject({
      lastSeq: fork.seq - 1,
      openTurn: null,
      latestPolicy: 'never',
    })
    expect(stateFiber.lease.readCurrent(fork).pendingIds).toEqual(new Set([requestId]))
    fork.append('turn/start', { turn: 2 })
    expect(stateFiber.lease.readCurrent(fork)).toMatchObject({
      openTurn: 2,
      pendingIds: new Set([requestId]),
    })

    await stateFiber.fiber.dispose()
    await service.dispose()
  })

  it('latches session events observed before a valid creation baseline', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const owner = await mountApprovalStateLease(ctx)
    const session = ctx.sessions.prepare(SessionId('bare-approval-session'))
    expect(() => {
      ctx.emit('session/event', session, {
        type: 'turn/start', seq: SessionSeq(0), time: 0,
        data: { turn: 1 },
      })
    }).not.toThrow()
    await ctx.plugin(InvariantRegistry)
    const invariant = await ctx.plugin(ApprovalInvariant)
    const detach = ctx.sessions.enter(session)
    try {
      expect(() => { ctx.sessions.announce(session) }).toThrow(/arrived before a valid creation baseline/)
    } finally {
      detach()
    }
    await invariant.dispose()
    await owner.fiber.dispose()
  })

  it('shares one exact fold across provider leases and refuses eventful reconstruction after final release', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const first = await mountApprovalStateLease(ctx)
    const session = ctx.sessions.create()
    const registry = (ctx.root as unknown as { [key: symbol]: unknown })[
      Symbol.for('@deepseek-ai/dsh-user-approval/session-state')
    ] as { entries: WeakMap<Session, { leases: Set<{ sessions: Set<Session> }> }> }
    const leaseCount = (): number => registry.entries.get(session)?.leases.size ?? 0
    expect(leaseCount()).toBe(1)
    session.append('turn/start', { turn: 1 })
    session.append('approval/policy', { policy: 'never' })
    expect(first.lease.readCurrent(session).latestPolicy).toBe('never')
    const second = await mountApprovalStateLease(ctx)
    expect(leaseCount()).toBe(2)
    expect(second.lease.readCurrent(session).lastSeq).toBe(session.seq - 1)

    await first.fiber.dispose()
    expect(() => first.lease.readCurrent(session)).toThrow(/lease has been released/)
    expect(leaseCount()).toBe(1)
    session.append('approval/policy', { policy: 'ask' })
    expect(second.lease.readCurrent(session).latestPolicy).toBe('ask')
    const reloaded = await mountApprovalStateLease(ctx)
    expect(reloaded.lease.readCurrent(session).latestPolicy).toBe('ask')
    expect(leaseCount()).toBe(2)

    await second.fiber.dispose()
    expect(() => second.lease.readCurrent(session)).toThrow(/lease has been released/)
    expect(leaseCount()).toBe(1)
    await reloaded.fiber.dispose()
    expect(() => reloaded.lease.readCurrent(session)).toThrow(/lease has been released/)
    expect(leaseCount()).toBe(0)
    expect(ctx.sessions.list()).toContain(session)
    expect(session.seq).toBeGreaterThan(0)
    session.append('approval/policy', { policy: 'never' })

    let activationFailure: unknown
    try {
      await mountApprovalStateLease(ctx)
    } catch (error: unknown) {
      activationFailure = error
    }
    expect(activationFailure instanceof Error ? activationFailure.message : String(activationFailure))
      .toMatch(/eventful Session has no exact approval state fold/)

    const emptyCtx = new Context()
    await emptyCtx.plugin(SessionStore)
    const empty = emptyCtx.sessions.create()
    const firstEmptyLease = await mountApprovalStateLease(emptyCtx)
    expect(firstEmptyLease.lease.readCurrent(empty).lastSeq).toBe(-1)
    await firstEmptyLease.fiber.dispose()
    const reactivated = await mountApprovalStateLease(emptyCtx)
    expect(reactivated.lease.readCurrent(empty).lastSeq).toBe(-1)
  })

  it('rejects audit events outside any open turn', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    const reader = await mountApprovalStateLease(ctx)
    const before = reader.lease.readCurrent(session)
    expect(() => session.append('approval/asked', {
      id: ApprovalRequestId('ask-1'), toolName: 'bash',
    })).toThrow(/outside any open turn/)
    expect(() => session.append('approval/decided', {
      id: ApprovalRequestId('ask-1'), outcome: 'rejected',
    })).toThrow(/outside any open turn/)
    expect(reader.lease.readCurrent(session)).toEqual(before)
    await reader.fiber.dispose()
  })

  it('rejects an unenclosed audit event when replaying an existing session', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(ApprovalService)
    const session = ctx.sessions.create()
    startTurn(session)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('approval/asked', {
      id: ApprovalRequestId('ask-replay'), toolName: 'bash',
    })
    await ctx.plugin(InvariantRegistry)
    await expect(ctx.plugin(ApprovalInvariant).then(() => undefined)).rejects.toThrow(/outside any open turn/)
  })

  it('rejects malformed and unpaired audit events', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    startTurn(session)
    const id = ApprovalRequestId('ask-1')
    expect(() => session.append('approval/asked', { id, toolName: '' }))
      .toThrow(/toolName must be non-empty/)
    session.append('approval/asked', { id, toolName: 'bash' })
    expect(() => session.append('approval/asked', { id, toolName: 'bash' }))
      .toThrow(/repeated open id/)
    expect(() => session.append('approval/decided', {
      id: ApprovalRequestId('missing'), outcome: 'rejected',
    })).toThrow(/no matching approval\/asked/)
    expect(() => session.append('approval/decided', { id, outcome: 'maybe' as never }))
      .toThrow(/unknown outcome/)
    expect(() => session.append('approval/policy', { policy: 'always' as never }))
      .toThrow(/unknown policy/)
  })
})
