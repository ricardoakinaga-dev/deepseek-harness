/** Public Web activity with real tools and delegation; the model adapter is scripted. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Locator } from 'playwright'
import { chromium } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import {
  joinAssistantStreamText, createUserMessage, LlmAdapter, resolveRetryPolicy,
  type GenerateOptions, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-workspace'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, requireBuilt } from './support.ts'

const PROVIDER = 'web-status-activity'
const OWNER = SessionId('status-activity-owner')
const PREPARE = 'Prepare the status activity case.'
const CHILD_LABEL = 'status activity child'
const QUESTION_CALL = ToolCallId('status-activity-question')
const QUESTION_ARGS = JSON.stringify({ questions: [{
  id: 'checkpoint', question: 'Ready to continue?', header: 'Checkpoint',
  options: [{ label: 'Continue' }, { label: 'Pause' }],
}] })

// The loaded Host classifies errors with its installation's constructor identity.
const { HarnessError } = requireBuilt('@deepseek-ai/dsh-llm') as typeof import('@deepseek-ai/dsh-llm')

class StatusAdapter extends LlmAdapter {
  readonly calls: (GenerateOptions['sessionId'])[] = []

  constructor(private readonly scenario: 'question' | 'failure') { super() }

  override listModels(provider: string) {
    return Promise.resolve([{ provider, id: 'status', name: 'Status fixture' }])
  }

  override providerRetryPolicy() {
    return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'Web status fixture')
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options.sessionId)
    if (options.sessionId !== OWNER) {
      throw new HarnessError('The delegated activity credential is invalid', 'AUTH')
    }
    const ownerCalls = this.calls.filter(id => id === OWNER).length
    if (ownerCalls > (this.scenario === 'question' ? 3 : 2)) {
      throw new Error('status activity adapter received an unexpected owner request')
    }
    if (this.scenario === 'question' && ownerCalls === 2) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: QUESTION_CALL, name: 'ask_user_question', argumentsDelta: QUESTION_ARGS }
      yield { type: 'block-end', index: 0, block: {
        type: 'tool-call', id: QUESTION_CALL, name: 'ask_user_question', arguments: QUESTION_ARGS,
      } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  const failures: unknown[] = []
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup().catch((error: unknown) => failures.push(error))
  }
  if (failures.length > 0) throw new AggregateError(failures, 'status activity teardown failed')
})

async function openWorld(scenario: 'question' | 'failure') {
  const scaffold = await launchWebScaffold()
  cleanups.push(() => scaffold.close())
  const adapter = new StatusAdapter(scenario)
  scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter([PROVIDER], adapter), 'Web status adapter')
  const observed: { sessionId: SessionId; event: SessionEvent }[] = []
  scaffold.ctx.on('session/event', (session, event: SessionEvent) => {
    observed.push({ sessionId: session.id, event })
  })
  const cwd = join(scaffold.workspaceCwd, 'workspace')
  await mkdir(cwd)
  const owner: AgentHandle = await scaffold.ctx.agents.create({
    sessionId: OWNER,
    meta: { cwd, agentPreset: scaffold.ctx.agentPresets.defaultId },
    agentOptions: { provider: PROVIDER, model: 'status' },
    setup: agentCtx => scaffold.ctx.agentPresets.mount(agentCtx).then(() => undefined),
  })
  cleanups.push(() => owner.dispose())
  owner.agent.followup(createUserMessage({
    content: [{ type: 'text', text: PREPARE }], source: { kind: 'user' },
  }))
  await owner.agent.whenIdle()

  const browser = await chromium.launch()
  cleanups.push(() => browser.close())
  const page = await newEnglishPage(browser)
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
  const workspace = await scaffold.ctx.workspaceRegistry.resolveByPath(cwd)
  if (workspace === undefined) throw new Error('status activity workspace was not registered')
  await workspace.attachSession(OWNER)
  await page.getByRole('tree', { name: 'Sessions', exact: true })
    .getByRole('treeitem', { name: new RegExp(PREPARE) }).click()
  const activity = page.getByRole('group', { name: 'Session activity', exact: true })
  await expect.poll(() => activity.textContent(), { timeout: 10_000 }).toContain('not running')
  expect(await activity.textContent()).not.toContain('Waiting for a response')
  expect(await activity.textContent()).not.toContain('Recorded failure')
  expect(await activity.textContent()).not.toContain('Outstanding tools:')
  return {
    scaffold, adapter, owner, page, activity, tripwire,
    events: (id: SessionId) => observed.filter(item => item.sessionId === id).map(item => item.event),
  }
}

function expectNoAssistantText(events: readonly SessionEvent[]): void {
  const attempts = events.filter(event => event.type === 'assistant/message' || event.type === 'assistant/attempt')
  expect(attempts.length).toBeGreaterThan(0)
  for (const event of attempts) {
    expect(joinAssistantStreamText(event.data.stream)).toBe('')
    if (event.type === 'assistant/message') {
      expect(event.data.message.content.filter(block => block.type === 'text')).toEqual([])
    }
  }
}

async function expectInactive(activity: Locator): Promise<void> {
  await expect.poll(() => activity.textContent(), { timeout: 10_000 }).toContain('not running')
  expect(await activity.textContent()).not.toContain('Waiting for a response')
  expect(await activity.textContent()).not.toContain('Outstanding tools:')
  expect(await activity.textContent()).not.toContain('Recorded unfinished tools:')
  expect(await activity.locator('[data-state="ongoing"], [data-state="warning"]').count()).toBe(0)
}

describe('web e2e: waiting and failed activity without assistant prose', () => {
  // Runtime-owned children cannot ask human questions (DELEGATED_CALLER); waiting is a root interaction.
  it('shows a real root question as waiting until the browser answers', async () => {
    const world = await openWorld('question')
    const { page, activity, owner, events, adapter, tripwire } = world
    const input = page.locator('[data-composer-input][contenteditable="true"]').first()
    await input.fill('Ask the checkpoint question.')
    await input.press('Enter')
    await expect.poll(() => adapter.calls, { timeout: 10_000 }).toEqual([OWNER, OWNER])
    await expect.poll(() => events(OWNER).filter(event => event.type === 'tool/call').length, { timeout: 10_000 }).toBe(1)
    const composer = page.locator('[data-question-key]')
    await expect.poll(async () => {
      expect(events(OWNER).filter(event => event.type === 'tool/result')).toEqual([])
      return composer.count()
    }, { timeout: 10_000 }).toBe(1)
    await composer.getByText('Ready to continue?', { exact: true }).waitFor()
    await expect.poll(() => activity.textContent(), { timeout: 10_000 }).toContain('Waiting for a response')
    await expect.poll(() => activity.textContent(), { timeout: 10_000 }).toContain('Outstanding tools: ask_user_question')
    expect(await activity.locator('[data-state="warning"]').count()).toBe(1)
    expect(await activity.locator('[data-state="ongoing"]').count()).toBe(0)
    expect(await activity.locator('time').getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(events(OWNER).filter(event => event.type === 'tool/call')).toMatchObject([
      { data: { callId: QUESTION_CALL, name: 'ask_user_question' } },
    ])
    expect(events(OWNER).filter(event => event.type === 'tool/result')).toEqual([])
    expectNoAssistantText(events(OWNER))
    expect(adapter.calls).toEqual([OWNER, OWNER])

    const answer = composer.getByRole('radio', { name: 'Continue', exact: true })
    await answer.click()
    await answer.press('Enter')
    await expect.poll(() => events(OWNER).filter(event => event.type === 'turn/end').length, { timeout: 10_000 }).toBe(2)
    await owner.agent.whenIdle()
    await composer.waitFor({ state: 'detached' })
    await expectInactive(activity)
    const results = events(OWNER).filter(event => event.type === 'tool/result')
    expect(results).toHaveLength(1)
    expect(results[0]?.data.message.isError).not.toBe(true)
    const text = results[0]?.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    expect(JSON.parse(text ?? '')).toEqual({ answers: [{ id: 'checkpoint', selected: ['Continue'] }] })
    expect(adapter.calls).toEqual([OWNER, OWNER, OWNER])
    expectNoAssistantText(events(OWNER))
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it('shows the failed delegated child in the catalog and its own activity header', async () => {
    const world = await openWorld('failure')
    const { scaffold, owner, adapter, page, events, tripwire } = world
    const started = await scaffold.ctx.subagents.startActivation({
      provider: 'spawn', label: CHILD_LABEL, delivery: 'parent', signal: new AbortController().signal,
      request: { parent: owner.agent, prompt: [{ type: 'text', text: 'Run the delegated activity case.' }] },
    })
    const childId = started.childId
    await expect.poll(() => events(childId).filter(event => event.type === 'turn/end').length, { timeout: 10_000 }).toBe(1)
    await expect.poll(() => scaffold.ctx.agents.get(childId), { timeout: 10_000 }).toBeUndefined()
    await expect.poll(() => events(OWNER).filter(event => event.type === 'turn/end').length, { timeout: 10_000 }).toBe(2)
    await owner.agent.whenIdle()
    expect(adapter.calls).toEqual([OWNER, childId, OWNER])
    expect(events(childId).filter(event => event.type === 'turn/end')).toMatchObject([
      { data: { reason: { kind: 'error', error: { code: 'AUTH' } } } },
    ])
    expect(events(childId).filter(event => event.type === 'llm/retry')).toEqual([])
    expect(events(childId).filter(event => event.type === 'tool/call')).toEqual([])
    const notices = events(OWNER).flatMap(event => event.type === 'agent/inbox/spliced'
      ? event.data.inserted.filter(message => message.source.kind === 'subagent-settled') : [])
    expect(notices).toHaveLength(1)
    expect(notices[0]?.source).toMatchObject({ kind: 'subagent-settled', senderSessionId: childId })
    expect(notices[0]?.content).toEqual([
      { type: 'text', text: `Background subagent ${childId} failed before it finished.` },
      { type: 'text', text: 'It left no closing message.' },
    ])
    expectNoAssistantText(events(childId))
    expectNoAssistantText(events(OWNER))
    await expectInactive(world.activity)
    expect(await world.activity.textContent()).not.toContain('Recorded failure')

    const catalog = page.getByRole('button', { name: '1 subagent', exact: true })
    await catalog.click()
    const row = page.getByRole('tree', { name: 'Subagent sessions', exact: true })
      .getByRole('treeitem', { name: new RegExp(CHILD_LABEL) })
    await expect.poll(() => row.textContent(), { timeout: 10_000 }).toContain('Recorded failure: AUTH')
    await expectInactive(row)
    expect(await row.locator('[data-state="error"]').count()).toBe(1)
    expect(await row.textContent()).not.toContain('completed')
    expect(await page.getByRole('button', { name: '1 subagent running', exact: true }).count()).toBe(0)
    await row.click()
    await page.getByRole('button', { name: `Switch subagent: ${CHILD_LABEL}`, exact: true }).waitFor()
    const childActivity = page.getByRole('group', { name: 'Session activity', exact: true })
    await expect.poll(() => childActivity.textContent(), { timeout: 10_000 }).toContain('Recorded failure: AUTH')
    await expectInactive(childActivity)
    expect(await childActivity.locator('[data-state="error"]').count()).toBe(1)
    expect(await childActivity.locator('time').getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expectNoAssistantText(events(childId))
    expectNoAssistantText(events(OWNER))
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
