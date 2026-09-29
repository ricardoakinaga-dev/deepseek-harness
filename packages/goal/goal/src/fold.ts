/** Pure replay fold and strict decoder for durable goal changes. */

import type { MessageSource } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { GOAL_CHANGE_VERSION, GoalId } from './runtime.ts'
import type { GoalBlockReason, GoalPhase, GoalRef, GoalSnapshot, GoalTaskDefinition, GoalTaskManifest, GoalTaskStatus } from './types.ts'
import type {
  FoldedGoal,
  GoalChangeMeta,
  GoalClearChangeMeta,
  GoalMessageSource,
  GoalOperation,
  GoalSnapshotChangeMeta,
  GoalSnapshotChangeV1,
  GoalSnapshotChangeV2,
} from './domain.ts'

type NormalizedSnapshotChangeV1 = Omit<GoalSnapshotChangeV1, 'goal'> & { readonly goal: GoalSnapshot }
type NormalizedSnapshotChange = NormalizedSnapshotChangeV1 | GoalSnapshotChangeV2
type NormalizedGoalChange = NormalizedSnapshotChange | GoalClearChangeMeta

const SNAPSHOT_OPERATIONS: ReadonlySet<Exclude<GoalOperation, 'clear'>> = new Set([
  'create',
  'edit',
  'pause',
  'resume',
  'complete',
  'block',
])
const PHASES: ReadonlySet<GoalPhase> = new Set(['active', 'paused', 'blocked', 'complete'])
const TASK_STATUSES: ReadonlySet<GoalTaskStatus> = new Set(['PENDING', 'PARCIAL', 'BLOCKED_EXTERNAL', 'ACCEPTED'])

function decodeTaskDefinition(value: unknown): GoalTaskDefinition {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'criterion,id'
    || typeof value['id'] !== 'string' || value['id'].trim() !== value['id'] || value['id'].length === 0
    || typeof value['criterion'] !== 'string' || value['criterion'].trim() !== value['criterion']
    || value['criterion'].length === 0) throw new Error('goal task requires normalized id and criterion')
  return { id: value['id'], criterion: value['criterion'] }
}

function decodeDefinitions(value: unknown): readonly GoalTaskDefinition[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('goal required tasks must be a non-empty array')
  const tasks: GoalTaskDefinition[] = value.map(decodeTaskDefinition)
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('goal required task IDs must be unique')
  return tasks
}

function decodeManifest(value: unknown): GoalTaskManifest {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'originalObjective,originalRequiredTasks,scopeRevisions,tasks') {
    throw new Error('goal task manifest has invalid fields')
  }
  if (typeof value['originalObjective'] !== 'string' || value['originalObjective'].length === 0
    || value['originalObjective'].trim() !== value['originalObjective']) throw new Error('goal original objective is invalid')
  if (!Array.isArray(value['scopeRevisions'])) throw new Error('goal scope revisions must be an array')
  const scopeRevisions = value['scopeRevisions'].map((item: unknown) => {
    if (!isRecord(item) || Object.keys(item).sort().join(',') !== 'reason,requiredTasks'
      || typeof item['reason'] !== 'string' || item['reason'].trim() !== item['reason'] || item['reason'].length === 0) {
      throw new Error('goal scope revision requires a normalized reason')
    }
    return { reason: item['reason'], requiredTasks: decodeDefinitions(item['requiredTasks']) }
  })
  if (!Array.isArray(value['originalRequiredTasks'])) throw new Error('goal original required tasks must be an array')
  const originalRequiredTasks = value['originalRequiredTasks'].length === 0
    ? []
    : decodeDefinitions(value['originalRequiredTasks'])
  if (originalRequiredTasks.length === 0 && scopeRevisions.length === 0) {
    throw new Error('goal original required tasks may be empty only after an explicit scope revision')
  }
  const effective = scopeRevisions.at(-1)?.requiredTasks ?? originalRequiredTasks
  if (!Array.isArray(value['tasks']) || value['tasks'].length !== effective.length) {
    throw new Error('goal current tasks must match required scope')
  }
  const tasks = value['tasks'].map((item: unknown, index: number) => {
    if (!isRecord(item) || Object.keys(item).sort().join(',') !== 'criterion,id,status') {
      throw new Error('goal task status has invalid fields')
    }
    const definition = decodeTaskDefinition({ id: item['id'], criterion: item['criterion'] })
    const required = effective[index]
    if (required === undefined || definition.id !== required.id || definition.criterion !== required.criterion
      || typeof item['status'] !== 'string' || !TASK_STATUSES.has(item['status'] as GoalTaskStatus)) {
      throw new Error('goal task status does not match required scope')
    }
    return { ...definition, status: item['status'] as GoalTaskStatus }
  })
  return { originalObjective: value['originalObjective'], originalRequiredTasks, scopeRevisions, tasks }
}

