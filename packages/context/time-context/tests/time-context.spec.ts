import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { createUserMessage, ToolCallId, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, SessionLogOffset, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { unsupportedInbox, mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as timeContext from '@deepseek-ai/dsh-time-context'
import type { Config } from '@deepseek-ai/dsh-time-context'
import { timeContextCacheFingerprint } from '../src/projection.ts'
import type { TimeContextProjection } from '../src/projection.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'compaction-basic': { kind: 'compaction-basic' } & ContextFormed
    'time-context-test': { kind: 'time-context-test' } & ContextFormed
  }
}

const BASE = Date.parse('2026-07-14T00:00:00.000Z')
const ORIGINAL_TIME_ZONE = process.env['TZ']
const SIGNAL = new AbortController().signal

beforeEach(() => {
  process.env['TZ'] = 'UTC'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(BASE)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (ORIGINAL_TIME_ZONE === undefined) delete process.env['TZ']
  else process.env['TZ'] = ORIGINAL_TIME_ZONE
})

async function mount(config: Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  const fiber = await ctx.plugin(timeContext, config)
  return { ctx, fiber }
}

/** Enter a constructed Session through the lifecycle that owns its projection cells. */
function newSession(ctx: Context, id: SessionId, seed?: readonly SessionEvent[]): Session {
  const session = Session.create(id, seed)
  ctx.sessions.enter(session)
  ctx.sessions.announce(session)
  return session
}

function sessionAgent(session: Session, id = 'agent'): Agent {
  const agent: Agent = {
    id: SessionId(id),
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('time-context must append directly to the open step') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  return agent
}

function openMessageTurn(session: Session, turn: number, clientTimeZone?: string): void {
  session.append('turn/start', { turn })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: `turn ${turn}` }],
    source: clientTimeZone === undefined
      ? { kind: 'user' }
      : { kind: 'user', rpcId: `turn-${String(turn)}`, clientTimeZone } as never,
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn, step: 1 })
}

function browserZoneMessage(timeZone: string): ReturnType<typeof createUserMessage> {
  return createUserMessage({
    content: [{ type: 'text', text: timeZone }],
    source: { kind: 'user', rpcId: `proposal-${timeZone}`, clientTimeZone: timeZone } as never,
  })
}

/** Put a focused request fixture at the durable turn and step passed to its listener. */
function prepareStep(ctx: Context, session: Session, turn: number, step: number): void {
  let state = ctx.sessionProjections.stateOf(session, 'timeContext')
  if (state === undefined) return
  if (state.openTurn !== turn) {
    if (state.openStep !== null && state.openTurn !== null) {
      session.append('step/end', { turn: state.openTurn, step: state.openStep })
    }
    if (state.openTurn !== null) {
      session.append('turn/end', { turn: state.openTurn, reason: { kind: 'completed' } })
    }
    session.append('turn/start', { turn })
    state = ctx.sessionProjections.stateOf(session, 'timeContext')
    if (state === undefined) return
  }
  if (state.openStep === step) return
  if (state.openStep !== null) {
    if (state.openStep > step) throw new Error(`cannot prepare earlier step ${step} after ${state.openStep}`)
    session.append('step/end', { turn, step: state.openStep })
  }
  let nextStep = state.openStep === null ? 1 : state.openStep + 1
  while (nextStep < step) {
    session.append('step/start', { turn, step: nextStep })
    session.append('step/end', { turn, step: nextStep })
    nextStep += 1
  }
  session.append('step/start', { turn, step })
}

function contextTexts(session: Session): string[] {
  const texts: string[] = []
  for (const event of session.snapshotEvents()) {
    if (event.type === 'user/message'
      && event.data.source.kind === 'time-context') {
      texts.push(event.data.content.find(block => block.type === 'text')?.text ?? '')
    }
  }
  return texts
}

