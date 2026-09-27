/** Extract ZIP archives without following archive-provided symbolic links. */

import { createWriteStream } from 'node:fs'
import { chmod, lstat, mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl, { type Entry, type ZipFile } from 'yauzl'

const openZip = (archive: string): Promise<ZipFile> => new Promise((resolveZip, rejectZip) => {
  yauzl.open(archive, { lazyEntries: true, strictFileNames: true }, (error, zipfile) => {
    if (error !== null) rejectZip(error)
    else resolveZip(zipfile)
  })
})

const openReadStream = (zipfile: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> => new Promise((resolveStream, reject) => {
  zipfile.openReadStream(entry, (error, stream) => {
    if (error === null) resolveStream(stream)
    else reject(error)
  })
})

/** Options for safe ZIP extraction. */
export interface SafeExtractZipOptions {
  /** Absolute destination directory. */
  dir: string
  /** Inspect an entry before it is written. */
  onEntry?: (entry: Entry) => void | Promise<void>
}

function extractedMode(entry: Entry, directory: boolean): number {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff
  const permissions = mode & 0o777
  return permissions === 0 ? (directory ? 0o755 : 0o644) : permissions
}

function isDirectory(entry: Entry, mode: number): boolean {
  const fileType = mode & 0xf000
  if (fileType === 0x4000 || entry.fileName.endsWith('/')) return true
  return (entry.versionMadeBy >> 8) === 0 && entry.externalFileAttributes === 16
}

function isSymbolicLink(mode: number): boolean {
  return (mode & 0xf000) === 0xa000
}

function safeDestination(root: string, entryName: string): string {
  if (entryName.includes('\0')) throw new Error(`ZIP entry contains a NUL byte: ${entryName}`)
  const destination = resolve(root, entryName)
  const escaped = relative(root, destination)
  if (isAbsolute(entryName) || escaped === '..' || escaped.startsWith(`..${sep}`)) {
    throw new Error(`ZIP entry escapes destination: ${entryName}`)
  }
  return destination
}

async function extractEntry(zipfile: ZipFile, root: string, entry: Entry, onEntry?: SafeExtractZipOptions['onEntry']): Promise<void> {
  await onEntry?.(entry)
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff
  if (isSymbolicLink(mode)) throw new Error(`ZIP symbolic-link entry is not allowed: ${entry.fileName}`)
  const destination = safeDestination(root, entry.fileName)
  const directory = isDirectory(entry, mode)
  const targetDirectory = directory ? destination : dirname(destination)
  await mkdir(targetDirectory, { recursive: true, mode: directory ? extractedMode(entry, true) : 0o755 })
  const canonicalDirectory = await realpath(targetDirectory)
  const relativeDirectory = relative(root, canonicalDirectory)
  if (relativeDirectory === '..' || relativeDirectory.startsWith(`..${sep}`)) {
    throw new Error(`ZIP directory escapes destination: ${canonicalDirectory}`)
  }
  if (directory) return
  try {
    if ((await lstat(destination)).isSymbolicLink()) throw new Error(`ZIP destination is a symbolic link: ${entry.fileName}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const stream = await openReadStream(zipfile, entry)
  await pipeline(stream, createWriteStream(destination, { mode: extractedMode(entry, false) }))
  await chmod(destination, extractedMode(entry, false))
}

async function readEntries(zipfile: ZipFile, root: string, onEntry?: SafeExtractZipOptions['onEntry']): Promise<void> {
  await new Promise<void>((resolveEntries, rejectEntries) => {
    let settled = false
    const settleError = (error: unknown): void => {
      if (settled) return
      settled = true
      zipfile.close()
      rejectEntries(error instanceof Error ? error : new Error(String(error)))
    }
    zipfile.on('error', settleError)
    zipfile.on('end', () => {
      if (settled) return
      settled = true
      resolveEntries()
    })
    zipfile.on('entry', (entry: Entry) => {
      void extractEntry(zipfile, root, entry, onEntry).then(
        () => { zipfile.readEntry() },
        settleError,
      )
    })
    zipfile.readEntry()
  })
}

/** Extract a ZIP archive while preserving executable modes and rejecting symlinks. */
export async function safeExtractZip(archive: string, options: SafeExtractZipOptions): Promise<void> {
  if (!isAbsolute(options.dir)) throw new Error('ZIP destination must be absolute')
  await mkdir(options.dir, { recursive: true })
  const root = await realpath(options.dir)
  const zipfile = await openZip(archive)
  try {
    await readEntries(zipfile, root, options.onEntry)
  } finally {
    if (zipfile.isOpen) zipfile.close()
  }
}
