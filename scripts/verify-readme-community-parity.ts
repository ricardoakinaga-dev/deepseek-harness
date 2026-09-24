/** Verify that the Chinese README uses the English community-channel targets. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const ENGLISH_SECTION = 'Community and support'
const LOCALIZED_SECTION = '社区与支持'

/** The result of comparing the canonical and localized channel targets. */
export interface CommunityParityResult {
  /** URLs found in the English canonical section. */
  canonical: string[]
  /** URLs found in the Chinese localized section. */
  localized: string[]
  /** Canonical URLs absent from the localized section. */
  missing: string[]
  /** Localized URLs absent from the canonical section. */
  extra: string[]
}

/**
 * Extract one level-two Markdown section without including the next level-two section.
 * @param source - Markdown document text.
 * @param heading - Exact level-two heading text without the `##` prefix.
 * @returns Section body, or an empty string when the heading is absent.
 */
export function extractMarkdownSection(source: string, heading: string): string {
  const lines = source.split('\n')
  const headingIndex = lines.findIndex(line => line.trimEnd() === `## ${heading}`)
  if (headingIndex < 0) return ''
  const endIndex = lines.slice(headingIndex + 1).findIndex(line => /^##\s+/.test(line))
  const end = endIndex < 0 ? lines.length : headingIndex + 1 + endIndex
  return lines.slice(headingIndex + 1, end).join('\n')
}

/**
 * Extract absolute HTTP(S) link targets from Markdown and inline HTML.
 * @param section - Section body to inspect.
 * @returns Sorted unique targets.
 */
export function extractCommunityTargets(section: string): string[] {
  const targets = new Set<string>()
  const markdownPattern = /\]\((https?:\/\/[^)\s]+)\)/gu
  const htmlPattern = /\bhref=["'](https?:\/\/[^"']+)["']/gu
  for (const match of section.matchAll(markdownPattern)) {
    const target = match[1]
    if (target !== undefined) targets.add(target)
  }
  for (const match of section.matchAll(htmlPattern)) {
    const target = match[1]
    if (target !== undefined) targets.add(target)
  }
  return [...targets].sort()
}

/**
 * Compare the English community section with its Chinese counterpart.
 * @param englishSource - English README text, which owns the target set.
 * @param localizedSource - Chinese README text to validate.
 * @returns Canonical, localized, missing, and extra target lists.
 */
export function compareCommunityParity(englishSource: string, localizedSource: string): CommunityParityResult {
  const canonical = extractCommunityTargets(extractMarkdownSection(englishSource, ENGLISH_SECTION))
  const localized = extractCommunityTargets(extractMarkdownSection(localizedSource, LOCALIZED_SECTION))
  return {
    canonical,
    localized,
    missing: canonical.filter(target => !localized.includes(target)),
    extra: localized.filter(target => !canonical.includes(target)),
  }
}

function main(): void {
  const result = compareCommunityParity(
    readFileSync(resolve(root, 'README.md'), 'utf8'),
    readFileSync(resolve(root, 'README.zh.md'), 'utf8'),
  )
  if (result.canonical.length === 0) throw new Error('English README community section has no HTTP(S) targets.')
  if (result.missing.length > 0 || result.extra.length > 0) {
    const details = [
      result.missing.length > 0 ? `missing from README.zh.md: ${result.missing.join(', ')}` : '',
      result.extra.length > 0 ? `extra in README.zh.md: ${result.extra.join(', ')}` : '',
    ].filter(Boolean).join('; ')
    throw new Error(`community-channel parity failed (${details}).`)
  }
  console.log(`verify-readme-community-parity: PASS (${result.canonical.length} canonical target(s), exact localized match).`)
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  try {
    main()
  } catch (error) {
    console.error(`verify-readme-community-parity: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
