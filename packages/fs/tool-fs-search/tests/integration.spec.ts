/**
 * Integration tests: the REAL local subprocess service plus the PACKAGED
 * ripgrep binary (`@vscode/ripgrep`), exercised through `executeToolFixture()`.
 * These verify the WORLD — actual files on disk are discovered and grepped,
 * hostile patterns stay inert (they are plain argv elements; there is no
 * shell layer to escape), and real `rg` stderr classifies into the
 * `SEARCH_*` vocabulary. The binary ships inside the npm dependency, so the
 * suite runs on every platform without a system `rg` install; the
 * fake-service suite (tools.spec.ts) carries the coverage gate.
 */
import { executeToolFixture, executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'

import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { TOOL_ABORTED_BEFORE_DISPATCH } from '@deepseek-ai/dsh-tools'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as ToolFsSearch from '@deepseek-ai/dsh-tool-fs-search'

const testToolSignal = new AbortController().signal

let dir: string
let ctx: Context
let searchFiber: Awaited<ReturnType<Context['plugin']>>

let callCounter = 0
function call(name: string, args: unknown, agentObj?: object) {
  return executeToolFixture(ctx, {
    signal: testToolSignal,
    callId: ToolCallId(`it-${++callCounter}`),
    name,
    arguments: args,
    ...agentObj ? { agent: agentObj as never } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

/** The fixture workspace as a session cwd, so relative paths resolve inside `dir`. */
const agent = () => ({ session: { header: { id: 'session-int', cwd: dir } } })

describe('search tools over the real subprocess service + the packaged rg', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-search-int-'))
    await mkdir(join(dir, 'src'), { recursive: true })
    await mkdir(join(dir, '.git'), { recursive: true })
    await mkdir(join(dir, 'spaced dir'), { recursive: true })
    await writeFile(join(dir, 'src', 'alpha.ts'), 'export const alpha = 1\n// TODO: refit alpha\n')
    await writeFile(join(dir, 'src', 'beta.ts'), 'export const beta = 2\n')
    await writeFile(join(dir, 'notes.md'), 'alpha appears here too\n')
    await writeFile(join(dir, '.hidden.ts'), 'export const hidden = 3\n')
    await writeFile(join(dir, '.git', 'config.ts'), 'never listed\n')
    await writeFile(join(dir, 'spaced dir', "wei'rd name.ts"), 'const inside = true\n')
    // Deterministic --sort=modified order: alpha oldest, beta newest.
    await utimes(join(dir, 'src', 'alpha.ts'), new Date(2000, 0, 1), new Date(2000, 0, 1))
    await utimes(join(dir, 'src', 'beta.ts'), new Date(2020, 0, 1), new Date(2020, 0, 1))

    ctx = new Context()

    provideWorkingDirectoryFixture(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(LocalSubprocessRuntime)
    searchFiber = await ctx.plugin(ToolFsSearch, { sampleOverCapGlobResults: true })
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  describe('glob', () => {
    it('classifies a narrow glob within 256 bytes despite a large unrelated listing', async () => {
      await writeFile(join(dir, '.gitignore'), 'src/alpha.ts\n')
      await writeFile(join(dir, '.ignore'), 'src/beta.ts\n')
      for (let index = 0; index < 40; index++) {
        await writeFile(join(dir, `unrelated-${index}-${'x'.repeat(120)}.md`), '')
      }
      const limited = new Context()
      provideWorkingDirectoryFixture(limited)
      try {
        await limited.plugin(SystemPrompt)
        await limited.plugin(ToolRuntime)
        await limited.plugin(NativeToolExecutor)
        await limited.plugin(LocalSubprocessRuntime)
        await limited.plugin(ToolFsSearch, { sampleOverCapGlobResults: true, rawOutputMaxBytes: 256 })
        const result = await executeModelToolFixture(limited, {
          signal: testToolSignal, callId: ToolCallId('narrow-ignore'), name: 'glob',
          arguments: { pattern: '*.ts', include_ignored: true }, agent: agent() as never,
        })
        expect(result.isError, text(result)).toBe(false)
        const lines = text(result).split('\n')
        expect(lines).toContain(`${join('src', 'alpha.ts')} [ignored by ignore rules]`)
        expect(lines).toContain(`${join('src', 'beta.ts')} [ignored by ignore rules]`)
        expect(lines).toContain('.hidden.ts')
        expect(lines).toContain(join('spaced dir', "wei'rd name.ts"))
        expect(lines).toHaveLength(4)
      } finally {
        await limited.fiber.dispose()
      }
    })

    it('labels ignored paths while retaining their real names and prioritizing non-ignored matches', async () => {
      await writeFile(join(dir, '.gitignore'), 'src/alpha.ts\n')
      await writeFile(join(dir, '.ignore'), 'src/beta.ts\n')
      const result = await call('glob', { pattern: '*.ts', include_ignored: true }, agent())
      expect(result.isError).toBe(false)
      const lines = text(result).split('\n')
      expect(lines).toContain(`${join('src', 'alpha.ts')} [ignored by ignore rules]`)
      expect(lines).toContain(`${join('src', 'beta.ts')} [ignored by ignore rules]`)
      expect(lines.indexOf('.hidden.ts')).toBeLessThan(lines.indexOf(`${join('src', 'alpha.ts')} [ignored by ignore rules]`))
    })

    it.each([0, 1])('enforces the combined real-listing budget with %s extra byte required', async (overBy) => {
      const listing = `${[join('src', 'alpha.ts'), join('src', 'beta.ts')].join('\n')}\n`
      const rawOutputMaxBytes = Buffer.byteLength(listing) * 2 - overBy
      await searchFiber.dispose()
      searchFiber = await ctx.plugin(ToolFsSearch, { sampleOverCapGlobResults: true, rawOutputMaxBytes })
      const result = await call('glob', { pattern: '*.ts', path: 'src' }, agent())
      expect(result.isError).toBe(overBy > 0)
      if (overBy === 0) expect(text(result).split('\n')).toEqual(listing.trimEnd().split('\n'))
      else {
        expect(result.error).toMatchObject({ info: { code: 'SEARCH_RAW_OUTPUT_OVERFLOW' } })
        expect(text(result)).toContain('ignore-respecting candidate listing')
        expect(text(result)).toContain('narrowing pattern does not reduce this listing')
      }
    })

    it('discovers source files by pattern, sorted by modification time, hidden and VCS metadata excluded', async () => {
      const result = await call('glob', { pattern: '**/*.ts' }, agent())
      expect(result.isError).toBe(false)
      const paths = text(result).split('\n')
      expect(paths.indexOf(join('src', 'alpha.ts'))).toBeLessThan(paths.indexOf(join('src', 'beta.ts')))
      expect(paths).not.toContain('.hidden.ts')
      expect(paths).toContain(join('spaced dir', "wei'rd name.ts"))
      expect(paths).not.toContain(join('.git', 'config.ts'))
      expect(paths).not.toContain('notes.md')
    })

    it('respects ignore rules and admits ignored and hidden files only on explicit inclusion', async () => {
      await writeFile(join(dir, '.gitignore'), 'node_modules/\n.next/\nvenv/\nignored.ts\n')
      await writeFile(join(dir, 'ignored.ts'), 'ignored\n')
      for (const name of ['node_modules', '.next', 'venv', 'generated']) {
        await mkdir(join(dir, name))
        await writeFile(join(dir, name, 'artifact.ts'), 'generated\n')
      }
      const normal = text(await call('glob', { pattern: '**/*.ts' }, agent())).split('\n')
      expect(normal).toContain(join('src', 'alpha.ts'))
      expect(normal).toContain(join('generated', 'artifact.ts'))
      for (const path of ['ignored.ts', '.hidden.ts', ...['node_modules', '.next', 'venv'].map(name => join(name, 'artifact.ts'))]) {
        expect(normal).not.toContain(path)
      }
      const included = text(await call('glob', { pattern: '**/*.ts', include_ignored: true }, agent())).split('\n')
      expect(included).toContain('.hidden.ts')
      expect(included).toContain('ignored.ts [ignored by ignore rules]')
      for (const name of ['node_modules', '.next', 'venv']) expect(included).toContain(`${join(name, 'artifact.ts')} [ignored by ignore rules]`)
      expect(included).not.toContain(join('.git', 'config.ts'))
      const excluded = text(await call('glob', {
        pattern: '**/*.ts', include_ignored: true,
        exclude: ['**/node_modules/**', '**/.next/**', '**/venv/**', '**/generated/**'],
      }, agent())).split('\n')
      expect(excluded).toContain('.hidden.ts')
      for (const name of ['node_modules', '.next', 'venv', 'generated']) expect(excluded).not.toContain(join(name, 'artifact.ts'))
      expect(text(await call('glob', { pattern: '*.ts', exclude: ['**/generated/**'] }, agent()))).not.toContain('artifact.ts')
    })

    it('respects .gitignore in a workspace without Git metadata', async () => {
      await rm(join(dir, '.git'), { recursive: true })
      await writeFile(join(dir, '.gitignore'), 'src/\nnotes.md\n')
      const result = await call('glob', { pattern: '*' }, agent())
      expect(result.isError).toBe(false)
      expect(text(result).split('\n')).toEqual([join('spaced dir', "wei'rd name.ts")])
    })

    it('scopes to a directory search root (path arg)', async () => {
      const result = await call('glob', { pattern: '*.ts', path: 'src' }, agent())
      expect(text(result).split('\n').sort()).toEqual([join('src', 'alpha.ts'), join('src', 'beta.ts')])
    })

    it('keeps exclusion expressions inert and retains ripgrep path-depth semantics', async () => {
      const canary = join(dir, 'pwned')
      const result = await call('glob', { pattern: 'src/*.ts', exclude: ['$(touch pwned)', '`touch pwned`', '--flag'] }, agent())
      expect(result.isError).toBe(false)
      expect(text(result).split('\n').sort()).toEqual([join('src', 'alpha.ts'), join('src', 'beta.ts')])
      expect(existsSync(canary)).toBe(false)
      expect(text(await call('glob', { pattern: 'src' }, agent()))).toBe('No files found')
    })

    it('classifies an invalid exclusion glob as SEARCH_INVALID_PATTERN', async () => {
      const result = await call('glob', { pattern: '*', exclude: ['['] }, agent())
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { code: 'SEARCH_INVALID_PATTERN' } })
    })

    it('reports zero discoveries as No files found', async () => {
      expect(text(await call('glob', { pattern: '*.nomatch' }, agent()))).toBe('No files found')
    })

    it.each([false, true])('excludes VCS internals at their search root with include_ignored=%s', async (include_ignored) => {
      // The prune glob alone never matches root-prefixed paths when rg is
      // rooted at .git; the paired contents glob keeps the exclusion airtight.
      expect(text(await call('glob', { pattern: '*', path: '.git', include_ignored }, agent()))).toBe('No files found')
    })

    it('classifies an invalid glob as SEARCH_INVALID_PATTERN', async () => {
      const result = await call('glob', { pattern: '[' }, agent())
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { name: 'SearchError', code: 'SEARCH_INVALID_PATTERN' } })
    })
  })

  describe('grep', () => {
    it('greps a directory tree with grouped, line-numbered output', async () => {
      const result = await call('grep', { pattern: 'alpha' }, agent())
      expect(result.isError).toBe(false)
      const output = text(result)
      expect(output).toContain('Found 3 matches')
      expect(output).toContain(`${join('src', 'alpha.ts')}\nLine 1: export const alpha = 1\nLine 2: // TODO: refit alpha`)
      expect(output).toContain('notes.md\nLine 1: alpha appears here too')
    })

    it('greps a single FILE target', async () => {
      const result = await call('grep', { pattern: 'alpha', path: 'notes.md' }, agent())
      expect(text(result)).toBe('Found 1 match\n\nnotes.md\nLine 1: alpha appears here too')
    })

    it('greps a directory target with an include filter', async () => {
      const result = await call('grep', { pattern: 'alpha', path: '.', include: '*.ts' }, agent())
      const output = text(result)
      expect(output).toContain('alpha.ts')
      expect(output).not.toContain('notes.md')
    })

    it('a hostile pattern stays inert (a plain argv element, the world untouched)', async () => {
      // There is no shell layer between the argv vector and rg, so the pattern
      // is a literal regex — but the world-untouched guarantee is the shipped
      // contract, and a future shell-wrapping change must not reintroduce it.
      // The canary name carries no path so the regex stays valid on every
      // platform (a Windows path's backslashes would be regex escapes).
      const canary = join(dir, 'pwned')
      const result = await call('grep', { pattern: '$(touch pwned)' }, agent())
      expect(result.isError).toBe(false) // exit 1: found nothing, executed nothing
      expect(text(result)).toBe('No matches found')
      expect(existsSync(canary)).toBe(false)
    })

    it('a leading-dash pattern is a pattern, not a flag', async () => {
      await writeFile(join(dir, 'dashes.txt'), 'value --flag value\n')
      const result = await call('grep', { pattern: '--flag', path: 'dashes.txt' }, agent())
      expect(text(result)).toBe('Found 1 match\n\ndashes.txt\nLine 1: value --flag value')
    })

    it('classifies a real rg regex error as SEARCH_INVALID_PATTERN', async () => {
      const result = await call('grep', { pattern: '(unclosed' })
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { code: 'SEARCH_INVALID_PATTERN' } })
    })

    it('classifies a missing target as SEARCH_FAILED', async () => {
      const result = await call('grep', { pattern: 'x', path: 'no-such-dir' })
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { code: 'SEARCH_FAILED' } })
    })
  })

  describe('per-session cwd', () => {
    it('resolves the search in the SESSION workspace, not the process cwd', async () => {
      const sessionDir = await mkdtemp(join(tmpdir(), 'dsh-search-session-'))
      try {
        await writeFile(join(sessionDir, 'only-here.ts'), 'const sessionFile = true\n')
        const agentObj = { session: { header: { id: 'session-int', cwd: sessionDir } } }
        const globbed = await call('glob', { pattern: '*.ts' }, agentObj)
        expect(text(globbed)).toBe('only-here.ts')
        const grepped = await call('grep', { pattern: 'sessionFile' }, agentObj)
        expect(text(grepped)).toContain('only-here.ts\nLine 1: const sessionFile = true')
      } finally {
        await rm(sessionDir, { recursive: true, force: true })
      }
    })
  })

  describe('pre-dispatch cancellation and spawn failures', () => {
    it('a pre-aborted registry call is ABORTED_BEFORE_DISPATCH', async () => {
      const controller = new AbortController()
      controller.abort()
      const result = await executeToolFixture(ctx, {
        callId: ToolCallId(`it-${++callCounter}`),
        name: 'grep',
        arguments: { pattern: 'x' },
        signal: controller.signal,
      })
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { name: 'AbortError', code: TOOL_ABORTED_BEFORE_DISPATCH } })
    })

    it('an unusable session cwd provider rejection is SEARCH_FAILED', async () => {
      const gone = join(dir, 'deleted-session-dir')
      const result = await call('glob', { pattern: '*' }, { session: { header: { id: 'session-int', cwd: gone } } })
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { name: 'SearchError', code: 'SEARCH_FAILED' } })
      expect(text(result)).toContain('subprocess failed before reporting an outcome')
      expect(text(result)).not.toContain('could not start')
    })
  })
})
