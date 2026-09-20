/**
 * Purpose-scoped compaction controls and loop-request context admission.
 *
 * @module @deepseek-ai/dsh-compaction-resilience-policy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isAgentLoopRequest,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@deepseek-ai/dsh-timeout'
// Type-only imports activate the Context service declarations used below.
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-token-meter'

/** Stable failure code when the compaction-specific total deadline wins. */
export const COMPACTION_TIMEOUT = 'COMPACTION_TIMEOUT'

/** Stable failure code for a compaction request this policy cannot safely rewrite. */
export const COMPACTION_POLICY_IMMUTABLE_REQUEST = 'COMPACTION_POLICY_IMMUTABLE_REQUEST'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'compaction-resilience-policy'

/** Public services read by the stream policy. */
export const inject = ['llm', 'sessions', 'tokenMeter']

/** Configurable compaction and request-admission limits. */
export interface Config {
  /** Maximum output tokens sent by calls whose purpose is `compaction`. */
  compactionMaxTokens?: number
  /** Reasoning effort sent by calls whose purpose is `compaction`; omitted to preserve the caller/provider choice. */
  compactionReasoningEffort?: string
  /** Total cooperative deadline for one compaction stream, in milliseconds. */
  compactionTimeoutMs?: number
  /** Whether loop-built requests are checked against their logged context capacity before adapter dispatch. */
  requestPreflight?: boolean
  /** Additional headroom reserved inside the model context window. */
  requestSafetyMarginTokens?: number
  /** Output reserve used when a loop-built request has no explicit `maxTokens`. */
  requestOutputReserveTokens?: number
}

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  compactionMaxTokens: z.number().step(1).min(1).default(4096),
  compactionReasoningEffort: z.string().min(1),
  compactionTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(480_000),
  requestPreflight: z.boolean().default(true),
  requestSafetyMarginTokens: z.number().step(1).min(0).default(256),
  requestOutputReserveTokens: z.number().step(1).min(1).default(1024),
})

interface ResolvedConfig {
  readonly compactionMaxTokens: number
  readonly compactionReasoningEffort?: string
  readonly compactionTimeoutMs: number
  readonly requestPreflight: boolean
  readonly requestSafetyMarginTokens: number
  readonly requestOutputReserveTokens: number
}

const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'compactionMaxTokens',
  'compactionReasoningEffort',
  'compactionTimeoutMs',
  'requestPreflight',
  'requestSafetyMarginTokens',
  'requestOutputReserveTokens',
])

