/** Validate delivery metadata and address source actions and saved-copy downloads. */
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'

/** Authenticated POST route for opening a workspace file on the Host desktop. */
export const PRESENT_OPEN_PATH = '/api/present.open'

/** Authenticated GET route for a declared file's saved bytes. */
export const PRESENT_DOWNLOAD_PATH = '/api/present.download'

/** Authenticated desktop availability and destination metadata. */
export const PRESENT_HOST_PATH = '/api/present.host'

/**
 * Browser-relative form of {@link PRESENT_OPEN_PATH}; see
 * .agents/notes/implemented/architecture/2026-09-14-web-document-relative-app-routes.md.
 */
export const PRESENT_OPEN_ROUTE = PRESENT_OPEN_PATH.slice(1)

/** Browser-relative form of {@link PRESENT_HOST_PATH}. */
export const PRESENT_HOST_ROUTE = PRESENT_HOST_PATH.slice(1)

/** Native file action selected by an explicit user gesture. */
export type PresentedAction = 'open' | 'reveal'

/** Serving Host information; file-manager names never derive from the browser's OS. */
export interface PresentedHost {
  name: string
  available: boolean
  fileManager: 'finder' | 'explorer' | 'directory' | null
}

/**
 * Validate desktop metadata received over HTTP.
 * @param value - decoded response.
 * @returns whether all displayed and actionable fields are supported.
 */
export function isPresentedHost(value: unknown): value is PresentedHost {
  if (typeof value !== 'object' || value === null) return false
  const host = value as Record<string, unknown>
  return typeof host.name === 'string' && typeof host.available === 'boolean'
    && (host.fileManager === null || host.fileManager === 'finder'
      || host.fileManager === 'explorer' || host.fileManager === 'directory')
}

/**
 * Validate a file declaration read from a Session log.
 * @param value - decoded durable data.
 * @returns whether the declaration and its optional capture metadata are valid.
 */
export function isPresentedFile(value: unknown): value is PresentedFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { path, description, capture } = value as Record<string, unknown>
  return typeof path === 'string' && path.trim().length > 0
    && (description === undefined || typeof description === 'string')
    && isCapture(capture)
}

function isCapture(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const capture = value as Record<string, unknown>
  if (capture.status === 'too-large') return typeof capture.maxBytes === 'number'
    && Number.isSafeInteger(capture.maxBytes) && capture.maxBytes > 0
  if (capture.status !== 'stored' || typeof capture.attachment !== 'object'
    || capture.attachment === null || Array.isArray(capture.attachment)) return false
  const { attachmentId, name, bytes } = capture.attachment as Record<string, unknown>
  return typeof attachmentId === 'string' && /^sha256:[a-f0-9]{64}$/u.test(attachmentId)
    && typeof name === 'string' && name.length > 0 && name.isWellFormed() && name !== '.' && name !== '..'
    && !/[\u0000-\u001f\u007f/\\]/u.test(name)
    && typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0
}

/**
 * Address a saved copy without exposing its storage identifier to the route.
 * @param sessionId - viewed Session, including inherited events.
 * @param seq - deliverables/presented event sequence.
 * @param index - original index in the event's files array.
 * @returns document-relative authenticated download URL.
 */
export function presentedDownloadUrl(sessionId: SessionId, seq: number, index: number): string {
  return `${PRESENT_DOWNLOAD_PATH.slice(1)}?${new URLSearchParams({ sessionId, seq: String(seq), index: String(index) })}`
}

/**
 * Compare the declared path with the viewed workspace without resolving symlinks.
 * @param cwd - viewed workspace root, when known.
 * @param path - recorded absolute or workspace-relative path.
 * @returns whether the path lexically lies outside a known workspace.
 */
export function isOutsideWorkspace(cwd: string | undefined, path: string): boolean {
  if (cwd === undefined) return false
  const windows = /^[a-z]:[/\\]|^[/\\]{2}/iu.test(cwd)
  const spelling = (value: string) => windows ? value.replace(/\\/gu, '/').toLowerCase() : value
  const root = spelling(cwd)
  const declared = spelling(path)
  const absolute = /^(?:\/|[a-z]:\/)/iu.test(declared)
  const normalize = (value: string) => {
    const parts: string[] = []
    for (const part of value.split('/')) {
      if (part === '..') parts.pop()
      else if (part !== '' && part !== '.') parts.push(part)
    }
    return parts
  }
  const base = normalize(root)
  const file = normalize(absolute ? declared : `${root}/${declared}`)
  return base.some((part, index) => file[index] !== part)
}

/**
 * Build authenticated coordinates for a declared file.
 * @param sessionId - owning Session.
 * @param seq - deliverables/presented event sequence.
 * @param index - original index in the event's files array.
 * @returns document-relative file action route.
 */
export function presentedFileUrl(sessionId: SessionId, seq: number, index: number): string {
  return `${PRESENT_OPEN_ROUTE}?${new URLSearchParams({ sessionId, seq: String(seq), index: String(index) })}`
}

/**
 * Validate a delivery event before reading its turn or file declarations.
 * @param value - decoded durable event data.
 * @returns whether the event identifies a turn, call, and file list.
 */
export function isPresentedData(value: unknown): value is { turn: number; callId: ToolCallId; files: unknown[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { turn, callId, files } = value as Record<string, unknown>
  return typeof turn === 'number' && Number.isSafeInteger(turn) && turn >= 1
    && typeof callId === 'string' && callId.length > 0 && Array.isArray(files)
}

/**
 * Trailing path segment, the part that identifies the file at a glance.
 * @param path - Slash- or backslash-separated path.
 * @returns The final segment, or the whole string when separator-free.
 */
export function basename(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}
