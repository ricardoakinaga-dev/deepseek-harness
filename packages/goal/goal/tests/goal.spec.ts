import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents } from '@deepseek-ai/dsh-agent'
import CommandRuntime, { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import GoalService, {
  GoalError,
  GoalId,
  decodeGoalChange,
  foldGoal,
} from '@deepseek-ai/dsh-goal'
import type { CreateGoalRequest, EditGoalRequest, GoalChangeMeta, GoalRef, GoalSnapshotChangeMeta, GoalView } from '@deepseek-ai/dsh-goal'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'test': { kind: 'test' } & ContextFormed
    'ordinary-user-message': { kind: 'ordinary-user-message' } & ContextFormed
  }
}

interface StubAgent {
  agent: Agent
  session: Session
}

const isolatedInboxCtx = new Context()
await isolatedInboxCtx.plugin(SessionStore)
await isolatedInboxCtx.plugin(SessionProjectionRegistry)
await isolatedInboxCtx.plugin(AgentRegistry)
const sessionStubs = new WeakMap<Session, StubAgent>()

/** Number the next balanced test-fixture turn. */
function nextTurn(session: Session): number {
  return session.snapshotEvents().reduce((max, event) => event.type === 'turn/start' ? Math.max(max, event.data.turn) : max, 0) + 1
}

/** Mirror the public Agent.inject contract for domain tests. */
function appendInjection(session: Session, input: UserMessage): void {
  stubAgentForSession(session).agent.inbox.append('next-step', input)
}

/** Build a registry-compatible agent around one concrete session. */
function stubAgentForSession(session: Session, suppliedCtx?: Context): StubAgent {
  const existing = sessionStubs.get(session)
  if (existing !== undefined) return existing
  const id = session.id
  const agentCtx = suppliedCtx ?? isolatedInboxCtx
  if (suppliedCtx === undefined) {
    agentCtx.sessions.enter(session)
  }
  const inbox = createInboxStub()
  const agent: Agent = {
    id,
    options: {},
    session,
    inbox,
    ctx: agentCtx,
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject(input) { this.inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  const stub = {
    agent,
    session,
  }
  sessionStubs.set(session, stub)
  return stub
}

/** Build a registry-compatible agent around a fresh session. */
function stubAgent(
  rawId: string,
  seed?: readonly import('@deepseek-ai/dsh-session').SessionEvent[],
  ctx?: Context,
): StubAgent {
  const session = ctx === undefined
    ? Session.create(SessionId(rawId), seed)
    : ctx.sessions.create(SessionId(rawId), { ...(seed === undefined ? {} : { seed }) })
  return stubAgentForSession(session, ctx)
}

async function harness(config: { defaultMaxGoalRounds?: number } = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(GoalService, config)
  const stub = stubAgent(`goal-test-${Math.random()}`, undefined, ctx)
  await ctx.agents.register(stub.agent)
  return { ctx, ...stub }
}

/** Supply an explicit criterion to lifecycle cases that do not inspect task status. */
function createGoal(ctx: Context, agent: Agent, request: Omit<CreateGoalRequest, 'requiredTasks'> & { requiredTasks?: CreateGoalRequest['requiredTasks'] }): GoalView {
  return ctx.goals.create(agent, {
    ...request,
    requiredTasks: request.requiredTasks ?? [{ id: 'done', criterion: 'The objective is met' }],
  })
}

/** Exercise the service's accepted human command path through the real runtime. */
async function humanEdit(ctx: Context, agent: Agent, ref: GoalRef, request: EditGoalRequest): Promise<GoalView> {
  let edited: GoalView | undefined
  const dispose = ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-goal'),
    name: 'goal', description: 'Test goal edit',
    handler(invocation) {
      edited = ctx.goals.editFromCommand(invocation, ref, request)
      return { kind: 'success' }
    },
  })
  try {
    await ctx.commands.execute(agent, '/goal', [], new AbortController().signal)
    if (edited === undefined) throw new Error('goal command did not edit')
    return edited
  } finally {
    dispose()
  }
}

/** Make one explicit criterion accepted before lifecycle-only assertions. */
async function acceptedGoal(ctx: Context, agent: Agent, objective: string, maxGoalRounds?: number): Promise<GoalView> {
  const created = createGoal(ctx, agent, {
    objective, requiredTasks: [{ id: 'done', criterion: 'The objective is met' }],
    ...maxGoalRounds === undefined ? {} : { maxGoalRounds },
  })
  return humanEdit(ctx, agent, created, { taskStatus: { taskId: 'done', status: 'ACCEPTED' } })
}

/** Append one admitted goal round as a balanced user-message turn. */
function appendRound(session: Session, ref: GoalRef, round: number): void {
  const source = { kind: 'goal', goalId: ref.id, revision: ref.revision, round } as const
  const turn = nextTurn(session)
  session.append('turn/start', { turn })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: `round ${round}` }], source,
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

