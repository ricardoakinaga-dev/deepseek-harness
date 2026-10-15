/** Launcher-owned profile locations and composition inputs. */
import { join } from 'node:path'
import { composeEntries, loadProfileDirectory, PROFILE_PATCH_FILENAME, type Profile } from './profile.ts'
import { loadOptionalPatches } from './index.ts'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

/** Application-owned package manager executable; environment applies only to package operations. */
export interface ProfilePnpmInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** Checkout state observed at source launch or build time; content includes tracked and nonignored files. */
export interface RuntimeSourceIdentity {
  readonly revision: string
  readonly dirty: boolean
  readonly contentSha256: string
}

/** Verified output manifest with later disk-input observations; consumed compiler bytes are unavailable. */
export interface RuntimeBuildIdentity {
  /** Observed package version bound into the manifest; null for format-1 manifests. */
  readonly version: string | null
  /** Null for older unqualified manifests; disk observations can differ from consumed input bytes. */
  readonly inputsSource: 'disk-observation' | null
  readonly manifestSha256: string
  readonly inputsSha256: string
  readonly inputCount: number
  readonly source: RuntimeSourceIdentity | null
}

/** Observed launcher files and host facts; no loaded module byte snapshot is available. */
export interface RuntimeIdentity {
  readonly version: string | null
  /** Identifies the observed file that supplied the version, or its unavailability. */
  readonly versionSource: 'embedded-build-observation' | 'package-manifest-observation' | 'unavailable'
  readonly nodeVersion: string
  readonly platform: string
  readonly arch: string
  /** Disk bytes may differ from Node's cached executing module. */
  readonly launcher: { readonly kind: 'source' | 'artifact'; readonly sha256: string | null; readonly sha256Source: 'disk-observation' }
  /** Checkout files observed during source launch, independently of loaded generations. */
  readonly source: RuntimeSourceIdentity | null
  /** Null for source runs and artifacts without an embedded build manifest. */
  readonly build: RuntimeBuildIdentity | null
}

/** Current profile facts; scheduling and mutation belong to their callers. */
export interface ProfileContext {
  readonly name: string
  /** Absent for embedders that cannot identify their launcher. */
  readonly runtimeIdentity?: RuntimeIdentity
  /** Packaged applications supply their bundled runtime instead of a PATH executable. */
  readonly packageManager?: ProfilePnpmInvocation
  readonly dir: string
  readonly patchPath: string
  readonly installAnchor: string
  readonly cwd: string
  readonly home: string
  /** Bundle packages used to start this process, before any persisted edits. */
  readonly startedBundles: readonly string[]
  /** Parsed command-line overlays, applied above profile and home patches. */
  readonly overlays: readonly PatchOptions[]
  /** Launch-time DSH_TELEMETRY_DISABLED value; any non-empty value opts out. */
  readonly telemetryDisabledEnv: string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Present only in a profile launched by dsh. */
    profileContext: ProfileContext
  }
}

const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/**
 * Resolve the telemetry opt-out switch into its boot patch. ANY non-empty
 * value (including `'0'`/`'false'`) disables: a privacy switch prefers
 * off-by-mistake over on-by-mistake. A composition without the telemetry row
 * exports nothing, so the switch is then trivially satisfied and no patch is
 * generated — custom profiles need not mount telemetry to run with the
 * switch set.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value (`undefined` when unset).
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
export function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/** Read current bundle and user layers with the launch-time overlays.
 * @param binName Diagnostic prefix for malformed or missing configuration.
 * @param context Data supplied by the profile launcher.
 * @param initialProfile Already loaded startup profile; omitted reads the current files.
 * @returns Detached ordered patches; this function does not update the Loader.
 */
export function readProfilePatches(binName: string, context: ProfileContext, initialProfile?: Profile): PatchOptions[] {
  const profile = initialProfile ?? loadProfileDirectory(binName, context.dir, context.installAnchor, { userLayer: false })
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...(initialProfile?.patches ?? loadOptionalPatches(binName, context.patchPath) ?? []),
    ...(loadOptionalPatches(binName, join(context.home, PROFILE_PATCH_FILENAME)) ?? []),
    ...context.overlays,
  ])
  const telemetryPatch = resolveTelemetryPatch(context.telemetryDisabledEnv,
    composeEntries([patches]).some(row => row.id === TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) patches.push(telemetryPatch)
  return patches
}
