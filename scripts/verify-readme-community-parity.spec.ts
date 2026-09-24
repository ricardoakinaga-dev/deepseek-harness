import { describe, expect, it } from 'vitest'
import { compareCommunityParity, extractCommunityTargets, extractMarkdownSection } from './verify-readme-community-parity.ts'

const english = `# README

## Community and support

- [Discussions](https://example.test/discussions)
- <a href="https://example.test/topic">topic</a>
- <a href="https://example.test/chat">chat</a>

## Contributing
`

const localized = `# README

## 社区与支持

- [讨论](https://example.test/discussions)
- <a href="https://example.test/topic">话题</a>
- <a href="https://example.test/chat">社区</a>

## 参与贡献
`

describe('README community parity', () => {
  it('accepts an exact localized translation of the canonical targets', () => {
    expect(compareCommunityParity(english, localized)).toEqual({
      canonical: ['https://example.test/chat', 'https://example.test/discussions', 'https://example.test/topic'],
      localized: ['https://example.test/chat', 'https://example.test/discussions', 'https://example.test/topic'],
      missing: [],
      extra: [],
    })
  })

  it('reports a missing canonical target', () => {
    const result = compareCommunityParity(english, localized.replace(/example\.test\/chat/gu, 'example.test/removed'))
    expect(result.missing).toEqual(['https://example.test/chat'])
    expect(result.extra).toEqual(['https://example.test/removed'])
  })

  it('reports a locale-only target', () => {
    const withExtra = localized.replace('\n## 参与贡献', '\n- [本地群](https://example.test/local)\n\n## 参与贡献')
    const result = compareCommunityParity(english, withExtra)
    expect(result.missing).toEqual([])
    expect(result.extra).toEqual(['https://example.test/local'])
  })

  it('ends a section at the next level-two heading', () => {
    expect(extractMarkdownSection(english, 'Community and support')).not.toContain('Contributing')
    expect(extractCommunityTargets('plain text')).toEqual([])
  })
})
