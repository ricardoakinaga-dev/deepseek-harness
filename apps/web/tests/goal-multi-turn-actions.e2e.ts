/** Authored current-protocol replay over historical Goal responses; not real-model evidence. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterEach, describe, expect, it, onTestFailed } from 'vitest'
import { loadReplayScript, parseSessionLog } from '@deepseek-ai/dsh-llm-replay'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-commands/types'
import type {} from '@deepseek-ai/dsh-goal'
import {
  assertFixtureInventory, captureExpandedTurnProcessAria, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, recordFixture, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/goal-multi-turn-actions', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.v3.jsonl')
const OVERRIDE = join(SNAPSHOT_DIR, 'replay.override.json')
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const UI_EXPANDED_EXPECTED = join(SNAPSHOT_DIR, 'ui-expanded.expected.md')
const MODE = webSnapshotMode()
const PROMPT = '做两个turn，每个turn输出随机一个包的文件结构。注意你做完一个turn之后，直接输出内容，停止，我们的系统会帮你再开一个turn，你看着做一个类似的'
const REQUIRED_TASKS = [
  { id: 'two-turn-output', criterion: 'Both Goal turns display their inspected package file structures.' },
]
const COMMAND = `/goal create ${JSON.stringify({ objective: PROMPT, requiredTasks: REQUIRED_TASKS })}`
const COMPLETE = 'I accept both displayed package structures. Complete the accepted goal in this turn.'

const PACKAGE_FILES: Readonly<Record<string, string>> = {
  'packages/client/ui-conversation/README.md': '# UI conversation\n',
  'packages/client/ui-conversation/package.json': '{"name":"@deepseek-ai/dsh-client-ui-conversation"}\n',
  'packages/client/ui-conversation/src/client.ts': 'export {}\n',
  'packages/client/ui-chat/tests/chat-view.client.spec.tsx': 'export {}\n',
  'packages/context/session-reference/README.md': '# Session reference\n',
  'packages/context/session-reference/package.json': '{"name":"@deepseek-ai/dsh-session-reference"}\n',
  'packages/context/session-reference/src/index.ts': 'export {}\n',
  'packages/context/session-reference/src/uri.ts': 'export {}\n',
  'packages/context/session-reference/tests/session-reference.spec.ts': 'export {}\n',
  'packages/llm/token-meter/README.md': '# Token meter\n',
  'packages/llm/token-meter/package.json': '{"name":"@deepseek-ai/dsh-token-meter"}\n',
  'packages/llm/token-meter/src/index.ts': 'export {}\n',
  'packages/llm/token-meter/tests/token-meter.spec.ts': 'export {}\n',
  'packages/skill/skill-filesystem/README.md': '# Local skill provider\n',
  'packages/skill/skill-filesystem/package.json': '{"name":"@deepseek-ai/dsh-skill-filesystem"}\n',
  'packages/skill/skill-filesystem/src/index.ts': 'export {}\n',
  'packages/skill/skill-filesystem/src/invariant.ts': 'export {}\n',
  'packages/skill/skill-filesystem/tests/skill-filesystem.spec.ts': 'export {}\n',
}

/** Materialize a stable package inventory inside the isolated session workspace. */
async function seedPackageInventory(workspaceRoot: string): Promise<void> {
  for (const [relativePath, content] of Object.entries(PACKAGE_FILES)) {
    const path = join(workspaceRoot, 'workspace', relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
}

/** Goal-owned round numbers in durable user-message order. */
function goalRounds(events: readonly SessionEvent[]): number[] {
  return events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'goal'
    ? [event.data.source.round]
    : [])
}

/** Preserve historical chunks while completing against the revision produced by human acceptance. */
async function writeCurrentReplay(path: string): Promise<number> {
  const script = loadReplayScript({ file: FIXTURE, overrideFile: OVERRIDE })
  expect(script).toHaveLength(12)
  let adapted = 0
  const completionArgs = JSON.stringify({
    goal_id: '{{fromRequest:goal-[0-9a-f-]+}}', revision: REQUIRED_TASKS.length + 1, action: 'complete',
  })
  for (const entry of script) {
    if (entry.kind !== 'chunks') throw new Error('Goal actions fixture requires finite chunk entries')
    entry.chunks = entry.chunks.map((chunk) => {
      if (chunk.type === 'tool-call-delta' && chunk.name === 'update_goal') {
        expect(JSON.parse(chunk.argumentsDelta)).toMatchObject({ action: 'complete', revision: 1 })
        adapted += 1
        return { ...chunk, argumentsDelta: completionArgs }
      }
      if (chunk.type === 'block-end' && chunk.block.type === 'tool-call' && chunk.block.name === 'update_goal') {
        expect(JSON.parse(chunk.block.arguments)).toMatchObject({ action: 'complete', revision: 1 })
        adapted += 1
        return { ...chunk, block: { ...chunk.block, arguments: completionArgs } }
      }
      return chunk
    })
  }
  expect(adapted).toBe(2)
  await writeFile(path, JSON.stringify(script))
  return script.length
}

/** Cancelled turns must also release the model's acceptance barrier. */
async function waitForAcceptance(accepted: Promise<void>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  let abort: () => void = () => undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => { reject(new Error('Goal acceptance wait was aborted')) }
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    await Promise.race([accepted, cancelled])
    signal.throwIfAborted()
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

describe.skipIf(MODE === 'record')('web e2e: Goal keeps one assistant action row per completed turn', () => {
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let page: Page
  let replayDir: string | undefined
  let sessionId: SessionId | undefined
  let releaseAcceptance: (() => void) | undefined

  afterEach(async () => {
    const failures: unknown[] = []
    const agent = sessionId === undefined ? undefined : scaffold?.ctx.agents.get(sessionId)
    if (agent !== undefined) {
      agent.cancel({ kind: 'user' })
      releaseAcceptance?.()
      await agent.whenIdle().catch((error: unknown) => failures.push(error))
    }
    releaseAcceptance = undefined
    sessionId = undefined
    await browser?.close().catch((error: unknown) => failures.push(error))
    browser = undefined
    const closing = scaffold
    scaffold = undefined
    await closing?.close().catch((error: unknown) => failures.push(error))
    if (replayDir !== undefined) {
      await rm(replayDir, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
      replayDir = undefined
    }
    if (failures.length > 0) throw new AggregateError(failures, 'goal-multi-turn-actions teardown failed')
  })

  it('keeps actions on both completed Goal turn tails after public human acceptance', async () => {
    const historical = parseSessionLog(await readFile(FIXTURE, 'utf8'))
    expect(historical.flatMap(event => event.type === 'goal/change' && event.data.operation === 'create'
      ? [event.data.goal.objective] : [])).toEqual([PROMPT])
    expect(goalRounds(historical)).toEqual([1, 2])
    replayDir = await mkdtemp(join(tmpdir(), 'dsh-web-goal-actions-'))
    const currentReplay = join(replayDir, 'current.replay.override.json')
    const expectedRequests = await writeCurrentReplay(currentReplay)
    scaffold = await launchWebScaffold({
      replayFixture: FIXTURE, replayOverride: currentReplay, compareReplaySession: true,
    })
    const world = scaffold
    await seedPackageInventory(world.workspaceCwd)
    const events: SessionEvent[] = []
    world.ctx.on('session/event', (session, event: SessionEvent) => {
      events.push(event)
      if (event.type === 'goal/change' && event.data.operation === 'create') sessionId = session.id
    })
    const accepted = Promise.withResolvers<undefined>()
    releaseAcceptance = () => { accepted.resolve(undefined) }
    let requests = 0
    let waitingForAcceptance = false
    world.ctx.on('llm/stream', (options, next): AsyncIterable<StreamChunk> => {
      requests += 1
      return (async function* () {
        if (requests > expectedRequests) throw new Error('Goal actions requested an unrecorded model call')
        for await (const chunk of next()) {
          yield chunk
          if (chunk.type !== 'block-end' || chunk.block.type !== 'text'
            || !chunk.block.text.startsWith('**Turn 2 / 2**')) continue
          if (options.signal === undefined) throw new Error('Goal actions requires a turn signal')
          waitingForAcceptance = true
          await waitForAcceptance(accepted.promise, options.signal)
        }
      })()
    }, { prepend: true })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    const tripwire = watchConsole(page)
    await page.goto(world.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, world.workspaceCwd)
    onTestFailed(() => saveFailureShot(page, 'web-e2e-goal-multi-turn-actions'))
    const input = page.locator('[data-composer-input]').first()
    await input.fill(COMMAND)
    await input.press('Enter')
    await expect.poll(() => waitingForAcceptance, { timeout: 30_000 }).toBe(true)
    expect(requests).toBe(10)
    expect(goalRounds(events)).toEqual([1, 2])
    expect(events.filter(event => event.type === 'turn/end').map(event => event.data.turn)).toEqual([1])
    const firstTail = page.locator('[data-turn-tail="1"]')
    await firstTail.getByRole('button', { name: 'Branch into a new conversation', exact: true }).waitFor()
    await page.getByText('Turn 2 / 2', { exact: true }).waitFor()
    const structures = page.locator('code')
    await expect.poll(() => structures.allTextContents(), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([expect.stringContaining('token-meter')]))
    if (sessionId === undefined) throw new Error('Goal creation did not identify its session')
    const agent = world.ctx.agents.get(sessionId)
    if (agent === undefined) throw new Error('Goal actions agent is unavailable')
    const pending = world.ctx.goals.get(agent)
    expect(pending).toMatchObject({ phase: 'active', revision: 1,
      taskManifest: { tasks: REQUIRED_TASKS.map(task => ({ ...task, status: 'PENDING' })) } })
    for (const [index, task] of REQUIRED_TASKS.entries()) {
      const doneBefore = events.filter(event => event.type === 'command/done').length
      await input.fill(`/goal accept ${task.id}`)
      await input.press('Enter')
      await expect.poll(() => events.filter(event => event.type === 'command/done').length, { timeout: 10_000 })
        .toBe(doneBefore + 1)
      expect(events.filter(event => event.type === 'command/done').at(-1)?.data.kind).toBe('success')
      expect(world.ctx.goals.get(agent)).toMatchObject({ phase: 'active', revision: index + 2 })
      await expect.poll(() => input.textContent(), { timeout: 10_000 }).toBe('')
    }
    expect(world.ctx.goals.get(agent)?.taskManifest?.tasks.map(task => task.status)).toEqual(['ACCEPTED'])
    // Acceptance advances the goal revision; same-turn human steering authorizes completion.
    const steeringResponse = page.waitForResponse('**/api/session/prompt')
    await input.fill(COMPLETE)
    await input.press('Control+Enter')
    const response = await steeringResponse
    const steeringResult: unknown = await response.json()
    expect(steeringResult).toMatchObject({ result: { ok: true, value: { accepted: true } } })
    await page.locator('[data-pending-steering]').filter({ hasText: COMPLETE }).waitFor({ timeout: 10_000 })
    expect(agent.inbox.nextStep.some(message => message.source.kind === 'user'
      && message.content.some(block => block.type === 'text' && block.text === COMPLETE))).toBe(true)
    accepted.resolve(undefined)
    await expect.poll(() => events.filter(event => event.type === 'turn/end').length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
    await agent.whenIdle()
    await world.ctx.sessions.flush(agent.session)
    expect(events.filter(event => event.type === 'tool/result' && event.data.message.isError === true)).toEqual([])
    expect(world.ctx.goals.get(agent)).toMatchObject({ phase: 'complete', revision: 3, roundsStarted: 2 })
    expect(requests).toBe(expectedRequests)
    expect(goalRounds(events)).toEqual([1, 2])
    expect(events.filter(event => event.type === 'turn/end').map(event => event.data.reason.kind))
      .toEqual(['completed', 'completed'])
    expect(events.filter(event => event.type === 'request/header').map(event => event.data.reason))
      .toEqual(['initial', 'series'])
    expect(events.filter(event => event.type === 'command/run').map(event => event.data.args?.trim()))
      .toEqual([COMMAND.slice('/goal '.length), 'accept two-turn-output'])
    expect(events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
      ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []) : []))
      .toEqual([COMPLETE])
    await expect.poll(() => page.locator('[data-turn-process]').count(), { timeout: 15_000 }).toBe(2)
    expect(await page.getByRole('button', { name: 'System prompt', exact: true }).count()).toBe(0)
    expect(await page.locator('[data-chat-flow-kind="system-prompt"]').count()).toBe(0)
    await expect.poll(() => page.locator('[data-turn-tail]').count(), { timeout: 15_000 }).toBe(2)
    for (const turn of [1, 2]) {
      const tail = page.locator(`[data-turn-tail="${turn}"]`)
      for (const name of ['Copy', 'Good response', 'Bad response', 'Branch into a new conversation']) {
        expect(await tail.getByRole('button', { name, exact: true }).count()).toBe(1)
      }
      expect(await tail.getByRole('button', { name: 'Branch into a new conversation', exact: true })
        .getAttribute('aria-disabled')).toBeNull()
    }
    await page.locator('[data-turn-tail="2"]').getByRole('button', { name: 'Branch into a new conversation', exact: true }).focus()
    // Harvest changed human input before the scaffold matches and validates its canonical Session.
    if (MODE === 'refresh') await recordFixture(world, sessionId, FIXTURE)
    await compareOrRefreshGolden(UI_EXPECTED, await captureStableAria(page, '[class*="centerCol"]', world.workspaceCwd), MODE)
    await compareOrRefreshGolden(UI_EXPANDED_EXPECTED, await captureExpandedTurnProcessAria(
      page, '[class*="centerCol"]', world.workspaceCwd,
    ), MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it('keeps the historical fixture inventory unchanged', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'replay.override.json', 'session.v3.jsonl', 'ui.expected.md', 'ui-expanded.expected.md',
    ])
  })
})
