/** Deterministic projected source shared by reference snapshot and Loader tests. */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

export const name = 'session-reference-source-fixture'
export const inject = ['sessions']

/**
 * Keep the historical source in memory, with live-store creation after profile activation.
 * @param ctx - fixture composition.
 */
export function apply(ctx: Context): void {
  let initialized = false
  ctx.on('agent/pre-step', (_event, next): Promise<PreStepDecision> => {
    if (initialized) return next()
    const source = ctx.sessions.create(SessionId('reference-source'))
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
    initialized = true
    return next()
  }, { prepend: true })
}
