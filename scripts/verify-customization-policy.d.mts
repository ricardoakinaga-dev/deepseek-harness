/** Return whether a repository path is owned by one policy pattern. */
export function pathMatches(path: string, pattern: string): boolean

/** Validate one parsed policy against the current custom delta. */
export function validateCustomizationPolicy(input: unknown, changedPaths: string[]): string[]

/** Validate that the fork mirror and official branch resolve to the same commit. */
export function validateMirrorIdentity(input: {
  mirrorRef: string
  officialRef: string
  mirrorCommit: string | null
  officialCommit: string | null
}): string[]
