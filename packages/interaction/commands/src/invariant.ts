/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-commands`:
 * command lifecycle events pair by commandId within one session log.
 * @module @deepseek-ai/dsh-commands/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { commandAuditEntry, requireCommandAuditEntry, validateCommandAuditCandidate } from './audit-state.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-commands'

/** Cordis companion plugin name. */
export const name = 'commands-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Install precommit command lifecycle checks over owner-maintained folds. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const requireTrackedPrefix = (session: Session): void => {
    if (commandAuditEntry(ctx, session) === undefined && session.seq === 0) return
    requireCommandAuditEntry(ctx, session, fail)
  }

  ctx.on('session/created', (session) => {
    requireTrackedPrefix(session)
  }, { global: true })

  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    validateCommandAuditCandidate(ctx, session, event, fail)
  }, { global: true })

  for (const session of ctx.sessions.list()) requireTrackedPrefix(session)
}, { inject: ['sessions'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
