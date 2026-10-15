/** Durable file deliveries produced by the present tool. */
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** A declared filesystem file with an optional immutable copy of its presented bytes. */
export interface PresentedFile {
  /** Original absolute path or path relative to the Session working directory. */
  path: string
  /** Optional description supplied by the model. */
  description?: string
  /** Capture outcome; absent on historical declarations that did not preserve bytes. */
  capture?:
    | { status: 'stored'; attachment: FileAttachmentRef }
    | { status: 'too-large'; maxBytes: number }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Declared filesystem files from a successful final present result, including nested calls. */
    'deliverables/presented': { turn: number; callId: ToolCallId; files: PresentedFile[] }
  }
}
