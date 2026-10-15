/** Dirty-source audit copies confined by bubblewrap; originals and controller evidence remain read-only. */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, openSync, writeSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parsePreflightSpec, preflightAudit, probeAuditRunner, trustedAuditExecutable } from './preflight.ts'
import type { PreflightSpec } from './preflight.ts'

/** One entry includes permission bits and the hash of file bytes or literal link target bytes. */
export type CandidateEntry = {
  path: string
  mode: number
} & ({ kind: 'file'; sha256: string } | { kind: 'directory' } | { kind: 'symlink'; sha256: string; targetBase64: string })

/** The complete filesystem inventory includes ignored files and Git metadata. */
export interface CandidateSnapshot {
  sha256: string
  head: string | null
  indexSha256: string | null
  entries: CandidateEntry[]
}

/** An explicit run requires Linux bubblewrap; no unconfined fallback exists. */
export interface IsolatedCandidateOptions {
  artifactParent: string
  run: boolean
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  timeoutMs?: number
}

/** Requested-command status; execution requires successful exec, and runner exits are recorded separately. */
export interface IsolatedCandidateResult {
  status: 'READY' | 'BLOCKED' | 'PASS' | 'FAIL'
  executed: boolean
  artifacts: string
  candidate: CandidateSnapshot
  /** True only when a complete post-run observation matches; false also covers an unavailable observation. */
  originalUnchanged: boolean
  interrupted: boolean
  timedOut: boolean
  quiescent: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  issues: string[]
}