describe('GoalService creation and replay', () => {
  it('rejects an empty manifest instead of inferring tasks from the objective', async () => {
    const { ctx, agent, session } = await harness()
    const ids = Array.from({ length: 20 }, (_, index) => `RA29-${index + 1}`).join(', ')
    expect(() => ctx.goals.create(agent, { objective: `Complete ${ids}`, requiredTasks: [] }))
      .toThrow(expect.objectContaining({ code: 'GOAL_INVALID_TASK_MANIFEST' }))
    expect(session.snapshotEvents()).toHaveLength(0)
  })

  it('adopts an explicit human scope before completing an existing manifestless goal', async () => {
    const { ctx, agent, session } = await harness()
    createGoal(ctx, agent, { objective: 'Historical work' })
    const event = session.snapshotEvents()[0]
    if (event?.type !== 'goal/change' || event.data.operation !== 'create') throw new Error('expected goal create')
    const historical = {
      id: event.data.goal.id,
      revision: event.data.goal.revision,
      objective: event.data.goal.objective,
      phase: event.data.goal.phase,
      maxGoalRounds: event.data.goal.maxGoalRounds,
    }
    const oldSession = ctx.sessions.create(SessionId(`historical-goal-${Math.random()}`))
    const oldAgent = stubAgentForSession(oldSession, ctx).agent
    await ctx.agents.register(oldAgent)
    oldSession.append('goal/change', { ...event.data, version: 1, goal: historical })
    const view = ctx.goals.get(oldAgent)
    expect(view?.taskManifest).toBeUndefined()
    expect(view?.objective).toBe('Historical work')
    expect(() => ctx.goals.complete(oldAgent, view!)).toThrow(expect.objectContaining({ code: 'GOAL_TASKS_INCOMPLETE' }))
    const scope = await humanEdit(ctx, oldAgent, view!, {
      scopeRevision: { reason: 'Human supplied the remaining acceptance criteria', requiredTasks: [
        { id: 'legacy-work', criterion: 'Historical work is complete' },
      ] },
    })
    expect(scope.taskManifest).toMatchObject({
      originalObjective: 'Historical work',
      originalRequiredTasks: [],
      scopeRevisions: [{ reason: 'Human supplied the remaining acceptance criteria' }],
      tasks: [{ id: 'legacy-work', status: 'PENDING' }],
    })
    expect(() => ctx.goals.complete(oldAgent, scope)).toThrow(expect.objectContaining({ code: 'GOAL_TASKS_INCOMPLETE' }))
    const accepted = await humanEdit(ctx, oldAgent, scope, {
      taskStatus: { taskId: 'legacy-work', status: 'ACCEPTED' },
    })
    expect(ctx.goals.complete(oldAgent, accepted).phase).toBe('complete')
  })

  it('rejects direct and remote privileged edits without active command authority', async () => {
    const { ctx, agent, session } = await harness()
    const goal = createGoal(ctx, agent, {
      objective: 'Complete A and B', requiredTasks: [
        { id: 'A', criterion: 'A works' }, { id: 'B', criterion: 'B works' },
      ],
    })
    const count = session.snapshotEvents().length
    const accepted = { taskStatus: { taskId: 'A', status: 'ACCEPTED' as const } }
    const scope = { scopeRevision: { reason: 'Remove B', requiredTasks: [{ id: 'A', criterion: 'A works' }] } }
    expect(() => ctx.goals.edit(agent, goal, accepted)).toThrow(expect.objectContaining({ code: 'GOAL_HUMAN_AUTHORITY_REQUIRED' }))
    expect(() => ctx.goals.edit(agent, goal, scope)).toThrow(expect.objectContaining({ code: 'GOAL_HUMAN_AUTHORITY_REQUIRED' }))
    expect(() => ctx.goals.editFromCommand({ agent, signal: new AbortController().signal }, goal, accepted))
      .toThrow(expect.objectContaining({ code: 'GOAL_HUMAN_AUTHORITY_REQUIRED' }))
    expect(session.snapshotEvents()).toHaveLength(count)
    let settledInvocation: Parameters<GoalService['editFromCommand']>[0] | undefined
    const dispose = ctx.commands.register({
      name: 'capture-goal', description: 'Capture a command invocation',
      handler(invocation) { settledInvocation = invocation; return { kind: 'success' } },
    })
    await ctx.commands.execute(agent, '/capture-goal', [], new AbortController().signal)
    dispose()
    const capturedInvocation = settledInvocation
    if (capturedInvocation === undefined) throw new Error('command invocation was not captured')
    expect(() => ctx.goals.editFromCommand(capturedInvocation, goal, accepted))
      .toThrow(expect.objectContaining({ code: 'GOAL_HUMAN_AUTHORITY_REQUIRED' }))
    const revised = await humanEdit(ctx, agent, goal, scope)
    expect(revised.taskManifest?.tasks.map(task => task.id)).toEqual(['A'])
    const approved = await humanEdit(ctx, agent, revised, accepted)
    expect(ctx.goals.complete(agent, approved).phase).toBe('complete')
  })

  it('keeps a 20-ID goal open until every required ID is accepted', async () => {
    const { ctx, agent, session } = await harness()
    const requiredTasks = Array.from({ length: 20 }, (_, index) => ({
      id: `RA29-${String(index + 1).padStart(2, '0')}`,
      criterion: `Criterion ${index + 1}`,
    }))
    let goal = createGoal(ctx, agent, { objective: 'Ship all required work', requiredTasks })
    expect(goal.taskManifest?.originalRequiredTasks).toEqual(requiredTasks)
    for (const task of requiredTasks.slice(0, -1)) {
      goal = await humanEdit(ctx, agent, goal, { taskStatus: { taskId: task.id, status: 'ACCEPTED' } })
    }
    expect(() => ctx.goals.complete(agent, goal)).toThrow(expect.objectContaining({
      code: 'GOAL_TASKS_INCOMPLETE',
    }))
    expect(ctx.goals.get(agent)?.phase).toBe('active')
    expect(session.snapshotEvents().filter(event => event.type === 'goal/change')).toHaveLength(20)
    goal = ctx.goals.edit(agent, goal, { taskStatus: { taskId: requiredTasks[19]!.id, status: 'PARCIAL' } })
    expect(() => ctx.goals.complete(agent, goal)).toThrow(expect.objectContaining({ code: 'GOAL_TASKS_INCOMPLETE' }))
    goal = await humanEdit(ctx, agent, goal, { taskStatus: { taskId: requiredTasks[19]!.id, status: 'ACCEPTED' } })
    const completed = ctx.goals.complete(agent, goal)
    expect(completed.phase).toBe('complete')
    expect(foldGoal(session.snapshotEvents()).goal?.taskManifest?.tasks).toHaveLength(20)
  })

  it('retains original criteria when a user-visible scope revision replaces required IDs', async () => {
    const { ctx, agent, session } = await harness()
    const created = createGoal(ctx, agent, {
      objective: 'Original objective', requiredTasks: [{ id: 'A', criterion: 'Original criterion' }],
    })
    const revised = await humanEdit(ctx, agent, created, {
      scopeRevision: { requiredTasks: [{ id: 'B', criterion: 'New criterion' }], reason: 'User removed A' },
    })
    expect(revised.taskManifest).toMatchObject({
      originalObjective: 'Original objective',
      originalRequiredTasks: [{ id: 'A', criterion: 'Original criterion' }],
      scopeRevisions: [{ reason: 'User removed A', requiredTasks: [{ id: 'B' }] }],
      tasks: [{ id: 'B', status: 'PENDING' }],
    })
    expect(() => ctx.goals.complete(agent, revised)).toThrow(expect.objectContaining({ code: 'GOAL_TASKS_INCOMPLETE' }))
    expect(foldGoal(session.snapshotEvents()).goal?.taskManifest).toEqual(revised.taskManifest)
  })

  it('rejects a forged complete event while a required ID is pending', async () => {
    const { ctx, agent, session } = await harness()
    const created = createGoal(ctx, agent, {
      objective: 'Complete A', requiredTasks: [{ id: 'A', criterion: 'A works' }],
    })
    const original = session.snapshotEvents()[0]
    if (original?.type !== 'goal/change' || original.data.operation === 'clear') {
      throw new Error('expected create snapshot')
    }
    const snapshot = original.data
    expect(() => session.append('goal/change', {
      ...snapshot,
      operation: 'complete',
      goal: { ...snapshot.goal, revision: created.revision + 1, phase: 'complete' },
    })).toThrow(/every required task to be ACCEPTED/)
  })
  it('does not activate without the required projection registry', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(GoalService)
    expect(ctx.get('goals')).toBeUndefined()
  })

  it('applies the configured default and writes one durable goal change', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    const { ctx, agent, session } = await harness({ defaultMaxGoalRounds: 17 })
    const seen: string[] = []
    ctx.on('goal/changed', ({ change }) => { seen.push(change.operation) })

    const goal = createGoal(ctx, agent, { objective: '  finish the feature  ' })

    expect(goal).toMatchObject({
      objective: 'finish the feature',
      phase: 'active',
      revision: 1,
      maxGoalRounds: 17,
      roundsStarted: 0,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      activation: 'armed',
    })
    expect(goal.id).toMatch(/^goal-/)
    expect(seen).toEqual(['create'])
    expect(session.snapshotEvents().map(event => event.type)).toEqual(['goal/change'])
    const context = session.snapshotEvents()[0]
    expect(context?.type).toBe('goal/change')
    if (context?.type !== 'goal/change') throw new Error('expected durable goal change')
    const change = decodeGoalChange(context.data)
    if (change === undefined) throw new Error('expected decoded goal change')
    expect(change).toMatchObject({ operation: 'create', goal: { id: goal.id } })
    expect(agent.inbox.nextStep).toEqual([])
    expect(session.deriveMessages()).toEqual([])
    expect(foldGoal(session.snapshotEvents())).toMatchObject({ goal: { id: goal.id }, roundsStarted: 0 })
    vi.useRealTimers()
  })

  it('uses 256 rounds by default and validates create input inside create', async () => {
    const { ctx, agent } = await harness()
    expect(() => createGoal(ctx, agent, { objective: '   ' })).toThrow(expect.objectContaining({
      code: 'GOAL_INVALID_OBJECTIVE',
    }))
    expect(() => createGoal(ctx, agent, { objective: 'x', maxGoalRounds: 0 })).toThrow(expect.objectContaining({
      code: 'GOAL_INVALID_MAX_ROUNDS',
    }))
    expect(() => createGoal(ctx, agent, { objective: 'x', maxGoalRounds: 1.5 })).toThrow(GoalError)
    expect(() => createGoal(ctx, agent, { objective: 'x', maxGoalRounds: 1.5 })).toThrow(HarnessError)
    expect(() => createGoal(ctx, agent, {
      objective: 'x', maxGoalRounds: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow(GoalError)
    expect(createGoal(ctx, agent, { objective: 'x' }).maxGoalRounds).toBe(256)
  })

  it('also resolves the default when constructed directly without Cordis config normalization', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    if (ctx.get('sessions') === undefined) await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const stub = stubAgent('goal-direct-construction', undefined, ctx)
    await ctx.agents.register(stub.agent)
    const goals = new GoalService(ctx)
    await new Promise(resolve => setImmediate(resolve))
    expect(goals.create(stub.agent, { objective: 'direct', requiredTasks: [{ id: 'done', criterion: 'direct' }] })).toMatchObject({
      objective: 'direct', maxGoalRounds: 256,
    })
  })

  it('rejects invalid direct configuration', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    if (ctx.get('sessions') === undefined) await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await expect(ctx.plugin(GoalService, { defaultMaxGoalRounds: -1 })).rejects.toThrow(expect.objectContaining({
      code: 'GOAL_INVALID_MAX_ROUNDS',
    }))
  })

  it('restores a seeded goal and rounds with activation disarmed', async () => {
    const first = await harness()
    const created = createGoal(first.ctx, first.agent, { objective: 'seed me', maxGoalRounds: 9 })
    appendRound(first.session, created, 1)
    appendRound(first.session, created, 2)

    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    if (ctx.get('sessions') === undefined) await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(GoalService)
    const resumed = stubAgent('seeded-goal', first.session.snapshotEvents(), ctx)
    await ctx.agents.register(resumed.agent)
    expect(ctx.goals.get(resumed.agent)).toMatchObject({
      id: created.id,
      roundsStarted: 2,
      activation: 'disarmed',
    })
  })

  it('inherits the completed-turn goal prefix through SessionStore.fork with child activation disarmed', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(GoalService)
    const parent = stubAgentForSession(ctx.sessions.create(SessionId('goal-fork-parent')), ctx)
    await ctx.agents.register(parent.agent)
    const goal = createGoal(ctx, parent.agent, { objective: 'inherit through fork', maxGoalRounds: 5 })
    appendRound(parent.session, goal, 1)

    const child = stubAgentForSession(ctx.sessions.fork(parent.session), ctx)
    await ctx.agents.register(child.agent)
    expect(ctx.goals.get(child.agent)).toMatchObject({
      id: goal.id,
      objective: goal.objective,
      roundsStarted: 1,
      activation: 'disarmed',
    })
    expect(child.session.header.parentSession).toBe(parent.session.id)
    expect(child.session.header.isSeeded).toBe(true)
    expect(child.session.inheritedEventCount).toBe(parent.session.seq)
  })

  it('disarms live activation on every session-start edge', async () => {
    const { ctx, agent, session } = await harness()
    const activations: Array<{ activation: string | undefined; id: string | undefined; revision: number | undefined }> = []
    ctx.on('goal/activation-changed', ({ goal }) => {
      activations.push({ activation: goal?.activation, id: goal?.id, revision: goal?.revision })
    })
    let goal = createGoal(ctx, agent, { objective: 'stay stopped after resume' })
    expect(goal.activation).toBe('armed')
    await agentEvents(ctx, agent).serial('agent/created', { source: 'resume' })
    expect(ctx.goals.get(agent)?.activation).toBe('disarmed')
    goal = ctx.goals.resume(agent, goal)
    expect(goal).toMatchObject({ phase: 'active', activation: 'armed', revision: 2 })
    expect(activations.map(entry => entry.activation)).toEqual(['armed', 'disarmed', 'armed'])
    expect(activations.map(entry => entry.id)).toEqual([goal.id, goal.id, goal.id])
    expect(activations.map(entry => entry.revision)).toEqual([1, 1, 2])
    expect(() => foldGoal(session.snapshotEvents())).not.toThrow()
  })

  it('lets a lifecycle owner disarm without writing a durable revision', async () => {
    const { ctx, agent, session } = await harness()
    const goal = createGoal(ctx, agent, { objective: 'survive driver reload' })
    const before = session.snapshotEvents().length
    expect(ctx.goals.disarm(agent)).toMatchObject({
      id: goal.id,
      revision: goal.revision,
      phase: 'active',
      activation: 'disarmed',
    })
    expect(session.snapshotEvents()).toHaveLength(before)
    expect(ctx.goals.resume(agent, goal)).toMatchObject({ revision: 2, activation: 'armed' })
  })

  it('removes the service and projection with the providing fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    if (ctx.get('sessions') === undefined) await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const fiber = await ctx.plugin(GoalService)
    const first = ctx.goals
    const stub = stubAgent('goal-hmr', undefined, ctx)
    await ctx.agents.register(stub.agent)
    const goal = createGoal(ctx, stub.agent, { objective: 'survive service reload' })

    await fiber.dispose()
    expect(ctx.get('goals')).toBeUndefined()
    expect(ctx.sessionProjections.stateOf(stub.session, 'goal')).toBeUndefined()
    expect(() => first.get(stub.agent)).toThrow('goal projection is not registered')

    await ctx.plugin(GoalService)
    expect(ctx.goals).not.toBe(first)
    expect(ctx.goals.get(stub.agent)).toMatchObject({ id: goal.id, activation: 'disarmed' })
  })

  it('requires the exact live registry instance for reads and mutations', async () => {
    const { ctx, agent } = await harness()
    // A same-id agent backed by a different session object — the live-instance
    // check must reject it even though the ids match.
    const impostor = { ...agent, session: Session.create(agent.id) } as Agent
    expect(() => ctx.goals.get(impostor)).toThrow(expect.objectContaining({ code: 'GOAL_AGENT_NOT_LIVE' }))
    expect(() => createGoal(ctx, impostor, { objective: 'no' })).toThrow(expect.objectContaining({
      code: 'GOAL_AGENT_NOT_LIVE',
    }))
  })

})

