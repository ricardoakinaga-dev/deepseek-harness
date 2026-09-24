/** Package-private exact Session fold for approval reads and audit checks. */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionCreationBaseline, SessionEvent } from '@deepseek-ai/dsh-session'
import type { ApprovalPolicy } from './index.ts'
import type { ApprovalOutcome, ApprovalRequestId } from './types.ts'

/** Failure reporter bound to the lease that owns the failed read. */
export type ApprovalStateFailure = (message: string) => never

/** Current facts retained from the exact committed approval-event prefix. */
export interface ApprovalSessionSnapshot {
  /** Last contiguous event sequence observed, or `-1` for an empty log. */
  readonly lastSeq: number
  /** Current turn id, or `null` when no turn is open. */
  readonly openTurn: number | null
  /** Latest committed policy override, when present. */
  readonly latestPolicy: ApprovalPolicy | undefined
  /** Approval ids whose ask has no matching decision yet. */
  readonly pendingIds: ReadonlySet<ApprovalRequestId>
  /** First semantic or prefix failure latched by this fold. */
  readonly failure: string | undefined
}

/** One provider or invariant fiber's lease over package-owned Session folds. */
export interface ApprovalSessionLease {
  /** Read the exact current prefix or fail closed. */
  readCurrent(session: Session): ApprovalSessionSnapshot
  /** Require an exact candidate prefix and validate its approval fields. */
  validateCandidate(session: Session, event: SessionEvent): void
}

