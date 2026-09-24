import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
/** Browser owner for the Gateway multiplexed Remote stream socket. */

import {
  parseRemoteStreamServerMessage,
  REMOTE_STREAM_MUX_PATH,
  type RemoteStreamClientMessage,
  type RemoteStreamServerMessage,
} from '../stream-protocol.ts'
import { Deque } from '@deepseek-ai/dsh-deque'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'

const INTERNAL_BASE = 'http://dsh.internal'
/** Largest delay the JavaScript timer API accepts without clamping. */
const MAX_TIMER_DELAY_MS = 2_147_483_647
const REMOTE_STREAM_CLOSE_TIMEOUT_MS = validatedTimeout(5_000)

/** Physical Remote stream socket failure that may be retried by a domain transport. */
export class RemoteStreamCarrierError extends Error {
  /**
   * @param message - physical carrier failure description.
   * @param options - optional causal error.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RemoteStreamCarrierError'
  }
}

interface SocketWaiter {
  readonly revision: number
  resolve(socket: WebSocket): void
  reject(error: unknown): void
}

/** Keep one physical WebSocket and share it among independently cancellable Remote streams. */
export class RemoteStreamMuxClient {
  private socket: WebSocket | undefined
  private connectingSocket: WebSocket | undefined
  private cancelCandidate: ((error: Error) => void) | undefined
  private keepAlive: Promise<void> | undefined
  private closePromise: Promise<void> | undefined
  private revision = 0
  private readonly streams = new Map<string, StreamInbox>()
  private readonly waiters = new Set<SocketWaiter>()
  private running = false
  private disposed = false

  /** Ensure a physical attempt exists, following the current attempt once if needed. */
  start(): void {
    if (this.disposed) return
    this.running = true
    if (this.socket?.readyState === WebSocket.OPEN) return
    const pending = this.keepAlive
    if (pending === undefined) this.maintain()
    else void pending.then(() => { this.maintain() })
  }

  /** Cancel the current socket or retry wait and start a fresh attempt immediately. */
  reconnect(): void {
    if (!this.running || this.disposed) return
    const failure = new RemoteStreamCarrierError('api gateway: Remote stream reconnect requested')
    const pending = this.keepAlive
    this.revision++
    this.cancelCandidate?.(failure)
    const socket = this.socket
    if (socket !== undefined) {
      this.socket = undefined
      this.failAll(failure)
      socket.close(4000, 'reconnect requested')
    }
    if (pending === undefined) this.maintain()
    else void pending.then(() => { this.maintain() })
  }

