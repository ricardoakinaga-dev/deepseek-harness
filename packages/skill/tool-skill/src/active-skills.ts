/** Eager projection of intact, model-visible skill instructions. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const stateSchema = z.record(z.string(), z.object({ digest: z.string(), seq: z.number().int().nonnegative() }))
type ActiveSkills = z.infer<typeof stateSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Intact direct skill results still present on the model surface. */
    activeSkills: ActiveSkills
  }
}

/**
 * Identify the rendered instructions and their provider without conflating equal names.
 * @param provider - provider of the loaded definition.
 * @param text - exact model-visible instruction text.
 * @returns stable content identity.
 */
export function skillDigest(provider: string, text: string): string {
  return createHash('sha256').update(JSON.stringify([provider, text])).digest('hex')
}

function apply(state: ActiveSkills, event: SessionEvent): ActiveSkills {
  let next = state
  if (typeof event.surfaceOp === 'object') {
    const cited = new Set<number>(event.sourceEventSeqs)
    const retained = Object.entries(state).filter(([, entry]) => !cited.has(entry.seq))
    if (retained.length !== Object.keys(state).length) next = Object.fromEntries(retained)
  }
  if (event.type !== 'tool/result' || event.data.message.isError || event.surfaceOp !== 'append') return next
  const meta = event.data.meta
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)
    || meta.kind !== 'skill-load' || meta.alreadyActive !== false
    || typeof meta.name !== 'string' || typeof meta.provider !== 'string' || typeof meta.digest !== 'string') return next
  const content = event.data.message.content
  if (content.some(block => block.type !== 'text')) return next
  const text = content.map(block => block.type === 'text' ? block.text : '').join('')
  if (skillDigest(meta.provider, text) !== meta.digest) return next
  return { ...next, [meta.name]: { digest: meta.digest, seq: event.seq } }
}

/** The same pure fold is shared by every preset instance and reconstructed on resume. */
export const activeSkillsProjection: ProjectionDefinition<'activeSkills'> = {
  key: 'activeSkills', stateVersion: 2, stateSchema, init: () => ({}), apply,
}
