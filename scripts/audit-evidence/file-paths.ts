/** Detect an output path that aliases an existing input, including symlinks and hard links. */
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Compare an output with an input before writing either file.
 * @param output - Destination that may already exist.
 * @param input - Existing source file.
 * @returns Whether writing the destination would overwrite the source.
 */
export function aliasesInput(output: string, input: string): boolean {
  if (resolve(output) === resolve(input)) return true
  if (!existsSync(output)) return false
  const destination = statSync(output)
  const source = statSync(input)
  return destination.dev === source.dev && destination.ino === source.ino
}
