/** Embedded build identity remains attached when a launcher moves between checkouts. */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { readRuntimeIdentity } from '../apps/cli/src/runtime-identity.ts'
import { embedRuntimeBuildIdentity } from './runtime-build-identity.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'runtime-build-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const git = (args: string[]) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
  }).trim()
  const source = join(root, 'input.ts')
  writeFileSync(source, 'export const value = 1\n')
  mkdirSync(join(root, 'apps/cli'), { recursive: true })
  writeFileSync(join(root, 'apps/cli/package.json'), '{"name":"@deepseek-ai/dsh","version":"8.1.0"}\n')
  git(['init'])
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'])
  return { root, source, git }
}

function bundlerFixture() {
  const state = fixture()
  mkdirSync(join(state.root, 'apps/cli/src'), { recursive: true })
  mkdirSync(join(state.root, 'scripts'))
  for (const path of ['package.json', 'pnpm-lock.yaml', 'apps/cli/tsdown.config.ts', 'scripts/runtime-build-identity.ts',
    'apps/cli/src/profile-boot.ts', 'unrelated-golden.txt']) writeFileSync(join(state.root, path), path === 'package.json' ? '{}' : '\n')
  state.git(['add', '.'])
  state.git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'build fixture'])
  return state
}

it('labels post-consumption input bytes as disk observations when the bundler emitted an earlier generation', async () => {
  const { build } = await import('tsdown')
  const { runtimeBuildIdentityPlugin } = await import('./runtime-build-identity.ts')
  const { root, source } = bundlerFixture()
  const a = 'export const generation = "A"\n'
  const b = 'export const generation = "B"\n'
  writeFileSync(source, a)
  await build({ config: false, cwd: root, entry: [source], outDir: join(root, 'lib'), platform: 'node', format: 'esm',
    dts: false, report: false, plugins: [{ name: 'change-consumed-input', transform(code, id) {
      if (id === source) { writeFileSync(source, b); return code }
    } }, runtimeBuildIdentityPlugin(root)] })
  const artifact = join(root, 'lib/input.mjs')
  const loaded = await import(/* @vite-ignore */pathToFileURL(artifact).href) as { generation: string }
  expect(loaded.generation).toBe('A')
  const bytes = readFileSync(artifact, 'utf8')
  const envelope = JSON.parse(bytes.slice(bytes.lastIndexOf('\n//# dsh-build-identity=') + '\n//# dsh-build-identity='.length)) as {
    manifest: { inputsSource?: string; inputs: { path: string; sha256: string }[] }
  }
  expect(envelope.manifest.inputs.find(input => input.path === 'input.ts')?.sha256)
    .toBe(createHash('sha256').update(b).digest('hex'))
  expect(envelope.manifest.inputsSource).toBe('disk-observation')
  expect(readRuntimeIdentity(pathToFileURL(artifact).href).build).toMatchObject({ inputsSource: 'disk-observation' })
})

it('shares one input and source snapshot across peers when disk changes between identity trailers', async () => {
  const { build } = await import('tsdown')
  const { runtimeBuildIdentityPlugin } = await import('./runtime-build-identity.ts')
  const { root, source } = bundlerFixture()
  writeFileSync(source, "export const loadPeer = () => import('./peer.ts')\n")
  writeFileSync(join(root, 'peer.ts'), 'export const peer = 1\n')
  let identities = 0
  const identity = runtimeBuildIdentityPlugin(root)
  const generateBundle = identity.generateBundle
  if (typeof generateBundle !== 'function') throw new Error('identity plugin has no bundle handler')
  await build({ config: false, cwd: root, entry: [source], outDir: join(root, 'lib'), platform: 'node', format: 'esm',
    dts: false, report: false, plugins: [{ name: 'mutate-between-trailers', async generateBundle(options, bundle, isWrite) {
      // Native bundle getters return fresh wrappers; detached rows retain the trailer-write barrier.
      const detached: typeof bundle = {}
      for (const [path, output] of Object.entries(bundle)) detached[path] = { ...output }
      for (const output of Object.values(detached)) {
        if (output.type !== 'chunk') continue
        let code = output.code
        Object.defineProperty(output, 'code', { configurable: true, enumerable: true, get: () => code, set: (value: string) => {
          code = value
          if (value.includes('\n//# dsh-build-identity=') && ++identities === 1) {
            writeFileSync(join(root, 'unrelated-golden.txt'), 'changed between peers\n')
            writeFileSync(join(root, 'apps/cli/package.json'), '{"version":"9.2.0"}\n')
          }
        } })
      }
      await generateBundle.call(this, options, detached, isWrite)
      for (const [path, output] of Object.entries(detached)) {
        const original = bundle[path]
        if (output.type === 'chunk' && original?.type === 'chunk') original.code = output.code
      }
    } }] })
  expect(identities).toBeGreaterThanOrEqual(2)
  const manifests = readdirSync(join(root, 'lib')).filter(path => path.endsWith('.mjs')).map((path) => {
    const bytes = readFileSync(join(root, 'lib', path), 'utf8')
    const envelope = JSON.parse(bytes.slice(bytes.lastIndexOf('\n//# dsh-build-identity=') + '\n//# dsh-build-identity='.length)) as {
      manifest: Record<string, unknown>
    }
    const { outputSha256: _output, ...common } = envelope.manifest
    return common
  })
  expect(manifests.every(manifest => JSON.stringify(manifest) === JSON.stringify(manifests[0]))).toBe(true)
  for (const path of readdirSync(join(root, 'lib')).filter(path => path.endsWith('.mjs'))) {
    expect(readRuntimeIdentity(pathToFileURL(join(root, 'lib', path)).href).build?.version).toBe('8.1.0')
  }
})

