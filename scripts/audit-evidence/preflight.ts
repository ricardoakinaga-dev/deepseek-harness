/** Read-only audit prerequisites, with explicit test execution when requested. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Paths are relative to cwd; the command is an argv array, never a shell line. */
export interface PreflightSpec {
  cwd: string
  command: string[]
  dependencies?: string[]
  requiredEnv?: string[]
  search?: { credentialEnv: string; currentSources: string[] }
}

/** A missing prerequisite or execution problem without exposing environment values. */
export interface PreflightIssue {
  code: 'CWD_UNAVAILABLE' | 'COMMAND_UNAVAILABLE' | 'DEPENDENCY_UNAVAILABLE' | 'ENV_MISSING' |
    'SEARCH_CREDENTIAL_MISSING' | 'CURRENT_SOURCE_UNAVAILABLE' | 'COMMAND_START_FAILED' | 'TEST_INTERRUPTED'
  subject: string
  remedy: string
}

/** READY is a preflight only; PASS and FAIL require an executed command. */
export interface PreflightResult {
  status: 'READY' | 'BLOCKED' | 'PASS' | 'FAIL'
  category: 'ready' | 'setup' | 'execution' | 'product'
  executed: boolean
  issues: PreflightIssue[]
  currentSources: Array<{ path: string; sha256: string }>
  exitCode?: number
}

/** Inputs external to the spec, injectable for isolated checks. */
export interface PreflightOptions {
  baseDir?: string
  env?: NodeJS.ProcessEnv
  run?: boolean
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${path}.${key} is not supported`)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`)
  return value
}

function strings(value: unknown, path: string, nonempty = false): string[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new Error(`${path} must be ${nonempty ? 'a non-empty array' : 'an array'}`)
  }
  return value.map((item, index) => string(item, `${path}[${index}]`))
}

function envName(value: unknown, path: string): string {
  const name = string(value, path)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`${path} must be an environment variable name`)
  return name
}

/**
 * Parse a JSON preflight declaration without accepting undeclared checks.
 * @param value - Untrusted parsed JSON.
 * @returns A declaration with validated field types and environment names.
 */
export function parsePreflightSpec(value: unknown): PreflightSpec {
  const item = object(value, 'preflight', ['cwd', 'command', 'dependencies', 'requiredEnv', 'search'])
  const command = strings(item.command, 'preflight.command', true)
  const spec: PreflightSpec = { cwd: string(item.cwd, 'preflight.cwd'), command }
  if (item.dependencies !== undefined) spec.dependencies = strings(item.dependencies, 'preflight.dependencies')
  if (item.requiredEnv !== undefined) {
    if (!Array.isArray(item.requiredEnv)) throw new Error('preflight.requiredEnv must be an array')
    spec.requiredEnv = item.requiredEnv.map((name, index) => envName(name, `preflight.requiredEnv[${index}]`))
  }
  if (item.search !== undefined) {
    const search = object(item.search, 'preflight.search', ['credentialEnv', 'currentSources'])
    spec.search = {
      credentialEnv: envName(search.credentialEnv, 'preflight.search.credentialEnv'),
      currentSources: strings(search.currentSources, 'preflight.search.currentSources', true),
    }
  }
  return spec
}

function directory(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { return false }
}

function file(path: string): boolean {
  try { return statSync(path).isFile() } catch { return false }
}

function dependency(path: string): boolean {
  try {
    const stat = statSync(path)
    return stat.isFile() || stat.isDirectory()
  } catch { return false }
}

function executable(path: string): boolean {
  if (!file(path)) return false
  try { accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return true } catch { return false }
}

const SYSTEM_ENV_NAMES = process.platform === 'win32'
  ? ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA']
  : ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP']

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  if (process.platform !== 'win32') return env[name]
  const actualName = Object.keys(env).find(key => key.toUpperCase() === name.toUpperCase())
  return actualName === undefined ? undefined : env[actualName]
}

function systemEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const selected: NodeJS.ProcessEnv = {}
  for (const name of SYSTEM_ENV_NAMES) {
    const value = envValue(env, name) ?? envValue(process.env, name)
    if (value !== undefined) selected[name] = value
  }
  return selected
}

function commandAvailable(command: string, cwd: string, env: NodeJS.ProcessEnv): boolean {
  const suffixes = process.platform === 'win32' && !/\.[^./\\]+$/.test(command)
    ? (envValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';') : ['']
  const names = suffixes.map(suffix => `${command}${suffix}`)
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    return names.some(name => executable(resolve(cwd, name)))
  }
  return (envValue(env, 'PATH') ?? '').split(delimiter).filter(Boolean)
    .some(entry => names.some(name => executable(resolve(cwd, entry, name))))
}

function present(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = envValue(env, name)
  return typeof value === 'string' && value.trim().length > 0
}

