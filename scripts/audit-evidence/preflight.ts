/** Read-only audit prerequisites, with explicit test execution when requested. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, lstatSync, readFileSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Paths are relative to cwd; the command is an argv array, never a shell line. */
export interface PreflightSpec {
  cwd: string
  command: string[]
  dependencies?: string[]
  requiredEnv?: string[]
  search?: { credentialEnv: string; currentSources: string[] }
  filesystem?: FilesystemPrerequisite[]
  runner?: 'bubblewrap'
}

/** Ownership and mode requirements belong to the declared execution namespace. */
export interface FilesystemPrerequisite {
  path: string
  scope: 'host' | 'runner'
  kind: 'file' | 'directory' | 'symlink'
  uid?: number
  gid?: number
  mode?: string
}

/** Actual stat facts; null means unavailable, never an inferred owner or mode. */
export interface FilesystemFact {
  path: string
  scope: 'host' | 'runner'
  kind: string | null
  uid: number | null
  gid: number | null
  mode: string | null
}

/** Identity and namespace handles read in the observed process. */
export interface ProcessFacts {
  uid: number | null
  gid: number | null
  namespaces: Record<string, string | null>
}

/** A functional probe, distinct from executable presence and host identity. */
export interface AuditRunnerFacts {
  status: 'unknown' | 'available' | 'unavailable'
  executable: string | null
  process: ProcessFacts | null
  filesystem: FilesystemFact[]
}

/** Secret-free observations saved separately from the stable preflight result. */
export interface AuditPreflightFacts {
  host: ProcessFacts
  runner: AuditRunnerFacts
  filesystem: FilesystemFact[]
}

