import { describe, expect, it, vi } from 'vitest'
import type { ChangeResult } from '@deepseek-ai/dsh-api-remotes/client'
import { PluginEnablement } from '../src/client/enablement.ts'

const result = (application: ChangeResult['application'], changed = true): ChangeResult => ({
  changed, application, stage: 'enable', target: 'fixture',
})

describe('plugin enablement writes', () => {
  it.each([
    ['applied', 'saved'], ['restart-required', 'restartRequired'], ['overridden', 'overridden'], ['failed', 'applyFailed'],
  ] as const)('reports %s after reading the accepted inventory', async (application, notice) => {
    const change = new PluginEnablement(), inventory = { entries: [] }
    expect(await change.change(async () => result(application), async () => inventory)).toBe(inventory)
    expect(change.state.getSnapshot()).toMatchObject({ busy: false, notice, sequence: 1 })
    change.dismiss()
    expect(change.state.getSnapshot().notice).toBeNull()
  })

  it('preserves a write outcome when its status refresh fails', async () => {
    const change = new PluginEnablement()
    expect(await change.change(async () => result('applied'), async () => { throw new Error('offline') })).toBeUndefined()
    expect(change.state.getSnapshot().notice).toBe('refreshFailed')
  })

  it('refuses overlapping writes and suppresses publication after unload', async () => {
    const change = new PluginEnablement()
    let finish!: (value: ChangeResult) => void
    const pending = change.change(() => new Promise((resolve) => { finish = resolve }), async () => ({ entries: [] }))
    const duplicate = vi.fn(async () => result('applied'))
    await change.change(duplicate, async () => ({ entries: [] }))
    expect(duplicate).not.toHaveBeenCalled()
    change.dispose()
    finish(result('applied'))
    expect(await pending).toBeUndefined()
    expect(change.state.getSnapshot().notice).toBeNull()
  })

  it('reports an uncommitted failure without discarding the existing list', async () => {
    const change = new PluginEnablement(), read = vi.fn(async () => ({ entries: [] }))
    expect(await change.change(async () => { throw new Error('refused') }, read)).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
    expect(change.state.getSnapshot().notice).toBe('saveFailed')
  })
})
