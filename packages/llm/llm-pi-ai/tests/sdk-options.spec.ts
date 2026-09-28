import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

const streamSimple = vi.hoisted(() => vi.fn())

// A hand-declared route is built by `createProvider` over the protocol table in
// `src/provider.ts`, so the table's lazy api module is the SDK boundary this
// test can observe. A catalog route dispatches through pi-ai's own provider and
// would not see this mock.
vi.mock('@earendil-works/pi-ai/api/openai-completions.lazy', () => ({
  openAICompletionsApi: () => ({ stream: streamSimple, streamSimple }),
}))
vi.mock('@earendil-works/pi-ai/api/openai-responses.lazy', () => ({
  openAIResponsesApi: () => ({ stream: streamSimple, streamSimple }),
}))
vi.mock('@earendil-works/pi-ai/api/anthropic-messages.lazy', () => ({
  anthropicMessagesApi: () => ({ stream: streamSimple, streamSimple }),
}))

import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'

afterEach(() => { streamSimple.mockReset() })

/** A hand-declared route with one fully described model. */
function gatewayAdapter(baseURL = 'http://127.0.0.1:9/v1', api = 'openai-completions'): PiAiAdapter {
  return new PiAiAdapter({
    profiles: () => resolveProfiles({
      'local-gateway': {
        api,
        baseURL,
        models: [{ id: 'local-model', contextWindow: 8192, maxTokens: 1024 }],
      },
    }),
    resolveApiKey: () => Promise.resolve('test-key'),
    auth: memoryAuth(),
  })
}

async function drain(adapter: PiAiAdapter, sessionId?: GenerateOptions['sessionId']): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream({
    provider: 'local-gateway',
    model: 'local-model',
    messages: [],
    ...sessionId === undefined ? {} : { sessionId },
  })) chunks.push(chunk)
  return chunks
}

describe('pi-ai SDK retry boundary', () => {
  it('pins one SDK attempt even when the installed provider currently defaults to zero retries', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    const chunks = await drain(gatewayAdapter())

    expect(streamSimple).toHaveBeenCalledOnce()
    expect(streamSimple.mock.calls[0]?.[2]).toMatchObject({ maxRetries: 0, apiKey: 'test-key' })
    // pi-ai reports a setup failure as a terminal in-stream error rather than
    // throwing, which the converter turns into the harness error finish.
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'mock SDK boundary' } },
    })
  })

  it('dispatches a hand-declared route to the endpoint and model its configuration describes', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    await drain(gatewayAdapter())

    expect(streamSimple.mock.calls[0]?.[0]).toMatchObject({
      id: 'local-model',
      provider: 'local-gateway',
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:9/v1',
      contextWindow: 8192,
      maxTokens: 1024,
    })
  })

  it.each(['openai-completions', 'openai-responses', 'anthropic-messages'])(
    'sends the conversation header through %s for an OpenCode endpoint alias',
    async (api) => {
      streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

      await drain(gatewayAdapter('https://opencode.ai/zen/go/v1', api), SessionId('aliased-conversation'))

      expect(streamSimple).toHaveBeenCalledOnce()
      expect(streamSimple.mock.calls[0]?.[2]).toMatchObject({
        sessionId: 'aliased-conversation',
        headers: { 'x-opencode-session': 'aliased-conversation' },
      })
    },
  )

  it.each(['https://opencode.ai.example.com/v1', 'https://example.com/opencode.ai/v1'])(
    'does not identify an unrelated endpoint as OpenCode: %s',
    async (baseURL) => {
      streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

      await drain(gatewayAdapter(baseURL), SessionId('private-conversation'))

      expect(streamSimple).toHaveBeenCalledOnce()
      expect(streamSimple.mock.calls[0]?.[2]).not.toHaveProperty('headers.x-opencode-session')
    },
  )

  it('does not invent an OpenCode conversation ID for a sessionless call', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    await drain(gatewayAdapter('https://opencode.ai/zen/go/v1'))

    expect(streamSimple).toHaveBeenCalledOnce()
    expect(streamSimple.mock.calls[0]?.[2]).not.toHaveProperty('headers.x-opencode-session')
  })
})
