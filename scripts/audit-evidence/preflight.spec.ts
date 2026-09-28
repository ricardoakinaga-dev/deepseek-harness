import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePreflightSpec, preflightAudit, type PreflightSpec } from './preflight.ts'

async function fixture(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-audit-preflight-'))
  try { await run(cwd) } finally { await rm(cwd, { recursive: true, force: true }) }
}

function spec(cwd: string, command: string[] = [process.execPath, '-e', 'process.exit(0)']): PreflightSpec {
  return { cwd, command, dependencies: ['fixture.txt'], requiredEnv: ['AUDIT_TEST_ENV'] }
}

describe('audit prerequisite preflight', () => {
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
