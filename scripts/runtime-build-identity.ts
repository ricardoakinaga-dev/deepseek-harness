/** Embed emitted-code digests and explicitly scoped build-file observations in CLI modules. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import type { TsdownPlugin } from 'tsdown'
import { readSourceIdentity } from '../apps/cli/src/runtime-identity.ts'

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

function observeBuildFiles(
  root: string, paths: readonly string[], sourceFile: string, outputs: readonly { path: string; sha256: string }[],
) {
  if (paths.length === 0) throw new Error('runtime build identity requires explicit build inputs')
  const packagePath = resolve(root, 'apps/cli/package.json')
  let version: string | undefined
  const inputs = [...new Set([...paths.map(path => resolve(root, path)), packagePath])].sort().map((path) => {
    const bytes = readFileSync(path)
    if (path === packagePath) {
      const manifest: unknown = JSON.parse(bytes.toString('utf8'))
      if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)
        || typeof manifest.version !== 'string' || manifest.version.length === 0) throw new Error('runtime build package version is unavailable')
      version = manifest.version
    }
    return { path: relative(root, path).replaceAll('\\', '/'), sha256: hash(bytes) }
  })
  return { format: 2, version, inputsSource: 'disk-observation' as const,
    source: readSourceIdentity(sourceFile), inputs, outputs, inputsSha256: hash(JSON.stringify(inputs)) }
}

function embedObservation(code: string, observation: ReturnType<typeof observeBuildFiles>): string {
  const manifest = { ...observation, outputSha256: hash(code) }
  return `${code}\n//# dsh-build-identity=${JSON.stringify({ manifest, sha256: hash(JSON.stringify(manifest)) })}\n`
}

/** Bind emitted code to later disk observations; consumed compiler-input bytes remain unavailable.
 * @param code Final module bytes before the identity trailer.
 * @param root Repository root containing the owning CLI package manifest.
 * @param paths Bundler input locations and declared build configuration observed on disk; the CLI manifest is always included.
 * @param sourceFile Tracked source anchor for the checkout observation.
 * @param outputs Emitted JavaScript peers and their pre-trailer code digests.
 * @returns Module with verified output bytes and version bound to the same observed package bytes as its digest.
 */
export function embedRuntimeBuildIdentity(
  code: string, root: string, paths: readonly string[], sourceFile: string,
  outputs: readonly { path: string; sha256: string }[] = [],
): string {
  return embedObservation(code, observeBuildFiles(root, paths, sourceFile, outputs))
}

/** Share one disk-input, version and source observation across all peers in a bundle generation.
 * @param root Repository root containing the CLI and dependency lockfile.
 * @returns Bundler plugin that appends the manifest after code generation.
 */
export function runtimeBuildIdentityPlugin(root: string): TsdownPlugin {
  return {
    name: 'dsh-runtime-build-identity',
    generateBundle(_options, bundle) {
      const inputs = [...this.getModuleIds()].filter(path => isAbsolute(path) && !path.includes('\0'))
      inputs.push(...['package.json', 'pnpm-lock.yaml', 'apps/cli/package.json', 'apps/cli/tsdown.config.ts',
        'scripts/runtime-build-identity.ts'].map(path => resolve(root, path)))
      const outputs = Object.values(bundle).flatMap(output => output.type === 'chunk'
        ? [{ path: output.fileName, sha256: hash(output.code) }] : []).sort((a, b) => a.path.localeCompare(b.path))
      const observation = observeBuildFiles(root, inputs, resolve(root, 'apps/cli/src/profile-boot.ts'), outputs)
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        output.code = embedObservation(output.code, observation)
      }
    },
  }
}
