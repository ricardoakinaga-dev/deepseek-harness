/** Negative controls for the public SDK recovery snapshot assertions. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionSeq } from '@deepseek-ai/dsh-session'
import type { RunResult } from '../src/index.ts'
import { assertCanonicalSubagentFinal, assertQueuedRecovery } from '../../../../snapshots/sdk/queued-request-recovery/assert-recovery.ts'
import { assertFreshRuntimeAuditIdentity, verifyRuntimeAuditOracle, withRuntimeAuditNotificationOracle, withRuntimeAuditOracle } from '../../../../snapshots/sdk/runtime-audit-oracle.ts'

async function fixtureResult(scenario: string, finalResponse = 'QUEUED_RECOVERY_OK'): Promise<RunResult> {
  const directory = new URL(`../../../../snapshots/sdk/${scenario}/`, import.meta.url)
  const filename = `session.v${SESSION_FORMAT_VERSION}.jsonl`
  const content = await readFile(new URL(filename, directory), 'utf8')
  const [header, ...body] = content.trimEnd().split('\n')
  const session = JSON.parse(header!) as { id: string }
  const events = body.map((line, seq) => ({
    ...JSON.parse(line) as RunResult['events'][number], seq: SessionSeq(seq), time: 0,
  }))
  return {
    sessionId: session.id, finalResponse, events,
    notifications: [
      { method: 'session.status', params: { status: 'running' } },
      ...events.map(event => ({ method: 'session.event', params: { event } })),
      { method: 'session.status', params: { status: 'idle' } },
    ],
  }
}

describe('queued SDK recovery evidence', () => {
  it.each([
    ['queued-request-recovery', 'next-turn'],
    ['steered-request-recovery', 'next-step'],
  ] as const)('accepts the completed %s activity interval', async (scenario, target) => {
    assertQueuedRecovery(await fixtureResult(scenario), target)
  })

  it('rejects the SDK result truncated by idle between replacement drivers', async () => {
    const result = await fixtureResult('queued-request-recovery')
    const end = result.events.findIndex(event => event.type === 'turn/end')
    const truncated = { ...result, finalResponse: '', events: result.events.slice(0, end + 1) }
    expect(() => { assertQueuedRecovery(truncated, 'next-turn') })
      .toThrow('SDK run returned before accepted input completed')
  })

  it('rejects an intermediate idle even if a collector retains the later answer', async () => {
    const result = await fixtureResult('queued-request-recovery')
    result.notifications.splice(1, 0,
      { method: 'session.status', params: { status: 'idle' } },
      { method: 'session.status', params: { status: 'running' } },
    )
    expect(() => { assertQueuedRecovery(result, 'next-turn') }).toThrow()
  })

  it('rejects a repeated completed tool effect', async () => {
    const result = await fixtureResult('queued-request-recovery')
    result.events.push(result.events.find(event => event.type === 'todo/write')!)
    expect(() => { assertQueuedRecovery(result, 'next-turn') }).toThrow('completed tool effect must not repeat')
  })
})

describe('canonical subagent final evidence', () => {
  async function childLog(scenario = 'subagent-canonical-final'): Promise<string> {
    return readFile(new URL(`../../../../snapshots/sdk/${scenario}/session.1.v${SESSION_FORMAT_VERSION}.jsonl`, import.meta.url), 'utf8')
  }

  it.each([
    ['subagent-canonical-final', 'continuable', 'PARENT_CANONICAL_OK'],
    ['subagent-one-shot-final', 'one-shot', 'ONE_SHOT_PARENT_OK'],
  ] as const)('accepts %s with exactly one final delivery', async (scenario, mode, finalResponse) => {
    assertCanonicalSubagentFinal(await fixtureResult(scenario, finalResponse), await childLog(scenario), mode)
  })

  it('rejects a second automatic final notice', async () => {
    const result = await fixtureResult('subagent-canonical-final', 'PARENT_CANONICAL_OK')
    const settlement = result.events.filter(event => event.type === 'user/message')
      .find(event => event.data.source.kind === 'subagent-settled')!
    result.events.push(settlement)
    const child = await childLog()
    expect(() => { assertCanonicalSubagentFinal(result, child, 'continuable') })
      .toThrow('parent must receive exactly one automatic child final')
  })

  it('rejects a canonical final copied into the progress relay', async () => {
    const result = await fixtureResult('subagent-canonical-final', 'PARENT_CANONICAL_OK')
    const progress = result.events.filter(event => event.type === 'user/message')
      .find(event => event.data.source.kind === 'agent-message')!
    result.events[result.events.indexOf(progress)] = {
      ...progress, data: { ...progress.data, content: [{ type: 'text', text: 'PROGRESS_ONLY CANONICAL_CHILD_FINAL' }] },
    }
    const child = await childLog()
    expect(() => { assertCanonicalSubagentFinal(result, child, 'continuable') })
      .toThrow('progress must not duplicate the canonical final')
  })

  it('rejects duplicate child final replies', async () => {
    const result = await fixtureResult('subagent-canonical-final', 'PARENT_CANONICAL_OK')
    const child = await childLog()
    const final = child.trimEnd().split('\n').find((line) => {
      const event = JSON.parse(line) as { type: string; data?: { message?: { content?: Array<{ type: string; text?: string }> } } }
      return event.type === 'assistant/message' && event.data?.message?.content?.some(block => block.text === 'CANONICAL_CHILD_FINAL')
    })!
    expect(() => { assertCanonicalSubagentFinal(result, child + final + '\n', 'continuable') })
      .toThrow('child must author exactly one canonical final answer')
  })

  it('rejects an automatic closing notice added to the foreground one-shot result', async () => {
    const result = await fixtureResult('subagent-one-shot-final', 'ONE_SHOT_PARENT_OK')
    const continuable = await fixtureResult('subagent-canonical-final', 'PARENT_CANONICAL_OK')
    result.events.push(continuable.events.filter(event => event.type === 'user/message')
      .find(event => event.data.source.kind === 'subagent-settled')!)
    const child = await childLog('subagent-one-shot-final')
    expect(() => { assertCanonicalSubagentFinal(result, child, 'one-shot') })
      .toThrow('foreground one-shot must not also deliver an automatic closing notice')
  })
})

describe('SDK runtime audit mode oracles', () => {
  const source = { type: 'runtime/audit', data: { reason: 'initial', runtime: {
    launcher: { kind: 'source' }, source: { dirty: false }, build: null,
  } } }
  const artifact = { type: 'runtime/audit', data: { reason: 'initial', runtime: {
    launcher: { kind: 'artifact' }, source: null, build: { inputCount: 17 },
  } } }
  const logs = (event: object): string[] => [`{"type":"session"}\n${JSON.stringify(event)}\n{"type":"turn/end","data":{"turn":2}}\n`]

  const freshLog = (events: readonly object[], isSeeded = false, version = SESSION_FORMAT_VERSION): string =>
    [{ type: 'session', version, isSeeded }, ...events].map(event => JSON.stringify(event)).join('\n') + '\n'

  it('requires an own initial audit before a fresh Session can refresh fixtures', () => {
    expect(assertFreshRuntimeAuditIdentity(freshLog([source]), source.data.runtime)).toBe(1)
    expect(() => assertFreshRuntimeAuditIdentity(freshLog([]), source.data.runtime)).toThrow('no own initial runtime audit')
    expect(() => assertFreshRuntimeAuditIdentity(freshLog([artifact]), source.data.runtime)).toThrow('differs from the launch-time observation')
  })

  it('excludes inherited audits and rejects a child with only its parent audit', () => {
    const inherited = [artifact, { type: 'session/end-seed', data: { inherited: true } }]
    expect(assertFreshRuntimeAuditIdentity(freshLog([...inherited, source], true), source.data.runtime)).toBe(1)
    expect(() => assertFreshRuntimeAuditIdentity(freshLog(inherited, true), source.data.runtime))
      .toThrow('no own initial runtime audit')
    expect(() => assertFreshRuntimeAuditIdentity(freshLog([source], true), source.data.runtime))
      .toThrow('no inherited end-seed marker')
  })

  it('does not assess a historical recording against the current launch identity', () => {
    expect(() => assertFreshRuntimeAuditIdentity(freshLog([artifact], false, SESSION_FORMAT_VERSION - 1), source.data.runtime))
      .toThrow('requires current-writer output')
  })

  it('requires an explicit selected-mode oracle and keeps replay read-only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-audit-oracle-'))
    try {
      await expect(verifyRuntimeAuditOracle(directory, 'source', logs(source), false)).rejects.toThrow('ENOENT')
      await verifyRuntimeAuditOracle(directory, 'source', logs(source), true)
      const path = join(directory, 'runtime-audit.source.expected.jsonl')
      const original = await readFile(path, 'utf8')
      await expect(verifyRuntimeAuditOracle(directory, 'source', logs(artifact), false)).rejects.toThrow('oracle differs')
      await expect(verifyRuntimeAuditOracle(directory, 'artifact', logs(artifact), false)).rejects.toThrow('ENOENT')
      expect(await readFile(path, 'utf8')).toBe(original)
      await verifyRuntimeAuditOracle(directory, 'artifact', logs(artifact), true)
      expect(await readFile(path, 'utf8')).toBe(original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('substitutes only expected audit rows and rejects missing roles or counts', () => {
    const selected = [{ session: 1, event: artifact }]
    expect(withRuntimeAuditOracle(logs(source), selected)).toEqual(logs(artifact))
    expect(() => withRuntimeAuditOracle(logs(source), [])).toThrow('missing Session role')
    expect(() => withRuntimeAuditOracle(logs(source), [...selected, ...selected])).toThrow('count differs')
    expect(() => withRuntimeAuditOracle(logs(source), [...selected, { session: 2, event: artifact }]))
      .toThrow('unknown Session role')
  })

  it('preserves SDK notification envelopes while selecting verified audit payloads', () => {
    const notification = { method: 'session.event', params: { sessionId: '{{session:1}}', event: { ...source, seq: 3, time: 0 } } }
    const ordinary = { method: 'session.status', params: { status: 'idle' } }
    expect(withRuntimeAuditNotificationOracle([notification, ordinary], logs(source), [{ session: 1, event: artifact }]))
      .toEqual([
        { ...notification, params: { ...notification.params, event: { ...notification.params.event, data: artifact.data } } }, ordinary,
      ])
    expect(() => withRuntimeAuditNotificationOracle([notification], logs(source), [])).toThrow('no selected Session oracle')
  })
})