it('retains the version from its captured package-manifest input after that manifest changes', () => {
  const { root, source } = fixture()
  const artifact = join(root, 'launcher.js')
  const manifest = join(root, 'apps/cli/package.json')
  writeFileSync(artifact, embedRuntimeBuildIdentity('export {}\n', root, [source], source))
  const identity = readRuntimeIdentity(pathToFileURL(artifact).href)
  expect(identity).toMatchObject({ version: '8.1.0', versionSource: 'embedded-build-observation', build: { version: '8.1.0' } })
  expect(readFileSync(artifact, 'utf8')).toContain(createHash('sha256').update(readFileSync(manifest)).digest('hex'))
  writeFileSync(manifest, '{"name":"@deepseek-ai/dsh","version":"9.2.0"}\n')
  expect(readRuntimeIdentity(pathToFileURL(artifact).href)).toEqual(identity)
})

it.each([1, 2])('recognizes unqualified format-%s manifests without inventing consumed input identity', (format) => {
  const { root, source } = fixture()
  const artifact = join(root, 'legacy.js')
  const code = embedRuntimeBuildIdentity('export {}\n', root, [source], source)
  const marker = code.indexOf('\n//# dsh-build-identity=')
  const envelope = JSON.parse(code.slice(marker + '\n//# dsh-build-identity='.length)) as { manifest: Record<string, unknown> }
  const { version: _version, inputsSource: _inputsSource, ...original } = envelope.manifest
  const manifest = { ...original, format, ...(format === 2 ? { version: _version } : {}) }
  writeFileSync(artifact, code.slice(0, marker) + '\n//# dsh-build-identity=' + JSON.stringify({ manifest,
    sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') }) + '\n')
  expect(readRuntimeIdentity(pathToFileURL(artifact).href)).toMatchObject({
    version: format === 2 ? '8.1.0' : null, versionSource: format === 2 ? 'embedded-build-observation' : 'unavailable',
    build: { version: format === 2 ? '8.1.0' : null, inputsSource: null },
  })
})

it.each([undefined, 42, ''])('rejects unavailable captured package version %s', (version) => {
  const { root, source } = fixture()
  writeFileSync(join(root, 'apps/cli/package.json'), JSON.stringify({ version }))
  expect(() => embedRuntimeBuildIdentity('export {}\n', root, [source], source)).toThrow('package version is unavailable')
})

it('rejects unsupported input-identity claims in a self-consistent manifest', () => {
  const { root, source } = fixture()
  const artifact = join(root, 'unsupported.js')
  const code = embedRuntimeBuildIdentity('export {}\n', root, [source], source)
  const marker = code.indexOf('\n//# dsh-build-identity=')
  const envelope = JSON.parse(code.slice(marker + '\n//# dsh-build-identity='.length)) as { manifest: Record<string, unknown> }
  const manifest = { ...envelope.manifest, inputsSource: 'compiler-consumed' }
  writeFileSync(artifact, code.slice(0, marker) + '\n//# dsh-build-identity=' + JSON.stringify({ manifest,
    sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') }) + '\n')
  expect(() => readRuntimeIdentity(pathToFileURL(artifact).href)).toThrow('build identity')
})

it('preserves build inputs independently of a later neighboring checkout and validates relocated artifacts', () => {
  const { root, source, git } = fixture()
  const artifact = join(root, 'launcher.js')
  const code = embedRuntimeBuildIdentity('export const value = 1\n', root, [source], source)
  writeFileSync(artifact, code)
  const identity = readRuntimeIdentity(pathToFileURL(artifact).href)
  expect(identity.source).toBeNull()
  expect(identity.build).toMatchObject({ source: { revision: git(['rev-parse', 'HEAD']), dirty: false }, inputCount: 2 })
  expect(identity.build?.inputsSha256).toMatch(/^[a-f0-9]{64}$/)
  writeFileSync(source, 'export const value = 2\n')
  git(['add', 'input.ts'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'later'])
  expect(readRuntimeIdentity(pathToFileURL(artifact).href)).toEqual(identity)
  const moved = join(root, 'relocated.js')
  writeFileSync(moved, code)
  expect(readRuntimeIdentity(pathToFileURL(moved).href)).toEqual(identity)
})

it('rejects modified output, stale manifests, and edited manifest fields', () => {
  const { root, source } = fixture()
  const artifact = join(root, 'launcher.js')
  const first = embedRuntimeBuildIdentity('export const value = 1\n', root, [source], source)
  const second = embedRuntimeBuildIdentity('export const value = 2\n', root, [source], source)
  for (const stale of [first.replace('value = 1', 'value = 3'),
    second.slice(0, second.indexOf('\n//# dsh-build-identity=')) + first.slice(first.indexOf('\n//# dsh-build-identity=')),
    first.replace('"format":2', '"format":3')]) {
    writeFileSync(artifact, stale)
    expect(() => readRuntimeIdentity(pathToFileURL(artifact).href)).toThrow('build identity')
  }
  expect(() => embedRuntimeBuildIdentity('export {}', root, [], source)).toThrow('explicit build inputs')
  expect(readFileSync(source, 'utf8')).toContain('value = 1')
})

it('records unavailable checkout identity alongside explicitly observed disk-input identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-build-archive-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const source = join(root, 'input.js')
  writeFileSync(source, 'export {}\n')
  mkdirSync(join(root, 'apps/cli'), { recursive: true })
  writeFileSync(join(root, 'apps/cli/package.json'), '{"version":"8.1.0"}\n')
  const artifact = join(root, 'launcher.js')
  writeFileSync(artifact, embedRuntimeBuildIdentity('export {}\n', root, [source], source))
  expect(readRuntimeIdentity(pathToFileURL(artifact).href)).toMatchObject({ source: null, build: { source: null, inputCount: 2 } })
})

it('rejects executable suffixes and stale identity trailers on output peers', () => {
  const { root, source } = fixture()
  const artifact = join(root, 'launcher.js')
  const peerPath = join(root, 'peer.js')
  const code = 'export const peer = 1\n'
  const outputs = [{ path: 'peer.js', sha256: createHash('sha256').update(code).digest('hex') }]
  const peer = embedRuntimeBuildIdentity(code, root, [source], source, outputs)
  writeFileSync(artifact, embedRuntimeBuildIdentity('export {}\n', root, [source], source, outputs))
  writeFileSync(peerPath, peer)
  expect(readRuntimeIdentity(pathToFileURL(artifact).href).build).not.toBeNull()
  const stale = embedRuntimeBuildIdentity(code, root, [source], source)
  for (const modified of [peer + 'globalThis.tampered = true\n', peer.replace('"format":2', '"format":3'), stale]) {
    writeFileSync(peerPath, modified)
    expect(() => readRuntimeIdentity(pathToFileURL(artifact).href)).toThrow('build identity')
  }
})

it('emits verifiable identity through the production CLI bundler plugin', async () => {
  const { build } = await import('tsdown')
  const { runtimeBuildIdentityPlugin } = await import('./runtime-build-identity.ts')
  const root = new URL('../', import.meta.url)
  const { root: buildRoot } = bundlerFixture()
  const output = mkdtempSync(join(tmpdir(), 'runtime-build-output-'))
  onTestFinished(() => { rmSync(output, { recursive: true, force: true }) })
  const entry = join(output, 'entry.ts')
  writeFileSync(entry, "export const bundled = () => import('./peer.ts')\n")
  writeFileSync(join(output, 'peer.ts'), 'export const peer = 1\n')
  const { fileURLToPath } = await import('node:url')
  await build({ config: false, cwd: buildRoot, entry: [entry], outDir: join(output, 'lib'),
    platform: 'node', format: 'esm', dts: false, report: false,
    plugins: [runtimeBuildIdentityPlugin(buildRoot)] })
  const artifact = join(output, 'lib/entry.mjs')
  const identity = readRuntimeIdentity(pathToFileURL(artifact).href)
  expect(identity.launcher.kind).toBe('artifact')
  expect(identity.launcher.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(identity.source).toBeNull()
  expect(identity.build?.inputCount).toBeGreaterThanOrEqual(6)
  expect(identity.build?.manifestSha256).toMatch(/^[a-f0-9]{64}$/)
  const identityModule = new URL('../apps/cli/src/runtime-identity.ts', import.meta.url).href
  const child = spawnSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '--eval',
    `import { readRuntimeIdentity } from ${JSON.stringify(identityModule)}; console.log(JSON.stringify(readRuntimeIdentity(${JSON.stringify(pathToFileURL(artifact).href)})))`,
  ], { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 25000, killSignal: 'SIGKILL' })
  expect(child.error).toBeUndefined()
  expect(child.signal).toBeNull()
  expect(child.status, child.stderr).toBe(0)
  const observed: unknown = JSON.parse(child.stdout.trim())
  expect(observed).toEqual(identity)
  const peer = readdirSync(join(output, 'lib')).find(name => name !== 'entry.mjs' && name.endsWith('.mjs'))
  if (peer === undefined) throw new Error('bundler did not emit the requested dynamic import')
  const peerPath = join(output, 'lib', peer)
  writeFileSync(peerPath, readFileSync(peerPath, 'utf8').replace('peer = 1', 'peer = 2'))
  expect(() => readRuntimeIdentity(pathToFileURL(artifact).href)).toThrow('build identity')
}, 30000)
