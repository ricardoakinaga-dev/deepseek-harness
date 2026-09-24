/** Apply one deterministic source transform to repository workflow files. */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Transform every YAML workflow in lexical order and write only changed files.
 * @param repoRoot - Repository root containing `.github/workflows`.
 * @param transform - Pure source transformation to apply to each workflow.
 * @returns Repository-relative workflow paths whose content changed.
 */
export function transformWorkflowFiles(repoRoot: string, transform: (source: string) => string): string[] {
  const workflowRoot = resolve(repoRoot, '.github/workflows')
  const changed: string[] = []
  for (const file of readdirSync(workflowRoot).filter(name => /\.ya?ml$/u.test(name)).sort()) {
    const relative = `.github/workflows/${file}`
    const path = resolve(repoRoot, relative)
    const source = readFileSync(path, 'utf8')
    const transformed = transform(source)
    if (transformed !== source) {
      writeFileSync(path, transformed)
      changed.push(relative)
    }
  }
  return changed
}
