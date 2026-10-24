/** Shared schema aliases must retain the catalog's declared-field checks. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectConfigCatalog, render, type CatalogEntry } from './gen-config-catalog.ts'
import { computeTranslationPairingRecord, translationPairPaths } from './translation-pairing-record.ts'
import { generatedRegions } from './translation-pairing.ts'

const roots: string[] = []
const sharedSchema = `
import Schema from '@deepseek-ai/schemastery'
export interface LaunchConfig {
  /** Browser ownership mode. */
  mode: 'launch'
  /** Hide the launched browser. */
  headless: boolean
}
export interface AttachConfig {
  /** Browser ownership mode. */
  mode: 'attach'
  /** Existing browser address. */
  endpoint: string
}
export type BrowserConfig = LaunchConfig | AttachConfig
export const Shared = Schema.union([
  Schema.object({ mode: Schema.const('launch'), headless: Schema.boolean() }),
  Schema.object({ mode: Schema.const('attach'), endpoint: Schema.string() }),
])
`

function fixture(schema = sharedSchema) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-config-catalog-'))
  roots.push(root)
  const write = (path: string, value: string): void => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, value)
  }
  write('tsconfig.json', JSON.stringify({ compilerOptions: {
    baseUrl: '.', module: 'ESNext', moduleResolution: 'Bundler',
    paths: { '@test/runtime/config': ['./packages/test/runtime/src/config.ts'] },
  }, include: ['packages/**/*.ts'] }))
  write('packages/test/runtime/package.json', JSON.stringify({
    name: '@test/runtime', exports: { './config': { types: './lib/types/config.d.ts', default: './lib/config.js' } },
  }))
  write('packages/test/runtime/src/index.ts', "export { Shared } from './config.ts'\n")
  write('packages/test/runtime/src/config.ts', schema)
  write('packages/test/provider/package.json', JSON.stringify({ name: '@test/provider' }))
  write('packages/test/provider/src/index.ts', `
import { Shared as SharedConfig, type BrowserConfig } from '@test/runtime/config'
export type Config = BrowserConfig
export const Config = SharedConfig
export function apply(ctx: unknown, config: Config): void {}
`)
  return { root, write }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('shared config schema catalog', () => {
  it('collects every branch through a renamed named import from a public source subpath', () => {
    const { root } = fixture()
    const provider = collectConfigCatalog(root).find(entry => entry.pkg === '@test/provider')
    expect(new Set(provider?.schemaKeys)).toEqual(new Set(['mode', 'headless', 'endpoint']))
    expect(provider?.configTypeName).toBe('Config')
    expect(provider?.pastes?.[0]?.text).toBe('export type Config = BrowserConfig')
  })

  it.each([false, true])('checks package-local schema imports and undeclared fields (invalid=%s)', (invalid) => {
    const { root, write } = fixture()
    write('packages/test/provider/src/config.ts', invalid
      ? sharedSchema.replace('headless: Schema.boolean()', 'headless: Schema.boolean(), hidden: Schema.string()')
      : sharedSchema)
    write('packages/test/provider/src/index.ts', `
import { Shared, type BrowserConfig } from './config.ts'
export type Config = BrowserConfig
export const Config = Shared
export function apply(ctx: unknown, config: Config): void {}
`)
    if (invalid) expect(() => collectConfigCatalog(root)).toThrow("schema validates key 'hidden'")
    else expect(new Set(collectConfigCatalog(root).find(entry => entry.pkg === '@test/provider')?.schemaKeys))
      .toEqual(new Set(['mode', 'headless', 'endpoint']))
  })

  it('rejects a schema field absent from the shared config type', () => {
    const { root } = fixture(sharedSchema.replace('headless: Schema.boolean()', 'headless: Schema.boolean(), hidden: Schema.string()'))
    expect(() => collectConfigCatalog(root)).toThrow("schema validates key 'hidden' but config type 'Config' declares no such member")
  })

  it('follows a local const alias without treating a completed branch as a cycle', () => {
    const { root } = fixture(sharedSchema.replace('export const Shared = Schema.union', 'export const Shared = Base\nconst Base = Schema.union'))
    const provider = collectConfigCatalog(root).find(entry => entry.pkg === '@test/provider')
    expect(new Set(provider?.schemaKeys)).toEqual(new Set(['mode', 'headless', 'endpoint']))
  })

  it.each([false, true])('checks a class Config imported from a sibling module (invalid field: %s)', (invalid) => {
    const { root, write } = fixture()
    write('packages/test/provider/src/config.ts', `
