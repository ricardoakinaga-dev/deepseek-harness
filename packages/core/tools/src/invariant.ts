/** Package-owned tool-pipeline invariants. @module @deepseek-ai/dsh-tools/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type {
  Session,
  SessionCreationBaseline,
  SessionEvent,
  SessionPreparation,
} from '@deepseek-ai/dsh-session'
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { ToolExecution, ToolExecutionResult } from './index.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-tools'

/** Cordis companion plugin name. */
export const name = 'tools-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

type ToolStage = 'pre' | 'execute' | 'post'

interface SessionFold {
  nextSeq: number
  openTurn: number | null
  readonly dispatchRoots: Map<string, string>
}

interface SessionFoldTransition {
  readonly openTurn: number | null
  readonly dispatch?: { readonly child: string; readonly root: string }
}

interface StagedSessionEvent {
  readonly session: Session
  readonly fold: SessionFold
  readonly transition: SessionFoldTransition
}

interface PreparedSessionFold {
  readonly preparation: SessionPreparation
  readonly fold: SessionFold
  readonly unsubscribe: () => void
}

/** Validate the immutable final execution/result snapshot. */
function validateResult(
  exec: Readonly<ToolExecution>,
  result: Readonly<ToolExecutionResult>,
  fail: InvariantFailure,
): void {
  if (!Object.isFrozen(exec)) fail('tools/result execution must be frozen before publication')
  if (!Object.isFrozen(result) || !Object.isFrozen(result.content)) {
    fail('tools/result outcome and content must be frozen before publication')
  }
  if (exec.name.length === 0 || String(exec.callId).length === 0) {
    fail('tools/result execution must carry non-empty name and callId')
  }
}

