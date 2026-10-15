/** Delegation-time sandbox resolution and intersected tool permissions. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ConfinedSandboxMode, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { scopeParentOf } from '@deepseek-ai/dsh-scope'
import { RUN_CODE_NAME, type ToolRestriction } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-shell'
import { SubagentError } from './error.ts'

import type { SubagentAuthorityData } from './authority-types.ts'
export type { SubagentAuthorityData } from './authority-types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Authority observed from a published local child, recorded in its direct parent's log.
     * @param data - Child identity and effective authority at publication; null fields are unconfirmed.
     */
    'subagent/authority': SubagentAuthorityData
  }
}

/**
 * Record effective authority from a composed local child, independently of request arguments.
 * Observed tool names are sorted independently of registration order.
 * @param parent - Direct parent whose durable log owns the observation.
 * @param child - Published local child with its policy and tool restrictions installed.
 */
export function appendSubagentAuthority(parent: Agent, child: Agent): void {
  const effective = child.ctx.get('sandboxPolicy')?.resolve({ session: child.session }).mode
  const unconfined = (['shell', 'fs'] as const).some((name) => {
    const provider = child.ctx.get(name)
    return provider !== undefined && provider.sandboxMode === undefined
  })
  parent.session.append('subagent/authority', {
    version: 0,
    childId: child.id,
    sandboxMode: effective === undefined || (effective !== 'danger-full-access' && unconfined) ? null : effective,
    approvalPolicy: child.ctx.get('approval')?.overrideOf(child.session) ?? null,
    toolFilter: { allow: child.ctx.tools.schemas(child).map(tool => tool.name).sort() },
  })
}

/**
 * Intersect tool restrictions without replacing either caller's deny list.
 * @param filters - Restrictions whose permissions must all hold.
 * @returns A detached restriction, or undefined when none were supplied.
 */
export function intersectToolFilters(...filters: readonly (ToolRestriction | undefined)[]): ToolRestriction | undefined {
  let allow: string[] | undefined
  const deny = new Set<string>()
  let supplied = false
  for (const filter of filters) {
    if (filter === undefined) continue
    if (filter.allow === undefined && filter.deny === undefined) {
      throw new SubagentError('toolFilter must declare allow and/or deny', 'INVALID_TOOL_FILTER')
    }
    supplied = true
    if (filter.allow !== undefined) {
      const admitted = new Set(filter.allow)
      allow = allow === undefined ? [...admitted] : allow.filter(name => admitted.has(name))
    }
    for (const name of filter.deny ?? []) deny.add(name)
  }
  return supplied ? {
    ...allow === undefined ? {} : { allow },
    ...deny.size === 0 ? {} : { deny: [...deny] },
    ...allow === undefined && deny.size === 0 ? { deny: [] } : {},
  } : undefined
}

/**
 * Capture the parent's effective file mode and validate an explicit narrowing request.
 * @param parent - Live delegating Agent whose policy and executors apply to the child.
 * @param requested - Optional confined mode; omission inherits the effective parent mode.
 * @returns The delegated mode, or undefined in a composition without sandbox policy.
 */
export function resolveDelegatedSandboxMode(parent: Agent, requested?: ConfinedSandboxMode): SandboxMode | undefined {
  const policy = parent.ctx.get('sandboxPolicy')
  const effective = policy?.resolve({ session: parent.session }).mode
  if (requested === undefined) return effective
  if (effective === undefined) {
    throw new SubagentError('sandboxMode requires the sandbox policy service', 'UNSUPPORTED_CAPABILITY')
  }
  if (effective === 'read-only' && requested === 'workspace-write') {
    throw new SubagentError('sandboxMode cannot widen the effective parent file policy', 'AUTHORITY_AMPLIFICATION')
  }
  for (const name of ['shell', 'fs'] as const) {
    const provider = parent.ctx.get(name)
    if (provider !== undefined && provider.sandboxMode === undefined) {
      throw new SubagentError(`sandboxMode requires a confined ${name} provider`, 'UNSUPPORTED_CAPABILITY')
    }
  }
  return requested
}

/**
 * Snapshot the parent's admitted inherited tools for an independently scoped child.
 * Child-owned response infrastructure is installed separately and remains available.
 * Captured allow and deny names are sorted independently of tool registration order.
 * @param parent - Live delegating Agent whose visible inherited tools bound the child.
 * @param requested - Additional child restriction, validated against inherited tool names.
 * @param independentPreset - whether an explicitly selected preset grants its own tool set.
 * @returns The inherited snapshot, or parent denials for an independently selected preset, intersected with the request.
 */
export function resolveDelegatedToolFilter(
  parent: Agent,
  requested?: ToolRestriction,
  independentPreset = false,
): ToolRestriction {
  const tools = parent.ctx.tools
  const inherited = tools.schemas(scopeParentOf(parent)).map(tool => tool.name).filter(name => name !== RUN_CODE_NAME)
  const available = new Set(inherited)
  if (requested !== undefined) {
    for (const name of [...requested.allow ?? [], ...requested.deny ?? []]) {
      if (!available.has(name)) throw new SubagentError(`toolFilter names unknown inherited tool "${name}"`, 'INVALID_TOOL_FILTER')
    }
  }
  const visible = new Set(tools.schemas(parent).map(tool => tool.name))
  const ceiling = independentPreset
    ? { deny: inherited.filter(name => !visible.has(name)) }
    : { allow: inherited.filter(name => visible.has(name)) }
  const resolved = intersectToolFilters(ceiling, requested) as ToolRestriction
  return {
    ...resolved.allow === undefined ? {} : { allow: [...resolved.allow].sort() },
    ...resolved.deny === undefined ? {} : { deny: [...resolved.deny].sort() },
  }
}
