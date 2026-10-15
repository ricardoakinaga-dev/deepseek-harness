/** Browser entry for the optional Codex authorization Remote and Models control. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import remote from '@deepseek-ai/dsh-experimental-codex-login/remote'
import { CodexLogin, type CodexLoginActions } from './CodexLogin.tsx'
import { en, NS, zh } from './locales.ts'

/** Required browser services after the optional Remote is mounted. */
export const inject = ['remote', 'slots', 'locale']

/**
 * Mount the private Codex Remote and provider-card control.
 * @param ctx - browser runtime.
 * @param contribution - generated Remote methods.
 * @returns disposer for the UI and Remote contribution.
 */
export async function mount(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.codexLogin', 'slots', 'locale'], (child) => {
    child.effect(() => child.locale.register(NS, { zh, en }))
    const actions: CodexLoginActions = {
      status: async () => {
        const result = await child.remote.codexLogin.status()
        if (!result.ok) throw result.error
        return result.value
      },
      login: signal => child.remote.codexLogin.login(signal),
      signOut: async () => {
        const result = await child.remote.codexLogin.signOut()
        if (!result.ok) throw result.error
      },
    }
    child.slots.inject('settings.models.provider-card', () => child.slots.register({
      name: 'settings.models.provider-card', key: 'llm-pi-ai', locale: NS,
      inject: () => actions,
    }, CodexLogin))
  })
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}

/** @param ctx - browser runtime. @returns disposer for the optional contribution. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mount(ctx, remote)
}
