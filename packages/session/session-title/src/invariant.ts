/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-session-title`.
 * @module @deepseek-ai/dsh-session-title/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session, SessionCreationBaseline, SessionEvent } from '@deepseek-ai/dsh-session'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-title'

type HumanMessageSeqs = Set<ReturnType<typeof SessionSeq>>

const humanMessageSeqs = new WeakMap<Session, HumanMessageSeqs>()

/** Cordis companion plugin name. */
export const name = 'session-title-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Durable title-source invariant: an automatic title always cites at
 * least one human `user/message` seq, and an explicit user rename cites none
 * — `messageSeqs` is empty iff `source.kind` is `user`. Provider revisions
 * are validated by the service before their append; this checks the durable
 * relationship every appended `session/title` event must keep, whichever
 * writer produced it.
 */
function validate(
  event: SessionEvent<'session/title'>,
  committedSeqs: HumanMessageSeqs,
  fail: InvariantFailure,
): void {
  const { source, messageSeqs } = event.data
  if ((messageSeqs.length === 0) !== (source.kind === 'user')) {
    const requirement = source.kind === 'user' ? 'cite no message seqs' : 'cite at least one message seq'
    fail(`session/title event ${String(event.seq)} with source "${source.kind}" must ${requirement}; got ${String(messageSeqs.length)}`)
  }
  const seen = new Set<ReturnType<typeof SessionSeq>>()
  for (const seq of messageSeqs) {
    let checked: ReturnType<typeof SessionSeq>
    try {
      checked = SessionSeq(seq)
    } catch {
      fail(`session/title event ${String(event.seq)} has an invalid message seq ${String(seq)}`)
    }
    if (seen.has(checked)) {
      fail(`session/title event ${String(event.seq)} repeats message seq ${checked}`)
    }
    seen.add(checked)
    if (checked >= event.seq || !committedSeqs.has(checked)) {
      fail(`session/title event ${String(event.seq)} message seq ${checked} must name an earlier human user/message`)
    }
  }
}

/** Keep every human message seq, including messages without eligible title text. */
function isHumanMessage(event: SessionEvent): event is SessionEvent<'user/message'> {
  return event.type === 'user/message' && event.data.source.kind === 'user'
}

/** Seed one Session's citation index and validate its earlier title events in log order. */
function indexEvents(events: readonly SessionEvent[], fail: InvariantFailure): HumanMessageSeqs {
  const seqs: HumanMessageSeqs = new Set()
  for (const event of events) {
    if (event.type === 'session/title') validate(event, seqs, fail)
    if (isHumanMessage(event)) seqs.add(event.seq)
  }
  return seqs
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const validateExisting = (session: Session): void => {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing live-session bootstrap precedes this companion's registration.
    humanMessageSeqs.set(session, indexEvents(session.snapshotEvents(), fail))
  }
  ctx.sessions.list().forEach(validateExisting)
  ctx.on('session/created', (session, baseline: SessionCreationBaseline) => {
    humanMessageSeqs.set(session, indexEvents(baseline.events, fail))
  }, { global: true })
  ctx.on('session/event', (session, event) => {
    if (!isHumanMessage(event) || !session.isCommittedEvent(event)) return
    let seqs = humanMessageSeqs.get(session)
    if (seqs === undefined) {
      seqs = new Set()
      humanMessageSeqs.set(session, seqs)
    }
    seqs.add(event.seq)
  }, { global: true })
  // internal/dispatch interception rejects the append before publication
  // (the session/event listener would only observe the already-committed log).
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (event.type !== 'session/title') return
    const seqs = humanMessageSeqs.get(session)
    if (seqs === undefined) {
      fail(`session "${session.id}" has no committed-human-message citation index`)
    }
    validate(event, seqs, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
