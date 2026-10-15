/** Launcher hashes identify bytes independently of source revision metadata. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { readRuntimeIdentity, readSourceIdentity } from '../src/runtime-identity.ts'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-runtime-identity-'))
  onTestFinished(() => { rmSync(dir, { recursive: true, force: true }) })
  const git = (args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).trim()
  return { dir, git }
}

it.skipIf(process.platform !== 'linux').each([0o4644, 0o2644, 0o1644])('distinguishes special source permission bits in mode %o', (mode) => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  writeFileSync(file, 'export {}\n')
  chmodSync(file, 0o644)
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  const before = readSourceIdentity(file)
  chmodSync(file, mode)
  expect(lstatSync(file).mode & 0o7777).toBe(mode)
  const after = readSourceIdentity(file)
  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  expect(after?.contentSha256).not.toBe(before?.contentSha256)
})

it.skipIf(process.platform !== 'linux').each(['link:target', 'target'])('distinguishes file bytes from a symbolic-link target with the same prefix %s', (content) => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  const slot = join(dir, 'slot')
  writeFileSync(file, 'export {}\n')
  writeFileSync(slot, 'baseline')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  writeFileSync(slot, content)
  chmodSync(slot, 0o777)
  const regular = readSourceIdentity(file)
  rmSync(slot)
  symlinkSync('target', slot)
  const link = readSourceIdentity(file)
  expect(regular?.dirty).toBe(true)
  expect(link?.dirty).toBe(true)
  expect(link?.contentSha256).not.toBe(regular?.contentSha256)
})

it('does not refresh Git index bytes while observing source identity', () => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  writeFileSync(file, 'export {}\n')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  const index = join(dir, '.git/index')
  const before = readFileSync(index)
  rmSync(file)
  writeFileSync(file, 'export {}\n')
  utimesSync(file, 0, 0)
  const previous = process.env.GIT_OPTIONAL_LOCKS
  try {
    process.env.GIT_OPTIONAL_LOCKS = '1'
    expect(readSourceIdentity(file)?.dirty).toBe(false)
  } finally {
    if (previous === undefined) delete process.env.GIT_OPTIONAL_LOCKS
    else process.env.GIT_OPTIONAL_LOCKS = previous
  }
  expect(readFileSync(index)).toEqual(before)
})

it.skipIf(process.platform === 'win32')('hashes literal non-UTF8 source-link targets without replacement decoding', () => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  const link = join(dir, 'link')
  writeFileSync(file, 'export {}\n')
  symlinkSync('baseline', link)
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  rmSync(link)
  symlinkSync(Buffer.from([0xff]), link)
  const first = readSourceIdentity(file)
  rmSync(link)
  symlinkSync(Buffer.from([0xfe]), link)
  const second = readSourceIdentity(file)
  expect(first?.dirty).toBe(true)
  expect(second?.dirty).toBe(true)
  expect(second?.contentSha256).not.toBe(first?.contentSha256)
})

it.skipIf(process.platform === 'win32')('leaves source identity unavailable for undecodable Git paths', () => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  writeFileSync(file, 'export {}\n')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  writeFileSync(Buffer.concat([Buffer.from(dir + '/'), Buffer.from([0xff])]), 'raw file')
  writeFileSync(join(dir, '\ufffd'), 'decoded sibling')
  expect(readSourceIdentity(file)).toBeNull()
})

it('distinguishes an imported launcher generation from a later filesystem observation', async () => {
  const { dir } = fixture()
  const file = join(dir, 'cached-launcher.mjs')
  const code = (generation: string): string => `export const generation = '${generation}'\nexport const observe = read => read(import.meta.url)\n`
  writeFileSync(file, code('A'))
  const loaded = await import(/* @vite-ignore */pathToFileURL(file).href) as {
    generation: string
    observe(read: typeof readRuntimeIdentity): ReturnType<typeof readRuntimeIdentity>
  }
  writeFileSync(file, code('B'))
  expect(loaded.generation).toBe('A')
  expect(loaded.observe(readRuntimeIdentity).launcher).toEqual({ kind: 'artifact',
    sha256: createHash('sha256').update(code('B')).digest('hex'), sha256Source: 'disk-observation' })
})

it('reports clean and dirty source Git state separately from the module hash', () => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  writeFileSync(file, 'export {}\n')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  const clean = readRuntimeIdentity(pathToFileURL(file).href)
  expect(clean.source).toMatchObject({ revision: git(['rev-parse', 'HEAD']), dirty: false })
  expect(clean.source?.contentSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(clean.launcher).toEqual({ kind: 'source', sha256: createHash('sha256').update('export {}\n').digest('hex'), sha256Source: 'disk-observation' })
  expect(clean.versionSource).toBe('package-manifest-observation')
  writeFileSync(file, 'export const changed = true\n')
  const dirty = readRuntimeIdentity(pathToFileURL(file).href)
  expect(dirty.source).toMatchObject({ revision: clean.source!.revision, dirty: true })
  expect(dirty.source?.contentSha256).not.toBe(clean.source?.contentSha256)
  expect(dirty.launcher.sha256).not.toBe(clean.launcher.sha256)
})

it('does not attribute artifact bytes to checkout HEAD and reports unavailable identities explicitly', () => {
  const { dir, git } = fixture()
  git(['init'])
  const file = join(dir, 'launcher.js')
  writeFileSync(file, 'export {}\n')
  const identity = readRuntimeIdentity(pathToFileURL(file).href)
  expect(identity.source).toBeNull()
  expect(identity.launcher.kind).toBe('artifact')
  expect(identity.launcher.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(identity.version).toBeNull()
  expect(identity.versionSource).toBe('unavailable')
  expect(identity.nodeVersion).toBe(process.version)
  expect(readRuntimeIdentity(pathToFileURL(join(dir, 'missing.ts')).href)).toMatchObject({ launcher: { kind: 'source', sha256: null }, source: null })
})


it('rejects an artifact carrying a stale or malformed embedded manifest instead of attributing checkout state', () => {
  const { dir } = fixture()
  const file = join(dir, 'launcher.js')
  writeFileSync(file, 'export {}\n//# dsh-build-identity={"format":1}\n')
  expect(() => readRuntimeIdentity(pathToFileURL(file).href)).toThrow('build identity')
})


it('includes sibling source changes, untracked content and deletions when the launcher lives below the checkout root', () => {
  const { dir, git } = fixture()
  mkdirSync(join(dir, 'src'))
  const launcher = join(dir, 'src/launcher.ts')
  const dependency = join(dir, 'dependency.ts')
  writeFileSync(launcher, 'export {}\n')
  writeFileSync(dependency, 'export const value = 1\n')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  const read = () => readRuntimeIdentity(pathToFileURL(launcher).href).source
  const initial = read()
  expect(initial?.dirty).toBe(false)
  writeFileSync(dependency, 'export const value = 2\n')
  const changed = read()
  expect(changed?.contentSha256).not.toBe(initial?.contentSha256)
  writeFileSync(join(dir, 'untracked.ts'), 'export {}\n')
  const added = read()
  expect(added?.contentSha256).not.toBe(changed?.contentSha256)
  rmSync(dependency)
  expect(read()?.contentSha256).not.toBe(added?.contentSha256)
  expect(read()?.revision).toBe(initial?.revision)
})
