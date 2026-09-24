/** Package-owned durable clock-context invariants. @module @deepseek-ai/dsh-time-context/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionCreationBaseline, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import {
  foldTimeContextEvents,
  isTimeContextReading,
  timeContextReadingFailure,
} from './projection.ts'
import type { TimeContextProjection } from './projection.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-time-context'

/** Cordis companion plugin name. */
export const name = 'time-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Read an exact live fold or reject a missing time-context capability. */
function projectionOf(ctx: Context, session: Session, fail: InvariantFailure): TimeContextProjection {
  const state = ctx.sessionProjections.stateOf(session, 'timeContext')
  if (state === undefined) fail('time-context invariant requires the timeContext session projection')
  return state
}

/** Reject the first invalid time-context reading folded from the complete event cut. */
function checkFailure(state: TimeContextProjection, fail: InvariantFailure): void {
  if (state.firstValidationFailure !== null) fail(state.firstValidationFailure)
}

/** Confirm the state provider's event fold at a Session creation cut. */
function validateCreationBaseline(
  ctx: Context,
  session: Session,
  baseline: SessionCreationBaseline,
  fail: InvariantFailure,
): void {
  projectionOf(ctx, session, fail)
  checkFailure(foldTimeContextEvents(baseline.events), fail)
}

/** Install validation for existing sessions, unpublished creation cuts, and new appends. */
function installChecks(ctx: Context, fail: InvariantFailure): void {
  for (const session of ctx.sessions.list()) {
    checkFailure(projectionOf(ctx, session, fail), fail)
  }
  ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    validateCreationBaseline(ctx, session, baseline, fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (!isTimeContextReading(event)) return
    const state = projectionOf(ctx, session, fail)
    const failure = timeContextReadingFailure(state, event)
    if (failure !== undefined) fail(failure)
  }, { global: true })
}

/** Defer check installation until its optional runtime services can be observed together. */
const installDeferred: InvariantInstaller = (ctx: Context, fail: InvariantFailure) => {
  ctx.inject(['sessions', 'sessionProjections'], (readyCtx) => {
    installChecks(readyCtx, fail)
  })
}

/** Join immediate setup when both services already exist. */
const installReady: InvariantInstaller = Object.assign(installChecks, {
  inject: ['sessions', 'sessionProjections'],
})

/**
 * Register the time-context invariant companion.
 * @param ctx - Cordis context carrying the invariant and projection services.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> => {
  const servicesReady = ctx.get('sessions') !== undefined
    && ctx.get('sessionProjections') !== undefined
  return Promise.resolve(ctx.invariants.register(
    PACKAGE_NAME,
    servicesReady ? installReady : installDeferred,
  ))
}