import Schema from '@deepseek-ai/schemastery'
export interface Config {
  /** Maximum result count. */
  limit: number
}
export const Config = Schema.object({ ${invalid ? 'hidden' : 'limit'}: Schema.number() })
`)
    write('packages/test/provider/src/index.ts', `
import { Config } from './config.ts'
export default class Provider {
  static Config = Config
  constructor(ctx: unknown, config: Config) {}
}
`)
    if (invalid) {
      expect(() => collectConfigCatalog(root)).toThrow("schema validates key 'hidden' but config type 'Config' declares no such member")
    } else {
      const provider = collectConfigCatalog(root).find(entry => entry.pkg === '@test/provider')
      expect(provider?.schemaKeys).toEqual(['limit'])
    }
  })

  it('rejects type-only imports used as runtime schemas', () => {
    const { root, write } = fixture()
    write('packages/test/provider/src/index.ts', `
import type { Shared as SharedConfig, BrowserConfig } from '@test/runtime/config'
export type Config = BrowserConfig
export const Config = SharedConfig
export function apply(ctx: unknown, config: Config): void {}
`)
    expect(() => collectConfigCatalog(root)).toThrow("schema alias 'SharedConfig' must name a const or named value import")
  })

  it('rejects a private subpath even when TypeScript can resolve its source', () => {
    const { root, write } = fixture()
    write('packages/test/runtime/package.json', JSON.stringify({ name: '@test/runtime', exports: {} }))
    expect(() => collectConfigCatalog(root)).toThrow("does not explicitly export './config'")
  })

  it('rejects a missing source mapping', () => {
    const { root, write } = fixture()
    write('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@test/runtime/config': ['./missing.ts'] } } }))
    expect(() => collectConfigCatalog(root)).toThrow('has no workspace source mapping')
  })

  it('rejects a source mapping into another package', () => {
    const { root, write } = fixture()
    write('tsconfig.json', JSON.stringify({ compilerOptions: {
      baseUrl: '.', paths: { '@test/runtime/config': ['./packages/test/provider/src/index.ts'] },
    } }))
    expect(() => collectConfigCatalog(root)).toThrow('must resolve inside packages/test/runtime/src')
  })

  it('rejects a schema value that the imported module does not export', () => {
    const { root } = fixture(sharedSchema.replace('export const Shared', 'const Shared'))
    expect(() => collectConfigCatalog(root)).toThrow("has no exported const 'Shared'")
  })

  it('rejects recursive const aliases', () => {
    const { root } = fixture(`${sharedSchema.slice(0, sharedSchema.indexOf('export const Shared'))}
export const Shared = Loop
const Loop = Shared
`)
    expect(() => collectConfigCatalog(root)).toThrow('cyclic schema alias')
  })

  it('rejects a dynamic schema factory instead of dropping its keys', () => {
    const { root } = fixture(`${sharedSchema.slice(0, sharedSchema.indexOf('export const Shared'))}
export const Shared = makeSchema()
`)
    expect(() => collectConfigCatalog(root)).toThrow('not a statically walkable schemastery call')
  })

  it('rejects an unresolved alias within a schema union', () => {
    const { root } = fixture(`${sharedSchema.slice(0, sharedSchema.indexOf('export const Shared'))}
export const Shared = Schema.union([MissingSchema])
`)
    expect(() => collectConfigCatalog(root)).toThrow("schema alias 'MissingSchema' must name a const or named value import")
  })
})

function auditFixture(value: string, declarations = '', imports = '') {
  const result = fixture()
  result.write('packages/test/provider/src/index.ts', `