/** Mutable accumulator kept private to the pure fold. */
export interface GoalFoldState {
  goal: GoalSnapshot | undefined
  roundsStarted: number
  createdAt: number | undefined
  updatedAt: number | undefined
  lastRef: GoalRef | undefined
  seenGoalIds: Set<GoalSnapshot['id']>
}

/**
 * Build an empty replay accumulator.
 * @returns mutable state with no current goal or prior ref.
 */
export function emptyGoalFoldState(): GoalFoldState {
  return {
    goal: undefined,
    roundsStarted: 0,
    createdAt: undefined,
    updatedAt: undefined,
    lastRef: undefined,
    seenGoalIds: new Set(),
  }
}

/** Whether a value is a JSON record rather than an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Require one positive safe integer. */
function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`goal change ${field} must be a positive safe integer`)
  }
  return value
}

/** Require one non-negative safe integer. */
function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`goal change ${field} must be a non-negative safe integer`)
  }
  return value
}

/** Decode one canonical blocker explanation. */
function decodeBlockReason(value: unknown): GoalBlockReason {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'code,message') {
    throw new Error('goal change goal.blockedReason must have exactly code and message fields')
  }
  if (typeof value['code'] !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value['code'])) {
    throw new Error('goal change goal.blockedReason.code must be lower-kebab-case')
  }
  if (typeof value['message'] !== 'string' || value['message'].trim().length === 0
    || value['message'] !== value['message'].trim()) {
    throw new Error('goal change goal.blockedReason.message must be non-empty and normalized')
  }
  return { code: value['code'], message: value['message'] }
}

/** Decode and validate one snapshot. */
function decodeSnapshot(value: unknown, allowTaskManifest: boolean): GoalSnapshot {
  if (!isRecord(value)) throw new Error('goal change goal must be a record')
  if (typeof value['id'] !== 'string' || value['id'].length === 0) {
    throw new Error('goal change goal.id must be a non-empty string')
  }
  if (typeof value['objective'] !== 'string' || value['objective'].trim().length === 0
    || value['objective'] !== value['objective'].trim()) {
    throw new Error('goal change goal.objective must be non-empty and normalized')
  }
  if (typeof value['phase'] !== 'string' || !PHASES.has(value['phase'] as GoalPhase)) {
    throw new Error('goal change goal.phase is invalid')
  }
  const phase = value['phase'] as GoalPhase
  const manifestKey = allowTaskManifest && value['taskManifest'] !== undefined ? ',taskManifest' : ''
  const expectedKeys = phase === 'blocked'
    ? `blockedReason,id,maxGoalRounds,objective,phase,revision${manifestKey}`
    : `id,maxGoalRounds,objective,phase,revision${manifestKey}`
  if (Object.keys(value).sort().join(',') !== expectedKeys) {
    throw new Error(`goal change goal for phase ${phase} must have exactly ${expectedKeys} fields`)
  }
  return {
    id: GoalId(value['id']),
    revision: positiveInteger(value['revision'], 'goal.revision'),
    objective: value['objective'],
    phase,
    maxGoalRounds: positiveInteger(value['maxGoalRounds'], 'goal.maxGoalRounds'),
    ...value['taskManifest'] === undefined ? {} : { taskManifest: decodeManifest(value['taskManifest']) },
    ...phase === 'blocked' ? { blockedReason: decodeBlockReason(value['blockedReason']) } : {},
  }
}

/** Decode and validate one ref. */
function decodeRef(value: unknown): GoalRef {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'id,revision') {
    throw new Error('goal clear tombstone must have exactly id and revision fields')
  }
  if (typeof value['id'] !== 'string' || value['id'].length === 0) {
    throw new Error('goal clear tombstone id must be a non-empty string')
  }
  return { id: GoalId(value['id']), revision: positiveInteger(value['revision'], 'cleared.revision') }
}

/**
 * Decode a value that declares itself as a goal change. Unrelated values
 * return `undefined`; malformed goal changes fail replay loudly.
 * @param value - candidate source change.
 * @returns validated goal change or `undefined` for another value kind.
 */
