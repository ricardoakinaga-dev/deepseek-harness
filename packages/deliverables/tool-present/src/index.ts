/** Scoped tool that declares filesystem deliveries in their owning Session. */
import { Readable } from 'node:stream'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FsError } from '@deepseek-ai/dsh-fs'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { Session } from '@deepseek-ai/dsh-session'
import type { PresentedFile } from './types.ts'

/** Stable Loader identity. */
export const name = 'tool-present'

/** Deployment limits for file declarations and their durable copies. */
export interface Config {
  /** Maximum number of files in one call. */
  maxFiles: number
  /** Inclusive byte limit for capturing one file; larger files remain source-only declarations. */
  maxFileBytes: number
}

/** Validated delivery limit. */
export const Config: z<Config> = z.object({
  maxFiles: z.number().default(8),
  maxFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER - 1).default(20 * 1024 * 1024).extra('extra', { audit: true }),
})

/** Services used by the scoped delivery tool. */
export const inject = ['tools', 'fs', 'attachments', 'sessionProjections', 'workingDirectory']

/**
 * Register present with durable file references in its tool result.
 * @param ctx - agent-scoped services.
 * @param config - file-count and per-file capture limits.
 */
export function apply(ctx: Context, config: Config): void {
  if (!Number.isSafeInteger(config.maxFiles) || config.maxFiles < 1) {
    throw new Error('present requires a positive integer maxFiles')
  }
  if (!Number.isSafeInteger(config.maxFileBytes) || config.maxFileBytes < 1 || config.maxFileBytes >= Number.MAX_SAFE_INTEGER) {
    throw new Error('present requires a positive integer maxFileBytes below Number.MAX_SAFE_INTEGER')
  }
  const pending = new WeakMap<ToolExecution, { session: Session; turn: number; files: PresentedFile[] }>()
  ctx.tools.register(defineTool({
    name: 'present',
    description: 'Declare existing files as final deliverables for the user. '
      + 'Use it when the user needs a separate file, especially Office documents, spreadsheets, and slide decks; '
      + 'prefer your final response when that suffices. A saved copy preserves the presented bytes within the configured file-size limit; '
      + 'larger files are declared without a saved copy. The original path remains available for opening the current file.',
    parameters: {
      files: {
        type: 'array', required: true,
        // 4 is the recommended per-call count; `maxFiles` is the enforced ceiling above it.
        description: 'Usually the 1-2 most important deliverables; at most 4 per call.',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true, description: 'Path of an existing regular file. Relative paths use the Session working directory.' },
            description: { type: 'string', description: 'Brief description for the user.' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          turn: { type: 'integer', required: true },
          files: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                description: { type: 'string' },
                capture: {
                  oneOf: [
                    {
                      type: 'object', additionalProperties: false,
                      properties: {
                        status: { type: 'string', const: 'stored', required: true },
                        attachment: {
                          type: 'object', additionalProperties: false, required: true,
                          properties: {
                            attachmentId: { type: 'string', required: true },
                            name: { type: 'string', required: true },
                            bytes: { type: 'integer', required: true },
                          },
                        },
                      },
                    },
                    {
                      type: 'object', additionalProperties: false,
                      properties: {
                        status: { type: 'string', const: 'too-large', required: true },
                        maxBytes: { type: 'integer', required: true },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.files.map(file => file.capture?.status === 'too-large'
        ? `Presented ${file.path} (not saved: exceeds ${file.capture.maxBytes} bytes; keep the original file)`
        : `Presented ${file.path}`).join('\n') }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('present requires an agent Session')
      const boundary = ctx.sessionProjections.stateOf(exec.agent.session, 'turnBoundary')
      if (boundary === undefined || boundary.openTurnStartSeq === null) throw new Error('present requires an open turn')
      if (args.files.length === 0 || args.files.length > config.maxFiles) throw new Error(`present accepts 1 to ${config.maxFiles} files`)
      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      const options = { cwd, signal: exec.signal }
      const files: PresentedFile[] = []
      for (const file of args.files) {
        if (file.path.trim().length === 0) throw new Error('present requires a non-empty file path')
        const entry = await ctx.fs.lstat(file.path, { cwd }, exec.signal)
        if (entry !== undefined && entry.type !== 'file') throw new Error(`Cannot present ${file.path}: not a regular file`)
        const target = await ctx.fs.resolve(file.path, options)
        const info = await ctx.fs.stat(target, exec.signal)
        if (info === undefined) throw new FsError(`Cannot present ${file.path}: file not found. Check the path, create the file if needed, and retry.`, 'FS_NOT_FOUND')
        if (info.type !== 'file') throw new Error(`Cannot present ${file.path}: not a regular file`)
        if (info.size !== undefined && info.size > config.maxFileBytes) {
          files.push({ ...file, path: ctx.fs.processPath(target), capture: { status: 'too-large', maxBytes: config.maxFileBytes } })
          continue
        }
        let data: Uint8Array
        try {
          data = await ctx.fs.readBytes(target, exec.signal, config.maxFileBytes)
        } catch (error) {
          exec.signal.throwIfAborted()
          if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'FS_TOO_LARGE') throw error
          files.push({ ...file, path: ctx.fs.processPath(target), capture: { status: 'too-large', maxBytes: config.maxFileBytes } })
          continue
        }
        const attachment = await ctx.attachments.saveFileStream({
          data: Readable.from([data]), name: file.path, signal: exec.signal,
        })
        files.push({ ...file, path: ctx.fs.processPath(target), capture: { status: 'stored', attachment } })
      }
      exec.signal.throwIfAborted()
      pending.set(exec, { session: exec.agent.session, turn: boundary.lastTurn, files })
      return { turn: boundary.lastTurn, files }
    },
  }))
  ctx.on('tools/result', (exec, result) => {
    const delivery = pending.get(exec)
    pending.delete(exec)
    if (delivery === undefined || result.isError) return
    const { session, turn, files } = delivery
    session.append('deliverables/presented', {
      turn, callId: exec.callId, files,
    })
  })
}
