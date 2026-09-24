/** Package-owned permission-preset event invariants. @module @deepseek-ai/dsh-permission-presets/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { AUTO_PRESET } from './index.ts'
import { installPresetHistoryLease } from './preset-history.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-permission-presets'

/** Cordis companion plugin name. */
export const name = 'permission-presets-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Validate every preset identity retained by the exact Session fold. */
function validateHistory(ctx: Context, presets: ReadonlySet<string>, fail: InvariantFailure): void {
  for (const preset of presets) validatePreset(ctx, preset, fail)
}

/** Validate one configured or currently admitted Auto preset name. */
function validatePreset(ctx: Context, preset: string, fail: InvariantFailure): void {
  if (preset !== AUTO_PRESET && !ctx.permissionPresets.names.includes(preset)) {
    fail(`permission/preset names unknown preset ${JSON.stringify(preset)}`)
  }
  if (preset === AUTO_PRESET && !ctx.permissionPresets.names.includes(preset)) {
    fail(`permission/preset names unavailable preset ${JSON.stringify(preset)}`)
  }
}

/** Install validation that loaded and newly appended preset events remain resolvable. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const lease = installPresetHistoryLease(ctx, fail)
  for (const session of ctx.sessions.list()) {
    validateHistory(ctx, lease.readCurrent(session).observedPresets, fail)
  }
  ctx.on('session/created', (session) => {
    validateHistory(ctx, lease.readCurrent(session).observedPresets, fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    lease.readPrefix(session, event.seq - 1)
    if (event.type === 'permission/preset') validatePreset(ctx, event.data.preset, fail)
  }, { global: true })
}, { inject: ['permissionPresets', 'sessions'] })

/**
 * Register the permission invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
