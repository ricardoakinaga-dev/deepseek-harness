import { describe, expect, it } from 'vitest'
import { findReadmeOrderViolations, normalizePackageReadme } from './verify-package-readme-order.ts'

describe('package README order', () => {
  it('accepts an invariant before the development note', () => {
    expect(normalizePackageReadme('Implementation.\n\n**Runtime invariant:** Stable.\n\n<a id="dev-note"></a>\n### Dev Note\n', false))
      .toContain('Runtime invariant')
  })

  it('moves an English invariant before the development note', () => {
    const source = 'Implementation.\n\n<a id="dev-note"></a>\n### Dev Note\n\n<details>\nNone.\n</details>\n\n**Runtime invariant:** Stable.\n'
    const normalized = normalizePackageReadme(source, false)
    expect(normalized.indexOf('Runtime invariant')).toBeLessThan(normalized.indexOf('<a id="dev-note">'))
    expect(normalized).not.toContain('</details>\n\n\n')
  })

  it('moves a Chinese invariant before the development note', () => {
    const source = '实现。\n\n<a id="dev-note"></a>\n### 开发备注\n\n无。\n\n**运行时不变式：** 稳定。\n'
    const normalized = normalizePackageReadme(source, true)
    expect(normalized.indexOf('运行时不变式')).toBeLessThan(normalized.indexOf('<a id="dev-note">'))
  })

  it('reports duplicate invariants and missing development notes', () => {
    expect(findReadmeOrderViolations('README.md', '**Runtime invariant:** one\n**Runtime invariant:** two\n'))
      .toEqual([{ file: 'README.md', rule: 'duplicate-runtime-invariant' }])
    expect(findReadmeOrderViolations('README.md', '**Runtime invariant:** one\n'))
      .toEqual([{ file: 'README.md', rule: 'missing-dev-note' }])
    expect(findReadmeOrderViolations('README.md', '**Runtime invariant:** one\n<a id="dev-note"></a>\n'))
      .toEqual([])
  })
})
