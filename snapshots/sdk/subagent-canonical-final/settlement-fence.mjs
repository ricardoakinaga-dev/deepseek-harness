/** Keep the parent running until the real continuation manager accepts the closing notice. */
export const name = 'snapshot-canonical-final-fence'

/** @param {import('@deepseek-ai/cordis').Context} ctx - SDK profile runtime. */
export function apply(ctx) {
  const gates = new WeakMap()
  const pending = new Set()
  const gateFor = agent => {
    let gate = gates.get(agent)
    if (gate === undefined) {
      gate = Promise.withResolvers()
      gates.set(agent, gate)
      pending.add(gate)
    }
    return gate
  }
  ctx.effect(() => () => {
    for (const gate of pending) gate.resolve()
    pending.clear()
  }, 'canonical final snapshot fence')
  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    if (agent.session.header.parentSession !== undefined || message.source.kind !== 'subagent-settled') return
    const gate = gateFor(agent)
    pending.delete(gate)
    gate.resolve()
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (exec.name !== 'subagent' || exec.agent === undefined
      || exec.agent.session.header.parentSession !== undefined) return next()
    const decision = await next()
    if (result.isError || decision.kind !== 'accept') return decision
    const gate = gateFor(exec.agent)
    const abort = () => gate.resolve()
    exec.signal.addEventListener('abort', abort, { once: true })
    try {
      exec.signal.throwIfAborted()
      await gate.promise
      exec.signal.throwIfAborted()
      return decision
    } finally {
      exec.signal.removeEventListener('abort', abort)
    }
  })
}
