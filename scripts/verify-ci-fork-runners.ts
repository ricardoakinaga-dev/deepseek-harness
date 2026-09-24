/** Verify that pull-request workflows cannot select persistent runners for fork code. */

import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'

/** A persistent runner label that must never be selected for fork pull requests. */
const persistentRunnerPattern = /(?:^|[\s,'"`])(?:self-hosted|vm-backup|dsh-win-ci)(?:$|[\s,'"`])/i

/** One unsafe persistent-runner selection found in a pull-request workflow. */
export interface ForkRunnerViolation {
  /** Repository-relative workflow path. */
  file: string
  /** Workflow job id containing the unsafe selection. */
  job: string
  /** Why the selection is unsafe. */
  reason: string
}

/**
 * Find persistent runner selections that lack an explicit fork exclusion.
 * @param file - Repository-relative workflow path used in diagnostics.
 * @param workflow - Parsed workflow YAML value.
 * @returns Unsafe runner selections in pull-request workflows.
 */
export function findForkRunnerViolations(file: string, workflow: unknown): ForkRunnerViolation[] {
  if (!isRecord(workflow) || !hasPullRequestTrigger(workflow)) return []
  if (!isRecord(workflow.jobs)) return []

  const violations: ForkRunnerViolation[] = []
  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    if (!isRecord(job)) continue
    const runner = workflowValueText(job['runs-on'])
    if (!persistentRunnerPattern.test(runner)) continue

    const jobCondition = workflowValueText(job.if)
    if (forkExclusionPattern.test(`${runner}\n${jobCondition}`)) continue

    violations.push({
      file,
      job: jobId,
      reason: 'persistent runner selection lacks github.event.pull_request.head.repo.fork == false',
    })
  }
  return violations
}

/**
 * Scan every repository workflow for unsafe persistent runner selections.
 * @param repositoryRoot - Absolute repository directory to inspect.
 * @returns Unsafe runner selections from all pull-request workflows.
 */
export function scanForkRunnerViolations(repositoryRoot: string): ForkRunnerViolation[] {
  const violations: ForkRunnerViolation[] = []
  for (const file of workflowPaths(repositoryRoot)) {
    const workflow = yaml.load(readFileSync(resolve(repositoryRoot, file), 'utf8'))
    violations.push(...findForkRunnerViolations(file, workflow))
  }
  return violations
}

function workflowPaths(repositoryRoot: string): string[] {
  return globSync('.github/workflows/*.{yml,yaml}', { cwd: repositoryRoot }).sort()
}

function hasPullRequestTrigger(workflow: unknown): boolean {
  if (!isRecord(workflow)) return false
  const trigger = workflow.on
  if (Array.isArray(trigger)) return trigger.includes('pull_request')
  if (typeof trigger === 'string') return trigger === 'pull_request'
  return isRecord(trigger) && Object.hasOwn(trigger, 'pull_request')
}

function workflowValueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(workflowValueText).join(' ')
  if (isRecord(value)) return Object.values(value).map(workflowValueText).join(' ')
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const forkExclusionPattern = /github\.event\.pull_request\.head\.repo\.fork\s*==\s*false/

if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dirname, '..')
  const violations = scanForkRunnerViolations(repositoryRoot)
  if (violations.length > 0) {
    console.error('verify-ci-fork-runners: unsafe persistent runner selections found:')
    for (const violation of violations) {
      console.error(`  ${violation.file} / ${violation.job}: ${violation.reason}`)
    }
    process.exitCode = 1
  } else {
    console.log('verify-ci-fork-runners: pull-request workflows exclude fork code from persistent runners.')
  }
}
