/** Deterministic projected source shared by reference snapshot and Loader tests. */

import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'

export const name = 'session-reference-source-fixture'
export const inject = ['sessions']
export interface Config { deferUntilAgentCreated?: boolean }
export const Config: z<Config> = z.object({ deferUntilAgentCreated: z.boolean().default(false) })

/**
 * Keep a detached historical source in memory for reference queries.
 * @param ctx - fixture composition.
 * @param config - defer publication until the first Agent lifecycle event when requested.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const source = Session.create(SessionId('reference-source'))
  source.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'EARLY_SOURCE_FACT\n' + 'Historical detail 界.\n'.repeat(30)
      + 'x'.repeat(4096) + 'GIANT_LINE_MIDDLE_FACT' + 'y'.repeat(4096) }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  source.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'NESTED_REFERENCE_MUST_NOT_PROPAGATE' }],
    source: { kind: 'session-reference', form: 'recall', version: 1, references: [] },
  }), { surfaceOp: 'append' })
  source.append('assistant/message', {
    turn: 1,
    step: 1,
    stream: [],
    message: createMessage({
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'PRIVATE_REASONING_MUST_NOT_PROPAGATE' },
        { type: 'text', text: 'LATEST_SOURCE_FACT\nThe captured answer is forty-two.' },
      ],
      source: { kind: 'model', provider: 'fixture', model: 'fixture' },
    }),
  }, { surfaceOp: 'append' })
  let published = false
  const publish = (): undefined => {
    if (published) return
    ctx.effect(() => ctx.sessions.enter(source))
    ctx.sessions.announce(source)
    published = true
  }
  if (config.deferUntilAgentCreated) ctx.on('agent/created', publish)
  else publish()
}
