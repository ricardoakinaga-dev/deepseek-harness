import { describe, expect, it } from 'vitest'
import {
  type AuditScopeMetrics,
  buildAuditCorpus,
  countMetricLines,
  evaluateAuditRatchet,
  parseAuditMetricsArgs,
  partitionMetricCorpus,
  validateAuditMetricsReport,
} from './audit-metrics.ts'

function scope(owner: string, packageName: string, explicitAny: number): AuditScopeMetrics {
  return {
    owner,
    package: packageName,
    file_count: 1,
    metrics: {
      deprecated_reader: 0,
      lint_suppression: 0,
      todo_marker: 0,
      explicit_any: explicitAny,
      selected_skip: 0,
    },
  }
}

describe('audit metrics', () => {
  it('counts one source line per named positive fixture match', () => {
    const fixture = [
      '// no-deprecated',
      '/* oxlint-disable-next-line */',
      '// TODO: assign an owner',
      'const value: any = undefined',
      'test.skip(\'pending\', () => {})',
      'const unrelated = true',
    ].join('\n')

    expect(countMetricLines(fixture, 'deprecated_reader')).toBe(1)
    expect(countMetricLines(fixture, 'lint_suppression')).toBe(1)
    expect(countMetricLines(fixture, 'todo_marker')).toBe(1)
    expect(countMetricLines(fixture, 'explicit_any')).toBe(1)
    expect(countMetricLines(fixture, 'selected_skip')).toBe(1)
  })

  it('does not count substrings or unrelated lines in the negative fixture', () => {
    const fixture = [
      'const notation = "anywhere"',
      'const todoist = true',
      'const skipper = true',
      'const oxlintDisable = true',
      'const deprecatedReader = true',
    ].join('\n')

    expect(countMetricLines(fixture, 'deprecated_reader')).toBe(0)
    expect(countMetricLines(fixture, 'lint_suppression')).toBe(0)
    expect(countMetricLines(fixture, 'todo_marker')).toBe(0)
    expect(countMetricLines(fixture, 'explicit_any')).toBe(0)
    expect(countMetricLines(fixture, 'selected_skip')).toBe(0)
  })

  it('deduplicates and fingerprints the resolved corpus', () => {
    const corpus = buildAuditCorpus(['packages/a.ts', 'packages/a.ts', 'scripts/b.ts'])

    expect(corpus.file_count).toBe(2)
    expect(corpus.files_digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(corpus.included_files).toEqual(['packages/a.ts', 'scripts/b.ts'])
    expect(corpus.excluded_file_count).toBe(0)
    expect(corpus.roots).toContain('packages/')
    expect(corpus.exclusions).toContain('vendor/')
  })

  it('records included and excluded paths without silently admitting a new tree', () => {
    const partition = partitionMetricCorpus([
      'packages/core/src/index.ts',
      'critical-new-tree/handler.ts',
      'packages/core/README.md',
      'packages/core/src/generated/value.ts',
    ])

    expect(partition.included_files).toEqual(['packages/core/src/index.ts'])
    expect(partition.excluded_files).toEqual([
      'critical-new-tree/handler.ts',
      'packages/core/README.md',
      'packages/core/src/generated/value.ts',
    ])
  })

  it('fails the non-growing ratchet on the owner/package growth fixture', () => {
    const result = evaluateAuditRatchet(
      [scope('packages/core', '@deepseek-ai/dsh-core', 3)],
      [scope('packages/core', '@deepseek-ai/dsh-core', 2)],
    )

    expect(result).toEqual({
      policy: 'non_increasing',
      status: 'failed',
      violations: [{
        owner: 'packages/core',
        package: '@deepseek-ai/dsh-core',
        metric: 'explicit_any',
        budget: 2,
        count: 3,
        delta: 1,
      }],
    })
  })

  it('treats a new owner/package with debt as an unauthorized increase', () => {
    const result = evaluateAuditRatchet(
      [scope('apps/new', '@deepseek-ai/dsh-new', 1)],
      [],
    )

    expect(result.status).toBe('failed')
    expect(result.violations[0]).toMatchObject({
      owner: 'apps/new',
      package: '@deepseek-ai/dsh-new',
      budget: 0,
      count: 1,
    })
  })

  it('rejects an incomplete retained report', () => {
    expect(() => {
      validateAuditMetricsReport({ schema_version: 1 })
    }).toThrow(/commit and captured_at/u)
  })

  it('rejects unknown command arguments and accepts an output path', () => {
    expect(parseAuditMetricsArgs(['--output', 'metrics.json'])).toEqual({ output: 'metrics.json' })
    expect(() => parseAuditMetricsArgs(['--unknown'])).toThrow(/unknown argument/u)
  })
})
