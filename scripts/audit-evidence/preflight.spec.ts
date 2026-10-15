import { createHash } from 'node:crypto'
import { existsSync, readlinkSync, statSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePreflightSpec, preflightAudit, probeAuditRunner, type PreflightSpec } from './preflight.ts'

async function fixture(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-audit-preflight-'))
  try { await run(cwd) } finally { await rm(cwd, { recursive: true, force: true }) }
}

function spec(cwd: string, command: string[] = [process.execPath, '-e', 'process.exit(0)']): PreflightSpec {
  return { cwd, command, dependencies: ['fixture.txt'], requiredEnv: ['AUDIT_TEST_ENV'] }
}

describe('audit prerequisite preflight', () => {
  it.skipIf(process.platform === 'win32')('does not report execution when an executable interpreter is missing', async () => fixture(async (cwd) => {
    const program = join(cwd, 'missing-interpreter')
    await writeFile(program, '#!/nonexistent-audit-interpreter\n', { mode: 0o700 })
    expect(preflightAudit({ cwd, command: [program] }, { run: true })).toMatchObject({
      status: 'BLOCKED', executed: false, issues: [{ code: 'COMMAND_START_FAILED' }],
    })
  }))

  it('reports an executed command when its deadline expires after startup', { timeout: 15_000 }, async () => fixture(async (cwd) => {
    const marker = join(cwd, 'started')
    const result = preflightAudit({ cwd, command: [process.execPath, '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started'); setInterval(() => {}, 1000)`] },
    { run: true, timeoutMs: 5_000 })
    expect(existsSync(marker)).toBe(true)
    expect(result).toMatchObject({ status: 'BLOCKED', category: 'execution', executed: true,
      issues: [{ code: 'TEST_TIMED_OUT' }] })
  }))

  it('reports an executed command when captured output exceeds its buffer', async () => fixture(async (cwd) => {
    const marker = join(cwd, 'started')
    const result = preflightAudit({ cwd, command: [process.execPath, '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started'); process.stdout.write(Buffer.alloc(2 * 1024 * 1024)); setInterval(() => {}, 1000)`] },
    { run: true, timeoutMs: 10_000 })
    expect(existsSync(marker)).toBe(true)
    expect(result).toMatchObject({ status: 'BLOCKED', category: 'execution', executed: true,
      issues: [{ code: 'OUTPUT_LIMIT_EXCEEDED' }] })
  }))

  it.skipIf(process.platform !== 'linux')('records actual runner namespaces and checks declared runner stat facts', async () => fixture(async (cwd) => {
    const requirement = { path: '/tmp', scope: 'runner' as const, kind: 'directory' as const }
    const probe = probeAuditRunner(cwd, [requirement])
    expect(probe.status).toBe('available')
    expect(probe.process?.namespaces.user).not.toBe(readlinkSync('/proc/self/ns/user'))
    const actual = probe.filesystem[0]
    expect(actual?.uid).not.toBeNull()
    if (actual?.uid === null || actual?.uid === undefined || actual.gid === null || actual.mode === null) throw new Error('runner stats unavailable')
    const declaration = parsePreflightSpec({ cwd, command: [process.execPath, '-e', 'process.exit(0)'], runner: 'bubblewrap',
      filesystem: [{ ...requirement, uid: actual.uid, gid: actual.gid, mode: actual.mode }] })
    expect(preflightAudit(declaration).status).toBe('READY')
    expect(preflightAudit({ ...declaration, filesystem: [{ ...requirement, uid: actual.uid + 1 }] }, { run: true }))
      .toMatchObject({ status: 'BLOCKED', executed: false })
    expect(preflightAudit(declaration, { run: true })).toMatchObject({ status: 'BLOCKED', executed: false,
      issues: [{ subject: 'runner execution' }] })
  }))

  it('blocks a declared ownership mismatch before executing and records actual facts without secrets', async () => fixture(async (cwd) => {
    const target = join(cwd, 'fixture.txt')
    const marker = join(cwd, 'executed.txt')
    const factsPath = join(cwd, 'facts.json')
    await writeFile(target, 'fixture')
    const uid = statSync(target).uid
    const declaration = parsePreflightSpec({ ...spec(cwd, [process.execPath, '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]),
    filesystem: [{ path: 'fixture.txt', scope: 'host', kind: 'file', uid: uid + 1 }] })
    const result = preflightAudit(declaration, { env: { AUDIT_TEST_ENV: 'secret-sentinel' }, run: true, factsPath })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: false })
    expect(existsSync(marker)).toBe(false)
    const facts: unknown = JSON.parse(await readFile(factsPath, 'utf8'))
    expect(facts).toMatchObject({ filesystem: [{ path: 'fixture.txt', uid, gid: statSync(target).gid }] })
    expect(JSON.stringify(facts)).not.toContain('secret-sentinel')
  }))

  it('accepts explicitly matching owner/group/mode and rejects a changed mode', async () => fixture(async (cwd) => {
    const target = join(cwd, 'fixture.txt')
    await writeFile(target, 'fixture')
    await chmod(target, 0o640)
    const actual = statSync(target)
    const declaration = parsePreflightSpec({ ...spec(cwd), filesystem: [{ path: 'fixture.txt', scope: 'host',
      kind: 'file', uid: actual.uid, gid: actual.gid, mode: (actual.mode & 0o7777).toString(8).padStart(4, '0') }] })
    expect(preflightAudit(declaration, { env: { AUDIT_TEST_ENV: 'present' }, run: true }).status).toBe('PASS')
    await chmod(target, 0o600)
    expect(preflightAudit(declaration, { env: { AUDIT_TEST_ENV: 'present' }, run: true }))
      .toMatchObject({ status: 'BLOCKED', executed: false })
  }))

  it('blocks unavailable managed facts instead of substituting host facts', async () => fixture(async (cwd) => {
    await writeFile(join(cwd, 'fixture.txt'), 'fixture')
    const declaration = parsePreflightSpec({ ...spec(cwd), runner: 'bubblewrap', filesystem: [
      { path: '/tmp', scope: 'runner', kind: 'directory', uid: 0 },
    ] })
    const result = preflightAudit(declaration, { env: { PATH: join(cwd, 'no-bin'), AUDIT_TEST_ENV: 'present' }, run: true,
      factsPath: join(cwd, 'facts.json') })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: false })
    const facts: unknown = JSON.parse(await readFile(join(cwd, 'facts.json'), 'utf8'))
    expect(facts).toMatchObject({ runner: { status: 'unavailable', process: null },
      filesystem: [{ scope: 'runner', uid: null, gid: null, mode: null }] })
  }))

  it.each([
    { uid: -1 }, { gid: 0.5 }, { mode: '777' }, { mode: '1888' }, { scope: 'guessed' }, { kind: 'socket' },
  ])('rejects invalid filesystem declarations: %j', (invalid) => {
    expect(() => parsePreflightSpec({ cwd: '.', command: ['node'], filesystem: [
      { path: '/tmp', scope: 'host', kind: 'directory', ...invalid },
    ] })).toThrow('filesystem')
  })

  it('blocks a missing search credential without exposing any environment value', async () => fixture(async (cwd) => {
    await writeFile(join(cwd, 'fixture.txt'), 'fixture')
    await writeFile(join(cwd, 'search.ts'), 'export const source = true\n')
    const result = preflightAudit({ ...spec(cwd), search: { credentialEnv: 'AUDIT_SEARCH_KEY', currentSources: ['search.ts'] } },
      { env: { AUDIT_TEST_ENV: 'sensitive-test-value' } })
    expect(result).toMatchObject({ status: 'BLOCKED', category: 'setup', executed: false,
      issues: [{ code: 'SEARCH_CREDENTIAL_MISSING', subject: 'AUDIT_SEARCH_KEY' }] })
    expect(JSON.stringify(result)).not.toContain('sensitive-test-value')
    expect(result.currentSources).toEqual([{ path: 'search.ts', sha256: createHash('sha256').update('export const source = true\n').digest('hex') }])
  }))

  it('blocks a missing declared dependency before the command can run', async () => fixture(async (cwd) => {
    const marker = join(cwd, 'executed.txt')
    const command = [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]
    const result = preflightAudit(spec(cwd, command), { env: { AUDIT_TEST_ENV: 'present' }, run: true })
    expect(result).toMatchObject({ status: 'BLOCKED', category: 'setup', executed: false,
      issues: [{ code: 'DEPENDENCY_UNAVAILABLE', subject: 'fixture.txt' }] })
    expect(existsSync(marker)).toBe(false)
  }))

  it('reports the command, working directory, environment, and current source as setup issues', async () => fixture(async (cwd) => {
    const result = preflightAudit({ cwd: join(cwd, 'missing-cwd'), command: ['./missing-command'],
      dependencies: ['missing-fixture'], requiredEnv: ['AUDIT_TEST_ENV'],
      search: { credentialEnv: 'AUDIT_SEARCH_KEY', currentSources: ['missing-search.ts'] } },
    { env: { AUDIT_TEST_ENV: '' }, run: true })
    expect(result).toMatchObject({ status: 'BLOCKED', category: 'setup', executed: false })
    expect(result.issues.map(issue => issue.code)).toEqual([
      'CWD_UNAVAILABLE', 'COMMAND_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE', 'ENV_MISSING',
      'SEARCH_CREDENTIAL_MISSING', 'CURRENT_SOURCE_UNAVAILABLE',
    ])
    expect(result.currentSources).toEqual([])
  }))

  it('marks complete prerequisites READY without running a test by default', async () => fixture(async (cwd) => {
    const marker = join(cwd, 'executed.txt')
    const source = 'export const searchCredential = process.env.AUDIT_SEARCH_KEY\n'
    await writeFile(join(cwd, 'fixture.txt'), 'fixture')
    await writeFile(join(cwd, 'search.ts'), source)
    const command = [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]
    const result = preflightAudit({ ...spec(cwd, command), search: { credentialEnv: 'AUDIT_SEARCH_KEY', currentSources: ['search.ts'] } },
      { env: { AUDIT_TEST_ENV: 'present', AUDIT_SEARCH_KEY: 'sensitive-search-value' } })
    expect(result).toEqual({ status: 'READY', category: 'ready', executed: false, issues: [],
      currentSources: [{ path: 'search.ts', sha256: createHash('sha256').update(source).digest('hex') }] })
    expect(existsSync(marker)).toBe(false)
    expect(JSON.stringify(result)).not.toContain('sensitive-search-value')
  }))

  it('classifies a nonzero exit as FAIL only after an explicit run', async () => fixture(async (cwd) => {
    await writeFile(join(cwd, 'fixture.txt'), 'fixture')
    const result = preflightAudit(spec(cwd, [process.execPath, '-e', 'process.exit(7)']),
      { env: { AUDIT_TEST_ENV: 'present' }, run: true })
    expect(result).toEqual({ status: 'FAIL', category: 'product', executed: true,
      issues: [], currentSources: [], exitCode: 7 })
  }))

  it('passes declared variables but excludes an unrelated credential from the child', async () => fixture(async (cwd) => {
    await writeFile(join(cwd, 'fixture.txt'), 'fixture')
    await writeFile(join(cwd, 'search.ts'), 'export const current = true\n')
    const command = [basename(process.execPath), '-e', [
      "if (Object.hasOwn(process.env, 'AUDIT_CREDENTIAL')) process.exit(11)",
      "if (process.env.AUDIT_TEST_ENV !== 'declared-test') process.exit(12)",
      "if (process.env.AUDIT_SEARCH_KEY !== 'declared-search') process.exit(13)",
    ].join('; ')]
    const result = preflightAudit({ ...spec(cwd, command),
      search: { credentialEnv: 'AUDIT_SEARCH_KEY', currentSources: ['search.ts'] } },
    { env: { PATH: dirname(process.execPath), AUDIT_TEST_ENV: 'declared-test', AUDIT_SEARCH_KEY: 'declared-search',
      AUDIT_CREDENTIAL: 'unrelated-credential-sentinel' }, run: true })
    expect(result).toMatchObject({ status: 'PASS', category: 'product', executed: true, exitCode: 0 })
    expect(JSON.stringify(result)).not.toContain('unrelated-credential-sentinel')
  }))

  it('rejects malformed declarations instead of silently skipping checks', () => {
    expect(() => parsePreflightSpec({ cwd: '.', command: [], requiredEnv: ['AUDIT_TEST_ENV'] })).toThrow('preflight.command')
    expect(() => parsePreflightSpec({ cwd: '.', command: ['node'], search: { credentialEnv: 'AUDIT_SEARCH_KEY' } })).toThrow('currentSources')
  })
})
