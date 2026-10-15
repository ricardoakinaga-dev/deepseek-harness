/** Shipped Web activity with a scripted model and a real foreground tool; not real-model evidence. */
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import { launchWebScaffold, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const READY = '.activity-tool-ready'
const RELEASE = '.activity-tool-release'
const DONE = 'Activity fixture completed.'
const callId = ToolCallId('activity-held-bash')

function script(): ReplayEntry[] {
  const args = JSON.stringify({
    command: `: > ${READY}; while [ ! -f ${RELEASE} ]; do sleep 0.02; done; printf 'released\\n'`,
    description: 'Wait for the activity fixture release',
    timeoutMs: 60_000,
  })
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name: 'bash', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'bash', arguments: args } },
    { type: 'usage', usage: { inputTokens: 20, outputTokens: 8 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
  return [
    { kind: 'chunks', chunks },
    { kind: 'chunks', chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: DONE },
      { type: 'block-end', index: 0, block: { type: 'text', text: DONE } },
      { type: 'usage', usage: { inputTokens: 20, outputTokens: 8 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] },
  ]
}

describe.skipIf(webSnapshotMode() === 'record')('web e2e: recorded Session activity', () => {
  let scratch: string | undefined
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let page: Page
  let workspace: string | undefined
  let settled: Promise<unknown> | undefined

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-web-session-activity-'))
    const fixture = join(scratch, 'session.jsonl')
    const override = join(scratch, 'replay.override.json')
    await writeFile(fixture, '{"type":"session","version":0,"id":"primary","createdAt":0}\n')
    await writeFile(override, JSON.stringify(script()))
    scaffold = await launchWebScaffold({
      replayFixture: fixture, replayOverride: override, compareReplaySession: false,
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    workspace = join(scaffold.workspaceCwd, 'workspace')
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    // Release the owned foreground command before disposing its process and temporary workspace.
    if (workspace !== undefined) {
      await writeFile(join(workspace, RELEASE), '')
        .catch((error: unknown) => failures.push(error))
    }
    await settled?.catch((error: unknown) => failures.push(error))
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (scratch !== undefined) {
      await rm(scratch, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Session activity fixture teardown failed')
  })

  it('shows running tools and advancing recorded age before assistant prose, then retires the call', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-activity'))
    if (scaffold === undefined || workspace === undefined) throw new Error('activity scaffold did not start')
    const world = scaffold
    const selectedWorkspace = workspace
    settled = world.whenTurnSettled(60_000)
    // Register rejection handling immediately so assertion failure can still finish fixture cleanup.
    void settled.catch(() => undefined)
    const input = page.locator('[data-composer-input][contenteditable="true"]').first()
    await input.fill('Run the foreground activity fixture, then report completion.')
    await input.press('Enter')
    await expect.poll(() => existsSync(join(selectedWorkspace, READY)), { timeout: 30_000 }).toBe(true)
    const activity = page.getByRole('group', { name: 'Session activity', exact: true })
    await expect.poll(() => activity.textContent()).toContain('Outstanding tools: bash')
    expect(await page.getByText(DONE, { exact: true }).count()).toBe(0)
    await activity.focus()
    expect(await activity.evaluate(element => element === document.activeElement)).toBe(true)
    const time = activity.locator('time')
    expect(await time.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const first = await time.textContent()
    await expect.poll(() => time.textContent(), { timeout: 5_000 }).not.toBe(first)
    await writeFile(join(selectedWorkspace, RELEASE), '')
    await settled
    await expect.poll(() => activity.textContent()).toContain('not running')
    expect(await activity.textContent()).not.toContain('Outstanding tools:')
    await page.getByText(DONE, { exact: true }).waitFor()
  }, 90_000)
})
