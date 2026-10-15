import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import LocalSpillStore from '../src/index.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

describe('durable full-spill capture', () => {
  it('aborts captures and waits for storage cleanup before disposal completes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-spill-dispose-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalAttachmentStore, { dshHome: join(root, 'home') })
    const fiber = ctx.plugin(LocalSpillStore, { root: join(root, 'spill'), cleanupPeriodDays: 0, captureAttachments: true })
    await fiber.await()
    const store = ctx.spillStore
    const session = ctx.sessions.create(SessionId('disposing-capture'))
    const started = Promise.withResolvers<AbortSignal>()
    const release = Promise.withResolvers<undefined>()
    const save = ctx.attachments.saveFileStream.bind(ctx.attachments)
    vi.spyOn(ctx.attachments, 'saveFileStream').mockImplementation(async (input) => {
      started.resolve(input.signal ?? new AbortController().signal)
      await release.promise
      return save({ data: input.data, ...input.name === undefined ? {} : { name: input.name } })
    })
    const input = {
      owner: { sessionId: session.header.id },
      source: { kind: 'tool' as const, toolName: 'grep', callId: ToolCallId('dispose'), label: 'result' },
      suggestedName: 'grep.txt', content: 'full result',
    }
    const pending = store.saveText(input)
    const outcome = pending.then(() => null, (error: unknown) => error)
    const signal = await started.promise
    let disposed = false
    const disposal = fiber.dispose().then(() => { disposed = true })
    try {
      await vi.waitFor(() => { expect(signal.aborted).toBe(true) })
      expect(disposed).toBe(false)
    } finally { release.resolve(undefined) }
    await disposal
    expect(await outcome).toBeInstanceOf(Error)
    expect(session.snapshotEvents().some(event => event.type === 'spill/artifact')).toBe(false)
    await expect(store.saveText(input)).rejects.toThrow()
  })

  it('preserves full spilled text after its temporary locator is removed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-spill-capture-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalAttachmentStore, { dshHome: join(root, 'home') })
    await ctx.plugin(LocalSpillStore, { root: join(root, 'spill'), cleanupPeriodDays: 0, captureAttachments: true })
    const session = ctx.sessions.create(SessionId('capture-owner'))
    const content = 'full search evidence\n' + 'ação 🐢\n'.repeat(20_000)
    const ref = await ctx.spillStore.saveText({
      owner: { sessionId: session.header.id },
      source: { kind: 'tool', toolName: 'grep', callId: ToolCallId('capture-call'), label: 'result' },
      suggestedName: 'grep-results.txt', content,
    })
    const captured = session.snapshotEvents().filter(event => event.type === 'spill/artifact')
    expect(captured).toHaveLength(1)
    expect(await readFile(ref.locator, 'utf8')).toBe(content)
    await rm(ref.locator)
    const saved = captured[0]!
    expect(saved.data.locator).toBe(ref.locator)
    const chunks: Uint8Array[] = []
    for await (const chunk of ctx.attachments.readFileStream(saved.data.attachment)) chunks.push(chunk)
    expect(Buffer.concat(chunks).toString('utf8')).toBe(content)
  })

  it('rejects capture without its services or a live owner instead of declaring success', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-spill-missing-owner-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    await ctx.plugin(LocalSpillStore, { root, cleanupPeriodDays: 0, captureAttachments: true })
    const input = {
      owner: { sessionId: SessionId('absent') },
      source: { kind: 'session-reference' as const, sessionId: SessionId('source'), label: 'source' },
      suggestedName: 'source.txt', content: 'evidence',
    }
    await expect(ctx.spillStore.saveText(input)).rejects.toThrow('live owner Session')
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalAttachmentStore, { dshHome: join(root, 'home') })
    await expect(ctx.spillStore.saveText(input)).rejects.toThrow('live owner Session')
    const session = ctx.sessions.create(input.owner.sessionId)
    const aborted = AbortSignal.abort()
    await expect(ctx.spillStore.saveText({ ...input, signal: aborted })).rejects.toThrow()
    expect(session.snapshotEvents().some(event => event.type === 'spill/artifact')).toBe(false)
  })

  it('leaves no capture event when attachment storage fails and closes the source stream', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-spill-failed-capture-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalAttachmentStore, { dshHome: join(root, 'home') })
    await ctx.plugin(LocalSpillStore, { root: join(root, 'spill'), cleanupPeriodDays: 0, captureAttachments: true })
    const session = ctx.sessions.create(SessionId('failed-capture'))
    const failure = new Error('attachment unavailable')
    vi.spyOn(ctx.attachments, 'saveFileStream').mockRejectedValue(failure)
    await expect(ctx.spillStore.saveText({
      owner: { sessionId: session.header.id },
      source: { kind: 'tool', toolName: 'grep', callId: ToolCallId('failed-capture'), label: 'result' },
      suggestedName: 'grep.txt', content: 'full result',
    })).rejects.toBe(failure)
    expect(session.snapshotEvents().some(event => event.type === 'spill/artifact')).toBe(false)
  })
})
