/**
 * Package-private command lifecycle fold shared by every bundled entrypoint.
 * @module @deepseek-ai/dsh-commands/audit-state
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionCreationBaseline, SessionEvent, SessionSeqCursor } from '@deepseek-ai/dsh-session'

/** Folded command lifecycle state for one exact Session. */
export interface CommandAuditEntry {
  /** Every command id whose run has appeared, including completed runs. */
  readonly runIds: Set<string>
  /** Sequence numbers occupied by command lifecycle events. */
  readonly commandEventSeqs: Set<number>
  /** Active provider fibers that observe this Session. */
  readonly leases: Set<CommandAuditLease>
  /** Last contiguous event consumed, or `-1` before the first event. */
  lastSeq: SessionSeqCursor
  /** First missing-prefix or lifecycle failure observed for this Session. */
  failure: string | undefined
}

/** One concrete CommandRuntime provider's ownership of observed Sessions. */
interface CommandAuditLease {
  readonly sessions: Set<Session>
}

interface SharedCommandAuditRegistry {
  readonly entries: WeakMap<Session, CommandAuditEntry>
}

interface RegistryHost {
  [key: symbol]: unknown
}

const REGISTRY_KEY = Symbol.for('@deepseek-ai/dsh-commands/command-audit-state')

/** Retrieve the Cordis-root registry shared by separately bundled entrypoints. */
function sharedRegistry(ctx: Context): SharedCommandAuditRegistry {
  const root = ctx.root as unknown as RegistryHost
  const current = root[REGISTRY_KEY]
  if (current !== undefined) return current as SharedCommandAuditRegistry

  const created: SharedCommandAuditRegistry = { entries: new WeakMap() }
  root[REGISTRY_KEY] = created
  return created
}

/**
 * Return the current folded state for one exact Session object.
 * @param ctx - Cordis context whose root owns the fold registry.
 * @param session - exact live Session object.
 * @returns its shared command audit fold, if a provider currently owns one.
 */
export function commandAuditEntry(ctx: Context, session: Session): CommandAuditEntry | undefined {
  return sharedRegistry(ctx).entries.get(session)
}

/** Return a fresh empty-prefix fold. */
function createEntry(): CommandAuditEntry {
  return {
    runIds: new Set(),
    commandEventSeqs: new Set(),
    leases: new Set(),
    lastSeq: -1,
    failure: undefined,
  }
}

/** Record the first failure without replacing its original cause. */
function latchFailure(entry: CommandAuditEntry, reason: string): void {
  entry.failure ??= reason
}

/** Describe a Session gap that prevents exact command-state reconstruction. */
function missingPrefix(session: Session, expectedSeq: number, receivedSeq: number): string {
  return `command audit for session ${JSON.stringify(session.id)} expected event seq ${expectedSeq} but received ${receivedSeq}`
}

/** Return the lifecycle violation for one candidate against the committed prefix. */
function lifecycleIssue(entry: CommandAuditEntry, event: SessionEvent): string | undefined {
  if (event.type === 'command/run') {
    if (entry.runIds.has(event.data.commandId)) {
      return `command/run repeats commandId ${JSON.stringify(event.data.commandId)}`
    }
    return undefined
  }
  if (event.type !== 'command/done') return undefined
  if (!entry.runIds.has(event.data.commandId)) {
    return `command/done ${JSON.stringify(event.data.commandId)} pairs no prior command/run in this log`
  }

  const source = event.data.sourceEventSeq
  if (source !== undefined
    && (event.data.kind !== 'success'
      || !Number.isSafeInteger(source)
      || source < 0
      || Object.is(source, -0)
      || source >= event.seq
      || entry.commandEventSeqs.has(source))) {
    return `command/done ${JSON.stringify(event.data.commandId)} has invalid sourceEventSeq ${String(source)}`
  }
  return undefined
}

/** Advance the fold after one event has entered the Session log. */
function observeCommittedEvent(session: Session, entry: CommandAuditEntry, event: SessionEvent): void {
  if (event.seq <= entry.lastSeq) return

  const expectedSeq = entry.lastSeq + 1
  if (event.seq !== expectedSeq) {
    latchFailure(entry, missingPrefix(session, expectedSeq, event.seq))
    return
  }

  const issue = lifecycleIssue(entry, event)
  if (issue !== undefined) latchFailure(entry, issue)

  if (event.type === 'command/run') entry.runIds.add(event.data.commandId)
  if (event.type === 'command/run' || event.type === 'command/done') {
    entry.commandEventSeqs.add(event.seq)
  }
  entry.lastSeq = event.seq
}

/** Attach one provider lease to a shared Session fold. */
function attachLease(session: Session, entry: CommandAuditEntry, lease: CommandAuditLease): void {
  entry.leases.add(lease)
  lease.sessions.add(session)
}

/** Remove one Session fold from every provider lease after Session disposal. */
function clearSession(registry: SharedCommandAuditRegistry, session: Session): void {
  const entry = registry.entries.get(session)
  if (entry === undefined) return
  registry.entries.delete(session)
  for (const lease of entry.leases) lease.sessions.delete(session)
  entry.leases.clear()
}

/** Release one provider lease while retaining folds observed by sibling providers. */
function releaseLease(registry: SharedCommandAuditRegistry, lease: CommandAuditLease): void {
  for (const session of lease.sessions) {
    const entry = registry.entries.get(session)
    if (entry === undefined) continue
    entry.leases.delete(lease)
    if (entry.leases.size === 0) registry.entries.delete(session)
  }
  lease.sessions.clear()
}

