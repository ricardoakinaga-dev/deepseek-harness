---
description: "Inspect and edit live plugin configuration through Config-derived forms."
kind: "package-reference"
---

# @deepseek-ai/dsh-settings

English | [中文](README.zh.md)

## Summary

Edit fields that plugins declare with `.volatile()` and inspect their effective values. Forms identify each plugin by its profile entry id, preserve secret values, and refuse stale writes. Changes persist through the active profile’s Cordis patch.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount this plugin with Loader and [config-editor](../../boot/config-editor/README.md). The base bundle provides this composition.

```yaml
- id: settings
  name: '@deepseek-ai/dsh-settings'
```

This plugin has no configuration fields. Forms expose only volatile fields from active, uniquely addressed profile entries. Ordinary configuration remains editable through Cordis configuration files.

Once the Loader has settled every entry after Settings starts, a `settings.yaml` left in the harness home by earlier releases is imported once: each section is written into the entry of the same id (`ui-developer-tools` → `ui-settings`, `ui-onboarding` → `ui-settings-general`, `shell` → the platform's shell executor entry), the file is renamed to `settings.yaml.imported` before the first write, and a section the running composition rejects is logged and stays only in the renamed file.

Reset restores the value beneath the profile override, including schema defaults. Home patches and command-line overlays take precedence; a form write that they would override is refused.

Each form reports `autoGenerate`, enabled by default, for clients that build pages from the schema; no shipped client does so yet. A plugin that ships its own page registers `configure({ auto: false }, ctx.fiber)` as an effect inside an optional `ctx.inject(['settings'], ...)` child from `apply`: the child names the plugin fiber the policy belongs to, a late-loading or replaced Settings service picks the policy up, and the business plugin runs without Settings. The policy does not remove configuration reads or writes.

The `runtimeAudit` plugin namespace observes execution independently of SettingsForms and ConfigEditor. When Session and Agent services are present, it records `runtime/audit` for each published agent session, including children, resumed sessions, and agents already live when the observer activates. The awaited `agent/created` hook appends after Session creation observers receive their baseline; audit failure rejects agent publication. Bare Sessions receive no execution audit. Initial records include the profile, startup bundles, [launcher identity](../../../apps/cli/README.md#runtime-identity), and every active Loader entry, including nested Includes. Unknown facts remain `null`, and existing records are never rewritten.

The current Loader retains module namespaces without captured source bytes or package manifests for their loaded generation. Module hashes and package identities therefore remain `null`; current resolver results and disk contents cannot identify code retained in Node's cache, including code restored after failed HMR. The launcher hash is a disk observation through `sha256Source`; `build.inputsSource` likewise qualifies later disk reads, not consumed compiler-input identity. `versionSource` identifies an observed package manifest or embedded build. Historical records without those qualifiers remain unchanged.

Plugin owners opt fields into audit with `.extra('extra', { audit: true })`. The projection reads active Loader entries' resolved Config, including schema defaults and volatile references; it excludes unmarked and unknown fields. Marks propagate through declared containers, and unions select only their accepted alternative. Audited subtrees containing `secret` or `credential-ref` roles, including dictionary key schemas, or unconstrained schemas fail before logging. This configuration projection does not inspect transformations outside Config.

`providerRetryPolicies` records every registered LLM route's effective policy through the LLM service, including native DeepSeek defaults and pi-ai policies. The observer copies only retry mode, retry counts/codes, and backoff fields; credentials, headers, and adapter options are excluded. This inventory is independent of schema-selected configuration, which describes declared Config values even when a provider rejects a registration change. `null` means the LLM service is unavailable; an empty list means it has no registered routes. Historical records without this field retain unknown policy identity.

After a settled profile patch, Include refresh or optional HMR module replacement attempt, or LLM registration change, audit records contain changed configuration entries; `values: null` records removal. Settlement reports actual active state after Loader completion, including sibling changes or removal before another activation or module rollback fails; a failed parse that preserves the running tree produces no change. The profile success notification remains separate. A changed plugin inventory or successful module replacement adds the complete active inventory, even when loaded-byte identities remain unknown. A changed registered-policy inventory adds the complete `providerRetryPolicies` snapshot. Changes limited to unmarked fields produce no audit event when composition and effective policies are unchanged and no module was replaced. These declared Session events remain in exported logs and require a reader that recognizes `runtime/audit`. Config-only compositions work without Session or Agent services.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [form projection](src/schema.ts) strips runtime references and ordinary fields. The [service](src/index.ts) supplies revisioned descriptors and validates edits against the full plugin Config before delegating persistence. Business plugins read their Config references directly.

Secret roles are redacted from values, inherited values, profile overrides, and schema defaults; clients receive presence markers. Path edits preserve fields a client did not receive. No invariant companion is published because the service projects Loader configuration rather than maintaining an independent authoritative value.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Settings reference](../../../docs/subsystems/settings.md) — form values and mutations.
- [Volatile configuration](../../../vendor/loader/README.md) — reference lifetime and notifications.
- [Configuration editor](../../boot/config-editor/README.md) — persistence and reload ordering.

<a id="model-experience"></a>
## Model Experience

Indirectly, through configuration values consumed by model-facing plugins.

#### KV Cache effect

Consumers that change request prefixes determine cache effects.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Nested Includes own separate configurations and are not editable through the active profile’s form.
- Field-level resets restore inherited values; they cannot delete a value supplied by a lower configuration layer. Unsetting an array index removes that element.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
