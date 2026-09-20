# Agent Note: Purpose-scoped compaction resilience outside the core loop

Status: implemented

English | [中文](2026-09-03-purpose-scoped-compaction-resilience.zh.md)

## Problem

A local OpenAI-compatible model can make automatic compaction appear stuck when the summarizer inherits an expensive reasoning default, requests a large output allowance, and has no compaction-specific total deadline. The affected session records `compaction/start` but cannot record `compaction/end` until the auxiliary stream settles. The official backend already owns safe region selection, pruning, summary validation, durable replacement, and context-overflow recovery; copying or editing those mechanisms would create a second compaction implementation that drifts from upstream.

The fork demonstrates useful request-size and compaction controls, but its implementation changes the loop and many unrelated packages. The optional fix needs to reach Web compaction engines mounted inside preset realms, remain removable, and preserve the official session format and provider lifecycle.

## Decision

`@deepseek-ai/dsh-compaction-resilience-policy` is a stateless host plugin over the public global `llm/stream` waterfall. For a mutable request marked `purpose: compaction`, it caps `maxTokens` without raising a smaller cap, applies an optional adapter-owned reasoning effort, and fuses the caller signal with a configurable total deadline. The wrapper waits for downstream settlement, translates only its own timeout to `COMPACTION_TIMEOUT`, and restores every temporary request field in `finally`. An immutable compaction request fails closed because the plugin cannot apply its declared controls safely.

For requests carrying the exact process-local `dsh-agent-loop` marker, the plugin reads the live session's latest matching `request/context` and the replay-aware token meter. It projects input tokens plus the request's output allowance or configured fallback and a safety margin. A projection over the logged context window returns canonical `CONTEXT_WINDOW_EXCEEDED` without adapter dispatch. The existing request-error compaction policy remains the sole owner of pruning, summarization, progress proof, and retry.

`@deepseek-ai/dsh-resilient-compaction` installs the policy as an opt-in profile bundle with local-model defaults: 4,096 output tokens, reasoning effort `off`, a 480-second deadline, request admission, a 256-token margin, and a 1,024-token fallback output reserve. The listener is global so one host insertion receives calls from compaction engines inside standing preset compositions. The output budget is large enough for the official structured checkpoint prompt to terminate on the validated local model; a smaller truncating budget cannot be treated as a successful summary. The bundle inserts a new row and copies or patches no official preset.

The plugin emits no custom session event. The public `Session.append` API cannot mark a plugin-defined event ignorable, so such an event would make historical logs unreadable after removing the bundle. Current `compaction/summary` fields also cannot record the effective reasoning choice or distinguish a waterfall-lowered cap from the backend-requested cap; that limitation stays explicit until an upstream vocabulary extension exists.

This decision extends the [compaction capability seam](../feature/2026-06-18-compaction-capability-seam.md), [replay token meter](../../archived/architecture/2026-07-15-replay-token-meter-service.md), [context-overflow recovery](../architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md), [reconstructable request](../architecture/2026-07-05-reconstructable-requests.md), and [profile bundle](../architecture/2026-08-05-profile-plugin-bundles.md) decisions. Each remains active and owns its broader contract; the overlap is partial, so none is superseded or eligible for archival.

## Alternatives considered

**Merge the fork's compaction stack.** Rejected because it changes core request construction and carries a broad divergent package graph. The official backend already owns most of the safety behavior, so the merge would duplicate current mechanisms and make upstream updates expensive.

**Change `agent-loop` to add a request-preflight event.** Rejected for this opt-in fix because `llm/stream`, loop-request identity, `request/context`, and the token meter provide sufficient admission facts. A loop change would broaden the core contract for one deployment policy.

**Copy each shipped preset and lower `compaction-basic.maxTokens`.** Rejected because copied presets are full snapshots that drift. A global listener reaches every preset realm without duplicating their composition.

**Race the provider against a timer and return immediately.** Rejected because abandoned provider work can continue consuming resources and mutate state after the caller sees a terminal result. The deadline is cooperative and returns only after the downstream iterator settles.

**Port hierarchical summarization behind one `llmStreamCall` marker.** Rejected because the current durable marker identifies exactly one auxiliary call. Hidden intermediate calls would break request reconstruction and attribution of token usage to the calls that produced it.

## Testing

Deterministic fake-timer tests cover timeout ownership, upstream cancellation, downstream settlement, signal and option restoration, immutable requests, supported reasoning selection, and cap monotonicity. An integration test runs the official compaction engine through a cooperative adapter that ends silently after cancellation and verifies that the policy timeout produces the matching durable `compaction/end`. A keyless headless recorded-session scenario covers the assembled profile path: a tool result crosses the newly logged capacity, preflight prevents the second adapter dispatch, official recovery opens compaction, and the policy deadline closes it. Real session and token-meter tests cover exact-capacity admission, route mismatch, preflight disablement, global-listener disposal, and Loader named-export handling. The bundle test parses its declared patch with the production entry schema and pins the dependency and every configured value.

## Consequences

Local deployments can bound the exact auxiliary call that caused the observed stall while continuing to use the official compaction engine and presets. Oversized loop requests fail before provider work and enter the official recovery path through its canonical error code. Ordinary model calls remain unchanged, and removing the bundle adds no unreadable durable vocabulary.

The policy remains limited by cooperative adapters and heuristic token measurement. Models that do not advertise the configured reasoning effort reject it explicitly. Successful compaction records retain the backend-requested cap and omit reasoning and deadline facts, so recording every effective auxiliary-call request remains an upstream prerequisite rather than a bundle claim.
