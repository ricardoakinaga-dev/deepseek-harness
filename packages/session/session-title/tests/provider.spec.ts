import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import LlmRuntime, { createUserMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import SessionStore, { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { turnBoundaryProjectionDefinition } from '@deepseek-ai/dsh-agent-loop'
import SessionTitleService, {
  SessionTitleProviderId,
  type SessionTitleProvider,
  type SessionTitleProviderRequest,
  type SessionTitleProviderResult,
  type SessionTitleUserMessage,
} from '@deepseek-ai/dsh-session-title'
import { loadTestSessionTitleMessages } from './provider-fixtures.ts'

const CONFIG = {
  fallbackMaxWords: 5,
  fallbackMaxBytes: 24,
  maxTitleBytes: 24,
} as const

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function appendHumanPrompt(session: ReturnType<Context['sessions']['create']>, text: string) {
  return session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
}

function appendRoute(session: ReturnType<Context['sessions']['create']>, reason: 'initial' | 'change' = 'initial'): void {
  session.append('request/header', {
    header: { config: { provider: 'main-route', model: 'chat-model' } },
    reason,
  })
}

describe('SessionTitleService Provider lifecycle', () => {
  it('inherits title events across forks, skips first-prompt retitling, and lets all-messages update later', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const parent = ctx.sessions.create(SessionId('title-parent'))
    parent.append('turn/start', {
      turn: 1,
    })
    const inheritedMessage = appendHumanPrompt(parent, 'Inherited title prompt')
    await settle()
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const child = ctx.sessions.fork(parent, undefined, SessionId('title-child'))
    expect(ctx.sessionTitle.get(child)).toEqual(ctx.sessionTitle.get(parent))
    expect(child.snapshotEvents().find(event => event.type === 'session/title'))
      .toEqual(parent.snapshotEvents().find(event => event.type === 'session/title'))

    const firstGenerate = vi.fn(async (request: SessionTitleProviderRequest) => ({
      title: 'Should not run',
      messageSeqs: [request.messages[0]!.seq],
    }))
    const disposeFirst = ctx.sessionTitle.register({
      id: SessionTitleProviderId('fork-first'),
      automatic: 'first-prompt',
      loadMessages: loadTestSessionTitleMessages,
      generate: firstGenerate,
    })
    child.append('turn/start', {
      turn: 2,
    })
    const childMessage = appendHumanPrompt(child, 'Child follow-up prompt')
    await settle()
    appendRoute(child)
    await settle()
    child.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    expect(firstGenerate).not.toHaveBeenCalled()
    await disposeFirst()

    const allGenerate = vi.fn(async (request: SessionTitleProviderRequest) => ({
      title: 'Fork all prompts',
      messageSeqs: request.messages.map(message => message.seq),
    }))
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('fork-all'),
      automatic: 'all-prompts',
      loadMessages: loadTestSessionTitleMessages,
      generate: allGenerate,
    })
    child.append('turn/start', {
      turn: 3,
    })
    const latestMessage = appendHumanPrompt(child, 'Retitle the fork now')
    await settle()
    appendRoute(child, 'change')
    await settle()
    child.append('turn/end', { turn: 3, reason: { kind: 'completed' } })

    expect(allGenerate).toHaveBeenCalledOnce()
    expect(ctx.sessionTitle.get(child)).toMatchObject({
      title: 'Fork all prompts',
      messageSeqs: [inheritedMessage.seq, childMessage.seq, latestMessage.seq],
      source: { kind: 'provider', provider: SessionTitleProviderId('fork-all') },
    })
    expect(ctx.sessionTitle.get(parent)?.title).toBe('Inherited title prompt')
  })

  it('runs a first-prompt provider once after the routed request and retries only through refresh', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const requests: SessionTitleProviderRequest[] = []
    const loadMessages = vi.fn(loadTestSessionTitleMessages)
    const provider: SessionTitleProvider = {
      id: SessionTitleProviderId('first-model'),
      automatic: 'first-prompt',
      loadMessages,
      async generate(request) {
        requests.push(request)
        return {
          title: '\u001B[31m  A   model-generated title that is too long  ',
          messageSeqs: [request.messages[0]!.seq],
          model: { provider: 'aux-route', model: 'title-model' },
        }
      },
    }
    ctx.sessionTitle.register(provider)
    const session = ctx.sessions.create(SessionId('first-provider'))
    session.append('turn/start', {
      turn: 1,
    })
    const first = appendHumanPrompt(session, 'Explain asynchronous title generation')
    await settle()
    expect(ctx.sessionTitle.get(session)?.source.kind).toBe('fallback')

    appendRoute(session)
    await settle()

    expect(requests).toHaveLength(1)
    expect(loadMessages).not.toHaveBeenCalled()
    expect(requests[0]).toMatchObject({
      session,
      messages: [{ seq: first.seq, text: 'Explain asynchronous title generation' }],
      route: { provider: 'main-route', model: 'chat-model' },
    })
    expect(ctx.sessionTitle.get(session)).toMatchObject({
      title: 'A model-generated title',
      messageSeqs: [first.seq],
      source: {
        kind: 'provider',
        provider: SessionTitleProviderId('first-model'),
        model: { provider: 'aux-route', model: 'title-model' },
      },
    })

    const second = appendHumanPrompt(session, 'A later prompt')
    appendRoute(session, 'change')
    await settle()
    expect(requests).toHaveLength(1)

    await ctx.sessionTitle.refresh(session)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages.map(message => message.seq)).toEqual([first.seq, second.seq])
    expect(loadMessages).toHaveBeenCalledOnce()
  })

  it('rejects superseded history after load before starting generation', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const firstLoad = deferred<readonly { seq: ReturnType<typeof SessionSeq>; text: string }[]>()
    const loadStarted = deferred<undefined>()
    const loadSignals: AbortSignal[] = []
    const requests: SessionTitleProviderRequest[] = []
    let loadCount = 0
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('stale-during-load'),
      automatic: 'all-prompts',
      async loadMessages(request) {
        loadSignals.push(request.signal)
        if (loadCount++ === 0) {
          loadStarted.resolve(undefined)
          return firstLoad.promise
        }
        return loadTestSessionTitleMessages(request)
      },
      async generate(request) {
        requests.push(request)
        return { title: 'Newest title', messageSeqs: request.messages.map(message => message.seq) }
      },
    })
    const session = ctx.sessions.create(SessionId('stale-during-load'))
    session.append('turn/start', { turn: 1 })
    const first = appendHumanPrompt(session, 'First prompt')
    await settle()
    appendRoute(session)
    await loadStarted.promise

    const second = appendHumanPrompt(session, 'Second prompt')
    expect(loadSignals[0]?.aborted).toBe(true)
    appendRoute(session, 'change')
    await settle()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.map(message => message.seq)).toEqual([first.seq, second.seq])

    firstLoad.resolve([{ seq: first.seq, text: 'First prompt' }])
    await settle()
    expect(requests).toHaveLength(1)
    expect(ctx.sessionTitle.get(session)).toMatchObject({
      title: 'Newest title',
      messageSeqs: [first.seq, second.seq],
    })
  })

  it('keeps the accepted fallback when all-history loading fails', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const loadFailure = new Error('history unavailable')
    const generate = vi.fn(async () => { throw new Error('generation must not start') })
    const session = ctx.sessions.create(SessionId('history-failure'))
    let fallbackAtLoad: string | undefined
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('history-failure'),
      automatic: 'all-prompts',
      async loadMessages() {
        fallbackAtLoad = ctx.sessionTitle.get(session)?.source.kind
        throw loadFailure
      },
      generate,
    })
    session.append('turn/start', { turn: 1 })
    appendHumanPrompt(session, 'Keep this fallback')
    await settle()

    await expect(ctx.sessionTitle.refresh(session)).rejects.toBe(loadFailure)
    expect(fallbackAtLoad).toBe('fallback')
    expect(generate).not.toHaveBeenCalled()
    expect(ctx.sessionTitle.get(session)?.source.kind).toBe('fallback')
  })

  it('preserves provider input order across bounded title-input chunks', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const session = ctx.sessions.create(SessionId('chunked-provider-input'))
    session.append('turn/start', { turn: 1 })
    const messages = Array.from({ length: 70 }, (_, index) =>
      appendHumanPrompt(session, `Prompt ${String(index)}`))
    await settle()
    const generate = vi.fn(async (request: SessionTitleProviderRequest): Promise<SessionTitleProviderResult> => ({
      title: 'Chunked history',
      messageSeqs: request.messages.map(message => message.seq),
    }))
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('chunked-provider'),
      automatic: 'all-prompts',
      loadMessages: loadTestSessionTitleMessages,
      generate,
    })

    await ctx.sessionTitle.refresh(session)

    expect(generate).toHaveBeenCalledOnce()
    expect(generate.mock.calls[0]?.[0].messages).toEqual(messages.map((message, index) => ({
      seq: message.seq,
      text: `Prompt ${String(index)}`,
    })))
  })

  it('cuts a first-message provider request at its scheduled watermark when a newer prompt lands first', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const requests: SessionTitleProviderRequest[] = []
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('watermark-cut'),
      automatic: 'first-prompt',
      loadMessages: loadTestSessionTitleMessages,
      async generate(request) {
        requests.push(request)
        return {
          title: 'Watermarked title',
          messageSeqs: request.messages.map(message => message.seq),
        }
      },
    })
    const session = ctx.sessions.create(SessionId('watermark-cut'))
    session.append('turn/start', {
      turn: 1,
    })
    const first = appendHumanPrompt(session, 'First prompt')
    await settle()
    appendHumanPrompt(session, 'A newer prompt before the route')
    appendRoute(session)
    await settle()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages).toEqual([{ seq: first.seq, text: 'First prompt' }])
    expect(ctx.sessionTitle.get(session)).toMatchObject({
      title: 'Watermarked title',
      messageSeqs: [first.seq],
      source: { kind: 'provider', provider: SessionTitleProviderId('watermark-cut') },
    })
  })

  it('rejects later history leaked by a first-prompt provider during explicit refresh', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const load = deferred<readonly SessionTitleUserMessage[]>()
    const loadStarted = deferred<undefined>()
    const generate = vi.fn(async (request: SessionTitleProviderRequest) => ({
      title: 'Must not include a later prompt',
      messageSeqs: request.messages.map(message => message.seq),
    }))
    let throughSeq: ReturnType<typeof SessionSeq> | undefined
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('first-refresh-cut'),
      automatic: 'first-prompt',
      loadMessages(request) {
        throughSeq = request.throughSeq
        loadStarted.resolve(undefined)
        return load.promise
      },
      generate,
    })
    const session = ctx.sessions.create(SessionId('first-refresh-cut'))
    session.append('turn/start', { turn: 1 })
    const first = appendHumanPrompt(session, 'Refresh the first title')
    await settle()
    const fallback = ctx.sessionTitle.get(session)
    expect(fallback?.source.kind).toBe('fallback')

    const refresh = ctx.sessionTitle.refresh(session)
    await loadStarted.promise
    const later = appendHumanPrompt(session, 'This prompt is beyond the refresh cut')
    load.resolve([
      { seq: first.seq, text: 'Refresh the first title' },
      { seq: later.seq, text: 'This prompt is beyond the refresh cut' },
    ])

    await expect(refresh).rejects.toThrow(/does not match the active message cut/)
    expect(throughSeq).toBe(first.seq)
    expect(generate).not.toHaveBeenCalled()
    expect(ctx.sessionTitle.get(session)).toEqual(fallback)
  })

  it('rejects a second provider and drains stale work when the winner is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const pending = deferred<readonly SessionTitleUserMessage[]>()
    const loadStarted = deferred<undefined>()
    let observedSignal: AbortSignal | undefined
    const generate = vi.fn(async (request: SessionTitleProviderRequest) => ({
      title: 'Should not start after disposal',
      messageSeqs: request.messages.map(message => message.seq),
    }))
    const first: SessionTitleProvider = {
      id: SessionTitleProviderId('winner'),
      automatic: 'all-prompts',
      loadMessages(request) {
        observedSignal = request.signal
        loadStarted.resolve(undefined)
        return pending.promise
      },
      generate,
    }
    const dispose = ctx.sessionTitle.register(first)
    expect(() => ctx.sessionTitle.register({
      id: SessionTitleProviderId('duplicate'),
      automatic: 'first-prompt',
      loadMessages: loadTestSessionTitleMessages,
      generate: async () => ({ title: 'duplicate', messageSeqs: [SessionSeq(0)] }),
    })).toThrow(/already registered/)

    const session = ctx.sessions.create(SessionId('dispose-provider'))
    session.append('turn/start', {
      turn: 1,
    })
    const message = appendHumanPrompt(session, 'Generate this title')
    await settle()
    appendRoute(session)
    await loadStarted.promise
    expect(observedSignal?.aborted).toBe(false)

    const disposal = dispose()
    expect(observedSignal?.aborted).toBe(true)
    let disposed = false
    void disposal.then(() => { disposed = true })
    await settle()
    expect(disposed).toBe(false)
    pending.resolve([{ seq: message.seq, text: 'Generate this title' }])
    await disposal
    expect(disposed).toBe(true)
    expect(generate).not.toHaveBeenCalled()
    expect(ctx.sessionTitle.get(session)?.source.kind).toBe('fallback')

    const replacement: SessionTitleProvider = {
      id: SessionTitleProviderId('replacement'),
      automatic: 'first-prompt',
      loadMessages: loadTestSessionTitleMessages,
      generate: async () => ({ title: 'replacement', messageSeqs: [message.seq] }),
    }
    const disposeReplacement = ctx.sessionTitle.register(replacement)
    await disposeReplacement()
  })

  it('supersedes an older all-messages revision and cannot commit an ignored abort', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const firstResult = deferred<SessionTitleProviderResult>()
    const requests: SessionTitleProviderRequest[] = []
    const provider: SessionTitleProvider = {
      id: SessionTitleProviderId('all-model'),
      automatic: 'all-prompts',
      loadMessages: loadTestSessionTitleMessages,
      generate(request) {
        requests.push(request)
        if (requests.length === 1) return firstResult.promise
        return Promise.resolve({
          title: 'Newest complete title',
          messageSeqs: request.messages.map(message => message.seq),
        })
      },
    }
    ctx.sessionTitle.register(provider)
    const session = ctx.sessions.create(SessionId('supersede'))
    session.append('turn/start', {
      turn: 1,
    })
    const first = appendHumanPrompt(session, 'First prompt')
    await settle()
    appendRoute(session)
    await settle()

    const second = appendHumanPrompt(session, 'Second prompt')
    expect(requests[0]?.signal.aborted).toBe(true)
    appendRoute(session, 'change')
    await settle()
    expect(ctx.sessionTitle.get(session)).toMatchObject({
      title: 'Newest complete title',
      messageSeqs: [first.seq, second.seq],
    })

    firstResult.resolve({ title: 'Old ignored result', messageSeqs: [first.seq] })
    await settle()
    expect(ctx.sessionTitle.get(session)?.title).toBe('Newest complete title')
  })

  it('runs an all-messages revision when the next main request reuses its logged header', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, CONFIG)
    const requests: SessionTitleProviderRequest[] = []
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('unchanged-route'),
      automatic: 'all-prompts',
      loadMessages: loadTestSessionTitleMessages,
      async generate(request) {
        requests.push(request)
        return {
          title: `Revision ${requests.length}`,
          messageSeqs: request.messages.map(message => message.seq),
        }
      },
    })
    const session = ctx.sessions.create(SessionId('unchanged-route'))
    session.append('turn/start', {
      turn: 1,
    })
    const first = appendHumanPrompt(session, 'First routed prompt')
    await settle()
    session.append('step/start', { turn: 1, step: 1 })
    appendRoute(session)
    await settle()
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    session.append('turn/start', {
      turn: 2,
    })
    const second = appendHumanPrompt(session, 'Second prompt on the same route')
    await settle()
    session.append('step/start', { turn: 2, step: 1 })
    void ctx.llm.stream(markAgentLoopRequest(deepFreeze({
      provider: 'main-route',
      model: 'chat-model',
      messages: session.deriveMessages(),
      sessionId: session.id,
    })))
    await settle()

    expect(session.snapshotEvents().filter(event => event.type === 'request/header')).toHaveLength(1)
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({
      messages: [
        { seq: first.seq, text: 'First routed prompt' },
        { seq: second.seq, text: 'Second prompt on the same route' },
      ],
      route: { provider: 'main-route', model: 'chat-model' },
    })
  })

  it('ignores model streams that are not a matching loop request', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, CONFIG)
    const generate = vi.fn(async (request: SessionTitleProviderRequest): Promise<SessionTitleProviderResult> => ({
      title: 'Unexpected title',
      messageSeqs: request.messages.map(message => message.seq),
    }))
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('request-filter'),
      automatic: 'all-prompts',
      loadMessages: loadTestSessionTitleMessages,
      generate,
    })
    const options = { provider: 'main-route', model: 'chat-model', messages: [] }

    void ctx.llm.stream(deepFreeze(options))
    void ctx.llm.stream(markAgentLoopRequest(deepFreeze({ ...options, sessionId: SessionId('missing') })))
    const quiet = ctx.sessions.create(SessionId('quiet'))
    void ctx.llm.stream(markAgentLoopRequest(deepFreeze({ ...options, sessionId: quiet.id })))
    const pending = ctx.sessions.create(SessionId('unmatched-boundary'))
    pending.append('turn/start', {
      turn: 1,
    })
    appendHumanPrompt(pending, 'Wait for a matching request boundary')
    await settle()
    void ctx.llm.stream(markAgentLoopRequest(deepFreeze({ ...options, sessionId: pending.id })))
    await settle()

    expect(generate).not.toHaveBeenCalled()
  })

  it('contains automatic failures but lets explicit refresh reject', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionTitleService, CONFIG)
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    const provider: SessionTitleProvider = {
      id: SessionTitleProviderId('failing'),
      automatic: 'all-prompts',
      loadMessages: loadTestSessionTitleMessages,
      generate: async () => { throw new Error('title backend failed') },
    }
    ctx.sessionTitle.register(provider)
    const session = ctx.sessions.create(SessionId('failure'))
    session.append('turn/start', {
      turn: 1,
    })
    appendHumanPrompt(session, 'Keep a fallback')
    await settle()
    appendRoute(session)
    await settle()

    expect(ctx.sessionTitle.get(session)?.source.kind).toBe('fallback')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('automatic title generation failed'))
    await expect(ctx.sessionTitle.refresh(session)).rejects.toThrow('title backend failed')
    warn.mockRestore()
  })
})
