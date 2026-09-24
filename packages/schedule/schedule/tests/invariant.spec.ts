import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset, SessionPreparation, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import * as scheduleInvariant from '../src/invariant.ts'
import { scheduleProjectionDefinition } from '../src/projection.ts'
import { ScheduleId } from '../src/domain.ts'
import type { ScheduleChange } from '../src/types.ts'

function event(data: unknown, seq: SessionSeq): SessionEvent {
  return { type: 'schedule/change', seq, time: 1, data } as SessionEvent
}

function create(id: string): ScheduleChange {
  return {
    version: 1,
    operation: 'create',
    schedule: {
      id: ScheduleId(id),
      kind: 'after',
      prompt: 'check logs',
      afterSeconds: 1,
      scheduledAt: '2026-08-05T12:00:01.000Z',
    },
  }
}

function createEvery(id: string): ScheduleChange {
  return {
    version: 1,
    operation: 'create',
    schedule: {
      id: ScheduleId(id),
      kind: 'every',
      prompt: 'check metrics',
      everySeconds: 300,
      scheduledAt: '2026-08-05T12:05:00.000Z',
    },
  }
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(InvariantRegistry)
  const fiber = await ctx.plugin(scheduleInvariant)
  return { ctx, fiber }
}

describe('Schedule package invariant', () => {
  it('accepts valid candidates and rejects invalid transitions before append', async () => {
    const { ctx } = await harness()
    const session = ctx.sessions.create(SessionId('schedule-invariant'))
    session.append('turn/start', { turn: 1 })
    session.append('schedule/change', create('schedule-1'))
    expect(session.snapshotEvents()).toHaveLength(2)

    expect(() => session.append('schedule/change', {
      version: 1,
      operation: 'delete',
      id: ScheduleId('missing'),
    })).toThrow(InvariantError)
    expect(session.snapshotEvents()).toHaveLength(2)

    session.append('schedule/change', { version: 1, operation: 'dispatch', id: ScheduleId('schedule-1') })
    expect(session.snapshotEvents()).toHaveLength(3)
    await ctx.fiber.dispose()
  })

  it('requires a decision time for Every dispatch and advances the live stream', async () => {
    const { ctx } = await harness()
    const session = ctx.sessions.create(SessionId('schedule-every-invariant'))
    session.append('schedule/change', createEvery('schedule-every'))
    expect(() => session.append('schedule/change', {
      version: 1,
      operation: 'dispatch',
      id: ScheduleId('schedule-every'),
    })).toThrow(InvariantError)
    session.append('schedule/change', {
      version: 1,
      operation: 'dispatch',
      id: ScheduleId('schedule-every'),
      acceptedAt: '2026-08-05T12:17:34.000Z',
    })
    expect(session.snapshotEvents()).toHaveLength(2)
    await ctx.fiber.dispose()
  })

  it('fails setup when an existing eventful session has no projection baseline', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(InvariantRegistry)
    ctx.sessions.create(SessionId('schedule-invalid-seed'), {
      seed: [event({ version: 9, operation: 'delete', id: 'schedule-1' }, SessionSeq(0))],
    })
    await expect(ctx.plugin(scheduleInvariant).then(() => undefined)).rejects.toThrow(/baseline/)
    await ctx.fiber.dispose()
  })

  it('rejects a malformed seeded session created after companion setup', async () => {
    const { ctx } = await harness()
    const id = SessionId('schedule-invalid-future-seed')
    expect(() => ctx.sessions.create(id, {
      seed: [event({ version: 9, operation: 'delete', id: 'schedule-1' }, SessionSeq(0))],
    })).toThrow(InvariantError)
    expect(ctx.sessions.get(id)).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it.each(['create', 'resume'] as const)('rejects an invalid %s preparation baseline with the Schedule invariant', async (source) => {
    const { ctx } = await harness()
    const invalid = event({ version: 9, operation: 'delete', id: 'missing' }, SessionSeq(0))
    const id = SessionId(`schedule-invalid-${source}-preparation`)
    const options = source === 'resume'
      ? {
        seed: [invalid],
        meta: { version: SESSION_FORMAT_VERSION as typeof SESSION_FORMAT_VERSION, id, createdAt: 1, isSeeded: false },
        inheritedEventCount: SessionLogOffset(0),
        eventState: 'detached' as const,
      }
      : { seed: [invalid] }
    const prepared = ctx.sessions.prepare(id, options)
    const preparation = SessionPreparation.create(prepared)

    expect(() => { ctx.sessionProjections.prepareSession(preparation) }).toThrow(InvariantError)
    expect(prepared.snapshotEvents()).toEqual(preparation.baseline.events)
    expect(prepared.seq).toBe(preparation.baseline.events.length)

    preparation[Symbol.dispose]()
    await ctx.fiber.dispose()
  })

  it('rejects an invalid setup append before commit and accepts a valid retry at the same sequence', async () => {
    const { ctx } = await harness()
    const prepared = ctx.sessions.prepare(SessionId('schedule-setup-preflight'))
    const preparation = SessionPreparation.create(prepared)
    ctx.sessionProjections.prepareSession(preparation)
    const before = ctx.sessionProjections.stateOf(prepared, 'schedule')

    expect(() => prepared.append('schedule/change', {
      version: 1,
      operation: 'delete',
      id: ScheduleId('missing'),
    })).toThrow(InvariantError)
    expect(prepared.seq).toBe(0)
    expect(prepared.snapshotEvents()).toEqual([])
    expect(ctx.sessionProjections.stateOf(prepared, 'schedule')).toBe(before)

    const accepted = prepared.append('schedule/change', create('retry'))
    expect(accepted.seq).toBe(0)
    expect(ctx.sessionProjections.stateOf(prepared, 'schedule')).toMatchObject({
      active: [{ id: 'retry' }],
      seenIds: ['retry'],
    })

    preparation[Symbol.dispose]()
    await ctx.fiber.dispose()
  })

  it('replays accepted setup appends once and ignores invalid inherited Schedule events at a fork cut', async () => {
    const { ctx } = await harness()
    const prepared = ctx.sessions.prepare(SessionId('schedule-prepared-fork'), {
      seed: [event({ version: 9, operation: 'delete', id: 'parent' }, SessionSeq(0))],
      inheritedEventCount: SessionLogOffset(1),
      meta: { parentSession: SessionId('parent'), isSeeded: true },
    })
    const preparation = SessionPreparation.create(prepared)
    const accepted = prepared.append('schedule/change', create('child'))

    ctx.sessionProjections.prepareSession(preparation)
    expect(ctx.sessionProjections.stateOf(prepared, 'schedule')).toMatchObject({
      inheritedEventCount: SessionLogOffset(1),
      active: [{ id: 'child' }],
      seenIds: ['child'],
    })
    expect(accepted.seq).toBe(2)

    preparation[Symbol.dispose]()
    await ctx.fiber.dispose()
  })

  it('keeps accepted events when Schedule rejects preparation-time replay', async () => {
    const { ctx } = await harness()
    const prepared = ctx.sessions.prepare(SessionId('schedule-replay-preflight'))
    const preparation = SessionPreparation.create(prepared)
    const accepted = prepared.append('schedule/change', {
      version: 1,
      operation: 'delete',
      id: ScheduleId('missing'),
    })

    expect(() => { ctx.sessionProjections.prepareSession(preparation) }).toThrow(InvariantError)
    expect(prepared.seq).toBe(1)
    expect(prepared.snapshotEvents()).toEqual([accepted])

    preparation[Symbol.dispose]()
    await ctx.fiber.dispose()
  })

  it('checks the registered projection after a valid seeded session is created', async () => {
    const { ctx } = await harness()
    const stateOf = vi.spyOn(ctx.sessionProjections, 'stateOf')
    const session = ctx.sessions.create(SessionId('schedule-valid-seeded-session'), {
      seed: [event(create('schedule-seeded'), SessionSeq(0))],
    })

    expect(stateOf).toHaveBeenCalledWith(session, 'schedule')
    expect(ctx.sessionProjections.stateOf(session, 'schedule')).toMatchObject({
      active: [{ id: 'schedule-seeded' }],
      seenIds: ['schedule-seeded'],
    })
    await ctx.fiber.dispose()
  })

  it('ignores inherited Schedule events before a fork seed boundary', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(InvariantRegistry)
    ctx.sessionProjections.register(scheduleProjectionDefinition)
    const child = ctx.sessions.create(SessionId('schedule-fork'), {
      seed: [event({ version: 9, operation: 'delete', id: 'parent' }, SessionSeq(0))],
      inheritedEventCount: SessionLogOffset(1),
      meta: { parentSession: SessionId('parent'), isSeeded: true },
    })
    const fiber = await ctx.plugin(scheduleInvariant)
    expect(ctx.sessionProjections.stateOf(child, 'schedule')).toMatchObject({
      inheritedEventCount: SessionLogOffset(1),
      active: [],
      seenIds: [],
    })
    child.append('schedule/change', create('child'))
    expect(child.snapshotEvents().at(-1)?.data).toMatchObject({ operation: 'create' })
    expect(ctx.sessionProjections.stateOf(child, 'schedule')).toMatchObject({
      inheritedEventCount: SessionLogOffset(1),
      active: [{ id: 'child' }],
      seenIds: ['child'],
    })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
