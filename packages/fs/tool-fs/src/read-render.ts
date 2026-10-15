/**
 * Pure read presentation: turn provider-decoded text into a bounded, line-numbered window and
 * model-facing envelope. Chunk scanning caps the current line, so even one newline-free giant
 * line cannot grow memory without bound.
 * @module @deepseek-ai/dsh-tool-fs/read-render
 */

import { FsError } from '@deepseek-ai/dsh-fs'

/** Default maximum UTF-16 units returned for a single line (the `readMaxLineLength` config). */
export const READ_MAX_LINE_LENGTH = 2000

/** Default maximum bytes returned for selected file lines (the `readMaxBytes` config). */
export const READ_MAX_BYTES = 50 * 1024

/** Resolved read window. The consumer applies its defaults/caps before calling. */
export interface ReadWindow {
  /** 1-based first line to return. */
  offset: number
  /** 1-based UTF-16 column on the first requested line only; omitted means 1. */
  column?: number
  /** Maximum number of lines to return. */
  limit: number
  /** Maximum UTF-16 units of file text per line; overflow includes a continuation suffix. */
  maxLineLength: number
  /** Maximum bytes of selected line text, including column labels and continuation hints. */
  maxBytes: number
}

/** One line returned from a text file. */
export interface FileTextLine {
  /** 1-based line number in the file. */
  number: number
  /** Selected text with any column label and continuation suffix, without its trailing newline. */
  text: string
  /** First selected UTF-16 column when the line starts after column 1. */
  column?: number
  /** Next UTF-16 column when file text remains beyond the returned slice. */
  nextColumn?: number
}

/** The windowed result {@link buildWindow} produces from a file's decoded text. */
export interface WindowResult {
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes: boolean
}

/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
export interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}

interface WindowAccumulator {
  lines: FileTextLine[]
  totalLines: number
  outputBytes: number
  truncatedByBytes: boolean
}

function newAccumulator(): WindowAccumulator {
  return { lines: [], totalLines: 0, outputBytes: 0, truncatedByBytes: false }
}

function lineByteSize(line: string, currentLineCount: number): number {
  return Buffer.byteLength(line, 'utf8') + (currentLineCount > 0 ? 1 : 0)
}

