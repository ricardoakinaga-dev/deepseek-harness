/** Serializable local child publication facts shared by Host and Client. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Effective local child authority observed at publication of one residency epoch. */
export interface SubagentAuthorityData {
  readonly version: 0
  readonly childId: SessionId
  /** Effective file policy, or null when the local composition cannot confirm confinement. */
  readonly sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access' | null
  /** Recorded approval policy, or null without a composed approval service and override. */
  readonly approvalPolicy: 'ask' | 'never' | null
  /** Actual visible tools, including child-owned response infrastructure. */
  readonly toolFilter: { readonly allow: readonly string[] }
}
