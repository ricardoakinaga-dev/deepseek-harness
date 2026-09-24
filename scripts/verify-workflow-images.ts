/** Reject workflow container images that are not pinned to content digests. */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const imagePattern = /\b(?:quay\.io\/pypa\/manylinux_2_28_(?:x86_64|aarch64)|node:\d+-alpine)(?:@sha256:[\da-f]{64})?/gu
const digestPattern = /@sha256:[\da-f]{64}$/u

/** One workflow image reference without a content digest. */
export interface WorkflowImageViolation {
  /** Repository-relative workflow path. */
  file: string
  /** One-based source line containing the image reference. */
  line: number
  /** Image reference as written. */
  image: string
}

/** Find known container images that are not content-addressed. */
export function findWorkflowImageViolations(file: string, source: string): WorkflowImageViolation[] {
  const violations: WorkflowImageViolation[] = []
  for (const match of source.matchAll(imagePattern)) {
    const image = match[0]
    if (digestPattern.test(image)) continue
    const line = source.slice(0, match.index).split('\n').length
    violations.push({ file, line, image })
  }
  return violations
}

/** Scan all workflow files for unpinned images used by the repository. */
export function scanWorkflowImageViolations(repoRoot: string): WorkflowImageViolation[] {
  const workflowRoot = resolve(repoRoot, '.github/workflows')
  return readdirSync(workflowRoot).filter(file => /\.ya?ml$/u.test(file)).sort().flatMap((file) => {
    const relative = `.github/workflows/${file}`
    return findWorkflowImageViolations(relative, readFileSync(resolve(repoRoot, relative), 'utf8'))
  })
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const violations = scanWorkflowImageViolations(root)
  if (violations.length === 0) {
    console.log('verify-workflow-images: every repository workflow image is pinned by digest.')
  } else {
    console.error('verify-workflow-images: workflow images must use content digests:')
    for (const violation of violations) console.error(`  ${violation.file}:${String(violation.line)} ${violation.image}`)
    process.exitCode = 1
  }
}
