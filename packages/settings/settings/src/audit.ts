/** Whitelist resolved configuration through owner-declared, secret-free schema fields. */
import { FiberState, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-hmr'
import { assertNever, type JsonValue } from '@deepseek-ai/dsh-util-values'
import type { AuditedConfigurationEntry, AuditedPluginIdentity, AuditedProviderRetryPolicy } from './types.ts'
import { plainConfig } from './schema.ts'

/** Launcher-owned execution audit, independent of configuration forms. */
export const name = 'runtime-audit'
/** The observer reads Loader entries and waits independently for published agents. */
export const inject = ['loader', 'profileContext']

function marked(node: z): boolean {
  const extra: unknown = node.meta.extra
  return typeof extra === 'object' && extra !== null && 'audit' in extra && extra.audit === true
}

function children(node: z): z[] {
  return [...Object.values(node.dict ?? {}), ...(node.inner === undefined ? [] : [node.inner]),
    ...(node.sKey === undefined ? [] : [node.sKey]), ...(node.list ?? [])]
}

function containsSecret(node: z): boolean {
  return node.meta.role === 'secret' || node.meta.role === 'credential-ref' || children(node).some(containsSecret)
}

function containsMark(node: z): boolean {
  return marked(node) || children(node).some(containsMark)
}

function validate(node: z, selected = false): void {
  const audited = selected || marked(node)
  if ((audited && containsSecret(node)) || ((node.meta.role === 'secret' || node.meta.role === 'credential-ref') && containsMark(node))) {
    throw new TypeError('Audited configuration must not contain secret or credential-ref fields')
  }
  if ((audited || containsMark(node)) && (node.type === 'union' || node.type === 'intersect') && containsSecret(node)) {
    throw new TypeError('Audited configuration must not contain secret or credential-ref fields')
  }
  if (node.type === 'dict' && (audited || containsMark(node)) && node.sKey !== undefined && containsSecret(node.sKey)) {
    throw new TypeError('Audited configuration must not contain secret or credential-ref fields')
  }
  if ((audited || containsMark(node)) && !['object', 'dict', 'array', 'union', 'intersect', 'string', 'number', 'boolean', 'const'].includes(node.type)) {
    throw new TypeError(`Audited configuration does not support schema type "${node.type}"`)
  }
  for (const child of children(node)) validate(child, audited)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function project(node: z, value: unknown, inherited = false): JsonValue | undefined {
  const selected = inherited || marked(node)
  if (!selected && !containsMark(node)) return undefined
  if (value === undefined) return undefined
  switch (node.type) {
    case 'object': {
      if (!record(value)) return undefined
      const entries = Object.entries(node.dict as Record<string, z>).flatMap(([key, child]) => {
        const result = project(child, Object.hasOwn(value, key) ? value[key] : undefined, selected)
        return result === undefined ? [] : [[key, result] as const]
      })
      return entries.length || selected ? Object.fromEntries(entries) : undefined
    }
    case 'dict': {
      const inner = node.inner as z
      if (!record(value)) return undefined
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, entry]) => {
        const result = project(inner, entry, selected)
        return result === undefined ? [] : [[key, result] as const]
      }))
    }
    case 'array': {
      const inner = node.inner as z
      if (!Array.isArray(value)) return undefined
      return value.map(entry => project(inner, entry, selected) ?? null)
    }
    case 'union': {
      for (const child of node.list ?? []) {
        try { child(value) } catch (_error) { continue } // Only the accepted alternative owns its fields.
        return project(child, value, selected)
      }
      throw new TypeError('Audited configuration does not match any union alternative')
    }
    case 'intersect': {
      const results = (node.list as z[]).map(child => project(child, value, selected)).filter(entry => entry !== undefined)
      const objects = results.filter((entry): entry is Record<string, JsonValue> => record(entry))
      if (objects.length) return Object.fromEntries(objects.flatMap(value => Object.entries(value)))
      return results[0]
    }
    default:
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value
      if (typeof value === 'number') throw new TypeError('Audited configuration requires finite JSON scalar values')
      return undefined
  }
}

/** Select marked values and reject any mark that could expose a secret, even when unset.
 * @param schema Owner's complete Config schema.
 * @param value Resolved, detached effective configuration.
 * @returns Whitelisted values, or undefined if no marked field has a value.
 * @throws When an audited subtree contains secret roles or an unsupported schema type.
 */
export function auditConfiguration(schema: z, value: unknown): JsonValue | undefined {
  validate(schema)
  return project(schema, value)
}

/** Capture the active Loader composition, including nested Includes.
 * @param ctx Profile context with its Loader.
 * @returns Detached, entry-sorted entries; module and package identities remain null because Loader retains no loaded-byte snapshot.
 */
export function readRuntimePluginIdentities(ctx: Context): AuditedPluginIdentity[] {
  return [...ctx.loader.entries()].flatMap((entry) => {
    if (entry.fiber?.state !== FiberState.ACTIVE) return []
    return [{ id: entry.id, plugin: entry.options.name, moduleSha256: null, package: null }]
  }).sort((a, b) => a.id.localeCompare(b.id))
}