/** A missing prerequisite or execution problem without exposing environment values. */
export interface PreflightIssue {
  code: 'CWD_UNAVAILABLE' | 'COMMAND_UNAVAILABLE' | 'DEPENDENCY_UNAVAILABLE' | 'ENV_MISSING' |
    'SEARCH_CREDENTIAL_MISSING' | 'CURRENT_SOURCE_UNAVAILABLE' | 'COMMAND_START_FAILED' | 'TEST_INTERRUPTED' |
    'TEST_TIMED_OUT' | 'OUTPUT_LIMIT_EXCEEDED'
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
  /** Exclusive output file, written and hashed before executing the command. */
  factsPath?: string
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
  const item = object(value, 'preflight', ['cwd', 'command', 'dependencies', 'requiredEnv', 'search', 'filesystem', 'runner'])
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
  if (item.runner !== undefined) {
    if (item.runner !== 'bubblewrap') throw new Error('preflight.runner must be bubblewrap')
    spec.runner = item.runner
  }
  if (item.filesystem !== undefined) {
    if (!Array.isArray(item.filesystem)) throw new Error('preflight.filesystem must be an array')
    spec.filesystem = item.filesystem.map((raw, index) => {
      const path = `preflight.filesystem[${index}]`
      const entry = object(raw, path, ['path', 'scope', 'kind', 'uid', 'gid', 'mode'])
      if (entry.scope !== 'host' && entry.scope !== 'runner') throw new Error(`${path}.scope must be host or runner`)
      if (entry.kind !== 'file' && entry.kind !== 'directory' && entry.kind !== 'symlink') throw new Error(`${path}.kind must be file, directory, or symlink`)
      const requirement: FilesystemPrerequisite = { path: string(entry.path, `${path}.path`), scope: entry.scope, kind: entry.kind }
      for (const key of ['uid', 'gid'] as const) {
        if (entry[key] === undefined) continue
        const value = entry[key]
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${path}.${key} must be a nonnegative integer`)
        requirement[key] = value
      }
      if (entry.mode !== undefined) {
        if (typeof entry.mode !== 'string' || !/^[0-7]{4}$/.test(entry.mode)) throw new Error(`${path}.mode must be four octal digits`)
        requirement.mode = entry.mode
      }
      if (requirement.scope === 'runner' && spec.runner === undefined) throw new Error(`${path}.scope requires preflight.runner`)
      return requirement
    })
  }
  return spec
}

const NAMESPACES = ['user', 'mnt', 'pid', 'net', 'ipc', 'uts', 'cgroup'] as const

function processFacts(): ProcessFacts {
  return { uid: process.getuid?.() ?? null, gid: process.getgid?.() ?? null,
    namespaces: Object.fromEntries(NAMESPACES.map((name) => {
      try { return [name, readlinkSync(`/proc/self/ns/${name}`)] } catch (_unavailableNamespace) { return [name, null] }
    })) }
}

function filesystemFact(requirement: FilesystemPrerequisite, cwd: string): FilesystemFact {
  const empty = { path: requirement.path, scope: requirement.scope, kind: null, uid: null, gid: null, mode: null }
  try {
    const stat = lstatSync(resolve(cwd, requirement.path))
    return { ...empty, kind: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'other',
      uid: stat.uid, gid: stat.gid, mode: (stat.mode & 0o7777).toString(8).padStart(4, '0') }
  } catch (_unavailableStat) { return empty }
}

function nullableId(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

function parseRunnerObservation(value: unknown, requirements: readonly FilesystemPrerequisite[]): {
  process: ProcessFacts
  filesystem: FilesystemFact[]
} {
  if (!isRecord(value) || !nullableId(value.uid) || !nullableId(value.gid) || !isRecord(value.namespaces)
    || !Array.isArray(value.filesystem) || value.filesystem.length !== requirements.length) throw new Error('invalid runner observation')
  const namespaces: ProcessFacts['namespaces'] = {}
  for (const name of NAMESPACES) {
    const entry = value.namespaces[name]
    if (entry !== null && typeof entry !== 'string') throw new Error('invalid runner namespace')
    namespaces[name] = entry
  }
  const filesystem = value.filesystem.map((entry: unknown, index): FilesystemFact => {
    if (!isRecord(entry) || !nullableId(entry.uid) || !nullableId(entry.gid)
      || (entry.mode !== null && (typeof entry.mode !== 'string' || !/^[0-7]{4}$/.test(entry.mode)))
      || (entry.kind !== null && (typeof entry.kind !== 'string' || !['file', 'directory', 'symlink', 'other'].includes(entry.kind)))) {
      throw new Error('invalid runner stat')
    }
    const requirement = requirements[index]
    if (requirement === undefined) throw new Error('runner stat has no declared path')
    return { path: requirement.path, scope: 'runner', uid: entry.uid, gid: entry.gid,
      mode: entry.mode, kind: typeof entry.kind === 'string' ? entry.kind : null }
  })
  return { process: { uid: value.uid, gid: value.gid, namespaces }, filesystem }
}

/**
 * Probe bubblewrap in private user, mount, PID and network namespaces.
 * @param cwd - Existing directory to inspect without modifying it.
 * @param requirements - Filesystem paths observed inside the runner.
 * @param env - PATH for trusted host executables; values are never returned.
 * @returns Actual runner identity and stats, or unavailable without host substitution.
 */
export function probeAuditRunner(
  cwd: string, requirements: readonly FilesystemPrerequisite[] = [], env: NodeJS.ProcessEnv = process.env,
): AuditRunnerFacts {
  const executable = trustedAuditExecutable('bwrap', env)
  const unavailable: AuditRunnerFacts = { status: 'unavailable', executable: executable ?? null, process: null, filesystem: [] }
  if (process.platform !== 'linux' || executable === undefined || !directory(cwd)) return unavailable
  const script = `const fs=require('node:fs');const ns={};for(const name of ${JSON.stringify(NAMESPACES)}){try{ns[name]=fs.readlinkSync('/proc/self/ns/'+name)}catch{ns[name]=null}}
const filesystem=${JSON.stringify(requirements.map(entry => resolve(cwd, entry.path)))}.map(path=>{try{const s=fs.lstatSync(path);return {uid:s.uid,gid:s.gid,mode:(s.mode&4095).toString(8).padStart(4,'0'),kind:s.isFile()?'file':s.isDirectory()?'directory':s.isSymbolicLink()?'symlink':'other'}}catch{return {uid:null,gid:null,mode:null,kind:null}}});
console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),namespaces:ns,filesystem}))`
  const result = spawnSync(executable, ['--unshare-user', '--unshare-pid', '--unshare-net', '--new-session', '--die-with-parent',
    '--cap-drop', 'ALL', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--chdir', cwd, '--', process.execPath, '-e', script],
  { cwd, env: systemEnvironment(env), encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 })
  if (result.error || result.signal || result.status !== 0) return unavailable
  try {
    const raw: unknown = JSON.parse(result.stdout)
    return { status: 'available', executable, ...parseRunnerObservation(raw, requirements) }
  } catch (_invalidRunnerObservation) { return unavailable }
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

function executableFile(path: string): boolean {
  if (!file(path)) return false
  try { accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return true } catch { return false }
}

/**
 * Resolve audit infrastructure without executing a candidate-controlled PATH entry.
 * @param name - Host helper used before command confinement.
 * @param env - PATH search list; relative entries are excluded.
 * @returns Canonical system-bin executable with root-owned, non-writable ancestors, or unavailable.
 */
export function trustedAuditExecutable(name: 'bwrap' | 'python3' | 'git', env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (process.platform !== 'linux') return undefined
  for (const entry of (envValue(env, 'PATH') ?? '').split(delimiter).filter(isAbsolute)) {
    try {
      const executable = realpathSync(resolve(entry, name))
      if (!['/usr/bin', '/usr/local/bin', '/bin'].includes(dirname(executable)) || !executableFile(executable)) continue
      let cursor = executable
      while (true) {
        const info = statSync(cursor)
        if (info.uid !== 0 || (info.mode & 0o022) !== 0) break
        const parent = dirname(cursor)
        if (parent === cursor) return executable
        cursor = parent
      }
    } catch (_unavailableHostExecutable) { /* Missing or inaccessible PATH entries are not trusted helpers. */ }
  }
  return undefined
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
    return names.some(name => executableFile(resolve(cwd, name)))
  }
  return (envValue(env, 'PATH') ?? '').split(delimiter).filter(Boolean)
    .some(entry => names.some(name => executableFile(resolve(cwd, entry, name))))
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
  const runnerRequirements = (spec.filesystem ?? []).filter(entry => entry.scope === 'runner')
  const runner: AuditRunnerFacts = spec.runner === undefined
    ? { status: 'unknown', executable: null, process: null, filesystem: [] }
    : probeAuditRunner(cwd, runnerRequirements, systemEnv)
  const filesystem = (spec.filesystem ?? []).map(requirement => requirement.scope === 'host'
    ? filesystemFact(requirement, cwd)
    : runner.filesystem[runnerRequirements.indexOf(requirement)]
      ?? { path: requirement.path, scope: requirement.scope, kind: null, uid: null, gid: null, mode: null })
  const facts: AuditPreflightFacts = { host: processFacts(), runner, filesystem }
  if (spec.runner !== undefined && runner.status !== 'available') {
    issues.push({ code: 'DEPENDENCY_UNAVAILABLE', subject: 'runner:bubblewrap',
      remedy: 'Provide a functional bubblewrap runner; the command was not run.' })
  }
  for (const requirement of spec.filesystem ?? []) {
    const actual = filesystem.find(entry => entry.path === requirement.path && entry.scope === requirement.scope)
    if (actual?.kind !== requirement.kind || (requirement.uid !== undefined && actual.uid !== requirement.uid)
      || (requirement.gid !== undefined && actual.gid !== requirement.gid)
      || (requirement.mode !== undefined && actual.mode !== requirement.mode)) {
      issues.push({ code: 'DEPENDENCY_UNAVAILABLE', subject: `${requirement.scope}:${requirement.path}`,
        remedy: 'Restore the declared filesystem type, ownership and mode in this namespace; inspect the facts artifact.' })
    }
  }
  if (options.run && spec.runner !== undefined) {
    issues.push({ code: 'DEPENDENCY_UNAVAILABLE', subject: 'runner execution',
      remedy: 'Use isolated-candidate.ts for managed execution; this preflight only probes the declared runner.' })
  }
  if (options.factsPath !== undefined) {
    try {
      const bytes = JSON.stringify(facts, null, 2) + '\n'
      writeFileSync(options.factsPath, bytes, { flag: 'wx', mode: 0o600 })
      currentSources.push({ path: options.factsPath, sha256: createHash('sha256').update(bytes).digest('hex') })
    } catch (_unavailableFactsOutput) {
      issues.push({ code: 'DEPENDENCY_UNAVAILABLE', subject: 'facts output', remedy: 'Choose a new writable facts file outside the candidate.' })
    }
  }
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
    const errorCode = result.error !== undefined && 'code' in result.error ? result.error.code : undefined
    const code = errorCode === 'ETIMEDOUT' ? 'TEST_TIMED_OUT'
      : errorCode === 'ENOBUFS' ? 'OUTPUT_LIMIT_EXCEEDED'
        : result.error ? 'COMMAND_START_FAILED' : 'TEST_INTERRUPTED'
    return blocked('execution', [{ code, subject: program,
      remedy: 'Inspect the test runner outside this preflight; no product result was established.' }], currentSources, result.pid > 0)
  }
  return { status: result.status === 0 ? 'PASS' : 'FAIL', category: 'product', executed: true,
    issues: [], currentSources, exitCode: result.status }
}

/**
 * Run the JSON-file CLI. Exit 0 means ready or passing; 1 means a test failed,
 * 2 means blocked, and 3 means the declaration is invalid.
 * @param argv - `--spec FILE`, optional `--facts FILE`, and explicit `--run`.
 * @returns Process exit code without terminating an importing caller.
 */
export function runPreflight(argv: string[]): number {
  try {
    if (argv[0] !== '--spec' || !argv[1]) throw new Error('usage: preflight.ts --spec FILE [--facts FILE] [--run]')
    let run = false
    let factsPath: string | undefined
    for (let index = 2; index < argv.length; index++) {
      const next = argv[index + 1]
      if (argv[index] === '--run' && !run) run = true
      else if (argv[index] === '--facts' && factsPath === undefined && next !== undefined) { factsPath = resolve(next); index++ }
      else throw new Error('usage: preflight.ts --spec FILE [--facts FILE] [--run]')
    }
    const path = resolve(argv[1])
    let raw: unknown
    try { raw = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error('cannot read a valid JSON preflight spec') }
    const result = preflightAudit(parsePreflightSpec(raw), { baseDir: dirname(path), run,
      ...factsPath === undefined ? {} : { factsPath } })
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
