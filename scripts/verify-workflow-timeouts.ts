/** Reject executable GitHub Actions jobs without a bounded runtime. */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const MAX_TIMEOUT_MINUTES = 360

/** A workflow job that cannot complete within an explicit bounded budget. */
export interface WorkflowTimeoutViolation {
  /** Repository-relative workflow path. */
  file: string
  /** Job identifier from the workflow. */
  job: string
  /** Reason the timeout declaration is invalid. */
  reason: string
}

interface WorkflowJob {
  'runs-on'?: unknown
  uses?: unknown
  'timeout-minutes'?: unknown
}

interface WorkflowDocument {
  jobs?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorkflowJob(value: unknown): value is WorkflowJob {
  return isRecord(value)
}

/**
 * Find executable jobs whose timeout declaration is absent or invalid.
 * @param file - Repository-relative workflow path used in diagnostics.
 * @param workflow - Parsed workflow document.
 * @returns One violation for each executable job without a bounded timeout.
 */
export function findWorkflowTimeoutViolations(file: string, workflow: unknown): WorkflowTimeoutViolation[] {
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) return []
  const violations: WorkflowTimeoutViolation[] = []
  for (const [job, rawJob] of Object.entries(workflow.jobs)) {
    if (!isWorkflowJob(rawJob) || rawJob.uses !== undefined || rawJob['runs-on'] === undefined) continue
    const timeout = rawJob['timeout-minutes']
    const valid = typeof timeout === 'number' && Number.isSafeInteger(timeout)
      && timeout >= 1 && timeout <= MAX_TIMEOUT_MINUTES
    if (!valid) {
      violations.push({
        file,
        job,
        reason: timeout === undefined
          ? 'missing timeout-minutes'
          : `timeout-minutes must be an integer from 1 to ${String(MAX_TIMEOUT_MINUTES)}`,
      })
    }
  }
  return violations
}

/**
 * Scan all repository workflow files for unbounded executable jobs.
 * @param repoRoot - Repository root containing `.github/workflows`.
 * @returns All timeout violations in sorted workflow order.
 */
export function scanWorkflowTimeoutViolations(repoRoot: string): WorkflowTimeoutViolation[] {
  const workflowRoot = resolve(repoRoot, '.github/workflows')
  const files = readdirSync(workflowRoot).filter(file => /\.ya?ml$/u.test(file)).sort()
  return files.flatMap((file) => {
    const relative = `.github/workflows/${file}`
    const workflow = yaml.load(readFileSync(resolve(repoRoot, relative), 'utf8')) as WorkflowDocument
    return findWorkflowTimeoutViolations(relative, workflow)
  })
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const violations = scanWorkflowTimeoutViolations(root)
  if (violations.length === 0) {
    console.log('verify-workflow-timeouts: every executable workflow job has a bounded timeout.')
  } else {
    console.error('verify-workflow-timeouts: executable jobs must declare timeout-minutes:')
    for (const violation of violations) console.error(`  ${violation.file}:${violation.job} ${violation.reason}`)
    process.exitCode = 1
  }
}
