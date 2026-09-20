#!/usr/bin/env node

/** Validate the fork policy and attribute every delta from the mirror branch. */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_REPOSITORY = {
  forkRemote: 'origin',
  forkUrl: 'https://github.com/ricardoakinaga-dev/deepseek-harness.git',
  upstreamRemote: 'deepseek-official',
  upstreamUrl: 'https://github.com/deepseek-ai/deepseek-harness.git',
  mirrorBranch: 'master',
  integrationBranch: 'custom/main',
  updateStrategy: 'merge',
}
const KINDS = new Set(['extension', 'upstream-patch', 'governance'])
const STATUSES = new Set(['active', 'retiring'])

/**
 * Return whether a repository path is owned by one policy pattern.
 * A trailing slash names a directory and a trailing asterisk names a prefix.
 * @param {string} path - repository-relative path.
 * @param {string} pattern - exact path, directory, or prefix pattern.
 * @returns {boolean} whether the pattern owns the path.
 */
export function pathMatches(path, pattern) {
  if (pattern.endsWith('/')) return path.startsWith(pattern)
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1))
  return path === pattern
}

/**
 * Validate one parsed policy against the current custom delta.
 * @param {unknown} input - parsed policy JSON.
 * @param {string[]} changedPaths - paths changed from the mirror branch.
 * @returns {string[]} validation errors.
 */
export function validateCustomizationPolicy(input, changedPaths) {
  const errors = []
  if (!isRecord(input)) return ['policy root must be an object']
  if (input.version !== 1) errors.push('version must equal 1')
  if (!isRecord(input.repository)) {
    errors.push('repository must be an object')
  } else {
    for (const [key, expected] of Object.entries(EXPECTED_REPOSITORY)) {
      if (input.repository[key] !== expected) {
        errors.push(`repository.${key} must equal ${JSON.stringify(expected)}`)
      }
    }
  }
  if (!Array.isArray(input.improvements) || input.improvements.length === 0) {
    errors.push('improvements must be a non-empty array')
    return errors
  }

  const ids = new Set()
  const improvements = []
  for (const [index, candidate] of input.improvements.entries()) {
    const label = `improvements[${index}]`
    if (!isRecord(candidate)) {
      errors.push(`${label} must be an object`)
      continue
    }
    const id = candidate.id
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errors.push(`${label}.id must be a lowercase kebab-case identifier`)
    } else if (ids.has(id)) {
      errors.push(`${label}.id duplicates ${JSON.stringify(id)}`)
    } else {
      ids.add(id)
    }
    if (!KINDS.has(candidate.kind)) errors.push(`${label}.kind must be extension, upstream-patch, or governance`)
    if (!STATUSES.has(candidate.status)) errors.push(`${label}.status must be active or retiring`)
    if (typeof candidate.summary !== 'string' || candidate.summary.trim() === '') errors.push(`${label}.summary must be non-empty`)
    if (!isStringArray(candidate.paths) || candidate.paths.length === 0) {
      errors.push(`${label}.paths must be a non-empty string array`)
    } else if (new Set(candidate.paths).size !== candidate.paths.length) {
      errors.push(`${label}.paths must not contain duplicates`)
    }
    if (candidate.kind === 'extension') {
      if (candidate.optIn !== true) errors.push(`${label}.optIn must be true for an extension`)
      if (!isStringArray(candidate.packageRoots) || candidate.packageRoots.length === 0 || candidate.packageRoots.some(path => !path.startsWith('packages/') || !path.endsWith('/'))) {
        errors.push(`${label}.packageRoots must contain package directories ending in /`)
      }
    }
    if (candidate.kind === 'upstream-patch' && (typeof candidate.upstreamPlan !== 'string' || candidate.upstreamPlan.trim() === '')) {
      errors.push(`${label}.upstreamPlan must identify the upstream or extraction plan`)
    }
    improvements.push(candidate)
  }

  for (const path of changedPaths) {
    const owners = improvements.filter(improvement => Array.isArray(improvement.paths) && improvement.paths.some(pattern => typeof pattern === 'string' && pathMatches(path, pattern)))
    if (owners.length === 0) {
      errors.push(`${path}: custom delta has no improvement owner`)
      continue
    }
    if (owners.length > 1) errors.push(`${path}: custom delta has multiple owners (${owners.map(owner => owner.id).join(', ')})`)
    for (const owner of owners) {
      if (owner.kind === 'extension' && isPackageSource(path) && (!Array.isArray(owner.packageRoots) || !owner.packageRoots.some(root => typeof root === 'string' && path.startsWith(root)))) {
        errors.push(`${path}: extension ${owner.id} changes source outside its package roots`)
      }
      if (owner.kind === 'governance' && isPackageSource(path)) {
        errors.push(`${path}: governance improvement ${owner.id} must not own runtime package source`)
      }
    }
  }
  return errors
}

/** @param {unknown} value - candidate value. @returns {value is Record<string, unknown>} whether it is a plain object. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {unknown} value - candidate value. @returns {value is string[]} whether it contains only non-empty strings. */
function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0)
}

/** @param {string} path - repository-relative path. @returns {boolean} whether it is production package source. */
function isPackageSource(path) {
  return path.startsWith('packages/') && path.includes('/src/')
}

/** @param {string} cwd - repository root. @param {string[]} args - git arguments. @returns {string[]} non-empty output lines. */
function gitLines(cwd, args) {
  const output = execFileSync('git', args, { cwd, encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

/** Collect committed, staged, unstaged, and untracked paths in the custom delta. */
function changedPaths(cwd, baseRef) {
  execFileSync('git', ['merge-base', '--is-ancestor', baseRef, 'HEAD'], { cwd, stdio: 'ignore' })
  return [...new Set([
    ...gitLines(cwd, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${baseRef}...HEAD`]),
    ...gitLines(cwd, ['diff', '--name-only', '--diff-filter=ACDMRTUXB']),
    ...gitLines(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB']),
    ...gitLines(cwd, ['ls-files', '--others', '--exclude-standard']),
  ])].sort()
}

function main(args) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const baseIndex = args.indexOf('--base')
  const baseRef = baseIndex === -1 ? 'master' : args[baseIndex + 1]
  if (baseRef === undefined || baseRef.startsWith('--')) {
    console.error('verify-customization-policy: --base requires a Git ref')
    return 2
  }
  const policyPath = resolve(root, '.agents/customization-policy.json')
  if (!existsSync(policyPath)) {
    console.error('verify-customization-policy: .agents/customization-policy.json is missing')
    return 1
  }
  let policy
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  } catch (error) {
    console.error(`verify-customization-policy: invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  let paths
  try {
    paths = changedPaths(root, baseRef)
  } catch (error) {
    console.error(`verify-customization-policy: cannot compare with ${JSON.stringify(baseRef)}: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  const errors = validateCustomizationPolicy(policy, paths)
  if (errors.length > 0) {
    for (const error of errors) console.error(`verify-customization-policy: ${error}`)
    return 1
  }
  console.log(`verify-customization-policy: ${paths.length} custom path(s) attributed across ${policy.improvements.length} improvement(s).`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
