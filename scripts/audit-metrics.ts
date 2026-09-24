/** Emit the canonical source-debt metrics used by the Triple-A audit. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

const SOURCE_GLOBS = [
  'packages/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  'apps/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  'scripts/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  'python/**/*.{py}',
  'native/**/*.{ts,tsx,mts,cts,js,mjs,cjs,py,rs,c,cc,cpp,h,hpp}',
  'benchmarks/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
] as const

const SOURCE_ROOTS = ['packages/', 'apps/', 'scripts/', 'python/', 'native/', 'benchmarks/'] as const
const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cjs', '.cpp', '.cts', '.h', '.hpp', '.js', '.mjs', '.mts', '.py', '.rs', '.ts', '.tsx',
])
const EXCLUDED_PATH_SEGMENTS = [
  '.artifacts/',
  'build/',
  'dist/',
  'generated/',
  'lib/',
  'node_modules/',
  'snapshots/',
  'vendor/',
] as const
const EXCLUDED_FILE_PATHS = [
  'scripts/audit-metrics.spec.ts',
  'scripts/audit-metrics.ts',
] as const

/** Stable names for every source-debt metric. */
export const METRIC_NAMES = [
  'deprecated_reader',
  'lint_suppression',
  'todo_marker',
  'explicit_any',
  'selected_skip',
] as const

/** A source-debt metric identifier. */
export type MetricName = typeof METRIC_NAMES[number]

/** Counts for every canonical metric. */
export type MetricCounts = { [name in MetricName]: number }

/** The retained baseline from the canonical AAA-018 metrics run. */
export const CANONICAL_AUDIT_BASELINE = {
  id: 'AAA-018:A03',
  source: '.artifacts/aaa-018/aaa-018-a03-2026-09-21/metrics.json',
  artifact_sha256: 'bf2a3b01da11a4d7dd1693dc3037b6d928c8ab19c9f90ed3c80b0c0f56eeff2d',
  revision: 'aaa-savepoint-2026-09-20-m0-a02-01',
  captured_at: '2026-09-21T12:16:22.015Z',
  corpus: {
    files_digest: 'b5cff71909ba95fd9660ebbde74bf22be39ebca8e7d729ae368f2938f7caa3cb',
    file_count: 4436,
  },
  metrics: {
    deprecated_reader: 90,
    lint_suppression: 263,
    todo_marker: 53,
    explicit_any: 1625,
    selected_skip: 7,
  },
} as const

/** A named metric emitted by the audit command. */
export interface AuditMetric {
  /** Stable metric identifier. */
  name: MetricName
  /** Number of source lines matching the metric definition. */
  count: number
  /** Baseline count used as this metric's non-growing budget. */
  budget: number
  /** Difference between `count` and `budget`; positive values fail the gate. */
  delta: number
  /** Unit used by `count`. */
  unit: 'source_lines'
  /** Repository-relative source globs covered by the metric. */
  globs: string[]
  /** Repository-relative path fragments excluded from the corpus. */
  exclusions: string[]
  /** Counting rule used for this metric. */
  semantics: string
}

/** The machine-readable corpus manifest embedded in one metrics result. */
export interface AuditCorpus {
  /** Source roots selected for the corpus. */
  roots: string[]
  /** Glob expressions represented by the corpus. */
  globs: string[]
  /** Source extensions selected for the corpus. */
  extensions: string[]
  /** Excluded path fragments and exact files. */
  exclusions: string[]
  /** Sorted repository-relative files included in the measurement. */
  included_files: string[]
  /** Sorted repository-relative tracked files excluded from the measurement. */
  excluded_files: string[]
  /** SHA-256 digest of the sorted included file list. */
  files_digest: string
  /** SHA-256 digest of the sorted excluded file list. */
  excluded_files_digest: string
  /** Number of files represented by `files_digest`. */
  file_count: number
  /** Number of files represented by `excluded_files_digest`. */
  excluded_file_count: number
}

/** Counts for one owner/package scope. */
export interface AuditScopeMetrics {
  /** Repository area treated as the owner for this scope. */
  owner: string
  /** Nearest package manifest name, or the owner path when no manifest exists. */
  package: string
  /** Number of included source files in this scope. */
  file_count: number
  /** Counts for every canonical metric in this scope. */
  metrics: MetricCounts
}

