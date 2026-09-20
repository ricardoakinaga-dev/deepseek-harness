/** Manifest and patch contract for the resilient-compaction profile layer. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('dsh-resilient-compaction bundle', () => {
  it('declares one parseable policy insertion with bounded defaults', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toHaveProperty(
      '@deepseek-ai/dsh-compaction-resilience-policy',
      'workspace:^',
    )
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(parsed).toEqual([{
      insert: [{
        id: 'compaction-resilience-policy',
        name: '@deepseek-ai/dsh-compaction-resilience-policy',
        config: {
          compactionMaxTokens: 4096,
          compactionReasoningEffort: 'off',
          compactionTimeoutMs: 480_000,
          requestPreflight: true,
          requestSafetyMarginTokens: 256,
          requestOutputReserveTokens: 1024,
        },
      }],
    }])
  })
})
