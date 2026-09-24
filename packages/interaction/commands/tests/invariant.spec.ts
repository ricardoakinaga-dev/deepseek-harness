import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as CommandInvariant from '@deepseek-ai/dsh-commands/invariant'
import CommandRuntime, { CommandId } from '@deepseek-ai/dsh-commands'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId, type Session, type SessionSeq } from '@deepseek-ai/dsh-session'
import { commandAuditEntry } from '../src/audit-state.ts'

async function mount(installCompanion = true) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const runtimeFiber = await ctx.plugin(CommandRuntime)
  const session = ctx.sessions.create(SessionId('commands-invariant'))
  await ctx.plugin(InvariantRegistry, { enabled: true })
  const invariantFiber = installCompanion ? await ctx.plugin(CommandInvariant) : undefined
  return { ctx, session, runtimeFiber, invariantFiber }
}

function appendRun(session: Session, id: string): void {
  session.append('command/run', {
    commandId: CommandId(id),
    name: 'linked',
    args: '',
    source: { kind: 'user' },
  })
}

function appendDone(session: Session, id: string, sourceEventSeq?: number): void {
  session.append('command/done', {
    commandId: CommandId(id),
    kind: 'success',
    ...(sourceEventSeq === undefined ? {} : { sourceEventSeq: sourceEventSeq as SessionSeq }),
  })
}

function expectInvariantFailure(operation: () => unknown): void {
  expect(operation).toThrow(expect.objectContaining<Partial<InvariantError>>({
    code: 'INVARIANT',
    packageName: '@deepseek-ai/dsh-commands',
  }))
}

