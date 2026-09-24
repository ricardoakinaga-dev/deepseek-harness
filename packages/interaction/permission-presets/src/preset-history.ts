/** Package-private exact Session fold for historical preset names. */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionCreationBaseline, SessionEvent } from '@deepseek-ai/dsh-session'

/** Failure reporter bound to the lease that owns the failed read. */
export type PresetHistoryFailure = (message: string) => never

/** Readonly facts retained from the exact committed Session prefix. */
export interface PresetHistorySnapshot {
  /** Last contiguous event sequence observed, or `-1` for an empty log. */
  readonly lastSeq: number
  /** Every distinct preset name recorded in the prefix. */
  readonly observedPresets: ReadonlySet<string>
  /** First missing-prefix or sequence failure latched by this fold. */
  readonly failure: string | undefined
}

/** One provider or invariant fiber's lease over package-owned Session folds. */
export interface PresetHistoryLease {
  /** Read the exact current prefix or fail closed. */
  readCurrent(session: Session): PresetHistorySnapshot
  /** Require an exact candidate prefix before synchronous validation. */
  readPrefix(session: Session, lastSeq: number): PresetHistorySnapshot
}

interface Entry {
  observedPresets: Set<string>
  leases: Set<Lease>
  failure: string | undefined
  lastSeq: number
}

interface Lease {
  readonly sessions: Set<Session>
}

interface Registry {
  readonly entries: WeakMap<Session, Entry>
}

interface RegistryHost {
  [key: symbol]: unknown
}

const registryKey = Symbol.for('@deepseek-ai/dsh-permission-presets/preset-history')

/** Provider and companion entrypoints are bundled separately, so store their fold in the Cordis root. */
function registryFor(ctx: Context): Registry {
  const root = ctx.root as unknown as RegistryHost
  let registry = root[registryKey]
  if (registry === undefined) {
    registry = { entries: new WeakMap<Session, Entry>() } satisfies Registry
    root[registryKey] = registry
  }
  return registry as Registry
}

/** Install one ref-counted lifecycle lease and reconcile already-published Sessions.
 * @param ctx Cordis context whose root owns the shared Session folds.
 * @param fail Report an unavailable history read and throw.
 * @param onCreated Pin provider state after the creation baseline is attached.
 * @returns The lease used to read exact committed prefixes.
 */
