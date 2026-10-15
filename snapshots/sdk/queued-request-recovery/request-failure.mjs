/** Accept waking input while a request hook fails after one completed tool. */
export const name = 'snapshot-queued-request-recovery'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - Scenario runtime.
 * @param {{ mode: 'queue' | 'steer' }} config - Inbox delivery being exercised.
 */
export function apply(ctx, config) {
  if (config.mode !== 'queue' && config.mode !== 'steer') {
    throw new Error('Queued recovery fixture requires queue or steer mode')
  }
  const failed = new WeakSet()
  ctx.on('agent/request', async ({ agent, turn, step }, next) => {
    if (turn !== 1 || step !== 2 || failed.has(agent)) return next()
    failed.add(agent)
    const message = {
      id: 'queued-recovery-input', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: 'Finish the accepted input without repeating the completed tool.' }],
    }
    if (config.mode === 'queue') agent.followup(message)
    else agent.steer(message)
    throw new Error('Snapshot request hook failed after accepting input')
  })
}