describe('GoalService mutations', () => {
  it('invalidates human task acceptance when the objective changes', async () => {
    const { ctx, agent } = await harness()
    const accepted = await acceptedGoal(ctx, agent, 'original objective')
    const edited = ctx.goals.edit(agent, accepted, { objective: 'replacement objective' })

    expect(edited.taskManifest?.tasks).toMatchObject([{ id: 'done', status: 'PENDING' }])
    expect(() => ctx.goals.complete(agent, edited)).toThrow(expect.objectContaining({ code: 'GOAL_TASKS_INCOMPLETE' }))

    const reaccepted = await humanEdit(ctx, agent, edited, { taskStatus: { taskId: 'done', status: 'ACCEPTED' } })
    expect(ctx.goals.complete(agent, reaccepted)).toMatchObject({ phase: 'complete' })
  })

  it('rejects task acceptance from an unrelated active command', async () => {
    const { ctx, agent } = await harness()
    const created = createGoal(ctx, agent, {
      objective: 'require the goal command',
      requiredTasks: [{ id: 'done', criterion: 'Complete the stated goal' }],
    })
    const dispose = ctx.commands.register({
      name: 'unrelated',
      description: 'Unrelated command',
      handler(invocation) {
        expect(() => ctx.goals.editFromCommand(invocation, created, {
          taskStatus: { taskId: 'done', status: 'ACCEPTED' },
        })).toThrow(expect.objectContaining({ code: 'GOAL_HUMAN_AUTHORITY_REQUIRED' }))
        return { kind: 'success' }
      },
    })
    try {
      await ctx.commands.execute(agent, '/unrelated', [], new AbortController().signal)
    } finally {
      dispose()
    }
    expect(ctx.goals.get(agent)?.taskManifest?.tasks).toMatchObject([{ id: 'done', status: 'PENDING' }])
  })

  it('adapts Remote creation and reuses business methods for later mutations', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.goals.remoteExportCreate(agent, { objective: 'remote lifecycle', requiredTasks: [{ id: 'done', criterion: 'Complete lifecycle' }] })
    const edited = ctx.goals.edit(agent, created.ref, { objective: 'edited remotely' })
    const paused = ctx.goals.pause(agent, edited)
    const resumed = ctx.goals.resume(agent, paused)
    const accepted = await humanEdit(ctx, agent, resumed, { taskStatus: { taskId: 'done', status: 'ACCEPTED' } })
    const completed = ctx.goals.complete(agent, accepted)
    const cleared = ctx.goals.clear(agent, completed)

    expect(edited).toMatchObject({ objective: 'edited remotely', revision: 2 })
    expect(paused).toMatchObject({ phase: 'paused', revision: 3 })
    expect(resumed).toMatchObject({ phase: 'active', revision: 4 })
    expect(completed).toMatchObject({ phase: 'complete', revision: 6 })
    expect(cleared).toEqual({ id: created.ref.id, revision: 7 })
  })

  it('edits with compare-and-set revisions and rejects empty edits', async () => {
    const { ctx, agent } = await harness()
    const created = createGoal(ctx, agent, { objective: 'old', maxGoalRounds: 4 })
    expect(() => ctx.goals.edit(agent, created, {})).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_EDIT' }))
    const objective = ctx.goals.edit(agent, created, { objective: ' new ' })
    expect(objective).toMatchObject({ objective: 'new', maxGoalRounds: 4, revision: 2, activation: 'armed' })
    expect(() => ctx.goals.edit(agent, created, { maxGoalRounds: 8 })).toThrow(expect.objectContaining({
      code: 'GOAL_STALE_REVISION',
    }))
    const cap = ctx.goals.edit(agent, objective, { maxGoalRounds: 8 })
    expect(cap).toMatchObject({ objective: 'new', maxGoalRounds: 8, revision: 3 })
    expect(() => ctx.goals.edit(agent, cap, { objective: ' ' })).toThrow(expect.objectContaining({
      code: 'GOAL_INVALID_OBJECTIVE',
    }))
  })

  it('supports pause, resume, block, and completion transitions', async () => {
    const { ctx, agent } = await harness()
    let goal = await acceptedGoal(ctx, agent, 'lifecycle')
    goal = ctx.goals.pause(agent, goal)
    expect(goal).toMatchObject({ phase: 'paused', activation: 'disarmed', revision: 3 })
    goal = ctx.goals.resume(agent, goal)
    expect(goal).toMatchObject({ phase: 'active', activation: 'armed', revision: 4 })
    goal = ctx.goals.block(agent, goal, { code: 'needs-input', message: 'A choice is required.' })
    expect(goal).toMatchObject({
      phase: 'blocked',
      blockedReason: { code: 'needs-input', message: 'A choice is required.' },
      activation: 'disarmed',
    })
    goal = ctx.goals.resume(agent, goal)
    goal = ctx.goals.pause(agent, goal)
    goal = ctx.goals.complete(agent, goal)
    expect(goal).toMatchObject({ phase: 'complete', activation: 'disarmed' })
    expect(() => ctx.goals.resume(agent, goal)).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_TRANSITION' }))
  })

  it('allows completion from every stopped phase and replacement only after completion', async () => {
    const phases = ['paused', 'blocked'] as const
    for (const phase of phases) {
      const { ctx, agent } = await harness()
      let goal = await acceptedGoal(ctx, agent, phase)
      goal = phase === 'paused'
        ? ctx.goals.pause(agent, goal)
        : ctx.goals.block(agent, goal, { code: 'test-blocker', message: 'Blocked for the test.' })
      const complete = ctx.goals.complete(agent, goal)
      const replacement = createGoal(ctx, agent, { objective: `after ${phase}` })
      expect(complete.phase).toBe('complete')
      expect(replacement.id).not.toBe(complete.id)
      expect(replacement.revision).toBe(1)
    }
  })

  it('rejects replacement and invalid phase transitions while a resumable goal exists', async () => {
    const { ctx, agent } = await harness()
    const goal = createGoal(ctx, agent, { objective: 'still active' })
    expect(() => createGoal(ctx, agent, { objective: 'replacement' })).toThrow(expect.objectContaining({
      code: 'GOAL_ALREADY_EXISTS',
    }))
    expect(() => ctx.goals.resume(agent, goal)).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_TRANSITION' }))
    const paused = ctx.goals.pause(agent, goal)
    expect(() => ctx.goals.pause(agent, paused)).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_TRANSITION' }))
    expect(() => ctx.goals.block(agent, paused, {
      code: 'test-blocker', message: 'Blocked for the test.',
    })).toThrow(expect.objectContaining({
      code: 'GOAL_INVALID_TRANSITION',
    }))
  })

  it('records canonical blocker reasons and enforces the round cap on resume', async () => {
    const { ctx, agent, session } = await harness()
    let goal = await acceptedGoal(ctx, agent, 'bounded', 2)
    for (const reason of [null, [], { code: 1, message: 'invalid code' }, { code: 'round-limit', message: 1 }]) {
      expect(() => ctx.goals.block(agent, goal, reason as never)).toThrow(expect.objectContaining({
        code: 'GOAL_INVALID_BLOCK_REASON',
      }))
    }
    expect(() => ctx.goals.block(agent, goal, {
      code: 'Not Canonical', message: 'invalid code',
    })).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_BLOCK_REASON' }))
    expect(() => ctx.goals.block(agent, goal, {
      code: 'round-limit', message: '   ',
    })).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_BLOCK_REASON' }))
    appendRound(session, goal, 1)
    expect(ctx.goals.get(agent)?.roundsStarted).toBe(1)
    appendRound(session, goal, 2)
    goal = ctx.goals.block(agent, goal, { code: 'round-limit', message: '  Goal round limit reached.  ' })
    expect(goal).toMatchObject({
      phase: 'blocked',
      blockedReason: { code: 'round-limit', message: 'Goal round limit reached.' },
      roundsStarted: 2,
      activation: 'disarmed',
    })
    expect(() => ctx.goals.resume(agent, goal)).toThrow(expect.objectContaining({ code: 'GOAL_INVALID_TRANSITION' }))
    goal = ctx.goals.edit(agent, goal, { maxGoalRounds: 3 })
    expect(goal.blockedReason).toEqual({ code: 'round-limit', message: 'Goal round limit reached.' })
    goal = ctx.goals.resume(agent, goal)
    expect(goal).toMatchObject({ phase: 'active', maxGoalRounds: 3, activation: 'armed' })
    expect(goal.blockedReason).toBeUndefined()
    appendRound(session, goal, 3)
    goal = ctx.goals.block(agent, goal, { code: 'round-limit', message: 'Goal round limit reached.' })
    expect(ctx.goals.complete(agent, goal).phase).toBe('complete')
  })

  it('clears through a revisioned tombstone and permits a fresh goal', async () => {
    const { ctx, agent, session } = await harness()
    const goal = createGoal(ctx, agent, { objective: 'temporary' })
    const tombstone = ctx.goals.clear(agent, goal)
    expect(tombstone).toEqual({ id: goal.id, revision: 2 })
    expect(ctx.goals.get(agent)).toBeUndefined()
    expect(foldGoal(session.snapshotEvents())).toEqual({ roundsStarted: 0, lastRef: tombstone })
    expect(() => ctx.goals.clear(agent, goal)).toThrow(expect.objectContaining({ code: 'GOAL_NOT_FOUND' }))
    const next = createGoal(ctx, agent, { objective: 'fresh' })
    expect(next.id).not.toBe(goal.id)
  })

  it('keeps per-goal mutation timestamps monotonic when the wall clock moves backward', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100)
    const { ctx, agent, session } = await harness()
    let goal = createGoal(ctx, agent, { objective: 'monotonic time' })
    vi.setSystemTime(90)
    goal = ctx.goals.pause(agent, goal)
    expect(goal.updatedAt).toBe(100)
    vi.setSystemTime(80)
    ctx.goals.clear(agent, goal)
    const clear = session.snapshotEvents()
      .filter(event => event.type === 'goal/change')
      .map(event => event.type === 'goal/change' ? decodeGoalChange(event.data) : undefined)
      .at(-1)
    expect(clear).toMatchObject({ operation: 'clear', clearedAt: 100 })
    expect(() => foldGoal(session.snapshotEvents())).not.toThrow()
    vi.useRealTimers()
  })

  it('contains goal notification failures and preserves later listeners', async () => {
    const { ctx, agent } = await harness()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const seen: string[] = []
    ctx.on('goal/changed', () => { throw new Error('broken observer') })
    ctx.on('goal/changed', ({ change }) => { seen.push(change.operation) })
    expect(createGoal(ctx, agent, { objective: 'notify' }).phase).toBe('active')
    expect(seen).toEqual(['create'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken observer'))
  })

  it('commits consecutive revisions through durable goal events', async () => {
    const { ctx, agent, session } = await harness()
    let goal = createGoal(ctx, agent, { objective: 'deferred', maxGoalRounds: 5 })
    goal = ctx.goals.edit(agent, goal, { objective: 'deferred edit' })
    goal = ctx.goals.pause(agent, goal)
    expect(goal).toMatchObject({ revision: 3, phase: 'paused', activation: 'disarmed' })
    expect(session.snapshotEvents().map(event => event.type)).toEqual([
      'goal/change', 'goal/change', 'goal/change',
    ])
    expect(ctx.goals.get(agent)).toMatchObject({ revision: 3, phase: 'paused' })
    expect(foldGoal(session.snapshotEvents())).toMatchObject({ goal: { revision: 3, phase: 'paused' } })
  })

  it('publishes a mutation consistently to a reentrant session observer', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(GoalService)
    const stub = stubAgentForSession(ctx.sessions.create(SessionId('goal-reentrant-observer')), ctx)
    await ctx.agents.register(stub.agent)
    let observed: ReturnType<GoalService['get']>
    ctx.on('session/event', (session, event) => {
      if (session === stub.session && event.type === 'goal/change') observed = ctx.goals.get(stub.agent)
    })

    const created = createGoal(ctx, stub.agent, { objective: 'publish once' })

    expect(observed).toEqual(created)
    expect(ctx.goals.get(stub.agent)).toEqual(created)
    expect(foldGoal(stub.session.snapshotEvents())).toMatchObject({ goal: { id: created.id, revision: 1 } })
  })

  it('does not delegate goal persistence to agent injection', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    if (ctx.get('sessions') === undefined) await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(GoalService)
    const stub = stubAgent('goal-independent-injection', undefined, ctx)
    stub.agent.inject = () => { throw new Error('injection must not be called') }
    await ctx.agents.register(stub.agent)

    expect(createGoal(ctx, stub.agent, { objective: 'persist directly' })).toMatchObject({
      objective: 'persist directly',
      revision: 1,
    })
    expect(stub.agent.inbox.nextStep).toEqual([])
    expect(stub.session.snapshotEvents().map(event => event.type)).toEqual(['goal/change'])
  })

  it('observes an external goal change and disarms local activation', async () => {
    const { ctx, agent, session } = await harness()
    const created = createGoal(ctx, agent, { objective: 'before external edit', maxGoalRounds: 4 })
    expect(created.activation).toBe('armed')
    const change: GoalSnapshotChangeMeta = {
      kind: 'goal/change',
      version: 2,
      operation: 'edit',
      goal: {
        id: created.id,
        revision: created.revision + 1,
        objective: 'observe external append',
        phase: 'active',
        maxGoalRounds: 4,
        taskManifest: created.taskManifest!,
      },
      roundsStarted: created.roundsStarted,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    }
    session.append('goal/change', change)

    expect(ctx.goals.get(agent)).toMatchObject({
      id: change.goal.id,
      objective: change.goal.objective,
      activation: 'disarmed',
    })
  })

  it('rejects a corrupt append while preserving the valid prefix', async () => {
    const { ctx, agent, session } = await harness()
    expect(ctx.goals.get(agent)).toBeUndefined()
    const change: GoalSnapshotChangeMeta = {
      kind: 'goal/change',
      version: 1,
      operation: 'create',
      goal: {
        id: GoalId('goal-valid-prefix'),
        revision: 1,
        objective: 'valid prefix',
        phase: 'active',
        maxGoalRounds: 4,
      },
      roundsStarted: 0,
      createdAt: 12,
      updatedAt: 12,
    }
    session.append('goal/change', change)
    expect(() => {
      session.append('goal/change', { ...change, operation: 'edit', extra: true } as never)
    }).toThrow('snapshot change must have exactly')

    expect(ctx.goals.get(agent)).toMatchObject({ id: change.goal.id, objective: 'valid prefix' })
  })
})