function blocked(category: 'setup' | 'execution', issues: PreflightIssue[], currentSources: PreflightResult['currentSources'], executed = false): PreflightResult {
  return { status: 'BLOCKED', category, executed, issues, currentSources }
}

/**
 * Inspect declared prerequisites and optionally execute the exact argv after they pass.
 * A nonzero test exit is FAIL; missing setup and interrupted execution are BLOCKED.
 * Test output and environment values never enter the result. The child receives
 * system essentials and only declared environment variables. Current-source hashes
 * identify bytes; they do not verify credential-loader behavior.
 * @param spec - Validated check declaration.
 * @param options - Base directory, environment, and explicit execution choice.
 * @returns Stable checks and a status scoped to prerequisites or one test run.
 */
export function preflightAudit(spec: PreflightSpec, options: PreflightOptions = {}): PreflightResult {
  const program = spec.command[0]
  if (!program) throw new Error('preflight.command needs an executable')
  const env = options.env ?? process.env
  const systemEnv = systemEnvironment(env)
  const cwd = resolve(options.baseDir ?? process.cwd(), spec.cwd)
  const issues: PreflightIssue[] = []
  const currentSources: PreflightResult['currentSources'] = []
  if (!directory(cwd)) issues.push({ code: 'CWD_UNAVAILABLE', subject: spec.cwd, remedy: 'Choose an existing working directory.' })
  if (!commandAvailable(program, cwd, systemEnv)) {
    issues.push({ code: 'COMMAND_UNAVAILABLE', subject: program, remedy: 'Install the command or correct PATH.' })
  }
  for (const path of spec.dependencies ?? []) {
    if (!dependency(resolve(cwd, path))) {
      issues.push({ code: 'DEPENDENCY_UNAVAILABLE', subject: path, remedy: 'Install or create this declared dependency.' })
    }
  }
  for (const name of spec.requiredEnv ?? []) {
    if (!present(env, name)) issues.push({ code: 'ENV_MISSING', subject: name, remedy: 'Set this environment variable before running the test.' })
  }
  if (spec.search) {
    if (!present(env, spec.search.credentialEnv)) {
      issues.push({ code: 'SEARCH_CREDENTIAL_MISSING', subject: spec.search.credentialEnv,
        remedy: 'Set the declared search credential before checking external search.' })
    }
    for (const path of spec.search.currentSources) {
      try {
        const absolute = resolve(cwd, path)
        if (!file(absolute)) throw new Error('not a file')
        currentSources.push({ path, sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') })
      } catch {
        issues.push({ code: 'CURRENT_SOURCE_UNAVAILABLE', subject: path, remedy: 'Point to a readable current source file.' })
      }
    }
  }
  if (issues.length > 0) return blocked('setup', issues, currentSources)
  if (!options.run) return { status: 'READY', category: 'ready', executed: false, issues: [], currentSources }
  const timeoutMs = options.timeoutMs ?? 300_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive integer')
  const childEnv = { ...systemEnv }
  for (const name of [...(spec.requiredEnv ?? []), ...(spec.search ? [spec.search.credentialEnv] : [])]) {
    const value = envValue(env, name)
    if (value !== undefined) childEnv[name] = value
  }
  const result = spawnSync(program, spec.command.slice(1), {
    cwd, env: childEnv, encoding: 'utf8', shell: false, timeout: timeoutMs, maxBuffer: 1024 * 1024,
  })
  if (result.error || result.signal || result.status === null) {
    const code = result.error ? 'COMMAND_START_FAILED' : 'TEST_INTERRUPTED'
    return blocked('execution', [{ code, subject: program,
      remedy: 'Inspect the test runner outside this preflight; no product result was established.' }], currentSources, !result.error)
  }
  return { status: result.status === 0 ? 'PASS' : 'FAIL', category: 'product', executed: true,
    issues: [], currentSources, exitCode: result.status }
}

/**
 * Run the JSON-file CLI. Exit 0 means ready or passing; 1 means a test failed,
 * 2 means blocked, and 3 means the declaration is invalid.
 * @param argv - `--spec FILE` and optional explicit `--run`.
 * @returns Process exit code without terminating an importing caller.
 */
export function runPreflight(argv: string[]): number {
  try {
    if ((argv.length !== 2 && argv.length !== 3) || argv[0] !== '--spec' || !argv[1] ||
      (argv.length === 3 && argv[2] !== '--run')) throw new Error('usage: preflight.ts --spec FILE [--run]')
    const path = resolve(argv[1])
    let raw: unknown
    try { raw = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error('cannot read a valid JSON preflight spec') }
    const result = preflightAudit(parsePreflightSpec(raw), { baseDir: dirname(path), run: argv[2] === '--run' })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return result.status === 'FAIL' ? 1 : result.status === 'BLOCKED' ? 2 : 0
  } catch (error) {
    process.stderr.write(`audit-evidence: ${error instanceof Error ? error.message : 'invalid preflight spec'}\n`)
    return 3
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runPreflight(process.argv.slice(2))
}