async function fire(
  ctx: Context,
  agent: Agent,
  turn: number,
  step: number,
  signal: AbortSignal = SIGNAL,
): Promise<void> {
  prepareStep(ctx, agent.session, turn, step)
  const proposed = createUserMessage({
    content: [{ type: 'text', text: 'request proposal' }],
    source: { kind: 'time-context-test' },
  })
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [proposed], turn, step, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [proposed] }),
  )
  if (decision.kind === 'enter') {
    for (const message of decision.messages) {
      if (message === proposed) continue
      agent.session.append('user/message', message, { surfaceOp: 'append' })
    }
  }
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolCallResponse(): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: ToolCallId('tick-1'), name: 'tick', arguments: '{}' },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: StreamChunk[][]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ScriptedAdapter: script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

async function loopHarness(adapter: ScriptedAdapter, config: Config = {}): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(timeContext, config)
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function requestText(request: GenerateOptions): string {
  return request.messages
    .flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

describe('durable step context', () => {
  it('records turn, step, zoned time, and the preceding model-visible message baseline', async () => {
    const { ctx } = await mount({ timeZone: 'Asia/Shanghai' })
    const session = newSession(ctx, SessionId('first'))
    openMessageTurn(session, 1, 'Asia/Shanghai')
    vi.setSystemTime(BASE + 90_061_000)

    await fire(ctx, sessionAgent(session), 1, 1)

    expect(contextTexts(session)).toEqual([
      'Time sampled while preparing turn 1, step 1: 2026-07-15T09:01:01+08:00[Asia/Shanghai]\n'
      + 'Browser time zone for this request: Asia/Shanghai. Interpret otherwise-unqualified dates and times in this zone.\n'
      + 'Elapsed since the preceding model-visible message: 1d 1h 1m 1s.',
    ])
    const event = session.snapshotEvents().at(-1)
    expect(event?.type).toBe('user/message')
    if (event?.type !== 'user/message') throw new Error('missing time context')
    // The reading is a `snapshot`-form context: one named contribution whose
    // text is exactly what the model read, so a consumer attributes it without
    // re-splitting prose.
    expect(event.data.source).toEqual({
      kind: 'time-context',
      form: 'snapshot',
      sections: [{
        name: 'time-context',
        text: 'Time sampled while preparing turn 1, step 1: 2026-07-15T09:01:01+08:00[Asia/Shanghai]\n'
          + 'Browser time zone for this request: Asia/Shanghai. Interpret otherwise-unqualified dates and times in this zone.\n'
          + 'Elapsed since the preceding model-visible message: 1d 1h 1m 1s.',
      }],
    })
    expect(event.surfaceOp).toBe('append')
  })

  it('reports an unavailable first-step baseline when no model-visible message precedes it', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('unavailable'))
    session.append('turn/start', { turn: 1 })

    await fire(ctx, sessionAgent(session), 1, 1)

    expect(contextTexts(session)[0]).toContain(
      'Elapsed since the preceding model-visible message: unavailable.',
    )
  })

  it('uses the preceding durable step-context timestamp after step one with zero interval', async () => {
    const { ctx } = await mount({ refreshIntervalMs: 0 })
    const session = newSession(ctx, SessionId('later-step'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 3)
    await fire(ctx, agent, 3, 1)
    vi.setSystemTime(BASE + 61_000)

    await fire(ctx, agent, 3, 2)

    expect(contextTexts(session)[1]).toBe(
      'Time sampled while preparing turn 3, step 2: 2026-07-14T00:01:01+00:00[UTC]\n'
      + 'Browser time zone for this request: unavailable. Ask the user to clarify otherwise-unqualified dates and times.\n'
      + 'Elapsed since the preceding step context: 1m 1s.',
    )
  })

  it('formats in one browser zone and falls back when steering supplies mixed zones', async () => {
    const { ctx } = await mount({ timeZone: 'UTC' })
    const resolved = newSession(ctx, SessionId('browser-zone-resolved'))
    openMessageTurn(resolved, 1, 'America/New_York')
    await fire(ctx, sessionAgent(resolved), 1, 1)
    expect(contextTexts(resolved)[0]).toContain(
      '2026-07-13T20:00:00-04:00[America/New_York]\n'
      + 'Browser time zone for this request: America/New_York. '
      + 'Interpret otherwise-unqualified dates and times in this zone.',
    )

    const mixed = newSession(ctx, SessionId('browser-zone-mixed'))
    openMessageTurn(mixed, 1, 'Asia/Shanghai')
    mixed.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'steering from another browser' }],
      source: {
        kind: 'user',
        rpcId: 'mixed-steer',
        clientTimeZone: 'America/New_York',
      } as never,
    }), { surfaceOp: 'append' })
    await fire(ctx, sessionAgent(mixed), 1, 1)
    expect(contextTexts(mixed)[0]).toContain(
      '2026-07-14T00:00:00+00:00[UTC]\n'
      + 'Browser time zone for this request: mixed ["America/New_York","Asia/Shanghai"]. '
      + 'Ask the user to clarify otherwise-unqualified dates and times.',
    )
  })

  it('reports an unavailable later-step baseline at the matching turn boundary', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('later-step-boundary'))
    openMessageTurn(session, 4)

    await fire(ctx, sessionAgent(session), 4, 2)

    expect(contextTexts(session)[0]).toContain(
      'Elapsed since the preceding step context: unavailable.',
    )
  })

  it('reports an unavailable later-step baseline when event lookup is exhausted', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('later-step-exhausted'))

    await fire(ctx, sessionAgent(session), 1, 2)

    expect(contextTexts(session)[0]).toContain(
      'Elapsed since the preceding step context: unavailable.',
    )
  })

  it('injects after backward wall-clock movement and clamps elapsed time to zero', async () => {
    const { ctx } = await mount({ refreshIntervalMs: 60_000 })
    const session = newSession(ctx, SessionId('backward'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 1)
    await fire(ctx, agent, 1, 1)
    vi.setSystemTime(BASE - 5_000)

    await fire(ctx, agent, 1, 2)

    expect(contextTexts(session)).toHaveLength(2)
    expect(contextTexts(session)[1]).toContain('Elapsed since the preceding step context: 0s.')
  })

  it.each([
    ['default interval', {}, 600_000],
    ['explicit interval', { refreshIntervalMs: 1_000 }, 1_000],
  ] as const)('uses a shadowed durable injection after resume at the exact %s threshold', async (_label, config, interval) => {
    const { ctx } = await mount(config)
    const original = newSession(ctx, SessionId('seed-source'))
    openMessageTurn(original, 1)
    await fire(ctx, sessionAgent(original), 1, 1)
    const user = original.snapshotEvents().find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    const reading = original.snapshotEvents().find(event => event.type === 'user/message' && event.data.source.kind === 'time-context')
    if (user === undefined || reading === undefined) throw new Error('missing source surface events')
    original.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'compacted history' }],
      source: { kind: 'compaction-basic' },
    }), {
      surfaceOp: { op: 'replace', startSeq: user.seq, endSeq: reading.seq },
      sourceEventSeqs: [user.seq, reading.seq],
    })
    original.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(JSON.stringify(original.deriveMessages())).not.toContain('Time sampled while preparing')

    const resumed = newSession(ctx, SessionId('resumed'), original.snapshotEvents())
    const resumedAgent = sessionAgent(resumed)
    vi.setSystemTime(BASE + interval - 1)
    openMessageTurn(resumed, 2)
    const beforeSkip = resumed.snapshotEvents().length

    await fire(ctx, resumedAgent, 2, 1)

    expect(resumed.snapshotEvents()).toHaveLength(beforeSkip)
    expect(contextTexts(resumed)).toHaveLength(1)

    vi.setSystemTime(BASE + interval)
    await fire(ctx, resumedAgent, 2, 2)

    expect(contextTexts(resumed)).toHaveLength(2)
    expect(contextTexts(resumed)[1]).toContain(
      'Elapsed since the preceding step context: unavailable.',
    )
  })

  it('rebuilds raw browser zones from compaction-shadowed events in resumed and seeded sessions', async () => {
    const { ctx } = await mount()
    const source = newSession(ctx, SessionId('zone-source'))
    openMessageTurn(source, 1, 'Asia/Shanghai')
    const browserMessage = source.snapshotEvents().find(event => (
      event.type === 'user/message' && event.data.source.kind === 'user'
    ))
    if (browserMessage === undefined) throw new Error('missing browser-zone source event')
    source.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'compacted user context' }],
      source: { kind: 'compaction-basic' },
    }), {
      surfaceOp: { op: 'replace', startSeq: browserMessage.seq, endSeq: browserMessage.seq },
      sourceEventSeqs: [browserMessage.seq],
    })
    expect(ctx.sessionProjections.stateOf(source, 'timeContext')?.browserTimeZoneInputs)
      .toEqual(['Asia/Shanghai'])

    const resumed = newSession(ctx, SessionId('zone-resumed'), source.snapshotEvents())
    const seeded = ctx.sessions.create(SessionId('zone-seeded-child'), {
      seed: [...source.snapshotEvents()],
      inheritedEventCount: SessionLogOffset(source.seq),
      meta: { isSeeded: true, parentSession: source.id },
    })
    for (const [label, session] of [['resume', resumed], ['seeded child', seeded]] as const) {
      await fire(ctx, sessionAgent(session, `zone-${label}`), 1, 1)
      expect(contextTexts(session)[0]).toContain(
        'Browser time zone for this request: Asia/Shanghai. Interpret otherwise-unqualified dates and times in this zone.',
      )
    }
  })

  it('validates entered browser zones before proposed zones and preserves proposal order', async () => {
    const { ctx } = await mount()
    const entered = newSession(ctx, SessionId('zone-order-entered'))
    openMessageTurn(entered, 1, 'Not/A_Real_Zone')
    const enteredAgent = sessionAgent(entered, 'zone-order-entered-agent')
    const proposed = [
      browserZoneMessage('Other/Not_A_Real_Zone'),
      browserZoneMessage('Third/Not_A_Real_Zone'),
    ]

    await expect(agentEvents(ctx, enteredAgent).waterfall(
      'agent/pre-step',
      { messages: proposed, turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: proposed }),
    )).rejects.toThrow(/Not\/A_Real_Zone/)

    const proposedOnly = newSession(ctx, SessionId('zone-order-proposed'))
    openMessageTurn(proposedOnly, 1)
    const proposedAgent = sessionAgent(proposedOnly, 'zone-order-proposed-agent')
    await expect(agentEvents(ctx, proposedAgent).waterfall(
      'agent/pre-step',
      { messages: proposed, turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: proposed }),
    )).rejects.toThrow(/Other\/Not_A_Real_Zone/)
  })

  it('refolds version-2 and Intl-mismatched checkpoints from the complete Session log', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('time-context-cache-refold'))
    openMessageTurn(session, 1, 'Asia/Shanghai')
    const events = session.snapshotEvents()
    const version2 = {
      timeContext: {
        ver: 2,
        seq: events.at(-1)?.seq ?? SessionSeq(0),
        val: { lastMessageTime: null, lastInjectionTime: null, lastTurnInjectionTime: null },
      },
    }
    expect(ctx.sessionProjections.restoreFloor(version2)).toBe(0)
    const restored = ctx.sessionProjections.restore(
      version2,
      events,
      SessionLogOffset(0),
      session.header,
      session.inheritedEventCount,
    )
    expect(restored.checkpoint['timeContext']?.ver).toBe(3)
    expect(restored.checkpoint['timeContext']?.cacheFingerprint).toBe(timeContextCacheFingerprint)
    expect(restored.checkpoint['timeContext']?.val).toMatchObject({
      openTurn: 1,
      openStep: 1,
      browserTimeZoneInputs: ['Asia/Shanghai'],
      firstValidationFailure: null,
    })

    const wrongRuntime = {
      timeContext: {
        ...restored.checkpoint['timeContext']!,
        cacheFingerprint: 'another-intl-runtime',
      },
    }
    expect(ctx.sessionProjections.restoreFloor(wrongRuntime)).toBe(0)
    const refolded = ctx.sessionProjections.restore(
      wrongRuntime,
      events,
      SessionLogOffset(0),
      session.header,
      session.inheritedEventCount,
    )
    expect(refolded.checkpoint['timeContext']?.val).toMatchObject({
      browserTimeZoneInputs: ['Asia/Shanghai'],
      firstValidationFailure: null,
    })
  })

  it('rebuilds durable-reading validation under the current Intl environment after a fingerprint mismatch', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('time-context-intl-latch-refold'))
    openMessageTurn(session, 1, 'Asia/Shanghai')
    await fire(ctx, sessionAgent(session), 1, 1)

    const events = session.snapshotEvents()
    const checkpoint = ctx.sessionProjections.checkpoint(session)
    const row = checkpoint['timeContext']
    expect(row?.val).toMatchObject({ firstValidationFailure: null })
    if (row === undefined) throw new Error('missing time-context checkpoint')

    const NativeDateTimeFormat = Intl.DateTimeFormat
    class ChangedDateTimeFormat extends NativeDateTimeFormat {
      override resolvedOptions(): Intl.ResolvedDateTimeFormatOptions {
        const options = super.resolvedOptions()
        return options.timeZone === 'Asia/Shanghai'
          ? { ...options, timeZone: 'Asia/Urumqi' }
          : options
      }
    }
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function DateTimeFormat(locales, options) {
      return new ChangedDateTimeFormat(locales, options)
    })
    const replay = (cacheFingerprint: string, cachedRow = row) => ctx.sessionProjections.restore(
      { timeContext: { ...cachedRow, cacheFingerprint } },
      events,
      SessionLogOffset(0),
      session.header,
      session.inheritedEventCount,
    ).checkpoint['timeContext']

    const invalidUnderCurrentIntl = replay('prior-intl-runtime')
    if (invalidUnderCurrentIntl === undefined) throw new Error('missing refolded time-context checkpoint')
    expect((invalidUnderCurrentIntl.val as TimeContextProjection).firstValidationFailure)
      .toMatch(/browser time zone must be canonical/)

    vi.restoreAllMocks()
    expect(replay('changed-intl-runtime', invalidUnderCurrentIntl)?.val)
      .toMatchObject({ firstValidationFailure: null })
  })

  it('applies a positive interval across turns without sharing state between sessions', async () => {
    const { ctx } = await mount({ refreshIntervalMs: 1_000 })
    const first = newSession(ctx, SessionId('interval-first'))
    const firstAgent = sessionAgent(first, 'first-agent')
    openMessageTurn(first, 1)
    await fire(ctx, firstAgent, 1, 1)
    first.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    vi.setSystemTime(BASE + 500)
    openMessageTurn(first, 2)
    const beforeSkip = first.snapshotEvents().length
    await fire(ctx, firstAgent, 2, 1)

    const independent = newSession(ctx, SessionId('interval-independent'))
    openMessageTurn(independent, 1)
    await fire(ctx, sessionAgent(independent, 'independent-agent'), 1, 1)

    expect(first.snapshotEvents()).toHaveLength(beforeSkip)
    expect(contextTexts(first)).toHaveLength(1)
    expect(contextTexts(independent)).toHaveLength(1)
  })

  it('does not derive invalid browser zones for a rejected decision', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('rejected-invalid-zones'))
    openMessageTurn(session, 1, 'Not/A_Real_Zone')
    const agent = sessionAgent(session, 'rejected-invalid-zones-agent')
    const proposed = [browserZoneMessage('Other/Not_A_Real_Zone')]

    await expect(agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: proposed, turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'reject' as const }),
    )).resolves.toEqual({ kind: 'reject' })
    expect(contextTexts(session)).toHaveLength(0)
  })

  it('does not derive an invalid entered zone when a positive interval skips refresh', async () => {
    const { ctx } = await mount({ refreshIntervalMs: 1_000 })
    const session = newSession(ctx, SessionId('interval-invalid-zone'))
    const agent = sessionAgent(session, 'interval-invalid-zone-agent')
    openMessageTurn(session, 1)
    await fire(ctx, agent, 1, 1)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    vi.setSystemTime(BASE + 500)
    openMessageTurn(session, 2, 'Not/A_Real_Zone')
    expect(ctx.sessionProjections.stateOf(session, 'timeContext')?.browserTimeZoneInputs)
      .toEqual(['Not/A_Real_Zone'])
    const beforeSkip = session.snapshotEvents().length

    await expect(fire(ctx, agent, 2, 1)).resolves.toBeUndefined()
    expect(session.snapshotEvents()).toHaveLength(beforeSkip)
    expect(contextTexts(session)).toHaveLength(1)
  })

  it('skips an already-aborted prompt submission', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('ordering'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 1)

    await fire(ctx, agent, 1, 1)
    const abort = new AbortController()
    abort.abort()
    await fire(ctx, agent, 1, 2, abort.signal)

    expect(contextTexts(session)).toHaveLength(1)
  })

  it('does not derive an invalid entered zone for an already-aborted decision', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('aborted-invalid-zone'))
    const agent = sessionAgent(session, 'aborted-invalid-zone-agent')
    openMessageTurn(session, 1, 'Not/A_Real_Zone')
    const abort = new AbortController()
    abort.abort()

    await expect(fire(ctx, agent, 1, 1, abort.signal)).resolves.toBeUndefined()
    expect(contextTexts(session)).toHaveLength(0)
  })
})