/**
 * Acquire one provider-fiber lease and observe exact Session prefixes.
 * Listeners are installed before current Sessions are reconciled. An eventful
 * Session without a live fold fails closed; only a live empty Session can be
 * seeded without its creation baseline.
 * @param ctx - the CommandRuntime provider context.
 * @returns nothing after registering the provider's listener lease.
 */
export function installCommandAuditLease(ctx: Context): void {
  const registry = sharedRegistry(ctx)
  const lease: CommandAuditLease = { sessions: new Set() }
  let released = false
  const offCreated = ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    const existing = registry.entries.get(session)
    if (existing !== undefined) {
      attachLease(session, existing, lease)
      if (existing.failure !== undefined) return
      if (existing.lastSeq !== session.seq - 1) {
        latchFailure(existing, missingPrefix(session, existing.lastSeq + 1, session.seq))
      }
      return
    }

    const entry = createEntry()
    registry.entries.set(session, entry)
    attachLease(session, entry, lease)
    if (session.seq !== baseline.events.length) {
      latchFailure(entry, missingPrefix(session, baseline.events.length, session.seq))
      return
    }
    for (const event of baseline.events) observeCommittedEvent(session, entry, event)
    if (entry.lastSeq !== session.seq - 1) {
      latchFailure(entry, missingPrefix(session, entry.lastSeq + 1, session.seq))
    }
  }, { global: true })

  const offEvent = ctx.on('session/event', (session, event) => {
    let entry = registry.entries.get(session)
    if (entry === undefined) {
      entry = createEntry()
      registry.entries.set(session, entry)
      attachLease(session, entry, lease)
      latchFailure(entry, missingPrefix(session, 0, event.seq))
      return
    }
    if (!lease.sessions.has(session)) attachLease(session, entry, lease)
    observeCommittedEvent(session, entry, event)
  }, { global: true })

  const offDisposed = ctx.on('session/disposed', (session) => {
    clearSession(registry, session)
    lease.sessions.delete(session)
  }, { global: true })

  const dispose = (): void => {
    if (released) return
    released = true
    offCreated()
    offEvent()
    offDisposed()
    releaseLease(registry, lease)
  }
  ctx.effect(() => dispose, 'command audit lease')

  try {
    for (const session of ctx.sessions.list()) {
      let entry = registry.entries.get(session)
      if (entry === undefined) {
        if (session.seq !== 0) {
          entry = createEntry()
          latchFailure(entry, `eventful Session has no exact command audit fold (seq ${session.seq - 1})`)
          registry.entries.set(session, entry)
          attachLease(session, entry, lease)
          throw new Error(`commands: cannot activate with eventful session ${JSON.stringify(session.id)} and no exact command audit fold`)
        }
        entry = createEntry()
        registry.entries.set(session, entry)
      }
      if (entry.failure !== undefined) {
        throw new Error(`commands: cannot activate with invalid command audit state for session ${JSON.stringify(session.id)}: ${entry.failure}`)
      }
      if (entry.lastSeq !== session.seq - 1) {
        throw new Error(`commands: cannot activate with a missing command audit prefix for session ${JSON.stringify(session.id)}`)
      }
      attachLease(session, entry, lease)
    }
  } catch (error: unknown) {
    dispose()
    throw error
  }
}

/**
 * Require a current exact fold, attributing failures to the command invariant owner.
 * @param ctx - Cordis context whose root owns the fold registry.
 * @param session - exact Session whose committed prefix is checked.
 * @param fail - package-attributed invariant failure reporter.
 * @returns the healthy fold at the current Session cursor.
 */
export function requireCommandAuditEntry(
  ctx: Context,
  session: Session,
  fail: (message: string) => never,
): CommandAuditEntry {
  const entry = sharedRegistry(ctx).entries.get(session)
  if (entry === undefined) {
    return fail(`session ${JSON.stringify(session.id)} has no command audit fold for its event prefix`)
  }
  if (entry.failure !== undefined) return fail(entry.failure)
  if (entry.lastSeq !== session.seq - 1) {
    const reason = missingPrefix(session, entry.lastSeq + 1, session.seq)
    latchFailure(entry, reason)
    return fail(reason)
  }
  return entry
}

/**
 * Validate a precommit candidate without changing the shared fold.
 * @param ctx - Cordis context whose root owns the fold registry.
 * @param session - exact Session receiving the candidate.
 * @param event - event whose sequence follows the current fold cursor.
 * @param fail - package-attributed invariant failure reporter.
 * @returns nothing when the candidate preserves command lifecycle rules.
 */
export function validateCommandAuditCandidate(
  ctx: Context,
  session: Session,
  event: SessionEvent,
  fail: (message: string) => never,
): void {
  const entry = sharedRegistry(ctx).entries.get(session)
  if (entry === undefined) fail(`session ${JSON.stringify(session.id)} has no command audit fold for its event prefix`)
  if (entry.failure !== undefined) fail(entry.failure)
  if (entry.lastSeq !== event.seq - 1 || Number(session.seq) !== Number(event.seq)) {
    fail(missingPrefix(session, entry.lastSeq + 1, event.seq))
  }
  const issue = lifecycleIssue(entry, event)
  if (issue !== undefined) fail(issue)
}
