/** Host-only time-context fold shared by request preparation and its invariant. */

import { z } from 'zod'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  browserTimeZoneInput,
  deriveBrowserTimeZoneContextFromInputs,
  renderBrowserTimeZoneContext,
} from './request-zone.ts'
import { createTimestampFormatter, formatTimestamp } from './timestamp.ts'

const SOURCE_NAME = 'time-context'
const READING = new RegExp(
  '^Time sampled while preparing turn (\\d+), step (\\d+): '
  + '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:Z|[+-]\\d{2}:\\d{2})\\[[^\\]]+\\])\\n'
  + '(Browser time zone for this request: .+)\\n'
  + 'Elapsed since the preceding (model-visible message|step context): '
  + '(?:unavailable|(?:(?:\\d+d )?(?:\\d+h )?(?:\\d+m )?\\d+s))\\.$',
)

/** Folded host state used to prepare and validate time-context readings. */
export interface TimeContextProjection {
  /** Latest time of a model-visible message or tool result. */
  lastMessageTime: number | null
  /** Latest durable time-context injection. */
  lastInjectionTime: number | null
  /** Latest durable injection in the open turn. */
  lastTurnInjectionTime: number | null
  /** Turn whose events are currently open, if any. */
  openTurn: number | null
  /** Step whose events are currently open, if any. */
  openStep: number | null
  /** Whether the current request has reached its header event. */
  requestStarted: boolean
  /** Ordered unique raw browser-zone values seen in the open turn. */
  browserTimeZoneInputs: string[]
  /** First invalid durable reading found in the complete folded history. */
  firstValidationFailure: string | null
}

/** JSON schema for the persisted host-only projection state. */
export const timeContextStateSchema = z.object({
  lastMessageTime: z.number().nullable(),
  lastInjectionTime: z.number().nullable(),
  lastTurnInjectionTime: z.number().nullable(),
  openTurn: z.number().int().positive().nullable(),
  openStep: z.number().int().positive().nullable(),
  requestStarted: z.boolean(),
  browserTimeZoneInputs: z.array(z.string()),
  firstValidationFailure: z.string().nullable(),
})

/** Intl data used to validate zones and format durable readings in this runtime. */
export const timeContextCacheFingerprint = JSON.stringify({
  node: process.versions.node,
  v8: process.versions.v8,
  icu: process.versions.icu ?? null,
  cldr: process.versions.cldr ?? null,
  tz: process.versions.tz ?? null,
})

/** Create empty state for one Session. */
export function initialTimeContextProjection(): TimeContextProjection {
  return {
    lastMessageTime: null,
    lastInjectionTime: null,
    lastTurnInjectionTime: null,
    openTurn: null,
    openStep: null,
    requestStarted: false,
    browserTimeZoneInputs: [],
    firstValidationFailure: null,
  }
}

