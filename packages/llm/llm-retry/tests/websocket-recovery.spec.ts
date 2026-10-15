import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, expandAssistantStream } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import * as Retry from '../src/index.ts'

type Reply = 'premature-close' | 'complete' | 'tool' | 'fatal'

let root: string | undefined
let context: Context | undefined
let disposePeer: (() => void) | undefined

afterEach(async () => {
  try {
    await context?.fiber.dispose()
  } finally {
    context = undefined
    disposePeer?.()
    disposePeer = undefined
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    root = undefined
  }
})

function replyEvents(reply: Reply): object[] {
  const created = { type: 'response.created', response: { id: 'response-local' } }
  if (reply === 'fatal') {
    return [created, { type: 'error', code: 'fatal', message: 'unrecognized provider failure' }]
  }
  const tool = reply === 'tool' || reply === 'premature-close'
  const item = tool
    ? { type: 'function_call', id: 'fc_local', call_id: 'call_local', name: 'write_once', arguments: '{}' }
    : { type: 'message', id: 'msg_local', role: 'assistant', content: [{ type: 'output_text', text: 'recovered response' }] }
  return [
    created,
    { type: 'response.output_item.added', output_index: 0, item: { ...item, ...tool ? { arguments: '' } : { content: [] } } },
    ...tool
      ? [{ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{}' }]
      : [{ type: 'response.output_text.delta', output_index: 0, delta: 'recovered response' }],
    { type: 'response.output_item.done', output_index: 0, item },
    ...reply === 'premature-close' ? [] : [{
      type: 'response.completed',
      response: { id: 'response-local', status: 'completed', output: [item], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } },
    }],
  ]
}

/** Only the WebSocket peer is substituted; pi-ai parses frames and constructs its own terminal errors. */
function controlledPeer(script: readonly Reply[]): {
  requests: { url: string; body: unknown }[]
  closes: number[]
  fetch: ReturnType<typeof vi.fn>
} {
  const requests: { url: string; body: unknown }[] = []
  const closes: number[] = []
  const sockets = new Set<LocalWebSocket>()
  const callbacks = new Set<ReturnType<typeof setImmediate>>()
  class LocalWebSocket extends EventTarget {
    readyState = 0

    constructor(readonly url: string) {
      super()
      sockets.add(this)
      queueMicrotask(() => {
        if (this.readyState !== 0) return
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
      })
    }

    send(data: string): void {
      requests.push({ url: this.url, body: JSON.parse(data) })
      const reply = script[requests.length - 1]
      if (reply === undefined) throw new Error('controlled WebSocket script exhausted')
      // A peer reply arrives after the SDK has subscribed to the socket's events.
      const callback = setImmediate(() => {
        callbacks.delete(callback)
        if (this.readyState !== 1) return
        for (const event of replyEvents(reply)) {
          this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
        }
        // Message decoding is asynchronous; the close follows those decoded frames.
        queueMicrotask(() => { this.close(1000) })
      })
      callbacks.add(callback)
    }

    close(code = 1000): void {
      if (this.readyState === 3) return
      this.readyState = 3
      sockets.delete(this)
      closes.push(code)
      this.dispatchEvent(Object.assign(new Event('close'), { code, reason: '', wasClean: true }))
    }
  }
  disposePeer = () => {
    for (const callback of callbacks) clearImmediate(callback)
    callbacks.clear()
    for (const socket of sockets) socket.close()
  }
  vi.stubGlobal('WebSocket', LocalWebSocket)
  const fetch = vi.fn(() => Promise.reject(new Error('unexpected HTTP/SSE fallback')))
  vi.stubGlobal('fetch', fetch)
  return { requests, closes, fetch }
}

async function loadComposition(maxRetries = 2): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-websocket-recovery-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    ...[
      '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection',
      '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-llm-retry', '@deepseek-ai/dsh-agent-loop',
    ].map(name => `- name: '${name}'`),
    "- name: '@deepseek-ai/dsh-llm-pi-ai'",
    '  config:',
    '    providers:',
    '      openai-codex:',
    '        apiKeyEnv: H02_CODEX_TOKEN',
    '        baseURL: http://127.0.0.1:9',
    '        transport: websocket',
    '        cacheRetention: none',
    '        retryPolicy:',
    '          mode: normal',
    `          maxRetries: ${maxRetries}`,
    '          backoff: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 }',
    '        models:',
    '          - id: gpt-5.4',
    '',
  ].join('\n'))
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'local-test' } })).toString('base64url')
  vi.stubEnv('H02_CODEX_TOKEN', `test.${payload}.test`)
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ['@deepseek-ai/dsh-llm-retry', Retry],
    ['@deepseek-ai/dsh-llm-pi-ai', LlmPiAi],
  ])
  const internal: ModuleLoaderV2 = {
    version: 'v2', loadCache: new Map(),
    import: (specifier) => {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return Promise.resolve(modules.get(specifier))
    },
    register(): never { throw new Error('unexpected module hook registration') },
    getOrCreateModuleJob(): never { throw new Error('unexpected module job creation') },
    resolveSync(): never { throw new Error('unexpected synchronous module resolution') },
    load(): never { throw new Error('unexpected module load') },
  }
  ctx.loader.internal = internal
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
  return ctx
}

