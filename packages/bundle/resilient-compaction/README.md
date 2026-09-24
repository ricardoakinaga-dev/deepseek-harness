---
description: "Private fork-only profile layer that bounds local-model compaction and rejects oversized loop requests before provider dispatch."
kind: "package-bundle"
---

# @deepseek-ai/dsh-resilient-compaction

English | [中文](README.zh.md)

## Summary

This opt-in, private fork-only bundle adds bounded compaction to a source-checkout `dsh --profile` surface without replacing the official compaction backend or copying agent presets. It caps compaction output at 4,096 tokens, selects reasoning effort `off`, applies an eight-minute cooperative deadline, and enables logged-capacity request admission. No shipped profile includes it automatically. It is not published under the upstream namespace; use the repository checkout or a separately authorized fork-owned package before installing it into a profile.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Use from the fork checkout

The private package is not available from the public registry. Exercise it from this checkout by passing [`cordis.patch.yml`](cordis.patch.yml) through `--patch`, or by using a profile workspace that maps the package and its policy dependency to local build outputs:

```text
pnpm dsh web --patch packages/bundle/resilient-compaction/cordis.patch.yml
```

The package remains private until a separate decision establishes a fork-owned namespace, registry access, release authority, and a compatible migration for consumers. Packed-install validation may use explicit local tarballs, but it is not evidence of publication or registry availability.

### What you get

The layer inserts one host plugin with global `llm/stream` delivery. Global delivery is required because Web sessions mount their official `compaction-basic` engines inside preset realms. The policy applies `compactionMaxTokens: 4096`, `compactionReasoningEffort: off`, `compactionTimeoutMs: 480000`, request preflight, a 256-token safety margin, and a 1,024-token fallback output reserve. Later profile or `--patch` layers can replace this row's whole `config` to tune those values.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is a single insert patch. It does not disable or replace `compaction-basic`; its policy wraps the public LLM waterfall, reads public session and token-meter services, and remains independent of the compaction provider's realm. This keeps official profile and preset files upgradeable from upstream. No invariant companion is published because this static carrier owns no mutable relationship; the inserted policy owns its runtime checks.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Inserts and configures the global resilience policy |
| [`src/index.ts`](src/index.ts) | Empty runtime API for the static bundle package |
| [`tests/resilient-compaction.spec.ts`](tests/resilient-compaction.spec.ts) | Manifest, dependency, YAML, and default-value checks |
| — | No invariant companion; the static carrier owns no mutable relationship |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Compaction resilience policy](../../compaction/compaction-resilience-policy/README.md) — exact behavior and configuration.
- [Fork extraction guide](../../../docs/customization/fork-v2-extraction.md) — comparison and extension boundaries.
- [Bundle package map](../README.md) — profile layer composition.
- [Profile plugin bundles Agent Note](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.md) — layer resolution and ordering.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `@deepseek-ai/dsh-compaction-resilience-policy`, which owns the bounded auxiliary call and pre-dispatch rejection behavior.

#### KV Cache effect

The bundle itself adds no request prefix. The inserted policy preserves compaction message bytes and therefore preserves the backend's reusable prefix up to provider-owned model or reasoning selection.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the bundle's deployment boundary.

- **`off` is an adapter-owned effort id** — a model that does not advertise it rejects compaction; override the complete policy row with a supported low-cost id or omit `compactionReasoningEffort`.
- **The layer expects the base services** — `llm`, `sessions`, and `tokenMeter` must exist; a minimal custom profile without them leaves the plugin waiting for dependencies.
- **Later config patches replace the complete block** — restate every value you want to retain when tuning one field.
- **The policy's event-log limitations still apply** — consult its README before relying on the event log for the effective reasoning effort or lowered output cap.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
