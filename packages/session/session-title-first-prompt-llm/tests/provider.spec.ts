import { Context, FiberState } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import LlmRuntime, { createUserMessage, LlmAdapter  } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQuerySqlite from '@deepseek-ai/dsh-session-query-sqlite'
import { turnBoundaryProjectionDefinition } from '@deepseek-ai/dsh-agent-loop'
import SessionTitleService, { type SessionTitleProvider } from '@deepseek-ai/dsh-session-title'
import * as providerPlugin from '@deepseek-ai/dsh-session-title-first-prompt-llm'

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'text-delta', index: 0, text: 'First-message model title' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const TITLE_CONFIG = { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 } as const
const LLM_CONFIG = {
  targetWords: 5,
  targetCjkCharacters: 10,
  maxInputBytes: 1_000,
  maxOutputTokens: 32,
  timeoutMs: 1_000,
  provider: 'title-route',
  model: 'title-model',
} as const

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('first-prompt LLM title provider', () => {
  it('keeps the plugin pending when its required query service is absent', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)

    const fiber = await ctx.plugin(providerPlugin, LLM_CONFIG)

    expect(providerPlugin.inject).toContain('sessionQuery')
    expect(fiber.state).toBe(FiberState.PENDING)
    expect(ctx.sessionQuery).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('rejects an impossible empty provider request at its own boundary', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionQuerySqlite, { path: ':memory:', openAt: 'never' })
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    let registered: SessionTitleProvider | undefined
    vi.spyOn(ctx.sessionTitle, 'register').mockImplementation((provider) => {
      registered = provider
      return async () => undefined
    })
    providerPlugin.apply(ctx, LLM_CONFIG)

    await expect(registered!.generate({
      session: Session.create(SessionId('empty-first-provider')),
      messages: [],
      signal: new AbortController().signal,
    })).rejects.toThrow(/at least one source message/)
  })

  it('uses the first projection automatically and all eligible messages on explicit refresh', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionQuerySqlite, { path: ':memory:', openAt: 'never' })
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['title-route'], adapter)
    await ctx.plugin(providerPlugin, LLM_CONFIG)
    const session = ctx.sessions.create(SessionId('first-plugin'))
    session.append('turn/start', { turn: 1 })
    const first = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'first input' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    await settle()
    session.append('request/header', {
      header: { config: { provider: 'main', model: 'main-model' } }, reason: 'initial',
    })
    await settle()
    const second = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'second input from explicit refresh' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    await ctx.sessionTitle.refresh(session)

    expect(adapter.requests).toHaveLength(2)
    const automaticPrompt = adapter.requests[0]?.messages[0]?.content[0]
    expect(automaticPrompt?.type === 'text' && automaticPrompt.text).toContain('first input')
    expect(automaticPrompt?.type === 'text' && automaticPrompt.text).not.toContain('second input')
    const refreshedPrompt = adapter.requests[1]?.messages[0]?.content[0]
    expect(refreshedPrompt?.type === 'text' && refreshedPrompt.text).toContain('first input')
    expect(refreshedPrompt?.type === 'text' && refreshedPrompt.text).toContain('second input from explicit refresh')
    expect(ctx.sessionTitle.get(session)).toMatchObject({ messageSeqs: [first.seq, second.seq] })
  })
})
