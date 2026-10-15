/** Keep the parent report and settlement in successive model requests. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-loop'

/** Fixture plugin name. */
export const name = 'settlement-dedup-fence'

/**
 * Wait for observable delivery before allowing the child to close.
 * @param ctx Assembled headless profile context.
 */
export function apply(ctx: Context): void {
  const admitted = Promise.withResolvers<void>()
  const delivered = Promise.withResolvers<void>()
  const settled = Promise.withResolvers<void>()
  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    if (agent.session.header.parentSession !== undefined) return
    if (message.source.kind === 'agent-message') admitted.resolve()
    if (message.source.kind === 'subagent-settled') settled.resolve()
  }, { global: true })
  ctx.on('session/event', (session, event) => {
    if (session.header.parentSession === undefined && event.type === 'user/message'
      && event.data.source.kind === 'agent-message') delivered.resolve()
  }, { global: true })
  ctx.on('agent/pre-step', async ({ agent, step }, next) => {
    if (agent.session.header.parentSession !== undefined) {
      if (step === 2) await delivered.promise
    } else if (step === 2) {
      await admitted.promise
    } else if (step === 4) {
      await settled.promise
    }
    return next()
  }, { global: true })
  ctx.effect(() => () => { admitted.resolve(); delivered.resolve(); settled.resolve() })
}