/** Return the diagnostic for one invalid durable reading, if it has one. */
export function timeContextReadingFailure(
  state: TimeContextProjection,
  event: SessionEvent<'user/message'>,
): string | undefined {
  try {
    validateReading(state, event)
    return undefined
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Apply one exact Session event to the host-only time-context fold. */
export function applyTimeContextEvent(
  state: TimeContextProjection,
  event: SessionEvent,
): TimeContextProjection {
  let next = state
  if (event.type === 'user/message') {
    const reading = event.data.source.kind === SOURCE_NAME
    const firstValidationFailure = reading && state.firstValidationFailure === null
      ? timeContextReadingFailure(state, event) ?? null
      : state.firstValidationFailure
    const input = state.openTurn === null ? undefined : browserTimeZoneInput(event.data)
    const browserTimeZoneInputs = input === undefined || state.browserTimeZoneInputs.includes(input)
      ? state.browserTimeZoneInputs
      : [...state.browserTimeZoneInputs, input]
    const injected = reading
    next = {
      ...state,
      lastMessageTime: event.time,
      ...(injected ? { lastInjectionTime: event.time, lastTurnInjectionTime: event.time } : {}),
      ...(browserTimeZoneInputs === state.browserTimeZoneInputs ? {} : { browserTimeZoneInputs }),
      ...(firstValidationFailure === state.firstValidationFailure ? {} : { firstValidationFailure }),
    }
  } else if (event.type === 'assistant/message' || event.type === 'tool/result') {
    next = { ...state, lastMessageTime: event.time }
  }

  switch (event.type) {
    case 'turn/start':
      return {
        ...next,
        lastTurnInjectionTime: null,
        openTurn: event.data.turn,
        openStep: null,
        requestStarted: false,
        browserTimeZoneInputs: [],
      }
    case 'step/start':
      return { ...next, openStep: event.data.step, requestStarted: false }
    case 'request/header':
      return { ...next, requestStarted: true }
    case 'step/end':
      return { ...next, openStep: null, requestStarted: false }
    case 'turn/end':
      return {
        ...next,
        lastTurnInjectionTime: null,
        openTurn: null,
        openStep: null,
        requestStarted: false,
        browserTimeZoneInputs: [],
      }
    default:
      return next
  }
}

/** Fold an exact event prefix from its initial state. */
export function foldTimeContextEvents(events: readonly SessionEvent[]): TimeContextProjection {
  let state = initialTimeContextProjection()
  for (const event of events) state = applyTimeContextEvent(state, event)
  return state
}

function validateReading(state: TimeContextProjection, event: SessionEvent<'user/message'>): void {
  const blockValue: unknown = event.data.content[0]
  const block = typeof blockValue === 'object' && blockValue !== null
    ? blockValue as Record<string, unknown>
    : undefined
  const blockText = block?.text
  if (event.data.content.length !== 1
    || block === undefined
    || Object.keys(block).length !== 2
    || block.type !== 'text'
    || typeof blockText !== 'string') {
    throw new Error('time-context messages must contain exactly one text block')
  }
  const match = READING.exec(blockText)
  if (match === null) throw new Error('time-context message does not match the durable reading format')
  const turn = Number(match[1])
  const step = Number(match[2])
  if (!Number.isSafeInteger(turn) || turn < 1 || !Number.isSafeInteger(step) || step < 1) {
    throw new Error('time-context turn and step must be positive safe integers')
  }
  if (state.openTurn === null) throw new Error('time-context reading must be appended inside an open turn')
  if (state.openStep === null) throw new Error('time-context reading must follow step/start')
  if (state.requestStarted) throw new Error('time-context reading must precede request/header')
  if (turn !== state.openTurn || step !== state.openStep) {
    throw new Error(`time-context reading names turn ${turn}/step ${step}, expected turn ${state.openTurn}/step ${state.openStep}`)
  }
  const source = event.data.source
  if (source.kind !== SOURCE_NAME) {
    throw new Error('time-context source must retain package ownership')
  }
  const sections: unknown = 'sections' in source ? source.sections : undefined
  const sectionValue: unknown = Array.isArray(sections) ? sections[0] : undefined
  const section = typeof sectionValue === 'object' && sectionValue !== null
    ? sectionValue as Record<string, unknown>
    : undefined
  if (Object.keys(source).length !== 3
    || source.form !== 'snapshot'
    || !Array.isArray(sections)
    || sections.length !== 1
    || section === undefined
    || Object.keys(section).length !== 2
    || section.name !== SOURCE_NAME
    || section.text !== blockText) {
    throw new Error('time-context source must carry only the exact snapshot text, not request authority')
  }
  const browserContext = deriveBrowserTimeZoneContextFromInputs(state.browserTimeZoneInputs)
  if (match[4] !== renderBrowserTimeZoneContext(browserContext)) {
    throw new Error('time-context browser-zone text does not match current-turn user messages')
  }
  const baseline = match[5]
  if ((step === 1) !== (baseline === 'model-visible message')) {
    throw new Error(`time-context step ${step} uses the wrong elapsed-time baseline ${JSON.stringify(baseline)}`)
  }
  const rendered = match[3]
  if (rendered === undefined) throw new Error('time-context reading omitted its rendered timestamp')
  const renderedTime = Date.parse(rendered.replace(/\[[^\]]+\]$/, ''))
  if (!Number.isFinite(renderedTime) || !Number.isSafeInteger(event.time) || event.time < renderedTime) {
    throw new Error('time-context rendered timestamp must parse and not postdate its durable event')
  }
  if (browserContext.kind === 'resolved') {
    let expectedTimestamp: string
    try {
      expectedTimestamp = formatTimestamp(
        renderedTime,
        createTimestampFormatter(browserContext.timeZone),
        browserContext.timeZone,
      )
    } catch (error: unknown) {
      throw new Error(`time-context browser zone cannot format its durable timestamp: ${String(error)}`)
    }
    if (rendered !== expectedTimestamp) {
      throw new Error('time-context rendered timestamp does not match the unique browser zone')
    }
  }
}

/** Check whether a Session event is an owned durable time-context reading. */
export function isTimeContextReading(event: SessionEvent): event is SessionEvent<'user/message'> {
  return event.type === 'user/message'
    && event.data.source.kind === SOURCE_NAME
}

/** Return proposed browser-zone inputs in the supplied user-message order. */
export function proposedBrowserTimeZoneInputs(messages: readonly UserMessage[]): string[] {
  return messages.flatMap((message) => {
    const input = browserTimeZoneInput(message)
    return input === undefined ? [] : [input]
  })
}
