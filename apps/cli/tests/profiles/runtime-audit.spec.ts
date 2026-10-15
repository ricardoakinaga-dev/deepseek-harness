/** Source profile boot publishes execution audits without configuration forms. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { expect, it, onTestFinished } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import type { RuntimeAuditEventData } from '@deepseek-ai/dsh-settings'

interface AuditReport {
  hasSettings: boolean
  hasConfigEditor: boolean
  beforeResume: RuntimeAuditEventData[]
  afterResume: RuntimeAuditEventData[]
}

it('audits a source sdk-minimal launch, native retry update, nested Include and persisted resume', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-source-runtime-audit-'))
  let closeChild = (): Promise<void> => Promise.resolve()
  onTestFinished(async () => {
    try { await closeChild() } finally { await rm(root, { recursive: true, force: true }) }
  })
  const resultPath = join(root, 'result.json')
  const probe = join(root, 'probe.mjs')
  const nested = join(root, 'nested.yml')
  const inert = join(root, 'inert.mjs')
  const patch = join(root, 'audit.patch.json')
  await writeFile(inert, 'export const apply = () => {}\n')
  await writeFile(nested, JSON.stringify([{ id: 'nested-code', name: pathToFileURL(inert).href }]))
  await writeFile(probe, `
import { writeFileSync } from 'node:fs'
export const name = 'runtime-audit-probe'
export const inject = ['appReady', 'appExit', 'agents', 'sessionPersistence', 'llm', 'loader']
export function apply(ctx, config) {
  const sessionId = 'h08-forward-session'
  const readAudits = async () => {
    const reader = await ctx.sessionPersistence.open(sessionId, 'read')
    try { return (await reader.read()).events.filter(event => event.type === 'runtime/audit').map(event => event.data) }
    finally { await reader.close() }
  }
  const run = async () => {
    const first = await ctx.agents.create({ sessionId })
    try {
      await ctx.loader.resolve('include:llm-deepseek').update({ config: { retryPolicy: { mode: 'always' } } })
      await ctx.loader.await()
    } finally { await first.dispose() }
    const beforeResume = await readAudits()
    const resumed = await ctx.agents.resume({ resumeSessionId: sessionId })
    await resumed.dispose()
    const afterResume = await readAudits()
    writeFileSync(config.resultPath, JSON.stringify({
      hasSettings: ctx.get('settings') !== undefined,
      hasConfigEditor: ctx.get('configEditor') !== undefined,
      beforeResume, afterResume,
    }))
    ctx.appExit(0)
  }
  ctx.effect(() => ctx.appReady.onReady(() => {
    void run().catch(error => { console.error(error); ctx.appExit(1) })
  }))
}
`)
  await writeFile(patch, JSON.stringify([
    { id: 'sdk-jsonrpc-server', disabled: true },
    { insert: [
      { id: 'audit-probe', name: pathToFileURL(probe).href, config: { resultPath } },
      { id: 'nested-audit', name: 'cordis:include', config: { path: pathToFileURL(nested).href } },
    ] },
  ]))
  // This case selects source mode to exercise the launcher's source import and observer wiring.
  const launch = resolveExampleLaunch({
    srcBin: fileURLToPath(new URL('../../src/bin.ts', import.meta.url)),
    tsconfigPath: fileURLToPath(new URL('../../../../tsconfig.base.json', import.meta.url)),
    mode: 'src', sourceImport: 'tsx/esm',
    configArgs: ['--profile', 'sdk-minimal', '--patch', patch],
  })
  const scrubbed: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(scrubbed)) {
    if (/KEY|SECRET|TOKEN|PASSWORD/i.test(key)) Reflect.deleteProperty(scrubbed, key)
  }
  const child = execa(launch.command, launch.args, {
    cwd: root, extendEnv: false,
    env: { ...scrubbed, ...launch.env, DSH_HOME: join(root, '.dsh'), DSH_TELEMETRY_DISABLED: '1' },
    stdin: 'pipe', timeout: 45_000, killSignal: 'SIGKILL', reject: false,
  })
  closeChild = async () => { child.kill('SIGKILL'); await child }
  const exit = await child
  expect(exit.timedOut, exit.stderr).toBe(false)
  expect(exit.signal, exit.stderr).toBeUndefined()
  expect(exit.exitCode, exit.stderr).toBe(0)
  const report = JSON.parse(await readFile(resultPath, 'utf8')) as AuditReport
  expect(report.hasSettings).toBe(false)
  expect(report.hasConfigEditor).toBe(false)
  const initial = report.beforeResume[0]
  if (initial?.reason !== 'initial') throw new Error('missing forward execution audit')
  expect(initial.runtime?.launcher.kind).toBe('source')
  expect(initial.runtime?.launcher.sha256Source).toBe('disk-observation')
  expect(initial.runtime?.versionSource).toBe('package-manifest-observation')
  expect(initial.plugins).toContainEqual({ id: 'include:nested-audit:nested-code', plugin: pathToFileURL(inert).href,
    moduleSha256: null, package: null })
  expect(initial.providerRetryPolicies?.find(row => row.provider === 'deepseek-official')?.policy)
    .toMatchObject({ mode: 'normal', maxRetries: 5 })
  expect(report.beforeResume.some(record => record.providerRetryPolicies?.some(row => row.policy.mode === 'always'))).toBe(true)
  expect(report.afterResume.slice(0, report.beforeResume.length)).toEqual(report.beforeResume)
  expect(report.afterResume.filter(record => record.reason === 'initial')).toHaveLength(2)
  expect(report.afterResume.at(-1)).toMatchObject({ reason: 'initial', runtime: initial.runtime })
}, 60_000)
