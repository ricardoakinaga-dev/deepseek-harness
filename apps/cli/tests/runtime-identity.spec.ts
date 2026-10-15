/** Launcher hashes identify bytes independently of source revision metadata. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { readRuntimeIdentity } from '../src/runtime-identity.ts'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-runtime-identity-'))
  onTestFinished(() => { rmSync(dir, { recursive: true, force: true }) })
  const git = (args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  return { dir, git }
}

it('reports clean and dirty source Git state separately from the module hash', () => {
  const { dir, git } = fixture()
  const file = join(dir, 'launcher.ts')
  writeFileSync(file, 'export {}\n')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  const clean = readRuntimeIdentity(pathToFileURL(file).href)
  expect(clean.source).toEqual({ revision: git(['rev-parse', 'HEAD']), dirty: false })
  expect(clean.launcher).toEqual({ kind: 'source', sha256: createHash('sha256').update('export {}\n').digest('hex') })
  writeFileSync(file, 'export const changed = true\n')
  const dirty = readRuntimeIdentity(pathToFileURL(file).href)
  expect(dirty.source).toEqual({ revision: clean.source!.revision, dirty: true })
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
  expect(identity.version).toMatch(/^\d+\.\d+\.\d+/)
  expect(identity.nodeVersion).toBe(process.version)
  expect(readRuntimeIdentity(pathToFileURL(join(dir, 'missing.ts')).href)).toMatchObject({ launcher: { kind: 'source', sha256: null }, source: null })
})
