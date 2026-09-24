import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, SessionPreparation } from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolExecutionResult, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import * as ToolsInvariant from '@deepseek-ai/dsh-tools/invariant'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'

const testToolSignal = new AbortController().signal

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(ToolsInvariant)
  return ctx
}

const execution = (overrides: Partial<ToolExecution> = {}): ToolExecution => ({
  token: Symbol('tool') as ToolExecutionToken,
  callId: ToolCallId('call-1'),
  name: 'echo',
  arguments: Object.freeze({ text: 'hi' }),
  ...overrides,
  signal: overrides.signal ?? testToolSignal,
  rootCallId: overrides.rootCallId ?? overrides.callId ?? ToolCallId('call-1'),
})

const outcome = (): ToolExecutionResult => Object.freeze({
  content: Object.freeze([{ type: 'text' as const, text: 'ok' }]) as never,
  isError: false,
  value: null,
})

function emitResult(ctx: Context, exec: ToolExecution, result: ToolExecutionResult): void {
  ctx.emit(scopeTarget(ctx as never, undefined), 'tools/result', exec, result)
}

async function stage(ctx: Context, name: 'tools/pre-execute' | 'tools/execute', exec: ToolExecution): Promise<void> {
  if (name === 'tools/pre-execute') {
    await ctx.waterfall(ctx as never, name, exec, () => Promise.resolve({ kind: 'allow' as const }))
  } else {
    await ctx.waterfall(ctx as never, name, exec, () => Promise.resolve(outcome()))
  }
}