/** Current scope metrics together with the baseline budget. */
export interface AuditScopeBudget extends AuditScopeMetrics {
  /** Number of source files in the baseline scope. */
  baseline_file_count: number
  /** Per-metric non-growing budgets inherited from the baseline scope. */
  budgets: MetricCounts
}

/** Retained identity and aggregate values for the comparison baseline. */
export interface AuditBaseline {
  /** Stable audit run identifier. */
  id: string
  /** Repository-relative source artifact for the retained baseline. */
  source: string
  /** SHA-256 of the retained baseline artifact. */
  artifact_sha256: string
  /** Immutable revision used to recalculate baseline scopes. */
  revision: string
  /** Resolved commit for the immutable baseline revision. */
  commit: string
  /** Capture timestamp of the retained baseline artifact. */
  captured_at: string
  /** Included corpus identity at the baseline revision. */
  corpus: Pick<AuditCorpus, 'files_digest' | 'file_count'>
  /** Aggregate metric counts at the baseline revision. */
  metrics: MetricCounts
}

/** One scope and metric that exceeded its non-growing budget. */
export interface AuditBudgetViolation {
  /** Repository area treated as the owner. */
  owner: string
  /** Package identity for the scope. */
  package: string
  /** Metric that exceeded its budget. */
  metric: MetricName
  /** Allowed baseline value. */
  budget: number
  /** Current observed value. */
  count: number
  /** Positive increase over the budget. */
  delta: number
}

/** Result of comparing current scope metrics with baseline budgets. */
export interface AuditRatchet {
  /** The only supported policy: debt may stay equal or decrease. */
  policy: 'non_increasing'
  /** Whether every owner/package/metric comparison passed. */
  status: 'passed' | 'failed'
  /** All violations, in stable owner/package/metric order. */
  violations: AuditBudgetViolation[]
}

/** Host details recorded with one metrics result. */
export interface AuditEnvironment {
  /** Node runtime version. */
  node: string
  /** pnpm version used to invoke the repository command. */
  pnpm: string
  /** Operating-system identifier. */
  platform: string
  /** CPU architecture identifier. */
  arch: string
}

/** Complete retained output produced by the audit command. */
export interface AuditMetricsReport {
  /** Schema revision for this JSON document. */
  schema_version: 1
  /** Git revision observed when the report was created. */
  commit: string
  /** ISO-8601 capture timestamp. */
  captured_at: string
  /** Runtime details for the measurement. */
  environment: AuditEnvironment
  /** Resolved source corpus and explicit exclusions. */
  corpus: AuditCorpus
  /** Traceable values and revision used for non-growing budgets. */
  baseline: AuditBaseline
  /** Named aggregate counts in stable definition order. */
  metrics: AuditMetric[]
  /** Current counts and budgets for every owner/package scope. */
  scopes: AuditScopeBudget[]
  /** Overall result of the per-scope non-growing comparison. */
  ratchet: AuditRatchet
}

interface MetricDefinition {
  name: MetricName
  pattern: RegExp
  semantics: string
}

interface MetricFilePartition {
  all_files: string[]
  included_files: string[]
  excluded_files: string[]
}

type SourceReader = (file: string) => string

const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    name: 'deprecated_reader',
    pattern: /\bno-deprecated\b/u,
    semantics: 'Count source lines containing the no-deprecated token.',
  },
  {
    name: 'lint_suppression',
    pattern: /\boxlint-disable\b/u,
    semantics: 'Count source lines containing an oxlint-disable directive.',
  },
  {
    name: 'todo_marker',
    pattern: /\b(?:TODO|FIXME|XXX)\b/u,
    semantics: 'Count source lines containing one standalone TODO, FIXME, or XXX marker.',
  },
  {
    name: 'explicit_any',
    pattern: /\bany\b/u,
    semantics: 'Count source lines containing the standalone any token.',
  },
  {
    name: 'selected_skip',
    pattern: /\.skip\s*\(/u,
    semantics: 'Count source lines containing a selected skip call such as test.skip(...).',
  },
]

/**
 * Count matching source lines for one named metric.
 * @param source - Source text to inspect.
 * @param metricName - Stable metric identifier.
 * @returns The number of lines matching the metric definition.
 */
export function countMetricLines(source: string, metricName: string): number {
  const definition = METRIC_DEFINITIONS.find(metric => metric.name === metricName)
  if (definition === undefined) throw new Error(`audit-metrics: unknown metric ${JSON.stringify(metricName)}.`)
  return source.split('\n').filter(line => definition.pattern.test(line)).length
}

