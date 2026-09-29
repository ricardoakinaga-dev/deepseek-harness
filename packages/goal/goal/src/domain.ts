/**
 * Host-side vocabulary of the goal domain: live views, durable change
 * payloads, message attribution, replay folds, and the scoped `goal/changed`
 * event. Kept separate from ./types.ts (the pure client-safe outlet) because
 * these declarations pull dsh-agent, dsh-llm, and cordis into the program —
 * the one-program-per-side layout forbids that on client aggregates.
 * @module @deepseek-ai/dsh-goal
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GoalId, GoalRef, GoalSnapshot, GoalSnapshotV1, GoalView } from './types.ts'

/** Goal state-changing verbs recorded in the durable source change. */
export type GoalOperation =
  | 'create'
  | 'edit'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'block'
  | 'clear'

/** Full-snapshot goal mutation retained from released `goal/change` version 1. */
export interface GoalSnapshotChangeV1 {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshotV1
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** Full-snapshot goal mutation with current task-manifest support. */
export interface GoalSnapshotChangeV2 {
  readonly kind: 'goal/change'
  readonly version: 2
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** Full-snapshot mutation accepted by current readers. */
export type GoalSnapshotChangeMeta = GoalSnapshotChangeV1 | GoalSnapshotChangeV2

/** Tombstone retained from released `goal/change` version 1. */
export interface GoalClearChangeV1 {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}

/** Current clear tombstone version. */
export interface GoalClearChangeV2 {
  readonly kind: 'goal/change'
  readonly version: 2
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}

/** Clear tombstone accepted by current readers. */
export type GoalClearChangeMeta = GoalClearChangeV1 | GoalClearChangeV2

/** Durable change union carried by the goal domain's own session event. */
export type GoalChangeMeta = GoalSnapshotChangeMeta | GoalClearChangeMeta

/** Message attribution for admitted continuation rounds. */
export interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    goal: GoalMessageSource
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Complete post-mutation goal state or clear tombstone.
     */
    'goal/change': GoalChangeMeta
  }
}

/** Pure replay fold of durable goal facts. */
export interface FoldedGoal {
  /** Current goal, absent after a clear or before the first create. */
  readonly goal?: GoalSnapshot
  /** Highest admitted round for the current goal. */
  readonly roundsStarted: number
  /** Current goal creation time, absent without a current goal. */
  readonly createdAt?: number
  /** Current goal mutation time, absent without a current goal. */
  readonly updatedAt?: number
  /** Latest mutation ref, including a clear tombstone. */
  readonly lastRef?: GoalRef
}

/** Live notification after one durable goal mutation commits. */
export interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}

/** Stable error codes for rejected goal reads and mutations. */
export type GoalErrorCode =
  | 'GOAL_AGENT_NOT_LIVE'
  | 'GOAL_NOT_FOUND'
  | 'GOAL_ALREADY_EXISTS'
  | 'GOAL_STALE_REVISION'
  | 'GOAL_INVALID_OBJECTIVE'
  | 'GOAL_INVALID_MAX_ROUNDS'
  | 'GOAL_INVALID_BLOCK_REASON'
  | 'GOAL_INVALID_EDIT'
  | 'GOAL_INVALID_TRANSITION'
  | 'GOAL_INVALID_TASK_MANIFEST'
  | 'GOAL_TASK_NOT_FOUND'
  | 'GOAL_TASKS_INCOMPLETE'
  | 'GOAL_HUMAN_AUTHORITY_REQUIRED'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Goal mutation accepted by one live agent. The matching `goal/change`
     * session event has already committed. Listener failures are contained.
     * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
     * @param payload.agent - agent whose session owns the goal.
     * @param payload.change - fresh current projection or clear tombstone.
     * @mode emit
     */
    'goal/changed'(this: import('@deepseek-ai/dsh-scope').Scoped<Agent>, payload: { agent: Agent; change: GoalChanged }): void
  }
}
