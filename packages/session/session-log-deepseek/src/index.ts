/**
 * Incremental session-log contribution for official DeepSeek LLM API requests.
 * Accepted sequence watermarks live in the canonical log, so restart recovery
 * can conservatively resend uncertain tails without maintaining another store.
 * @module @deepseek-ai/dsh-session-log-deepseek
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-deepseek-llm-api-extensions'
import { KNOWN_SESSION_EVENT_TYPES, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type {
  Session,
  SessionEvent,
  SessionId,
  SessionLogOffset as SessionLogOffsetType,
  SessionSeq as SessionSeqType,
  SessionSeqCursor,
  SurfaceOp,
} from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  DeepSeekSessionLogExtension,
  DeepSeekSessionLogWireEvent,
  DeepSeekSessionLogWireHeader,
  DeepSeekSessionLogWireSurfaceOp,
} from './types.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'session-log-deepseek'
/** Services required to resolve sessions and contribute the provider request field. */
export const inject = ['deepseekLlmApiExtensions', 'sessions']

/** Session-log request contribution configuration. */
export interface Config {
  /** Contribute `dsh_session_log` to official DeepSeek requests. Defaults to `true`. */
  enabled?: boolean
}

/** Validated Session-log request contribution configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

interface AcceptanceFold {
  readonly scannedEvents: SessionLogOffsetType
  readonly throughSeq: SessionSeqCursor
}

const acceptanceFolds = new WeakMap<Session, AcceptanceFold>()

/** Minimum optional Session-query view needed for one live observation. */
interface SessionQueryObservation extends Disposable {
  readonly source: 'live' | 'prepared'
  readonly events: readonly SessionEvent[]
  readonly cursor: SessionSeqCursor
}

/** Structural view that avoids importing the optional query implementation into this package's source graph. */
interface SessionQueryService {
  observeSession(
    sessionId: SessionId,
    options: { readonly signal: AbortSignal; readonly projectionMode: 'none' },
  ): Promise<SessionQueryObservation>
}

/** Translate logical Session metadata to raw external request fields. */
function wireHeader(session: Session): DeepSeekSessionLogWireHeader {
  const header = session.header
  return {
    version: header.version,
    id: String(header.id),
    createdAt: header.createdAt,
    ...header.cwd === undefined ? {} : { cwd: header.cwd },
    ...header.parentSession === undefined ? {} : { parentSession: String(header.parentSession) },
    ...header.isSeeded ? { seedLength: Number(session.inheritedEventCount) } : {},
    ...header.origin === undefined ? {} : { origin: header.origin },
    ...header.delegationDepth === undefined ? {} : { delegationDepth: header.delegationDepth },
    ...header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset },
  }
}

/** Translate compile-time sequence brands to raw numeric request fields. */
function wireEvent(event: SessionEvent): DeepSeekSessionLogWireEvent {
  const common = {
    seq: Number(event.seq),
    time: event.time,
    data: event.data as JsonValue,
    ...event.ignorable === undefined ? {} : { ignorable: event.ignorable },
  }
  switch (event.type) {
    case 'system/message':
    case 'user/message':
    case 'tool/result':
      return {
        ...common,
        type: event.type,
        surfaceOp: wireSurfaceOp(event.surfaceOp),
        ...event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs.map(Number) },
      }
    case 'assistant/message':
      return { ...common, type: event.type, surfaceOp: wireSurfaceOp(event.surfaceOp) }
    default: {
      // Restored unknown ignorable records are opaque, not current surface events.
      if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable === true) {
        const opaque = event as { surfaceOp?: JsonValue; sourceEventSeqs?: JsonValue }
        return {
          ...common, type: event.type, ignorable: true,
          ...opaque.surfaceOp === undefined ? {} : { surfaceOp: opaque.surfaceOp },
          ...opaque.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: opaque.sourceEventSeqs },
        }
      }
      return { ...common, type: event.type }
    }
  }
}

function wireSurfaceOp(op: SurfaceOp): DeepSeekSessionLogWireSurfaceOp {
  return op === 'append'
    ? op
    : { op: 'replace', startSeq: Number(op.startSeq), endSeq: Number(op.endSeq) }
}