/**
 * Partition tracked paths into the canonical included and excluded corpus.
 * @param files - Repository-relative tracked paths.
 * @returns Sorted included and excluded path lists.
 */
export function partitionMetricCorpus(files: readonly string[]): { included_files: string[]; excluded_files: string[] } {
  const partition = partitionMetricFiles(files)
  return {
    included_files: partition.included_files,
    excluded_files: partition.excluded_files,
  }
}

function partitionMetricFiles(files: readonly string[]): MetricFilePartition {
  const normalized = [...new Set(files)].filter(file => file !== '').sort()
  const included_files = normalized.filter(file => isIncludedMetricFile(file))
  const included = new Set(included_files)
  return {
    all_files: normalized,
    included_files,
    excluded_files: normalized.filter(file => !included.has(file)),
  }
}

/**
 * Return the tracked source files included by the canonical corpus.
 * @param repoRoot - Repository root used for the Git query.
 * @returns Sorted repository-relative source paths.
 */
export function resolveMetricCorpus(repoRoot: string): string[] {
  return partitionMetricFiles(resolveTrackedFiles(repoRoot)).included_files
}

/**
 * Build a deterministic corpus manifest from included and excluded paths.
 * @param files - Sorted or unsorted repository-relative included source paths.
 * @param excludedFiles - Sorted or unsorted repository-relative excluded paths.
 * @returns The normalized corpus manifest.
 */
export function buildAuditCorpus(files: readonly string[], excludedFiles: readonly string[] = []): AuditCorpus {
  const included_files = normalizeFileList(files)
  const included = new Set(included_files)
  const excluded_files = normalizeFileList(excludedFiles).filter(file => !included.has(file))
  return {
    roots: [...SOURCE_ROOTS],
    globs: [...SOURCE_GLOBS],
    extensions: [...SOURCE_EXTENSIONS].sort(),
    exclusions: [...EXCLUDED_PATH_SEGMENTS, ...EXCLUDED_FILE_PATHS],
    included_files,
    excluded_files,
    files_digest: digestFiles(included_files),
    excluded_files_digest: digestFiles(excluded_files),
    file_count: included_files.length,
    excluded_file_count: excluded_files.length,
  }
}

/**
 * Compare current owner/package metrics with a baseline and report every increase.
 * @param current - Current per-scope metric counts.
 * @param baseline - Per-scope metric counts from the retained baseline revision.
 * @returns A stable ratchet result.
 */
export function evaluateAuditRatchet(
  current: readonly AuditScopeMetrics[],
  baseline: readonly AuditScopeMetrics[],
): AuditRatchet {
  const baselineByScope = new Map(baseline.map(scope => [scopeKey(scope), scope]))
  const violations: AuditBudgetViolation[] = []
  for (const scope of current) {
    const baselineScope = baselineByScope.get(scopeKey(scope))
    for (const metric of METRIC_NAMES) {
      const budget = baselineScope?.metrics[metric] ?? 0
      const count = scope.metrics[metric]
      if (count > budget) {
        violations.push({
          owner: scope.owner,
          package: scope.package,
          metric,
          budget,
          count,
          delta: count - budget,
        })
      }
    }
  }
  return {
    policy: 'non_increasing',
    status: violations.length === 0 ? 'passed' : 'failed',
    violations,
  }
}

/**
 * Build the canonical metrics result for a repository.
 * @param options - Optional deterministic inputs used by tests and replay.
 * @returns A validated metrics report. The ratchet status determines the CLI exit code.
 */
