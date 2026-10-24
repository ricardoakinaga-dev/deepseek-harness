/** Delegated authority is enforced by the child registry and filesystem provider. */
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import SandboxedFileSystem from '@deepseek-ai/dsh-fs-sandbox'
import SandboxPolicyService, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { SessionId } from '@deepseek-ai/dsh-session'
import { intersectToolFilters, resolveDelegatedToolFilter } from '@deepseek-ai/dsh-subagent'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import SubagentRuntime from '../src/index.ts'
import { mountLocalActivations, startPreparedActivation } from './local-activation.ts'

type Script = ConstructorParameters<typeof MockAdapter>[0]
const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function setup(mode: 'read-only' | 'workspace-write' | 'danger-full-access' | undefined, script: Script = [textResponse('done')]) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-delegation-authority-')))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await mountLocalActivations(ctx)
  await ctx.plugin(SubagentRuntime)
  if (mode !== undefined) {
    await ctx.plugin(SandboxPolicyService, { mode, workspaceRoot: root })
    await ctx.plugin(SandboxedFileSystem, { cwd: root })
    await ctx.plugin(ToolFs)
  }
  await ctx.plugin(ApprovalService)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], new MockAdapter(script))
  const parent = await ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' }, { cwd: root })
  return { ctx, parent, root }
}

function request(parent: Agent) {
  return {
    parent,
    signal: new AbortController().signal,
    prompt: [{ type: 'text' as const, text: 'child' }],
  }
}

describe('delegation authority', () => {
  it.each(['read-only', 'workspace-write', 'danger-full-access'] as const)(
    'narrows a deployment default of %s to read-only and denies file mutations', async (mode) => {
      const script: Script = []
      const { ctx, parent, root } = await setup(mode, script)
      const target = join(root, 'denied.txt')
      script.push(toolCallResponse('write', 'write', { file_path: target, content: 'denied' }), textResponse('done'))
      const run = await startPreparedActivation({ ...request(parent), sandboxMode: 'read-only' }, {})
      const child = run.localAgent
      expect(ctx.sandboxPolicy.resolve({ session: child.session }).mode).toBe('read-only')
      expect(ctx.approval.overrideOf(child.session)).toBe('never')
      await run.result
      expect(child.session.snapshotEvents()).toContainEqual(expect.objectContaining({
        type: 'sandbox/mode', data: { mode: 'read-only', source: 'delegation' },
      }))
      await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(JSON.stringify(child.session.snapshotEvents())).toContain('file access denied under read-only mode')
      await run.dispose()
    },
  )

  it.each(['workspace-write', 'danger-full-access'] as const)('accepts workspace-write under %s', async (mode) => {
    const { ctx, parent } = await setup(mode)
    const run = await startPreparedActivation({ ...request(parent), sandboxMode: 'workspace-write' }, {})
    await run.result
    expect(ctx.sandboxPolicy.resolve({ session: run.localAgent.session }).mode).toBe('workspace-write')
    await run.dispose()
  })

  it.each([false, true])('rejects widening before publication (explicit parent override: %s)', async (override) => {
    const { ctx, parent } = await setup(override ? 'danger-full-access' : 'read-only')
    if (override) setSandboxMode(parent.session, 'read-only')
    let created = 0
    ctx.on('agent/created', () => { created++ })
    await expect(startPreparedActivation({ ...request(parent), sandboxMode: 'workspace-write' }, {}))
      .rejects.toMatchObject({ code: 'AUTHORITY_AMPLIFICATION' })
    expect(created).toBe(0)
  })

  it('rejects an explicit mode without the policy service', async () => {
    const { parent } = await setup(undefined)
    await expect(startPreparedActivation({ ...request(parent), sandboxMode: 'read-only' }, {}))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
  })

  it.each(['shell', 'fs'] as const)('rejects a %s provider that does not confine', async (name) => {
    const { ctx, parent } = await setup('workspace-write')
    const fsMode = name === 'fs' ? vi.spyOn(ctx.fs, 'sandboxMode', 'get').mockReturnValue(undefined) : undefined
    if (name === 'shell') ctx.provide('shell', { sandboxMode: undefined } as never)
    try {
      await expect(startPreparedActivation({ ...request(parent), sandboxMode: 'read-only' }, {}))
        .rejects.toThrow(`confined ${name} provider`)
    } finally {
      fsMode?.mockRestore()
    }
  })

  it('preserves a parent tool denial even when the child explicitly allows it', async () => {
    const script: Script = []
    const { ctx, parent, root } = await setup('workspace-write', script)
    const target = join(root, 'denied.txt')
    parent.ctx.tools.restrict({ deny: ['write'] })
    script.push(toolCallResponse('write', 'write', { file_path: target, content: 'denied' }), textResponse('done'))
    const run = await startPreparedActivation({ ...request(parent), toolFilter: { allow: ['write'] } }, {})
    expect(ctx.tools.get('write', run.localAgent)).toBeUndefined()
    await run.result
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    await run.dispose()
  })

  it('records the same permission names independently of tool registration order', async () => {
    const observations: string[][] = []
    const captured: string[][] = []
    for (const order of [['zeta', 'alpha'], ['alpha', 'zeta']]) {
      const { ctx, parent } = await setup(undefined)
      for (const name of order) {
        ctx.effect(() => ctx.tools.register(defineContentToolFixture({
          name, description: name, parameters: {}, execute: () => Promise.resolve([]),
        })))
      }
      const ceiling = resolveDelegatedToolFilter(parent)
      expect(ceiling.allow).toEqual(['alpha', 'zeta'])
      expect(resolveDelegatedToolFilter(parent, { deny: order }))
        .toEqual({ allow: ['alpha', 'zeta'], deny: ['alpha', 'zeta'] })
      captured.push([...(ceiling.allow ?? [])])
      const run = await startPreparedActivation(request(parent))
      await run.result
      const observation = parent.session.snapshotEvents().find(event => event.type === 'subagent/authority')
      expect(observation).toBeDefined()
      observations.push([...(observation?.data.toolFilter.allow ?? [])])
      expect(observations.at(-1)?.filter(name => order.includes(name))).toEqual(['alpha', 'zeta'])
      await run.dispose()
    }
    expect(captured[0]).toEqual(captured[1])
    expect(observations[0]).toEqual(observations[1])
  })

  it('intersects deployment and call allow lists and preserves every denial', () => {
    expect(intersectToolFilters({ allow: ['read', 'write'], deny: ['write'] }, { allow: ['write', 'bash'], deny: ['bash'] }))
      .toEqual({ allow: ['write'], deny: ['write', 'bash'] })
    expect(intersectToolFilters({ allow: [] }, { allow: ['read'] })).toEqual({ allow: [] })
    expect(intersectToolFilters(undefined, { deny: [] })).toEqual({ deny: [] })
    expect(intersectToolFilters(undefined)).toBeUndefined()
    expect(() => intersectToolFilters({})).toThrow('allow and/or deny')
  })
})
