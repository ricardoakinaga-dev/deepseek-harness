/** Verify the built files required by the standalone hygiene aggregate. */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface PackageManifest {
  main?: unknown
  types?: unknown
  exports?: unknown
}

/**
 * Find manifest-declared build outputs that are absent from a checkout.
 * @param repositoryRoot - Absolute repository directory to inspect.
 * @returns Human-readable missing-output diagnostics.
 */
export function findMissingHygieneArtifacts(repositoryRoot: string): string[] {
  const missing: string[] = []
  for (const manifestPath of workspaceManifestPaths(repositoryRoot)) {
    const manifestFile = resolve(repositoryRoot, manifestPath)
    const packageDirectory = dirname(manifestFile)
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as PackageManifest
    const targets = requiredTargets(manifest)
    for (const target of targets) {
      if (target.includes('*')) {
        if (globSync(target, { cwd: packageDirectory }).length === 0) {
          missing.push(`${manifestPath}: missing ${target}`)
        }
      } else if (!existsSync(resolve(packageDirectory, target))) {
        missing.push(`${manifestPath}: missing ${target}`)
      }
    }
  }
  return missing
}

function workspaceManifestPaths(repositoryRoot: string): string[] {
  return [
    ...globSync('vendor/*/package.json', { cwd: repositoryRoot }),
    ...globSync('packages/*/*/package.json', { cwd: repositoryRoot }),
  ].sort()
}

function requiredTargets(manifest: PackageManifest): string[] {
  const targets: string[] = []
  addManifestTarget(manifest.main, targets, true)
  addManifestTarget(manifest.types, targets, false)
  collectExportTargets(manifest.exports, targets)
  return [...new Set(targets)]
}

function collectExportTargets(value: unknown, targets: string[]): void {
  if (typeof value === 'string') {
    addManifestTarget(value, targets, true)
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const nested of Object.values(value)) collectExportTargets(nested, targets)
}

function addManifestTarget(value: unknown, targets: string[], builtJavaScriptOnly: boolean): void {
  if (typeof value !== 'string') return
  const relativeTarget = value.startsWith('./') ? value.slice(2) : value
  if (!relativeTarget.startsWith('lib/')) return
  if (builtJavaScriptOnly && !isBuiltJavaScriptTarget(relativeTarget)) return
  targets.push(relativeTarget)
}

function isBuiltJavaScriptTarget(target: string): boolean {
  return /\.(?:cjs|js|mjs)(?:$|\*)/.test(target)
}

if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dirname, '..')
  const missing = findMissingHygieneArtifacts(repositoryRoot)
  if (missing.length > 0) {
    console.error('verify-hygiene-prerequisites: built package outputs are missing; run `pnpm run build` first.')
    for (const diagnostic of missing) console.error(diagnostic)
    process.exit(1)
  }

  console.log(
    `verify-hygiene-prerequisites: ${workspaceManifestPaths(repositoryRoot).length} workspace package manifests have their required built outputs.`,
  )
}
