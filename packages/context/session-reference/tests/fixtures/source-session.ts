/** Deterministic projected source shared by reference snapshot and Loader tests. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

export const name = 'session-reference-source-fixture'
export const inject = ['sessions']

/** Fixture publication timing for compositions with late projection registrations. */
export interface Config {
  /** Wait for the first Agent creation after application startup has settled. */
  deferUntilAgentCreated?: boolean
}

export const Config: z<Config> = z.object({
  deferUntilAgentCreated: z.boolean().default(false),
})

/**
 * Create a live source without publishing a persisted agent session.
 * @param ctx - fixture composition.
 * @param config - whether startup must settle before source publication.
 */
export function apply(ctx: Context, config: Config = {}): void {
  if (config.deferUntilAgentCreated) {
    const off = ctx.on('agent/created', () => {
      off()
      publishSource(ctx)
    }, { global: true })
  } else {
    publishSource(ctx)
  }
}

function publishSource(ctx: Context): void {
  const source = ctx.sessions.prepare(SessionId('reference-source'))
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
  ctx.effect(function* () {
    yield ctx.sessions.enter(source)
    ctx.sessions.announce(source)
  })
}
