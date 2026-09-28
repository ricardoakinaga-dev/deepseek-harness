import { fileURLToPath } from 'node:url'

export const name = 'audit-root-env'
export const inject = ['shellEnv']

export function apply(ctx) {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  ctx.shellEnv.register({
    name,
    variables: {
      DSH_AUDIT_REPO_ROOT: { description: 'Repository root containing the public audit reconciler CLI.' },
    },
    resolve: () => ({ DSH_AUDIT_REPO_ROOT: root }),
  })
}
