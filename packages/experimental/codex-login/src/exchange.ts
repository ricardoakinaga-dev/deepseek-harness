/** One authorization attempt's private progress and manual-code exchange. */
import { randomUUID } from 'node:crypto'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import type { AuthorizationInteraction, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import type { CodexLoginFrame, CodexLoginReply } from './types.ts'

const MAX_ANSWER_LENGTH = 8_192

/** Project a provider prompt without carrying its AbortSignal over the wire. */
function promptFrame(id: string, prompt: AuthorizationPrompt): CodexLoginFrame {
  switch (prompt.kind) {
    case 'text':
    case 'secret':
      return {
        type: 'prompt', id, kind: prompt.kind, message: prompt.message,
        ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
      }
    case 'select':
      return {
        type: 'prompt', id, kind: 'select', message: prompt.message,
        options: prompt.options.map(option => ({
          id: option.id, label: option.label,
          ...option.description === undefined ? {} : { description: option.description },
        })),
      }
  }
}

/** One stream's queue and prompt replies, released when its carrier closes. */
export class LoginExchange implements AuthorizationInteraction {
  private readonly frames: CodexLoginFrame[] = []
  private readonly pending = new Map<string, ReturnType<typeof Promise.withResolvers<string>>>()
  private wake: (() => void) | undefined
  private finished = false
  private repliesOpen = true

  constructor(private readonly signal: AbortSignal) {}

  notify(notice: { message: string; url?: string; code?: string }): void {
    this.push({
      type: 'notice', message: notice.message,
      ...notice.url === undefined ? {} : { url: notice.url },
      ...notice.code === undefined ? {} : { code: notice.code },
    })
  }

  prompt(prompt: AuthorizationPrompt): Promise<string> {
    if (!this.repliesOpen) return Promise.reject(new Error('authorization replies closed'))
    const id = randomUUID()
    const reply = Promise.withResolvers<string>()
    this.pending.set(id, reply)
    const withdraw = (): void => {
      if (!this.pending.delete(id)) return
      reply.reject(new Error('authorization prompt withdrawn'))
    }
    prompt.signal?.addEventListener('abort', withdraw, { once: true })
    this.signal.addEventListener('abort', withdraw, { once: true })
    void reply.promise.finally(() => {
      prompt.signal?.removeEventListener('abort', withdraw)
      this.signal.removeEventListener('abort', withdraw)
      this.pending.delete(id)
    }).catch(() => {})
    if (prompt.signal?.aborted || this.signal.aborted) withdraw()
    else this.push(promptFrame(id, prompt))
    return reply.promise
  }

  accept(reply: CodexLoginReply): void {
    const pending = this.pending.get(reply.id)
    if (pending === undefined) return
    this.pending.delete(reply.id)
    if (reply.type === 'decline') pending.reject(new AuthorizationDeclinedError())
    else if (reply.value.length > MAX_ANSWER_LENGTH) pending.reject(new Error('authorization answer is too long'))
    else pending.resolve(reply.value)
  }

  push(frame: CodexLoginFrame): void {
    if (this.finished) return
    this.frames.push(frame)
    this.wake?.()
  }

  finish(): void {
    this.finished = true
    this.wake?.()
  }

  async *read(): AsyncGenerator<CodexLoginFrame> {
    while (true) {
      while (this.frames.length > 0) {
        const frame = this.frames.shift()
        if (frame !== undefined) yield frame
      }
      if (this.finished) return
      await new Promise<void>((resolve) => { this.wake = resolve })
      this.wake = undefined
    }
  }

  withdraw(): void {
    this.finish()
    this.closeReplies()
  }

  /** Refuse later answers without closing progress while token exchange finishes. */
  closeReplies(): void {
    this.repliesOpen = false
    for (const pending of this.pending.values()) pending.reject(new Error('authorization stream closed'))
    this.pending.clear()
  }
}