export function buildAuditMetricsReport(options: {
  repoRoot?: string
  capturedAt?: string
  commit?: string
  pnpmVersion?: string
} = {}): AuditMetricsReport {
  const repoRoot = options.repoRoot ?? root
  const currentPartition = partitionMetricFiles(resolveTrackedFiles(repoRoot))
  const currentCorpus = buildAuditCorpus(currentPartition.included_files, currentPartition.excluded_files)
  const baselinePartition = partitionMetricFiles(resolveTrackedFilesAtRevision(repoRoot, CANONICAL_AUDIT_BASELINE.revision))
  const baselineCorpus = buildAuditCorpus(baselinePartition.included_files, baselinePartition.excluded_files)
  assertCanonicalBaseline(baselineCorpus)

  const baselineReader = createSourceReader(repoRoot, CANONICAL_AUDIT_BASELINE.revision)
  const currentReader = createSourceReader(repoRoot)
  const baselineScopes = collectScopeMetrics(baselinePartition, baselineReader)
  const currentScopes = collectScopeMetrics(currentPartition, currentReader)
  const ratchet = evaluateAuditRatchet(currentScopes, baselineScopes)
  const budgetsByScope = new Map(baselineScopes.map(scope => [scopeKey(scope), scope]))
  const scopes = currentScopes.map((scope) => {
    const baselineScope = budgetsByScope.get(scopeKey(scope))
    return {
      ...scope,
      baseline_file_count: baselineScope?.file_count ?? 0,
      budgets: cloneMetricCounts(baselineScope?.metrics ?? emptyMetricCounts()),
    }
  })
  const currentCounts = sumScopeMetrics(currentScopes)
  const metrics = METRIC_DEFINITIONS.map(definition => ({
    name: definition.name,
    count: currentCounts[definition.name],
    budget: CANONICAL_AUDIT_BASELINE.metrics[definition.name],
    delta: currentCounts[definition.name] - CANONICAL_AUDIT_BASELINE.metrics[definition.name],
    unit: 'source_lines' as const,
    globs: [...SOURCE_GLOBS],
    exclusions: [...EXCLUDED_PATH_SEGMENTS, ...EXCLUDED_FILE_PATHS],
    semantics: definition.semantics,
  }))
  const report: AuditMetricsReport = {
    schema_version: 1,
    commit: options.commit ?? gitCommit(repoRoot),
    captured_at: options.capturedAt ?? new Date().toISOString(),
    environment: {
      node: process.version,
      pnpm: options.pnpmVersion ?? pnpmVersion(repoRoot),
      platform: process.platform,
      arch: process.arch,
    },
    corpus: currentCorpus,
    baseline: {
      ...CANONICAL_AUDIT_BASELINE,
      corpus: {
        files_digest: baselineCorpus.files_digest,
        file_count: baselineCorpus.file_count,
      },
      commit: gitCommitAtRevision(repoRoot, CANONICAL_AUDIT_BASELINE.revision),
      metrics: cloneMetricCounts(CANONICAL_AUDIT_BASELINE.metrics),
    },
    metrics,
    scopes,
    ratchet,
  }
  validateAuditMetricsReport(report)
  return report
}

/**
 * Validate a metrics document before it is retained or consumed.
 * @param value - Candidate document from an internal builder or JSON parser.
 * @returns Nothing; throws when the document does not satisfy the retained format.
 */