describe('configuration and lifecycle', () => {
  it('defaults to the process system zone and retains the zone resolved at plugin load', async () => {
    process.env['TZ'] = 'Asia/Shanghai'
    const { ctx } = await mount()
    process.env['TZ'] = 'America/New_York'
    const session = newSession(ctx, SessionId('system-zone'))
    openMessageTurn(session, 1)

    await fire(ctx, sessionAgent(session), 1, 1)

    expect(contextTexts(session)[0]).toContain('2026-07-14T08:00:00+08:00[Asia/Shanghai]')
  })

  it('fails loud for an invalid explicit zone or an unavailable process zone', async () => {
    const invalid = new Context()
    await invalid.plugin(SessionStore)
    await invalid.plugin(SessionProjectionRegistry)
    await invalid.plugin(AgentRegistry)
    await expect(invalid.plugin(timeContext, { timeZone: 'Not/A_Real_Zone' })).rejects.toThrow(
      /invalid IANA timeZone/,
    )

    vi.spyOn(Intl, 'DateTimeFormat').mockImplementationOnce(() => {
      throw new RangeError('system zone unavailable')
    })
    const unresolved = new Context()
    await unresolved.plugin(SessionStore)
    await unresolved.plugin(SessionProjectionRegistry)
    await unresolved.plugin(AgentRegistry)
    await expect(unresolved.plugin(timeContext, {})).rejects.toThrow(/failed to resolve the system time zone/)
  })

  it('rejects invalid refresh intervals at plugin load with one diagnostic', async () => {
    const invalid = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY, Number.NaN]
    for (const refreshIntervalMs of invalid) {
      await expect(mount({ refreshIntervalMs })).rejects.toThrow(
        'time-context: refreshIntervalMs must be a non-negative safe integer',
      )
    }
  })

  it('removes its listener when the plugin fiber disposes', async () => {
    const { ctx, fiber } = await mount()
    const session = newSession(ctx, SessionId('dispose'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 1)
    await fire(ctx, agent, 1, 1)

    await fiber.dispose()
    await fire(ctx, agent, 1, 2)

    expect(contextTexts(session)).toHaveLength(1)
  })
})

