/** Explicit deliveries commit only after a successful final tool result. */
import { mkdtemp, rm, writeFile, symlink, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { FsError } from '@deepseek-ai/dsh-fs'
import { AttachmentError, type FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { turnBoundaryProjectionDefinition } from '@deepseek-ai/dsh-agent-loop'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import * as Present from '../src/index.ts'

const cleanups: Array<() => Promise<unknown>> = []
let callNumber = 0
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  vi.restoreAllMocks()
})
async function agent(ctx: Context, cwd: string | undefined): Promise<Agent> {
  const id = SessionId(`present-owner-${++callNumber}`)
  let scope: Scope
  const session = ctx.sessions.create(id, { meta: { ...cwd === undefined ? {} : { cwd } } })
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    get ctx() { return scope.ctx },
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, value) }, { inject: ['tools'] }))
  await ctx.agents.register(value)
  return value
}


async function setup(config: Partial<Present.Config> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-present-minimal-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(LocalAttachmentStore, { dshHome: join(root, 'home') })
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
  const fiber = ctx.plugin(Present, { maxFileBytes: Present.Config().maxFileBytes, maxFiles: 2, ...config })
  await fiber
  const owner = await agent(ctx, root)
  owner.session.append('turn/start', { turn: 1 })
  const execute = (files: unknown, signal = new AbortController().signal) => ctx.tools.execute({
    signal, callId: ToolCallId(`call-${++callNumber}`),
    name: 'present', arguments: { files }, agent: owner,
  })
  return { ctx, owner, root, fiber, execute }
}

describe('present', () => {
  it('preserves presented binary bytes and their digest after source edits and deletion', async () => {
    const { ctx, owner, root, execute, fiber } = await setup()
    const data = Uint8Array.of(80, 75, 0, 255)
    const source = join(root, '报告.docx')
    await writeFile(source, data)
    const read = vi.spyOn(ctx.fs, 'readBytes')
    const result = await execute([{ path: '报告.docx', description: 'Report' }])
    expect(result.isError).toBe(false)
    const files = owner.session.snapshotEvents().find(event => event.type === 'deliverables/presented')?.data.files
    expect(files).toEqual([{
      path: '报告.docx', description: 'Report', capture: { status: 'stored', attachment: {
        attachmentId: `sha256:${createHash('sha256').update(data).digest('hex')}`, name: '报告.docx', bytes: 4,
      } },
    }])
    if (result.isError) throw new Error('present failed')
    expect(result.value).toEqual({ turn: 1, files })
    expect(read).toHaveBeenCalledWith(expect.anything(), expect.any(AbortSignal), 20 * 1024 * 1024)
    const capture = files?.[0]?.capture
    if (capture?.status !== 'stored') throw new Error('missing captured reference')
    await writeFile(source, 'edited')
    expect(await storedBytes(ctx, capture.attachment)).toEqual(data)
    await unlink(source)
    expect(await storedBytes(ctx, capture.attachment)).toEqual(data)
    await fiber.dispose()
    expect(ctx.tools.get('present', owner)).toBeUndefined()
  })

  it('ignores a different present definition in the calling agent scope', async () => {
    const { owner, execute } = await setup()
    owner.ctx.tools.register(defineTool({
      name: 'present', description: 'Scoped replacement.', parameters: {},
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            turn: { type: 'integer', required: true },
            files: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: () => [],
      },
      execute: async () => ({ turn: 1, files: [] }),
    }))
    expect((await execute([])).isError).toBe(false)
    expect(owner.session.snapshotEvents().filter(event => event.type === 'deliverables/presented')).toEqual([])
  })

  it('records once when ancestor and agent scopes both mount present', async () => {
    const { owner, root, execute } = await setup()
    await owner.ctx.plugin(Present, { maxFileBytes: Present.Config().maxFileBytes, maxFiles: 2 })
    await writeFile(join(root, 'a'), 'a')
    expect((await execute([{ path: 'a' }])).isError).toBe(false)
    const deliveries = owner.session.snapshotEvents().filter(event => event.type === 'deliverables/presented')
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.data.files[0]?.path).toBe('a')
  })

  it('does not publish deliveries after post-execute blocks a successful declaration', async () => {
    const { ctx, root, owner, execute } = await setup()
    await writeFile(join(root, 'a'), 'a')
    ctx.on('tools/post-execute', async (_exec, _result, next) => {
      await next()
      return { kind: 'block', feedback: [{ type: 'text', text: 'blocked' }] }
    })
    expect((await execute([{ path: 'a' }])).isError).toBe(true)
    expect(owner.session.snapshotEvents().some(event => event.type === 'deliverables/presented')).toBe(false)
  })

  it('rejects missing, non-file, empty, and excessive inputs', async () => {
    const { root, owner, execute } = await setup()
    await writeFile(join(root, 'large'), 'four')
    await symlink(tmpdir(), join(root, 'outside'))
    for (const files of [[], [{ path: '' }], [{ path: 'missing' }], [{ path: '.' }], [{ path: 'outside' }], [{ path: 'large' }, { path: 'large' }, { path: 'large' }]]) {
      const result = await execute(files)
      expect(result.isError, JSON.stringify(files)).toBe(true)
    }
    expect(owner.session.snapshotEvents().some(event => event.type === 'deliverables/presented')).toBe(false)
  })


})


