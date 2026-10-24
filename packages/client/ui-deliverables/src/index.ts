/**
 * Deliverables plugin, node half. Serves authenticated native opens and saved-copy downloads. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace-changes/types'
import { registerPresentOpen } from './present-open.ts'
import { registerPresentDownload } from './present-download.ts'

/** Services required for change summaries and authenticated native opens and saved-copy downloads. */
export const inject = ['connection', 'sessionQuery', 'sessionController', 'workspaceFiles', 'fs', 'sandboxPolicy', 'workspaceChanges', 'attachments']

/**
 * Register native opens and saved-copy downloads for declared files.
 * @param ctx - host context carrying file and connection services.
 */
export function apply(ctx: Context): void {
  registerPresentOpen(ctx)
  registerPresentDownload(ctx)
}
