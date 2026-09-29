/** Dispatch the fixture's exact human commands through the live command runtime. */
export const name = 'snapshot-goal-command-producer'
export const inject = ['commands', 'goals']

const commands = [
  '/goal create {"objective":"Deliver A and B","requiredTasks":[{"id":"A","criterion":"A works"},{"id":"B","criterion":"B works"}]}',
  '/goal accept A',
  '/goal scope {"reason":"B removed by human","requiredTasks":[{"id":"A","criterion":"A works"}]}',
  '/goal pause',
]

/** @param {import('@deepseek-ai/cordis').Context} ctx - Composed runtime services. */
export function apply(ctx) {
  ctx.on('agent/turn-stopping', async ({ agent, signal }) => {
    if (agent.session.header.parentSession !== undefined) return
    const userText = agent.session.deriveMessages()
      .find(message => message.source.kind === 'user')?.content
      .map(block => block.type === 'text' ? block.text : '').join('')
    if (userText !== commands.join('\n')) throw new Error('goal snapshot fixture commands differ')
    const created = await ctx.commands.execute(agent, commands[0], [], signal)
    if (created?.result.kind !== 'success') throw new Error('goal create command failed')
    const goal = ctx.goals.get(agent)
    if (goal === undefined) throw new Error('goal create did not persist')
    const ref = { id: goal.id, revision: goal.revision }
    try {
      ctx.goals.edit(agent, ref, { taskStatus: { taskId: 'A', status: 'ACCEPTED' } })
      throw new Error('direct goal edit accepted a human-only status')
    } catch (error) {
      if (error?.code !== 'GOAL_HUMAN_AUTHORITY_REQUIRED') throw error
    }
    ctx.goals.edit(agent, ref, { taskStatus: { taskId: 'A', status: 'PARCIAL' } })
    for (const command of commands.slice(1)) {
      const result = await ctx.commands.execute(agent, command, [], signal)
      if (result?.result.kind !== 'success') throw new Error(`goal command failed: ${command}`)
    }
  })
}
