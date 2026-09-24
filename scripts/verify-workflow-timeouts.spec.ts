import { describe, expect, it } from 'vitest'
import { findWorkflowTimeoutViolations } from './verify-workflow-timeouts.ts'

describe('workflow timeout policy', () => {
  it('rejects an executable job with no bounded timeout', () => {
    expect(findWorkflowTimeoutViolations('fixture.yml', {
      jobs: { build: { 'runs-on': 'ubuntu-latest' } },
    })).toEqual([{ file: 'fixture.yml', job: 'build', reason: 'missing timeout-minutes' }])
  })

  it('rejects non-positive, fractional, and excessive timeout values', () => {
    const violations = findWorkflowTimeoutViolations('fixture.yml', {
      jobs: {
        zero: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 0 },
        fractional: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 1.5 },
        excessive: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 361 },
      },
    })
    expect(violations).toHaveLength(3)
    expect(violations.every(violation => violation.reason.includes('integer from 1 to 360'))).toBe(true)
  })

  it('accepts bounded executable jobs and reusable workflow calls', () => {
    expect(findWorkflowTimeoutViolations('fixture.yml', {
      jobs: {
        build: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 30 },
        reusable: { uses: './.github/workflows/reusable.yml' },
      },
    })).toEqual([])
  })
})
