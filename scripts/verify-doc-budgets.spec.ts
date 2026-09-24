import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countDocWords, findDocBudgetViolations, renderDocBudgetRows } from './verify-doc-budgets.ts'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-doc-budgets-'))
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'docs/page.md'), 'one two three\n')
  return root
}

describe('documentation budget policy', () => {
  it('counts words by whitespace', () => {
    expect(countDocWords('one\n two\t three')).toBe(3)
  })

  it('accepts a document at its baseline and ceiling', () => {
    const root = fixture()
    try {
      expect(findDocBudgetViolations(root, { 'docs/page.md': 3 }, { version: 1, files: { 'docs/page.md': 3 } })).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects growth above the recorded baseline', () => {
    const root = fixture()
    try {
      expect(findDocBudgetViolations(root, { 'docs/page.md': 4 }, { version: 1, files: { 'docs/page.md': 2 } })).toEqual([
        'docs/page.md: 3 words exceeds the recorded baseline of 2',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects baseline entries absent from the canonical manifest', () => {
    const root = fixture()
    try {
      expect(findDocBudgetViolations(root, { 'docs/page.md': 3 }, { version: 1, files: { 'docs/page.md': 3, 'docs/removed.md': 1 } })).toContain(
        'docs/removed.md: baseline entry is not present in the canonical manifest',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks a missing baseline row as over budget', () => {
    const root = fixture()
    try {
      expect(renderDocBudgetRows(root, { 'docs/page.md': 3 }, { version: 1, files: {} })[0]).toMatch(/^OVER/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
