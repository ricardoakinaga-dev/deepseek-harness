---
description: "Installable profile layer that bounds local-model compaction and rejects oversized loop requests before provider dispatch."
kind: "package-bundle"
---

# @deepseek-ai/dsh-resilient-compaction

English | [中文](README.zh.md)

## Summary

This opt-in bundle adds bounded compaction to any base-backed `dsh --profile` surface without replacing the official compaction backend or copying agent presets. It caps compaction output at 4,096 tokens, selects reasoning effort `off`, applies an eight-minute cooperative deadline, and enables logged-capacity request admission. No shipped profile includes it automatically. Install it when local or throughput-limited models make automatic compaction slow enough to stall a session.

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

### Install into a profile

Install or remove the bundle with the profile plugin command:

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-resilient-compaction
dsh plugin --profile <name> remove @deepseek-ai/dsh-resilient-compaction
```

Published installs resolve the package and its policy dependency through the profile's package manager. A source-checkout `file:` install is not valid before publication because its manifest still uses the workspace protocol. Exercise the checkout after a focused build by passing [`cordis.patch.yml`](cordis.patch.yml) through `--patch`; packed-install validation must make both unpublished tarballs available to the profile package manager. After a successful add, profile reconciliation reads `dsh.bundle.patch` and activates the layer; a missing patch declaration leaves an installed plain dependency and produces a warning.

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