export function validateAuditMetricsReport(value: unknown): asserts value is AuditMetricsReport {
  if (!isRecord(value) || value.schema_version !== 1) throw new Error('audit-metrics: schema_version must be 1.')
  if (!isNonEmptyString(value.commit) || !isNonEmptyString(value.captured_at)) throw new Error('audit-metrics: commit and captured_at are required.')
  if (!isRecord(value.environment) || !isNonEmptyString(value.environment.node) || !isNonEmptyString(value.environment.pnpm)
    || !isNonEmptyString(value.environment.platform) || !isNonEmptyString(value.environment.arch)) {
    throw new Error('audit-metrics: environment must contain node, pnpm, platform, and arch.')
  }
  const corpus = value.corpus
  if (!isRecord(corpus) || !Array.isArray(corpus.roots) || !corpus.roots.every(isNonEmptyString)
    || !Array.isArray(corpus.globs) || !corpus.globs.every(isNonEmptyString)
    || !Array.isArray(corpus.extensions) || !corpus.extensions.every(isNonEmptyString)
    || !Array.isArray(corpus.exclusions) || !corpus.exclusions.every(isNonEmptyString)
    || !Array.isArray(corpus.included_files) || !corpus.included_files.every(isNonEmptyString)
    || !Array.isArray(corpus.excluded_files) || !corpus.excluded_files.every(isNonEmptyString)
    || !isNonEmptyString(corpus.files_digest) || !isNonEmptyString(corpus.excluded_files_digest)
    || !isNonNegativeSafeInteger(corpus.file_count) || !isNonNegativeSafeInteger(corpus.excluded_file_count)
    || corpus.file_count !== corpus.included_files.length || corpus.excluded_file_count !== corpus.excluded_files.length
    || digestFiles(corpus.included_files) !== corpus.files_digest || digestFiles(corpus.excluded_files) !== corpus.excluded_files_digest) {
    throw new Error('audit-metrics: corpus fields are incomplete or invalid.')
  }
  if (hasFileOverlap(corpus.included_files, corpus.excluded_files)) {
    throw new Error('audit-metrics: a corpus file cannot be both included and excluded.')
  }
  validateBaseline(value.baseline)
  const metrics = value.metrics
  if (!Array.isArray(metrics) || metrics.length !== METRIC_DEFINITIONS.length) throw new Error('audit-metrics: all named metrics are required.')
  const names = new Set<MetricName>()
  for (const metric of metrics) {
    if (!isRecord(metric) || !isMetricName(metric.name) || names.has(metric.name)
      || !isNonNegativeSafeInteger(metric.count) || !isNonNegativeSafeInteger(metric.budget)
      || !Number.isSafeInteger(metric.delta) || metric.delta !== metric.count - metric.budget || metric.unit !== 'source_lines'
      || !Array.isArray(metric.globs) || !metric.globs.every(isNonEmptyString)
      || !Array.isArray(metric.exclusions) || !metric.exclusions.every(isNonEmptyString)
      || !isNonEmptyString(metric.semantics)) {
      throw new Error('audit-metrics: metric fields are incomplete or invalid.')
    }
    names.add(metric.name)
  }
  if (names.size !== METRIC_DEFINITIONS.length || METRIC_NAMES.some(name => !names.has(name))) {
    throw new Error('audit-metrics: metric names do not match the canonical definitions.')
  }
  const scopes = value.scopes
  if (!Array.isArray(scopes)) throw new Error('audit-metrics: scopes must be an array.')
  const scopeKeys = new Set<string>()
  for (const scope of scopes) {
    if (!isRecord(scope) || !isNonEmptyString(scope.owner) || !isNonEmptyString(scope.package)
      || !isNonNegativeSafeInteger(scope.file_count) || !isNonNegativeSafeInteger(scope.baseline_file_count)
      || !hasMetricCounts(scope.metrics) || !hasMetricCounts(scope.budgets)) {
      throw new Error('audit-metrics: scope fields are incomplete or invalid.')
    }
    const key = `${scope.owner}\u0000${scope.package}`
    if (scopeKeys.has(key)) throw new Error('audit-metrics: duplicate owner/package scope.')
    scopeKeys.add(key)
  }
  const ratchet = value.ratchet
  if (!isRecord(ratchet) || ratchet.policy !== 'non_increasing'
    || (ratchet.status !== 'passed' && ratchet.status !== 'failed') || !Array.isArray(ratchet.violations)) {
    throw new Error('audit-metrics: ratchet fields are incomplete or invalid.')
  }
  for (const violation of ratchet.violations) {
    if (!isRecord(violation) || !isNonEmptyString(violation.owner) || !isNonEmptyString(violation.package)
      || !isMetricName(violation.metric) || !isNonNegativeSafeInteger(violation.budget)
      || !isNonNegativeSafeInteger(violation.count) || !isNonNegativeSafeInteger(violation.delta)
      || violation.delta !== violation.count - violation.budget || violation.count <= violation.budget) {
      throw new Error('audit-metrics: ratchet violation fields are incomplete or invalid.')
    }
  }
  if ((ratchet.status === 'passed') !== (ratchet.violations.length === 0)) {
    throw new Error('audit-metrics: ratchet status does not match its violations.')
  }
}

/**
 * Serialize a validated metrics report with stable indentation.
 * @param report - Metrics report to serialize.
 * @returns JSON text ending in one newline.
 */
export function renderAuditMetricsReport(report: AuditMetricsReport): string {
  validateAuditMetricsReport(report)
  return `${JSON.stringify(report, null, 2)}\n`
}

/**
 * Parse command-line options for the metrics command.
 * @param args - Arguments after the script name.
 * @returns The optional output path.
 */
