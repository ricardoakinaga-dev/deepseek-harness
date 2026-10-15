import { spawnSync } from 'node:child_process'
import { watch } from 'node:fs'
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { snapshotCandidate, runIsolatedCandidate } from './isolated-candidate.ts'
import { probeAuditRunner } from './preflight.ts'

async function fixture(run: (source: string, artifacts: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-isolated-audit-'))
  try {
    const source = join(root, 'source')
    const artifacts = join(root, 'artifacts')
    await mkdir(source)
    await mkdir(artifacts)
    const git = (...args: string[]) => {
      const result = spawnSync('git', ['-C', source, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8' })
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
    }
    git('init', '--quiet')
    await writeFile(join(source, 'tracked.txt'), 'committed\n')
    await writeFile(join(source, '.gitignore'), 'ignored.txt\n')
    git('add', '.')
    git('-c', 'user.name=Audit fixture', '-c', 'user.email=audit@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture')
    await writeFile(join(source, 'tracked.txt'), 'dirty candidate\n')
    await writeFile(join(source, 'untracked.txt'), 'untracked candidate\n')
    await writeFile(join(source, 'ignored.txt'), 'ignored candidate\n')
    await symlink(join(source, 'tracked.txt'), join(source, 'original-link'))
    await run(source, artifacts)
  } finally { await rm(root, { recursive: true, force: true }) }
}

describe('isolated dirty audit candidate', () => {
  it.skipIf(process.platform === 'win32')('refuses undecodable entry names before claiming a candidate identity', async () => fixture(async (source) => {
    await writeFile(Buffer.concat([Buffer.from(source + '/'), Buffer.from([0xff])]), 'raw file')
    await writeFile(join(source, '\ufffd'), 'decoded sibling')
    await expect(snapshotCandidate(source)).rejects.toThrow('non-UTF-8 entry name')
  }))

  it.skipIf(process.platform === 'win32')('distinguishes non-UTF8 symbolic-link target bytes', async () => fixture(async (source) => {
    const link = join(source, 'raw-link')
    await symlink(Buffer.from([0xff]), link)
    const first = await snapshotCandidate(source)
    await rm(link)
    await symlink(Buffer.from([0xfe]), link)
    const second = await snapshotCandidate(source)
    expect(second.sha256).not.toBe(first.sha256)
    expect(first.entries.find(entry => entry.path === 'raw-link')).toMatchObject({ targetBase64: '/w==' })
    expect(second.entries.find(entry => entry.path === 'raw-link')).toMatchObject({ targetBase64: '/g==' })
  }))

  it.skipIf(process.platform !== 'linux')('executes a verified copy with unchanged non-UTF8 symbolic-link target bytes', async () => fixture(async (source, artifacts) => {
    await symlink(Buffer.from([0xff]), join(source, 'raw-link'))
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e',
      "require('node:assert/strict').deepEqual(require('node:fs').readlinkSync('raw-link', { encoding: 'buffer' }), Buffer.from([255]))"] },
    { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'PASS', executed: true, originalUnchanged: true })
    expect(await readlink(join(result.artifacts, 'work', 'raw-link'), { encoding: 'buffer' })).toEqual(Buffer.from([0xff]))
  }))

  it.skipIf(process.platform !== 'linux').each(['runner-result.json', 'runner.json', 'started.json', 'command-result.json', 'original-after.json', 'result.json', 'namespace-drain', 'original-observation'])(
    'preserves observed command facts when evidence operation %s fails', async failedRecord => fixture(async (source, artifacts) => {
      const driver = join(artifacts, 'write-failure.mjs')
      const module = resolve('scripts/audit-evidence/isolated-candidate.ts')
      await writeFile(driver, `import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
const original = fs.writeFile;
const readDirectory = fs.readdir;
let rejected = false;
let runnerFinished = false;
fs.writeFile = async function(path, ...args) {
  if (!rejected && String(path).endsWith('/' + ${JSON.stringify(failedRecord)})) {
    rejected = true; throw Object.assign(new Error('injected evidence write failure'), { code: 'EIO' });
  }
  const value = await original.call(this, path, ...args);
  if (String(path).endsWith('/runner-result.json')) runnerFinished = true;
  return value;
};
fs.readdir = async function(path, ...args) {
  if (!rejected && ((${JSON.stringify(failedRecord)} === 'namespace-drain' && path === '/proc')
      || (${JSON.stringify(failedRecord)} === 'original-observation' && runnerFinished && path === ${JSON.stringify(source)}))) {
    rejected = true; throw Object.assign(new Error('injected drainage observation failure'), { code: 'EIO' });
  }
  return readDirectory.call(this, path, ...args);
};
syncBuiltinESMExports();
const { runIsolatedCandidate } = await import(pathToFileURL(${JSON.stringify(module)}));
const result = await runIsolatedCandidate({ cwd: ${JSON.stringify(source)}, command: [process.execPath, '-e',
  "require('node:fs').writeFileSync('actually-executed', 'yes'); console.log('completed command'); process.exit(7)"] },
  { artifactParent: ${JSON.stringify(artifacts)}, run: true });
console.log(JSON.stringify({ result, rejected }));
`)
      const child = spawnSync(process.execPath, [driver], { encoding: 'utf8', timeout: 20_000 })
      expect(child.error).toBeUndefined()
      expect(child.signal).toBeNull()
      expect(child.status).toBe(0)
      const observed = JSON.parse(child.stdout) as { result: { artifacts: string }; rejected: boolean }
      expect(observed).toMatchObject({ rejected: true, result: {
        status: 'BLOCKED', executed: true, exitCode: 7, signal: null,
        quiescent: failedRecord !== 'namespace-drain', originalUnchanged: failedRecord !== 'original-observation',
      } })
      expect(await readFile(join(observed.result.artifacts, 'work', 'actually-executed'), 'utf8')).toBe('yes')
      expect(await readFile(join(observed.result.artifacts, 'stdout.log'), 'utf8')).toBe('completed command\n')
    }),
  )

  it.skipIf(process.platform !== 'linux')('blocks incomplete evidence when the controller reaches its file size limit', async () => fixture(async (_source, artifacts) => {
    const candidate = join(artifacts, 'minimal')
    await mkdir(candidate)
    const specPath = join(artifacts, 'short-write-spec.json')
    await writeFile(specPath, JSON.stringify({ cwd: candidate, command: [process.execPath, '-e',
      'process.stdout.write(Buffer.alloc(4096, 65))'] }))
    const script = 'import os, resource, signal, sys; signal.signal(signal.SIGXFSZ, signal.SIG_IGN); resource.setrlimit(resource.RLIMIT_FSIZE, (2048, 2048)); os.execv(sys.argv[1], sys.argv[1:])'
    const child = spawnSync('/usr/bin/python3', ['-I', '-S', '-c', script, process.execPath,
      resolve('scripts/audit-evidence/isolated-candidate.ts'), '--spec', specPath, '--artifacts', artifacts, '--run'],
    { encoding: 'utf8', timeout: 20_000 })
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    const result = JSON.parse(child.stdout) as { status: string; executed: boolean; artifacts: string }
    expect(result).toMatchObject({ status: 'BLOCKED', executed: true })
    expect(child.status).toBe(2)
    expect((await readFile(join(result.artifacts, 'stdout.log'))).byteLength).toBe(2048)
    const diagnostic = JSON.parse(await readFile(join(result.artifacts, 'runner-result.json'), 'utf8')) as { protocolError: string }
    expect(diagnostic.protocolError).toContain('EFBIG')
  }))

  it.skipIf(process.platform !== 'linux')('does not execute candidate Python during preparation', async () => fixture(async (source, artifacts) => {
    await writeFile(join(source, 'python3'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(source, 'tracked.txt'))}, 'escaped probe'); console.log('/usr/bin/python3');\n`, { mode: 0o700 })
    const before = await snapshotCandidate(source)
    const result = await runIsolatedCandidate({ cwd: source, command: ['./python3'] }, {
      artifactParent: artifacts, run: false, env: { PATH: '.:/usr/bin:/bin' },
    })
    expect(result).toMatchObject({ status: 'READY', executed: false, originalUnchanged: true })
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
  }))

  it.skipIf(process.platform !== 'linux')('does not execute a candidate runner while probing confinement', async () => fixture(async (source) => {
    await writeFile(join(source, 'bwrap'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(source, 'tracked.txt'))}, 'escaped runner'); console.log('{}');\n`, { mode: 0o700 })
    const before = await snapshotCandidate(source)
    const runner = probeAuditRunner(source, [], { PATH: `${source}:/usr/bin:/bin` })
    expect(runner.status).toBe('available')
    expect(runner.executable).not.toBe(join(source, 'bwrap'))
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
  }))

  it('binds dirty, untracked, ignored, mode and link bytes independently of HEAD', async () => fixture(async (source) => {
    const first = await snapshotCandidate(source)
    expect(first.entries.map(entry => entry.path)).toContain('ignored.txt')
    expect(first.entries.map(entry => entry.path)).toContain('untracked.txt')
    await writeFile(join(source, 'untracked.txt'), 'another candidate\n')
    expect((await snapshotCandidate(source)).sha256).not.toBe(first.sha256)
    await writeFile(join(source, 'untracked.txt'), 'untracked candidate\n')
    await chmod(join(source, 'tracked.txt'), 0o755)
    expect((await snapshotCandidate(source)).sha256).not.toBe(first.sha256)
    await chmod(join(source, 'tracked.txt'), 0o644)
    await rm(join(source, 'original-link'))
    await symlink('untracked.txt', join(source, 'original-link'))
    expect((await snapshotCandidate(source)).sha256).not.toBe(first.sha256)
  }))

  it('demonstrates that copying alone does not protect an absolute source path', async () => fixture(async (source, artifacts) => {
    const copy = join(artifacts, 'unconfined-control')
    await cp(source, copy, { recursive: true, dereference: false, verbatimSymlinks: true })
    const before = await snapshotCandidate(source)
    const child = spawnSync(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(join(source, 'tracked.txt'))},'unsafe control')`],
      { cwd: copy, encoding: 'utf8' })
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    expect(child.status).toBe(0)
    expect((await snapshotCandidate(source)).sha256).not.toBe(before.sha256)
  }))

  it('blocks before running when confinement is absent', async () => fixture(async (source, artifacts) => {
    const before = await snapshotCandidate(source)
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', "require('node:fs').writeFileSync('ran','bad')"] },
      { artifactParent: artifacts, run: true, env: { PATH: join(artifacts, 'missing-bin') } })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: false, originalUnchanged: true })
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
  }))

  it('rejects artifacts inside the original before making any output', async () => fixture(async (source) => {
    const before = await snapshotCandidate(source)
    await expect(runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', 'process.exit(0)'] },
      { artifactParent: source, run: true })).rejects.toThrow('outside')
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
  }))

  it.skipIf(process.platform !== 'linux')('blocks a missing Python supervisor before running the requested command', async () => fixture(async (source, artifacts) => {
    const runner = probeAuditRunner(source)
    if (runner.status !== 'available' || runner.executable === null) throw new Error('functional bubblewrap is required')
    const bin = join(artifacts, 'bin')
    await mkdir(bin)
    await symlink(runner.executable, join(bin, 'bwrap'))
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', "require('node:fs').writeFileSync('ran','bad')"] },
      { artifactParent: artifacts, run: true, env: { PATH: bin } })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: false, originalUnchanged: true })
    expect(JSON.parse(await readFile(join(result.artifacts, 'supervisor-prerequisite.json'), 'utf8')))
      .toMatchObject({ executable: null, processProtection: false })
    await expect(readFile(join(result.artifacts, 'work', 'ran'))).rejects.toThrow('ENOENT')
  }))

  it('retains a candidate-bound BLOCKED result for cancellation before any command', async () => fixture(async (source, artifacts) => {
    const controller = new AbortController()
    controller.abort('pre-aborted')
    const before = await snapshotCandidate(source)
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', 'process.exit(0)'] },
      { artifactParent: artifacts, run: true, signal: controller.signal })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: false, interrupted: true, originalUnchanged: true })
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
  }))

  it.skipIf(process.platform !== 'linux')('executes the public repository utility CLI with retained candidate artifacts', async () => fixture(async (source, artifacts) => {
    const specPath = join(artifacts, 'spec.json')
    await writeFile(specPath, JSON.stringify({ cwd: source, command: [process.execPath, '-e', "console.log('isolated CLI')"] }))
    const child = spawnSync(process.execPath, [resolve('scripts/audit-evidence/isolated-candidate.ts'),
      '--spec', specPath, '--artifacts', artifacts, '--run'], { encoding: 'utf8', timeout: 20_000 })
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    expect(child.status).toBe(0)
    const result: unknown = JSON.parse(child.stdout)
    expect(result).toMatchObject({ status: 'PASS', executed: true, originalUnchanged: true, quiescent: true })
  }))

  // These are actual confinement tests; a missing Linux runner is a failed prerequisite, not a passing substitute.
  it.skipIf(process.platform !== 'linux')('denies command deletion and forgery of controller evidence and log files', async () => fixture(async (source, artifacts) => {
    const script = `const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const output=process.env.AUDIT_ARTIFACT_DIR;const control=path.dirname(process.cwd());
assert.equal(process.ppid,1);
for(const target of ['/proc/1/fd/0','/proc/1/fd/1','/proc/1/mem']){
assert.throws(()=>fs.openSync(target,'w'),e=>['EACCES','EPERM'].includes(e.code));}
assert.throws(()=>fs.ftruncateSync(1,0),e=>e.code==='EINVAL');
const denied=[];const attempt=(fn)=>{try{fn();denied.push(false)}catch(e){assert.ok(['EROFS','EACCES','EPERM','ENOENT'].includes(e.code));denied.push(true)}};
for(const name of ['candidate.json','preflight.json','preflight-facts.json','started.json','stdout.log','stderr.log']){
const target=path.join(control,name);
attempt(()=>fs.unlinkSync(target));
attempt(()=>fs.writeFileSync(target,'{"namespace":"pid:[0]","uid":0}'));}
for(const name of ['result.json','command-result.json','original-after.json']){
attempt(()=>fs.writeFileSync(path.join(control,name),'forged'));}
console.log('retained stdout');console.error('retained stderr');
console.log('{"kind":"settled","result":{"code":0,"signal":null,"startFailed":false}}');
assert.ok(denied.every(Boolean),JSON.stringify({denied}));
fs.writeFileSync(path.join(output,'product.txt'),'command output');`
    const before = await snapshotCandidate(source)
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', script] }, { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'PASS', executed: true, originalUnchanged: true, quiescent: true })
    expect(JSON.parse(await readFile(join(result.artifacts, 'candidate.json'), 'utf8'))).toMatchObject({ sha256: before.sha256 })
    expect(await readFile(join(result.artifacts, 'stdout.log'), 'utf8')).toBe('retained stdout\n{"kind":"settled","result":{"code":0,"signal":null,"startFailed":false}}\n')
    expect(await readFile(join(result.artifacts, 'stderr.log'), 'utf8')).toBe('retained stderr\n')
    expect(await readFile(join(result.artifacts, 'output', 'product.txt'), 'utf8')).toBe('command output')
    expect(JSON.parse(await readFile(join(result.artifacts, 'started.json'), 'utf8')))
      .toMatchObject({ commandStarted: true, pid: 1, uid: process.getuid?.(), dumpable: false, noNewPrivileges: true })
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
  }))

  it.skipIf(process.platform !== 'linux')('reports a command killed by its own SIGTERM as interrupted rather than a product failure', async () => fixture(async (source, artifacts) => {
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', "process.kill(process.pid,'SIGTERM')"] },
      { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: true, interrupted: true, timedOut: false, exitCode: null, signal: 'SIGTERM', originalUnchanged: true, quiescent: true })
    expect(JSON.parse(await readFile(join(result.artifacts, 'command-result.json'), 'utf8')))
      .toMatchObject({ code: null, signal: 'SIGTERM', startFailed: false })
  }))

  it.skipIf(process.platform !== 'linux')('does not claim execution when an executable shebang interpreter is missing', async () => fixture(async (source, artifacts) => {
    await writeFile(join(source, 'missing-interpreter'), '#!/dsh-audit-no-such-interpreter\n', { mode: 0o755 })
    const result = await runIsolatedCandidate({ cwd: source, command: ['./missing-interpreter'] }, { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'BLOCKED', executed: false, exitCode: null, signal: null, originalUnchanged: true, quiescent: true })
    expect(JSON.parse(await readFile(join(result.artifacts, 'command-result.json'), 'utf8'))).toMatchObject({ startFailed: true })
    expect(JSON.parse(await readFile(join(result.artifacts, 'runner.json'), 'utf8'))).toMatchObject({ pid: 1, dumpable: false })
  }))

  it.skipIf(process.platform !== 'linux')('keeps a normal exit 143 distinct from SIGTERM', async () => fixture(async (source, artifacts) => {
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', 'process.exit(143)'] }, { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'FAIL', executed: true, exitCode: 143, signal: null, interrupted: false, quiescent: true })
    expect(JSON.parse(await readFile(join(result.artifacts, 'runner-result.json'), 'utf8'))).toMatchObject({ exitCode: 0, signal: null })
  }))

  it.skipIf(process.platform !== 'linux')('passes declared Python variables only to the command and preserves binary logs', async () => fixture(async (source, artifacts) => {
    await writeFile(join(source, 'selectors.py'), "raise RuntimeError('candidate module must not run in supervisor')\n")
    const result = await runIsolatedCandidate({ cwd: source, requiredEnv: ['PYTHONPATH', 'PYTHONINSPECT'], command: [process.execPath, '-e',
      "require('node:assert/strict').equal(process.env.PYTHONINSPECT,'1');process.stdout.write(Buffer.from([0,255,13,10]));process.stderr.write(Buffer.from([254,0]));"] },
    { artifactParent: artifacts, run: true, env: { PATH: process.env.PATH, PYTHONPATH: source, PYTHONINSPECT: '1' } })
    expect(result).toMatchObject({ status: 'PASS', executed: true, quiescent: true })
    expect(await readFile(join(result.artifacts, 'stdout.log'))).toEqual(Buffer.from([0, 255, 13, 10]))
    expect(await readFile(join(result.artifacts, 'stderr.log'))).toEqual(Buffer.from([254, 0]))
  }))

  it.skipIf(process.platform !== 'linux')('quiesces detached descendants after a successful command exit', async () => fixture(async (source, artifacts) => {
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e',
      "const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});child.unref();"] },
    { artifactParent: artifacts, run: true, timeoutMs: 10_000 })
    expect(result).toMatchObject({ status: 'PASS', executed: true, interrupted: false, timedOut: false, quiescent: true })
    const started: unknown = JSON.parse(await readFile(join(result.artifacts, 'started.json'), 'utf8'))
    if (typeof started !== 'object' || started === null || !('namespace' in started)) throw new Error('runner namespace missing')
    for (const pid of (await readdir('/proc')).filter(name => /^\d+$/.test(name))) {
      let namespace: string
      try { namespace = await readlink(`/proc/${pid}/ns/pid`) } catch (_unavailableProcess) { continue }
      expect(namespace).not.toBe(started.namespace)
    }
  }))

  it.skipIf(process.platform !== 'linux')('runs the dirty copy and denies absolute, symlink and Git-index writes to the original', async () => fixture(async (source, artifacts) => {
    const before = await snapshotCandidate(source)
    const index = await readFile(join(source, '.git', 'index'))
    const script = `const fs=require('node:fs');const assert=require('node:assert/strict');
assert.equal(fs.readFileSync('tracked.txt','utf8'),'dirty candidate\\n');
assert.equal(fs.readFileSync('untracked.txt','utf8'),'untracked candidate\\n');
assert.equal(fs.readFileSync('ignored.txt','utf8'),'ignored candidate\\n');
for(const path of [${JSON.stringify(join(source, 'tracked.txt'))},'original-link',${JSON.stringify(join(source, '.git', 'index'))}]){
assert.throws(()=>fs.writeFileSync(path,'forbidden'),e=>['EROFS','EACCES','EPERM'].includes(e.code));}
fs.writeFileSync('tracked.txt','built in isolation');fs.writeFileSync('build.out','done');`
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', script] },
      { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'PASS', executed: true, originalUnchanged: true, candidate: { sha256: before.sha256 } })
    expect(await readFile(join(result.artifacts, 'work', 'build.out'), 'utf8')).toBe('done')
    expect(await readFile(join(result.artifacts, 'work', 'tracked.txt'), 'utf8')).toBe('built in isolation')
    expect(await readlink(join(result.artifacts, 'work', 'original-link'))).toBe(join(source, 'tracked.txt'))
    expect(await readFile(join(source, '.git', 'index'))).toEqual(index)
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
    expect(JSON.parse(await readFile(join(result.artifacts, 'original-after.json'), 'utf8'))).toMatchObject({ sha256: before.sha256 })
  }))

  it.skipIf(process.platform !== 'linux')('preserves original bytes on a failed build and retains separate artifacts', async () => fixture(async (source, artifacts) => {
    const before = await snapshotCandidate(source)
    const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e',
      "require('node:fs').writeFileSync('tracked.txt','failed build residue');console.error('build failed');process.exit(7)"] },
    { artifactParent: artifacts, run: true })
    expect(result).toMatchObject({ status: 'FAIL', exitCode: 7, executed: true, originalUnchanged: true })
    expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
    expect(await readFile(join(result.artifacts, 'stderr.log'), 'utf8')).toContain('build failed')
    expect(await readFile(join(result.artifacts, 'work', 'tracked.txt'), 'utf8')).toBe('failed build residue')
  }))

  // The command deadline and namespace-drain bound must settle before the outer test deadline.
  it.skipIf(process.platform !== 'linux')('cancels after an explicit child handshake and awaits descendant teardown', { timeout: 30_000 }, async () => fixture(async (source, artifacts) => {
    const before = await snapshotCandidate(source)
    const controller = new AbortController()
    let childPid: number | undefined
    const watcher = watch(artifacts, { recursive: true }, (_event, filename) => {
      if (filename?.toString().endsWith('/ready') !== true) return
      controller.abort('fixture handshake complete')
    })
    try {
      const script = `const fs=require('node:fs');const cp=require('node:child_process');
const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
fs.writeFileSync(process.env.AUDIT_ARTIFACT_DIR+'/child-pid',String(child.pid));
fs.writeFileSync('tracked.txt','interrupted residue');fs.writeFileSync(process.env.AUDIT_ARTIFACT_DIR+'/ready','ready');setInterval(()=>{},1000);`
      const result = await runIsolatedCandidate({ cwd: source, command: [process.execPath, '-e', script] },
        { artifactParent: artifacts, run: true, signal: controller.signal, timeoutMs: 10_000 })
      expect(controller.signal.aborted).toBe(true)
      expect(result).toMatchObject({ status: 'BLOCKED', executed: true, interrupted: true, originalUnchanged: true })
      childPid = Number(await readFile(join(result.artifacts, 'output', 'child-pid'), 'utf8'))
      expect(childPid).toBeGreaterThan(0)
      expect(result.quiescent).toBe(true)
      const started: unknown = JSON.parse(await readFile(join(result.artifacts, 'started.json'), 'utf8'))
      if (typeof started !== 'object' || started === null || !('namespace' in started)) throw new Error('runner namespace missing')
      for (const pid of (await readdir('/proc')).filter(name => /^\d+$/.test(name))) {
        let namespace: string
        try { namespace = await readlink(`/proc/${pid}/ns/pid`) } catch (_unavailableProcess) { continue }
        expect(namespace).not.toBe(started.namespace)
      }
      expect((await snapshotCandidate(source)).sha256).toBe(before.sha256)
      expect(await readFile(join(result.artifacts, 'work', 'tracked.txt'), 'utf8')).toBe('interrupted residue')
    } finally { watcher.close(); controller.abort() }
  }))
})
