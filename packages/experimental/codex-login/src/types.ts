/**
 * Browser-safe progress and reply vocabulary for one Codex authorization.
 * Secret answers travel only from the initiating browser to the Host.
 * @module @deepseek-ai/dsh-experimental-codex-login/types
 */

/** Presence of the installed OAuth flow and its stored credential. */
export interface CodexLoginStatus {
  available: boolean
  configured: boolean
  writable: boolean
  inFlight: boolean
}

/** Host messages sent only to the stream that started the login. */
export type CodexLoginFrame =
  | { type: 'notice'; message: string; url?: string; code?: string }
  | {
    type: 'prompt'
    id: string
    kind: 'text' | 'secret' | 'select'
    message: string
    placeholder?: string
    options?: readonly { id: string; label: string; description?: string }[]
  }
  | { type: 'settled'; status: 'authorized' | 'cancelled' }
  | { type: 'failed'; reason: 'callback-busy' | 'failed' }

/** One answer to a prompt on the same authenticated stream. */
export type CodexLoginReply =
  | { type: 'answer'; id: string; value: string }
  | { type: 'decline'; id: string }
