/** Identify launcher bytes independently from a source checkout's Git state. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDshRuntimeVersion, type ProfileContext } from '@deepseek-ai/dsh-app-boot'

/** Capture launch-time identity without treating source Git state as a build identifier.
 * @param moduleUrl URL of the executing launcher module.
 * @returns Runtime version, module hash and source-only Git state; unavailable facts are null.
 */
export function readRuntimeIdentity(moduleUrl: string): NonNullable<ProfileContext['runtimeIdentity']> {
  const filename = fileURLToPath(moduleUrl)
  const kind = extname(filename) === '.ts' ? 'source' : 'artifact'
  let sha256: string | null = null
  try { sha256 = createHash('sha256').update(readFileSync(filename)).digest('hex') } catch (_error) {
    // Packaged virtual filesystems may not expose the executing module's bytes.
  }
  let source: { revision: string; dirty: boolean } | null = null
  if (kind === 'source') {
    const git = (args: string[]): string => execFileSync('git', ['-C', dirname(filename), ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 1000,
    }).trim()
    try {
      git(['ls-files', '--error-unmatch', '--', filename])
      const revision = git(['rev-parse', '--verify', 'HEAD'])
      const dirty = git(['status', '--porcelain', '--untracked-files=normal']) !== ''
      source = { revision, dirty }
    } catch (_error) {
      // Source distributions and hosts without Git have no checkout identity.
    }
  }
  return { version: getDshRuntimeVersion(), nodeVersion: process.version,
    platform: process.platform, arch: process.arch, launcher: { kind, sha256 }, source }
}