it('validates deployment limits before registering the tool', () => {
  for (const config of [{ maxFiles: 0 }, { maxFiles: 1.5 }, { maxFiles: Number.POSITIVE_INFINITY }]) {
    expect(() => { Present.apply(new Context(), { ...config, maxFileBytes: 20 * 1024 * 1024 }) }).toThrow('positive integer maxFiles')
  }
})

it('requires an agent, an open turn, and a workspace', async () => {
  const { ctx, owner, execute } = await setup()
  const detached = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('detached'), name: 'present', arguments: { files: [{ path: 'a' }] } })
  expect(detached.isError).toBe(true)
  owner.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  expect((await execute([{ path: 'a' }])).isError).toBe(true)
  const noWorkspace = await agent(ctx, undefined)
  noWorkspace.session.append('turn/start', { turn: 1 })
  const absent = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('no-workspace'), name: 'present', arguments: { files: [{ path: 'a' }] }, agent: noWorkspace })
  expect(absent.isError).toBe(true)
})


it('declares readable files outside the Session directory using absolute and relative paths', async () => {
  const { root, execute, owner } = await setup()
  const outside = await mkdtemp(join(tmpdir(), 'dsh-present-external-'))
  cleanups.push(() => rm(outside, { recursive: true, force: true }))
  const file = join(outside, 'report.txt')
  await writeFile(file, 'external report')
  const files = [{ path: file }, { path: relative(root, file) }]
  expect((await execute(files)).isError).toBe(false)
  const captured = owner.session.snapshotEvents().find(event => event.type === 'deliverables/presented')?.data.files
  expect(captured?.map(({ path }) => ({ path }))).toEqual(files)
  expect(captured?.[0]?.capture).toEqual(captured?.[1]?.capture)
  expect(captured?.[0]?.capture?.status).toBe('stored')
})

it('refuses a final symlink to an ordinary file', async () => {
  const { root, execute } = await setup()
  await writeFile(join(root, 'source'), 'source')
  await symlink(join(root, 'source'), join(root, 'link'))
  expect((await execute([{ path: 'link' }])).isError).toBe(true)
})


it('refuses a file replaced by a directory after inspecting its final component', async () => {
  const { ctx, root, execute } = await setup()
  await writeFile(join(root, 'source'), 'source')
  const directory = await ctx.fs.stat(await ctx.fs.resolve(root))
  vi.spyOn(ctx.fs, 'stat').mockResolvedValueOnce(directory)
  expect((await execute([{ path: 'source' }])).isError).toBe(true)
})

async function storedBytes(ctx: Context, ref: FileAttachmentRef): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of ctx.attachments.readFileStream(ref)) chunks.push(chunk)
  return new Uint8Array(Buffer.concat(chunks))
}

it('validates the capture byte limit at schema parse and direct registration', () => {
  expect(Present.Config().maxFileBytes).toBe(20 * 1024 * 1024)
  expect(Present.Config({ maxFiles: 2, maxFileBytes: 1 }).maxFileBytes).toBe(1)
  for (const maxFileBytes of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER]) {
    expect(() => Present.Config({ maxFiles: 2, maxFileBytes })).toThrow()
    expect(() => { Present.apply(new Context(), { maxFiles: 2, maxFileBytes }) }).toThrow('positive integer maxFileBytes')
  }
})