export function decodeGoalChange(value: unknown): GoalChangeMeta | undefined {
  if (!isRecord(value) || value['kind'] !== 'goal/change') return undefined
  const version = value['version']
  if (version !== 1 && version !== GOAL_CHANGE_VERSION) {
    throw new Error(`unsupported goal change version ${String(value['version'])}`)
  }
  if (value['operation'] === 'clear') {
    const allowed = ['cleared', 'clearedAt', 'kind', 'operation', 'version']
    if (Object.keys(value).sort().join(',') !== allowed.sort().join(',')) {
      throw new Error(`goal clear change must have exactly ${allowed.sort().join(',')} fields`)
    }
    return {
      kind: 'goal/change',
      version,
      operation: 'clear',
      cleared: decodeRef(value['cleared']),
      clearedAt: nonNegativeInteger(value['clearedAt'], 'clearedAt'),
    } satisfies GoalClearChangeMeta
  }
  if (typeof value['operation'] !== 'string'
    || !SNAPSHOT_OPERATIONS.has(value['operation'] as Exclude<GoalOperation, 'clear'>)) {
    throw new Error('goal change operation is invalid')
  }
  const allowed = ['createdAt', 'goal', 'kind', 'operation', 'roundsStarted', 'updatedAt', 'version']
  if (Object.keys(value).sort().join(',') !== allowed.sort().join(',')) {
    throw new Error(`goal snapshot change must have exactly ${allowed.sort().join(',')} fields`)
  }
  const createdAt = nonNegativeInteger(value['createdAt'], 'createdAt')
  const updatedAt = nonNegativeInteger(value['updatedAt'], 'updatedAt')
  if (updatedAt < createdAt) throw new Error('goal change updatedAt cannot precede createdAt')
  return {
    kind: 'goal/change',
    version,
    operation: value['operation'] as Exclude<GoalOperation, 'clear'>,
    goal: decodeSnapshot(value['goal'], version === GOAL_CHANGE_VERSION),
    roundsStarted: nonNegativeInteger(value['roundsStarted'], 'roundsStarted'),
    createdAt,
    updatedAt,
  } satisfies GoalSnapshotChangeMeta
}

/** Narrow model attribution to a valid goal source. */
function goalSource(source: MessageSource): GoalMessageSource | undefined {
  if (source.kind !== 'goal') return undefined
  if (typeof source.goalId !== 'string' || source.goalId.length === 0
    || !Number.isSafeInteger(source.revision) || source.revision < 1
    || !Number.isSafeInteger(source.round) || source.round < 1) {
    throw new Error('goal message source is invalid')
  }
  return source
}

/** Require two snapshots to retain fields that only `edit` may replace. */
function requireSameDefinition(current: GoalSnapshot, next: GoalSnapshot, operation: GoalOperation): void {
  if (next.objective !== current.objective || next.maxGoalRounds !== current.maxGoalRounds
    || JSON.stringify(next.taskManifest) !== JSON.stringify(current.taskManifest)) {
    throw new Error(`goal ${operation} cannot change objective, maxGoalRounds, or task manifest`)
  }
}

/** Require one exact next revision of the current goal. */
function requireNextRevision(current: GoalSnapshot, next: GoalRef, operation: GoalOperation): void {
  if (next.id !== current.id || next.revision !== current.revision + 1) {
    throw new Error(`goal ${operation} must advance the current goal by one revision`)
  }
}

