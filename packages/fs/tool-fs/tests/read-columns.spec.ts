/** Bounded column reads over real UTF-8 files and the observation policy. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import { readMetaFromMeta } from '../src/read-render.ts'

describe('bounded read columns', () => {
  let dir: string
  let ctx: Context
  let fiber: Awaited<ReturnType<Context['plugin']>>
  let callId = 0
  const agent = { session: { header: {} } }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-read-columns-'))
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    provideWorkingDirectoryFixture(ctx, dir)
    await ctx.plugin(LocalFileSystem, { cwd: dir })
    await ctx.plugin(FsPolicy)
    fiber = await ctx.plugin(ToolFs, { readStreamMinSize: 1 })
  })

  afterEach(async () => {
    await fiber.dispose()
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  function call(name: string, args: object) {
    return executeToolFixture(ctx, {
      signal: new AbortController().signal,
      callId: ToolCallId(`column-${++callId}`),
      name, arguments: args, agent: agent as never,
    })
  }

  function text(result: { content: { type: string; text?: string }[] }) {
    return result.content.map(block => block.text ?? '').join('')
  }

  it('recovers text beyond the 2000-unit cap and persists its first-line column', async () => {
    await writeFile(join(dir, 'long.txt'), `header\n${'x'.repeat(2000)}😀tail\nnext\n`)
    const first = await call('read', { file_path: 'long.txt', offset: 2, limit: 1 })
    expect(first.isError).toBe(false)
    expect(text(first)).toContain('offset=2, column=2001')
    expect(text(first)).not.toContain('😀tail')
    const args = { file_path: 'long.txt', offset: 2, column: 2001, limit: 2 }
    const recovered = await call('read', args)
    expect(recovered.isError).toBe(false)
    expect(text(recovered)).toContain('2: (column 2001) 😀tail')
    expect(text(recovered)).toContain('3: next')
    expect(recovered.meta).toMatchObject({
      offset: 2, totalLines: 3,
      lines: [{ number: 2, column: 2001, text: '(column 2001) 😀tail' }, { number: 3, text: 'next' }],
    })
    const replayed = JSON.parse(JSON.stringify(recovered)) as typeof recovered
    expect(ctx.tools.get('read')?.presentResult?.(args, replayed)).toMatchObject({
      card: 'read', lines: [{ number: 2, text: '(column 2001) 😀tail' }, { number: 3, text: 'next' }],
    })
    expect(text(await call('edit', { file_path: 'long.txt', old_string: '😀tail', new_string: 'recovered' }))).toContain('has been updated successfully')
    expect(await readFile(join(dir, 'long.txt'), 'utf8')).toContain('recovered')
  })

  it('recovers Unicode after a prefix spanning real stream chunks', async () => {
    // The astral character straddles the local provider's 64 KiB read boundary.
    await writeFile(join(dir, 'unicode.txt'), `${'x'.repeat(65535)}😀中tail\r\nnext`)
    const result = await call('read', { file_path: 'unicode.txt', column: 65536, limit: 2 })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('1: (column 65536) 😀中tail')
    expect(text(result)).toContain('2: next')
    expect(text(result)).not.toContain('\uFFFD')
    expect(result.meta).toMatchObject({ totalLines: 2 })
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid column %s before observing a file', async (column) => {
    await writeFile(join(dir, 'file.txt'), 'abc')
    const result = await call('read', { file_path: 'file.txt', column })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('column must be a positive safe integer')
    expect(text(await call('edit', { file_path: 'file.txt', old_string: 'abc', new_string: 'changed' }))).toContain('file has not been read')
  })

  it.each([
    ['abc', 4, 'out of range'],
    ['', 2, 'out of range'],
    ['a😀b', 3, 'splits a UTF-16 surrogate pair'],
  ])('rejects unavailable columns in %j without authorizing mutation', async (content, column, diagnostic) => {
    await writeFile(join(dir, 'file.txt'), content)
    const result = await call('read', { file_path: 'file.txt', column })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain(diagnostic)
    expect(text(await call('write', { file_path: 'file.txt', content: 'changed' }))).toContain('file has not been read')
    expect(await readFile(join(dir, 'file.txt'), 'utf8')).toBe(content)
  })

  it('keeps successful observations version-guarded after a column read', async () => {
    await writeFile(join(dir, 'file.txt'), 'prefixTAIL')
    expect((await call('read', { file_path: 'file.txt', column: 7 })).isError).toBe(false)
    await writeFile(join(dir, 'file.txt'), 'external change')
    expect(text(await call('edit', { file_path: 'file.txt', old_string: 'change', new_string: 'changed' }))).toContain('changed since')
    expect(await readFile(join(dir, 'file.txt'), 'utf8')).toBe('external change')
  })

  it('does not authorize mutation when the byte budget cannot return a Unicode character and metadata', async () => {
    await fiber.dispose()
    fiber = await ctx.plugin(ToolFs, { readStreamMinSize: 1, readMaxLineLength: 2, readMaxBytes: 1 })
    await writeFile(join(dir, 'file.txt'), '😀tail')
    const result = await call('read', { file_path: 'file.txt' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('increase readMaxBytes and retry')
    expect(text(await call('write', { file_path: 'file.txt', content: 'changed' }))).toContain('file has not been read')
    expect(await readFile(join(dir, 'file.txt'), 'utf8')).toBe('😀tail')
  })

  it('reconstructs streamed file text through compact, replayable continuation pages', async () => {
    await fiber.dispose()
    fiber = await ctx.plugin(ToolFs, { readStreamMinSize: 1, readMaxLineLength: 5, readMaxBytes: 50 })
    const source = 'ab😀é中🚀cd'.repeat(3)
    await writeFile(join(dir, 'file.txt'), `header\n${source}\r\nlast\n`)
    let column = 1
    let reconstructed = ''
    let complete = false
    for (let page = 0; page < source.length; page++) {
      const args = { file_path: 'file.txt', offset: 2, column, limit: 1 }
      const result = await call('read', args)
      expect(result.isError).toBe(false)
      const meta = readMetaFromMeta(JSON.parse(JSON.stringify(result.meta)))
      const line = meta?.lines[0]
      if (line === undefined) throw new Error('expected a replayable read line')
      expect(meta?.totalLines).toBe(3)
      expect(line.number).toBe(2)
      expect(line.column ?? 1).toBe(column)
      expect(Buffer.byteLength(line.text)).toBeLessThanOrEqual(50)
      expect(text(result)).toContain(`2: ${line.text}`)
      expect(ctx.tools.get('read')?.presentResult?.(args, result)).toMatchObject({ lines: [line] })
      const next = line.nextColumn ?? source.length + 1
      expect(next).toBeGreaterThan(column)
      const prefix = column > 1 ? `(column ${column}) ` : ''
      reconstructed += line.text.slice(prefix.length, prefix.length + next - column)
      if (line.nextColumn === undefined) {
        complete = true
        break
      }
      expect(line.text).toContain(`[offset=2,column=${next}]`)
      column = line.nextColumn
    }
    expect(complete).toBe(true)
    expect(reconstructed).toBe(source)
  })
})
