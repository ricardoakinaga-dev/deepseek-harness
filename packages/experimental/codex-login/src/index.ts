/**
 * Optional Host Remote for the existing OpenAI Codex authorization flow.
 * Its duplex stream confines login links and manual-code answers to the
 * initiating browser connection; the grant stays in ctx.credentials.
 * @module @deepseek-ai/dsh-experimental-codex-login
 */

import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteStream } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexLoginFrame, CodexLoginReply, CodexLoginStatus } from './types.ts'
import { LoginExchange } from './exchange.ts'

export type * from './types.ts'

const CODEX_KEY = credentialKey('llm-pi-ai', 'openai-codex')

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional browser-facing Codex login controller. */
    codexLoginController: CodexLoginController
  }
}

/** Remote service installed only by the optional Codex login bundle. */
export class CodexLoginController extends TypertRemoteService {
  static inject = ['authorization', 'credentials', 'typert']

  /** @param ctx - Host context with authorization and credential providers. */
  constructor(ctx: Context) {
    super(ctx, 'codexLoginController', { namespace: 'codexLogin' })
  }

  /** Report whether Codex OAuth is installed and its grant is stored.
   * @returns availability, grant presence, writability, and attempt state.
   */
  @Remote
  async status(): Promise<CodexLoginStatus> {
    const entry = this.ctx.authorization.describe(CODEX_KEY)
    const record = await this.ctx.credentials.describeRecord(CODEX_KEY)
    return {
      available: entry?.methods.some(method => method.id === 'oauth') === true,
      configured: record.kind === 'grant',
      writable: record.writable,
      inFlight: entry?.inFlight === true,
    }
  }

  /**
   * Start the installed Codex OAuth flow on this browser's private stream.
   * @param signal - carrier lifetime; closing the page withdraws the attempt.
   * @returns progress, prompts, and settlement for the initiating browser.
   */
  @Remote({ mode: 'stream' })
  login(signal: AbortSignal): RemoteStream<CodexLoginFrame, CodexLoginReply> {
    const invocation = this.ctx.invocation
    if (invocation === undefined) throw new Error('Codex login requires a Remote invocation')
    return this.run(invocation.uplink<CodexLoginReply>(), signal)
  }

  /** Remove the stored Codex grant while preserving any API-key record.
   * @returns after the credential store acknowledges removal.
   */
  @Remote
  async signOut(): Promise<void> {
    if ((await this.ctx.credentials.describeRecord(CODEX_KEY)).kind === 'grant') {
      await this.ctx.credentials.deleteRecord(CODEX_KEY)
    }
  }

  private async *run(uplink: AsyncIterable<CodexLoginReply>, signal: AbortSignal): AsyncGenerator<CodexLoginFrame> {
    const exchange = new LoginExchange(signal)
    const controller = new AbortController()
    const abort = (): void => { controller.abort() }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const reader = uplink[Symbol.asyncIterator]()
    const read = (async (): Promise<void> => {
      let halfClosed = false
      try {
        while (!signal.aborted) {
          const next = await reader.next()
          if (next.done) { halfClosed = true; break }
          exchange.accept(next.value)
        }
      } finally {
        if (halfClosed) exchange.closeReplies()
        else { abort(); exchange.withdraw() }
      }
    })()
    const attempt = this.ctx.authorization.begin({
      key: CODEX_KEY, method: 'oauth', interaction: exchange, signal: controller.signal,
    }).then(
      (outcome) => { exchange.push({ type: 'settled', status: outcome.status }) },
      (error: unknown) => {
        const reason = error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
          ? 'callback-busy' : 'failed'
        exchange.push({ type: 'failed', reason })
      },
    ).finally(() => { exchange.finish() })
    try {
      for await (const frame of exchange.read()) yield frame
    } finally {
      abort()
      signal.removeEventListener('abort', abort)
      exchange.withdraw()
      await reader.return?.()
      await Promise.allSettled([read, attempt])
    }
  }
}

export default CodexLoginController
