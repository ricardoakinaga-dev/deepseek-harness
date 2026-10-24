/**
 * @deepseek-ai/dsh-harness-dev-context — model context for an agent that can
 * inspect and extend the DeepSeek Harness serving its Web GUI. It registers
 * path- and URL-free prompt sections, scopes development guidance through
 * validated deployment policy and the Session's effective working directory,
 * and states the current implementation checkout and Web GUI URL as runtime
 * context. Process values never enter new system-prompt paragraphs.
 * A Session whose admitted prompt holds the paragraphs that embedded those
 * values keeps them verbatim, so resuming it never rewrites its logged prompt.
 * @module @deepseek-ai/dsh-harness-dev-context
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-web-app'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'harness-dev-context'

/** Prompt and projection registries, the Web GUI, and the Session directory owner. */
export const inject = ['systemPrompt', 'sessionProjections', 'webApp', 'workingDirectory']

/** Deployment policy for checkout and Web rebuild guidance. */
export interface Config {
  /** Include development guidance for this checkout's Sessions, every Session, or none. */
  developmentContext: 'auto' | 'always' | 'never'
}

export const Config: z<Config> = z.object({
  developmentContext: z.union(['auto', 'always', 'never'] as const).default('auto').extra('extra', { audit: true }),
})

/** This installation's root, four directories above this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/** Prompt-section and runtime-context name for the implementation checkout. */
const HARNESS_SOURCE = 'harness:source'

/** Prompt-section and runtime-context name for the Web GUI orientation and its URL. */
const WEB_SURFACE = 'app:web-surface'

const HARNESS_SOURCE_GUIDANCE = 'The checkout location and current working directory are separate values and may differ; '
  + 'never infer the working directory from the checkout path. Use pwd to determine the current working directory. '
  + 'Use this checkout only to inspect or extend DSH itself.'

const HARNESS_SOURCE_PROMPT = `The runtime context names the DeepSeek Harness implementation checkout. ${HARNESS_SOURCE_GUIDANCE}`

const WEB_ORIENTATION = 'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. '
  + 'The browser provides no implicit DOM, route, or screenshot context. '

const WEB_DEVELOPMENT = 'The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while '
  + '`pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. '
  + 'Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. '
  + 'Starting another server does not update this GUI. '
  + 'The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. '

const WEB_SERVER_GUIDANCE = 'Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.'

/** GUI orientation remains available when checkout-specific guidance is disabled. */
function webSurfacePrompt(development: boolean): string {
  return 'You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. '
    + WEB_ORIENTATION + (development ? WEB_DEVELOPMENT : '') + WEB_SERVER_GUIDANCE
}

