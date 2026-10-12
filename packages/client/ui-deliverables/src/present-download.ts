/** Authenticated, cancellable downloads addressed only by recorded delivery coordinates. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-query'
import type { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { isPresentedData, isPresentedFile, PRESENT_DOWNLOAD_PATH } from './presented.ts'

/**
 * Register saved-copy downloads within Connection's browser authentication fence.
 * @param ctx - event lookup, attachment storage, and plugin lifetime.
 */
export function registerPresentDownload(ctx: Context): void {
  const lifetime = new AbortController()
  const pending = new Set<Promise<void>>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled(pending)
  })
  ctx.connection.fetch.register({
    path: PRESENT_DOWNLOAD_PATH, methods: ['GET'], requestBody: 'buffered',
    fetch: (request) => {
      let resolve: () => void
      const done = new Promise<void>((settled) => { resolve = settled })
      pending.add(done)
      const finish = () => { pending.delete(done); resolve() }
      return download(ctx, request, lifetime.signal, finish)
    },
  })
}

function coordinate(value: string | null): number | undefined {
  return value !== null && /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
}

async function download(ctx: Context, request: Request, lifetime: AbortSignal, finish: () => void): Promise<Response> {
  const abort = new AbortController()
  const signal = AbortSignal.any([request.signal, lifetime, abort.signal])
  let iterator: AsyncIterator<Uint8Array> | undefined
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    try { await iterator?.return?.() }
    finally { finish() }
  })()
  try {
    signal.throwIfAborted()
    const query = new URL(request.url).searchParams
    const id = query.get('sessionId')
    const seq = coordinate(query.get('seq'))
    const index = coordinate(query.get('index'))
    if (!id || seq === undefined || index === undefined) {
      await close()
      return new Response('Invalid Presented file coordinates.', { status: 400 })
    }
    const { target } = await ctx.sessionQuery.readEvent({ sessionId: id as SessionId, seq: seq as SessionSeq }, signal)
    signal.throwIfAborted()
    const file = target.type === 'deliverables/presented' && isPresentedData(target.data) ? target.data.files[index] : undefined
    if (!isPresentedFile(file) || file.capture?.status !== 'stored') {
      await close()
      return new Response('Saved copy not found.', { status: 404 })
    }
    const ref = file.capture.attachment
    const source = ctx.attachments.readFileStream(ref, signal)[Symbol.asyncIterator]()
    iterator = source
    let first: IteratorResult<Uint8Array> | undefined = await source.next()
    signal.throwIfAborted()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const onAbort = () => {
          controller.error(signal.reason)
          void close().catch((error: unknown) => { void error /* The response already carries the cancellation. */ })
        }
        signal.addEventListener('abort', onAbort, { once: true })
        const complete = finish
        finish = () => { signal.removeEventListener('abort', onAbort); complete() }
      },
      async pull(controller) {
        try {
          const next = first ?? await source.next()
          first = undefined
          signal.throwIfAborted()
          if (next.done === true) {
            controller.close()
            await close()
          } else controller.enqueue(next.value)
        } catch (error) {
          controller.error(new Error('Saved copy unavailable.', { cause: error }))
          await close()
        }
      },
      async cancel() {
        abort.abort()
        await close()
      },
    })
    return new Response(stream, { headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(ref.name).replace(/['()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    } })
  } catch (error) {
    await close()
    signal.throwIfAborted()
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    const missing = code === 'ATTACHMENT_NOT_FOUND' || code === 'SESSION_QUERY_SESSION_NOT_FOUND' || code === 'SESSION_QUERY_EVENT_NOT_FOUND'
    return new Response('Saved copy unavailable.', { status: missing ? 404 : 500 })
  }
}