function hash(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function writeLog(fd: number, bytes: Buffer): void {
  let offset = 0
  while (offset < bytes.byteLength) {
    const written = writeSync(fd, bytes, offset, bytes.byteLength - offset)
    if (written === 0) throw new Error('evidence log write made no progress')
    offset += written
  }
}

function gitRead(source: string, args: string[]): string | null {
  const executable = trustedAuditExecutable('git')
  if (executable === undefined) return null
  const result = spawnSync(executable, ['-C', source, ...args], {
    env: { PATH: process.env.PATH, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8', timeout: 5_000,
  })
  return result.error === undefined && result.signal === null && result.status === 0 ? result.stdout.trim() : null
}

/**
 * Hash every source entry without following symbolic links or refreshing the Git index.
 * @param source - Candidate directory, including dirty, untracked and ignored content.
 * @returns Deterministic byte, mode and link inventory plus read-only Git observations.
 * @throws When an entry name cannot round-trip through UTF-8 or an entry kind is unsupported.
 */
export async function snapshotCandidate(source: string): Promise<CandidateSnapshot> {
  const entries: CandidateEntry[] = []
  async function visit(path: string): Promise<void> {
    const absolute = path === '.' ? source : join(source, path)
    const stat = await lstat(absolute)
    const mode = stat.mode & 0o7777
    if (stat.isSymbolicLink()) {
      const target = await readlink(absolute, { encoding: 'buffer' })
      entries.push({ path, mode, kind: 'symlink', targetBase64: target.toString('base64'), sha256: hash(target) })
    } else if (stat.isFile()) {
      entries.push({ path, mode, kind: 'file', sha256: hash(await readFile(absolute)) })
    } else if (stat.isDirectory()) {
      entries.push({ path, mode, kind: 'directory' })
      const names = (await readdir(absolute, { encoding: 'buffer' })).map((bytes) => {
        const name = bytes.toString('utf8')
        if (!Buffer.from(name).equals(bytes)) throw new Error(`candidate contains a non-UTF-8 entry name in ${path}`)
        return name
      }).sort()
      for (const name of names) await visit(path === '.' ? name : `${path}/${name}`)
    } else throw new Error(`candidate contains an unsupported filesystem entry: ${path}`)
  }
  await visit('.')
  const head = gitRead(source, ['rev-parse', '--verify', 'HEAD'])
  const index = gitRead(source, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])
  let indexSha256: string | null = null
  if (index !== null) {
    try { indexSha256 = hash(await readFile(index)) } catch (_unavailableIndex) { /* An unborn repository may have no index. */ }
  }
  return { sha256: hash(JSON.stringify({ head, indexSha256, entries })), head, indexSha256, entries }
}

function contains(root: string, path: string): boolean {
  const value = relative(root, path)
  return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`))
}

async function copyCandidate(source: string, destination: string, snapshot: CandidateSnapshot): Promise<void> {
  await mkdir(destination, { mode: 0o700 })
  for (const entry of snapshot.entries) {
    if (entry.path === '.') continue
    const target = join(destination, entry.path)
    switch (entry.kind) {
      case 'directory': await mkdir(target, { mode: 0o700 }); break
      case 'file':
        await copyFile(join(source, entry.path), target)
        await chmod(target, entry.mode)
        break
      case 'symlink': await symlink(Buffer.from(entry.targetBase64, 'base64'), target); break
    }
  }
  for (const entry of snapshot.entries.toReversed()) {
    if (entry.kind === 'directory') await chmod(entry.path === '.' ? destination : join(destination, entry.path), entry.mode)
  }
}

async function json(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}

async function namespaceMembers(namespace: string): Promise<string[]> {
  const members: string[] = []
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      if (await readlink(`/proc/${name}/ns/pid`) === namespace) members.push(name)
    } catch (_exitedOrInaccessibleProcess) { /* Only readable processes can identify this owned namespace. */ }
  }
  return members
}

async function namespaceDrained(namespace: string): Promise<boolean> {
  const deadline = performance.now() + 5_000
  while ((await namespaceMembers(namespace)).length > 0) {
    if (performance.now() >= deadline) return false
    await new Promise<void>(resolve => setTimeout(resolve, 10))
  }
  return true
}

interface RunnerIdentity {
  uid: number
  gid: number
  pid: number
  namespace: string
  userNamespace: string
  mountNamespace: string
  dumpable: false
  noNewPrivileges: true
}

type CommandSettlement = { code: number | null; signal: NodeJS.Signals | null; startFailed: boolean }
type SupervisorMessage =
  | { kind: 'runner'; facts: RunnerIdentity }
  | { kind: 'started'; pid: number }
  | { kind: 'output'; stream: 'stdout' | 'stderr'; data: string }
  | { kind: 'settled'; result: CommandSettlement }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function assertNever(message: never): never {
  throw new Error(`unsupported supervisor message: ${JSON.stringify(message)}`)
}

function parseSupervisorMessage(line: string): SupervisorMessage {
  const value: unknown = JSON.parse(line)
  if (!record(value)) throw new Error('invalid supervisor message')
  switch (value.kind) {
    case 'runner': {
      const facts = value.facts
      if (!record(facts) || !integer(facts.uid) || !integer(facts.gid) || facts.pid !== 1
        || typeof facts.namespace !== 'string' || !/^pid:\[\d+\]$/.test(facts.namespace)
        || typeof facts.userNamespace !== 'string' || !/^user:\[\d+\]$/.test(facts.userNamespace)
        || typeof facts.mountNamespace !== 'string' || !/^mnt:\[\d+\]$/.test(facts.mountNamespace)
        || facts.dumpable !== false || facts.noNewPrivileges !== true) throw new Error('unprotected supervisor')
      return { kind: 'runner', facts: { uid: facts.uid, gid: facts.gid, pid: facts.pid, namespace: facts.namespace,
        userNamespace: facts.userNamespace, mountNamespace: facts.mountNamespace, dumpable: false, noNewPrivileges: true } }
    }
    case 'started':
      if (!integer(value.pid) || value.pid <= 1) throw new Error('invalid command PID')
      return { kind: 'started', pid: value.pid }
    case 'output':
      if ((value.stream !== 'stdout' && value.stream !== 'stderr') || typeof value.data !== 'string'
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data)) throw new Error('invalid command output')
      return { kind: 'output', stream: value.stream, data: value.data }
    case 'settled': {
      const result = value.result
      if (!record(result) || typeof result.startFailed !== 'boolean'
        || !(result.code === null || (integer(result.code) && result.code <= 255))
        || !(result.signal === null || (typeof result.signal === 'string' && Object.hasOwn(osConstants.signals, result.signal)))
        || (result.startFailed ? result.code !== null || result.signal !== null : (result.code === null) === (result.signal === null))) {
        throw new Error('invalid command settlement')
      }
      return { kind: 'settled', result: { code: result.code, signal: result.signal as NodeJS.Signals | null, startFailed: result.startFailed } }
    }
    default: throw new Error('unsupported supervisor message')
  }
}

// PID 1 has no visible supervisor ancestor whose descriptors the command can reopen.
// Non-dumpability denies same-UID /proc/1/fd and ptrace access; command pipes carry data only.
const SUPERVISOR_SCRIPT = String.raw`import base64, ctypes, json, os, selectors, signal, subprocess, sys
libc = ctypes.CDLL(None, use_errno=True)
libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
if libc.prctl(4, 0, 0, 0, 0) != 0 or libc.prctl(38, 1, 0, 0, 0) != 0:
    raise RuntimeError('supervisor process protection unavailable')
if libc.prctl(3, 0, 0, 0, 0) != 0 or libc.prctl(39, 0, 0, 0, 0) != 1 or os.getpid() != 1:
    raise RuntimeError('supervisor process protection not enforced')
def emit(value):
    sys.stdout.write(json.dumps(value, separators=(',', ':')) + '\n')
    sys.stdout.flush()
def stop_descendants():
    try:
        os.kill(-1, signal.SIGKILL)
    except ProcessLookupError as no_descendants:
        pass  # The namespace contains only its supervisor.
facts = dict(uid=os.getuid(), gid=os.getgid(), pid=os.getpid(), namespace=os.readlink('/proc/self/ns/pid'), userNamespace=os.readlink('/proc/self/ns/user'), mountNamespace=os.readlink('/proc/self/ns/mnt'), dumpable=False, noNewPrivileges=True)
emit(dict(kind='runner', facts=facts))
request = json.load(sys.stdin)
try:
    child = subprocess.Popen(request['command'], env=request['env'], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
except OSError:
    emit(dict(kind='settled', result=dict(code=None, signal=None, startFailed=True)))
    sys.exit(0)
emit(dict(kind='started', pid=child.pid))
selector = selectors.DefaultSelector()
selector.register(child.stdout, selectors.EVENT_READ, 'stdout')
selector.register(child.stderr, selectors.EVENT_READ, 'stderr')
stopped = False
while selector.get_map():
    for key, events in selector.select(0.05):
        data = os.read(key.fd, 32768)
        if data:
            emit(dict(kind='output', stream=key.data, data=base64.b64encode(data).decode('ascii')))
        else:
            selector.unregister(key.fileobj)
            key.fileobj.close()
    if child.poll() is not None and not stopped:
        stop_descendants()
        stopped = True
code = child.wait()
stop_descendants()
selector.close()
emit(dict(kind='settled', result=dict(code=code if code >= 0 else None, signal=signal.Signals(-code).name if code < 0 else None, startFailed=False)))
`

function probeSupervisor(work: string, env: NodeJS.ProcessEnv): string | null {
  const executable = trustedAuditExecutable('python3', env)
  if (executable === undefined) return null
  const probe = spawnSync(executable, ['-I', '-S', '-c',
    'import ctypes,selectors,subprocess,sys; p=ctypes.CDLL(None); p.prctl.argtypes=[ctypes.c_int]+[ctypes.c_ulong]*4; assert p.prctl(4,0,0,0,0)==0; assert p.prctl(38,1,0,0,0)==0; assert p.prctl(3,0,0,0,0)==0; assert p.prctl(39,0,0,0,0)==1; print(sys.executable)'],
  { cwd: work, env: { PATH: env.PATH }, encoding: 'utf8', timeout: 5_000, maxBuffer: 4096 })
  return !probe.error && probe.signal === null && probe.status === 0 && probe.stdout.trim() === executable ? executable : null
}

async function execute(
  runner: string, supervisor: string, work: string, artifacts: string, spec: PreflightSpec, options: IsolatedCandidateOptions,
  result: IsolatedCandidateResult,
): Promise<void> {
  const environment: NodeJS.ProcessEnv = {
    PATH: options.env?.PATH ?? process.env.PATH, HOME: join(artifacts, 'home'), TMPDIR: join(artifacts, 'tmp'),
    AUDIT_ARTIFACT_DIR: join(artifacts, 'output'),
  }
  const commandEnvironment = { ...environment }
  for (const name of [...spec.requiredEnv ?? [], ...spec.search ? [spec.search.credentialEnv] : []]) {
    const value = (options.env ?? process.env)[name]
    if (value !== undefined) commandEnvironment[name] = value
  }
  const argv = ['--unshare-user', '--unshare-pid', '--unshare-net', '--unshare-ipc', '--unshare-uts',
    '--as-pid-1', '--new-session', '--die-with-parent', '--cap-drop', 'ALL', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev',
    ...['work', 'home', 'tmp', 'output'].flatMap(name => ['--bind', join(artifacts, name), join(artifacts, name)]),
    '--chdir', work, '--', supervisor, '-I', '-S', '-c', SUPERVISOR_SCRIPT]
  const descriptors: number[] = []
  const openLog = (name: string): number => {
    const fd = openSync(join(artifacts, name), 'wx', 0o600)
    descriptors.push(fd)
    return fd
  }
  const termination = { interrupted: false, timedOut: false }
  const runnerOutcome: { exitCode: number | null; signal: NodeJS.Signals | null } = { exitCode: null, signal: null }
  const observed: { facts?: RunnerIdentity; pid?: number; settlement?: CommandSettlement; protocolError?: string } = {}
  let spawned = false
  try {
    const stdout = openLog('stdout.log')
    const stderr = openLog('stderr.log')
    const runnerStderr = openLog('runner-stderr.log')
    const child = spawn(runner, argv, { cwd: work, env: environment, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    spawned = child.pid !== undefined
    result.quiescent = !spawned
    let escalation: ReturnType<typeof setTimeout> | undefined
    const stop = (): void => {
      termination.interrupted = true
      const pid = child.pid
      if (pid === undefined) return
      const kill = (signal: NodeJS.Signals): void => {
        try { process.kill(-pid, signal) } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error
        }
      }
      kill('SIGTERM')
      escalation ??= setTimeout(() => { kill('SIGKILL') }, 250)
    }
    let pending = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (observed.protocolError !== undefined) return
      try {
        pending += chunk
        let newline: number
        while ((newline = pending.indexOf('\n')) !== -1) {
          if (newline > 131_072) throw new Error('oversized supervisor message')
          const message = parseSupervisorMessage(pending.slice(0, newline))
          pending = pending.slice(newline + 1)
          switch (message.kind) {
            case 'runner':
              if (observed.facts !== undefined) throw new Error('duplicate supervisor identity')
              observed.facts = message.facts
              break
            case 'started':
              if (observed.facts === undefined || observed.pid !== undefined || observed.settlement !== undefined) throw new Error('unexpected command start')
              observed.pid = message.pid
              break
            case 'output':
              if (observed.pid === undefined || observed.settlement !== undefined) throw new Error('unexpected command output')
              writeLog(message.stream === 'stdout' ? stdout : stderr, Buffer.from(message.data, 'base64'))
              break
            case 'settled':
              if (observed.facts === undefined || observed.settlement !== undefined || message.result.startFailed !== (observed.pid === undefined)) throw new Error('unexpected command settlement')
              observed.settlement = message.result
              break
            default: assertNever(message)
          }
        }
        if (pending.length > 131_072) throw new Error('oversized supervisor message')
      } catch (error) {
        observed.protocolError = error instanceof Error ? error.message : 'supervisor channel unavailable'
        stop()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      try { writeLog(runnerStderr, chunk) } catch (_unavailableRunnerLog) {
        observed.protocolError ??= 'runner diagnostic log unavailable'
        stop()
      }
    })
    // The supervisor receives declared variables through a private input pipe, never its own environment.
    child.stdin.on('error', (_closedSupervisorInput: Error) => { /* Runner refusal may close input before consuming the request. */ })
    child.stdin.end(JSON.stringify({ command: spec.command, env: commandEnvironment }))
    const deadline = setTimeout(() => { termination.timedOut = true; stop() }, options.timeoutMs ?? 300_000)
    options.signal?.addEventListener('abort', stop, { once: true })
    try {
      await new Promise<void>((resolve) => {
        child.once('error', (error) => { observed.protocolError ??= error.message })
        child.once('close', (exitCode, exitSignal) => { runnerOutcome.exitCode = exitCode; runnerOutcome.signal = exitSignal; resolve() })
        if (options.signal?.aborted) stop()
      })
    } finally {
      clearTimeout(deadline)
      if (escalation !== undefined) clearTimeout(escalation)
      options.signal?.removeEventListener('abort', stop)
    }
    if (pending.length !== 0) observed.protocolError ??= 'incomplete supervisor message'
  } finally {
    const settlement = observed.settlement
    result.executed = observed.pid !== undefined
    result.exitCode = settlement?.code ?? null
    result.signal = settlement?.signal ?? null
    result.interrupted = termination.interrupted || observed.protocolError !== undefined || settlement === undefined
      || settlement.signal !== null || runnerOutcome.exitCode !== 0 || runnerOutcome.signal !== null
    result.timedOut = termination.timedOut
    const failures: unknown[] = []
    try {
      result.quiescent = observed.facts === undefined ? !spawned : await namespaceDrained(observed.facts.namespace)
    } catch (error) {
      result.quiescent = false
      failures.push(error)
    }
    for (const fd of descriptors) {
      try { closeSync(fd) } catch (error) { failures.push(error) }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'audit runner cleanup failed')
  }
  await json(join(artifacts, 'runner-result.json'), { ...runnerOutcome, protocolError: observed.protocolError ?? null })
  if (observed.facts !== undefined) await json(join(artifacts, 'runner.json'), observed.facts)
  if (observed.pid !== undefined) await json(join(artifacts, 'started.json'), { ...observed.facts, commandStarted: true, commandPid: observed.pid })
  if (observed.settlement !== undefined) await json(join(artifacts, 'command-result.json'), observed.settlement)
}

/**
 * Copy the current candidate and execute only inside an enforced read-only host view.
 * @param spec - Current source directory, exact argv and prerequisite declaration.
 * @param options - Separate artifact parent, explicit execution, deadline and cancellation.
 * @returns Exec-confirmed command facts and controller-owned artifacts; never repairs or writes the original.
 * @throws For an invalid artifact location or invalid deadline before creating output.
 */
export async function runIsolatedCandidate(spec: PreflightSpec, options: IsolatedCandidateOptions): Promise<IsolatedCandidateResult> {
  const source = await realpath(spec.cwd)
  const parent = await realpath(options.artifactParent)
  if (contains(source, parent)) throw new Error('artifact parent must be outside the original candidate')
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) throw new Error('timeoutMs must be a positive integer')
  const candidate = await snapshotCandidate(source)
  const artifacts = await mkdtemp(join(parent, 'audit-candidate-'))
  const work = join(artifacts, 'work')
  const result: IsolatedCandidateResult = { status: 'BLOCKED', executed: false, artifacts, candidate,
    originalUnchanged: true, interrupted: false, timedOut: false, quiescent: true, exitCode: null, signal: null, issues: [] }
  try {
    await json(join(artifacts, 'candidate.json'), candidate)
    if (options.signal?.aborted) throw new Error('cancelled before candidate preparation')
    await copyCandidate(source, work, candidate)
    if ((await snapshotCandidate(work)).sha256 !== candidate.sha256 || (await snapshotCandidate(source)).sha256 !== candidate.sha256) {
      throw new Error('candidate changed while copying; no command was run')
    }
    await mkdir(join(artifacts, 'home'), { mode: 0o700 })
    await mkdir(join(artifacts, 'tmp'), { mode: 0o700 })
    await mkdir(join(artifacts, 'output'), { mode: 0o700 })
    const preflight = preflightAudit({ ...spec, cwd: work, runner: 'bubblewrap' }, {
      ...options.env === undefined ? {} : { env: options.env }, factsPath: join(artifacts, 'preflight-facts.json'),
    })
    await json(join(artifacts, 'preflight.json'), preflight)
    if (preflight.status === 'BLOCKED') throw new Error('preflight blocked; inspect preflight.json')
    const supervisor = probeSupervisor(work, options.env ?? process.env)
    await json(join(artifacts, 'supervisor-prerequisite.json'), { executable: supervisor, processProtection: supervisor !== null })
    if (supervisor === null) throw new Error('Python 3 with ctypes, selectors, subprocess and Linux prctl protection is required; no command was run')
    if (options.signal?.aborted) throw new Error('cancelled before execution')
    if (!options.run) result.status = 'READY'
    else {
      const runner = probeAuditRunner(work, [], options.env ?? process.env)
      if (runner.status !== 'available' || runner.executable === null) throw new Error('confinement became unavailable; no command was run')
      await execute(runner.executable, supervisor, work, artifacts, spec, options, result)
      if (!result.executed || result.interrupted || !result.quiescent) result.issues.push('command did not settle with quiescent confinement')
      else result.status = result.exitCode === 0 ? 'PASS' : 'FAIL'
    }
  } catch (error) {
    result.interrupted ||= options.signal?.aborted ?? false
    result.issues.push(error instanceof Error ? error.message : 'candidate execution unavailable')
  }
  let after: CandidateSnapshot | undefined
  try {
    after = await snapshotCandidate(source)
    result.originalUnchanged = after.sha256 === candidate.sha256
    if (!result.originalUnchanged) { result.status = 'BLOCKED'; result.issues.push('original candidate changed; no restoration was attempted') }
  } catch (error) {
    result.status = 'BLOCKED'
    result.originalUnchanged = false
    result.issues.push(`original candidate observation unavailable: ${error instanceof Error ? error.message : 'read failed'}`)
  }
  try { if (after !== undefined) await json(join(artifacts, 'original-after.json'), after) } catch (error) {
    result.status = 'BLOCKED'
    result.issues.push(`original-after.json unavailable: ${error instanceof Error ? error.message : 'evidence write failed'}`)
  }
  try { await json(join(artifacts, 'result.json'), result) } catch (error) {
    result.status = 'BLOCKED'
    result.issues.push(`result.json unavailable: ${error instanceof Error ? error.message : 'evidence write failed'}`)
  }
  return result
}

/**
 * Execute the isolated repository-audit CLI; this does not launch a Harness application.
 * @param argv - `--spec FILE --artifacts EXISTING_DIRECTORY` and optional `--run`.
 * @returns 0 for READY/PASS, 1 for FAIL, 2 for BLOCKED, or 3 for invalid input.
 */
export async function runIsolatedCandidateCli(argv: string[]): Promise<number> {
  try {
    if (argv[0] !== '--spec' || !argv[1] || argv[2] !== '--artifacts' || !argv[3]
      || (argv.length !== 4 && !(argv.length === 5 && argv[4] === '--run'))) throw new Error('usage: isolated-candidate.ts --spec FILE --artifacts DIRECTORY [--run]')
    const specPath = resolve(argv[1])
    const raw: unknown = JSON.parse(await readFile(specPath, 'utf8'))
    const spec = parsePreflightSpec(raw)
    spec.cwd = resolve(dirname(specPath), spec.cwd)
    const controller = new AbortController()
    const interrupt = (): void => { controller.abort('audit interrupted') }
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
      const result = await runIsolatedCandidate(spec, { artifactParent: resolve(argv[3]), run: argv[4] === '--run', signal: controller.signal })
      process.stdout.write(JSON.stringify({ ...result, candidate: { sha256: result.candidate.sha256, head: result.candidate.head } }, null, 2) + '\n')
      return result.status === 'BLOCKED' ? 2 : result.status === 'FAIL' ? 1 : 0
    } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt) }
  } catch (error) {
    process.stderr.write(`audit-evidence: ${error instanceof Error ? error.message : 'invalid isolated candidate'}\n`)
    return 3
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runIsolatedCandidateCli(process.argv.slice(2))
}
