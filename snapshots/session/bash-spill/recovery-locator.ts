/** Give this scenario's complete raw output a stable, independently checked workspace address. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'

/** Fixture plugin identity. */
export const name = 'bash-recovery-locator'
/** The public tool finalizer runs after production retention. */
export const inject = ['tools']

/**
 * Copy the producer's real recovery file after the production retention policy settles.
 * @param ctx - assembled headless profile context.
 */
export function apply(ctx: Context): void {
  const paths = new Map<string, string>()
  const installed = new Set<ToolDefinition>()
  const install = (): void => {
    const tool = ctx.tools.get('bash')
    if (tool === undefined || installed.has(tool)) return
    installed.add(tool)
    const previous = tool.finalizeContent
    ctx.effect(() => {
      tool.finalizeContent = (exec, result) => {
        const content = previous?.(exec, result) ?? result.content
        return content.map(block => {
          if (block.type !== 'text') return block
          let text = block.text
          for (const [source, target] of paths) text = text.replaceAll(source, target)
          return { ...block, text }
        })
      }
      return () => {
        if (previous === undefined) delete tool.finalizeContent
        else tool.finalizeContent = previous
        installed.delete(tool)
      }
    })
  }
  ctx.on('tools/change', install)
  install()
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (exec.name !== 'bash' || result.isError || decision.kind !== 'accept') return decision
    if (Object.hasOwn(decision, 'value')) throw new Error('bash-spill fixture requires the original canonical value')
    const value = result.value
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('missing canonical bash result')
    const marker = value.outputRetention
    if (marker === null || typeof marker !== 'object' || Array.isArray(marker)
      || marker.kind !== 'bash-output' || typeof marker.fullOutputPath !== 'string') {
      throw new Error('bash-spill fixture requires complete raw recovery')
    }
    const cwd = exec.agent?.session.header.cwd
    if (cwd === undefined) throw new Error('bash-spill fixture requires a session workspace')
    const path = join(cwd, 'full-bash-output.log')
    await pipeline(createReadStream(marker.fullOutputPath), createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal: exec.signal })
    paths.set(marker.fullOutputPath, path)
    return decision
  }, { prepend: true })
}
