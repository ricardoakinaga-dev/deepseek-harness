import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { bridge, BufferedRequestLimiter } from '../src/http-bridge.ts'

function bufferedRequest(body: string, url = '/api/test'): IncomingMessage {
  const request = Readable.from([Buffer.from(body)]) as IncomingMessage
  Object.assign(request, {
    url,
    method: 'POST',
    headers: { 'content-length': String(Buffer.byteLength(body)), 'content-type': 'application/json' },
  })
  return request
}

function bufferedResponse() {
  let body: string | undefined
  const response = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    writableFinished: false,
    writeHead() { return this },
    write(chunk: string | Uint8Array) { body = Buffer.from(chunk).toString(); return true },
    end(this: { writableEnded: boolean; writableFinished: boolean; emit: EventEmitter['emit'] }, chunk?: string) {
      if (chunk !== undefined) body = chunk
      this.writableEnded = true
      this.writableFinished = true
      this.emit('finish')
      return this
    },
  })
  return { response, body: () => body }
}

describe('HTTP bridge abort', () => {
  it('rejects concurrent buffered intake at the shared aggregate budget and releases after quiescence', async () => {
    const limiter = new BufferedRequestLimiter(4)
    const firstStarted = Promise.withResolvers<undefined>()
    const releaseFirst = Promise.withResolvers<undefined>()
    let calls = 0
    const firstResponse = bufferedResponse()
    const first = bridge(bufferedRequest('body'), firstResponse.response, {
      requestBodyMode: () => 'buffered',
      fetch: async () => {
        calls++
        firstStarted.resolve(undefined)
        await releaseFirst.promise
        return Response.json({ accepted: true })
      },
    }, 4, limiter)
    try {
      await firstStarted.promise

      const rejectedResponse = bufferedResponse()
      await bridge(bufferedRequest('body'), rejectedResponse.response, {
        requestBodyMode: () => 'buffered',
        fetch: async () => {
          calls++
          return Response.json({ accepted: false })
        },
      }, 4, limiter)
      expect(rejectedResponse.body()).toBe('buffered request capacity exhausted')
      expect(calls).toBe(1)

      releaseFirst.resolve(undefined)
      await first

      const acceptedResponse = bufferedResponse()
      await bridge(bufferedRequest('body'), acceptedResponse.response, {
        requestBodyMode: () => 'buffered',
        fetch: async () => Response.json({ accepted: true }),
      }, 4, limiter)
      expect(acceptedResponse.body()).toContain('accepted')
    } finally {
      releaseFirst.resolve(undefined)
      await first
    }
  })

  it('keeps a disconnected reservation until the cancelled handler settles', async () => {
    const limiter = new BufferedRequestLimiter(4)
    const handlerStarted = Promise.withResolvers<undefined>()
    const abortSeen = Promise.withResolvers<undefined>()
    const finishHandler = Promise.withResolvers<undefined>()
    const response = bufferedResponse()
    const pending = bridge(bufferedRequest('body'), response.response, {
      requestBodyMode: () => 'buffered',
      fetch: async (request) => {
        handlerStarted.resolve(undefined)
        if (!request.signal.aborted) {
          await new Promise<void>((resolve) => {
            request.signal.addEventListener('abort', () => { resolve() }, { once: true })
          })
        }
        abortSeen.resolve(undefined)
        await finishHandler.promise
        return Response.json({ aborted: request.signal.aborted })
      },
    }, 4, limiter)
    try {
      await handlerStarted.promise
      response.response.emit('close')
      await abortSeen.promise

      const rejectedResponse = bufferedResponse()
      await bridge(bufferedRequest('body'), rejectedResponse.response, {
        requestBodyMode: () => 'buffered',
        fetch: async () => Response.json({ accepted: false }),
      }, 4, limiter)
      expect(rejectedResponse.body()).toBe('buffered request capacity exhausted')

      finishHandler.resolve(undefined)
      await pending
      const acceptedResponse = bufferedResponse()
      await bridge(bufferedRequest('body'), acceptedResponse.response, {
        requestBodyMode: () => 'buffered',
        fetch: async () => Response.json({ accepted: true }),
      }, 4, limiter)
      expect(acceptedResponse.body()).toContain('accepted')
    } finally {
      finishHandler.resolve(undefined)
      await pending
    }
  })

  it('destroys a declared-oversize request instead of draining it', async () => {
    const destroyed: true[] = []
    const request = Readable.from([]) as IncomingMessage
    Object.assign(request, {
      url: '/api/session.prompt',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '999999' },
      destroy: () => { destroyed.push(true); request.emit('close') },
    })
    let status: number | undefined
    let headers: unknown
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead(code: number, values?: unknown) { status = code; headers = values; return this },
      write() { return true },
      end(this: { writableEnded: boolean; writableFinished: boolean; emit: EventEmitter['emit'] }) {
        this.writableEnded = true
        this.writableFinished = true
        this.emit('finish')
        return this
      },
    })

    await bridge(request, response, {
      requestBodyMode: () => 'buffered',
      fetch: () => { throw new Error('a rejected request must never reach the handler') },
    }, 1000)
    // The socket must not stay parked draining a body the client can trickle
    // at will after the rejection — same discipline as the chunked overrun.
    expect(status).toBe(413)
    expect(headers).toMatchObject({ connection: 'close' })
    expect(destroyed).toHaveLength(1)
  })

  it('aborts a pending native picker request when the browser disconnects', async () => {
    const body = JSON.stringify({
      type: 'client-request', rpcId: 'picker-1', method: 'directoryPicker/pick', payload: { args: {} },
    })
    const request = Readable.from([Buffer.from(body)]) as IncomingMessage
    Object.assign(request, {
      url: '/api/directoryPicker/pick',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })

    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead() { return this },
      write() { return true },
      end(this: { writableEnded: boolean; writableFinished: boolean; emit: EventEmitter['emit'] }) {
        this.writableEnded = true
        this.writableFinished = true
        this.emit('finish')
        return this
      },
    })

    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => { resolveStarted = resolve })
    let carrierSignal: AbortSignal | undefined
    const pending = bridge(request, response, {
      requestBodyMode: () => 'buffered',
      fetch: async (input) => {
        const fetchRequest = input
        carrierSignal = fetchRequest.signal
        resolveStarted()
        if (!fetchRequest.signal.aborted) {
          await new Promise<void>((resolve) => {
            fetchRequest.signal.addEventListener('abort', () => { resolve() }, { once: true })
          })
        }
        return Response.json({ aborted: fetchRequest.signal.aborted })
      },
    }, Number.MAX_SAFE_INTEGER)
    await started
    response.emit('close')
    await pending
    expect(carrierSignal?.aborted).toBe(true)
  })

  it.each(['write', 'backpressure'])('finishes a multipart response without further writes when the client closes during %s', async (phase) => {
    const request = Readable.from([]) as IncomingMessage
    Object.assign(request, { url: '/api/workspaceFiles/readBytes', method: 'GET', headers: {} })
    const body = new FormData()
    body.set('metadata', '{}')
    body.set('data', new Blob([new Uint8Array(16 * 1024 * 1024)]))
    let writes = 0
    let cleaningUp = false
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead() { return this },
      write() {
        writes++
        if (writes === 1) {
          const close = (): void => { response.destroyed = true; response.emit('close') }
          if (phase === 'write') close()
          else queueMicrotask(close)
        }
        return cleaningUp
      },
      end() { this.writableEnded = true; return this },
    })
    let settled = false
    const pending = bridge(request, response, {
      requestBodyMode: () => 'buffered',
      fetch: async () => new Response(body),
    }).then(() => { settled = true })
    try {
      await expect.poll(() => settled).toBe(true)
      expect(writes).toBe(1)
      expect(response.listenerCount('drain')).toBe(0)
    } finally {
      // Release a regressed bridge parked after the one close event.
      cleaningUp = true
      response.emit('drain')
      await pending
    }
  })

  it('discards bytes returned after the client disconnects', async () => {
    const request = Readable.from([]) as IncomingMessage
    Object.assign(request, { url: '/api/workspaceFiles/readBytes', method: 'GET', headers: {} })
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead() { return this },
      write() { throw new Error('a disconnected response must not receive bytes') },
      end() { this.writableEnded = true; return this },
    })
    const started = Promise.withResolvers<undefined>()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      pull() { started.resolve(undefined) },
    })
    const pending = bridge(request, response, {
      requestBodyMode: () => 'buffered',
      fetch: async () => new Response(body),
    })
    await started.promise
    response.emit('close')
    controller.enqueue(Uint8Array.of(1))
    controller.close()
    await pending
  })

  it('streams a declared 2.19 GiB request before the body ends and bypasses the JSON buffer cap', async () => {
    const request = new Readable({ read() {} }) as IncomingMessage
    Object.assign(request, {
      url: '/api/session/uploadFileBinary?sessionId=s1',
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(Math.ceil(2.19 * 1024 ** 3)),
      },
    })
    let status: number | undefined
    const responseBytes: Uint8Array[] = []
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead(code: number) { status = code; return this },
      write(chunk: Uint8Array) { responseBytes.push(chunk); return true },
      end(this: { writableEnded: boolean; writableFinished: boolean; emit: EventEmitter['emit'] }) {
        this.writableEnded = true
        this.writableFinished = true
        this.emit('finish')
        return this
      },
    })

    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => { resolveStarted = resolve })
    const received: Uint8Array[] = []
    const pending = bridge(request, response, {
      requestBodyMode: () => 'streaming',
      fetch: async (input) => {
        resolveStarted()
        if (input.body === null) throw new Error('streaming request lost its body')
        for await (const chunk of input.body) received.push(chunk)
        return new Response('stored')
      },
    }, 1)

    await started
    expect(received).toEqual([])
    request.push(Buffer.from([1, 2]))
    request.push(Buffer.from([3, 4]))
    request.push(null)
    await pending
    expect(status).toBe(200)
    expect(received).toEqual([Uint8Array.of(1, 2), Uint8Array.of(3, 4)])
    expect(Buffer.concat(responseBytes).toString()).toBe('stored')
  })

  it('closes an unread streaming request after returning an early validation response', async () => {
    const destroyed: true[] = []
    const request = new Readable({ read() {} }) as IncomingMessage
    Object.assign(request, {
      url: '/api/session/uploadFileBinary',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      destroy: () => { destroyed.push(true); request.emit('close') },
    })
    let status: number | undefined
    let headers: unknown
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead(code: number, values?: unknown) { status = code; headers = values; return this },
      write() { return true },
      end(this: { writableEnded: boolean; writableFinished: boolean; emit: EventEmitter['emit'] }) {
        this.writableEnded = true
        this.writableFinished = true
        this.emit('finish')
        return this
      },
    })

    await bridge(request, response, {
      requestBodyMode: () => 'streaming',
      fetch: () => Promise.resolve(new Response(null, { status: 415 })),
    }, 1)
    expect(status).toBe(415)
    expect(headers).toMatchObject({ connection: 'close' })
    expect(destroyed).toEqual([true])
  })
})
