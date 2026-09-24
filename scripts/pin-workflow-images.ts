/** Pin workflow container images to reviewed content digests. */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformWorkflowFiles } from './workflow-files.ts'

const root = resolve(import.meta.dirname, '..')
const imagePattern = /\b(?:quay\.io\/pypa\/manylinux_2_28_(?:x86_64|aarch64)|node:\d+-alpine)(?:@sha256:[\da-f]{64})?/gu
const imagePins = new Map([
  ['quay.io/pypa/manylinux_2_28_x86_64', 'e84d335c4c0ab4dbc8efcd055a645d9665eed249454fe068a58355698944accd'],
  ['quay.io/pypa/manylinux_2_28_aarch64', 'dd795d9b88abe7960ef59f980472e4792ebbf2f70b5967f529286bfb5fb68fb8'],
  ['node:20-alpine', 'fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293'],
  ['node:22-alpine', 'b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85'],
  ['node:24-alpine', 'ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1'],
  ['node:26-alpine', 'dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070'],
])

/** Replace mutable known workflow image references with their reviewed digests. */
export function pinWorkflowImages(source: string): string {
  return source.replace(imagePattern, (image) => {
    if (image.includes('@sha256:')) return image
    const digest = imagePins.get(image)
    if (digest === undefined) return image
    return `${image}@sha256:${digest}`
  })
}

/** Pin every known workflow image in `.github/workflows`. */
export function pinRepositoryWorkflowImages(repoRoot: string): string[] {
  return transformWorkflowFiles(repoRoot, pinWorkflowImages)
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  if (!process.argv.includes('--write')) {
    console.error('pin-workflow-images: pass --write to update workflow files.')
    process.exitCode = 1
  } else {
    const changed = pinRepositoryWorkflowImages(root)
    console.log(`pin-workflow-images: pinned images in ${String(changed.length)} workflow file(s).`)
  }
}
