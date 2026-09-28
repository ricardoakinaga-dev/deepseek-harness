import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertObjectJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { reportSchema } from './contracts.ts'

const readJson = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))

describe('audit report output schema', () => {
  it('uses the workflow-supported subset and accepts both recorded child reports', () => {
    const outputSchema: unknown = readJson('./report-output.schema.json')
    assertObjectJsonSchema(outputSchema)
    for (const name of ['web', 'infra']) {
      const report = readJson(`../../snapshots/session/audit-evidence-reconciliation/workspace.expected/${name}.json`)
      expect(validateJsonSchemaValue(outputSchema, report)).toEqual([])
      expect(reportSchema.parse(report)).toEqual(report)
    }
  })

  it('rejects an undeclared field and leaves semantic test claims to the strict parser', () => {
    const outputSchema: unknown = readJson('./report-output.schema.json')
    assertObjectJsonSchema(outputSchema)
    const report = reportSchema.parse(readJson('../../snapshots/session/audit-evidence-reconciliation/workspace.expected/web.json'))
    expect(validateJsonSchemaValue(outputSchema, { ...report, invented: true })).not.toEqual([])
    const inventedPass = { ...report, findings: [{ ...report.findings[0], scope: 'test', status: 'RESOLVED',
      evidence: [{ ...report.findings[0]?.evidence[0], kind: 'test-run', outcome: 'PASS' }] }] }
    expect(validateJsonSchemaValue(outputSchema, inventedPass)).toEqual([])
    expect(() => reportSchema.parse(inventedPass)).toThrow(/executed test requires a command and matching exit code/)
  })
})
