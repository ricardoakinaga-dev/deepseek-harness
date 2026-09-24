import { describe, expect, it } from 'vitest'
import { findForkRunnerViolations } from './verify-ci-fork-runners.ts'

describe('pull-request persistent runner policy', () => {
  it('rejects an unguarded persistent runner in a pull-request workflow', () => {
    expect(findForkRunnerViolations('fixture.yml', {
      on: { pull_request: null },
      jobs: {
        build: {
          'runs-on': "${{ vars.RUNNER == 'selfhosted' && fromJSON('[\"self-hosted\"]') || 'ubuntu-latest' }}",
        },
      },
    })).toEqual([{
      file: 'fixture.yml',
      job: 'build',
      reason: 'persistent runner selection lacks github.event.pull_request.head.repo.fork == false',
    }])
  })

  it('accepts the explicit fork exclusion in a runner expression', () => {
    expect(findForkRunnerViolations('fixture.yml', {
      on: { pull_request: null },
      jobs: {
        build: {
          'runs-on': "${{ github.event.pull_request.head.repo.fork == false && fromJSON('[\"self-hosted\"]') || 'ubuntu-latest' }}",
        },
      },
    })).toEqual([])
  })

  it('accepts a job-level fork exclusion for a persistent runner', () => {
    expect(findForkRunnerViolations('fixture.yml', {
      on: { pull_request: null },
      jobs: {
        build: {
          if: 'github.event.pull_request.head.repo.fork == false',
          'runs-on': ['self-hosted', 'linux'],
        },
      },
    })).toEqual([])
  })

  it('does not inspect non-pull-request workflows', () => {
    expect(findForkRunnerViolations('fixture.yml', {
      on: { push: { branches: ['master'] } },
      jobs: {
        build: { 'runs-on': ['self-hosted', 'linux'] },
      },
    })).toEqual([])
  })
})