it('captures empty and exact-limit files but records oversized files without reading them', async () => {
  const { ctx, root, owner, execute } = await setup({ maxFiles: 3, maxFileBytes: 4 })
  await writeFile(join(root, 'empty'), '')
  await writeFile(join(root, 'exact'), 'éé')
  await writeFile(join(root, 'large'), 'ééx')
  const read = vi.spyOn(ctx.fs, 'readBytes')
  const result = await execute([{ path: 'empty' }, { path: 'exact' }, { path: 'large' }])
  expect(result.isError).toBe(false)
  const files = owner.session.snapshotEvents().find(event => event.type === 'deliverables/presented')?.data.files
  expect(files?.map(file => file.capture?.status)).toEqual(['stored', 'stored', 'too-large'])
  expect(files?.[2]).toEqual({ path: 'large', capture: { status: 'too-large', maxBytes: 4 } })
  expect(read).toHaveBeenCalledTimes(2)
  expect(result.content).toEqual([{ type: 'text', text: 'Presented empty\nPresented exact\nPresented large (not saved: exceeds 4 bytes; keep the original file)' }])
})

it('records an oversized outcome when a file grows before its bounded read', async () => {
  const { ctx, root, owner, execute } = await setup({ maxFileBytes: 4 })
  await writeFile(join(root, 'growing'), 'a')
  const read = ctx.fs.readBytes.bind(ctx.fs)
  vi.spyOn(ctx.fs, 'readBytes').mockImplementationOnce(async (...args) => {
    await writeFile(join(root, 'growing'), '12345')
    return read(...args)
  })
  expect((await execute([{ path: 'growing' }])).isError).toBe(false)
  expect(owner.session.snapshotEvents().find(event => event.type === 'deliverables/presented')?.data.files)
    .toEqual([{ path: 'growing', capture: { status: 'too-large', maxBytes: 4 } }])
})

it('reads through the filesystem provider when metadata omits the size', async () => {
  const { ctx, root, owner, execute } = await setup()
  await writeFile(join(root, 'source'), 'bytes')
  const info = await ctx.fs.stat(await ctx.fs.resolve('source'))
  if (info === undefined) throw new Error('fixture file missing')
  const { size: _size, ...withoutSize } = info
  vi.spyOn(ctx.fs, 'stat').mockResolvedValueOnce(withoutSize)
  expect((await execute([{ path: 'source' }])).isError).toBe(false)
  expect(owner.session.snapshotEvents().find(event => event.type === 'deliverables/presented')?.data.files[0]?.capture?.status).toBe('stored')
})

it('publishes no declaration when a later filesystem read is denied', async () => {
  const { ctx, root, owner, execute } = await setup()
  await writeFile(join(root, 'first'), 'one')
  await writeFile(join(root, 'denied'), 'two')
  const read = ctx.fs.readBytes.bind(ctx.fs)
  vi.spyOn(ctx.fs, 'readBytes').mockImplementationOnce(read).mockRejectedValueOnce(new FsError('denied', 'FS_IO_ERROR'))
  expect((await execute([{ path: 'first' }, { path: 'denied' }])).isError).toBe(true)
  expect(owner.session.snapshotEvents().some(event => event.type === 'deliverables/presented')).toBe(false)
})

it('publishes no declaration when attachment storage refuses the write', async () => {
  const { ctx, root, owner, execute } = await setup()
  await writeFile(join(root, 'source'), 'bytes')
  vi.spyOn(ctx.attachments, 'saveFileStream').mockRejectedValueOnce(new AttachmentError('unsupported', 'ATTACHMENT_FILES_UNSUPPORTED'))
  expect((await execute([{ path: 'source' }])).isError).toBe(true)
  expect(owner.session.snapshotEvents().some(event => event.type === 'deliverables/presented')).toBe(false)
})

it.each(['read', 'write'] as const)('publishes no declaration when cancelled during capture %s', async (phase) => {
  const { ctx, root, owner, execute } = await setup()
  await writeFile(join(root, 'source'), 'bytes')
  const controller = new AbortController()
  const cancellation = new Error('capture cancelled')
  if (phase === 'read') {
    vi.spyOn(ctx.fs, 'readBytes').mockImplementationOnce(async () => {
      controller.abort(cancellation)
      throw cancellation
    })
  } else {
    const save = ctx.attachments.saveFileStream.bind(ctx.attachments)
    vi.spyOn(ctx.attachments, 'saveFileStream').mockImplementationOnce(async (input) => {
      const ref = await save(input)
      controller.abort(cancellation)
      return ref
    })
  }
  expect((await execute([{ path: 'source' }], controller.signal)).isError).toBe(true)
  expect(owner.session.snapshotEvents().some(event => event.type === 'deliverables/presented')).toBe(false)
})