  /**
   * Open one logical stream on the persistent physical connection.
   * If no physical attempt is active, opening waits for Connection to request
   * one or for the signal to abort.
   * @param endpoint - Typert Remote stream endpoint.
   * @param payload - endpoint request encoded on the wire.
   * @param signal - cancellation for this logical stream.
   * @returns Host items until completion, cancellation, or failure.
   */
  async *open(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): AsyncGenerator {
    signal.throwIfAborted()
    const streamId = randomUUID()
    const inbox = new StreamInbox()
    let carrier: WebSocket | undefined
    let opened = false
    let terminal = false
    const abort = (): void => { inbox.fail(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const socket = await this.waitForSocket(signal)
      signal.throwIfAborted()
      carrier = socket
      this.streams.set(streamId, inbox)
      this.send(socket, { type: 'open', streamId, endpoint, payload })
      opened = true
      while (true) {
        const frame = await inbox.next()
        signal.throwIfAborted()
        if (frame.type === 'item') {
          yield frame.value
          continue
        }
        terminal = true
        if (frame.type === 'error') {
          throw new RemoteError(frame.error.code as never, frame.error.message, frame.error.details as never)
        }
        return
      }
    } finally {
      signal.removeEventListener('abort', abort)
      this.streams.delete(streamId)
      if (opened && !terminal && carrier?.readyState === WebSocket.OPEN) {
        this.send(carrier, { type: 'cancel', streamId })
      }
    }
  }

  /**
   * Permanently stop the carrier, close the physical socket, and fail every
   * active logical stream.
   * Logical streams fail before physical closure begins. If an open or
   * connecting socket exists, the returned promise resolves only after that
   * socket emits `close` or is observed in the `CLOSED` state. An absent or
   * already closed socket resolves immediately. Repeated calls return the
   * same promise; a close error or the bounded close deadline rejects it.
   * @returns once logical disposal and physical closure have settled.
   */
  close(): Promise<void> {
    this.closePromise ??= this.dispose()
    return this.closePromise
  }

  private async dispose(): Promise<void> {
    const socket = this.socket ?? this.connectingSocket
    const connecting = socket !== undefined && this.connectingSocket === socket
    const pending = this.keepAlive
    this.disposed = true
    this.running = false
    const error = new Error('api gateway: Remote stream client disposed')
    this.failAll(error)
    for (const waiter of [...this.waiters]) waiter.reject(error)
    this.socket = undefined
    const closed = socket === undefined
      ? Promise.resolve()
      : this.waitForSocketClose(
        socket,
        connecting
          ? () => { this.cancelCandidate?.(error) }
          : () => { socket.close(1000, 'disposed') },
        connecting,
      )
    await Promise.all([pending, closed])
  }

  private connect(): Promise<WebSocket> {
    const socket = new WebSocket(remoteStreamUrl())
    this.connectingSocket = socket
    const connecting = new Promise<WebSocket>((resolve, reject) => {
      let settled = false
      const rejectCandidate = (error: Error): void => {
        /*! v8 ignore next -- a one-shot WebSocket event cannot invoke its rejected connection candidate twice. */
        if (settled) return
        settled = true
        socket.removeEventListener('open', opened)
        socket.removeEventListener('error', failed)
        socket.removeEventListener('message', received)
        socket.removeEventListener('close', closed)
        /*! v8 ignore next -- the rejected candidate owns the cancellation callback until it settles. */
        if (this.cancelCandidate === rejectCandidate) this.cancelCandidate = undefined
        /*! v8 ignore next -- a candidate is cleared before another connection attempt can replace it. */
        if (this.connectingSocket === socket) this.connectingSocket = undefined
        try {
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
            socket.close()
          }
        } finally {
          reject(error)
        }
      }
      const opened = (): void => {
        /*! v8 ignore next -- a one-shot WebSocket open event cannot arrive after the connection settled. */
        if (settled) return
        /*! v8 ignore next 3 -- disposal removes the open listener and rejects the candidate before a connecting socket can be closed. */
        if (this.disposed) {
          rejectCandidate(new Error('api gateway: Remote stream client disposed'))
          return
        }
        settled = true
        /*! v8 ignore next -- the opened candidate owns the cancellation callback until it settles. */
        if (this.cancelCandidate === rejectCandidate) this.cancelCandidate = undefined
        /*! v8 ignore next -- the candidate is cleared before an opened callback can be superseded. */
        if (this.connectingSocket === socket) this.connectingSocket = undefined
        this.socket = socket
        for (const waiter of [...this.waiters]) waiter.resolve(socket)
        resolve(socket)
      }
      const failed = (): void => {
        if (this.disposed && this.socket !== socket && this.connectingSocket !== socket) return
        if (!settled) {
          rejectCandidate(new RemoteStreamCarrierError(
            'api gateway: Remote stream WebSocket failed to open',
          ))
          return
        }
        const error = new RemoteStreamCarrierError('api gateway: Remote stream WebSocket failed')
        this.lost(socket, error)
        socket.close()
      }
      const closed = (): void => {
        if (this.disposed && this.socket !== socket && this.connectingSocket !== socket) return
        if (!settled) {
          rejectCandidate(new RemoteStreamCarrierError(
            'api gateway: Remote stream WebSocket closed before opening',
          ))
          return
        }
        this.lost(socket)
      }
      const received = (event: MessageEvent): void => { this.receive(socket, event.data) }
      this.cancelCandidate = rejectCandidate
      socket.addEventListener('open', opened, { once: true })
      socket.addEventListener('error', failed, { once: true })
      socket.addEventListener('message', received)
      socket.addEventListener('close', closed, { once: true })
    })
    return connecting
  }

