/** Enforce canonical documentation ceilings and a non-growing word baseline. */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'scripts/doc-budgets.manifest.json')
const baselinePath = resolve(root, 'scripts/doc-budgets.baseline.json')

/** One document's measured words and configured ceiling. */
export interface DocBudgetRow {
  /** Repository-relative document path. */
  path: string
  /** Current whitespace-delimited word count. */
  words: number
  /** Configured maximum word count. */
  ceiling: number
  /** Recorded baseline word count. */
  baseline: number | undefined
}

/** A baseline file for non-growing documentation budgets. */
export interface DocBudgetBaseline {
  /** Baseline schema revision. */
  version: number
  /** Word count recorded for each budgeted document. */
  files: Record<string, number>
}

/** Count words with the same whitespace rule used by `wc -w` for this gate. */
export function countDocWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** Return the baseline file map when the decoded JSON has the expected object form. */
function baselineFilesOf(baseline: DocBudgetBaseline): Record<string, number> {
  const value: unknown = baseline.files
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, number>
    : {}
}

/** Find ceiling, file, baseline, and growth violations for a budget manifest. */
export function findDocBudgetViolations(
  repoRoot: string,
  manifest: Record<string, number>,
  baseline: DocBudgetBaseline,
): string[] {
  const failures: string[] = []
  const baselineValue: unknown = baseline.files
  const validFiles = typeof baselineValue === 'object' && baselineValue !== null && !Array.isArray(baselineValue)
  if (baseline.version !== 1 || !validFiles) {
    failures.push('baseline: version must be 1 and files must be a mapping')
  }
  const baselineFiles = validFiles ? baselineValue as Record<string, number> : {}
  for (const [path, ceiling] of Object.entries(manifest)) {
    if (!Number.isInteger(ceiling) || ceiling <= 0) {
      failures.push(`${path}: ceiling must be a positive integer, got ${String(ceiling)}`)
      continue
    }
    const absolute = resolve(repoRoot, path)
    if (!existsSync(absolute)) {
      failures.push(`${path}: budgeted file does not exist`)
      continue
    }
    const words = countDocWords(readFileSync(absolute, 'utf8'))
    if (words > ceiling) failures.push(`${path}: ${String(words)} words exceeds the ${String(ceiling)}-word ceiling`)
    const recorded = baselineFiles[path]
    if (recorded === undefined || !Number.isInteger(recorded) || recorded < 0) {
      failures.push(`${path}: baseline must record a non-negative integer word count`)
    } else if (words > recorded) {
      failures.push(`${path}: ${String(words)} words exceeds the recorded baseline of ${String(recorded)}`)
    }
    if (recorded !== undefined && recorded > ceiling) {
      failures.push(`${path}: baseline ${String(recorded)} exceeds the configured ceiling of ${String(ceiling)}`)
    }
  }
  for (const path of Object.keys(baselineFiles)) {
    if (!(path in manifest)) failures.push(`${path}: baseline entry is not present in the canonical manifest`)
  }
  return failures
}

/** Render the measured rows for `--list`. */
export function renderDocBudgetRows(
  repoRoot: string,
  manifest: Record<string, number>,
  baseline: DocBudgetBaseline,
): string[] {
  const baselineFiles = baselineFilesOf(baseline)
  return Object.entries(manifest).map(([path, ceiling]) => {
    const absolute = resolve(repoRoot, path)
    if (!existsSync(absolute)) return `MISS  ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`
    const words = countDocWords(readFileSync(absolute, 'utf8'))
    const status = words <= ceiling && baselineFiles[path] !== undefined && words <= baselineFiles[path] ? 'ok  ' : 'OVER'
    return `${status}  ${String(words).padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`
  })
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

const manifest = readJson(manifestPath) as Record<string, number>
const baseline = readJson(baselinePath) as DocBudgetBaseline

if (import.meta.main) {
  if (process.argv.includes('--list')) {
    console.log(renderDocBudgetRows(root, manifest, baseline).join('\n'))
    process.exit(0)
  }
  const failures = findDocBudgetViolations(root, manifest, baseline)
  if (failures.length > 0) {
    console.error('verify-doc-budgets failed:\n')
    for (const failure of failures) console.error(`  ${failure}`)
    console.error('\nSee docs/AGENTS.md for the documentation standard and the non-growing baseline.')
    process.exit(1)
  }
  console.log(`verify-doc-budgets: ${Object.keys(manifest).length} budgeted docs within ceiling and baseline.`)
}
