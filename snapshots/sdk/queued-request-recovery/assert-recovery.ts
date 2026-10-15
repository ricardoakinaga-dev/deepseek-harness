/** Assertions shared by the shipped-profile recovery and child-result scenarios and their negative controls. */
import assert from 'node:assert/strict'
import type { RunResult } from '@deepseek-ai/dsh-sdk-client'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * Require recovery to finish within the original SDK activity interval.
 * @param result - The single SDK run; no later prompt may complete its work.
 * @param target - The inbox target used while the request hook fails.
 */
export function assertQueuedRecovery(result: RunResult, target: 'next-turn' | 'next-step'): void {
  assert.equal(result.finalResponse, 'QUEUED_RECOVERY_OK', 'SDK run returned before accepted input completed')
  const ends = result.events.filter(event => event.type === 'turn/end')
  assert.deepEqual(ends.map(event => event.data['reason']), [
    { kind: 'error', error: { message: 'Snapshot request hook failed after accepting input', code: 'UNKNOWN' } },
    { kind: 'completed' },
  ])
  const messages = result.events.filter(event => event.type === 'assistant/message')
  const answers = messages.filter(event => {
    const message = event.data.message
    return message.content.some(block => block.type === 'text' && block.text === 'QUEUED_RECOVERY_OK')
  })
  assert.equal(answers.length, 1, 'accepted input must produce exactly one final answer')
  assert.equal(result.events.filter(event => event.type === 'todo/write').length, 1, 'completed tool effect must not repeat')
  assert.deepEqual(result.events.filter(event => event.type === 'tool/call').map(event => event.data['callId']), ['queued-complete'])
  assert.equal(result.events.filter(event => event.type === 'tool/result').length, 1)
  const receipts = result.events.filter(event => event.type === 'agent/inbox/spliced'
    && event.data['target'] === target && JSON.stringify(event.data['inserted']).includes('Finish the accepted input'))
  assert.equal(receipts.length, 1, 'accepted input must be submitted exactly once')
  const receipt = result.events.indexOf(receipts[0]!)
  const failedEnd = result.events.indexOf(ends[0]!)
  assert.ok(receipt > result.events.findIndex(event => event.type === 'tool/result') && receipt < failedEnd,
    'waking input must be accepted during the failing request')
  const statuses = result.notifications.filter(notification => notification.method === 'session.status')
  assert.deepEqual(statuses.map(notification => notification.params['status']), ['running', 'idle'])
  const idle = result.notifications.findIndex(notification => notification.method === 'session.status'
    && notification.params['status'] === 'idle')
  const answer = result.notifications.findIndex(notification => notification.method === 'session.event'
    && JSON.stringify(notification.params['event']).includes('QUEUED_RECOVERY_OK'))
  assert.ok(answer >= 0 && answer < idle, 'terminal idle must follow the final answer')
  assert.equal(idle, result.notifications.length - 1, 'terminal idle must end the owned interval')
}

/**
 * Require one canonical child reply and one automatic parent delivery.
 * @param result - The parent's single public SDK activity interval.
 * @param childLog - The case-owned child Session, including its final assistant settlement.
 * @param mode - Whether the scenario includes a child progress message or only a final reply.
 */
export function assertCanonicalSubagentFinal(result: RunResult, childLog: string, mode: 'continuable' | 'one-shot'): void {
  const child = childLog.trimEnd().split('\n').slice(1).map(line => JSON.parse(line) as SessionEvent)
  const finalText = mode === 'continuable' ? 'CANONICAL_CHILD_FINAL' : 'ONE_SHOT_CHILD_FINAL'
  const textOf = (message: { readonly content: readonly { readonly type: string; readonly text?: string }[] }): string =>
    message.content.flatMap(block => block.type === 'text' ? [block.text ?? ''] : []).join('\n')
  const childAnswers = child.filter(event => event.type === 'assistant/message')
    .filter(event => textOf(event.data.message) === finalText)
  assert.equal(childAnswers.length, 1, 'child must author exactly one canonical final answer')
  assert.equal(result.finalResponse, mode === 'continuable' ? 'PARENT_CANONICAL_OK' : 'ONE_SHOT_PARENT_OK')
  const rootCalls = result.events.filter(event => event.type === 'tool/call')
  assert.equal(rootCalls.length, 1)
  assert.equal(rootCalls[0]!.data.name, 'subagent')
  assert.equal(result.events.filter(event => event.type === 'turn/end').length, 1)
  const deliveries = result.events.filter(event => event.type === 'user/message')
  const settled = deliveries.filter(event => event.data.source.kind === 'subagent-settled')
  const progress = deliveries.filter(event => event.data.source.kind === 'agent-message')
  const sends = child.filter(event => event.type === 'tool/call').filter(event => event.data.name === 'send_message')
  assert.equal(settled.length, 1, 'parent must receive exactly one automatic child final')
  assert.equal(textOf(settled[0]!.data).split(finalText).length - 1, 1)
  const final = result.events.find(event => event.type === 'assistant/message'
    && textOf(event.data.message) === result.finalResponse)
  assert.ok(final !== undefined)
  assert.ok(result.events.indexOf(settled[0]!) < result.events.indexOf(final), 'parent final must follow the automatic child final')
  assert.deepEqual(child.filter(event => event.type === 'turn/end').map(event => event.data.reason), [{ kind: 'completed' }])
  if (mode === 'continuable') {
    assert.equal(sends.length, 1, 'child must send progress once without sending its final twice')
    const args = JSON.parse(sends[0]!.data.arguments) as { agent_id: string; message: string }
    assert.equal(args.agent_id, result.sessionId)
    assert.equal(args.message, 'PROGRESS_ONLY')
    assert.equal(progress.length, 1, 'parent must receive exactly one child progress message')
    assert.ok(textOf(progress[0]!.data).includes('PROGRESS_ONLY'))
    assert.ok(!textOf(progress[0]!.data).includes(finalText), 'progress must not duplicate the canonical final')
    const task = child.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.ok(task?.type === 'user/message')
    const guidance = textOf(task.data)
    assert.ok(guidance.includes('delivered to your parent automatically when you finish'))
    assert.ok(guidance.includes('Do not send a second copy of your final result.'))
    assert.ok(guidance.includes(JSON.stringify(result.sessionId)), 'child guidance must name its actual parent')
  } else {
    assert.equal(sends.length, 0)
    assert.equal(progress.length, 0)
    const results = result.events.filter(event => event.type === 'tool/result')
    assert.equal(results.length, 1)
    assert.equal(results[0]!.data.message.isError, false)
    assert.ok(!textOf(results[0]!.data.message).includes(finalText), 'admission result must not duplicate the canonical child final')
  }
}