  private waitForSocketClose(
    socket: WebSocket,
    request: () => void,
    forceRequest: boolean,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = { value: undefined as ReturnType<typeof setTimeout> | undefined }
      const cleanup = (): void => {
        socket.removeEventListener('close', closed)
        socket.removeEventListener('error', failed)
        if (timer.value !== undefined) clearTimeout(timer.value)
      }
      const settle = (error?: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        if (error === undefined) resolve()
        else reject(error)
      }
      const closed = (): void => { settle() }
      const failed = (event: Event): void => {
        settle(new Error('api gateway: Remote stream WebSocket close failed', { cause: event }))
      }

      socket.addEventListener('close', closed, { once: true })
      socket.addEventListener('error', failed, { once: true })
      if (socket.readyState === WebSocket.CLOSED && !forceRequest) {
        settle()
        return
      }
      if (forceRequest || socket.readyState !== WebSocket.CLOSING) {
        try {
          request()
        } catch (cause) {
          settle(new Error('api gateway: Remote stream WebSocket close failed', { cause }))
          return
        }
      }
      if (socket.readyState === WebSocket.CLOSED) {
        settle()
        return
      }
      timer.value = setTimeout(() => {
        if (socket.readyState === WebSocket.CLOSED) settle()
        else settle(new Error(
          `api gateway: Remote stream WebSocket close timed out after ${String(REMOTE_STREAM_CLOSE_TIMEOUT_MS)}ms`,
        ))
      }, REMOTE_STREAM_CLOSE_TIMEOUT_MS)
    })
  }

  private waitForSocket(signal: AbortSignal): Promise<WebSocket> {
    signal.throwIfAborted()
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket)
    if (this.disposed) return Promise.reject(new Error('api gateway: Remote stream client disposed'))
    if (!this.running) return Promise.reject(new Error('api gateway: Remote stream client not started'))
    return new Promise((resolve, reject) => {
      const aborted = (): void => { waiter.reject(signal.reason) }
      const cleanup = (): void => {
        this.waiters.delete(waiter)
        signal.removeEventListener('abort', aborted)
      }
      const waiter: SocketWaiter = {
        revision: this.revision,
        resolve: (socket) => {
          cleanup()
          resolve(socket)
        },
        reject: (error) => {
          cleanup()
          // AbortSignal.reason belongs to the caller and may intentionally be a non-Error sentinel.
          // oxlint-disable-next-line typescript/prefer-promise-reject-errors
          reject(error)
        },
      }
      this.waiters.add(waiter)
      signal.addEventListener('abort', aborted, { once: true })
    })
  }

  private receive(socket: WebSocket, data: unknown): void {
    if (socket !== this.socket) return
    try {
      if (typeof data !== 'string') throw new Error('api gateway: Remote stream WebSocket requires text messages')
      const frame = parseRemoteStreamServerMessage(data)
      this.streams.get(frame.streamId)?.push(frame)
    } catch (error) {
      const failure = new RemoteStreamCarrierError('api gateway: invalid Remote stream frame', { cause: error })
      this.failAll(failure)
      this.lost(socket, failure)
      socket.close(4002, 'invalid Remote stream frame')
    }
  }

  private lost(
    socket: WebSocket,
    error: RemoteStreamCarrierError = new RemoteStreamCarrierError(
      'api gateway: Remote stream WebSocket closed',
    ),
  ): void {
    if (this.socket !== socket) return
    this.socket = undefined
    this.failAll(error)
  }

  private maintain(): void {
    if (!this.running || this.disposed) return
    if (this.socket?.readyState === WebSocket.OPEN || this.keepAlive !== undefined) return
    const revision = this.revision
    const task = this.connect().then(
      () => undefined,
      (error: unknown) => {
        if (!this.running) return
        for (const waiter of [...this.waiters]) {
          if (waiter.revision <= revision) waiter.reject(error)
        }
      },
    )
    this.keepAlive = task
    void task.then(() => {
      this.keepAlive = undefined
    })
  }

  private failAll(error: unknown): void {
    for (const stream of this.streams.values()) stream.fail(error)
  }

  private send(socket: WebSocket, message: RemoteStreamClientMessage): void {
    socket.send(JSON.stringify(message))
  }
}

function validatedTimeout(timeoutMs: number): number {
  /*! v8 ignore next 2 -- the module-owned close timeout is a fixed positive integer within the JavaScript timer range. */
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`api gateway: Remote stream close timeout must be a positive integer no greater than ${String(MAX_TIMER_DELAY_MS)}`)
  }
  return timeoutMs
}

class StreamInbox {
  private readonly frames = new Deque<RemoteStreamServerMessage>()
  private wake: (() => void) | undefined
  private failure: Error | undefined

  push(frame: RemoteStreamServerMessage): void {
    if (this.failure !== undefined) return
    this.frames.pushBack(frame)
    this.wake?.()
    this.wake = undefined
  }

  fail(error: unknown): void {
    if (this.failure !== undefined) return
    this.failure = error instanceof Error ? error : new Error(String(error), { cause: error })
    this.frames.clear()
    this.wake?.()
    this.wake = undefined
  }

  async next(): Promise<RemoteStreamServerMessage> {
    while (this.frames.size === 0) {
      if (this.failure !== undefined) throw this.failure
      await new Promise<void>((resolve) => { this.wake = resolve })
    }
    return this.frames.popFront() as RemoteStreamServerMessage
  }
}

function remoteStreamUrl(): string {
  const location = (globalThis as { location?: { origin?: string } }).location
  const transport = (globalThis as { __DSH_TRANSPORT__?: { streamBaseUrl?: string } }).__DSH_TRANSPORT__
  const base = transport?.streamBaseUrl ?? (location?.origin !== undefined && location.origin !== 'null' ? location.origin : INTERNAL_BASE)
  const url = new URL(REMOTE_STREAM_MUX_PATH, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