describe('goal replay validation', () => {
  function snapshotChange(overrides: Partial<GoalSnapshotChangeMeta> = {}): GoalSnapshotChangeMeta {
    return {
      kind: 'goal/change',
      version: 1,
      operation: 'create',
      goal: {
        id: GoalId('goal-validation'),
        revision: 1,
        objective: 'validate',
        phase: 'active',
        maxGoalRounds: 2,
      },
      roundsStarted: 0,
      createdAt: 10,
      updatedAt: 10,
      ...overrides,
    }
  }

  function appendChange(session: Session, change: GoalChangeMeta): void {
    session.append('goal/change', change)
  }

  function oneChange(change: GoalChangeMeta) {
    const session = Session.create(SessionId(`validation-${Math.random()}`))
    appendChange(session, change)
    return session.snapshotEvents()
  }

  function mutation(
    current: GoalSnapshotChangeMeta,
    operation: Exclude<GoalSnapshotChangeMeta['operation'], 'create'>,
    phase: GoalSnapshotChangeMeta['goal']['phase'],
    overrides: Partial<GoalSnapshotChangeMeta> = {},
  ): GoalSnapshotChangeMeta {
    return {
      ...current,
      operation,
      goal: {
        id: current.goal.id,
        revision: current.goal.revision + 1,
        objective: current.goal.objective,
        phase,
        ...phase === 'blocked'
          ? { blockedReason: { code: 'test-blocker', message: 'Blocked for replay validation.' } }
          : {},
        maxGoalRounds: current.goal.maxGoalRounds,
      },
      updatedAt: current.updatedAt + 1,
      ...overrides,
    }
  }

  it('keeps durable goal state independent from inbox changes', () => {
    const change = snapshotChange()
    const session = Session.create(SessionId('inbox-independent-change'))
    appendChange(session, change)
    expect(foldGoal(session.snapshotEvents())).toMatchObject({ goal: { id: change.goal.id, revision: 1 } })
    const message = createUserMessage({
      content: [{ type: 'text', text: 'unrelated pending context' }],
      source: { kind: 'test' },
    })
    const inbox = stubAgentForSession(session).agent.inbox
    inbox.append('next-step', message)
    expect(inbox.remove(message.id)).toBe(true)
    expect(foldGoal(session.snapshotEvents())).toMatchObject({ goal: { id: change.goal.id, revision: 1 } })
  })

  function foldPair(first: GoalSnapshotChangeMeta, second: GoalChangeMeta): ReturnType<typeof foldGoal> {
    const session = Session.create(SessionId(`validation-pair-${Math.random()}`))
    appendChange(session, first)
    appendChange(session, second)
    return foldGoal(session.snapshotEvents())
  }

  it('ignores unrelated metadata and non-goal round sources', () => {
    expect(decodeGoalChange(undefined)).toBeUndefined()
    expect(decodeGoalChange({ kind: 'other' })).toBeUndefined()
    const session = Session.create(SessionId('unrelated'))
    appendInjection(session, createUserMessage({
      content: [{ type: 'text', text: 'other' }],
      source: { kind: 'test' },
    }))
    expect(foldGoal(session.snapshotEvents())).toEqual({ roundsStarted: 0 })
    const source = { kind: 'ordinary-user-message' } as const
    const turn = nextTurn(session)
    session.append('turn/start', { turn })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'ordinary' }], source,
    }), { surfaceOp: 'append' })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
    expect(foldGoal(session.snapshotEvents())).toEqual({ roundsStarted: 0 })
  })

  it('rejects rounds attributed to another goal', () => {
    const change = snapshotChange()
    const session = Session.create(SessionId('other-goal-round'), oneChange(change))
    appendRound(session, { id: GoalId('goal-other'), revision: 1 }, 1)
    expect(() => foldGoal(session.snapshotEvents())).toThrow('not the next admitted round')
  })

  it('rejects unsupported versions, operations, and extra top-level fields', () => {
    expect(decodeGoalChange({ ...snapshotChange(), version: 1 })?.version).toBe(1)
    expect(decodeGoalChange({ ...snapshotChange(), version: 2 })?.version).toBe(2)
    expect(() => decodeGoalChange({ ...snapshotChange(), version: 3 })).toThrow('unsupported goal change version')
    const versionOneWithManifest = {
      ...snapshotChange(),
      goal: {
        ...snapshotChange().goal,
        taskManifest: {
          originalObjective: 'validate', originalRequiredTasks: [{ id: 'done', criterion: 'Complete' }],
          scopeRevisions: [], tasks: [{ id: 'done', criterion: 'Complete', status: 'PENDING' }],
        },
      },
    }
    expect(() => decodeGoalChange(versionOneWithManifest)).toThrow('exactly')
    expect(() => decodeGoalChange({ ...snapshotChange(), operation: 'explode' })).toThrow('operation is invalid')
    expect(() => decodeGoalChange({ ...snapshotChange(), extra: true })).toThrow('snapshot change must have exactly')
    expect(() => decodeGoalChange({
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: 'x', revision: 2 }, clearedAt: 1, extra: true,
    })).toThrow('clear change must have exactly')
  })

  it('rejects invalid create and missing-current mutation sequences', () => {
    const base = snapshotChange()
    const invalidCreates: GoalSnapshotChangeMeta[] = [
      { ...base, goal: { ...base.goal, revision: 2 } },
      { ...base, goal: { ...base.goal, phase: 'paused' } },
      { ...base, roundsStarted: 1 },
    ]
    for (const change of invalidCreates) expect(() => foldGoal(oneChange(change))).toThrow('goal create requires')

    const edit = mutation(base, 'edit', 'active')
    expect(() => foldGoal(oneChange(edit))).toThrow('requires a current goal')
    const clear: GoalChangeMeta = {
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: base.goal.id, revision: 2 }, clearedAt: 12,
    }
    expect(() => foldGoal(oneChange(clear))).toThrow('clear requires a current goal')

    const secondCreate = snapshotChange({
      goal: { ...base.goal, id: GoalId('goal-second') },
      createdAt: 20,
      updatedAt: 20,
    })
    expect(() => foldPair(base, secondCreate)).toThrow('goal create requires')
  })

  it('rejects stale identity, counters, timestamps, and definition changes', () => {
    const base = snapshotChange()
    const invalid: GoalSnapshotChangeMeta[] = [
      mutation(base, 'edit', 'active', { goal: { ...base.goal, id: GoalId('goal-wrong'), revision: 2 } }),
      mutation(base, 'edit', 'active', { goal: { ...base.goal, revision: 3 } }),
      mutation(base, 'edit', 'active', { createdAt: 11 }),
      mutation(base, 'edit', 'active', { updatedAt: 9 }),
      mutation(base, 'edit', 'active', { roundsStarted: 1 }),
      mutation(base, 'pause', 'paused', {
        goal: { ...base.goal, revision: 2, phase: 'paused', objective: 'changed illegally' },
      }),
      mutation(base, 'pause', 'paused', {
        goal: { ...base.goal, revision: 2, phase: 'paused', maxGoalRounds: 3 },
      }),
    ]
    for (const change of invalid) expect(() => foldPair(base, change)).toThrow()
  })

  it('rejects invalid replayed lifecycle phase transitions', () => {
    const base = snapshotChange()
    const invalid: GoalSnapshotChangeMeta[] = [
      mutation(base, 'edit', 'paused'),
      mutation(base, 'pause', 'active'),
      mutation(base, 'resume', 'paused'),
      mutation(base, 'complete', 'active'),
      mutation(base, 'block', 'active'),
    ]
    for (const change of invalid) expect(() => foldPair(base, change)).toThrow()

    const paused = mutation(base, 'pause', 'paused')
    const exhausted = mutation(paused, 'resume', 'active', {
      roundsStarted: 2,
      goal: { ...paused.goal, revision: 3, phase: 'active', maxGoalRounds: 2 },
    })
    const session = Session.create(SessionId('exhausted-resume'))
    appendChange(session, base)
    appendRound(session, base.goal, 1)
    appendRound(session, base.goal, 2)
    appendChange(session, { ...paused, roundsStarted: 2 })
    appendChange(session, exhausted)
    expect(() => foldGoal(session.snapshotEvents())).toThrow('exhausted round budget')
  })

  it('rejects invalid clear continuity and goal id reuse', () => {
    const base = snapshotChange()
    const staleClear: GoalChangeMeta = {
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: base.goal.id, revision: 3 }, clearedAt: 11,
    }
    expect(() => foldPair(base, staleClear)).toThrow('advance the current goal')
    const earlyClear: GoalChangeMeta = {
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: base.goal.id, revision: 2 }, clearedAt: 9,
    }
    expect(() => foldPair(base, earlyClear)).toThrow('timestamp cannot precede')

    const complete = mutation(base, 'complete', 'complete')
    const sameCurrentId = snapshotChange({
      goal: { ...base.goal, revision: 1 },
      createdAt: 20,
      updatedAt: 20,
    })
    const completedSession = Session.create(SessionId('reuse-complete'))
    appendChange(completedSession, base)
    appendChange(completedSession, complete)
    appendChange(completedSession, sameCurrentId)
    expect(() => foldGoal(completedSession.snapshotEvents())).toThrow('fresh active revision-one')

    const second = snapshotChange({
      goal: { ...base.goal, id: GoalId('goal-second') },
      createdAt: 20,
      updatedAt: 20,
    })
    const secondComplete = mutation(second, 'complete', 'complete')
    const nonAdjacentReuse = Session.create(SessionId('reuse-non-adjacent'))
    appendChange(nonAdjacentReuse, base)
    appendChange(nonAdjacentReuse, complete)
    appendChange(nonAdjacentReuse, second)
    appendChange(nonAdjacentReuse, secondComplete)
    appendChange(nonAdjacentReuse, { ...sameCurrentId, createdAt: 30, updatedAt: 30 })
    expect(() => foldGoal(nonAdjacentReuse.snapshotEvents())).toThrow('fresh active revision-one')

    const clear: GoalChangeMeta = {
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: base.goal.id, revision: 2 }, clearedAt: 11,
    }
    const clearedSession = Session.create(SessionId('reuse-clear'))
    appendChange(clearedSession, base)
    appendChange(clearedSession, clear)
    appendChange(clearedSession, sameCurrentId)
    expect(() => foldGoal(clearedSession.snapshotEvents())).toThrow('fresh active revision-one')
  })

  it('rejects non-positive goal round sources', () => {
    const session = Session.create(SessionId('goal-source-without-meta'))
    const source = { kind: 'goal', goalId: GoalId('goal-missing-meta'), revision: 1, round: 0 } as const
    const turn = nextTurn(session)
    session.append('turn/start', { turn })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'missing' }], source,
    }), { surfaceOp: 'append' })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
    expect(() => foldGoal(session.snapshotEvents())).toThrow('goal message source is invalid')
  })

  it('rejects malformed snapshots, refs, counters, and timestamps', () => {
    const base = snapshotChange()
    const badSnapshots: unknown[] = [
      null,
      { ...base.goal, extra: true },
      { ...base.goal, id: '' },
      { ...base.goal, objective: ' ' },
      { ...base.goal, objective: ' padded ' },
      { ...base.goal, phase: 'unknown' },
      { ...base.goal, blockedReason: { code: 'unexpected', message: 'Only blocked goals have reasons.' } },
      { ...base.goal, phase: 'blocked' },
      { ...base.goal, phase: 'blocked', blockedReason: null },
      { ...base.goal, phase: 'blocked', blockedReason: { code: 'test-blocker', message: 'Valid.', extra: true } },
      { ...base.goal, phase: 'blocked', blockedReason: { code: 'NOT_CANONICAL', message: 'Bad code.' } },
      { ...base.goal, phase: 'blocked', blockedReason: { code: 'test-blocker', message: ' padded ' } },
      { ...base.goal, revision: 0 },
      { ...base.goal, maxGoalRounds: -1 },
    ]
    for (const goal of badSnapshots) expect(() => decodeGoalChange({ ...base, goal })).toThrow()
    expect(() => decodeGoalChange({ ...base, roundsStarted: -1 })).toThrow('roundsStarted')
    expect(() => decodeGoalChange({ ...base, createdAt: -1 })).toThrow('createdAt')
    expect(() => decodeGoalChange({ ...base, updatedAt: 9 })).toThrow('cannot precede')
    expect(() => decodeGoalChange({
      kind: 'goal/change', version: 1, operation: 'clear', cleared: null, clearedAt: 1,
    })).toThrow('tombstone')
    expect(() => decodeGoalChange({
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: '', revision: 1 }, clearedAt: 1,
    })).toThrow('non-empty')
    expect(() => decodeGoalChange({
      kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: 'x', revision: 0 }, clearedAt: 1,
    })).toThrow('positive safe integer')
  })

  it('folds a clear tombstone after a snapshot', () => {
    const change = snapshotChange()
    const session = Session.create(SessionId('fold-clear'), oneChange(change))
    const clear: GoalChangeMeta = {
      kind: 'goal/change',
      version: 1,
      operation: 'clear',
      cleared: { id: change.goal.id, revision: 2 },
      clearedAt: 20,
    }
    appendChange(session, clear)
    expect(foldGoal(session.snapshotEvents())).toEqual({
      roundsStarted: 0,
      lastRef: { id: change.goal.id, revision: 2 },
    })
  })
})
