import { describe, expect, it } from 'vitest'
import {
  coverageIgnorePromotePlugin, coverageIgnoreRestorePlugin, promoteCoverageIgnoreHints, restoreCoverageIgnoreHints,
} from './coverage-ignore-comments.ts'

// The transforms under test rewrite this spec too, and esbuild folds literal concatenations, so
// every spelling is assembled through a call the pipeline cannot rewrite ahead of the assertions.
function hint(open: string): string {
  return `${open} v8 ignore`
}
const ordinary = hint('/*')
const legal = hint('/*!')
const parser = hint('/* ')

const source = [
  'export function f(x: number): number {',
  `  ${ordinary} next -- ordinary upstream spelling */`,
  '  if (x === 1) return 1',
  `  ${legal} next -- legal fork spelling */`,
  '  if (x === 2) return 2',
  '  return 0',
  '}',
].join('\n')

describe('coverage ignore hints', () => {
  it('promotes ordinary hints to legal comments and leaves legal ones single-marked', () => {
    const promoted = promoteCoverageIgnoreHints(source)
    expect(promoted).toContain(`${legal} next -- ordinary upstream spelling */`)
    expect(promoted).toContain(`${legal} next -- legal fork spelling */`)
    expect(promoted).not.toContain('/*!!')
    expect(promoted).not.toContain(ordinary)
  })

  it('restores the parser spelling after esbuild', () => {
    expect(restoreCoverageIgnoreHints(`${legal} next -- reason */\nthrow new Error()`))
      .toBe(`${parser} next -- reason */\nthrow new Error()`)
  })

  it('leaves code without hints untouched so Vite skips a no-op transform', () => {
    expect(promoteCoverageIgnoreHints('const a = 1')).toBeUndefined()
    expect(restoreCoverageIgnoreHints('const a = 1')).toBeUndefined()
  })

  it('orders the promotion before and the restoration after esbuild', () => {
    expect(coverageIgnorePromotePlugin.enforce).toBe('pre')
    expect(coverageIgnorePromotePlugin.transform(source)).toBe(promoteCoverageIgnoreHints(source))
    expect(coverageIgnoreRestorePlugin.enforce).toBe('post')
    expect(coverageIgnoreRestorePlugin.transform(source)).toBe(restoreCoverageIgnoreHints(source))
  })
})
