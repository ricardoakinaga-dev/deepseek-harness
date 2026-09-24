/**
 * Ownership of one unpublished Session before registry publication.
 * @module @deepseek-ai/dsh-session/preparation
 */

import type { Session } from './index.ts'
import type { SessionCreationBaseline, SessionEvent } from './types.ts'

/** Options for a preparation whose provider retains unpublished state. */
export interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}

type AppendPreparation = (event: SessionEvent) => () => void

interface PreparationState {
  readonly baseline: SessionCreationBaseline
  readonly options: SessionPreparationOptions
  readonly accepted: SessionEvent[]
  readonly consumers: Set<AppendPreparation>
  released: boolean
  sealed: boolean
}

interface CreationBaselineState {
  readonly constructorCut: SessionCreationBaseline
  readonly appended: SessionEvent[]
}

const creationBaselines = new WeakMap<Session, CreationBaselineState>()
const preparations = new WeakMap<Session, SessionPreparation>()
const preparationStates = new WeakMap<SessionPreparation, PreparationState>()

/** Record the constructor cut used by announcement and preparation. */
export function recordSessionCreationBaseline(session: Session, baseline: SessionCreationBaseline): void {
  creationBaselines.set(session, { constructorCut: baseline, appended: [] })
}

/** Record a committed append until the creation announcement consumes its cut. */
export function recordSessionCreationAppend(session: Session, event: SessionEvent): void {
  creationBaselines.get(session)?.appended.push(event)
}

/** Read the exact prepublication cut for the creation announcement. */
export function sessionCreationBaseline(session: Session): SessionCreationBaseline | undefined {
  const state = creationBaselines.get(session)
  if (state === undefined || state.appended.length === 0) return state?.constructorCut
  return Object.freeze({
    events: Object.freeze([...state.constructorCut.events, ...state.appended]),
    firstLiveSeq: state.constructorCut.firstLiveSeq,
  })
}

/** Clear the borrowed constructor cut after creation announcement. */
export function clearSessionCreationBaseline(session: Session): void {
  creationBaselines.delete(session)
}

/** Prepare registered projection transactions before an event enters the log. */
export function prepareSessionAppend(session: Session, event: SessionEvent): (() => void) | undefined {
  const preparation = preparations.get(session)
  return preparation === undefined ? undefined : preparePreparedAppend(preparation, event)
}

/** Seal the prepublication feed when its Session enters the live store. */
export function sealSessionPreparation(session: Session): void {
  const preparation = preparations.get(session)
  if (preparation === undefined) return
  sealPreparation(preparation)
  preparations.delete(session)
}

/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
export class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session
  /** The constructor-owned cut before preparation-time appends. */
  readonly baseline: SessionCreationBaseline

  private constructor(
    session: Session,
    baseline: SessionCreationBaseline,
    options: SessionPreparationOptions,
  ) {
    this.session = session
    this.baseline = baseline
    preparationStates.set(this, {
      baseline,
      options,
      accepted: [],
      consumers: new Set(),
      released: false,
      sealed: false,
    })
  }

  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   * @throws when the Session has no constructor cut, has changed since that cut, or already has an active preparation.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation {
    const baseline = creationBaselines.get(session)?.constructorCut
    if (baseline === undefined) throw new Error(`session "${session.id}" has no unpublished creation baseline`)
    if (session.seq !== baseline.events.length) {
      throw new Error(`session "${session.id}" changed before its preparation began`)
    }
    if (preparations.has(session)) throw new Error(`session "${session.id}" already has an active preparation`)
    const preparation = new SessionPreparation(session, baseline, options ?? {})
    preparations.set(session, preparation)
    return preparation
  }

  /**
   * Attach a synchronous consumer to accepted preparation-time appends.
   * Existing accepted appends replay in order before future appends reach the
   * consumer. The returned commit closure must only update provider-owned
   * state; a throwing prepare function rejects a future Session append.
   * @param prepare - compute one event's provider-owned update and return its commit operation.
   * @returns the exact disposer that removes the consumer.
   * @throws when the preparation feed is already sealed.
   */
  subscribeAppends(prepare: (event: SessionEvent) => () => void): () => void {
    const state = preparationState(this)
    if (state.sealed) throw new Error(`session "${this.session.id}" preparation feed is sealed`)
    for (const event of state.accepted) prepare(event)()
    state.consumers.add(prepare)
    return () => { state.consumers.delete(prepare) }
  }

  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void {
    const state = preparationState(this)
    if (state.released) return
    state.released = true
    if (!state.sealed) {
      sealPreparation(this)
      preparations.delete(this.session)
    }
    state.options.release?.()
  }
}

/** Prepare every provider update without changing the feed or projection state. */
function preparePreparedAppend(preparation: SessionPreparation, event: SessionEvent): () => void {
  const state = preparationState(preparation)
  if (state.sealed) throw new Error(`session "${preparation.session.id}" preparation feed is sealed`)
  const expectedSeq = state.baseline.events.length + state.accepted.length
  if (event.seq !== expectedSeq) {
    throw new Error(`session "${preparation.session.id}" preparation expected seq ${expectedSeq}, got ${String(event.seq)}`)
  }
  const commits = [...state.consumers].map(consumer => consumer(event))
  return () => {
    state.accepted.push(event)
    for (const commit of commits) commit()
  }
}

/** Preserve the complete pre-live cut before handing later appends to the live route. */
function sealPreparation(preparation: SessionPreparation): void {
  const state = preparationState(preparation)
  if (state.sealed) return
  state.sealed = true
  state.accepted.length = 0
  state.consumers.clear()
}

/** Read provider-owned preparation state. */
function preparationState(preparation: SessionPreparation): PreparationState {
  const state = preparationStates.get(preparation)
  if (state === undefined) throw new Error(`session "${preparation.session.id}" preparation state is unavailable`)
  return state
}
