import { describe, expect, it } from 'vitest'
import {
  pathMatches,
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
})