function consumeLine(acc: WindowAccumulator, rawLine: string, request: ReadWindow): void {
  acc.totalLines += 1
  if (acc.truncatedByBytes || acc.totalLines < request.offset || acc.lines.length >= request.limit) return

  const column = acc.totalLines === request.offset ? request.column ?? 1 : 1
  let end = Math.min(rawLine.length, request.maxLineLength)
  if (isHighSurrogate(rawLine.charCodeAt(end - 1)) && isLowSurrogate(rawLine.charCodeAt(end))) end -= 1
  if (end === 0 && rawLine.length > 0) throw new Error('readMaxLineLength cannot fit the UTF-16 surrogate pair at the requested column')
  const prefix = column > 1 ? `(column ${column}) ` : ''

  function lineAt(end: number, compact: boolean): FileTextLine {
    const nextColumn = rawLine.length > end ? column + end : undefined
    const suffix = nextColumn === undefined ? '' : compact
      ? `... [offset=${acc.totalLines},column=${nextColumn}]`
      : `... (line truncated to ${request.maxLineLength} UTF-16 units; use offset=${acc.totalLines}, column=${nextColumn} to continue)`
    return {
      number: acc.totalLines,
      text: `${prefix}${rawLine.slice(0, end)}${suffix}`,
      ...column > 1 ? { column } : {},
      ...nextColumn === undefined ? {} : { nextColumn },
    }
  }

  const remaining = request.maxBytes - acc.outputBytes
  const fits = (line: FileTextLine): boolean => lineByteSize(line.text, acc.lines.length) <= remaining
  let line = lineAt(end, false)
  if (!fits(line)) {
    let low = 0
    let high = end
    let selected: FileTextLine | undefined
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const cut = isHighSurrogate(rawLine.charCodeAt(middle - 1)) && isLowSurrogate(rawLine.charCodeAt(middle))
        ? middle - 1 : middle
      const candidate = lineAt(cut, true)
      if (fits(candidate)) {
        if (cut > 0) selected = candidate
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    if (selected === undefined) {
      if (acc.lines.length === 0) {
        throw new Error(`readMaxBytes ${request.maxBytes} cannot fit one Unicode character with its column and continuation metadata; increase readMaxBytes and retry`)
      }
      acc.truncatedByBytes = true
      return
    }
    line = selected
  }
  acc.outputBytes += lineByteSize(line.text, acc.lines.length)
  acc.lines.push(line)
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xD800 && unit <= 0xDBFF
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xDC00 && unit <= 0xDFFF
}

function finish(acc: WindowAccumulator, request: ReadWindow, displayPath: string): WindowResult {
  if (!acc.truncatedByBytes && request.offset > acc.totalLines && !(acc.totalLines === 0 && request.offset === 1)) {
    throw new FsError(`offset ${request.offset} is out of range for "${displayPath}" (${acc.totalLines} lines)`, 'FS_NOT_FOUND')
  }
  if (acc.totalLines === 0 && (request.column ?? 1) > 1) {
    throw new FsError(`column ${request.column} is out of range for "${displayPath}" (empty file)`, 'FS_NOT_FOUND')
  }
  return { lines: acc.lines, totalLines: acc.totalLines, truncatedByBytes: acc.truncatedByBytes }
}

/**
 * Build one window from streamed or whole-file chunks, enforcing line and byte caps while still
 * scanning to an exact total line count, and throwing `FS_NOT_FOUND` when the requested offset is
 * past EOF. Columns and line caps count UTF-16 code units; a column inside a surrogate pair
 * fails, and a capped line ends before a pair that would cross the cap. Skipped prefixes are
 * counted without buffering. Empty lines accept column 1 only. Byte pressure can shorten a
 * slice and compact its continuation hint; a budget too small for one Unicode character plus
 * its metadata fails instead of returning an empty successful window.
 * @param chunks - decoded text chunks in file order; chunk boundaries carry no meaning.
 * @param request - the resolved window; the caller has already applied its defaults and caps.
 * @param displayPath - the caller-facing path used in the offset-out-of-range error.
 * @returns the numbered window lines, the total line count seen, and the byte-cap truncation flag.
 */
export async function buildWindow(
  chunks: AsyncIterable<string> | Iterable<string>,
  request: ReadWindow,
  displayPath: string,
): Promise<WindowResult> {
  const acc = newAccumulator()
  // Two units distinguish a complete surrogate pair from a split pair at the cap.
  const lineBufferCap = request.maxLineLength + 2
  let lineBuffer = ''
  let lineLength = 0
  let lastUnit = Number.NaN
  let precedingUnit = Number.NaN

  function appendToLineBuffer(segment: string): void {
    if (segment.length === 0) return
    const number = acc.totalLines + 1
    const skip = number === request.offset ? (request.column ?? 1) - 1 : 0
    const start = Math.max(0, skip - lineLength)
    if (number >= request.offset && acc.lines.length < request.limit && !acc.truncatedByBytes
      && start < segment.length && lineBuffer.length < lineBufferCap) {
      if (lineBuffer.length === 0) precedingUnit = start > 0 ? segment.charCodeAt(start - 1) : lastUnit
      lineBuffer += segment.slice(start, start + lineBufferCap - lineBuffer.length)
    }
    lineLength += segment.length
    lastUnit = segment.charCodeAt(segment.length - 1)
  }

  function flushLine(): void {
    const length = lineLength - (lastUnit === 13 ? 1 : 0)
    const column = acc.totalLines + 1 === request.offset ? request.column ?? 1 : 1
    if (acc.totalLines + 1 === request.offset) {
      if (column > Math.max(1, length)) {
        throw new FsError(`column ${column} is out of range for line ${request.offset} of "${displayPath}" (${length} UTF-16 units)`, 'FS_NOT_FOUND')
      }
      if (column > 1 && isHighSurrogate(precedingUnit) && isLowSurrogate(lineBuffer.charCodeAt(0))) {
        throw new Error(`column ${column} splits a UTF-16 surrogate pair on line ${request.offset} of "${displayPath}"`)
      }
    }
    consumeLine(acc, lineBuffer.slice(0, Math.max(0, length - column + 1)), request)
    lineBuffer = ''
    lineLength = 0
    lastUnit = Number.NaN
    precedingUnit = Number.NaN
  }

  for await (const chunk of chunks) {
    let startPos = 0
    let newlinePos: number
    while ((newlinePos = chunk.indexOf('\n', startPos)) !== -1) {
      appendToLineBuffer(chunk.slice(startPos, newlinePos))
      flushLine()
      startPos = newlinePos + 1
    }
    appendToLineBuffer(chunk.slice(startPos))
  }
  if (lineLength > 0) flushLine()
  return finish(acc, request, displayPath)
}

/**
 * Format a read outcome as one OpenCode-style line-numbered text block body.
 * @param displayPath - the backend-resolved path rendered in the envelope's `<path>` element.
 * @param outcome - the windowed read to render.
 * @returns the model-facing envelope: numbered lines plus a continuation or end-of-file footer.
 */
export function formatReadOutput(displayPath: string, outcome: FileReadOutcome): string {
  const endLine = outcome.lines.at(-1)?.number ?? Math.max(0, outcome.offset - 1)
  let footer: string
  if (outcome.truncatedByBytes) {
    footer = `(Output capped. Showing lines ${outcome.offset}-${endLine}. Use offset=${endLine + 1} to continue.)`
  } else if (endLine < outcome.totalLines) {
    footer = `(Showing lines ${outcome.offset}-${endLine} of ${outcome.totalLines}. Use offset=${endLine + 1} to continue.)`
  } else {
    footer = `(End of file - total ${outcome.totalLines} lines)`
  }
  const body = outcome.lines.length > 0
    ? `${outcome.lines.map(line => `${line.number}: ${line.text}`).join('\n')}\n\n${footer}`
    : footer
  return `<path>${displayPath}</path>
<type>file</type>
<content>
${body}
</content>`
}

/**
 * Derive the persisted `lang` hint from a read path's file extension. The shared
 * table in `@deepseek-ai/dsh-util-code-language` owns the recognized suffixes and
 * the path rules (both separators, a leading dot as the extension separator, and
 * prototype-key safety); `readLangHintForPath` projects the read card's short ids
 * over it, so a suffix whose value a recorded session already holds keeps it
 * byte-identical while every other suffix uses its language's short name.
 * @param path - the model-facing path the read reported.
 * @returns the persisted language hint, or `undefined` when the extension maps to none.
 */
export { readLangHintForPath as langFromPath } from '@deepseek-ai/dsh-util-code-language'

/**
 * The `read` tool's private `tool/result` `meta` payload: the structured
 * line-numbered window a capable UI renders as a code view. Attached opaquely (as
 * `unknown`) on the tool result and persisted with the session log — it must be
 * JSON-serializable (the session validates this at `append`), so `presentResult`
 * reproduces the read card on replay when the raw structured output is no longer
 * on the wire. The producing tool owns and narrows this opaque shape.
 */
export interface FsReadMeta {
  /** The read file's model-facing path. */
  path: string
  /** The 1-based first line the window requested, kept even when `lines` is empty. */
  offset: number
  /** The returned window's lines, each keeping its file line number. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Syntax-highlighting language hint from the extension, or omitted for plain text. */
  lang?: string
}

/**
 * Whether `value` is a valid {@link FileTextLine} (defensive narrowing from
 * opaque `meta`). `number` must be a 1-based integer line number, since a card
 * rendered from a zero, fractional, or non-finite line number would violate the
 * 1-based numbering contract the read window promises.
 */
function isFileTextLine(value: unknown): value is FileTextLine {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { number, text, column, nextColumn } = value as Record<string, unknown>
  return typeof number === 'number' && Number.isInteger(number) && number >= 1 && typeof text === 'string'
    && (column === undefined || typeof column === 'number' && Number.isSafeInteger(column) && column > 1)
    && (nextColumn === undefined || typeof nextColumn === 'number' && Number.isSafeInteger(nextColumn) && nextColumn > (typeof column === 'number' ? column : 1))
}

/**
 * Narrow opaque live or replayed result metadata to a structured read window.
 * Malformed metadata returns `undefined` so presentation can fall back to the
 * generic text card instead of throwing during replay. Beyond shape, the
 * semantic contract of a read window is enforced against replayed JSON that is
 * well-typed but out of range: `offset` must be a 1-based integer, `totalLines`
 * must be a non-negative integer, each line number must be a 1-based integer no
 * less than `offset`, the line numbers must strictly increase, and no line number
 * may exceed `totalLines`. Any violation declines to the generic fallback rather
 * than emitting a card that misnumbers or overcounts.
 * @param meta - result metadata.
 * @returns the validated read window, or `undefined` for absent, malformed, or semantically invalid data.
 */
export function readMetaFromMeta(meta: unknown): FsReadMeta | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { path, offset, lines, totalLines, lang } = meta as Record<string, unknown>
  if (typeof path !== 'string' || typeof totalLines !== 'number' || typeof offset !== 'number') return undefined
  if (!Number.isInteger(offset) || offset < 1) return undefined
  if (!Number.isInteger(totalLines) || totalLines < 0) return undefined
  if (!Array.isArray(lines) || !lines.every(isFileTextLine)) return undefined
  if (lang !== undefined && typeof lang !== 'string') return undefined
  let previous = offset - 1
  for (const { number } of lines) {
    if (number <= previous || number > totalLines) return undefined
    previous = number
  }
  return { path, offset, lines, totalLines, ...lang === undefined ? {} : { lang } }
}
