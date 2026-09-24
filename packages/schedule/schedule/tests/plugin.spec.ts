import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionLogOffset, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import { createAfterScheduleRecord, ScheduleId } from '../src/domain.ts'
import {
  SessionPersistence,
  SessionPersistenceNotFoundError,
  SessionPersistenceRevision,
} from '@deepseek-ai/dsh-session-persistence'
import type { SessionAccess, SessionHandle, SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import * as toolSchedule from '../src/index.ts'
import * as scheduleInvariant from '../src/invariant.ts'

interface StoredProbeSession {
  readonly header: SessionHeader
  readonly events: SessionEvent[]
}

/** In-memory handle-based persistence, just enough for agent-loop's write path. */
class PersistenceProbe extends SessionPersistence {
  private readonly stored = new Map<string, StoredProbeSession>()

  override async create(header: SessionHeader): Promise<SessionHandle> {
    const entry: StoredProbeSession = { header, events: [] }
    this.stored.set(header.id, entry)
    return this.handle(entry, 'write')
  }

  // Appends are durable on resolution here; nothing buffers, so the service-wide flush is a no-op.
  override async flush(): Promise<void> {}

  override async open(id: SessionId, access: SessionAccess): Promise<SessionHandle> {
    const entry = this.stored.get(id)
    if (entry === undefined) throw new SessionPersistenceNotFoundError(id)
    return this.handle(entry, access)
  }

  override async stat(id: SessionId): Promise<SessionPersistenceSnapshot | undefined> {
    const entry = this.stored.get(id)
    return entry === undefined ? undefined : this.snapshot(entry)
  }

  override async list(): Promise<SessionPersistenceSnapshot[]> {
    return [...this.stored.values()].map(entry => this.snapshot(entry))
  }

  replaceEvents(header: SessionHeader, events: readonly SessionEvent[]): void {
    this.stored.set(header.id, { header, events: structuredClone([...events]) })
  }

  private snapshot(entry: StoredProbeSession): SessionPersistenceSnapshot {
    return {
      header: entry.header,
      revision: SessionPersistenceRevision(`probe-${entry.header.id}-${entry.events.length}`),
      eventCount: entry.events.length,
    }
  }

  private handle(entry: StoredProbeSession, access: SessionAccess): SessionHandle {
    return {
      id: entry.header.id,
      header: entry.header,
      inheritedEventCount: SessionLogOffset(0),
      access,
      read: async (offset = 0, length = Number.MAX_SAFE_INTEGER) =>
        ({ eventState: 'detached', events: structuredClone(entry.events.slice(offset, offset + length)) }),
      append: async (events) => { entry.events.push(...events) },
      flush: async () => {},
      close: async () => {},
      [Symbol.asyncDispose]: async () => {},
    }
  }
}

async function harness(): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(PersistenceProbe)
  ctx.on('session/flush', () => {})
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function invalidScheduleEvent(): SessionEvent {
  return {
    type: 'schedule/change',
    seq: SessionSeq(0),
    time: Date.now(),
    data: { version: 9, operation: 'delete', id: 'missing' },
  } as unknown as SessionEvent
}

describe('Schedule plugin composition', () => {
  it('has the Loader-safe function-plugin export shape', () => {
    expect('default' in toolSchedule).toBe(false)
    expect(toolSchedule.name).toBe('schedule')
    expect(toolSchedule.inject).toEqual([
      'agents', 'sessions', 'tools', 'sessionPersistence', 'sessionProjections',
    ])
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(toolSchedule)).toBe(toolSchedule)
  })

  it('fails explicitly when the SessionProjectionRegistry provider is absent', () => {
    expect(() => { toolSchedule.apply(new Context()) }).toThrow(
      'Schedule requires the SessionProjectionRegistry service',
    )
  })

  it('rejects an invalid create baseline through AgentLoop before publication', async () => {
    const ctx = await harness()
    const invariant = await ctx.plugin(InvariantRegistry)
    const schedule = await ctx.plugin(scheduleInvariant)
    const id = SessionId('schedule-agent-create-invalid-baseline')

    await expect(ctx.agents.create({ sessionId: id, seed: [invalidScheduleEvent()] }))
      .rejects.toBeInstanceOf(InvariantError)
    expect(ctx.agents.get(id)).toBeUndefined()
    expect(ctx.sessions.get(id)).toBeUndefined()

    await schedule.dispose()
    await invariant.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects an invalid persisted resume baseline through AgentLoop before publication', async () => {
    const ctx = await harness()
    const id = SessionId('schedule-agent-resume-invalid-baseline')
    const original = await ctx.agents.create({ sessionId: id })
    const header = original.agent.session.header
    await original.dispose()
    const persistence = ctx.get('sessionPersistence')
    if (!(persistence instanceof PersistenceProbe)) throw new Error('expected the persistence probe')
    persistence.replaceEvents(header, [invalidScheduleEvent()])

    const invariant = await ctx.plugin(InvariantRegistry)
    const schedule = await ctx.plugin(scheduleInvariant)
    await expect(ctx.agents.resume({ resumeSessionId: id })).rejects.toBeInstanceOf(InvariantError)
    expect(ctx.agents.get(id)).toBeUndefined()
    expect(ctx.sessions.get(id)).toBeUndefined()

    await schedule.dispose()
    await invariant.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects and retries setup appends at the same sequence through AgentSetup', async () => {
    const ctx = await harness()
    const invariant = await ctx.plugin(InvariantRegistry)
    const schedule = await ctx.plugin(scheduleInvariant)
    const id = SessionId('schedule-agent-setup-append')
    let rejected: unknown
    let rejectedAt = -1
    let acceptedSequence = -1

    const handle = await ctx.agents.create({
      sessionId: id,
      setup: (_agentCtx, agent) => {
        try {
          agent.session.append('schedule/change', {
            version: 1,
            operation: 'delete',
            id: ScheduleId('missing'),
          })
        } catch (error: unknown) {
          rejected = error
          rejectedAt = agent.session.seq
        }
        acceptedSequence = agent.session.append('schedule/change', {
          version: 1,
          operation: 'create',
          schedule: createAfterScheduleRecord(ScheduleId('setup-retry'), 'setup retry', 30, 0),
        }).seq
      },
    })

    expect(rejected).toBeInstanceOf(InvariantError)
    expect(rejectedAt).toBe(0)
    expect(acceptedSequence).toBe(rejectedAt)
    expect(handle.agent.session.snapshotEvents()).toHaveLength(1)
    expect(ctx.sessionProjections.stateOf(handle.agent.session, 'schedule')).toMatchObject({
      active: [{ id: 'setup-retry' }],
      seenIds: ['setup-retry'],
    })

    await handle.dispose()
    await schedule.dispose()
    await invariant.dispose()
    await ctx.fiber.dispose()
  })

  it('installs only on future root agents and unwinds on plugin disposal', async () => {
    const ctx = await harness()
    const existing = await ctx.agents.create({ sessionId: SessionId('schedule-existing') })
    const plugin = await ctx.plugin(toolSchedule)
    expect(ctx.tools.get('schedule_create', existing.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_create')).toBeUndefined()

    const root = await ctx.agents.create({ sessionId: SessionId('schedule-root') })
    expect(ctx.tools.get('schedule_create', root.agent)?.name).toBe('schedule_create')
    expect(ctx.tools.get('schedule_list', root.agent)?.name).toBe('schedule_list')
    expect(ctx.tools.get('schedule_delete', root.agent)?.name).toBe('schedule_delete')
    expect(ctx.tools.get('schedule_create')).toBeUndefined()

    const created = await ctx.agents.withInitiator(root.agent, () => ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('schedule-plugin-create'),
      name: 'schedule_create',
      arguments: { prompt: 'future reminder', after_seconds: 3_600 },
      agent: root.agent,
    }))
    expect(created.isError).toBe(false)
    if (created.isError) throw new Error('expected Schedule create value')
    expect(created.value).toMatchObject({ id: 'schedule-1', deliveryMode: 'session-local' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'running' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })

    const child = await root.agent.ctx.agents.create({
      sessionId: SessionId('schedule-child'),
      parentAgent: root.agent,
    })
    expect(ctx.agents.roots()).toEqual([existing.agent, root.agent])
    expect(ctx.tools.get('schedule_create', child.agent)).toBeUndefined()

    const departing = await ctx.agents.create({ sessionId: SessionId('schedule-departing') })
    expect(ctx.tools.get('schedule_create', departing.agent)).toBeDefined()
    await departing.dispose()
    expect(ctx.tools.get('schedule_create', departing.agent)).toBeUndefined()

    await plugin.dispose()
    expect(ctx.tools.get('schedule_create', root.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_list', root.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_delete', root.agent)).toBeUndefined()

    await child.dispose()
    await root.dispose()
    await existing.dispose()
    await ctx.fiber.dispose()
  })

  it('does not checkpoint unrelated idle sessions', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(toolSchedule)
    const root = await ctx.agents.create({ sessionId: SessionId('schedule-unrelated-idle') })
    await settle()
    let flushes = 0
    const stopFlush = ctx.on('session/flush', (session) => {
      if (session === root.agent.session) flushes += 1
    })

    agentEvents(ctx, root.agent).emit('agent/status', { status: 'running' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(flushes).toBe(0)

    stopFlush()
    await root.dispose()
    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('checks the owned fork suffix before an idle durability preflight', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(toolSchedule)
    const inheritedSchedule = createAfterScheduleRecord(
      ScheduleId('schedule-inherited'), 'fork reminder', 3_600, Date.now(),
    )
    const inheritedEvent: SessionEvent = {
      type: 'schedule/change',
      seq: SessionSeq(0),
      time: Date.now(),
      data: { version: 1, operation: 'create', schedule: inheritedSchedule },
    }
    const inheritedOptions = {
      seed: [inheritedEvent],
      inheritedEventCount: SessionLogOffset(1),
      meta: { parentSession: SessionId('schedule-fork-parent'), isSeeded: true },
    }
    const inherited = await ctx.agents.create({
      sessionId: SessionId('schedule-inherited-idle'),
      ...inheritedOptions,
    })
    const owned = await ctx.agents.create({
      sessionId: SessionId('schedule-owned-idle'),
      ...inheritedOptions,
    })
    const ownedSchedule = createAfterScheduleRecord(
      ScheduleId('schedule-owned'), 'child reminder', 3_600, Date.now(),
    )
    owned.agent.session.append('schedule/change', { version: 1, operation: 'create', schedule: ownedSchedule })
    await settle()

    expect(ctx.sessionProjections.stateOf(inherited.agent.session, 'schedule')).toMatchObject({ active: [], seenIds: [] })
    expect(ctx.sessionProjections.stateOf(owned.agent.session, 'schedule')).toMatchObject({
      active: [{ id: 'schedule-owned' }],
      seenIds: ['schedule-owned'],
    })

    let inheritedFlushes = 0
    let ownedFlushes = 0
    const stopFlush = ctx.on('session/flush', (session) => {
      if (session === inherited.agent.session) inheritedFlushes += 1
      if (session === owned.agent.session) ownedFlushes += 1
    })
    for (const agent of [inherited.agent, owned.agent]) {
      agentEvents(ctx, agent).emit('agent/status', { status: 'running' })
      agentEvents(ctx, agent).emit('agent/status', { status: 'idle' })
    }
    await settle()

    expect(inheritedFlushes).toBe(0)
    expect(ownedFlushes).toBe(1)
    stopFlush()
    await inherited.dispose()
    await owned.dispose()
    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('keeps the shared projection available until both contributors dispose in either order', async () => {
    for (const first of ['schedule', 'invariant'] as const) {
      const ctx = await harness()
      await ctx.plugin(InvariantRegistry)
      const session = ctx.sessions.create(SessionId(`schedule-shared-projection-${first}`))
      const schedule = await ctx.plugin(toolSchedule)
      const invariant = await ctx.plugin(scheduleInvariant)

      const disposeFirst = first === 'schedule' ? schedule : invariant
      const disposeLast = first === 'schedule' ? invariant : schedule
      await disposeFirst.dispose()
      expect(ctx.sessionProjections.stateOf(session, 'schedule')).toMatchObject({
        inheritedEventCount: session.inheritedEventCount,
        active: [],
        seenIds: [],
      })

      session.append('schedule/change', {
        version: 1,
        operation: 'create',
        schedule: {
          id: ScheduleId('schedule-1'),
          kind: 'after',
          prompt: 'shared projection remains live',
          afterSeconds: 3_600,
          scheduledAt: '2026-08-05T13:00:00.000Z',
        },
      })
      expect(ctx.sessionProjections.stateOf(session, 'schedule')).toMatchObject({
        active: [{ id: 'schedule-1' }],
        seenIds: ['schedule-1'],
      })

      await disposeLast.dispose()
      expect(ctx.sessionProjections.stateOf(session, 'schedule')).toBeUndefined()
      await ctx.fiber.dispose()
    }
  })
})