describe('time-context projection fold edges', () => {
  it('clears the open-turn injection time at the next turn start', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('same-turn'))
    openMessageTurn(session, 1)
    await fire(ctx, sessionAgent(session), 1, 1)
    expect(typeof ctx.sessionProjections.stateOf(session, 'timeContext')?.lastTurnInjectionTime).toBe('number')
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('turn/start', { turn: 2 })
    expect(ctx.sessionProjections.stateOf(session, 'timeContext')).toMatchObject({
      lastTurnInjectionTime: null,
    })
  })

  it('keeps the open-turn injection time null when turn/end arrives first', async () => {
    const { ctx } = await mount()
    const session = newSession(ctx, SessionId('end-without-start'))
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(ctx.sessionProjections.stateOf(session, 'timeContext')).toMatchObject({
      lastTurnInjectionTime: null,
    })
  })
})

describe('real agent-loop request history', () => {
  it.each([
    ['throws'],
    ['cancels'],
  ] as const)('does not commit a preparation reading when a downstream pre-step listener %s', async (mode) => {
    const adapter = new ScriptedAdapter([textResponse('unused')])
    const ctx = await loopHarness(adapter)
    ctx.on('agent/pre-step', ({ agent: subject }, next) => {
      if (mode === 'throws') throw new Error('later pre-step failure')
      subject.cancel({ kind: 'user' })
      return next()
    })
    const agent = await ctx.agentLoop.create(SessionId(`late-${mode}`), { provider: 'mock', model: 'mock' })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'start' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(contextTexts(agent.session)).toHaveLength(0)
    expect(adapter.requests).toHaveLength(0)
    expect(agent.session.snapshotEvents().some(event => event.type === 'step/start')).toBe(false)
    await ctx.fiber.dispose()
  })

  it('persists one ordered context per request, accumulates readings, and leaves system headers unchanged', async () => {
    const adapter = new ScriptedAdapter([toolCallResponse(), textResponse('done')])
    const ctx = await loopHarness(adapter, { refreshIntervalMs: 0 })
    ctx.tools.register(defineContentToolFixture({
      name: 'tick',
      description: 'advance fake time',
      parameters: {},
      async execute() {
        vi.setSystemTime(BASE + 61_000)
        return [{ type: 'text' as const, text: 'advanced' }]
      },
    }))
    const agent = await ctx.agentLoop.create(SessionId('loop'), { provider: 'mock', model: 'mock' })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'start' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(2)
    const contexts = agent.session.snapshotEvents().filter(
      (event): event is SessionEvent<'user/message'> => event.type === 'user/message' && event.data.source.kind !== 'user')
    const starts = agent.session.snapshotEvents().filter(event => event.type === 'step/start')
    expect(contexts).toHaveLength(adapter.requests.length)
    expect(starts).toHaveLength(adapter.requests.length)
    for (let index = 0; index < contexts.length; index += 1) {
      expect(contexts[index]!.seq).toBeGreaterThan(starts[index]!.seq)
    }
    expect(contexts.every(event => event.data.source.kind === 'time-context'
      && event.surfaceOp === 'append')).toBe(true)

    const firstRequestText = requestText(adapter.requests[0]!)
    const secondRequestText = requestText(adapter.requests[1]!)
    expect(firstRequestText).toContain('Time sampled while preparing turn 1, step 1:')
    expect(firstRequestText).toContain('Elapsed since the preceding model-visible message: unavailable.')
    expect(firstRequestText).not.toContain('Time sampled while preparing turn 1, step 2:')
    expect(secondRequestText).toContain('Time sampled while preparing turn 1, step 1:')
    expect(secondRequestText).toContain('Time sampled while preparing turn 1, step 2:')
    expect(secondRequestText).toContain('Elapsed since the preceding step context: 1m 1s.')

    for (const request of adapter.requests) {
      expect(request.system).toBeUndefined()
      expect(request.messages[0]?.role).toBe('system')
      expect(JSON.stringify(request.messages[0])).not.toContain('Time sampled while preparing')
    }
    const systemNodes = agent.session.snapshotEvents().filter(event => event.type === 'system/message')
    expect(JSON.stringify(systemNodes)).not.toContain('Time sampled while preparing')
    await ctx.fiber.dispose()
  })
})

describe('real Loader export path', () => {
  it('keeps namespace metadata and boots the agent listener through unwrapExports', async () => {
    expect('default' in timeContext).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(timeContext) as Record<string, unknown>
    expect(unwrapped).toBe(timeContext)
    expect(unwrapped.name).toBe('time-context')
    expect(unwrapped.inject).toEqual(['agents', 'sessionProjections'])
    expect(unwrapped.Config).toBeDefined()
    expect(typeof unwrapped.apply).toBe('function')

    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentRegistry)
    const plugin = loader.unwrapExports(timeContext) as Parameters<Context['plugin']>[0]
    await ctx.plugin(plugin)
    const session = newSession(ctx, SessionId('loader'))
    openMessageTurn(session, 1)
    await fire(ctx, sessionAgent(session), 1, 1)
    expect(contextTexts(session)[0]).toContain('Time sampled while preparing turn 1, step 1:')
  })
})
