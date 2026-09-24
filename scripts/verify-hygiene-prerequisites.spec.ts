import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { findMissingHygieneArtifacts } from './verify-hygiene-prerequisites.ts'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('hygiene build prerequisite inspection', () => {
  it('reports missing JavaScript and declaration outputs from package manifests', () => {
    const root = fixtureRoot()
    writeManifest(root)

    expect(findMissingHygieneArtifacts(root)).toEqual([
      'packages/example/pkg/package.json: missing lib/index.js',
      'packages/example/pkg/package.json: missing lib/types/index.d.ts',
    ])
  })

  it('accepts complete outputs and ignores repository-only source exports', () => {
    const root = fixtureRoot()
    writeManifest(root)
    mkdirSync(join(root, 'packages/example/pkg/lib/types'), { recursive: true })
    writeFileSync(join(root, 'packages/example/pkg/lib/index.js'), '')
    writeFileSync(join(root, 'packages/example/pkg/lib/types/index.d.ts'), '')

    expect(findMissingHygieneArtifacts(root)).toEqual([])
  })
})

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-hygiene-prerequisites-'))
  temporaryRoots.push(root)
  return root
}

function writeManifest(root: string): void {
  const packageDirectory = join(root, 'packages/example/pkg')
  mkdirSync(packageDirectory, { recursive: true })
  writeFileSync(join(packageDirectory, 'package.json'), `${JSON.stringify({
    name: '@example/package',
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: {
      '.': {
        types: './lib/types/index.d.ts',
        default: './lib/index.js',
      },
      './src/*': './src/*',
    },
  })}\n`)
}
