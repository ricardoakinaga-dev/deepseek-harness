import { describe, expect, it } from 'vitest'
import { findDependencyAuditViolations } from './verify-dependency-audit.ts'

const advisory = (id: number, severity: string, moduleName: string) => ({
  id,
  severity,
  module_name: moduleName,
  title: 'fixture advisory',
  findings: [{ version: '1.0.0' }],
})

describe('dependency advisory policy', () => {
  it('rejects an unexcepted high advisory', () => {
    expect(findDependencyAuditViolations({ advisories: { '1': advisory(1, 'high', 'fixture') } }, { exceptions: [] })).toHaveLength(1)
  })

  it('accepts a high advisory with a current owner-owned exception', () => {
    expect(findDependencyAuditViolations({ advisories: { '1': advisory(1, 'high', 'fixture') } }, {
      version: 1,
      exceptions: [{ id: 1, owner: 'security-team', expires: '2099-01-01', reason: 'fixture migration' }],
    })).toEqual([])
  })

  it('rejects an expired exception', () => {
    expect(findDependencyAuditViolations({ advisories: { '1': advisory(1, 'high', 'fixture') } }, {
      exceptions: [{ id: 1, owner: 'security-team', expires: '2020-01-01', reason: 'fixture migration' }],
    }, new Date('2026-09-21T00:00:00Z'))).toEqual([expect.objectContaining({
      id: '1',
      reason: 'exception must have a current expiry, owner, and reason',
    })])
  })

  it('rejects an exception without an owner or reason', () => {
    expect(findDependencyAuditViolations({ advisories: { '1': advisory(1, 'high', 'fixture') } }, {
      exceptions: [{ id: 1, expires: '2099-01-01' }],
    })).toEqual([expect.objectContaining({
      id: '1',
      reason: 'exception must have a current expiry, owner, and reason',
    })])
  })

  it('does not block moderate or low findings by default', () => {
    expect(findDependencyAuditViolations({ advisories: {
      '1': advisory(1, 'moderate', 'fixture'),
      '2': advisory(2, 'low', 'fixture'),
    } }, { exceptions: [] })).toEqual([])
  })
})