/** Validate one non-create snapshot operation against the preceding projection. */
function validateSnapshotTransition(
  state: GoalFoldState,
  change: NormalizedSnapshotChange,
  current: GoalSnapshot,
): void {
  const next = change.goal
  requireNextRevision(current, next, change.operation)
  /*! v8 ignore next -- a current goal established by this fold always has an updatedAt */
  if (state.updatedAt === undefined) throw new Error('current goal fold lacks updatedAt')
  if (change.createdAt !== state.createdAt
    || change.updatedAt < state.updatedAt
    || change.roundsStarted !== state.roundsStarted) {
    throw new Error(`goal ${change.operation} does not preserve the current counters and timestamps`)
  }
  switch (change.operation) {
    case 'edit': {
      if (next.phase !== current.phase
        || JSON.stringify(next.blockedReason) !== JSON.stringify(current.blockedReason)) {
        throw new Error('goal edit cannot change phase or blocked reason')
      }
      if (JSON.stringify(next.taskManifest) === JSON.stringify(current.taskManifest)) break
      const before = current.taskManifest
      const after = next.taskManifest
      if (current.phase === 'complete' || after === undefined
        || next.maxGoalRounds !== current.maxGoalRounds) {
        throw new Error('goal edit cannot remove or replace the original task manifest')
      }
      if (before === undefined) {
        const firstScope = after.scopeRevisions[0]
        if (next.objective !== current.objective || after.originalObjective !== current.objective
          || after.originalRequiredTasks.length !== 0
          || after.scopeRevisions.length !== 1 || firstScope === undefined
          || after.tasks.some(task => task.status !== 'PENDING')) {
          throw new Error('goal scope adoption must add one explicit pending scope to a historical goal')
        }
        break
      }
      if (before.originalObjective !== after.originalObjective
        || JSON.stringify(before.originalRequiredTasks) !== JSON.stringify(after.originalRequiredTasks)) {
        throw new Error('goal edit cannot replace the original task manifest')
      }
      if (next.objective !== current.objective) {
        const beforeDefinitions = before.tasks.map(({ id, criterion }) => ({ id, criterion }))
        const afterDefinitions = after.tasks.map(({ id, criterion }) => ({ id, criterion }))
        if (JSON.stringify(before.scopeRevisions) !== JSON.stringify(after.scopeRevisions)
          || JSON.stringify(beforeDefinitions) !== JSON.stringify(afterDefinitions)
          || after.tasks.some(task => task.status !== 'PENDING')) {
          throw new Error('goal objective edit must preserve task scope and reset every task to PENDING')
        }
        break
      }
      if (JSON.stringify(before.scopeRevisions) === JSON.stringify(after.scopeRevisions)) {
        if (JSON.stringify({ ...before, tasks: [] }) !== JSON.stringify({ ...after, tasks: [] })
          || after.tasks.filter((task, index) => task.status !== before.tasks[index]?.status).length !== 1) {
          throw new Error('goal task status must change exactly one required task')
        }
        break
      }
      if (JSON.stringify(after.scopeRevisions.slice(0, -1)) !== JSON.stringify(before.scopeRevisions)
        || after.scopeRevisions.length !== before.scopeRevisions.length + 1
        || next.objective !== current.objective) {
        throw new Error('goal scope revision must append to the original manifest')
      }
      for (const task of after.tasks) {
        const previous = before.tasks.find(item => item.id === task.id && item.criterion === task.criterion)
        if (task.status !== (previous?.status ?? 'PENDING')) throw new Error('goal scope revision changed a task status')
      }
      break
    }
    case 'pause':
      requireSameDefinition(current, next, change.operation)
      if (current.phase !== 'active' || next.phase !== 'paused') throw new Error('goal pause has an invalid phase transition')
      break
    case 'resume': {
      requireSameDefinition(current, next, change.operation)
      const resumable: ReadonlySet<GoalPhase> = new Set([
        'active',
        'paused',
        'blocked',
      ])
      if (!resumable.has(current.phase) || next.phase !== 'active' || state.roundsStarted >= next.maxGoalRounds) {
        throw new Error('goal resume has an invalid phase transition or exhausted round budget')
      }
      break
    }
    case 'complete':
      requireSameDefinition(current, next, change.operation)
      if (current.taskManifest?.tasks.some(task => task.status !== 'ACCEPTED')) {
        throw new Error('goal complete requires every required task to be ACCEPTED')
      }
      if (current.phase === 'complete' || next.phase !== 'complete') throw new Error('goal complete has an invalid phase transition')
      break
    case 'block':
      requireSameDefinition(current, next, change.operation)
      if (current.phase !== 'active' || next.phase !== 'blocked') throw new Error('goal block has an invalid phase transition')
      break
    /*! v8 ignore start -- the caller excludes create and GoalOperation is closed; these arms retain fail-loud exhaustiveness */
    case 'create':
      throw new Error('goal create cannot be validated as a current-goal transition')
    default:
      change.operation satisfies never
      throw new Error('unknown goal snapshot operation')
    /*! v8 ignore stop */
  }
}

/**
 * Return the revision identity carried by a snapshot or tombstone.
 * @param change - decoded goal mutation.
 * @returns stable identity used to reconcile a deferred change with its log event.
 */
function changeRef(change: GoalChangeMeta | NormalizedGoalChange): GoalRef {
  return change.operation === 'clear'
    ? change.cleared
    : { id: change.goal.id, revision: change.goal.revision }
}

