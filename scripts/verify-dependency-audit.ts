/** Run the offline dependency advisory scan and enforce its severity policy. */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const exceptionFile = '.agents/dependency-audit-exceptions.json'
const severityRank = new Map([
  ['info', 0],
  ['low', 1],
  ['moderate', 2],
  ['high', 3],
  ['critical', 4],
])

interface Advisory {
  id?: unknown
  module_name?: unknown
  severity?: unknown
  title?: unknown
  url?: unknown
  findings?: unknown
}

interface AuditReport {
  advisories?: unknown
  metadata?: unknown
}

interface AuditException {
  id?: unknown
  owner?: unknown
  expires?: unknown
  reason?: unknown
}

interface AuditExceptionFile {
  version?: unknown
  exceptions?: unknown
}

/** A dependency advisory or unavailable scanner result that blocks the gate. */
export interface DependencyAuditViolation {
  /** Advisory identifier or scanner status. */
  id: string
  /** Affected package or scanner subject. */
  package: string
  /** Severity or scanner status. */
  severity: string
  /** Concrete rejection reason. */
  reason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asAdvisories(value: unknown): Advisory[] {
  if (!isRecord(value)) return []
  return Object.values(value).filter(isRecord).map(value => value as Advisory)
}

function asExceptions(value: unknown): AuditException[] {
  return Array.isArray(value) ? value.filter(isRecord).map(value => value as AuditException) : []
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

function isExpired(exception: AuditException, now: Date): boolean {
  return typeof exception.expires !== 'string' || Number.isNaN(Date.parse(exception.expires))
    || Date.parse(exception.expires) < now.getTime()
}

function isComplete(exception: AuditException): boolean {
  return typeof exception.owner === 'string' && exception.owner.trim() !== ''
    && typeof exception.reason === 'string' && exception.reason.trim() !== ''
}

function validExceptionFor(advisory: Advisory, exceptions: AuditException[], now: Date): AuditException | undefined {
  const id = asText(advisory.id, '')
  return exceptions.find(exception => asText(exception.id, '') === id && isComplete(exception) && !isExpired(exception, now))
}

/** Convert an advisory report into policy violations. High and critical findings fail. */
export function findDependencyAuditViolations(
  report: AuditReport,
  exceptions: AuditExceptionFile,
  now = new Date(),
): DependencyAuditViolation[] {
  const exceptionRows = asExceptions(exceptions.exceptions)
  const violations: DependencyAuditViolation[] = []
  for (const advisory of asAdvisories(report.advisories)) {
    const id = asText(advisory.id, 'unknown')
    const severity = asText(advisory.severity, 'unknown').toLowerCase()
    const rank = severityRank.get(severity) ?? Number.POSITIVE_INFINITY
    const matching = exceptionRows.find(exception => asText(exception.id, '') === id)
    if (matching !== undefined && (isExpired(matching, now) || !isComplete(matching))) {
      violations.push({ id, package: asText(advisory.module_name, 'unknown'), severity, reason: 'exception must have a current expiry, owner, and reason' })
    } else if (rank >= (severityRank.get('high') ?? 3) && validExceptionFor(advisory, exceptionRows, now) === undefined) {
      violations.push({ id, package: asText(advisory.module_name, 'unknown'), severity, reason: asText(advisory.title, 'high-severity advisory has no active exception') })
    }
  }
  return violations
}

function parseAuditOutput(stdout: string): AuditReport | undefined {
  const start = stdout.indexOf('{')
  if (start < 0) return undefined
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start))
    return isRecord(parsed) && isRecord(parsed.advisories) && isRecord(parsed.metadata)
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

function readExceptions(repoRoot: string): AuditExceptionFile {
  const parsed: unknown = JSON.parse(readFileSync(resolve(repoRoot, exceptionFile), 'utf8'))
  return isRecord(parsed) ? parsed : {}
}

function runAudit(repoRoot: string): { report?: AuditReport; unavailable?: string } {
  try {
    const stdout = execFileSync('pnpm', ['audit', '--offline', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const report = parseAuditOutput(stdout)
    return report === undefined ? { unavailable: 'pnpm audit returned no parseable advisory database result' } : { report }
  } catch (error) {
    const stdout = isRecord(error) && typeof error.stdout === 'string' ? error.stdout : ''
    const report = parseAuditOutput(stdout)
    return report === undefined ? { unavailable: 'pnpm audit advisory database is unavailable or returned invalid JSON' } : { report }
  }
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const result = runAudit(root)
  if (result.report === undefined) {
    console.error(`verify-dependency-audit: ${result.unavailable ?? 'advisory scan unavailable'}`)
    process.exitCode = 1
  } else {
    const violations = findDependencyAuditViolations(result.report, readExceptions(root))
    const metadata = isRecord(result.report.metadata) && isRecord(result.report.metadata.vulnerabilities)
      ? result.report.metadata.vulnerabilities
      : {}
    console.log(`verify-dependency-audit: ${JSON.stringify(metadata)}`)
    if (violations.length > 0) {
      console.error('verify-dependency-audit: high and critical advisories require remediation or an active exception:')
      for (const violation of violations) console.error(`  ${violation.id} ${violation.package} [${violation.severity}] ${violation.reason}`)
      process.exitCode = 1
    }
  }
}
