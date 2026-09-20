---
description: "Purpose-scoped compaction deadlines, output and reasoning limits, and loop-request context admission for deployments that need bounded local-model behavior."
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-resilience-policy

English | [中文](README.zh.md)

## Summary

This package bounds slow compaction requests when their adapter honors cancellation and rejects a loop-built request that is already too large for its logged model capacity before the adapter does expensive work. Compaction calls receive a configurable output cap, optional reasoning effort, and cooperative total deadline. Ordinary model calls keep their request options unchanged. Choose the installable [`dsh-resilient-compaction`](../../bundle/resilient-compaction/README.md) bundle when you want the tested local-model defaults without editing a profile tree.

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

Mount the plugin once on the host plane. Its global `llm/stream` listener also receives compaction calls made by engines inside agent-preset realms.

### When to choose it

Choose this policy for self-hosted or throughput-limited models where a large summarization output, inherited high reasoning effort, or a long-running stream can make automatic compaction appear stuck. Keep it out when another deployment layer already owns purpose-specific LLM limits, or configure only the controls that layer does not own. The request preflight depends on the official session and token-meter services; it does not estimate unrelated hand-built calls.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-compaction-resilience-policy'
  config:
    compactionMaxTokens: 4096
    compactionReasoningEffort: 'off'
    compactionTimeoutMs: 480000
    requestPreflight: true
    requestSafetyMarginTokens: 256
    requestOutputReserveTokens: 1024
```

| Field | Default | Meaning |
|---|---:|---|
| `compactionMaxTokens` | `4096` | Upper bound applied to a `purpose: compaction` request without increasing a smaller caller cap |
| `compactionReasoningEffort` | unset | Non-empty adapter effort id applied only to compaction; the selected model must advertise it |
| `compactionTimeoutMs` | `480000` | Total cooperative compaction deadline in milliseconds |
| `requestPreflight` | `true` | Enables capacity checks for requests marked by `dsh-agent-loop` |
| `requestSafetyMarginTokens` | `256` | Extra context headroom added to the projected request |
| `requestOutputReserveTokens` | `1024` | Output reserve when a loop request has no explicit `maxTokens` |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-compaction-resilience-policy) is the exhaustive source for accepted fields.

### Outcomes and recovery

An oversized loop request ends with the canonical `CONTEXT_WINDOW_EXCEEDED` code before adapter dispatch. The official `compaction-basic` request-error handler can then prune or compact the durable surface and retry. A compaction deadline ends with `COMPACTION_TIMEOUT` only after the downstream adapter observes cancellation and settles; caller cancellation that happens first remains an ordinary aborted finish. An immutable compaction request fails closed with `COMPACTION_POLICY_IMMUTABLE_REQUEST` because silently bypassing the configured controls would restore the hang risk.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The policy uses only public extension points: the global `llm/stream` waterfall, `ctx.sessions`, and `ctx.tokenMeter`. Loop identity is process-local and exact-object based, so the preflight never mistakes an auxiliary request for a conversation step. The latest logged `request/context` supplies the matching provider, model, and context window; token measurement supplies the durable input estimate; the request's output cap and configured margin complete the projection.

Compaction request fields are changed only while the downstream stream is active and restored in `finally`, including early consumer return. The deadline fuses caller cancellation with a policy-owned timeout reason and never races the adapter against an abandoned promise. No invariant companion is published: this stateless listener reads one request and same-session snapshots synchronously, and owns no independently changing relationship that could diverge.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration validation, request admission, compaction option lifetime, and timeout translation |
| [`tests/policy.spec.ts`](tests/policy.spec.ts) | Deterministic stream, durable bracket, cancellation, capacity, disposal, and Loader-path coverage |
| — | No invariant companion; the package owns no persistent or independently observed relationship |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Compaction subsystem](../../../docs/subsystems/compaction.md) — compaction events and backend behavior.
- [Token-meter subsystem](../../../docs/subsystems/token-meter.md) — the replay-aware estimate used by request admission.
- [Resilient compaction bundle](../../bundle/resilient-compaction/README.md) — profile installation with local-model defaults.
- [Fork extraction guide](../../../docs/customization/fork-v2-extraction.md) — the disposition of each material fork feature.
- [Purpose-scoped resilience Agent Note](../../../.agents/notes/implemented/bug-fix/2026-09-03-purpose-scoped-compaction-resilience.md) — rationale and rejected alternatives.

-----

<a id="model-experience"></a>
## Model Experience

### Auxiliary compaction request

#### What the model sees

The summarization model receives the same system prompt, tool schemas, conversation prefix, and compaction instruction supplied by the selected backend. This policy changes no prompt or message content; it only bounds generation controls for a request already marked `purpose: compaction`.

#### Token effect

Compaction output is capped at `compactionMaxTokens` without increasing a smaller caller limit. A configured reasoning effort can reduce or increase hidden reasoning tokens according to the adapter; the bundle selects `off` to keep local summarization bounded.

#### KV Cache effect

Prefix-stable: message, system-prompt, and tool-schema bytes are unchanged, so this policy preserves any reusable prefix established by the compaction backend. Provider cache availability and invalidation by model or reasoning selection remain adapter-owned.

### Rejected conversation request

#### What the model sees

Nothing from the rejected attempt reaches the provider. If the installed compaction backend makes durable progress and retries, the model sees that backend's replacement checkpoint on the retry.

#### Token effect

The rejected attempt consumes zero provider tokens. The recovery compaction and retry have their ordinary package-owned token costs.

#### KV Cache effect

Independent for the rejected attempt because no provider request occurs. A later recovery replacement has the cache effect documented by the compaction backend.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These constraints define where the policy deliberately delegates or where the official extension surface cannot express more detail.

- **Timeouts are cooperative** — an adapter that ignores `AbortSignal` can still fail to settle; the policy does not abandon live provider work or emit a terminal result while cleanup continues.
- **Admission uses the token meter's estimate** — the safety margin reduces estimator risk but cannot turn heuristic tokenization into provider-exact pricing.
- **Unknown or mismatched capacity delegates** — no preflight is attempted without a live session and a latest `request/context` matching the request's provider and model.
- **The reasoning effort must exist on the selected model** — an unsupported configured id fails with the LLM service's `UNSUPPORTED_REASONING_EFFORT` result instead of silently falling back.
- **Official `compaction/summary` has no reasoning or timeout fields** — the event records provider, model, output cap, output, and usage; a waterfall-applied reasoning choice and a successful deadline are not represented. The package emits no custom session event because removable bundles must not make their historical logs unreadable.
- **`compaction/summary` keeps the backend-requested cap** — the current `compaction-basic` result records its own configured `maxTokens`, even when this waterfall lowers the adapter request. Recording every effective auxiliary-call request requires an upstream event/API extension rather than a bundle-local event.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package intentionally contains no hierarchical summarizer. Multiple hidden model calls would not fit the current one-call `llmStreamCall` marker; the [fork extraction proposal](../../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.md) defines the prerequisite before that algorithm can be ported.

</details>
