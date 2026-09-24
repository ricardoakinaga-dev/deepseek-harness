import { describe, expect, it } from 'vitest'
import { findPnpmSupplyChainViolations } from './verify-pnpm-supply-chain.ts'

describe('pnpm supply-chain policy', () => {
  it('rejects a missing or weak release-age window', () => {
    const violations = findPnpmSupplyChainViolations('fixture.yml', {
      minimumReleaseAge: 60,
      minimumReleaseAgeExclude: ['@scope/package@1.2.3'],
    })
    expect(violations).toEqual([{
      file: 'fixture.yml',
      field: 'minimumReleaseAge',
      reason: 'must be an integer of at least 1440 minutes',
    }])
  })

  it('rejects broad or malformed exceptions', () => {
    const violations = findPnpmSupplyChainViolations('fixture.yml', {
      minimumReleaseAge: 1440,
      minimumReleaseAgeExclude: ['@scope/package', 'latest'],
    })
    expect(violations).toHaveLength(2)
    expect(violations.every(violation => violation.field.startsWith('minimumReleaseAgeExclude['))).toBe(true)
  })

  it('accepts the release-age policy and exact version expressions', () => {
    expect(findPnpmSupplyChainViolations('fixture.yml', {
      minimumReleaseAge: 1440,
      minimumReleaseAgeExclude: ['@scope/package@1.2.3', '@scope/other@1.0.0||1.0.0-linux-x64'],
    })).toEqual([])
  })
})
