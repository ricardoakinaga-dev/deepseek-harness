/** Pin external GitHub Actions to reviewed commit identifiers. */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformWorkflowFiles } from './workflow-files.ts'

const root = resolve(import.meta.dirname, '..')
const actionPins = new Map([
  ['actions/cache/restore@v4', { sha: '0057852bfaa89a56745cba8c7296529d2fc39830', label: 'v4' }],
  ['actions/cache/save@v4', { sha: '0057852bfaa89a56745cba8c7296529d2fc39830', label: 'v4' }],
  ['actions/cache@v4', { sha: '0057852bfaa89a56745cba8c7296529d2fc39830', label: 'v4' }],
  ['actions/checkout@v4', { sha: '11d5960a326750d5838078e36cf38b85af677262', label: 'v4' }],
  ['actions/checkout@v6', { sha: 'd23441a48e516b6c34aea4fa41551a30e30af803', label: 'v6' }],
  ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', { sha: '3d3c42e5aac5ba805825da76410c181273ba90b1', label: 'v4' }],
  ['actions/configure-pages@v6', { sha: '45bfe0192ca1faeb007ade9deae92b16b8254a0d', label: 'v6' }],
  ['actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1', { sha: 'bcd2ba49218906704ab6c1aa796996da409d3eb1', label: 'v3' }],
  ['actions/deploy-pages@v5', { sha: '368f82528645a54fb793d4d04e342629a3f51346', label: 'v5' }],
  ['actions/download-artifact@v4', { sha: 'd3f86a106a0bac45b974a628896c90dbdf5c8093', label: 'v4' }],
  ['actions/download-artifact@v8', { sha: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c', label: 'v8' }],
  ['actions/setup-node@v4', { sha: '49933ea5288caeca8642d1e84afbd3f7d6820020', label: 'v4' }],
  ['actions/setup-node@v6', { sha: '249970729cb0ef3589644e2896645e5dc5ba9c38', label: 'v6' }],
  ['actions/setup-python@v6.3.0', { sha: 'ece7cb06caefa5fff74198d8649806c4678c61a1', label: 'v6.3.0' }],
  ['actions/upload-artifact@v4', { sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02', label: 'v4' }],
  ['actions/upload-artifact@v7', { sha: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', label: 'v7' }],
  ['actions/upload-pages-artifact@v5', { sha: 'fc324d3547104276b827a68afc52ff2a11cc49c9', label: 'v5' }],
  ['pnpm/action-setup@v4', { sha: 'f40ffcd9367d9f12939873eb1018b921a783ffaa', label: 'v4' }],
  ['pypa/gh-action-pypi-publish@release/v1', { sha: 'dc37677b2e1c63e2034f94d8a5b11f265b73ba33', label: 'release/v1' }],
])

const actionUsePattern = /^(\s*(?:-\s*)?uses:\s*)([^\s@]+)@([^\s#]+)(?:\s+#\s*.*)?$/u

/** Replace mutable action refs with the pinned refs in one workflow file. */
export function pinWorkflowActions(source: string): string {
  return source.split('\n').map((line) => {
    const match = actionUsePattern.exec(line)
    const action = match?.[2]
    const reference = match?.[3]
    if (match === null || action === undefined || reference === undefined || action.startsWith('./')) return line
    const pin = actionPins.get(`${action}@${reference}`)
    if (pin === undefined) return line
    return `${match[1]}${action}@${pin.sha} # ${pin.label}`
  }).join('\n')
}

/** Pin every known external action in `.github/workflows`. */
export function pinRepositoryWorkflowActions(repoRoot: string): string[] {
  return transformWorkflowFiles(repoRoot, pinWorkflowActions)
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  if (!process.argv.includes('--write')) {
    console.error('pin-workflow-actions: pass --write to update workflow files.')
    process.exitCode = 1
  } else {
    const changed = pinRepositoryWorkflowActions(root)
    console.log(`pin-workflow-actions: pinned actions in ${String(changed.length)} workflow file(s).`)
  }
}
