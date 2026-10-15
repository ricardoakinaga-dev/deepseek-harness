/** Recorded activity folds without model prose, wall-clock reads, or live-state guesses. */

import { describe, expect, it } from 'vitest'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader, TurnEndReason } from '@deepseek-ai/dsh-session'
import { sessionActivityProjectionDefinition as definition } from '../src/activity.ts'
import type { SessionActivityState } from '../src/types.ts'

const header: SessionHeader = { version: SESSION_FORMAT_VERSION, id: SessionId('activity'), createdAt: 0, isSeeded: false }
const initial = (inherited = 0): SessionActivityState => definition.init(header, SessionLogOffset(inherited))

function call(seq: number, id: string, name = 'read', time = seq): SessionEvent<'tool/call'> {
  return { type: 'tool/call', seq: SessionSeq(seq), time, data: { turn: 1, step: 1, callId: ToolCallId(id), name, arguments: '{"secret":"not projected"}' } }
}

function result(seq: number, id: string, failed = false, code?: string): SessionEvent<'tool/result'> {
  return { type: 'tool/result', seq: SessionSeq(seq), time: seq, surfaceOp: 'append', data: {
    turn: 1, step: 1,
    message: createToolResultMessage({ callId: ToolCallId(id), content: [{ type: 'text', text: 'not interpreted' }], isError: failed }),
    ...code === undefined ? {} : { error: { name: 'ToolError', code } },
  } }
}

function end(seq: number, reason: TurnEndReason): SessionEvent<'turn/end'> {
  return { type: 'turn/end', seq: SessionSeq(seq), time: seq, data: { turn: 1, reason } }
}

function fold(events: readonly SessionEvent[], inherited = 0): SessionActivityState {
  return events.reduce((state, event) => definition.apply(state, event), initial(inherited))
}

describe('session activity', () => {
  it('distinguishes an empty own history from a missing projection', () => {
    const state = initial()
    expect(state.value).toEqual({ last: null, tools: [], error: null })
    expect(definition.wire?.view(state)).toBe(state.value)
  })

  it('pairs concurrent calls by identity and retains the latest sequence when time reverses', () => {
    const state = fold([call(0, 'one', 'read', 500), call(1, 'two', 'bash', 100), result(2, 'one')])
    expect(state.value).toEqual({
      last: { seq: 2, time: 2, kind: 'tool/result' },
      tools: [{ callId: 'two', name: 'bash' }], error: null,
    })
    expect(JSON.stringify(state)).not.toContain('secret')
    expect(JSON.stringify(state)).not.toContain('not interpreted')
  })

  it('keeps a failed parallel result until a new step starts', () => {
    const failed = fold([call(0, 'one'), call(1, 'two'), result(2, 'one', true, 'FS_NOT_FOUND'), result(3, 'two')])
    expect(failed.value.error).toEqual({ seq: 2, time: 2, source: 'tool', code: 'FS_NOT_FOUND' })
    const next = definition.apply(failed, { type: 'step/start', seq: SessionSeq(4), time: 4, data: { turn: 1, step: 2 } })
    expect(next.value.error).toBeNull()
    expect(next.value.tools).toEqual([])
  })

  it('preserves a tool failure without a machine code', () => {
    expect(fold([call(0, 'one'), result(1, 'one', true)]).value.error).toEqual({ seq: 1, time: 1, source: 'tool', code: null })
  })

  it('clears outstanding calls on step and turn closure', () => {
    const active = fold([call(0, 'one')])
    const step = definition.apply(active, { type: 'step/end', seq: SessionSeq(1), time: 1, data: { turn: 1, step: 1 } })
    expect(step.value.tools).toEqual([])
    for (const reason of [{ kind: 'completed' }, { kind: 'interrupted' }, { kind: 'forked' }] as const) {
      expect(definition.apply(active, end(1, reason)).value.tools).toEqual([])
    }
  })

  it('records turn errors and clears stale failures on a new turn or completed recovery', () => {
    const failed = fold([end(0, { kind: 'error', error: { code: 'OVERLOADED', message: 'provider prose is not projected' } })])
    expect(failed.value.error).toEqual({ seq: 0, time: 0, source: 'turn', code: 'OVERLOADED' })
    expect(JSON.stringify(failed)).not.toContain('provider prose')
    expect(definition.apply(failed, { type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 2 } }).value.error).toBeNull()
    expect(definition.apply(failed, end(1, { kind: 'completed' })).value.error).toBeNull()
    expect(definition.apply(failed, end(1, { kind: 'aborted', reason: { kind: 'user' } })).value.error).toEqual(failed.value.error)
  })

  it('ignores inherited work and unrelated configuration events without publishing a new value', () => {
    const state = initial(2)
    expect(definition.apply(state, call(0, 'parent'))).toBe(state)
    expect(definition.apply(state, end(1, { kind: 'error', error: { code: 'PARENT', message: 'parent failure' } }))).toBe(state)
    const config: SessionEvent<'request/header'> = {
      type: 'request/header', seq: SessionSeq(2), time: 2,
      data: { header: { config: { provider: 'provider', model: 'model' } }, reason: 'initial' },
    }
    expect(definition.apply(state, config)).toBe(state)
    expect(definition.apply(state, call(3, 'child')).value.tools).toEqual([{ callId: 'child', name: 'read' }])
  })

  it('stamps a settled model attempt without reading or copying its stream', () => {
    const state = fold([{ type: 'assistant/attempt', seq: SessionSeq(0), time: 20, data: { turn: 1, step: 1, stream: [] } }])
    expect(state.value.last).toEqual({ seq: 0, time: 20, kind: 'assistant/attempt' })
  })

  it('round-trips a checkpoint and rejects invalid persisted and wire fields', () => {
    const state = fold([call(0, 'read')])
    const parsed: unknown = JSON.parse(JSON.stringify(state))
    expect(definition.stateSchema.parse(parsed)).toEqual(state)
    expect(definition.stateSchema.safeParse({ ...state, inheritedEventCount: -1 }).success).toBe(false)
    expect(definition.wire?.viewSchema.safeParse({ ...state.value, last: { seq: -1, time: 0, kind: 'tool/call' } }).success).toBe(false)
    expect(definition.wire?.viewSchema.safeParse({ ...state.value, last: { seq: 0, time: 0, kind: 'heartbeat' } }).success).toBe(false)
    expect(definition.wire?.viewSchema.safeParse({ ...state.value, live: true }).success).toBe(false)
  })
})