/** Compare physical paths so links into the checkout work and links out do not admit unrelated projects. */
function insideCheckout(root: string, cwd: string): boolean {
  let directory: string
  try {
    directory = realpathSync(cwd)
  } catch (error) {
    // An unavailable directory cannot identify a checkout; other filesystem failures remain visible.
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false
    throw error
  }
  const path = relative(root, directory)
  return path === '' || path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

/**
 * Fixed text around the value in each paragraph that embedded it, frozen as
 * those releases rendered it: never edit these together with the current
 * guidance, or Sessions holding the earlier paragraphs stop matching and
 * rewrite their logged prompt.
 */
const LEGACY_SOURCE = {
  prefix: 'The DeepSeek Harness implementation checkout is at ',
  suffix: '. The checkout location and current working directory are separate values and may differ; '
    + 'never infer the working directory from this path. Use pwd to determine the current working directory. '
    + 'Use this checkout only to inspect or extend DSH itself.',
}
// The frozen copy repeats today's guidance on purpose; the two may diverge.
/* jscpd:ignore-start */
const LEGACY_WEB_SURFACE = {
  prefix: 'You are interacting with the user through the DeepSeek Harness Web GUI at ',
  suffix: '. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. '
    + 'The browser provides no implicit DOM, route, or screenshot context. '
    + 'The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while '
    + '`pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. '
    + 'Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. '
    + 'Starting another server does not update this GUI. '
    + 'The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. '
    + 'Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.',
}
/* jscpd:ignore-end */

/** Host-only projection key of the value-bearing paragraphs a Session admitted. */
const LEGACY_PROMPT = 'harnessDevLegacyPrompt'

const legacyPromptSchema = zod.object({ source: zod.string().nullable(), web: zod.string().nullable() })

/** Value-bearing paragraphs of the latest nonempty system prompt a Session committed; `null` where it has none. */
type LegacyPrompt = zod.infer<typeof legacyPromptSchema>

/** The complete single-line paragraph between `prefix` and `suffix`, or `null` when the prompt has none. */
function legacyParagraph(prompt: string, { prefix, suffix }: { prefix: string; suffix: string }): string | null {
  const start = prompt.indexOf(prefix)
  if (start < 0) return null
  const end = prompt.indexOf(suffix, start + prefix.length)
  if (end < 0) return null
  const paragraph = prompt.slice(start, end + suffix.length)
  return paragraph.includes('\n') ? null : paragraph
}

/**
 * Fold one committed event into the admitted paragraphs. Like the loop's own
 * prompt-version reading, only a single nonempty text block is a prompt
 * version; an emptied or other version keeps the previous state, because a
 * series consolidation can log only the emptied later version.
 */
function foldLegacyPrompt(state: LegacyPrompt, event: SessionEvent): LegacyPrompt {
  if (event.type !== 'system/message') return state
  const { content } = event.data.message
  const [block] = content
  if (content.length !== 1 || block?.type !== 'text' || block.text === '') return state
  const source = legacyParagraph(block.text, LEGACY_SOURCE)
  const web = legacyParagraph(block.text, LEGACY_WEB_SURFACE)
  return source === state.source && web === state.web ? state : { source, web }
}

const ADMITS_NOTHING: LegacyPrompt = { source: null, web: null }

/**
 * Register the two sections, their runtime-context values, and the
 * projection that keeps a Session's admitted paragraphs.
 * @param ctx - plugin context with every {@link inject} service.
 * @param config - validated deployment policy; exact admitted legacy paragraphs remain verbatim in every mode.
 * @returns when the projection reader and prompt registrations are ready.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // Installed packages without Git checkout metadata do not enable development guidance automatically.
  const checkoutRoot = config.developmentContext === 'auto' && existsSync(join(SOURCE_ROOT, '.git'))
    ? realpathSync(SOURCE_ROOT) : undefined
  const development = (context: AssembleContext): boolean => {
    if (config.developmentContext === 'always') return true
    if (config.developmentContext === 'never' || checkoutRoot === undefined || context.agent === undefined) return false
    return insideCheckout(checkoutRoot, ctx.workingDirectory.get(context.agent.session))
  }
  const legacyPromptProjectionHandle = await ctx.sessionProjections.register({
    key: LEGACY_PROMPT,
    stateVersion: 1,
    stateSchema: legacyPromptSchema,
    init: () => ADMITS_NOTHING,
    apply: foldLegacyPrompt,
  })
  const admitted = (context: AssembleContext): LegacyPrompt => {
    const session = context.agent?.session
    return session === undefined ? ADMITS_NOTHING : legacyPromptProjectionHandle.stateOf(session)
  }
  ctx.systemPrompt.section({
    name: HARNESS_SOURCE,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'),
    interpolate: false,
    text: context => admitted(context).source ?? (development(context) ? HARNESS_SOURCE_PROMPT : ''),
  })
  ctx.systemPrompt.context({
    name: HARNESS_SOURCE,
    order: ctx.systemPrompt.getContextOrder('HARNESS_SOURCE'),
    interpolate: false,
    text: context => development(context) ? `Current DeepSeek Harness implementation checkout: ${JSON.stringify(SOURCE_ROOT)}.` : '',
  })
  ctx.systemPrompt.section({
    name: WEB_SURFACE,
    order: ctx.systemPrompt.getSectionOrder('WEB_SURFACE'),
    interpolate: false,
    text: context => admitted(context).web ?? webSurfacePrompt(development(context)),
  })
  ctx.systemPrompt.context({
    name: WEB_SURFACE,
    order: ctx.systemPrompt.getContextOrder('WEB_SURFACE'),
    interpolate: false,
    text: () => `Current DeepSeek Harness Web GUI URL: ${JSON.stringify(ctx.webApp.getAdvertisedUrl())}.`,
  })
}
