/** Saved-copy downloads use authenticated event coordinates and cancel owned storage reads. */
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { SessionQueryError, type SessionEventReadRequest } from '@deepseek-ai/dsh-session-query'
import { afterEach, expect, it, vi } from 'vitest'
import { registerPresentDownload } from '../src/present-download.ts'
import { isPresentedFile } from '../src/presented.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  vi.restoreAllMocks()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-present-download-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  let record: CredentialRecord | undefined
  ctx.provide('credentials', {
    readRecord: () => Promise.resolve(record),
    modifyRecord: async (_key: unknown, mutate: (value: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) => {
      record = await mutate(record)
      return record
    },
  } as never)
  const routes: WebRoute[] = []
  ctx.provide('webServer', { register: (route: WebRoute) => { routes.push(route); return () => {} } } as never)
  await ctx.plugin(Connection)
  await ctx.plugin(LocalAttachmentStore, { dshHome: root })
  const data = Uint8Array.of(80, 75, 0, 255)
  const attachment = await ctx.attachments.saveFile({ name: '报告 (final).bin', data })
  const file: Record<string, unknown> = { path: '/deleted/source.bin', capture: { status: 'stored', attachment } }
  const readEvent = vi.fn(async (request: SessionEventReadRequest): Promise<{
    session: Record<string, never>
    target: { type: string; data: unknown }
  }> => {
    if (request.sessionId !== 'owner' && request.sessionId !== 'fork') throw new SessionQueryError('missing', 'SESSION_QUERY_SESSION_NOT_FOUND')
    if (request.seq !== 7) throw new SessionQueryError('missing', 'SESSION_QUERY_EVENT_NOT_FOUND')
    return { session: {}, target: { type: 'deliverables/presented', data: { turn: 1, callId: 'present-call', files: [file] } } }
  })
  ctx.provide('sessionQuery', { readEvent } as never)
  const fiber = ctx.plugin({ inject: ['connection', 'sessionQuery', 'attachments'], apply: registerPresentDownload })
  await fiber
  const handler = ctx.connection.createSharedFetchHandler('/api')
  const get = (query = '?sessionId=owner&seq=7&index=0', signal?: AbortSignal) => handler.fetch(new Request(
    `http://localhost/api/present.download${query}`, { signal: signal ?? null },
  ))
  return { ctx, routes, file, attachment, data, readEvent, get, fiber, handler }
}

it('requires browser authentication before lookup and downloads binary bytes without a desktop', async () => {
  const { ctx, routes, readEvent, data } = await fixture()
  const route = routes.find(entry => entry.path === '/api')!
  const server = createServer((request, response) => {
    void Promise.resolve(route.handler(request, response)).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)))
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing listener address')
  const authority = `127.0.0.1:${address.port}`
  const url = `http://${authority}/api/present.download?sessionId=owner&seq=7&index=0`
  const unauthorized = await fetch(url)
  expect(unauthorized.status).toBe(401)
  await unauthorized.text()
  expect(readEvent).not.toHaveBeenCalled()
  const tokenUrl = new URL(ctx.connection.authenticatedUrl(`http://${authority}`))
  let cookie = ''
  ctx.connection.authorizeIndex({ method: 'GET', url: tokenUrl.pathname + tokenUrl.search, headers: { host: authority } }, {
    writeHead(_status, headers) { cookie = headers?.['set-cookie']?.split(';')[0] ?? '' },
    end() {},
  })
  const response = await fetch(url, { headers: { cookie } })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A%20%28final%29.bin")
  expect(response.headers.get('content-type')).toBe('application/octet-stream')
  expect(response.headers.get('content-length')).toBeNull()
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(data)
  expect(ctx.get('sessionController')).toBeUndefined()
})

it.each(['', '?seq=7&index=0', '?sessionId=owner&seq=-1&index=0', '?sessionId=owner&seq=7&index=1.2', '?sessionId=owner&seq=9007199254740992&index=0', '?attachmentId=sha256:abcd&path=/etc/passwd'])('rejects invalid coordinates %s before lookup', async (query) => {
  const { get, readEvent } = await fixture()
  expect((await get(query)).status).toBe(400)
  expect(readEvent).not.toHaveBeenCalled()
})

it.each(['?sessionId=absent&seq=7&index=0', '?sessionId=owner&seq=8&index=0', '?sessionId=owner&seq=7&index=1'])('reports missing recorded coordinates %s', async (query) => {
  const { get } = await fixture()
  expect((await get(query)).status).toBe(404)
})

it.each([undefined, { status: 'too-large', maxBytes: 20 }, null, [], { status: 'stored' }, { status: 'unknown' }, { status: 'too-large', maxBytes: -1 }])('does not read storage for absent, unavailable, or malformed capture %j', async (capture) => {
  const { get, file, ctx } = await fixture()
  file.capture = capture
  const read = vi.spyOn(ctx.attachments, 'readFileStream')
  expect((await get()).status).toBe(404)
  expect(read).not.toHaveBeenCalled()
})

