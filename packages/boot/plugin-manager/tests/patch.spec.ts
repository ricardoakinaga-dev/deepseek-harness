/** Profile patch edits preserve user-authored syntax and are idempotent. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished } from 'vitest'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, initProfile, loadOptionalPatches, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { writePluginEnabled } from '../src/patch.ts'

const TOOL = { id: 'tool', name: 'package' }

const PRESET = { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard', plugins: [TOOL] } }

/** Create a profile whose patch file holds `text` (none when omitted) and whose one selected bundle inserts `rows`. */
async function fixture(text?: string, rows: object[] = []): Promise<ProfileContext> {
  const home = await mkdtemp(join(tmpdir(), 'manager-patch-'))
  onTestFinished(() => rm(home, { recursive: true, force: true }))
  const dir = join(home, 'profile')
  const installAnchor = join(home, 'package.json')
  await writeFile(installAnchor, '{"name":"installation","dependencies":{}}')
  initProfile(dir, ['bundle'])
  const bundle = join(dir, 'node_modules', 'bundle')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: rows }]))
  const patchPath = join(dir, 'cordis.patch.yml')
  await (text === undefined ? rm(patchPath) : writeFile(patchPath, text))
  return { name: 'test', dir, patchPath, installAnchor, cwd: home, home, startedBundles: ['bundle'], overlays: [], telemetryDisabledEnv: undefined }
}

it('preserves comments, expressions, unrelated configuration and the last override', async () => {
  const profile = await fixture('# personal configuration\n- id: tool\n  config:\n    value: !!js process.platform\n- id: tool\n  disabled: false # availability\n')
  expect(await writePluginEnabled(profile, 'tool', 'package', false)).toBe(true)
  const text = await readFile(profile.patchPath, 'utf8')
  expect(text).toContain('# personal configuration')
  expect(text).toContain('!!js process.platform')
  expect(text).toContain('# availability')
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([
    { id: 'tool', config: { value: { __jsExpr: 'process.platform' } } }, { id: 'tool', disabled: true },
  ])
  expect(await writePluginEnabled(profile, 'tool', 'package', false)).toBe(false)
  expect(await readFile(profile.patchPath, 'utf8')).toBe(text)
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
})

it('creates a missing patch file and appends after insertions', async () => {
  const profile = await fixture()
  await writePluginEnabled(profile, 'tool', 'package', false)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ id: 'tool', disabled: true }])
  await writeFile(profile.patchPath, '- insert:\n    - id: tool\n      name: package\n')
  await writePluginEnabled(profile, 'tool', 'package', false)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([
    { insert: [{ id: 'tool', name: 'package' }] }, { id: 'tool', disabled: true },
  ])
})

it.each(['- id: [broken', 'mapping: true\n'])('refuses malformed documents without overwriting %s', async (text) => {
  const profile = await fixture(text)
  await expect(writePluginEnabled(profile, 'tool', 'package', true)).rejects.toThrow()
  expect(await readFile(profile.patchPath, 'utf8')).toBe(text)
})


it('retains name-asserting overrides and appends an unambiguous switch', async () => {
  const profile = await fixture('- id: tool\n  name: another-package\n  disabled: false\n')
  await writePluginEnabled(profile, 'tool', 'package', false)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([
    { id: 'tool', name: 'another-package', disabled: false }, { id: 'tool', disabled: true },
  ])
  expect(await writePluginEnabled(profile, 'tool', 'package', false)).toBe(false)
})

it('reports read failures without replacing a directory with configuration', async () => {
  const profile = await fixture()
  await mkdir(profile.patchPath)
  await expect(writePluginEnabled(profile, 'tool', 'package', true)).rejects.toThrow()
})

it('updates the last matching named override and leaves mismatched names untouched', async () => {
  const profile = await fixture('- id: tool\n  disabled: true\n- id: tool\n  name: package\n  config:\n    value: !!js process.platform\n  disabled: true # availability\n- id: tool\n  name: another-package\n  disabled: true\n')
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
  const text = await readFile(profile.patchPath, 'utf8')
  expect(text).toContain('!!js process.platform')
  expect(text).toContain('# availability')
  const patches = loadOptionalPatches('test', profile.patchPath)
  expect(patches).toEqual([
    { id: 'tool', disabled: true },
    { id: 'tool', name: 'package', config: { value: { __jsExpr: 'process.platform' } }, disabled: false },
    { id: 'tool', name: 'another-package', disabled: true },
  ])
  expect(applyEntryPatches([{ id: 'tool', name: 'package' }], patches, () => {}))
    .toMatchObject([{ id: 'tool', name: 'package', disabled: false }])
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(false)
  expect(await readFile(profile.patchPath, 'utf8')).toBe(text)
  expect(await writePluginEnabled(profile, 'tool', 'package', false)).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toHaveLength(3)
})

