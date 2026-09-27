/**
 * node:http ↔ WHATWG fetch bridge for the /api transport (host side of the
 * web carrier; the fetch-shaped handler itself is transport-agnostic).
 */

import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import type { ConnectionFetchHandler } from './rpc.ts'

/** Default per-request and aggregate buffered-body budget for HTTP RPC: sized
 * for the default aggregate image limit (200 MiB) after base64 expansion plus
 * envelope headroom (~267.7 MiB required), rounded up for slack. */
export const DEFAULT_MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024

const BUFFERED_CAPACITY_REJECTION_STATUS = 429
const BUFFERED_CAPACITY_REJECTION_BODY = 'buffered request capacity exhausted'

/** One idempotent reservation in an instance-owned buffered-body budget. */
export interface BufferedRequestReservation {
  /** Bytes currently held by this reservation. */
  readonly bytes: number
  /**
   * Increase the reservation before retaining more body bytes.
   * @param bytes - additional bytes to reserve.
   * @returns whether the increase fit in the aggregate budget.
   */
  grow(bytes: number): boolean
  /** Release all bytes held by this reservation. */
  release(): void
}

/**
 * Bounded, non-queuing memory admission for buffered HTTP requests.
 * Reservations belong to one Host Connection instance and must be released
 * after the bridge has finished request, handler, and response work.
 */
export class BufferedRequestLimiter {
  private reservedBytes = 0

  /**
   * Create an aggregate buffered-body budget.
   * @param capacityBytes - maximum bytes that may be reserved concurrently.
   */
  constructor(private readonly capacityBytes: number) {
    assertCapacity(capacityBytes)
  }

  /**
   * Reserve bytes without waiting for another request to finish.
   * @param bytes - conservative amount to reserve before body intake.
   * @returns an idempotent reservation, or undefined when the budget is full.
   */
  tryReserve(bytes: number): BufferedRequestReservation | undefined {
    assertAdditionalBytes(bytes)
    if (bytes > this.capacityBytes - this.reservedBytes) return undefined
    this.reservedBytes += bytes
    let heldBytes = bytes
    let released = false
    return {
      get bytes(): number { return heldBytes },
      grow: (additionalBytes: number): boolean => {
        assertAdditionalBytes(additionalBytes)
        if (released || additionalBytes > this.capacityBytes - this.reservedBytes) return false
        this.reservedBytes += additionalBytes
        heldBytes += additionalBytes
        return true
      },
      release: (): void => {
        if (released) return
        released = true
        this.reservedBytes -= heldBytes
      },
    }
  }
}

interface BridgeServerResponse {
  readonly destroyed: boolean
  readonly writableEnded: boolean
  readonly writableFinished: boolean
  on(event: 'close', listener: () => void): this
  off(event: 'close' | 'drain' | 'finish', listener: () => void): this
  off(event: 'error', listener: (error: Error) => void): this
  once(event: 'close' | 'drain' | 'finish', listener: () => void): this
  once(event: 'error', listener: (error: Error) => void): this
  writeHead(statusCode: number, headers?: Record<string, string>): unknown
  write(chunk: Uint8Array): boolean
  end(chunk?: string): unknown
}

/**
 * Bridge one node:http request to the fetch-shaped handler (client close
 * aborts; response writes respect backpressure and stop on disconnect).
 * @param req - incoming node:http request.
 * @param res - node:http response the bridge writes and owns to completion.
 * @param apiHandler - fetch-shaped API carrier the request is dispatched to.
 * @param maxRequestBodyBytes - maximum bytes accepted for one buffered body.
 * @param limiter - instance-owned aggregate budget for buffered requests.
 */