/** Resolve defaults and reject invalid direct or Loader-supplied configuration. */
function resolveConfig(config: Config): ResolvedConfig {
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new Error(`compaction-resilience-policy: unknown key "${key}"`)
    }
  }
  const compactionMaxTokens = config.compactionMaxTokens ?? 4096
  const compactionTimeoutMs = config.compactionTimeoutMs ?? 480_000
  const requestPreflight = config.requestPreflight ?? true
  const requestSafetyMarginTokens = config.requestSafetyMarginTokens ?? 256
  const requestOutputReserveTokens = config.requestOutputReserveTokens ?? 1024
  if (!Number.isSafeInteger(compactionMaxTokens) || compactionMaxTokens < 1) {
    throw new Error('compaction-resilience-policy: compactionMaxTokens must be a positive safe integer')
  }
  if (!Number.isSafeInteger(compactionTimeoutMs)
    || compactionTimeoutMs < 1
    || compactionTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `compaction-resilience-policy: compactionTimeoutMs must be a positive safe integer no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  if (typeof requestPreflight !== 'boolean') {
    throw new Error('compaction-resilience-policy: requestPreflight must be a boolean')
  }
  if (!Number.isSafeInteger(requestSafetyMarginTokens) || requestSafetyMarginTokens < 0) {
    throw new Error('compaction-resilience-policy: requestSafetyMarginTokens must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(requestOutputReserveTokens) || requestOutputReserveTokens < 1) {
    throw new Error('compaction-resilience-policy: requestOutputReserveTokens must be a positive safe integer')
  }
  if (config.compactionReasoningEffort !== undefined
    && (typeof config.compactionReasoningEffort !== 'string'
      || config.compactionReasoningEffort.length === 0)) {
    throw new Error('compaction-resilience-policy: compactionReasoningEffort must be a non-empty string')
  }
  return {
    compactionMaxTokens,
    ...config.compactionReasoningEffort === undefined
      ? {}
      : { compactionReasoningEffort: config.compactionReasoningEffort },
    compactionTimeoutMs,
    requestPreflight,
    requestSafetyMarginTokens,
    requestOutputReserveTokens,
  }
}

/** Build one terminal stream failure without entering the provider adapter. */
function failureChunk(message: string, code: string): StreamChunk {
  return { type: 'finish', reason: { kind: 'error', failure: { message, code } } }
}

/** Translate the policy-owned deadline into one terminal LLM failure. */
function timeoutFailure(ctx: Context, config: ResolvedConfig): StreamChunk {
  const message = `compaction generation timed out after ${config.compactionTimeoutMs}ms`
  ctx.logger.warn(`compaction-resilience-policy: ${message}`)
  return failureChunk(message, COMPACTION_TIMEOUT)
}

/**
 * Reject one oversized loop request from logged capacity and token facts.
 * Hand-built auxiliary calls and requests without a live matching capacity
 * delegate because this policy cannot prove their complete durable envelope.
 */
function preflightFailure(
  ctx: Context,
  options: GenerateOptions,
  config: ResolvedConfig,
): StreamChunk | undefined {
  if (!config.requestPreflight
    || !isAgentLoopRequest(options)
    || options.sessionId === undefined) return undefined
  const session = ctx.sessions.get(options.sessionId)
  const requestContext = session?.requestContext()
  if (session === undefined
    || requestContext?.provider !== options.provider
    || requestContext.model !== options.model
    || requestContext.contextWindow === undefined) return undefined

  const inputTokens = ctx.tokenMeter.measure(session).totalTokens
  const outputTokens = options.maxTokens ?? config.requestOutputReserveTokens
  const projectedTokens = inputTokens + outputTokens + config.requestSafetyMarginTokens
  if (projectedTokens <= requestContext.contextWindow) return undefined

  const message = `model request projected at ${projectedTokens} tokens `
    + `(${inputTokens} input + ${outputTokens} output reserve + `
    + `${config.requestSafetyMarginTokens} safety margin), exceeding context window `
    + `${requestContext.contextWindow}`
  ctx.logger.warn(`compaction-resilience-policy: ${message}; rejecting before adapter dispatch`)
  return failureChunk(message, CONTEXT_WINDOW_EXCEEDED_CODE)
}

/**
 * Apply the cap, optional reasoning override, and cooperative total deadline
 * to one compaction stream, restoring the caller's mutable request afterward.
 */
function resilientCompaction(
  ctx: Context,
  options: GenerateOptions,
  next: () => AsyncIterable<StreamChunk>,
  config: ResolvedConfig,
): AsyncIterable<StreamChunk> {
  return (async function* (): AsyncIterable<StreamChunk> {
    const maxTokensDescriptor = Object.getOwnPropertyDescriptor(options, 'maxTokens')
    const reasoningEffortDescriptor = Object.getOwnPropertyDescriptor(options, 'reasoningEffort')
    const signalDescriptor = Object.getOwnPropertyDescriptor(options, 'signal')
    using d = deadline(options.signal, config.compactionTimeoutMs, COMPACTION_TIMEOUT)
    try {
      try {
        options.maxTokens = Math.min(options.maxTokens ?? config.compactionMaxTokens, config.compactionMaxTokens)
        if (config.compactionReasoningEffort !== undefined) {
          options.reasoningEffort = ReasoningEffortId(config.compactionReasoningEffort)
        }
        options.signal = d.signal
      } catch {
        const message = 'compaction request properties cannot be rewritten; resilience controls cannot be applied safely'
        ctx.logger.warn(`compaction-resilience-policy: ${message}`)
        yield failureChunk(message, COMPACTION_POLICY_IMMUTABLE_REQUEST)
        return
      }

      for await (const chunk of next()) {
        if (chunk.type === 'finish') {
          if (timeoutOf(d.signal, COMPACTION_TIMEOUT) !== undefined) {
            yield timeoutFailure(ctx, config)
          } else {
            yield chunk
          }
          return
        }
        yield chunk
      }
      if (timeoutOf(d.signal, COMPACTION_TIMEOUT) !== undefined) {
        yield timeoutFailure(ctx, config)
      }
    } finally {
      if (maxTokensDescriptor === undefined) delete options.maxTokens
      else Object.defineProperty(options, 'maxTokens', maxTokensDescriptor)
      if (reasoningEffortDescriptor === undefined) delete options.reasoningEffort
      else Object.defineProperty(options, 'reasoningEffort', reasoningEffortDescriptor)
      if (signalDescriptor === undefined) delete options.signal
      else Object.defineProperty(options, 'signal', signalDescriptor)
    }
  })()
}

/**
 * Install one process-wide LLM waterfall policy. Global delivery reaches
 * compaction engines mounted inside per-session preset realms.
 *
 * @param ctx - plugin context providing LLM, session, and token-meter services.
 * @param input - configurable compaction and request-admission limits.
 */
export function apply(ctx: Context, input: Config = {}): void {
  const config = resolveConfig(input)
  ctx.on('llm/stream', (options, next): AsyncIterable<StreamChunk> => {
    return (async function* (): AsyncIterable<StreamChunk> {
      const rejected = preflightFailure(ctx, options, config)
      if (rejected !== undefined) {
        yield rejected
        return
      }
      if (options.purpose === 'compaction') {
        yield* resilientCompaction(ctx, options, next, config)
        return
      }
      yield* next()
    })()
  }, { global: true })
}