it('removes or omits a plain switch that restates the bundle layers', async () => {
  const profile = await fixture('# personal configuration\n- id: other\n  disabled: true\n- id: tool\n  disabled: true\n', [TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
  expect(await readFile(profile.patchPath, 'utf8')).toBe('# personal configuration\n- id: other\n  disabled: true\n')
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(false)
  expect(await readFile(profile.patchPath, 'utf8')).toBe('# personal configuration\n- id: other\n  disabled: true\n')
  expect(await writePluginEnabled(profile, 'tool', 'package', false)).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ id: 'other', disabled: true }, { id: 'tool', disabled: true }])
})

it('keeps a switch that carries other settings or differs from the bundle layers', async () => {
  const profile = await fixture('- id: tool\n  config: { value: 1 }\n  disabled: true\n', [TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ id: 'tool', config: { value: 1 }, disabled: false }])
  const plain = await fixture('- id: tool\n  disabled: true\n', [{ ...TOOL, disabled: true }])
  expect(await writePluginEnabled(plain, 'tool', 'package', true)).toBe(true)
  expect(loadOptionalPatches('test', plain.patchPath)).toEqual([{ id: 'tool', disabled: false }])
})

it('keeps the comment above a removed switch and prunes a switch the composition already implies', async () => {
  const profile = await fixture('# header\n- id: tool\n  disabled: false\n# other\n- id: other\n  disabled: true\n', [TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
  expect(await readFile(profile.patchPath, 'utf8')).toBe('# header\n# other\n- id: other\n  disabled: true\n')
  const first = await fixture('# header\n- id: tool\n  disabled: true\n- id: other\n  disabled: true\n', [TOOL])
  expect(await writePluginEnabled(first, 'tool', 'package', true)).toBe(true)
  expect(await readFile(first.patchPath, 'utf8')).toBe('# header\n- id: other\n  disabled: true\n')
  const only = await fixture('# header\n- id: tool\n  disabled: true\n', [TOOL])
  expect(await writePluginEnabled(only, 'tool', 'package', true)).toBe(true)
  expect(loadOptionalPatches('test', only.patchPath)).toEqual([])
  expect(await readFile(only.patchPath, 'utf8')).toBe('# header\n[]\n')
  const last = await fixture('- id: other\n  disabled: true\n# about tool\n- id: tool\n  disabled: true\n', [TOOL])
  expect(await writePluginEnabled(last, 'tool', 'package', true)).toBe(true)
  expect(await readFile(last.patchPath, 'utf8')).toBe('- id: other\n  disabled: true\n\n# about tool\n')
  const lastWithTail = await fixture('- id: other\n  disabled: true\n# about tool\n- id: tool\n  disabled: true\n# tail\n', [TOOL])
  expect(await writePluginEnabled(lastWithTail, 'tool', 'package', true)).toBe(true)
  expect(await readFile(lastWithTail.patchPath, 'utf8')).toBe('- id: other\n  disabled: true\n\n# about tool\n# tail\n')
  const trailing = await fixture('- id: tool\n  disabled: true # removed\n# tail\n', [TOOL])
  expect(await writePluginEnabled(trailing, 'tool', 'package', true)).toBe(true)
  expect(loadOptionalPatches('test', trailing.patchPath)).toEqual([])
  expect(await readFile(trailing.patchPath, 'utf8')).toContain('# tail')
  const both = await fixture('# header\n- id: tool\n  disabled: true\n# tail\n', [TOOL])
  expect(await writePluginEnabled(both, 'tool', 'package', true)).toBe(true)
  expect(await readFile(both.patchPath, 'utf8')).toBe('# header\n[]\n\n# tail\n')
})

it('treats insertions in the profile patch as part of the inherited composition', async () => {
  const profile = await fixture('- insert:\n    - id: tool\n      name: package\n')
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(false)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ insert: [{ id: 'tool', name: 'package' }] }])
})

it.each([
  ['a value', '- id: &plugin tool\n  disabled: true\n- id: other\n  config: { target: *plugin }\n', { target: 'tool' }],
  ['the entry', '- &plugin { id: tool, disabled: true }\n- id: other\n  config: { target: *plugin }\n', { target: { id: 'tool', disabled: false } }],
  ['a key', '- id: tool\n  &key disabled: true\n- id: other\n  config: { *key : 1 }\n', { disabled: 1 }],
])('keeps a switch whose anchor on %s other entries reference', async (_, text, config) => {
  const profile = await fixture(text, [TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ id: 'tool', disabled: false }, { id: 'other', config }])
})

