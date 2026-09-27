/**
 * Vite transforms that carry V8 coverage ignore hints through esbuild, which drops ordinary
 * comments but keeps legal `/*!` comments. Upstream sources keep the ordinary spelling, so the
 * `pre` transform promotes every hint to the legal spelling before esbuild and the `post`
 * transform restores the parser spelling before coverage remapping. The spellings are assembled
 * through a call because the same transforms rewrite this module when Vite loads it.
 */

/** One Vite plugin with a synchronous code transform. */
export interface CoverageIgnoreHintPlugin {
  /** Vite plugin name. */
  name: string
  /** Position relative to Vite's own esbuild transform. */
  enforce: 'pre' | 'post'
  /**
   * Rewrite one module.
   * @param code Module source after the previous transforms.
   * @returns The rewritten source, or `undefined` when the module carries no hint.
   */
  transform(code: string): string | undefined
}

/**
 * Spell one V8 ignore hint opener.
 * @param open Comment opener, such as `/*` or `/*!`.
 * @returns The opener followed by the hint keyword.
 */
function hint(open: string): string {
  return `${open} v8 ignore`
}

const ORDINARY = hint('/*')
const LEGAL = hint('/*!')
const PARSER = hint('/* ')

/**
 * Promote ordinary hints to the legal-comment spelling esbuild preserves.
 * @param code Module source before esbuild.
 * @returns The promoted source, or `undefined` when no ordinary hint is present.
 */
export function promoteCoverageIgnoreHints(code: string): string | undefined {
  return code.includes(ORDINARY) ? code.replaceAll(ORDINARY, LEGAL) : undefined
}

/**
 * Restore the parser spelling of every preserved hint after esbuild.
 * @param code Module source after esbuild.
 * @returns The restored source, or `undefined` when no legal hint is present.
 */
export function restoreCoverageIgnoreHints(code: string): string | undefined {
  return code.includes(LEGAL) ? code.replaceAll(LEGAL, PARSER) : undefined
}

/** Runs before esbuild so ordinary and legal hints both survive the transform. */
export const coverageIgnorePromotePlugin: CoverageIgnoreHintPlugin = {
  name: 'dsh-coverage-ignore-promote',
  enforce: 'pre',
  transform: promoteCoverageIgnoreHints,
}

/** Runs after esbuild so V8 sees the parser spelling during coverage remapping. */
export const coverageIgnoreRestorePlugin: CoverageIgnoreHintPlugin = {
  name: 'dsh-coverage-ignore-comments',
  enforce: 'post',
  transform: restoreCoverageIgnoreHints,
}