export async function bridge(
  req: IncomingMessage,
  res: BridgeServerResponse,
  apiHandler: ConnectionFetchHandler,
  maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
  limiter = new BufferedRequestLimiter(maxRequestBodyBytes),
): Promise<void> {
  const abort = new AbortController()
  const responseState = { closed: false }
  const requestState = { aborted: false, closed: false }
  let reservation: BufferedRequestReservation | undefined
  const abortRequest = (): void => {
    requestState.aborted = true
    abort.abort()
  }
  const onResponseClose = (): void => {
    responseState.closed = true
    if (res.writableEnded) return
    abortRequest()
    if (!req.readableEnded && !req.destroyed) req.destroy()
  }
  const onRequestAborted = (): void => { abortRequest() }
  const onRequestClose = (): void => { requestState.closed = true }
  const isAborted = (): boolean => abort.signal.aborted
  res.once('close', onResponseClose)
  req.once('aborted', onRequestAborted)
  req.once('close', onRequestClose)
  // Client-disconnect detection MUST hang off the response, not the request:
  // since Node 16, IncomingMessage 'close' fires as soon as the request body is
  // fully consumed (immediately for a bodyless GET), which would abort a
  // streaming response right after open. ServerResponse 'close' fires on connection teardown;
  // writableEnded distinguishes a normal end() from the client going away.
  try {
    /*! v8 ignore next 2 -- node:http always sets url/method on server requests. */
    const url = new URL(req.url ?? '/', 'http://dsh.internal')
    const method = req.method ?? 'GET'
    const headers = Object.fromEntries(
      Object.entries(req.headers).filter(([, value]) => typeof value === 'string') as [string, string][],
    )
    const bodyMode = apiHandler.requestBodyMode({ method, url })
    let request: Request
    if (bodyMode === 'buffered') {
      const declaredLength = declaredBodyLength(req.headers['content-length'])
      if (declaredLength !== undefined && declaredLength > maxRequestBodyBytes) {
        await rejectBufferedRequest(
          req,
          res,
          413,
          'buffered request body too large',
          () => responseState.closed,
          abortRequest,
        )
        return
      }
      reservation = limiter.tryReserve(declaredLength ?? maxRequestBodyBytes)
      if (reservation === undefined) {
        await rejectBufferedRequest(
          req,
          res,
          BUFFERED_CAPACITY_REJECTION_STATUS,
          BUFFERED_CAPACITY_REJECTION_BODY,
          () => responseState.closed,
          abortRequest,
        )
        return
      }
      const chunks: Buffer[] = []
      let received = 0
      try {
        for await (const chunk of req) {
          const buffer = chunk as Buffer
          const nextReceived = received + buffer.byteLength
          if (nextReceived > maxRequestBodyBytes) {
            await rejectBufferedRequest(
              req,
              res,
              413,
              'buffered request body too large',
              () => responseState.closed,
              abortRequest,
            )
            return
          }
          const additionalBytes = nextReceived - reservation.bytes
          if (additionalBytes > 0 && !reservation.grow(additionalBytes)) {
            await rejectBufferedRequest(
              req,
              res,
              BUFFERED_CAPACITY_REJECTION_STATUS,
              BUFFERED_CAPACITY_REJECTION_BODY,
              () => responseState.closed,
              abortRequest,
            )
            return
          }
          received = nextReceived
          chunks.push(buffer)
        }
      } catch (error) {
        if (abort.signal.aborted) return
        throw error
      }
      if (abort.signal.aborted) return
      request = new Request(url, {
        method,
        headers,
        ...chunks.length > 0 ? { body: Buffer.concat(chunks) } : {},
        signal: abort.signal,
      })
    } else {
      request = new Request(url, {
        method,
        headers,
        body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
        signal: abort.signal,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' })
    }
    const response = await apiHandler.fetch(request)
    if (isAborted()) {
      await cancelResponseBody(response)
      return
    }
    const requestUnread = bodyMode === 'streaming' && !req.readableEnded
    const responseHeaders = Object.fromEntries(response.headers.entries())
    res.writeHead(response.status, requestUnread ? { ...responseHeaders, connection: 'close' } : responseHeaders)
    if (response.body === null) {
      res.end()
      await waitForResponseQuiescence(res, () => responseState.closed)
      if (requestUnread) req.destroy()
      return
    }
    for await (const chunk of response.body) {
      if (isAborted()) continue
      // Backpressure: a false return means the socket buffer is full — wait for drain
      // instead of buffering unboundedly (slow or suspended consumers). 'close' also
      // resolves so a mid-wait disconnect can't park this loop forever; the close
      // handler above aborts the handler stream, which then ends the iteration.
      if (!res.write(chunk) && !res.destroyed && !isAborted()) {
        await waitForDrainOrClose(res, () => responseState.closed)
      }
    }
    if (isAborted()) return
    res.end()
    await waitForResponseQuiescence(res, () => responseState.closed)
    if (requestUnread) req.destroy()
  } finally {
    res.off('close', onResponseClose)
    req.off('aborted', onRequestAborted)
    req.off('close', onRequestClose)
    await waitForRequestQuiescence(req, requestState)
    reservation?.release()
  }
}

function assertCapacity(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    throw new RangeError(`buffered request capacity must be a positive safe integer: ${String(bytes)}`)
  }
}

function assertAdditionalBytes(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError(`buffered request reservation must be a non-negative safe integer: ${String(bytes)}`)
  }
}

function declaredBodyLength(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

async function rejectBufferedRequest(
  req: IncomingMessage,
  res: BridgeServerResponse,
  status: number,
  body: string,
  responseClosed: () => boolean,
  abortRequest: () => void,
): Promise<void> {
  res.writeHead(status, { connection: 'close' })
  res.end(body)
  await waitForResponseQuiescence(res, responseClosed)
  abortRequest()
  req.destroy()
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body === null) return
  try {
    for await (const _chunk of response.body) { /* Drain the multipart producer after disconnect. */ }
  } catch (error) {
    // A handler may already own the body reader; the disconnected response no longer has a consumer.
    void error
  }
}

async function waitForDrainOrClose(res: BridgeServerResponse, responseClosed: () => boolean): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = (): void => {
      res.off('drain', done)
      res.off('close', done)
      resolve()
    }
    res.once('drain', done)
    res.once('close', done)
    if (responseClosed()) done()
  })
}

async function waitForRequestQuiescence(
  req: IncomingMessage,
  requestState: { readonly aborted: boolean; readonly closed: boolean },
): Promise<void> {
  if (!requestState.aborted || requestState.closed || req.readableEnded) return
  await new Promise<void>((resolve) => {
    const done = (): void => {
      req.off('close', done)
      resolve()
    }
    req.once('close', done)
    if (requestState.closed || req.readableEnded) done()
  })
}

async function waitForResponseQuiescence(res: BridgeServerResponse, responseClosed: () => boolean): Promise<void> {
  if (responseClosed() || res.writableFinished) return
  await new Promise<void>((resolve, reject) => {
    const done = (): void => {
      cleanup()
      resolve()
    }
    const failed = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const cleanup = (): void => {
      res.off('finish', done)
      res.off('close', done)
      res.off('error', failed)
    }
    res.once('finish', done)
    res.once('close', done)
    res.once('error', failed)
    if (responseClosed() || res.writableFinished) done()
  })
}
