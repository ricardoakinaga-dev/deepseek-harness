import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  pathMatches,
  validateMirrorIdentity,
  validateCustomizationPolicy,
} from './verify-customization-policy.mjs'

const repository = {
  forkRemote: 'origin',
  forkUrl: 'https://github.com/ricardoakinaga-dev/deepseek-harness.git',
  upstreamRemote: 'deepseek-official',
  upstreamUrl: 'https://github.com/deepseek-ai/deepseek-harness.git',
  mirrorBranch: 'master',
  integrationBranch: 'custom/main',
  updateStrategy: 'merge',
  designStandard: 'docs/customization/improvement-development-standard.md',
}

describe('customization policy', () => {
  it('matches exact, directory, and prefix ownership patterns', () => {
    expect(pathMatches('docs/guide.md', 'docs/guide.md')).toBe(true)
    expect(pathMatches('packages/custom/src/index.ts', 'packages/custom/')).toBe(true)
    expect(pathMatches('docs/guide.zh.md', 'docs/guide*')).toBe(true)
    expect(pathMatches('packages/customized/src/index.ts', 'packages/custom/')).toBe(false)
  })

  it('accepts an opt-in extension confined to its package root', () => {
    const policy = {
      version: 1,
      repository,
      improvements: [{
        id: 'sample-extension',
        kind: 'extension',
        solutionType: 'plugin',
        status: 'active',
        summary: 'Exercise an optional package.',
        optIn: true,
        packageRoots: ['packages/example/sample-extension/'],
        paths: ['packages/example/sample-extension/'],
      }],
    }
    expect(validateCustomizationPolicy(policy, ['packages/example/sample-extension/src/index.ts'])).toEqual([])
  })

  it('rejects unowned deltas and extension changes to official package source', () => {
    const policy = {
      version: 1,
      repository,
      improvements: [{
        id: 'sample-extension',
        kind: 'extension',
        solutionType: 'plugin',
        status: 'active',
        summary: 'Exercise an optional package.',
        optIn: true,
        packageRoots: ['packages/example/sample-extension/'],
        paths: ['packages/example/sample-extension/', 'packages/core/agent-loop/src/index.ts'],
      }],
    }
    expect(validateCustomizationPolicy(policy, [
      'packages/core/agent-loop/src/index.ts',
      'unregistered.txt',
    ])).toEqual([
      'packages/core/agent-loop/src/index.ts: extension sample-extension changes source outside its package roots',
      'unregistered.txt: custom delta has no improvement owner',
    ])
  })

  it('rejects a missing or kind-incompatible solution type', () => {
    const policy = {
      version: 1,
      repository,
      improvements: [{
        id: 'missing-type',
        kind: 'extension',
        status: 'proposed',
        summary: 'Missing classification.',
        optIn: true,
        paths: ['docs/missing.md'],
      }, {
        id: 'wrong-type',
        kind: 'governance',
        solutionType: 'plugin',
        status: 'active',
        summary: 'Incompatible classification.',
        paths: ['scripts/wrong.mjs'],
      }],
    }
    expect(validateCustomizationPolicy(policy, [])).toEqual([
      'improvements[0].solutionType is not permitted for kind "extension"',
      'improvements[1].solutionType is not permitted for kind "governance"',
    ])
  })

  it.each(['configuration', 'profile-patch', 'skill'] as const)(
    'rejects packageRoots on the non-packaged %s solution type',
    (solutionType) => {
      const policy = {
        version: 1,
        repository,
        improvements: [{
          id: `invalid-${solutionType}`,
          kind: 'extension',
          solutionType,
          status: 'active',
          summary: 'Reject a package source claim on a non-packaged extension.',
          optIn: true,
          packageRoots: ['packages/example/not-allowed/'],
          paths: ['docs/example.md'],
        }],
      }
      expect(validateCustomizationPolicy(policy, [])).toEqual([
        `improvements[0].packageRoots is not permitted for solutionType "${solutionType}"`,
      ])
    },
  )

  it('accepts a mirror whose official and fork commits are equal', () => {
    expect(validateMirrorIdentity({
      mirrorRef: 'origin/master',
      officialRef: 'deepseek-official/master',
      mirrorCommit: 'a'.repeat(40),
      officialCommit: 'a'.repeat(40),
    })).toEqual([])
  })

  it('rejects a mismatched or missing mirror commit with an actionable diagnostic', () => {
    expect(validateMirrorIdentity({
      mirrorRef: 'origin/master',
      officialRef: 'deepseek-official/master',
      mirrorCommit: 'a'.repeat(40),
      officialCommit: 'b'.repeat(40),
    })).toEqual([
      'origin/master resolves to ' + 'a'.repeat(40) + ', but deepseek-official/master resolves to ' + 'b'.repeat(40) + '; fetch the official branch and fast-forward the fork mirror before running customization checks',
    ])
    expect(validateMirrorIdentity({
      mirrorRef: 'origin/master',
      officialRef: 'deepseek-official/master',
      mirrorCommit: null,
      officialCommit: 'b'.repeat(40),
    })).toEqual(['origin/master: ref is missing or does not resolve to a commit'])
  })

  it('runs official-mirror verification before the attributed-delta check', () => {
    const workflow = readFileSync(new URL('../.github/workflows/customization-policy.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('node scripts/verify-customization-policy.mjs --base origin/master --require-official-mirror')
  })
})