function readConfiguration(ctx: Context): AuditedConfigurationEntry[] {
  return [...ctx.loader.entries()].flatMap((entry) => {
    if (entry.fiber?.state !== FiberState.ACTIVE) return []
    const schema = entry.fiber.runtime?.Config
    if (schema === undefined || !('toJSON' in schema)) return []
    const values = auditConfiguration(schema as z, plainConfig(entry.fiber.config))
    return values === undefined ? [] : [{ id: entry.id, plugin: entry.options.name, values }]
  }).sort((a, b) => a.id.localeCompare(b.id))
}

function readProviderRetryPolicies(ctx: Context): AuditedProviderRetryPolicy[] | null {
  const llm = ctx.get('llm')
  if (llm === undefined) return null
  return llm.listProviders().map(({ id: provider }): AuditedProviderRetryPolicy => {
    const policy = llm.providerRetryPolicy(provider)
    const backoff = { initialDelayMs: policy.initialDelayMs, maxDelayMs: policy.maxDelayMs, jitterRatio: policy.jitterRatio }
    switch (policy.mode) {
      case 'normal': return { provider, policy: { mode: 'normal', maxRetries: policy.maxRetries,
        retryableCodes: [...policy.retryableCodes], ...backoff } }
      case 'always': return { provider, policy: { mode: 'always', ...backoff } }
      default: return assertNever(policy)
    }
  }).sort((a, b) => a.provider.localeCompare(b.provider))
}

/** Observe agent publication, effective provider policies, and settled Loader/HMR changes.
 * @param ctx Launcher-owned context with Loader and profile facts.
 */
export function apply(ctx: Context): void {
  installRuntimeAudit(ctx, () => readConfiguration(ctx), () => readRuntimePluginIdentities(ctx))
}

/** Record published agents' runtime identity and changes in settled active composition.
 * @param ctx Observer context with profile data and optional Session and Agent services.
 * @param read Capture the currently active, resolved audited configuration.
 * @param readPlugins Capture active plugin identities, including plugins without audited fields.
 */
export function installRuntimeAudit(
  ctx: Context, read: () => AuditedConfigurationEntry[], readPlugins: () => AuditedPluginIdentity[] = () => [],
): void {
  ctx.inject(['sessions', 'agents'], (ctx) => {
    const seen = new WeakMap<Session, {
      configuration: AuditedConfigurationEntry[]
      plugins: AuditedPluginIdentity[]
      providerRetryPolicies: AuditedProviderRetryPolicy[] | null
    }>()
    const initialize = (session: Session): void => {
      const configuration = read()
      const plugins = readPlugins()
      const providerRetryPolicies = readProviderRetryPolicies(ctx)
      seen.set(session, { configuration, plugins, providerRetryPolicies })
      try {
        session.append('runtime/audit', {
          reason: 'initial', runtime: ctx.profileContext.runtimeIdentity ?? null,
          profile: ctx.profileContext.name, startedBundles: [...ctx.profileContext.startedBundles],
          configuration, plugins, providerRetryPolicies,
        })
      } catch (error) {
        seen.delete(session)
        throw error
      }
    }
    // Agent publication follows every Session creation-baseline observer and is awaited.
    ctx.on('agent/created', ({ agent }) => { initialize(agent.session) })
    for (const agent of ctx.agents.list()) initialize(agent.session)
    const reload = (moduleReplacement = false): void => {
      const configuration = read()
      const plugins = readPlugins()
      const providerRetryPolicies = readProviderRetryPolicies(ctx)
      for (const session of ctx.sessions.list()) {
        const previous = seen.get(session)
        if (previous === undefined) continue
        const changes = configuration.filter(entry =>
          JSON.stringify(previous.configuration.find(before => before.id === entry.id)) !== JSON.stringify(entry))
        changes.push(...previous.configuration.filter(entry => !configuration.some(current => current.id === entry.id))
          .map(entry => ({ ...entry, values: null })))
        const pluginsChanged = moduleReplacement || JSON.stringify(previous.plugins) !== JSON.stringify(plugins)
        const policiesChanged = JSON.stringify(previous.providerRetryPolicies) !== JSON.stringify(providerRetryPolicies)
        if (!changes.length && !pluginsChanged && !policiesChanged) continue
        seen.set(session, { configuration, plugins, providerRetryPolicies })
        try {
          session.append('runtime/audit', { reason: 'reload', configuration: changes,
            ...(pluginsChanged ? { plugins } : {}), ...(policiesChanged ? { providerRetryPolicies } : {}) })
        } catch (error) {
          seen.set(session, previous)
          throw error
        }
      }
    }
    ctx.on('app-boot/config-reload', () => { reload() })
    ctx.on('app-boot/config-settled', () => { reload() })
    ctx.on('hmr/config-settled', () => { reload() })
    ctx.on('hmr/reload', (reloads) => { reload(reloads.size > 0) })
    ctx.on('llm/adapters-updated', () => { reload() })
  })
}