import z from '@deepseek-ai/schemastery'
${imports}
${declarations}
export interface Config {
  /** Audited fixture value. */
  value: unknown
  /** Unrelated dynamic schema remains outside the audit. */
  other: unknown
}
export const Config = z.object({ value: ${value}, other: dynamicSchema() })
export function apply(ctx: unknown, config: Config): void {}
`)
  return result
}

const audit = ".extra('extra', { audit: true })"

describe('audited config schema gate', () => {
  it.each(['secret', 'credential-ref'])('rejects %s on marked leaves, descendants and ancestors', (role) => {
    const secret = `z.string().role('${role}')`
    const examples = [
      `${secret}${audit}`, `z.object({ token: ${secret} })${audit}`,
      `z.array(${secret})${audit}`, `z.dict(${secret})${audit}`,
      `z.union([z.string(), ${secret}])${audit}`,
      `z.object({ visible: z.string()${audit} }).role('${role}')`,
      `z.string()${audit}.extra('role', '${role}')`,
      `z.union([z.object({ value: z.string()${audit} }), z.object({ value: ${secret} })])`,
    ]
    for (const example of examples) {
      const { root } = auditFixture(example)
      expect(() => collectConfigCatalog(root), example).toThrow('audited schema contains a secret or credential-ref role')
    }
  })

  it('allows selected dictionary/array descendants with unmarked secret siblings', () => {
    const { root } = auditFixture(`z.dict(z.array(z.object({ limit: z.number()${audit}, token: z.string().role('secret') })))`)
    expect(() => collectConfigCatalog(root)).not.toThrow()
  })

  it('follows local aliases and shared mutation when two fields reuse one schema', () => {
    const { root } = auditFixture(`z.object({ marked: Shared${audit}, secret: Shared.role('secret') })`, 'const Shared = z.string()')
    expect(() => collectConfigCatalog(root)).toThrow('audited schema contains a secret or credential-ref role')
    const safe = auditFixture(`z.object({ first: Shared${audit}, second: Shared })`, 'const Shared = z.number()')
    expect(() => collectConfigCatalog(safe.root)).not.toThrow()
  })

  it('follows renamed imports, relative imports and source re-exports', () => {
    const { root, write } = auditFixture(`Imported${audit}`, '', "import { Shared as Imported } from '@test/runtime/config'")
    write('packages/test/runtime/src/config.ts', "export { Hidden as Shared } from './shared.ts'\n")
    write('packages/test/runtime/src/shared.ts', "import z from '@deepseek-ai/schemastery'\nexport const Hidden = z.object({ token: z.string().role('credential-ref') })\n")
    expect(() => collectConfigCatalog(root)).toThrow('audited schema contains a secret or credential-ref role')
    write('packages/test/runtime/src/config.ts', "import { Hidden } from './shared.ts'\nexport const Shared = Hidden\n")
    expect(() => collectConfigCatalog(root)).toThrow('audited schema contains a secret or credential-ref role')
    write('packages/test/runtime/src/config.ts', "export * from './shared.ts'\n")
    write('packages/test/runtime/src/shared.ts', "import z from '@deepseek-ai/schemastery'\nexport const Shared = z.number()\n")
    expect(() => collectConfigCatalog(root)).not.toThrow()
  })

  it('checks namespace imports and Config re-exported by a plugin entry', () => {
    const { root, write } = auditFixture(`Runtime.Shared${audit}`, '', "import * as Runtime from '@test/runtime/config'")
    write('packages/test/runtime/src/config.ts', "import z from '@deepseek-ai/schemastery'\nexport const Shared = z.string().role('secret')\n")
    expect(() => collectConfigCatalog(root)).toThrow('audited schema contains a secret or credential-ref role')
    write('packages/test/provider/src/config.ts', `
import z from '@deepseek-ai/schemastery'
export interface Config { /** Token. */ token: string }
export const Config = z.object({ token: z.string().role('secret')${audit} })
`)
    write('packages/test/provider/src/index.ts', `
