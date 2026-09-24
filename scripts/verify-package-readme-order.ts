import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const README_PATTERNS = ['packages/**/README.md', 'packages/**/README.zh.md'] as const
const DEV_NOTE_ANCHOR = '<a id="dev-note"></a>'

/** A package README whose runtime invariant is placed after its development note. */
export interface PackageReadmeOrderViolation {
  /** Repository-relative README path. */
  file: string
  /** Stable order rule that failed. */
  rule: 'duplicate-runtime-invariant' | 'missing-dev-note' | 'runtime-invariant-after-dev-note'
}

/** Inspect one package README for the invariant/development-note ordering rules. */
export function findReadmeOrderViolations(file: string, source: string): PackageReadmeOrderViolation[] {
  const invariants = [...source.matchAll(runtimeInvariantPattern(file))]
  if (invariants.length === 0) return []
  if (invariants.length > 1) return [{ file, rule: 'duplicate-runtime-invariant' }]
  const devNote = source.indexOf(DEV_NOTE_ANCHOR)
  if (devNote < 0) return [{ file, rule: 'missing-dev-note' }]
  return (invariants[0]?.index ?? -1) > devNote
    ? [{ file, rule: 'runtime-invariant-after-dev-note' }]
    : []
}

function readmePaths(repoRoot: string): string[] {
  return [...new Set(README_PATTERNS.flatMap(pattern => globSync(pattern, { cwd: repoRoot })))]
    .map(path => path.replaceAll('\\', '/'))
    .sort()
}

function runtimeInvariantPattern(file: string): RegExp {
  return file.endsWith('.zh.md')
    ? /^\*\*运行时不变式：\*\*.*$/gmu
    : /^\*\*Runtime invariant:\*\*.*$/gmu
}

/** Find package README order violations in a repository. */
export function findPackageReadmeOrderViolations(repoRoot: string = root): PackageReadmeOrderViolation[] {
  const violations: PackageReadmeOrderViolation[] = []
  for (const file of readmePaths(repoRoot)) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    violations.push(...findReadmeOrderViolations(file, source))
  }
  return violations
}

/** Move one invariant before the development-note anchor without changing its text. */
export function normalizePackageReadme(source: string, chinese: boolean): string {
  const pattern = chinese ? /^\*\*运行时不变式：\*\*.*$/mu : /^\*\*Runtime invariant:\*\*.*$/mu
  const match = pattern.exec(source)
  if (match === null) return source
  const lines = source.split('\n')
  const invariantIndex = lines.findIndex(line => line === match[0])
  const devNoteIndex = lines.indexOf(DEV_NOTE_ANCHOR)
  if (invariantIndex < 0 || devNoteIndex < 0 || invariantIndex < devNoteIndex) return source
  lines.splice(invariantIndex, 1)
  const targetIndex = lines.indexOf(DEV_NOTE_ANCHOR)
  if (targetIndex < 0) return source
  lines.splice(targetIndex, 0, match[0], '')
  return lines.join('\n')
}

function main(): void {
  const write = process.argv.includes('--write')
  if (write) {
    for (const file of readmePaths(root)) {
      const path = resolve(root, file)
      const source = readFileSync(path, 'utf8')
      const normalized = normalizePackageReadme(source, file.endsWith('.zh.md'))
      if (normalized !== source) writeFileSync(path, normalized)
    }
  }
  const violations = findPackageReadmeOrderViolations(root)
  if (violations.length > 0) {
    console.error('verify-package-readme-order: violations found:')
    for (const violation of violations) console.error(`  ${violation.file}: ${violation.rule}`)
    process.exitCode = 1
    return
  }
  console.log(`verify-package-readme-order: ${readmePaths(root).length} package README(s) conform.`)
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === resolve(import.meta.filename)) main()