/** Install pipeline checks and a transactional fold of exact Session events. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const stages = new WeakMap<object, ToolStage>()
  const sessionFolds = new WeakMap<Session, SessionFold>()
  const liveSessions = new WeakSet<Session>()
  const preparedSessions = new WeakMap<Session, PreparedSessionFold>()
  const stagedEvents = new WeakMap<SessionEvent, StagedSessionEvent>()
  const preparationUnsubscribers = new Set<() => void>()
  const projections: SessionProjectionRegistry = ctx.sessionProjections
  let active = true

  const emptyFold = (): SessionFold => ({
    nextSeq: 0,
    openTurn: null,
    dispatchRoots: new Map(),
  })

  const assertBaseline = (
    session: Session,
    baseline: SessionCreationBaseline,
    requireCurrentLength = true,
  ): void => {
    if (baseline.firstLiveSeq !== session.firstLiveSeq
      || (requireCurrentLength && baseline.events.length !== Number(session.seq))
      || baseline.events.length > Number(session.seq)) {
      fail(`session "${session.id}" creation baseline does not match its exact live cut`)
    }
    for (let index = 0; index < baseline.events.length; index += 1) {
      const event = baseline.events[index]
      if (event === undefined || event.seq !== index || !session.isCommittedEvent(event)) {
        fail(`session "${session.id}" creation baseline is not the exact committed event prefix`)
      }
    }
  }

  const transitionFor = (fold: SessionFold, event: SessionEvent): SessionFoldTransition => {
    if (event.seq !== fold.nextSeq) {
      fail(`session event seq ${String(event.seq)} does not match tools fold next-seq ${String(fold.nextSeq)}`)
    }

    let dispatch: SessionFoldTransition['dispatch']
    if (event.type === 'tool/ptc-dispatch-start' || event.type === 'tool/ptc-dispatch') {
      const root = String(event.data.rootCallId)
      const parent = String(event.data.parentCallId)
      const child = String(event.data.subCallId)
      if (root.length === 0 || parent.length === 0 || child.length === 0) {
        fail(`${event.type} must carry non-empty rootCallId, parentCallId, and subCallId`)
      }
      const known = fold.dispatchRoots.get(child)
      if (known !== undefined && known !== root) {
        fail(`${event.type} changed rootCallId for subCallId ${child}`)
      }
      if (parent !== root && fold.dispatchRoots.get(parent) !== root) {
        fail(`${event.type} parentCallId ${parent} does not belong to rootCallId ${root}`)
      }
      if (fold.openTurn === null) fail(`${event.type} appended outside any open turn`)
      dispatch = { child, root }
    }

    const openTurn = event.type === 'turn/start'
      ? event.data.turn
      : event.type === 'turn/end'
        ? null
        : fold.openTurn
    return dispatch === undefined ? { openTurn } : { openTurn, dispatch }
  }

  const commitTransition = (
    fold: SessionFold,
    event: SessionEvent,
    transition: SessionFoldTransition,
  ): void => {
    if (transition.dispatch !== undefined) {
      fold.dispatchRoots.set(transition.dispatch.child, transition.dispatch.root)
    }
    fold.openTurn = transition.openTurn
    fold.nextSeq = Number(event.seq) + 1
  }

  const foldBaseline = (
    session: Session,
    baseline: SessionCreationBaseline,
    requireCurrentLength = true,
  ): SessionFold => {
    assertBaseline(session, baseline, requireCurrentLength)
    const fold = emptyFold()
    for (const event of baseline.events) {
      commitTransition(fold, event, transitionFor(fold, event))
    }
    return fold
  }

  const assertCommittedAfterAppend = (session: Session, event: SessionEvent): void => {
    if (session.seq !== Number(event.seq) + 1 || !session.isCommittedEvent(event)) {
      fail(`session/event seq ${String(event.seq)} is not the exact committed Session append`)
    }
  }

  const assertCommittedPreparationEvent = (session: Session, event: SessionEvent): void => {
    if (session.seq <= event.seq || !session.isCommittedEvent(event)) {
      fail(`prepared event seq ${String(event.seq)} is not an exact committed Session append`)
    }
  }

  for (const session of ctx.sessions.list()) {
    if (session.seq !== 0) {
      fail(`cannot initialize tools invariant for eventful Session "${session.id}" without its creation baseline`)
    }
    sessionFolds.set(session, emptyFold())
    liveSessions.add(session)
  }

  ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    if (liveSessions.has(session)) fail(`session "${session.id}" was announced more than once to tools invariant`)
    assertBaseline(session, baseline)

    const prepared = preparedSessions.get(session)
    if (prepared !== undefined) {
      if (sessionFolds.get(session) !== prepared.fold || prepared.fold.nextSeq !== baseline.events.length) {
        fail(`session "${session.id}" creation baseline does not match its prepared tools fold`)
      }
      prepared.unsubscribe()
      preparationUnsubscribers.delete(prepared.unsubscribe)
      preparedSessions.delete(session)
    } else {
      if (sessionFolds.has(session)) {
        fail(`session "${session.id}" already has tools state without an active preparation`)
      }
      sessionFolds.set(session, foldBaseline(session, baseline))
    }
    liveSessions.add(session)
  }, { global: true })

  ctx.on('session/disposed', (session) => {
    const prepared = preparedSessions.get(session)
    if (prepared !== undefined) {
      prepared.unsubscribe()
      preparationUnsubscribers.delete(prepared.unsubscribe)
      preparedSessions.delete(session)
    }
    sessionFolds.delete(session)
    liveSessions.delete(session)
  }, { global: true })

  ctx.on('session/event', (session, event) => {
    const staged = stagedEvents.get(event)
    stagedEvents.delete(event)
    if (staged === undefined || staged.session !== session) {
      fail('session/event reached publication without matching tools pre-commit validation')
    }
    const fold = sessionFolds.get(session)
    if (!liveSessions.has(session) || fold === undefined || fold !== staged.fold) {
      fail(`session/event for Session "${session.id}" has no active exact creation baseline`)
    }
    if (fold.nextSeq !== event.seq) {
      fail(`session/event seq ${String(event.seq)} does not match tools fold next-seq ${String(fold.nextSeq)}`)
    }
    assertCommittedAfterAppend(session, event)
    commitTransition(fold, event, staged.transition)
  }, { global: true })

  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName === 'session/event') {
      const [session, event] = args as [Session, SessionEvent]
      const fold = sessionFolds.get(session)
      if (!liveSessions.has(session) || fold === undefined) {
        fail(`session/event for Session "${session.id}" has no exact creation baseline`)
      }
      if (Number(event.seq) !== Number(session.seq)) {
        fail(`session/event candidate seq ${String(event.seq)} does not match Session.seq ${String(session.seq)}`)
      }
      const transition = transitionFor(fold, event)
      stagedEvents.set(event, { session, fold, transition })
      return
    }
    if (eventName === 'tools/pre-execute') {
      const exec = args[0] as ToolExecution
      if (stages.has(exec)) fail('tools/pre-execute repeated for one execution')
      stages.set(exec, 'pre')
      return
    }
    if (eventName === 'tools/execute') {
      const exec = args[0] as ToolExecution
      if (stages.get(exec) !== 'pre') fail('tools/execute must follow tools/pre-execute')
      stages.set(exec, 'execute')
      return
    }
    if (eventName === 'tools/post-execute') {
      const exec = args[0] as ToolExecution
      const previous = stages.get(exec)
      if (previous !== 'pre' && previous !== 'execute') {
        fail('tools/post-execute must follow tools/pre-execute or tools/execute')
      }
      stages.set(exec, 'post')
      return
    }
    if (eventName !== 'tools/result') return
    const [exec, result] = args as [Readonly<ToolExecution>, Readonly<ToolExecutionResult>]
    validateResult(exec, result, fail)
    stages.delete(exec)
  }, { global: true })

  projections.onBeforePrepareSession((preparation) => {
    if (!active) return
    const session = preparation.session
    const previousPreparation = preparedSessions.get(session)
    if (previousPreparation !== undefined) {
      if (previousPreparation.preparation === preparation) {
        fail(`session "${session.id}" already has tools invariant state for this preparation`)
      }
      previousPreparation.unsubscribe()
      preparationUnsubscribers.delete(previousPreparation.unsubscribe)
      preparedSessions.delete(session)
      sessionFolds.delete(session)
    }
    if (sessionFolds.has(session) || liveSessions.has(session)) {
      fail(`session "${session.id}" already has tools invariant state before preparation`)
    }
    const fold = foldBaseline(session, preparation.baseline, false)
    sessionFolds.set(session, fold)
    try {
      const prepareAppend = (event: SessionEvent): (() => void) => {
        if (!active) return () => undefined
        if (sessionFolds.get(session) !== fold) {
          fail(`session "${session.id}" preparation no longer owns its tools fold`)
        }
        const transition = transitionFor(fold, event)
        return () => {
          if (!active) return
          if (sessionFolds.get(session) !== fold) {
            fail(`session "${session.id}" preparation no longer owns its tools fold`)
          }
          if (fold.nextSeq !== event.seq) {
            fail(`prepared event seq ${String(event.seq)} does not match tools fold next-seq ${String(fold.nextSeq)}`)
          }
          assertCommittedPreparationEvent(session, event)
          commitTransition(fold, event, transition)
        }
      }
      const unsubscribe = preparation.subscribeAppends(prepareAppend)
      const prepared = { preparation, fold, unsubscribe }
      preparedSessions.set(session, prepared)
      preparationUnsubscribers.add(unsubscribe)
    } catch (error) {
      sessionFolds.delete(session)
      throw error
    }
  })

  ctx.effect(() => () => {
    active = false
    for (const unsubscribe of preparationUnsubscribers) unsubscribe()
    preparationUnsubscribers.clear()
  }, 'tools invariant preparation feeds')
}, { inject: ['sessions', 'sessionProjections'] })

/**
 * Register the tools invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