export function parseAuditMetricsArgs(args: readonly string[]): { output?: string } {
  let output: string | undefined
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--') {
      continue
    } else if (argument === '--output') {
      const candidate = args[++index]
      if (candidate === undefined || candidate === '') throw new Error('audit-metrics: --output requires a path.')
      output = candidate
    } else if (argument?.startsWith('--output=')) {
      const candidate = argument.slice('--output='.length)
      if (candidate === '') throw new Error('audit-metrics: --output requires a path.')
      output = candidate
    } else if (argument === '--help') {
      return {}
    } else {
      throw new Error(`audit-metrics: unknown argument ${JSON.stringify(argument)}.`)
    }
  }
  return output === undefined ? {} : { output }
}

function isIncludedMetricFile(file: string): boolean {
  return SOURCE_ROOTS.some(rootPath => file.startsWith(rootPath))
    && SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf('.')).toLowerCase())
    && !EXCLUDED_PATH_SEGMENTS.some(fragment => file.includes(fragment))
    && !EXCLUDED_FILE_PATHS.includes(file as typeof EXCLUDED_FILE_PATHS[number])
}

function resolveTrackedFiles(repoRoot: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(file => file !== '')
    .sort()
}

function resolveTrackedFilesAtRevision(repoRoot: string, revision: string): string[] {
  return execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', revision], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(file => file !== '')
    .sort()
}

function normalizeFileList(files: readonly string[]): string[] {
  return [...new Set(files)].filter(file => file !== '').sort()
}

function digestFiles(files: readonly string[]): string {
  return createHash('sha256').update(files.join('\n')).digest('hex')
}

function createSourceReader(repoRoot: string, revision?: string): SourceReader {
  const cache = new Map<string, string>()
  const changedFiles = revision === undefined ? new Set<string>() : resolveChangedFiles(repoRoot, revision)
  return (file: string): string => {
    const cached = cache.get(file)
    if (cached !== undefined) return cached
    const source = revision === undefined || !changedFiles.has(file)
      ? readFileSync(resolve(repoRoot, file), 'utf8')
      : execFileSync('git', ['show', `${revision}:${file}`], { cwd: repoRoot, encoding: 'utf8' })
    cache.set(file, source)
    return source
  }
}