import { Config } from './config.ts'
export { Config } from './config.ts'
export function apply(ctx: unknown, config: Config): void {}
`)
    expect(() => collectConfigCatalog(root)).toThrow('audited schema contains a secret or credential-ref role')
  })

  it.each([
    `dynamicSchema()${audit}`, `z.object({ ...dynamicFields })${audit}`,
    `MissingSchema${audit}`, `z.any()${audit}`, `z.string().role(dynamicRole)${audit}`,
    "z.string().extra('extra', { audit: enabled })", "z.string().extra('extra', metadata)",
    "z.string().extra('extra', { ...metadata, audit: true })",
    `z.array(dynamicSchema())${audit}`, `dynamicWrapper(z.string()${audit})`,
  ])('rejects unresolved audited parts: %s', (value) => {
    const { root } = auditFixture(value)
    expect(() => collectConfigCatalog(root)).toThrow('audited schema cannot be resolved statically')
  })

  it('rejects cyclic aliases in an audited subtree without rejecting unrelated dynamic fields', () => {
    const { root } = auditFixture(`First${audit}`, 'const First = Second\nconst Second = First')
    expect(() => collectConfigCatalog(root)).toThrow('cyclic schema alias')
    const unmarked = auditFixture("z.object({ untouched: dynamicSchema(), secret: z.string().role('secret') })")
    expect(() => collectConfigCatalog(unmarked.root)).not.toThrow()
  })

  it.each([
    [`z.string().extra(key, 'secret')${audit}`, "const key = 'role'"],
    [`z.string()${audit}.extra(key, 'credential-ref')`, "const key = 'role'"],
    ['z.string().extra(key, { audit: true })', "const key = 'extra'"],
    [`z.object({ marked: Shared${audit}, other: Shared.extra(key, 'secret') })`,
      "const Shared = z.string(); const key = 'role'"],
    ['z.string().extra(...metadata)', ''],
    ['z.string().extra()', ''],
  ])('rejects unresolved metadata keys: %s', (value, declarations) => {
    const { root } = auditFixture(value, declarations)
    expect(() => collectConfigCatalog(root)).toThrow('schema metadata key must be a literal string')
  })

  it('keeps literal non-audit metadata outside the audit selection', () => {
    const { root } = auditFixture("z.string().role('secret').extra('description', dynamicDescription)")
    expect(() => collectConfigCatalog(root)).not.toThrow()
  })
})

describe('config catalog rendering', () => {
  const entries = (inject: string[]): CatalogEntry[] => [
    {
      pkg: '@deepseek-ai/dsh-demo',
      dir: 'packages/demo/demo',
      entry: 'packages/demo/demo/src/index.ts',
      kind: 'config',
      inject,
      pastes: [{ text: 'export interface DemoConfig {}', source: 'packages/demo/demo/src/index.ts:3' }],
    },
    { pkg: '@deepseek-ai/dsh-plain', dir: 'packages/demo/plain', entry: 'packages/demo/plain/src/index.ts', kind: 'no-config', inject },
  ]
  const paths = translationPairPaths('docs/config-catalog.md')
  const record = (inject: string[]) => computeTranslationPairingRecord(
    paths,
    render(entries(inject), 'en'),
    render(entries(inject), 'zh'),
    { repoRoot: process.cwd(), isTranslationPairSource: () => false },
  )

  it('keeps package data in generated regions shared by both languages', () => {
    const en = generatedRegions(render(entries(['jobs']), 'en')).map(region => region.text)
    expect(en.map(region => region.split('\n')[0])).toEqual([
      '<!-- BEGIN GENERATED config-catalog:@deepseek-ai/dsh-demo -->',
      '<!-- BEGIN GENERATED config-catalog:no-config -->',
      '<!-- BEGIN GENERATED config-catalog:seam -->',
      '<!-- BEGIN GENERATED config-catalog:library -->',
    ])
    expect(generatedRegions(render(entries(['jobs']), 'zh')).map(region => region.text)).toEqual(en)
    expect(en[0]).toContain('- `inject`: `jobs`')
  })

  it('leaves the consistency record unchanged when only package data changes', () => {
    expect(record(['jobs', 'typert'])).toEqual(record(['jobs']))
    expect([...record(['jobs']).keys()].some(key => key.includes('dsh-demo'))).toBe(false)
  })
})