describe('tool-pipeline invariants', () => {
  it('accepts dispatch and denial stage orders with frozen results', async () => {
    const ctx = await setup()
    const dispatched = execution()
    await stage(ctx, 'tools/pre-execute', dispatched)
    await stage(ctx, 'tools/execute', dispatched)
    await ctx.waterfall(ctx as never, 'tools/post-execute', dispatched, outcome(), () => Promise.resolve({ kind: 'accept' as const }))
    Object.freeze(dispatched)
    emitResult(ctx, dispatched, outcome())

    const denied = execution({ callId: ToolCallId('call-2') })
    await stage(ctx, 'tools/pre-execute', denied)
    await ctx.waterfall(ctx as never, 'tools/post-execute', denied, outcome(), () => Promise.resolve({ kind: 'accept' as const }))
    Object.freeze(denied)
    emitResult(ctx, denied, outcome())
    ctx.emit('tools/change')
  })

  it('rejects repeated and out-of-order pipeline stages', async () => {
    const ctx = await setup()
    const exec = execution()
    await stage(ctx, 'tools/pre-execute', exec)
    await expect(stage(ctx, 'tools/pre-execute', exec)).rejects.toThrow(/repeated/)

    const noPre = execution({ callId: ToolCallId('call-2') })
    await expect(stage(ctx, 'tools/execute', noPre)).rejects.toThrow(/must follow tools\/pre-execute/)
    expect(() => ctx.waterfall(
      ctx as never, 'tools/post-execute', noPre, outcome(),
      () => Promise.resolve({ kind: 'accept' as const }),
    )).toThrow(/must follow tools\/pre-execute or tools\/execute/)
  })

  it('rejects mutable or anonymous final snapshots', async () => {
    const ctx = await setup()
    expect(() => { emitResult(ctx, execution(), outcome()) }).toThrow(/execution must be frozen/)

    const exec = Object.freeze(execution())
    expect(() => { emitResult(ctx, exec, { content: [], isError: false, value: null }) })
      .toThrow(/outcome and content must be frozen/)

    const anonymous = Object.freeze(execution({ name: '' }))
    expect(() => { emitResult(ctx, anonymous, outcome()) }).toThrow(/non-empty name and callId/)
  })

  it('requires ptc-dispatch records to be turn-enclosed', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    const data = {
      rootCallId: ToolCallId('parent'),
      parentCallId: ToolCallId('parent'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    }
    expect(() => session.append('tool/ptc-dispatch-start', data)).toThrow(/outside any open turn/)
    session.append('turn/start', { turn: 1 })
    expect(() => session.append('tool/ptc-dispatch-start', data)).not.toThrow()
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  })

  it('does not commit a rejected dispatch edge into the root index', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('rejected-root'),
      parentCallId: ToolCallId('rejected-root'),
      subCallId: ToolCallId('reused-child'),
      name: 'echo',
      arguments: {},
    })).toThrow(/outside any open turn/)

    session.append('turn/start', { turn: 1 })
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('accepted-root'),
      parentCallId: ToolCallId('accepted-root'),
      subCallId: ToolCallId('reused-child'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
  })

  it('rejects a nested PTC dispatch that changes its parent chain root before append', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'run_code',
      arguments: {},
    })
    session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('child'),
      subCallId: ToolCallId('grandchild'),
      name: 'echo',
      arguments: {},
    })

    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('another-root'),
      parentCallId: ToolCallId('child'),
      subCallId: ToolCallId('invalid-grandchild'),
      name: 'echo',
      arguments: {},
    })).toThrow(/parentCallId child does not belong to rootCallId another-root/)
    expect(session.snapshotEvents().some(event => event.type === 'tool/ptc-dispatch-start'
      && String(event.data.subCallId) === 'invalid-grandchild')).toBe(false)
  })

  it('requires non-empty dispatch identities and keeps one subcall on one root', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId(''),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })).toThrow(/must carry non-empty rootCallId/)

    session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('other-root'),
      parentCallId: ToolCallId('other-root'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })).toThrow(/changed rootCallId for subCallId child/)
  })

  it('indexes dispatch records appended by a SessionStore-owned session', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('stored-dispatch-session'))
    session.append('turn/start', { turn: 1 })
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
  })

  it('folds restored prefixes and multiple fork-owned dispatch levels', async () => {
    const ctx = await setup()
    const source = ctx.sessions.create(SessionId('dispatch-source'))
    source.append('turn/start', { turn: 1 })
    source.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'run_code',
      arguments: {},
    })
    source.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const restoredId = SessionId('dispatch-restored')
    const restored = ctx.sessions.prepare(restoredId, {
      seed: [...source.snapshotEvents()],
      inheritedEventCount: source.inheritedEventCount,
      eventState: 'shared-frozen',
      meta: { ...source.header, id: restoredId },
    })
    const detachRestored = ctx.sessions.enter(restored)
    ctx.sessions.announce(restored)
    restored.append('turn/start', { turn: 2 })
    restored.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('child'),
      subCallId: ToolCallId('grandchild'),
      name: 'echo',
      arguments: {},
    })
    restored.append('turn/end', { turn: 2, reason: { kind: 'completed' } })

    const fork = ctx.sessions.fork(restored, undefined, SessionId('dispatch-fork'))
    fork.append('turn/start', { turn: 3 })
    expect(() => fork.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('grandchild'),
      subCallId: ToolCallId('great-grandchild'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
    detachRestored()
  })

  it('validates preparation appends before the log advances and leaves rejected state reusable', async () => {
    const ctx = await setup()
    const session = ctx.sessions.prepare(SessionId('prepared-dispatch'))
    const preparation = SessionPreparation.create(session)
    ctx.sessionProjections.prepareSession(preparation)

    let failure: unknown
    try {
      session.append('tool/ptc-dispatch-start', {
        rootCallId: ToolCallId('root'),
        parentCallId: ToolCallId('root'),
        subCallId: ToolCallId('child'),
        name: 'echo',
        arguments: {},
      })
    } catch (error: unknown) {
      failure = error
    }
    expect(failure).toBeInstanceOf(InvariantError)
    expect((failure as InvariantError).packageName).toBe('@deepseek-ai/dsh-tools')
    expect(session.seq).toBe(0)

    session.append('turn/start', { turn: 1 })
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
    expect(session.seq).toBe(2)
    preparation[Symbol.dispose]()
  })

  it('replays accepted preparation events once and adopts their complete creation baseline', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.prepare(SessionId('replayed-preparation'))
    const preparation = SessionPreparation.create(session)
    session.append('turn/start', { turn: 1 })
    session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'run_code',
      arguments: {},
    })

    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(ToolsInvariant)
    ctx.sessionProjections.prepareSession(preparation)
    const detach = ctx.sessions.enter(session)
    ctx.sessions.announce(session)

    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('child'),
      subCallId: ToolCallId('grandchild'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
    expect(session.seq).toBe(3)
    detach()
    preparation[Symbol.dispose]()
  })

  it('rejects synthetic session events without advancing the fold', async () => {
    const ctx = await setup()
    const unattached = Session.create(SessionId('synthetic-unattached'))
    expect(() => {
      ctx.emit('session/event', unattached as never, {
        type: 'turn/start', seq: 0, time: 1, data: { turn: 1 },
      } as never)
    }).toThrow(/has no exact creation baseline/)

    const session = ctx.sessions.create(SessionId('synthetic-attached'))
    session.append('turn/start', { turn: 1 })
    expect(() => {
      ctx.emit('session/event', session as never, {
        type: 'tool/ptc-dispatch-start',
        seq: 1,
        time: 1,
        data: {
          rootCallId: ToolCallId('synthetic-root'),
          parentCallId: ToolCallId('synthetic-root'),
          subCallId: ToolCallId('synthetic-child'),
          name: 'echo',
          arguments: {},
        },
      } as never)
    }).toThrow(/not the exact committed Session append/)
    expect(session.seq).toBe(1)
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('real-root'),
      parentCallId: ToolCallId('real-root'),
      subCallId: ToolCallId('synthetic-child'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
  })

  it('contains failures from post-commit observers after an accepted append', async () => {
    const ctx = await setup()
    ctx.on('session/event', () => { throw new Error('observer failure') }, { global: true })
    const session = ctx.sessions.create()
    expect(() => session.append('turn/start', { turn: 1 })).not.toThrow()
    expect(session.seq).toBe(1)
  })

  it('stops validating a pending preparation after companion disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(InvariantRegistry)
    const disposeToolsInvariant = await ToolsInvariant.apply(ctx)
    const session = ctx.sessions.prepare(SessionId('disposed-preparation'))
    const preparation = SessionPreparation.create(session)
    ctx.sessionProjections.prepareSession(preparation)

    const disposeRegistration: () => unknown = disposeToolsInvariant
    await Promise.resolve(disposeRegistration())
    expect(() => session.append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('root'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })).not.toThrow()
    expect(session.seq).toBe(1)
    preparation[Symbol.dispose]()
  })

  it('rejects an invalid restored creation baseline with tools package attribution', async () => {
    const ctx = await setup()
    const session = ctx.sessions.prepare(SessionId('invalid-dispatch-baseline'), {
      seed: [{
        type: 'tool/ptc-dispatch-start',
        seq: 0,
        time: 1,
        data: {
          rootCallId: ToolCallId('root'),
          parentCallId: ToolCallId('root'),
          subCallId: ToolCallId('child'),
          name: 'echo',
          arguments: {},
        },
      } as never],
    })
    const detach = ctx.sessions.enter(session)
    let failure: unknown
    try {
      ctx.sessions.announce(session)
    } catch (error: unknown) {
      failure = error
    } finally {
      detach()
    }
    expect(failure).toBeInstanceOf(InvariantError)
    expect((failure as InvariantError).packageName).toBe('@deepseek-ai/dsh-tools')
    expect((failure as Error).message).toMatch(/outside any open turn/)
  })

  it('refuses late registration after a stored session becomes eventful', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('tool/ptc-dispatch', {
      rootCallId: ToolCallId('parent'),
      parentCallId: ToolCallId('parent'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
      isError: false,
      content: [{ type: 'text', text: 'ok' }],
    })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.plugin(InvariantRegistry)
    await expect(ctx.plugin(ToolsInvariant).then(() => undefined))
      .rejects.toThrow(/eventful Session .* without its creation baseline/)
  })

  it('fails closed for any eventful stored session on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessions.create().append('tool/ptc-dispatch-start', {
      rootCallId: ToolCallId('parent'),
      parentCallId: ToolCallId('parent'),
      subCallId: ToolCallId('child'),
      name: 'echo',
      arguments: {},
    })
    await ctx.plugin(InvariantRegistry)
    await expect(ctx.plugin(ToolsInvariant).then(() => undefined))
      .rejects.toThrow(/eventful Session .* without its creation baseline/)
  })
})
