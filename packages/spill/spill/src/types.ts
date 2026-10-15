/**
 * Vocabulary for the spill storage Service Definition. Types only — the abstract service
 * lives in `./index.ts`, implementations in sibling packages
 * (`@deepseek-ai/dsh-spill-local` first).
 *
 * @module @deepseek-ai/dsh-spill/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'

/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
export type SpillLocator = Branded<'SpillLocator'>

/**
 * Brand a string as a {@link SpillLocator}.
 *
 * @param locator The backend-produced locator string to brand.
 * @returns The branded spill locator.
 */
export function SpillLocator(locator: string): SpillLocator {
  return locator as SpillLocator
}

/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
export interface SpillOwner {
  sessionId: SessionId
}

/**
 * Producer of a spilled artifact. Tool results carry their model-issued call id;
 * session references identify the captured source session instead. Descriptive
 * source description only, never access control.
 */
export type SpillSource = {
  kind: 'tool'
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: ToolCallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
} | {
  kind: 'session-reference'
  /** Session whose projected conversation was captured. */
  sessionId: SessionId
  /** Host-provided label for the referenced session. */
  label: string
}

/** One request to persist text to a spill artifact. */
export interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
  /** Optional caller cancellation forwarded to durable capture. */
  signal?: AbortSignal
}

/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
export interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}

/** Immutable evidence bytes associated with a model-facing spill locator. */
export interface SpillArtifactEventData {
  /** Producer of the complete saved text. */
  source: SpillSource
  /** Locator retained in tool history; export maps it to the captured file. */
  locator: SpillLocator
  /** Exact bytes stored before this event is appended. */
  attachment: FileAttachmentRef
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Full spill bytes captured independently of temporary-file retention; log-only. */
    'spill/artifact': SpillArtifactEventData
  }
}