export function installPresetHistoryLease(
  ctx: Context,
  fail: PresetHistoryFailure,
  onCreated?: (session: Session) => void,
): PresetHistoryLease {
  const { entries } = registryFor(ctx)
  const lease: Lease = { sessions: new Set() }
  let disposed = false

  const latch = (entry: Entry, reason: string): void => {
    entry.failure ??= reason
  }

  const entryFor = (session: Session): Entry | undefined => entries.get(session)

  const attach = (session: Session, entry: Entry): void => {
    if (entry.failure !== undefined) fail(`session "${session.id}" preset history is unavailable: ${entry.failure}`)
    if (entry.lastSeq !== session.seq - 1) {
      const reason = `fold ends at seq ${entry.lastSeq}, current log ends at seq ${session.seq - 1}`
      latch(entry, reason)
      fail(`session "${session.id}" preset history is unavailable: ${reason}`)
    }
    entry.leases.add(lease)
    lease.sessions.add(session)
  }

  const seed = (session: Session, baseline: SessionCreationBaseline): Entry => {
    const entry: Entry = {
      lastSeq: -1,
      observedPresets: new Set(),
      failure: undefined,
      leases: new Set(),
    }
    entries.set(session, entry)
    if (baseline.events.length !== session.seq) {
      latch(entry, `creation baseline ends at ${baseline.events.length}, current log ends at ${session.seq - 1}`)
    }
    for (let index = 0; index < baseline.events.length; index += 1) {
      const event = baseline.events[index]
      if (event === undefined) continue
      if (event.seq !== index) latch(entry, `creation baseline skips seq ${index}`)
      recordPreset(entry, event)
      entry.lastSeq = event.seq
    }
    return entry
  }

  const onCreatedListener = ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    let entry = entryFor(session)
    if (entry === undefined) {
      entry = seed(session, baseline)
    }
    attach(session, entry)
    onCreated?.(session)
  }, { global: true })

  const onEventListener = ctx.on('session/event', (session, event) => {
    let entry = entryFor(session)
    if (entry === undefined) {
      entry = {
        lastSeq: -1,
        observedPresets: new Set(),
        failure: 'session/event arrived before a valid creation baseline',
        leases: new Set(),
      }
      entries.set(session, entry)
    }
    entry.leases.add(lease)
    lease.sessions.add(session)
    if (event.seq <= entry.lastSeq) return
    if (event.seq !== entry.lastSeq + 1) {
      latch(entry, `session/event skipped from seq ${entry.lastSeq} to ${event.seq}`)
      return
    }
    recordPreset(entry, event)
    entry.lastSeq = event.seq
  }, { global: true })

  const onDisposedListener = ctx.on('session/disposed', (session) => {
    const entry = entryFor(session)
    if (entry === undefined) return
    entries.delete(session)
    for (const observer of entry.leases) observer.sessions.delete(session)
    entry.leases.clear()
  }, { global: true })

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    onCreatedListener()
    onEventListener()
    onDisposedListener()
    for (const session of lease.sessions) {
      const entry = entryFor(session)
      if (entry === undefined) continue
      entry.leases.delete(lease)
      if (entry.leases.size === 0) entries.delete(session)
    }
    lease.sessions.clear()
  }

  ctx.effect(() => dispose, 'permissionPresets.presetHistory')
  try {
    for (const session of ctx.sessions.list()) {
      const entry = entryFor(session)
      if (entry === undefined) {
        if (session.seq !== 0) {
          const missing = `eventful Session has no exact preset history fold (seq ${session.seq - 1})`
          const failed: Entry = {
            lastSeq: -1,
            observedPresets: new Set(),
            failure: missing,
            leases: new Set([lease]),
          }
          entries.set(session, failed)
          lease.sessions.add(session)
          fail(`session "${session.id}" preset history is unavailable: ${missing}`)
        }
        const empty: Entry = {
          lastSeq: -1,
          observedPresets: new Set(),
          failure: undefined,
          leases: new Set([lease]),
        }
        entries.set(session, empty)
        lease.sessions.add(session)
      } else {
        attach(session, entry)
      }
    }
  } catch (error: unknown) {
    dispose()
    throw error
  }

  return {
    readCurrent(session) {
      if (disposed) fail('preset history lease has been released')
      const entry = entryFor(session)
      if (entry === undefined) {
        fail(`session "${session.id}" has no preset history fold`)
      }
      attach(session, entry)
      return snapshot(entry)
    },
    readPrefix(session, lastSeq) {
      if (disposed) fail('preset history lease has been released')
      const entry = entryFor(session)
      if (entry === undefined) {
        fail(`session "${session.id}" has no preset history fold`)
      }
      if (entry.failure !== undefined) {
        fail(`session "${session.id}" preset history is unavailable: ${entry.failure}`)
      }
      if (entry.lastSeq !== lastSeq || session.seq - 1 !== lastSeq) {
        const reason = `fold ends at seq ${entry.lastSeq}, expected seq ${lastSeq}`
        fail(`session "${session.id}" preset history is unavailable: ${reason}`)
      }
      return snapshot(entry)
    },
  }
}

/** Add one preset identity without retaining any other event payload. */
function recordPreset(entry: Entry, event: SessionEvent): void {
  if (event.type === 'permission/preset') entry.observedPresets.add(event.data.preset)
}

/** Expose the exact cursor and names without exposing lease bookkeeping. */
function snapshot(entry: Entry): PresetHistorySnapshot {
  return {
    lastSeq: entry.lastSeq,
    observedPresets: entry.observedPresets,
    failure: entry.failure,
  }
}