async function run(ctx: Context) {
  const agent = await ctx.agentLoop.create(SessionId('websocket-local'), { provider: 'openai-codex', model: 'gpt-5.4' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'recover' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  return agent.session
}

describe('bounded retry through the real pi-ai WebSocket adapter and Loader composition', () => {
  it('retries the exact premature normal-close error without executing an uncommitted tool call', async () => {
    const peer = controlledPeer(['premature-close', 'complete'])
    const ctx = await loadComposition()
    const execute = vi.fn(async () => [{ type: 'text' as const, text: 'unexpected' }])
    ctx.effect(() => ctx.tools.register(defineContentToolFixture({ name: 'write_once', description: 'write once', parameters: {}, execute })))

    const session = await run(ctx)
    const events = session.snapshotEvents()
    const attempts = events.filter(event => event.type === 'assistant/attempt')

    expect(expandAssistantStream(attempts[0]!.data.stream).at(-1)?.chunk).toMatchObject({
      type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'WebSocket closed 1000' } },
    })

    expect(events.filter(event => event.type === 'llm/retry').map(event => event.data.failure))
      .toEqual([{ code: 'TRANSPORT', message: 'WebSocket closed 1000' }])
    expect(events.filter(event => event.type === 'llm/retry-started')).toHaveLength(1)
    expect(peer.requests).toHaveLength(2)
    expect(peer.requests[0]?.body).toEqual(peer.requests[1]?.body)
    expect(peer.requests.map(request => request.url)).toEqual(Array(2).fill('ws://127.0.0.1:9/codex/responses'))
    expect(peer.closes).toEqual([1000, 1000])
    expect(peer.fetch).not.toHaveBeenCalled()
    expect(attempts).toHaveLength(1)
    expect(expandAssistantStream(attempts[0]!.data.stream).map(entry => entry.chunk)
      .find(chunk => chunk.type === 'block-end' && chunk.block.type === 'tool-call'))
      .toMatchObject({ type: 'block-end', block: { type: 'tool-call', name: 'write_once' } })
    expect(execute).not.toHaveBeenCalled()
    expect(events.filter(event => event.type === 'assistant/message')).toHaveLength(1)
    expect(session.deriveMessages().at(-1)).toMatchObject({ role: 'assistant', content: [{ type: 'text', text: 'recovered response' }] })
    expect(events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  })

  it('stops at the configured budget without hidden SDK attempts or HTTP fallback', async () => {
    const peer = controlledPeer(['premature-close', 'premature-close', 'premature-close'])
    const session = await run(await loadComposition(2))
    const events = session.snapshotEvents()

    expect(events.filter(event => event.type === 'llm/retry').map(event => event.data.retry)).toEqual([1, 2])
    expect(events.filter(event => event.type === 'llm/retry-started')).toHaveLength(2)
    expect(events.filter(event => event.type === 'assistant/attempt')).toHaveLength(3)
    expect(events.filter(event => event.type === 'step/start')).toHaveLength(1)
    expect(events.filter(event => event.type === 'assistant/message')).toHaveLength(0)
    expect(events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'TRANSPORT', message: 'WebSocket closed 1000' } } } })
    expect(peer.requests).toHaveLength(3)
    expect(peer.closes).toEqual([1000, 1000, 1000])
    expect(peer.fetch).not.toHaveBeenCalled()
  })

  it('keeps a completed response successful after normal close', async () => {
    const peer = controlledPeer(['complete'])
    const session = await run(await loadComposition())

    expect(session.snapshotEvents().filter(event => event.type === 'llm/retry')).toHaveLength(0)
    expect(session.snapshotEvents().filter(event => event.type === 'assistant/message')).toHaveLength(1)
    expect(session.snapshotEvents().at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(peer.requests).toHaveLength(1)
    expect(peer.closes).toEqual([1000])
    expect(peer.fetch).not.toHaveBeenCalled()
  })

  it('does not retry an unknown fatal provider error', async () => {
    const peer = controlledPeer(['fatal', 'complete'])
    const session = await run(await loadComposition())

    expect(session.snapshotEvents().filter(event => event.type === 'llm/retry')).toHaveLength(0)
    expect(session.snapshotEvents().filter(event => event.type === 'assistant/message')).toHaveLength(0)
    expect(session.snapshotEvents().at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'PI_AI_ERROR' } } } })
    expect(peer.requests).toHaveLength(1)
    expect(peer.fetch).not.toHaveBeenCalled()
  })

  it('retries only the failed next step after a completed tool response closes normally', async () => {
    const peer = controlledPeer(['tool', 'premature-close', 'complete'])
    const ctx = await loadComposition()
    const effectPath = join(root!, 'tool-effects.txt')
    await writeFile(effectPath, '')
    ctx.effect(() => ctx.tools.register(defineContentToolFixture({
      name: 'write_once', description: 'append one committed effect', parameters: {},
      async execute() {
        await appendFile(effectPath, 'committed\n')
        return [{ type: 'text', text: 'written' }]
      },
    })))

    const session = await run(ctx)
    const events = session.snapshotEvents()

    expect(await readFile(effectPath, 'utf8')).toBe('committed\n')
    expect(events.filter(event => event.type === 'tool/call')).toHaveLength(1)
    expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
    expect(events.filter(event => event.type === 'assistant/message').map(event => event.data.step)).toEqual([1, 2])
    expect(events.filter(event => event.type === 'llm/retry').map(event => [event.data.step, event.data.failure.code])).toEqual([[2, 'TRANSPORT']])
    expect(events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(peer.requests).toHaveLength(3)
    expect(peer.requests[1]?.body).toEqual(peer.requests[2]?.body)
    expect(peer.requests[1]?.body).toHaveProperty('input', expect.arrayContaining([
      expect.objectContaining({ type: 'function_call_output', output: 'written' }),
    ]))
    expect(peer.closes).toEqual([1000, 1000, 1000])
    expect(peer.fetch).not.toHaveBeenCalled()
  })
})