function foldAcceptedThrough(
  session: Session,
  length: SessionLogOffsetType,
  read: (seq: SessionSeqType) => SessionEvent | undefined,
): SessionSeqCursor {
  const previous = acceptanceFolds.get(session)
  let throughSeq = previous?.throughSeq ?? -1
  const start = previous?.scannedEvents ?? SessionLogOffset(0)
  for (let index = start; index < length; index++) {
    const event = read(SessionSeq(index))
    if (event === undefined) {
      throw new Error(`session-log-deepseek: missing event ${String(index)} below captured length ${String(length)}`)
    }
    if (event.type !== 'session-log-deepseek/delivery-accepted') continue
    const acceptedFormatVersion = event.data.sessionFormatVersion ?? 0
    if (!Number.isSafeInteger(acceptedFormatVersion)
      || acceptedFormatVersion < 0
      || Object.is(acceptedFormatVersion, -0)) {
      throw new Error(`session-log-deepseek: malformed acceptance format version at seq ${event.seq}`)
    }
    if (acceptedFormatVersion !== session.header.version) continue
    let acceptedSeq: SessionSeqType
    try {
      acceptedSeq = SessionSeq(event.data.throughSeq)
    } catch {
      throw new Error(`session-log-deepseek: malformed acceptance watermark at seq ${event.seq}`)
    }
    if (typeof event.data.sessionId !== 'string' || event.data.sessionId.length === 0
      || acceptedSeq >= event.seq) {
      throw new Error(`session-log-deepseek: malformed acceptance watermark at seq ${event.seq}`)
    }
    if (event.data.sessionId !== session.id) continue
    if (acceptedSeq > throughSeq) throughSeq = acceptedSeq
  }
  acceptanceFolds.set(session, { scannedEvents: length, throughSeq })
  return throughSeq
}

/**
 * Highest confirmed sequence for this exact Session format generation.
 * @param session - canonical log whose matching acceptance events are folded.
 * @returns greatest accepted sequence, or `-1` before any accepted request.
 */
export function acceptedThrough(session: Session): SessionSeqCursor {
  const length = session.seq
  return foldAcceptedThrough(session, length, (seq) => {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
    return session.eventAt(seq)
  })
}

function contributionFromEvents(
  session: Session,
  events: readonly SessionEvent[],
  afterSeq: SessionSeqCursor,
  throughSeq: SessionSeqCursor,
): { value: DeepSeekSessionLogExtension; accept(): void } | undefined {
  if (throughSeq === -1) return undefined
  const value: DeepSeekSessionLogExtension = {
    version: 1,
    sessionFormatVersion: session.header.version,
    session: wireHeader(session),
    afterSeq: Number(afterSeq),
    throughSeq: Number(throughSeq),
    events: events.slice(Number(afterSeq) + 1).map(wireEvent),
  }
  return {
    value,
    accept: () => {
      session.append('session-log-deepseek/delivery-accepted', {
        sessionId: session.id,
        sessionFormatVersion: session.header.version,
        throughSeq,
      })
      // TODO: Add an immediate lightweight checkpoint if duplicate replay after a 2xx crash window becomes unacceptable.
    },
  }
}

function legacyContribution(session: Session): ReturnType<typeof contributionFromEvents> {
  const afterSeq = acceptedThrough(session)
  // oxlint-disable-next-line typescript/no-deprecated -- Explicit fallback for profiles without Session-query.
  const snapshot = session.snapshotEvents()
  const throughSeq = snapshot.at(-1)?.seq
  return throughSeq === undefined
    ? undefined
    : contributionFromEvents(session, snapshot, afterSeq, throughSeq)
}

/**
 * Register the incremental `dsh_session_log` request contribution when enabled.
 * @param ctx - plugin context carrying Sessions and the DeepSeek request-extension registry.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled !== true) return
  ctx.deepseekLlmApiExtensions.register('dsh_session_log', {
    prepare: async (request) => {
      // TODO: Define an explicit wire result for direct or stale-session calls if they become a supported product path.
      if (request.sessionId === undefined) return undefined
      const session = ctx.sessions.get(brandString<SessionId>(request.sessionId))
      if (session === undefined) return undefined

      const query = ctx.get('sessionQuery') as unknown as SessionQueryService | undefined
      if (query === undefined) return legacyContribution(session)
      using observation = await query.observeSession(session.id, {
        signal: request.signal,
        projectionMode: 'none',
      })
      request.signal.throwIfAborted()
      if (observation.source !== 'live') return undefined
      const events = observation.events
      const afterSeq = foldAcceptedThrough(session, SessionLogOffset(events.length), seq => events[Number(seq)])
      return contributionFromEvents(session, events, afterSeq, observation.cursor)
    },
  })
}
