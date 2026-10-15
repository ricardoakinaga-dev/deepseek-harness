/** Observe launcher files and embedded build inputs independently of cached executing generations. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RuntimeIdentity, RuntimeSourceIdentity } from '@deepseek-ai/dsh-app-boot'

const BUILD_MARKER = '\n//# dsh-build-identity='
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

/** Read tracked checkout identity without consulting the invocation's working directory.
 * @param filename Tracked launcher or build-input file used to locate its checkout.
 * @returns Revision, dirty state and a path/kind/mode/content digest; null when Git, readable content or UTF-8 paths are unavailable.
 */
export function readSourceIdentity(filename: string): RuntimeSourceIdentity | null {
  const git = (args: string[]): Buffer => execFileSync('git', ['-C', dirname(filename), ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, maxBuffer: 16 * 1024 * 1024,
  })
  try {
    git(['ls-files', '--error-unmatch', '--', filename])
    const rootBytes = git(['rev-parse', '--show-toplevel'])
    const rootText = rootBytes.toString('utf8')
    if (!Buffer.from(rootText).equals(rootBytes)) return null
    const lineEnd = process.platform === 'win32' ? /\r?\n$/u : /\n$/u
    const root = rootText.replace(lineEnd, '')
    const revision = git(['rev-parse', '--verify', 'HEAD']).toString('utf8').trim()
    const dirty = git(['status', '--porcelain', '--untracked-files=normal']).length > 0
    const pathBytes = git(['ls-files', '-c', '-o', '--exclude-standard', '--full-name', '-z', '--', ':/'])
    const pathText = pathBytes.toString('utf8')
    if (!Buffer.from(pathText).equals(pathBytes)) return null
    const paths = [...new Set(pathText.split('\0').filter(Boolean))].sort()
    const digest = createHash('sha256')
    for (const path of paths) {
      const absolute = join(root, path)
      let bytes: Buffer | string
      let mode = 0
      let kind: 'file' | 'symlink' | 'deleted' = 'deleted'
      try {
        const stat = lstatSync(absolute)
        const symbolic = stat.isSymbolicLink()
        if (!symbolic && !stat.isFile()) return null // Git submodule content has an independent owner.
        kind = symbolic ? 'symlink' : 'file'
        mode = stat.mode & 0o7777
        bytes = symbolic ? readlinkSync(absolute, { encoding: 'buffer' }) : readFileSync(absolute)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        kind = 'deleted'
        mode = 0
        bytes = 'deleted'
      }
      digest.update(JSON.stringify([path, kind, mode, hash(bytes)])).update('\n')
    }
    return { revision, dirty, contentSha256: digest.digest('hex') }
  } catch (_error) {
    // Archives, missing Git and unreadable checkout files have no complete source identity.
    return null
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function sourceIdentity(value: unknown): value is RuntimeSourceIdentity | null {
  return value === null || (record(value) && typeof value.revision === 'string'
    && /^[a-f0-9]{40,64}$/.test(value.revision) && typeof value.dirty === 'boolean' && digest(value.contentSha256))
}

function readBuildIdentity(bytes: string, filename: string): RuntimeIdentity['build'] {
  const index = bytes.lastIndexOf(BUILD_MARKER)
  if (index < 0) return null
  const reject = (): never => { throw new Error('dsh: invalid or mismatched embedded build identity; rebuild the launcher') }
  let envelope: unknown
  try { envelope = JSON.parse(bytes.slice(index + BUILD_MARKER.length).trim()) } catch (_error) { return reject() }
  if (!record(envelope) || !record(envelope.manifest) || !digest(envelope.sha256)) return reject()
  const manifest = envelope.manifest
  if (hash(JSON.stringify(manifest)) !== envelope.sha256 || (manifest.format !== 1 && manifest.format !== 2)
    || (manifest.format === 2 && (typeof manifest.version !== 'string' || manifest.version.length === 0))
    || (manifest.inputsSource !== undefined && manifest.inputsSource !== 'disk-observation')
    || !digest(manifest.outputSha256) || manifest.outputSha256 !== hash(bytes.slice(0, index))
    || !digest(manifest.inputsSha256) || !Array.isArray(manifest.inputs) || !Array.isArray(manifest.outputs)
    || !sourceIdentity(manifest.source)) return reject()
  const inputs: { path: string; sha256: string }[] = []
  for (const input of manifest.inputs) {
    if (!record(input) || typeof input.path !== 'string' || !digest(input.sha256)) return reject()
    inputs.push({ path: input.path, sha256: input.sha256 })
  }
  if (inputs.length === 0 || hash(JSON.stringify(inputs)) !== manifest.inputsSha256) return reject()
  for (const output of manifest.outputs) {
    if (!record(output) || typeof output.path !== 'string' || !digest(output.sha256)
      || isAbsolute(output.path) || output.path.split(/[\\/]/).includes('..')) return reject()
    let peer: string
    try { peer = readFileSync(join(dirname(filename), output.path), 'utf8') } catch (_error) { return reject() }
    const marker = peer.lastIndexOf(BUILD_MARKER)
    if (marker < 0 || hash(peer.slice(0, marker)) !== output.sha256) return reject()
    let peerEnvelope: unknown
    try { peerEnvelope = JSON.parse(peer.slice(marker + BUILD_MARKER.length).trim()) } catch (_error) { return reject() }
    if (!record(peerEnvelope) || !record(peerEnvelope.manifest) || !digest(peerEnvelope.sha256)
      || hash(JSON.stringify(peerEnvelope.manifest)) !== peerEnvelope.sha256
      || JSON.stringify(peerEnvelope.manifest) !== JSON.stringify({ ...manifest, outputSha256: output.sha256 })) return reject()
  }
  return { version: manifest.format === 2 ? manifest.version as string : null,
    inputsSource: manifest.inputsSource === 'disk-observation' ? 'disk-observation' : null,
    manifestSha256: envelope.sha256, inputsSha256: manifest.inputsSha256,
    inputCount: inputs.length, source: manifest.source === null ? null : {
      revision: manifest.source.revision, dirty: manifest.source.dirty, contentSha256: manifest.source.contentSha256,
    } }
}

/** Observe launcher files; the cached executing generation is unavailable and may differ from these bytes.
 * @param moduleUrl Launcher module URL whose current file is observed.
 * @returns Host facts and explicitly scoped disk observations; artifacts use only embedded build versions.
 * @throws When a source launcher package cannot supply a version, or embedded build data is malformed or mismatched.
 */
export function readRuntimeIdentity(moduleUrl: string): RuntimeIdentity {
  const filename = fileURLToPath(moduleUrl)
  const kind = extname(filename) === '.ts' ? 'source' : 'artifact'
  let bytes: Buffer | undefined
  try { bytes = readFileSync(filename) } catch (_error) {
    // Packaged virtual filesystems may not expose the executing module's bytes.
  }
  const build = kind === 'artifact' && bytes !== undefined ? readBuildIdentity(bytes.toString('utf8'), filename) : null
  let version: string | null = build?.version ?? null
  let versionSource: RuntimeIdentity['versionSource'] = version === null ? 'unavailable' : 'embedded-build-observation'
  if (kind === 'source') {
    const manifest: unknown = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
    if (!record(manifest) || typeof manifest.version !== 'string') throw new Error('dsh: launcher package version is unavailable')
    version = manifest.version
    versionSource = 'package-manifest-observation'
  }
  return { version, versionSource, nodeVersion: process.version,
    platform: process.platform, arch: process.arch,
    launcher: { kind, sha256: bytes === undefined ? null : hash(bytes), sha256Source: 'disk-observation' },
    source: kind === 'source' ? readSourceIdentity(filename) : null,
    build }
}
