/** Client-safe configuration form views and change notifications. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'

/** Nominal id of one profile plugin entry. */
export type SettingsNamespace = Branded<'SettingsNamespace'>

/** One schema-declared secret slot inside a redacted namespace value. */
export interface SettingsSecretView {
  /** Path from the section root to the removed field. */
  path: string[]
  /** Whether the slot currently holds a value; the value itself never rides. */
  set: boolean
}

/**
 * Wire view of one profile plugin entry, always read under `redactSecrets`. The
 * JSON-valued fields are `JsonValue` rather than the descriptor's `unknown`
 * because the Remote boundary admits no unconstrained data.
 */
export interface SettingsNamespaceView {
  /** Generate a page if no custom page is registered for this instance. */
  autoGenerate: boolean
  /** Namespace key (`llm-deepseek`, `llm-pi-ai`, …). */
  ns: string
  /** Serialized schemastery schema envelope (`schema.toJSON()`); rehydrate with `new Schema(json)`. */
  schema: JsonValue
  /** Redacted resolved value (schema defaults → composition base → user layer). */
  value: JsonValue
  /** Redacted composition base layer, with defaults resolved. */
  base?: JsonValue
  /** Redacted raw user section, when one exists; a field's presence here marks it user-overridden. */
  user?: JsonValue
  /** When the owner applies changes. */
  applies: 'live'
  /** Every schema-declared secret slot with its configured state. */
  secrets: SettingsSecretView[]
  /**
   * Monotonic revision of the raw entry configuration this view was read at. Send it
   * back as `expectedRevision` on a write so a stale editor is refused rather
   * than silently overwriting a concurrent change.
   */
  revision: number
}

/**
 * One path-addressed edit carried by a remote settings write. `set` writes the
 * value at the path, creating intermediate objects; `unset` removes it. The
 * empty path addresses the section root.
 */
export type SettingsPathOpView =
  | { op: 'set'; path: string[]; value: JsonValue }
  | { op: 'unset'; path: string[] }

/** Every profile plugin entry with the deployment facts a configuration page renders around them. */
export interface SettingsDescribeValue {
  /** Whether the profile accepts writes; `false` disables every write control. */
  writable: boolean
  /** Whether the configuration editor owns a local document, without exposing its Host path. */
  hasDocument: boolean
  /** One view per profile plugin entry. */
  namespaces: SettingsNamespaceView[]
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One profile entry's form values, availability, or page policy changed.
     * Form clients re-read its schema, resolved values, and revision.
     * @param ns Profile entry id.
     * @param revision The entry's new revision.
     * @mode emit
     */
    'settings/document-updated'(ns: SettingsNamespace, revision: number): void
  }
}

/** Safe resolved values from one explicitly audited plugin configuration. */
export interface AuditedConfigurationEntry {
  /** Unique Loader entry id. */
  id: string
  /** Module name; null values indicate removal from the audited configuration. */
  plugin: string
  values: JsonValue | null
}

/** JSON snapshot of launcher facts; independent of Host-only boot services. */
export interface RuntimeAuditIdentity {
  version: string | null
  /** Absent in historical records; no source version is inferred for unversioned artifacts. */
  versionSource?: 'embedded-build-observation' | 'package-manifest-observation' | 'unavailable'
  nodeVersion: string
  platform: string
  arch: string
  /** Disk observation, independent of the cached executing module; historical qualifiers remain absent. */
  launcher: { kind: 'source' | 'artifact'; sha256: string | null; sha256Source?: 'disk-observation' }
  /** Git facts describe observed source checkout files, not loaded code generations. */
  source: { revision: string; dirty: boolean; contentSha256: string } | null
  /** Verified output manifest with later disk-input observations; null for source runs or absent manifests. */
  build: {
    /** Absent in historical records; null for format-1 embedded manifests. */
    version?: string | null
    /** Absent in historical records; null for unqualified manifests. Consumed compiler bytes remain unknown. */
    inputsSource?: 'disk-observation' | null
    manifestSha256: string
    inputsSha256: string
    inputCount: number
    source: { revision: string; dirty: boolean; contentSha256: string } | null
  } | null
}

/** Active Loader entry; byte and package facts require a captured loaded generation. */
export interface AuditedPluginIdentity {
  /** Unique Loader entry id. */
  id: string
  /** Configured module specifier. */
  plugin: string
  /** Loaded module bytes; null because the current Loader retains no source-byte snapshot. */
  moduleSha256: string | null
  /** Null when package metadata cannot be tied to the loaded module generation. */
  package: { name: string; version: string | null; manifestSha256: string } | null
}

/** One registered provider's effective policy; credential and adapter options are excluded. */
export interface AuditedProviderRetryPolicy {
  provider: string
  policy: ResolvedRetryPolicy
}

/** Execution identity and explicitly selected configuration, retained in Session exports. */
export type RuntimeAuditEventData = {
  reason: 'initial'
  /** Child and resumed sessions record their own current launcher identity. */
  runtime: RuntimeAuditIdentity | null
  profile: string
  startedBundles: string[]
  configuration: AuditedConfigurationEntry[]
  plugins: AuditedPluginIdentity[]
  /** Absent in historical records; null when the LLM service is unavailable. */
  providerRetryPolicies?: AuditedProviderRetryPolicy[] | null
} | {
  reason: 'reload'
  /** Complete active plugin inventory when composition changes or a module is replaced. */
  plugins?: AuditedPluginIdentity[]
  /** Only entries whose audited values changed; null values remove an entry. */
  configuration: AuditedConfigurationEntry[]
  /** Complete registered-policy inventory when it changes; null when unavailable. */
  providerRetryPolicies?: AuditedProviderRetryPolicy[] | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Launcher identity and explicitly audited configuration changes. */
    'runtime/audit': RuntimeAuditEventData
  }
}