/**
 * Return the revision identity carried by a snapshot or tombstone.
 * @param change - decoded goal mutation.
 * @returns stable identity used to reconcile a deferred change with its log event.
 */
export function goalChangeRef(change: GoalChangeMeta): GoalRef {
  return changeRef(change)
}

/** Normalize a released snapshot for transition checks without changing its wire type. */
function normalizeGoalChange(change: GoalChangeMeta): NormalizedGoalChange {
  if (change.operation === 'clear') return change
  if (change.version === 1) return { ...change, goal: { ...change.goal } }
  return change
}

/**
 * Validate and apply one decoded change to a mutable accumulator.
 * @param state - preceding durable goal projection.
 * @param change - decoded full snapshot or clear tombstone.
 */
export function applyGoalChange(state: GoalFoldState, change: NormalizedGoalChange): void {
  const ref = changeRef(change)
  if (change.operation === 'clear') {
    const current = state.goal
    if (current === undefined) throw new Error('goal clear requires a current goal')
    requireNextRevision(current, change.cleared, change.operation)
    /*! v8 ignore next -- a current goal established by this fold always has an updatedAt */
    if (state.updatedAt === undefined) throw new Error('current goal fold lacks updatedAt')
    if (change.clearedAt < state.updatedAt) {
      throw new Error('goal clear timestamp cannot precede the current goal update')
    }
    state.goal = undefined
    state.roundsStarted = 0
    state.createdAt = undefined
    state.updatedAt = undefined
    state.lastRef = ref
    return
  }
  if (change.operation === 'create') {
    if (change.goal.revision !== 1 || change.goal.phase !== 'active' || change.roundsStarted !== 0
      || (state.goal !== undefined && state.goal.phase !== 'complete')
      || state.seenGoalIds.has(change.goal.id)) {
      throw new Error('goal create requires a fresh active revision-one goal with zero rounds')
    }
    state.seenGoalIds.add(change.goal.id)
    if (change.goal.taskManifest !== undefined
      && (change.goal.taskManifest.originalObjective !== change.goal.objective
        || change.goal.taskManifest.originalRequiredTasks.length === 0
        || change.goal.taskManifest.scopeRevisions.length !== 0
        || change.goal.taskManifest.tasks.some(task => task.status !== 'PENDING'))) {
      throw new Error('goal create requires pending tasks and no scope revisions')
    }
  } else {
    const current = state.goal
    if (current === undefined) throw new Error(`goal ${change.operation} requires a current goal`)
    validateSnapshotTransition(state, change, current)
  }
  state.goal = change.goal
  state.roundsStarted = change.roundsStarted
  state.createdAt = change.createdAt
  state.updatedAt = change.updatedAt
  state.lastRef = ref
}

/**
 * Apply one session event to the strict durable goal fold.
 * @param state - mutable fold accumulator.
 * @param event - next event in sequence order.
 */
export function applyGoalEvent(state: GoalFoldState, event: SessionEvent): void {
  if (event.type === 'goal/change') {
    const change = decodeGoalChange(event.data)
    /*! v8 ignore next -- the event's declared payload always identifies itself as a goal change. */
    if (change === undefined) throw new Error(`goal change at session event ${event.seq} has an invalid kind`)
    applyGoalChange(state, normalizeGoalChange(change))
    return
  }
  if (event.type === 'user/message') {
    const source = goalSource(event.data.source)
    if (source === undefined) return
    const current = state.goal
    if (current === undefined || current.phase !== 'active' || source.goalId !== current.id
      || source.revision !== current.revision || source.round !== state.roundsStarted + 1
      || source.round > current.maxGoalRounds) {
      throw new Error(`goal round at session event ${event.seq} is not the next admitted round of the active goal`)
    }
    state.roundsStarted = source.round
  }
}

/**
 * Fold current goal state from a contiguous session event log.
 * @param events - session events in sequence order.
 * @returns a fresh durable projection; activation is deliberately absent.
 */
export function foldGoal(events: readonly SessionEvent[]): FoldedGoal {
  const state = emptyGoalFoldState()
  for (const event of events) applyGoalEvent(state, event)
  return {
    ...state.goal === undefined ? {} : { goal: { ...state.goal } },
    roundsStarted: state.roundsStarted,
    ...state.createdAt === undefined ? {} : { createdAt: state.createdAt },
    ...state.updatedAt === undefined ? {} : { updatedAt: state.updatedAt },
    ...state.lastRef === undefined ? {} : { lastRef: { ...state.lastRef } },
  }
}