it.each([
  { attachmentId: '../../secret' }, { name: '../secret' }, { name: '' }, { name: '\r\nsecret' }, { bytes: -1 }, { bytes: 1.2 }, { bytes: Number.MAX_SAFE_INTEGER + 1 },
  { name: '\ud800' },
])('rejects malformed stored references through the public declaration validator %j', async (fields) => {
  const { get, file, attachment, ctx } = await fixture()
  file.capture = { status: 'stored', attachment: { ...attachment, ...fields } }
  const read = vi.spyOn(ctx.attachments, 'readFileStream')
  expect(isPresentedFile(file)).toBe(false)
  expect((await get()).status).toBe(404)
  expect(read).not.toHaveBeenCalled()
})

it('resolves inherited saved bytes from the viewed fork without accessing the original path', async () => {
  const { get, data, readEvent } = await fixture()
  const response = await get('?sessionId=fork&seq=7&index=0')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(data)
  expect(readEvent.mock.lastCall?.[0]).toEqual({ sessionId: 'fork', seq: 7 })
})

it('reports missing objects without exposing host storage paths', async () => {
  const { get, ctx, attachment } = await fixture()
  await unlink(ctx.attachments.fileHostPath(attachment)!)
  const response = await get()
  expect(response.status).toBe(404)
  expect(await response.text()).toBe('Saved copy unavailable.')
})

it('serves only delivery events over GET', async () => {
  const { get, handler, readEvent } = await fixture()
  const post = await handler.fetch(new Request('http://localhost/api/present.download?sessionId=owner&seq=7&index=0', { method: 'POST' }))
  expect(post.status).toBe(404)
  expect(readEvent).not.toHaveBeenCalled()
  readEvent.mockResolvedValueOnce({ session: {}, target: { type: 'turn/start', data: { turn: 1 } } })
  expect((await get()).status).toBe(404)
})

it.each(['lookup', 'storage'] as const)('sanitizes a %s failure before any file bytes are sent', async (failure) => {
  const { get, ctx, readEvent } = await fixture()
  const error = new Error('Cannot read /private/storage/object')
  if (failure === 'lookup') readEvent.mockRejectedValueOnce(error)
  else vi.spyOn(ctx.attachments, 'readFileStream').mockImplementation(() => { throw error })
  const response = await get()
  expect(response.status).toBe(500)
  expect(await response.text()).toBe('Saved copy unavailable.')
})

it('fails an incomplete download when stored bytes fail integrity verification', async () => {
  const { get, ctx, attachment } = await fixture()
  await unlink(ctx.attachments.fileHostPath(attachment)!)
  await writeFile(ctx.attachments.fileHostPath(attachment)!, Uint8Array.of(0, 0, 0, 0))
  const response = await get()
  expect(response.status).toBe(200)
  await expect(response.arrayBuffer()).rejects.toThrow('Saved copy unavailable.')
})

it('downloads an empty saved file', async () => {
  const { get, ctx, file } = await fixture()
  file.capture = { status: 'stored', attachment: await ctx.attachments.saveFile({ data: new Uint8Array(), name: 'empty' }) }
  expect((await (await get()).arrayBuffer()).byteLength).toBe(0)
})

it.each(['consumer', 'request', 'dispose'] as const)('cancels and drains an active storage read on %s', async (cause) => {
  const { get, ctx, fiber } = await fixture()
  let enter: () => void
  let release: () => void
  const entered = new Promise<void>((resolve) => { enter = resolve })
  const released = new Promise<void>((resolve) => { release = resolve })
  vi.spyOn(ctx.attachments, 'readFileStream').mockImplementation(async function* (_ref, signal) {
    try {
      yield Uint8Array.of(42)
      enter()
      await new Promise<void>((_resolve, reject) => {
        if (signal!.aborted) reject(new Error('Read aborted'))
        else signal!.addEventListener('abort', () => { reject(new Error('Read aborted')) }, { once: true })
      })
    } finally { release() }
  })
  const abort = new AbortController()
  const response = await get(undefined, abort.signal)
  const reader = response.body!.getReader()
  expect((await reader.read()).value).toEqual(Uint8Array.of(42))
  const next = reader.read()
  const observed = next.catch((error: unknown) => error)
  await entered
  if (cause === 'consumer') await reader.cancel()
  else if (cause === 'request') abort.abort()
  else await fiber.dispose()
  await released
  if (cause === 'consumer') expect(await observed).toEqual({ done: true, value: undefined })
  else expect(await observed).toBeInstanceOf(Error)
  await fiber.dispose()
})

it('aborts before lookup and removes the route on disposal', async () => {
  const { get, readEvent, fiber } = await fixture()
  await expect(get(undefined, AbortSignal.abort())).rejects.toThrow()
  expect(readEvent).not.toHaveBeenCalled()
  await fiber.dispose()
  expect((await get()).status).toBe(404)
})
