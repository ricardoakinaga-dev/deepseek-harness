/** Profile-owned enablement writes and notices that survive Settings. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ChangeResult, PluginEntryId } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginInventoryView } from './PluginInventorySettingsTab.tsx'

/** One persistent plugin address in the global composition or a preset. */
export type PluginEnablementTarget =
  | { readonly kind: 'global'; readonly entryId: PluginEntryId }
  | { readonly kind: 'preset'; readonly presetId: string; readonly rowId: string }

/** Accepted mutation state shared by Settings and the shell notice. */
export interface EnablementState {
  busy: boolean
  notice: 'saved' | 'saveFailed' | 'applyFailed' | 'restartRequired' | 'overridden' | 'refreshFailed' | null
  sequence: number
}

/** Serializes writes and refreshes the accepted inventory after settlement. */
export class PluginEnablement {
  /** Observable mutation state retained while the Client plugin is mounted. */
  readonly state = createSnapshotStore<EnablementState>({ busy: false, notice: null, sequence: 0 })
  private disposed = false

  private canPublish(): boolean { return !this.disposed }

  /** Stop publishing after the owning Client plugin unloads. */
  dispose(): void { this.disposed = true }

  /** Dismiss the last operation's notice. */
  dismiss(): void { this.state.update((state) => { state.notice = null }) }

  /**
   * Persist one desired state, then read the Host's resulting inventory.
   * @param write - the owning manager operation.
   * @param read - a fresh inventory including management permissions.
   * @returns the accepted inventory, or undefined when the write or refresh failed or the owner unloaded.
   */
  async change(write: () => Promise<ChangeResult>, read: () => Promise<PluginInventoryView>): Promise<PluginInventoryView | undefined> {
    if (!this.canPublish() || this.state.getSnapshot().busy) return undefined
    this.state.update((state) => { state.busy = true; state.notice = null })
    let notice: EnablementState['notice'] = 'saveFailed'
    try {
      const result = await write()
      const outcomes = {
        applied: 'saved', 'restart-required': 'restartRequired', overridden: 'overridden', failed: 'saveFailed', cancelled: 'saveFailed',
      } as const satisfies Record<ChangeResult['application'], EnablementState['notice']>
      notice = result.application === 'failed' && result.changed ? 'applyFailed' : outcomes[result.application]
      try {
        const snapshot = await read()
        return this.canPublish() ? snapshot : undefined
      } catch (_refreshError) {
        // The write outcome is settled; a failed read must not erase it.
        if (notice === 'saved') notice = 'refreshFailed'
        return undefined
      }
    } catch (_writeError) {
      return undefined
    } finally {
      if (this.canPublish()) this.state.update((state) => {
        state.busy = false
        state.notice = notice
        state.sequence++
      })
    }
  }
}
