/** Enforce the repository's package release-age and exception policy. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const MINIMUM_RELEASE_AGE_MINUTES = 1440

/** One package-manager supply-chain policy violation. */
export interface PnpmSupplyChainViolation {
  /** Repository-relative file containing the policy. */
  file: string
  /** Policy field or exception index. */
  field: string
  /** Concrete reason for rejection. */
  reason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate release-age protection and its narrowly scoped exceptions. */
export function findPnpmSupplyChainViolations(file: string, document: unknown): PnpmSupplyChainViolation[] {
  const violations: PnpmSupplyChainViolation[] = []
  if (!isRecord(document)) {
    return [{ file, field: 'document', reason: 'workspace configuration must be a mapping' }]
  }
  const age = document.minimumReleaseAge
  if (typeof age !== 'number' || !Number.isSafeInteger(age) || age < MINIMUM_RELEASE_AGE_MINUTES) {
    violations.push({
      file,
      field: 'minimumReleaseAge',
      reason: `must be an integer of at least ${String(MINIMUM_RELEASE_AGE_MINUTES)} minutes`,
    })
  }
  const exceptions = document.minimumReleaseAgeExclude
  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    violations.push({ file, field: 'minimumReleaseAgeExclude', reason: 'must list reviewed exact exceptions' })
  } else {
    for (const [index, exception] of exceptions.entries()) {
      if (typeof exception !== 'string' || !/^@?[^\s@]+@[^\s]+$/u.test(exception)) {
        violations.push({
          file,
          field: `minimumReleaseAgeExclude[${String(index)}]`,
          reason: 'must identify a package and exact version expression',
        })
      }
    }
  }
  return violations
}

/** Validate `pnpm-workspace.yaml` without invoking a package install. */
export function scanPnpmSupplyChainViolations(repoRoot: string): PnpmSupplyChainViolation[] {
  const file = 'pnpm-workspace.yaml'
  const document = yaml.load(readFileSync(resolve(repoRoot, file), 'utf8'))
  return findPnpmSupplyChainViolations(file, document)
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const violations = scanPnpmSupplyChainViolations(root)
  if (violations.length === 0) {
    console.log('verify-pnpm-supply-chain: release-age policy and exact exceptions are configured.')
  } else {
    console.error('verify-pnpm-supply-chain: invalid pnpm release-age policy:')
    for (const violation of violations) console.error(`  ${violation.file}:${violation.field} ${violation.reason}`)
    process.exitCode = 1
  }
}