function resolveChangedFiles(repoRoot: string, revision: string): Set<string> {
  return new Set(execFileSync('git', ['diff', '--no-renames', '--name-only', revision, '--'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(file => file !== ''))
}

function collectScopeMetrics(partition: MetricFilePartition, reader: SourceReader): AuditScopeMetrics[] {
  const packageNames = packageNamesForFiles(partition.included_files, partition.all_files, reader)
  const scopes = new Map<string, AuditScopeMetrics>()
  for (const file of partition.included_files) {
    const identity = scopeIdentity(file, packageNames)
    const key = `${identity.owner}\u0000${identity.package}`
    let scope = scopes.get(key)
    if (scope === undefined) {
      scope = { ...identity, file_count: 0, metrics: emptyMetricCounts() }
      scopes.set(key, scope)
    }
    scope.file_count += 1
    addMetricCounts(scope.metrics, countSourceMetrics(reader(file)))
  }
  return [...scopes.values()].sort((left, right) => scopeKey(left).localeCompare(scopeKey(right)))
}

function packageNamesForFiles(includedFiles: readonly string[], allFiles: readonly string[], reader: SourceReader): Map<string, string> {
  const all = new Set(allFiles)
  const manifestPaths = new Set<string>()
  for (const file of includedFiles) {
    const manifest = nearestPackageManifest(file, all)
    if (manifest !== undefined) manifestPaths.add(manifest)
  }
  const names = new Map<string, string>()
  for (const manifest of manifestPaths) {
    const value: unknown = JSON.parse(reader(manifest))
    if (!isRecord(value) || !isNonEmptyString(value.name)) {
      throw new Error(`audit-metrics: package manifest ${manifest} must define a non-empty name.`)
    }
    names.set(dirname(manifest) === '.' ? '' : dirname(manifest), value.name)
  }
  return names
}

function nearestPackageManifest(file: string, allFiles: ReadonlySet<string>): string | undefined {
  let directory = dirname(file)
  while (directory !== '.') {
    const candidate = `${directory}/package.json`
    if (allFiles.has(candidate)) return candidate
    directory = dirname(directory)
  }
  return allFiles.has('package.json') ? 'package.json' : undefined
}

function scopeIdentity(file: string, packageNames: ReadonlyMap<string, string>): Pick<AuditScopeMetrics, 'owner' | 'package'> {
  const [rootName, group] = file.split('/')
  const owner = rootName === 'packages' || rootName === 'apps'
    ? `${rootName}/${group ?? rootName}`
    : rootName ?? 'repository'
  let directory = dirname(file)
  while (directory !== '.') {
    const packageName = packageNames.get(directory)
    if (packageName !== undefined) return { owner, package: packageName }
    directory = dirname(directory)
  }
  return { owner, package: packageNames.get('') ?? owner }
}

function countSourceMetrics(source: string): MetricCounts {
  const counts = emptyMetricCounts()
  for (const definition of METRIC_DEFINITIONS) counts[definition.name] = countMetricLines(source, definition.name)
  return counts
}

function sumScopeMetrics(scopes: readonly AuditScopeMetrics[]): MetricCounts {
  const totals = emptyMetricCounts()
  for (const scope of scopes) addMetricCounts(totals, scope.metrics)
  return totals
}

function emptyMetricCounts(): MetricCounts {
  return {
    deprecated_reader: 0,
    lint_suppression: 0,
    todo_marker: 0,
    explicit_any: 0,
    selected_skip: 0,
  }
}

function cloneMetricCounts(counts: MetricCounts): MetricCounts {
  return { ...counts }
}

function addMetricCounts(target: MetricCounts, source: MetricCounts): void {
  for (const metric of METRIC_NAMES) target[metric] += source[metric]
}

function scopeKey(scope: Pick<AuditScopeMetrics, 'owner' | 'package'>): string {
  return `${scope.owner}\u0000${scope.package}`
}

function assertCanonicalBaseline(corpus: AuditCorpus): void {
  if (corpus.files_digest !== CANONICAL_AUDIT_BASELINE.corpus.files_digest
    || corpus.file_count !== CANONICAL_AUDIT_BASELINE.corpus.file_count) {
    throw new Error(
      `audit-metrics: canonical baseline corpus changed; expected ${CANONICAL_AUDIT_BASELINE.corpus.file_count} files with digest ${CANONICAL_AUDIT_BASELINE.corpus.files_digest}, got ${corpus.file_count} with digest ${corpus.files_digest}.`,
    )
  }
}

function validateBaseline(value: unknown): asserts value is AuditBaseline {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.source)
    || !isNonEmptyString(value.artifact_sha256) || !/^[0-9a-f]{64}$/u.test(value.artifact_sha256)
    || !isNonEmptyString(value.revision) || !isNonEmptyString(value.commit)
    || !isNonEmptyString(value.captured_at) || !isRecord(value.corpus)
    || !isNonEmptyString(value.corpus.files_digest) || !isNonNegativeSafeInteger(value.corpus.file_count)
    || !hasMetricCounts(value.metrics)) {
    throw new Error('audit-metrics: baseline fields are incomplete or invalid.')
  }
}

function hasMetricCounts(value: unknown): value is MetricCounts {
  return isRecord(value) && METRIC_NAMES.every(metric => isNonNegativeSafeInteger(value[metric]))
}

function hasFileOverlap(included: unknown, excluded: unknown): boolean {
  if (!Array.isArray(included) || !Array.isArray(excluded)) return false
  const excludedFiles = new Set(excluded.filter(isNonEmptyString))
  return included.filter(isNonEmptyString).some(file => excludedFiles.has(file))
}

function isMetricName(value: unknown): value is MetricName {
  return typeof value === 'string' && (METRIC_NAMES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function gitCommit(repoRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
}

function gitCommitAtRevision(repoRoot: string, revision: string): string {
  return execFileSync('git', ['rev-parse', revision], { cwd: repoRoot, encoding: 'utf8' }).trim()
}

function pnpmVersion(repoRoot: string): string {
  return execFileSync('pnpm', ['--version'], { cwd: repoRoot, encoding: 'utf8' }).trim()
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  try {
    const options = parseAuditMetricsArgs(process.argv.slice(2))
    if (process.argv.includes('--help')) {
      console.log('Usage: pnpm run audit:metrics -- [--output <path>]')
    } else {
      const report = buildAuditMetricsReport()
      const rendered = renderAuditMetricsReport(report)
      if (options.output !== undefined) {
        const outputPath = resolve(root, options.output)
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, rendered)
      }
      process.stdout.write(rendered)
      if (report.ratchet.status === 'failed') process.exitCode = 1
    }
  } catch (error) {
    console.error(`audit-metrics: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