it('keeps a switch whose value is an alias', async () => {
  const profile = await fixture('- id: other\n  config: { flag: &flag true }\n- id: tool\n  disabled: *flag\n', [TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', true)).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ id: 'other', config: { flag: true } }, { id: 'tool', disabled: false }])
})

it('persists only the selected preset toggle, preserves YAML syntax and removes a restored default', async () => {
  const original = '# personal settings\n- id: unrelated\n  config: { value: !!js process.platform }\n'
  const profile = await fixture(original, [PRESET, { ...PRESET, id: 'preset-creator', config: { ...PRESET.config, id: 'creator' } }, TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', false, 'standard')).toBe(true)
  expect(await readFile(profile.patchPath, 'utf8')).toContain(original)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([
    { id: 'unrelated', config: { value: { __jsExpr: 'process.platform' } } },
    { preset: 'standard', id: 'tool', name: 'package', disabled: true },
  ])
  expect(await writePluginEnabled(profile, 'tool', 'package', false, 'standard')).toBe(false)
  expect(await writePluginEnabled(profile, 'tool', 'package', false, 'creator')).toBe(true)
  expect(await writePluginEnabled(profile, 'tool', 'package', false)).toBe(true)
  expect(await writePluginEnabled(profile, 'tool', 'package', true, 'standard')).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([
    { id: 'unrelated', config: { value: { __jsExpr: 'process.platform' } } },
    { preset: 'creator', id: 'tool', name: 'package', disabled: true }, { id: 'tool', disabled: true },
  ])
})

it('retains explicit preset toggles over conditional defaults and ignores later home layers when pruning', async () => {
  const profile = await fixture('# toggle\n- preset: standard\n  id: tool\n  disabled: true # choice\n', [
    { ...PRESET, config: { ...PRESET.config, plugins: [{ ...TOOL, disabled: { __jsExpr: 'false' } }] } },
  ])
  expect(await writePluginEnabled(profile, 'tool', 'package', true, 'standard')).toBe(true)
  const saved = await readFile(profile.patchPath, 'utf8')
  expect(saved).toContain('# toggle')
  expect(saved).toContain('# choice')
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ preset: 'standard', id: 'tool', name: 'package', disabled: false }])
  expect(await writePluginEnabled(profile, 'tool', 'package', true, 'standard')).toBe(false)
  const literal = await fixture('# toggle\n- preset: standard\n  id: tool\n  disabled: true\n', [PRESET])
  await writeFile(join(literal.home, 'cordis.patch.yml'), '- preset: standard\n  id: tool\n  disabled: true\n')
  expect(await writePluginEnabled(literal, 'tool', 'package', true, 'standard')).toBe(true)
  expect(await readFile(literal.patchPath, 'utf8')).toBe('# toggle\n[]\n')
})

it('updates the last preset override without replacing a global override or another preset', async () => {
  const profile = await fixture('- id: tool\n  disabled: true\n- preset: standard\n  id: tool\n  disabled: false\n- preset: creator\n  id: tool\n  disabled: true\n- preset: standard\n  id: tool\n  disabled: true # last\n',
    [PRESET, { ...PRESET, id: 'preset-creator', config: { ...PRESET.config, id: 'creator' } }, TOOL])
  expect(await writePluginEnabled(profile, 'tool', 'package', true, 'standard')).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([
    { id: 'tool', disabled: true }, { preset: 'standard', id: 'tool', disabled: false }, { preset: 'creator', id: 'tool', disabled: true },
  ])
  expect(composeEntries([[{ insert: [PRESET] }, { preset: 'standard', id: 'tool', disabled: false }]])[0]?.config)
    .toMatchObject({ plugins: [{ id: 'tool', disabled: false }] })
})

it('adds the module assertion to an existing unnamed preset selector and prunes a matching named selector on reset', async () => {
  const profile = await fixture('# choice\n- preset: standard\n  id: tool\n  disabled: true\n', [PRESET])
  expect(await writePluginEnabled(profile, 'tool', 'package', false, 'standard')).toBe(true)
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ preset: 'standard', id: 'tool', name: 'package', disabled: true }])
  expect(await writePluginEnabled(profile, 'tool', 'package', false, 'standard')).toBe(false)
  expect(await writePluginEnabled(profile, 'tool', 'package', true, 'standard')).toBe(true)
  expect(await readFile(profile.patchPath, 'utf8')).toBe('# choice\n[]\n')
})

it('rejects a stored preset selector when an upstream child keeps its id but changes module', async () => {
  const profile = await fixture(undefined, [PRESET])
  await writePluginEnabled(profile, 'tool', 'package', false, 'standard')
  const saved = await readFile(profile.patchPath, 'utf8')
  expect(loadOptionalPatches('test', profile.patchPath)).toEqual([{ preset: 'standard', id: 'tool', name: 'package', disabled: true }])
  const replacement = { ...PRESET, config: { ...PRESET.config, plugins: [{ ...TOOL, name: 'replacement' }] } }
  await writeFile(join(profile.dir, 'node_modules', 'bundle', 'cordis.patch.yml'), JSON.stringify([{ insert: [replacement] }]))
  expect(() => composeEntries([readProfilePatches('test', profile)])).toThrow('different module name')
  expect(await writePluginEnabled(profile, 'tool', 'package', true, 'standard')).toBe(true)
  expect(() => composeEntries([readProfilePatches('test', profile)])).toThrow('different module name')
  expect(await readFile(profile.patchPath, 'utf8')).toContain('name: package')
  expect(saved).toContain('name: package')
})