describe('command lifecycle invariants', () => {
  it('accepts a success outcome linked to an earlier non-command domain event', async () => {
    const { session } = await mount()
    const source = session.append('turn/start', { turn: 1 })
    appendRun(session, 'cmd-valid')

    expect(() => { appendDone(session, 'cmd-valid', source.seq) }).not.toThrow()
  })

  it.each([-1, 1.5, 1])('rejects invalid or non-prior sourceEventSeq %s', async (sourceEventSeq) => {
    const { session } = await mount()
    appendRun(session, 'cmd-invalid')

    expectInvariantFailure(() => { appendDone(session, 'cmd-invalid', sourceEventSeq) })
  })

  it('rejects sourceEventSeq values that point to command lifecycle events', async () => {
    const { session } = await mount()
    const source = session.append('turn/start', { turn: 1 })
    const run = session.append('command/run', {
      commandId: CommandId('cmd-command-source'),
      name: 'linked',
      args: '',
      source: { kind: 'user' },
    })

    expectInvariantFailure(() => { appendDone(session, 'cmd-command-source', run.seq) })
    expect(() => { appendDone(session, 'cmd-command-source', source.seq) }).not.toThrow()
  })

  it('rejects an error settlement carrying a success-only source reference', async () => {
    const { session } = await mount()
    const source = session.append('turn/start', { turn: 1 })
    appendRun(session, 'cmd-error-source')

    expectInvariantFailure(() => {
      session.append('command/done', {
        commandId: CommandId('cmd-error-source'),
        kind: 'error',
        text: 'failed',
        sourceEventSeq: source.seq,
      })
    })
  })

  it('rejects a duplicate run id after the earlier run has completed', async () => {
    const { ctx, session } = await mount()
    appendRun(session, 'cmd-reused')
    appendDone(session, 'cmd-reused')
    const entry = commandAuditEntry(ctx, session)
    expect(entry?.lastSeq).toBe(session.seq - 1)

    expectInvariantFailure(() => { appendRun(session, 'cmd-reused') })
    expect(entry?.lastSeq).toBe(session.seq - 1)
  })

  it('leaves the shared fold unchanged after a rejected candidate', async () => {
    const { ctx, session } = await mount()
    const source = session.append('turn/start', { turn: 1 })
    const run = session.append('command/run', {
      commandId: CommandId('cmd-correctable'),
      name: 'linked',
      args: '',
      source: { kind: 'user' },
    })
    const entry = commandAuditEntry(ctx, session)
    expect(entry).toBeDefined()
    const before = {
      lastSeq: entry?.lastSeq,
      failure: entry?.failure,
      runIds: [...entry?.runIds ?? []],
      commandEventSeqs: [...entry?.commandEventSeqs ?? []],
    }

    expectInvariantFailure(() => { appendDone(session, 'cmd-correctable', run.seq) })
    expect({
      lastSeq: entry?.lastSeq,
      failure: entry?.failure,
      runIds: [...entry?.runIds ?? []],
      commandEventSeqs: [...entry?.commandEventSeqs ?? []],
    }).toEqual(before)
    expect(() => { appendDone(session, 'cmd-correctable', source.seq) }).not.toThrow()
  })

  it('rejects an invalid command lifecycle in a creation baseline before publication', async () => {
    const { ctx } = await mount()
    const session = ctx.sessions.prepare(SessionId('commands-invalid-baseline'))
    session.append('command/done', {
      commandId: CommandId('cmd-unmatched-baseline'),
      kind: 'success',
    })
    const detach = ctx.sessions.enter(session)

    expectInvariantFailure(() => { ctx.sessions.announce(session) })
    detach()
    expect(ctx.sessions.get(session.id)).toBeUndefined()
  })

  it('validates late companion registration from the command provider fold', async () => {
    const { ctx, session } = await mount(false)
    const source = session.append('turn/start', { turn: 1 })
    appendRun(session, 'cmd-late-valid')
    appendDone(session, 'cmd-late-valid', source.seq)

    await expect(ctx.plugin(CommandInvariant)).resolves.toBeDefined()
    expect(() => { appendRun(session, 'cmd-late-next') }).not.toThrow()
  })

  it('rejects an invalid live prefix when the companion registers late', async () => {
    const { ctx, session } = await mount(false)
    appendRun(session, 'cmd-late')
    appendDone(session, 'cmd-late', 0)

    await expect(ctx.plugin(CommandInvariant)).rejects.toMatchObject({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-commands',
    })
  })

  it('shares one fold across provider leases and preserves it through partial release and reacquisition', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const primary = await ctx.plugin(CommandRuntime)
    const siblingContext = ctx.isolate('commands')
    const sibling = await siblingContext.plugin(CommandRuntime)
    const session = ctx.sessions.create(SessionId('commands-shared-fold'))
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const invariant = await ctx.plugin(CommandInvariant)
    appendRun(session, 'cmd-shared')
    const entry = commandAuditEntry(ctx, session)
    expect(entry?.leases.size).toBe(2)

    await primary.dispose()
    expect(entry?.leases.size).toBe(1)
    const source = session.append('turn/start', { turn: 1 })
    expect(() => { appendDone(session, 'cmd-shared', source.seq) }).not.toThrow()
    expect(entry?.lastSeq).toBe(session.seq - 1)

    const reloadedPrimary = await ctx.plugin(CommandRuntime)
    expect(entry?.leases.size).toBe(2)
    expect(entry?.lastSeq).toBe(session.seq - 1)

    await sibling.dispose()
    expect(entry?.leases.size).toBe(1)
    await reloadedPrimary.dispose()
    expect(commandAuditEntry(ctx, session)).toBeUndefined()
    await invariant.dispose()
  })

  it('rejects eventful reactivation after final release and seeds a live empty Session', async () => {
    const { ctx, session, runtimeFiber, invariantFiber } = await mount()
    await invariantFiber?.dispose()
    await runtimeFiber.dispose()
    expect(commandAuditEntry(ctx, session)).toBeUndefined()

    session.append('turn/start', { turn: 1 })
    await expect(ctx.plugin(CommandRuntime)).rejects.toThrow(/eventful session/)

    const emptyContext = new Context()
    await emptyContext.plugin(SessionStore)
    const emptyRuntime = await emptyContext.plugin(CommandRuntime)
    const emptySession = emptyContext.sessions.create(SessionId('commands-empty-reactivation'))
    await emptyContext.plugin(InvariantRegistry, { enabled: true })
    const emptyInvariant = await emptyContext.plugin(CommandInvariant)
    await emptyRuntime.dispose()
    await emptyInvariant.dispose()
    expect(commandAuditEntry(emptyContext, emptySession)).toBeUndefined()

    const recoveredRuntime = await emptyContext.plugin(CommandRuntime)
    const recoveredInvariant = await emptyContext.plugin(CommandInvariant)
    expect(commandAuditEntry(emptyContext, emptySession)?.lastSeq).toBe(-1)
    expect(() => emptySession.append('turn/start', { turn: 1 })).not.toThrow()
    await recoveredInvariant.dispose()
    await recoveredRuntime.dispose()
  })

  it('seeds a baseline monotonically when a later creation listener appends before a sibling callback', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(CommandRuntime)
    ctx.on('session/created', (session) => {
      if (session.id === SessionId('commands-monotonic-baseline')) {
        session.append('turn/start', { turn: 1 })
      }
    })
    const siblingContext = ctx.isolate('commands')
    await siblingContext.plugin(CommandRuntime)

    const session = ctx.sessions.create(SessionId('commands-monotonic-baseline'))
    expect(commandAuditEntry(ctx, session)?.lastSeq).toBe(session.seq - 1)
    expect(commandAuditEntry(ctx, session)?.failure).toBeUndefined()
  })

  it('latches an event delivered before any valid creation baseline', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    let announced: Session | undefined
    ctx.on('session/created', (session) => {
      if (session.id !== SessionId('commands-missing-prefix')) return
      announced = session
      session.append('turn/start', { turn: 1 })
    })
    await ctx.plugin(CommandRuntime)

    const session = ctx.sessions.create(SessionId('commands-missing-prefix'))
    expect(announced).toBeDefined()
    expect(commandAuditEntry(ctx, session)?.failure).toMatch(/expected event seq 0/)

    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(CommandInvariant)).rejects.toMatchObject({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-commands',
    })
    expect(commandAuditEntry(ctx, session)?.failure).toMatch(/expected event seq 0/)
  })
})
