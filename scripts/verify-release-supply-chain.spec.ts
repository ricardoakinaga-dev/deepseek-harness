import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RELEASE_SUPPLY_CHAIN_WORKFLOWS,
  findReleaseSupplyChainViolations,
  scanReleaseSupplyChainViolations,
} from './verify-release-supply-chain.ts'

const root = resolve(import.meta.dirname, '..')

describe('release SBOM and attestation policy', () => {
  it('accepts every permitted release workflow', () => {
    expect(scanReleaseSupplyChainViolations(root)).toEqual([])
  })

  it('covers the explicit release workflow allowlist', () => {
    expect(RELEASE_SUPPLY_CHAIN_WORKFLOWS).toEqual([
      '.github/workflows/node-addon-system-release.yml',
      '.github/workflows/python-release.yml',
      '.github/workflows/release-publish.yml',
      '.github/workflows/release-vendor-publish.yml',
      '.github/workflows/release-vendor.yml',
    ])
  })

  it('rejects a producer that omits SBOM and source-identity controls', () => {
    const source = readFileSync(resolve(root, '.github/workflows/release-publish.yml'), 'utf8')
      .replace(/\n      - name: Generate release SBOM[\s\S]*?\n      - uses: actions\/upload-artifact@/u, '\n      - uses: actions/upload-artifact@')
    const rules = new Set(findReleaseSupplyChainViolations('.github/workflows/release-publish.yml', source).map(item => item.rule))
    expect(rules).toEqual(new Set([
      'missing-sbom-generation',
      'missing-source-identity-attestation',
      'missing-sbom-attestation',
      'missing-attestation-verification',
    ]))
  })

  it('rejects a verifier that hardcodes repository identity', () => {
    const source = readFileSync(resolve(root, '.github/workflows/release-publish.yml'), 'utf8')
      .replaceAll('--repo "$GITHUB_REPOSITORY"', '--repo deepseek-harness/deepseek-harness')
    const rules = new Set(findReleaseSupplyChainViolations('.github/workflows/release-publish.yml', source).map(item => item.rule))
    expect(rules).toContain('invalid-attestation-verification')
  })
})
