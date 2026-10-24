/** Recorded Session execution activity, independent of model prose and live control state. */

import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { SessionActivityProjection, SessionActivityState } from './types.ts'

const seq = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(SessionSeq)
// ECMAScript Date's upper bound keeps every accepted timestamp displayable.
const time = z.number().int().nonnegative().max(8_640_000_000_000_000)
const activitySchema: z.ZodType<SessionActivityProjection> = z.object({
  last: z.object({
    seq,
    time,
    kind: z.enum(['turn/start', 'turn/end', 'step/start', 'step/end', 'user/message',
      'assistant/message', 'assistant/attempt', 'tool/call', 'tool/result']),
  }).strict().nullable(),
  tools: z.array(z.object({ callId: z.string().transform(ToolCallId), name: z.string() }).strict()),
  error: z.object({ seq, time, source: z.enum(['tool', 'turn']), code: z.string().nullable() }).strict().nullable(),
}).strict()

const stateSchema: z.ZodType<SessionActivityState> = z.object({
  inheritedEventCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(SessionLogOffset),
  value: activitySchema,
}).strict()

/**
 * Fold own-session milestones and outstanding calls. New steps/turns and successful turn completion
 * clear prior failure indicators; parallel successful tools do not erase another tool's failure.
 * No clock, heartbeat, assistant content, or job-registry state enters this fold.
 */
export const sessionActivityProjectionDefinition = {
  key: 'sessionActivity',
  stateSchema,
  init: (_header, inheritedEventCount) => ({ inheritedEventCount, value: { last: null, tools: [], error: null } }),
  apply: (state, event) => {
    if (event.seq < state.inheritedEventCount) return state
    const { value } = state
    switch (event.type) {
      case 'turn/start':
      case 'step/start':
        return { ...state, value: { last: { seq: event.seq, time: event.time, kind: event.type }, tools: [], error: null } }
      case 'tool/call':
        return { ...state, value: {
          ...value,
          last: { seq: event.seq, time: event.time, kind: event.type },
          tools: [...value.tools, { callId: event.data.callId, name: event.data.name }],
        } }
      case 'tool/result':
        return { ...state, value: {
          last: { seq: event.seq, time: event.time, kind: event.type },
          tools: value.tools.filter(tool => tool.callId !== event.data.message.toolCallId),
          error: event.data.message.isError
            ? { seq: event.seq, time: event.time, source: 'tool', code: event.data.error?.code ?? null }
            : value.error,
        } }
      case 'turn/end':
        return { ...state, value: {
          last: { seq: event.seq, time: event.time, kind: event.type },
          tools: [],
          error: event.data.reason.kind === 'error'
            ? { seq: event.seq, time: event.time, source: 'turn', code: event.data.reason.error.code }
            : event.data.reason.kind === 'completed' ? null : value.error,
        } }
      case 'step/end':
        return { ...state, value: { ...value, last: { seq: event.seq, time: event.time, kind: event.type }, tools: [] } }
      case 'user/message':
      case 'assistant/message':
      case 'assistant/attempt':
        return { ...state, value: { ...value, last: { seq: event.seq, time: event.time, kind: event.type } } }
      default:
        // SessionEventMap is merge-extensible; other domains do not establish execution activity.
        return state
    }
  },
  wire: { viewSchema: activitySchema, view: state => state.value },
  stateVersion: 1,
} satisfies ProjectionDefinition<'sessionActivity', SessionActivityState>
