/** Package-owned approval audit-stream invariants. @module @deepseek-ai/dsh-user-approval/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { installApprovalSessionLease } from './session-state.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-user-approval'
/** Cordis companion plugin name. */
export const name = 'user-approval-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Require an exact owner fold before synchronous approval reads or appends. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const lease = installApprovalSessionLease(ctx, fail)
  for (const session of ctx.sessions.list()) lease.readCurrent(session)
  ctx.on('session/created', (session) => { lease.readCurrent(session) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    lease.validateCandidate(session, event)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register the approval invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
