import { afterEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { BlockAssembler, userAgent } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

afterEach(closeMockServers)

/** Drive the production adapter through its installed SDK to the local HTTP fixture. */
async function consume(adapter: PiAiAdapter, request: GenerateOptions): Promise<void> {
  const assembler = new BlockAssembler()
  for await (const chunk of adapter.stream(request)) assembler.push(chunk)
  expect(assembler.finish).toEqual({ kind: 'stop' })
}

describe('OpenCode conversation routing', () => {
  it.each(['opencode-go', 'opencode'])('sends the same conversation ID on repeated %s requests', async (provider) => {
    const server = await mockServer([{ events: textEvents }, { events: textEvents }])
    const profiles = resolveProfiles({ [provider]: {
      baseURL: server.url,
      models: [{ id: 'deepseek-v4-flash' }],
      headers: { 'X-OpenCode-Session': 'stale-profile-id', 'x-company': 'retained', 'User-Agent': 'wrong' },
    } })
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: () => Promise.resolve('test-key'),
      auth: memoryAuth(),
    })
    const request = { provider, model: 'deepseek-v4-flash', sessionId: SessionId('conversation-a'), messages: [] }

    await consume(adapter, request)
    await consume(adapter, request)

    expect(server.headers.map(headers => headers['x-opencode-session'])).toEqual(['conversation-a', 'conversation-a'])
    expect(server.headers[0]?.['x-company']).toBe('retained')
    expect(server.headers[0]?.['user-agent']).toBe(userAgent())
  })

  it('keeps simultaneous conversations separate on one adapter', async () => {
    const server = await mockServer([{ events: textEvents }, { events: textEvents }])
    const profiles = resolveProfiles({ 'opencode-go': {
      baseURL: server.url,
      models: [{ id: 'deepseek-v4-flash' }],
    } })
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: () => Promise.resolve('test-key'),
      auth: memoryAuth(),
    })

    await Promise.all(['conversation-a', 'conversation-b'].map(id => consume(adapter, {
      provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: SessionId(id), messages: [],
    })))

    expect(server.headers.map(headers => headers['x-opencode-session']).sort()).toEqual(['conversation-a', 'conversation-b'])
  })

  it('does not add an OpenCode header to another provider', async () => {
    const server = await mockServer([{ events: textEvents }])
    const profiles = resolveProfiles({ deepseek: { baseURL: server.url } })
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: () => Promise.resolve('test-key'),
      auth: memoryAuth(),
    })

    await consume(adapter, {
      provider: 'deepseek', model: 'deepseek-v4-flash', sessionId: SessionId('conversation-a'), messages: [],
    })

    expect(server.headers[0]).not.toHaveProperty('x-opencode-session')
  })
})