interface Entry {
  lastSeq: number
  openTurn: number | null
  latestPolicy: ApprovalPolicy | undefined
  pendingIds: Set<ApprovalRequestId>
  failure: string | undefined
  readonly leases: Set<Lease>
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

const registryKey = Symbol.for('@deepseek-ai/dsh-user-approval/session-state')
const APPROVAL_OUTCOMES: readonly ApprovalOutcome[] = ['allowed-once', 'rejected', 'cancelled', 'unavailable']
const APPROVAL_POLICIES: readonly string[] = ['ask', 'never']

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
 * @param fail Report an unavailable state read and throw.
 * @returns The lease used to read and validate exact approval state.
 */
export function installApprovalSessionLease(
  ctx: Context,
  fail: ApprovalStateFailure,
): ApprovalSessionLease {
  const { entries } = registryFor(ctx)
  const lease: Lease = { sessions: new Set() }
  let disposed = false

  const latch = (entry: Entry, reason: string): void => {
    entry.failure ??= reason
  }

  const attach = (session: Session, entry: Entry): void => {
    if (entry.failure !== undefined) fail(`session "${session.id}" approval state is unavailable: ${entry.failure}`)
    if (entry.lastSeq !== session.seq - 1) {
      const reason = `fold ends at seq ${entry.lastSeq}, current log ends at seq ${session.seq - 1}`
      latch(entry, reason)
      fail(`session "${session.id}" approval state is unavailable: ${reason}`)
    }
    entry.leases.add(lease)
    lease.sessions.add(session)
  }

  const seed = (session: Session, baseline: SessionCreationBaseline): Entry => {
    const entry: Entry = {
      lastSeq: -1,
      openTurn: null,
      latestPolicy: undefined,
      pendingIds: new Set(),
      failure: undefined,
      leases: new Set(),
    }
    entries.set(session, entry)
    if (baseline.events.length !== session.seq) {
      latch(entry, `creation baseline ends at ${baseline.events.length}, current log ends at seq ${session.seq - 1}`)
    }
    for (let index = 0; index < baseline.events.length; index += 1) {
      const event = baseline.events[index]
      if (event === undefined) continue
      if (event.seq !== index) latch(entry, `creation baseline skips seq ${index}`)
      foldEvent(entry, event)
      entry.lastSeq = event.seq
    }
    return entry
  }

  const onCreatedListener = ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    let entry = entries.get(session)
    if (entry === undefined) entry = seed(session, baseline)
    attach(session, entry)
  }, { global: true })

  const onEventListener = ctx.on('session/event', (session, event) => {
    let entry = entries.get(session)
    if (entry === undefined) {
      entry = {
        lastSeq: -1,
        openTurn: null,
        latestPolicy: undefined,
        pendingIds: new Set(),
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
    foldEvent(entry, event)
    entry.lastSeq = event.seq
  }, { global: true })

  const onDisposedListener = ctx.on('session/disposed', (session) => {
    const entry = entries.get(session)
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
      const entry = entries.get(session)
      if (entry === undefined) continue
      entry.leases.delete(lease)
      if (entry.leases.size === 0) entries.delete(session)
    }
    lease.sessions.clear()
  }

  ctx.effect(() => dispose, 'approval.sessionState')
  try {
    for (const session of ctx.sessions.list()) {
      const entry = entries.get(session)
      if (entry === undefined) {
        if (session.seq !== 0) {
          const missing = `eventful Session has no exact approval state fold (seq ${session.seq - 1})`
          const failed: Entry = {
            lastSeq: -1,
            openTurn: null,
            latestPolicy: undefined,
            pendingIds: new Set(),
            failure: missing,
            leases: new Set([lease]),
          }
          entries.set(session, failed)
          lease.sessions.add(session)
          fail(`session "${session.id}" approval state is unavailable: ${missing}`)
        }
        const empty: Entry = {
          lastSeq: -1,
          openTurn: null,
          latestPolicy: undefined,
          pendingIds: new Set(),
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
      if (disposed) fail('approval state lease has been released')
      const entry = entries.get(session)
      if (entry === undefined) {
        fail(`session "${session.id}" has no approval state fold attached`)
      }
      attach(session, entry)
      return snapshot(entry)
    },
    validateCandidate(session, event) {
      if (disposed) fail('approval state lease has been released')
      const entry = entries.get(session)
      if (entry === undefined) {
        fail(`session "${session.id}" has no approval state fold attached`)
      }
      if (entry.failure !== undefined) {
        fail(`session "${session.id}" approval state is unavailable: ${entry.failure}`)
      }
      if (entry.lastSeq !== event.seq - 1 || Number(session.seq) !== Number(event.seq)) {
        fail(`session "${session.id}" approval state does not end at the candidate prefix seq ${event.seq - 1}`)
      }
      const invalid = invalidEvent(entry, event)
      if (invalid !== undefined) fail(invalid)
    },
  }
}

/** Validate the approval event against committed state without changing it. */
function invalidEvent(entry: Entry, event: SessionEvent): string | undefined {
  if (event.type === 'approval/asked') {
    if (entry.openTurn === null) return 'approval/asked appended outside any open turn'
    if (event.data.toolName.length === 0) return 'approval/asked toolName must be non-empty'
    if (entry.pendingIds.has(event.data.id)) {
      return `approval/asked repeated open id ${JSON.stringify(event.data.id)}`
    }
    return undefined
  }
  if (event.type === 'approval/decided') {
    if (entry.openTurn === null) return 'approval/decided appended outside any open turn'
    if (!entry.pendingIds.has(event.data.id)) {
      return `approval/decided has no matching approval/asked for id ${JSON.stringify(event.data.id)}`
    }
    if (!APPROVAL_OUTCOMES.includes(event.data.outcome)) {
      return `approval/decided carries unknown outcome ${JSON.stringify(event.data.outcome)}`
    }
    return undefined
  }
  if (event.type === 'approval/policy' && !APPROVAL_POLICIES.includes(event.data.policy)) {
    return `approval/policy carries unknown policy ${JSON.stringify(event.data.policy)}`
  }
  return undefined
}

/** Fold one semantically valid committed event; retain the first failure otherwise. */
function foldEvent(entry: Entry, event: SessionEvent): void {
  const invalid = invalidEvent(entry, event)
  if (invalid !== undefined) {
    latchFailure(entry, invalid)
    return
  }
  if (event.type === 'turn/start') {
    entry.openTurn = event.data.turn
  } else if (event.type === 'turn/end') {
    entry.openTurn = null
  } else if (event.type === 'approval/asked') {
    entry.pendingIds.add(event.data.id)
  } else if (event.type === 'approval/decided') {
    entry.pendingIds.delete(event.data.id)
  } else if (event.type === 'approval/policy') {
    entry.latestPolicy = event.data.policy
  }
}

/** Latch only the first durable failure. */
function latchFailure(entry: Entry, reason: string): void {
  entry.failure ??= reason
}

/** Expose current values without copying the pending-id set. */
function snapshot(entry: Entry): ApprovalSessionSnapshot {
  return {
    lastSeq: entry.lastSeq,
    openTurn: entry.openTurn,
    latestPolicy: entry.latestPolicy,
    pendingIds: entry.pendingIds,
    failure: entry.failure,
  }
}
