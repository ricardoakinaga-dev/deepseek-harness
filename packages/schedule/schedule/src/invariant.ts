/**
 * Package-owned strict Schedule stream invariant.
 * @module @deepseek-ai/dsh-schedule/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionCreationBaseline, SessionEvent, SessionPreparation } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
// Type-only: resolves the required SessionProjectionRegistry service.
import type {} from '@deepseek-ai/dsh-session-projection'
import { ScheduleLogError } from './domain.ts'
import { scheduleProjectionDefinition } from './projection.ts'
import type { ScheduleProjectionState } from './projection.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-schedule'

/** Cordis invariant-companion plugin name. */
export const name = 'schedule-invariant'
/** Service required before reserving this package's invariant ownership. */
export const inject = ['invariants']

/** Read the current exact Schedule state or reject the missing host capability. */
function projectionOf(
  ctx: Context,
  session: Session,
  fail: InvariantFailure,
): ScheduleProjectionState {
  try {
    const state = ctx.sessionProjections.stateOf(session, 'schedule')
    if (state === undefined) fail('schedule invariant requires the schedule session projection')
    return state
  } catch (error: unknown) {
    if (error instanceof ScheduleLogError) fail(error.message)
    throw error
  }
}

/** Reject one invalid transition against the current projection state. */
function validateCandidate(
  state: ScheduleProjectionState,
  event: SessionEvent,
  fail: InvariantFailure,
): void {
  try {
    scheduleProjectionDefinition.stateSchema.parse(scheduleProjectionDefinition.apply(state, event))
  } catch (error: unknown) {
    /*! v8 ignore next -- foldScheduleEvents normalizes every rejected stream to ScheduleLogError. */
    if (!(error instanceof ScheduleLogError)) throw error
    fail(error.message)
  }
}

/** Validate the exact creation cut before the registry publishes its cells. */
function validateCreationBaseline(
  session: Session,
  baseline: SessionCreationBaseline,
  fail: InvariantFailure,
): ScheduleProjectionState {
  let state: ScheduleProjectionState = scheduleProjectionDefinition.init(
    session.header,
    session.inheritedEventCount,
  )
  for (const event of baseline.events) {
    try {
      state = scheduleProjectionDefinition.stateSchema.parse(
        scheduleProjectionDefinition.apply(state, event),
      )
    } catch (error: unknown) {
      if (error instanceof ScheduleLogError) fail(error.message)
      throw error
    }
  }
  return state
}

/** Validate a prepared constructor cut and each setup append before acceptance. */
function validatePreparation(
  preparation: SessionPreparation,
  fail: InvariantFailure,
): void {
  let state = validateCreationBaseline(preparation.session, preparation.baseline, fail)
  preparation.subscribeAppends((event) => {
    let next: ScheduleProjectionState
    try {
      next = scheduleProjectionDefinition.stateSchema.parse(
        scheduleProjectionDefinition.apply(state, event),
      )
    } catch (error: unknown) {
      if (error instanceof ScheduleLogError) fail(error.message)
      throw error
    }
    return () => {
      state = next
    }
  })
}

/* jscpd:ignore-start -- package companions share projection and append plumbing */
/** Install replay and pre-append validation for the owned event stream. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.effect(() => ctx.sessionProjections.register(scheduleProjectionDefinition))
  for (const session of ctx.sessions.list()) projectionOf(ctx, session, fail)

  ctx.effect(() => ctx.sessionProjections.onBeforePrepareSession((preparation) => {
    validatePreparation(preparation, fail)
  }))

  ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    validateCreationBaseline(session, baseline, fail)
  }, { global: true, prepend: true })
  ctx.on('session/created', (session) => {
    projectionOf(ctx, session, fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (event.type !== 'schedule/change') return
    validateCandidate(projectionOf(ctx, session, fail), event, fail)
  }, { global: true, prepend: true })
}, { inject: ['sessions', 'sessionProjections'] })
/* jscpd:ignore-end */

/**
 * Register the package-owned invariant companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns Exact registration disposer after child setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
