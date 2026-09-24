/** Reject external GitHub Actions that are not pinned to reviewed commits. */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const shaPattern = /^[\da-f]{40}$/u
const actionUsePattern = /^(\s*(?:-\s*)?uses:\s*)([^\s@]+)@([^\s#]+)(?:\s+#\s*(.*))?$/u

/** One external action reference that is not pinned with a version comment. */
export interface WorkflowPinViolation {
  /** Repository-relative workflow path. */
  file: string
  /** One-based source line containing the action reference. */
  line: number
  /** External action name. */
  action: string
  /** Reason the reference is not accepted. */
  reason: string
}

/** Find mutable or undocumented external action references in one workflow. */
export function findWorkflowPinViolations(file: string, source: string): WorkflowPinViolation[] {
  const violations: WorkflowPinViolation[] = []
  for (const [index, line] of source.split('\n').entries()) {
    const match = actionUsePattern.exec(line)
    const action = match?.[2]
    const reference = match?.[3]
    if (match === null || action === undefined || reference === undefined || action.startsWith('./')) continue
    if (!shaPattern.test(reference)) {
      violations.push({ file, line: index + 1, action, reason: 'reference must be a 40-character commit SHA' })
    } else if (match[4] === undefined || !/^v\d+(?:\.\d+(?:\.\d+)?)?$|^release\/v\d+$/u.test(match[4].trim())) {
      violations.push({ file, line: index + 1, action, reason: 'pinned reference must document its release tag' })
    }
  }
  return violations
}

/** Scan all workflow files for unpinned external actions. */
export function scanWorkflowPinViolations(repoRoot: string): WorkflowPinViolation[] {
  const workflowRoot = resolve(repoRoot, '.github/workflows')
  return readdirSync(workflowRoot).filter(file => /\.ya?ml$/u.test(file)).sort().flatMap((file) => {
    const relative = `.github/workflows/${file}`
    return findWorkflowPinViolations(relative, readFileSync(resolve(repoRoot, relative), 'utf8'))
  })
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const violations = scanWorkflowPinViolations(root)
  if (violations.length === 0) {
    console.log('verify-workflow-pins: every external workflow action is pinned with a release comment.')
  } else {
    console.error('verify-workflow-pins: external workflow actions must use reviewed commit SHAs:')
    for (const violation of violations) {
      console.error(`  ${violation.file}:${String(violation.line)} ${violation.action} ${violation.reason}`)
    }
    process.exitCode = 1
  }
}
