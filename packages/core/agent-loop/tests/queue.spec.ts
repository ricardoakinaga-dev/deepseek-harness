import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, onTestFinished } from 'vitest'
import { textResponse } from './mock-adapter.ts'

class FailingRequest extends LlmAdapter {
  readonly entered = Promise.withResolvers<undefined>()
  readonly release = Promise.withResolvers<undefined>()
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      this.entered.resolve(undefined)
      await this.release.promise
      yield { type: 'finish', reason: { kind: 'error', failure: { message: 'connection lost', code: 'TRANSPORT' } } }
      return
    }
    yield * textResponse('continued')
  }
}

async function setup() {
  const ctx = new Context()
  const adapter = new FailingRequest()
  onTestFinished(async () => {
    adapter.release.resolve(undefined)
    await ctx.fiber.dispose()
  })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await ctx.agentLoop.create(SessionId('queue-recovery'), { provider: 'mock', model: 'mock' })
  agent.followup(input('first task'))
  await adapter.entered.promise
  return { ctx, adapter, agent }
}

function input(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('pending waking input after request failure', () => {
  it('publishes terminal idle only after recovered work completes', async () => {
    const { ctx, adapter, agent } = await setup()
    const idleRequests: number[] = []
    ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') idleRequests.push(adapter.requests.length)
    })
    agent.followup(input('accepted while running'))
    adapter.release.resolve(undefined)
    await agent.whenIdle()
    expect(idleRequests).toEqual([2])
  })

  it('parks accepted work when its durable claim is rejected', async () => {
    const { ctx, adapter, agent } = await setup()
    const pending = input('wait for claim recovery')
    let rejectedClaims = 0
    ctx.on('internal/dispatch', (_mode, name, args) => {
      if (name !== 'session/event') return
      const event = args[1] as SessionEvent
      if (event.type === 'agent/inbox/spliced' && event.data.target === 'next-turn'
        && (event.data.removedCount ?? 0) > 0 && event.data.outcome === undefined && rejectedClaims < 2) {
        rejectedClaims += 1
        throw new Error('claim persistence rejected')
      }
    })
    agent.followup(pending)
    adapter.release.resolve(undefined)
    await agent.whenIdle()
    expect(rejectedClaims).toBe(1)
    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextTurn).toEqual([pending])
    expect(agent.session.snapshotEvents().flatMap(event => event.type === 'turn/end' ? [event.data.reason.kind] : []))
      .toEqual(['error', 'error'])
  })

  it.each(['followup', 'steer'] as const)('starts a fresh turn for unclaimed %s input exactly once', async (delivery) => {
    const { adapter, agent } = await setup()
    const accepted = input('accepted while running')
    agent[delivery](accepted)
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(2)
    expect(agent.session.snapshotEvents().flatMap(event => event.type === 'turn/end' ? [event.data.reason.kind] : []))
      .toEqual(['error', 'completed'])
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.id === accepted.id))
      .toHaveLength(1)
    expect([...agent.inbox.nextTurn, ...agent.inbox.nextStep]).toEqual([])
  })

  it('leaves injected context pending without retrying the failed request', async () => {
    const { adapter, agent } = await setup()
    const context = input('passive context')
    agent.inject(context)
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextStep).toEqual([context])
  })

  it('does not transfer a removed wake to injected context', async () => {
    const { adapter, agent } = await setup()
    const removed = input('removed waking input')
    const context = input('passive context')
    agent.steer(removed)
    agent.inject(context)
    agent.inbox.remove(removed.id)
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextStep).toEqual([context])
  })

  it('does not replay consumed waking input when its admitted request fails', async () => {
    const { ctx, adapter, agent } = await setup()
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const accepted = input('consume before failure')
    const context = input('passive context after claim')
    ctx.on('agent/request', async ({ turn }, next) => {
      if (turn !== 2) return next()
      entered.resolve(undefined)
      await release.promise
      throw new Error('request preparation failed')
    })
    try {
      agent.followup(accepted)
      adapter.release.resolve(undefined)
      await entered.promise
      agent.inject(context)
      release.resolve(undefined)
      await agent.whenIdle()

      expect(adapter.requests).toHaveLength(1)
      expect(agent.inbox.nextTurn).toEqual([])
      expect(agent.inbox.nextStep).toEqual([context])
      expect(agent.session.snapshotEvents().flatMap(event => event.type === 'turn/end' ? [event.data.reason.kind] : []))
        .toEqual(['error', 'error'])
    } finally {
      release.resolve(undefined)
    }
  })

  it('parks remaining waking input when a policy rejects the next turn', async () => {
    const { ctx, adapter, agent } = await setup()
    const remaining = input('wait for policy recovery')
    ctx.on('agent/pre-step', async ({ turn }, next) => turn === 2 ? { kind: 'reject' } : next())
    agent.followup(input('declined task'))
    agent.followup(remaining)
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextTurn).toEqual([remaining])
    expect(agent.session.snapshotEvents().flatMap(event => event.type === 'turn/end' ? [event.data.reason.kind] : []))
      .toEqual(['error', 'blocked'])
  })

  it('keeps accepted input pending when the failed turn cannot be durably closed', async () => {
    const { ctx, adapter, agent } = await setup()
    const pending = input('wait for persistence recovery')
    const failures: unknown[] = []
    ctx.on('agent/error', ({ error }) => { failures.push(error) })
    ctx.on('internal/dispatch', (_mode, name, args) => {
      if (name !== 'session/event') return
      const event = args[1] as SessionEvent
      if (event.type === 'turn/end') throw new Error('turn-end persistence rejected')
    })
    agent.followup(pending)
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextTurn).toEqual([pending])
    expect(failures).toContainEqual(expect.objectContaining({ message: 'turn-end persistence rejected' }))
    expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/end')).toEqual([])
  })

  it('parks pre-interrupt input until an explicit later wake', async () => {
    const { adapter, agent } = await setup()
    const accepted = input('parked input')
    agent.followup(accepted)
    agent.cancel({ kind: 'user' }, { keepInbox: true })
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextTurn).toEqual([accepted])
    agent.followup(input('explicit continuation'))
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(3)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.id === accepted.id))
      .toHaveLength(1)
  })

  it('lets a terminal-error observer park waking input until an explicit later wake', async () => {
    const { ctx, adapter, agent } = await setup()
    const accepted = input('parked after terminal failure')
    ctx.on('agent/error', ({ agent: subject }) => {
      if (subject === agent) agent.cancel({ kind: 'hook', reason: 'terminal failure requires explicit recovery' }, { keepInbox: true })
    })
    agent.followup(accepted)
    adapter.release.resolve(undefined)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.inbox.nextTurn).toEqual([accepted])
    expect(agent.session.snapshotEvents().flatMap(event => event.type === 'turn/end' ? [event.data.reason.kind] : []))
      .toEqual(['error'])
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.id === accepted.id))
      .toHaveLength(0)

    agent.steer(input('explicit recovery'))
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(2)
    expect([...agent.inbox.nextTurn, ...agent.inbox.nextStep]).toEqual([])
    expect(adapter.requests[1]!.messages.filter(message => message.id === accepted.id)).toHaveLength(1)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.id === accepted.id))
      .toHaveLength(1)
  })

  it('disposes pending waking input without starting another request', async () => {
    const { ctx, adapter, agent } = await setup()
    agent.steer(input('accepted before disposal'))
    const disposal = ctx.fiber.dispose()
    adapter.release.resolve(undefined)
    await disposal

    expect(adapter.requests).toHaveLength(1)
    expect(agent.status).toBe('idle')
  })
})
