/** Deterministic behavior and Loader-path coverage for the compaction resilience policy. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from '@deepseek-ai/dsh-agent'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import LlmRuntime, {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  createMessage,
  createUserMessage,
  LlmAdapter,
  markAgentLoopRequest,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as policy from '@deepseek-ai/dsh-compaction-resilience-policy'
import {
  COMPACTION_POLICY_IMMUTABLE_REQUEST,
  COMPACTION_TIMEOUT,
} from '@deepseek-ai/dsh-compaction-resilience-policy'
import type { Config as PolicyConfig } from '@deepseek-ai/dsh-compaction-resilience-policy'

const STOP: StreamChunk = { type: 'finish', reason: { kind: 'stop' } }

class RecordingAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []
  readonly entered = Promise.withResolvers<undefined>()

  constructor(
    private readonly waitForAbort = false,
    private readonly finishAfterAbort = true,
    private readonly emitUsage = false,
  ) {
    super()
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      context: { contextWindow: 1_000_000 },
      reasoning: {
        efforts: [
          { id: ReasoningEffortId('off'), name: 'Off' },
          { id: ReasoningEffortId('high'), name: 'High' },
        ],
      },
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push({ ...options })
    this.entered.resolve(undefined)
    if (!this.waitForAbort) {
      if (this.emitUsage) yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      if (this.finishAfterAbort) yield STOP
      return
    }
    const signal = options.signal
    if (signal !== undefined && !signal.aborted) {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    }
    if (!this.finishAfterAbort) return
    yield {
      type: 'finish',
      reason: {
        kind: 'aborted',
        failure: { message: 'adapter observed cancellation', code: 'ABORTED' },
      },
    }
  }
}

async function setup(
  config: PolicyConfig = {},
  waitForAbort = false,
  finishAfterAbort = true,
  emitUsage = false,
): Promise<{ ctx: Context; adapter: RecordingAdapter }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(TokenMeter)
  const adapter = new RecordingAdapter(waitForAbort, finishAfterAbort, emitUsage)
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(policy, config)
  return { ctx, adapter }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'mock',
    model: 'model',
    messages: [],
    ...overrides,
  }
}

describe('compaction controls', () => {
  it('uses the standalone output default without raising a smaller caller cap', async () => {
    const { ctx, adapter } = await setup()
    await collect(ctx.llm.stream(request({ purpose: 'compaction', maxTokens: 8192 })))
    await collect(ctx.llm.stream(request({ purpose: 'compaction', maxTokens: 1024 })))
    expect(adapter.calls.map(call => call.maxTokens)).toEqual([4096, 1024])
  })

  it('caps output, overrides reasoning, derives a deadline, and restores the caller request', async () => {
    const { ctx, adapter } = await setup({
      compactionMaxTokens: 2048,
      compactionReasoningEffort: 'off',
      compactionTimeoutMs: 30_000,
    })
    const upstream = new AbortController().signal
    const options = request({
      purpose: 'compaction',
      maxTokens: 8192,
      reasoningEffort: ReasoningEffortId('high'),
      signal: upstream,
    })

    await expect(collect(ctx.llm.stream(options))).resolves.toEqual([STOP])
    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]).toMatchObject({
      maxTokens: 2048,
      reasoningEffort: ReasoningEffortId('off'),
    })
    expect(adapter.calls[0]?.signal).not.toBe(upstream)
    expect(options).toMatchObject({
      maxTokens: 8192,
      reasoningEffort: ReasoningEffortId('high'),
      signal: upstream,
    })
  })

  it('never raises a smaller output cap and preserves reasoning when no override is configured', async () => {
    const { ctx, adapter } = await setup({ compactionMaxTokens: 2048 })
    const options = request({
      purpose: 'compaction',
      maxTokens: 512,
      reasoningEffort: ReasoningEffortId('high'),
    })
    await collect(ctx.llm.stream(options))
    expect(adapter.calls[0]).toMatchObject({
      maxTokens: 512,
      reasoningEffort: ReasoningEffortId('high'),
    })
    expect(options).not.toHaveProperty('signal')
  })

  it('leaves ordinary hand-built model calls unchanged', async () => {
    const { ctx, adapter } = await setup({
      compactionMaxTokens: 128,
      compactionReasoningEffort: 'off',
    })
    const upstream = new AbortController().signal
    const options = request({
      maxTokens: 4096,
      reasoningEffort: ReasoningEffortId('high'),
      signal: upstream,
    })
    await collect(ctx.llm.stream(options))
    expect(adapter.calls[0]).toMatchObject({
      maxTokens: 4096,
      reasoningEffort: ReasoningEffortId('high'),
      signal: upstream,
    })
  })

  it('passes nonterminal compaction chunks before the terminal finish', async () => {
    const { ctx } = await setup({}, false, true, true)
    await expect(collect(ctx.llm.stream(request({ purpose: 'compaction' })))).resolves.toEqual([
      { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
      STOP,
    ])
  })

  it('does not invent a terminal result when a downstream stream ends before the deadline', async () => {
    const { ctx } = await setup({}, false, false)
    await expect(collect(ctx.llm.stream(request({ purpose: 'compaction' })))).resolves.toEqual([])
  })

  it.each([
    ['frozen', (options: GenerateOptions) => Object.freeze(options)],
    ['sealed', (options: GenerateOptions) => Object.seal(options)],
  ])('fails closed rather than dispatching a %s compaction request unprotected', async (_kind, lock) => {
    const { ctx, adapter } = await setup()
    const options = lock(request({ purpose: 'compaction' }))
    const chunks = await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(0)
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: COMPACTION_POLICY_IMMUTABLE_REQUEST } },
    })
  })
})

describe('compaction total deadline', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('waits for cooperative adapter cleanup and translates its own deadline', async () => {
    const { ctx, adapter } = await setup({ compactionTimeoutMs: 100 }, true)
    const options = request({ purpose: 'compaction' })
    const pending = collect(ctx.llm.stream(options))
    await adapter.entered.promise
    await vi.advanceTimersByTimeAsync(100)
    const chunks = await pending
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          message: 'compaction generation timed out after 100ms',
          code: COMPACTION_TIMEOUT,
        },
      },
    })
    expect(options).not.toHaveProperty('signal')
  })

  it('supplies its timeout terminal when a cooperative adapter ends silently', async () => {
    const { ctx, adapter } = await setup({ compactionTimeoutMs: 100 }, true, false)
    const pending = collect(ctx.llm.stream(request({ purpose: 'compaction' })))
    await adapter.entered.promise
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual([{
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          message: 'compaction generation timed out after 100ms',
          code: COMPACTION_TIMEOUT,
        },
      },
    }])
  })

  it('closes the durable compaction bracket when summarization reaches the deadline', async () => {
    const { ctx, adapter } = await setup({ compactionTimeoutMs: 100 }, true, false)
    const compact = new BasicCompactionEngine(ctx, { auto: false, maxTokens: 8192 })
    const session = ctx.sessions.create(SessionId('deadline-compaction-bracket'))
    for (let turn = 1; turn <= 2; turn += 1) {
      session.append('turn/start', { turn })
      session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: `question ${turn} `.repeat(40) }],
        source: { kind: 'user' },
      }), { surfaceOp: 'append' })
      session.append('step/start', { turn, step: 1 })
      if (turn === 1) {
        session.append('request/header', {
          header: { config: { provider: 'mock', model: 'model' } },
          reason: 'initial',
        })
      }
      session.append('assistant/message', {
        turn,
        step: 1,
        stream: [],
        message: createMessage({
          role: 'assistant',
          content: [{ type: 'text', text: `answer ${turn} `.repeat(40) }],
          source: { kind: 'model', provider: 'mock', model: 'model' },
        }),
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step: 1 })
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
    }
    session.append('turn/start', { turn: 3 })
    const nodes = session.surface.nodes
    const owner = { session, options: { provider: 'mock', model: 'model' } } as Agent
    const pending = compact.compactRegion(nodes[0]!, nodes[1]!, owner)
    const rejection = expect(pending).rejects.toMatchObject({ code: COMPACTION_TIMEOUT })
    await adapter.entered.promise
    expect(session.snapshotEvents().filter(event => event.type.startsWith('compaction/'))
      .map(event => event.type)).toEqual(['compaction/start'])
    await vi.advanceTimersByTimeAsync(100)
    await rejection
    expect(session.snapshotEvents().filter(event => event.type.startsWith('compaction/'))
      .map(event => event.type)).toEqual(['compaction/start', 'compaction/end'])
  })

  it('preserves an upstream cancellation that wins before the policy deadline', async () => {
    const { ctx, adapter } = await setup({ compactionTimeoutMs: 100 }, true)
    const upstream = new AbortController()
    const options = request({ purpose: 'compaction', signal: upstream.signal })
    const pending = collect(ctx.llm.stream(options))
    await adapter.entered.promise
    upstream.abort('user cancelled')
    await vi.advanceTimersByTimeAsync(0)
    const chunks = await pending
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'aborted', failure: { code: 'ABORTED' } },
    })
    expect(options.signal).toBe(upstream.signal)
  })
})

describe('loop-request context admission', () => {
  async function loopFixture(
    contextOffset: number,
    requestPreflight = true,
  ): Promise<{
    ctx: Context
    adapter: RecordingAdapter
    options: GenerateOptions
    projectedTokens: number
  }> {
    const { ctx, adapter } = await setup({
      requestSafetyMarginTokens: 32,
      requestOutputReserveTokens: 64,
      requestPreflight,
    })
    const session = ctx.sessions.create(SessionId(`preflight-${contextOffset}`))
    const message = createUserMessage({
      content: [{ type: 'text', text: 'large durable request '.repeat(80) }],
      source: { kind: 'user' },
    })
    session.append('user/message', message, { surfaceOp: 'append' })
    session.append('request/header', {
      header: { config: { provider: 'mock', model: 'model' } },
      reason: 'initial',
    })
    const inputTokens = ctx.tokenMeter.measure(session).totalTokens
    const projectedTokens = inputTokens + 64 + 32
    session.append('request/context', {
      provider: 'mock',
      model: 'model',
      contextWindow: projectedTokens + contextOffset,
    })
    const options = markAgentLoopRequest(Object.freeze(request({
      messages: [message],
      sessionId: session.id,
    })))
    return { ctx, adapter, options, projectedTokens }
  }

  it('returns canonical context overflow without entering the adapter when projected usage is too large', async () => {
    const { ctx, adapter, options, projectedTokens } = await loopFixture(-1)
    const chunks = await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(0)
    const finish = chunks.at(-1)
    expect(finish?.type).toBe('finish')
    if (finish?.type !== 'finish' || finish.reason.kind !== 'error') {
      throw new Error('expected an error finish')
    }
    expect(finish.reason.failure.code).toBe(CONTEXT_WINDOW_EXCEEDED_CODE)
    expect(finish.reason.failure.message).toContain(`projected at ${projectedTokens} tokens`)
  })

  it('admits a request whose projection exactly fits the context window', async () => {
    const { ctx, adapter, options } = await loopFixture(0)
    await expect(collect(ctx.llm.stream(options))).resolves.toEqual([STOP])
    expect(adapter.calls).toHaveLength(1)
  })

  it('delegates when the logged route does not match the request', async () => {
    const { ctx, adapter, options } = await loopFixture(-1)
    const mismatched = markAgentLoopRequest(Object.freeze({ ...options, model: 'other' }))
    await collect(ctx.llm.stream(mismatched))
    expect(adapter.calls).toHaveLength(1)
  })

  it('delegates without a marked session id', async () => {
    const { ctx, adapter } = await setup()
    const options = markAgentLoopRequest(Object.freeze(request()))
    await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(1)
  })

  it('delegates when the marked session is absent', async () => {
    const { ctx, adapter } = await setup()
    const options = markAgentLoopRequest(Object.freeze(request({
      sessionId: SessionId('absent-preflight-session'),
    })))
    await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(1)
  })

  it('delegates when the session has no request context', async () => {
    const { ctx, adapter } = await setup()
    const session = ctx.sessions.create(SessionId('missing-request-context'))
    const options = markAgentLoopRequest(Object.freeze(request({ sessionId: session.id })))
    await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(1)
  })

  it('delegates when the logged provider does not match', async () => {
    const { ctx, adapter, options } = await loopFixture(-1)
    const session = options.sessionId === undefined ? undefined : ctx.sessions.get(options.sessionId)
    if (session === undefined) throw new Error('loop fixture lost its session')
    session.append('request/context', {
      provider: 'other-provider',
      model: 'model',
      contextWindow: 1,
    })
    await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(1)
  })

  it('delegates when matching request context has no capacity', async () => {
    const { ctx, adapter, options } = await loopFixture(-1)
    const session = options.sessionId === undefined ? undefined : ctx.sessions.get(options.sessionId)
    if (session === undefined) throw new Error('loop fixture lost its session')
    session.append('request/context', { provider: 'mock', model: 'model' })
    await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(1)
  })

  it('uses an explicit request output allowance in the projection', async () => {
    const { ctx, adapter, options } = await loopFixture(0)
    const explicit = markAgentLoopRequest(Object.freeze({ ...options, maxTokens: 65 }))
    const chunks = await collect(ctx.llm.stream(explicit))
    expect(adapter.calls).toHaveLength(0)
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: CONTEXT_WINDOW_EXCEEDED_CODE } },
    })
  })

  it('can disable request admission without disabling compaction controls', async () => {
    const { ctx, adapter, options } = await loopFixture(-1, false)
    await collect(ctx.llm.stream(options))
    expect(adapter.calls).toHaveLength(1)
  })
})

describe('configuration, disposal, and Loader path', () => {
  it('rejects unknown keys at plugin load', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(TokenMeter)
    await expect(ctx.plugin(policy, { typo: 1 } as policy.Config))
      .rejects.toThrow('unknown key "typo"')
  })

  it.each([
    [{ compactionMaxTokens: 0 }, 'compactionMaxTokens'],
    [{ compactionMaxTokens: 1.5 }, 'compactionMaxTokens'],
    [{ compactionTimeoutMs: 0 }, 'compactionTimeoutMs'],
    [{ compactionTimeoutMs: 1.5 }, 'compactionTimeoutMs'],
    [{ compactionTimeoutMs: 2_147_483_648 }, 'compactionTimeoutMs'],
    [{ requestPreflight: 'yes' }, 'requestPreflight'],
    [{ requestSafetyMarginTokens: -1 }, 'requestSafetyMarginTokens'],
    [{ requestSafetyMarginTokens: 1.5 }, 'requestSafetyMarginTokens'],
    [{ requestOutputReserveTokens: 0 }, 'requestOutputReserveTokens'],
    [{ requestOutputReserveTokens: 1.5 }, 'requestOutputReserveTokens'],
    [{ compactionReasoningEffort: '' }, 'compactionReasoningEffort'],
    [{ compactionReasoningEffort: 1 }, 'compactionReasoningEffort'],
  ])('rejects invalid direct config %j', async (config, field) => {
    const { ctx } = await setup()
    expect(() => { policy.apply(ctx, config as PolicyConfig) }).toThrow(field)
  })

  it('removes the global stream listener when its fiber is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(TokenMeter)
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['mock'], adapter)
    const fiber = await ctx.plugin(policy, { compactionMaxTokens: 64 })
    await collect(ctx.llm.stream(request({ purpose: 'compaction', maxTokens: 1024 })))
    await fiber.dispose()
    await collect(ctx.llm.stream(request({ purpose: 'compaction', maxTokens: 1024 })))
    expect(adapter.calls.map(call => call.maxTokens)).toEqual([64, 1024])
  })

  it('keeps named exports intact through Loader unwrapExports', () => {
    expect('default' in policy).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(policy) as Record<string, unknown>
    expect(unwrapped).toBe(policy)
    expect(unwrapped.name).toBe('compaction-resilience-policy')
    expect(unwrapped.inject).toEqual(['llm', 'sessions', 'tokenMeter'])
    expect(typeof unwrapped.apply).toBe('function')
  })
})
