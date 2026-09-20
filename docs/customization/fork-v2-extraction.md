# Extracting deepseek-harness-v2 without an upstream fork

English | [中文](fork-v2-extraction.zh.md)

## Summary

The [`deepseek-harness-v2`](https://github.com/ricardoakinaga-dev/deepseek-harness-v2) fork contains useful experiments, but its branch is not a maintainable update layer over the [official repository](https://github.com/deepseek-ai/deepseek-harness): it changes a large cross-section of packages and includes generated engineering artifacts beside runtime work. The supported extraction model is a small set of independently installable plugins and profile bundles built only on official public APIs. The first slice, resilient compaction, is implemented here because it fixes the observed local-model stall without changing `agent-loop`, the session format, the shipped compaction backend, or any preset file. The remaining ideas are classified below and the ordered engineering proposal lives in the [fork extraction Agent Note](../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.md).

## Table of Contents

- [Comparison boundary](#comparison-boundary)
- [Implemented slice](#implemented-slice)
- [Extraction matrix](#extraction-matrix)
- [Upstream-safe operating model](#upstream-safe-operating-model)
- [Verification](#verification)

<a id="comparison-boundary"></a>
## Comparison boundary

Official packages, event formats, profile bundles, and preset compositions remain the source of truth. Fork code is evidence for behavior and failure cases, not a branch to merge. A candidate crosses the boundary only when it has one owner, uses documented extension points, preserves session reconstruction, validates deployment tunables, has deterministic lifecycle tests, and can be removed without making stored sessions unreadable.

The 2026-09-03 review compared the official [`dsh-v0.1.3-alpha.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1) line with the fork's [`master`](https://github.com/ricardoakinaga-dev/deepseek-harness-v2/tree/master) branch from their common ancestor. The official side has 1,834 unique commits and the fork side has 12; the fork-side ancestor diff touches 1,624 files with 139,837 additions because it includes large generated engineering and reconciliation corpora beside runtime changes. Commit and line totals therefore describe divergence cost, not the amount of product behavior worth porting.

The fork's compaction work correctly emphasizes fail-closed summaries, oversized-request prevention, replay recovery, and bounded degradation. The official repository already supplies fail-closed summary truncation, model-free tool-result pruning, durable surface replacement, canonical `CONTEXT_WINDOW_EXCEEDED` recovery, OAuth provider support, structured shell/subprocess outcomes, and output spill. Those capabilities stay upstream-owned and are not duplicated.

<a id="implemented-slice"></a>
## Implemented slice

[`@deepseek-ai/dsh-compaction-resilience-policy`](../../packages/compaction/compaction-resilience-policy/README.md) wraps the public global `llm/stream` waterfall. For auxiliary compaction it caps output, selects an optional low-cost reasoning effort, fuses a cooperative total deadline, and restores the caller's request after the stream settles. For loop-built conversation requests it combines the latest durable `request/context`, the replay-aware token meter, output reserve, and safety margin; an unsafe projection returns canonical context overflow before provider dispatch, so official recovery can compact and retry.

[`@deepseek-ai/dsh-resilient-compaction`](../../packages/bundle/resilient-compaction/README.md) installs that policy as an opt-in profile layer. The layer uses global delivery because Web compaction engines live inside agent-preset realms. It copies no preset and replaces no official service, so upstream changes to `compaction-basic` and the shipped presets continue to arrive normally.

<a id="extraction-matrix"></a>
## Extraction matrix

| Fork area | Official overlap | Disposition |
|---|---|---|
| Compaction fail-closed and replay recovery | `compaction-basic` already rejects truncated/invalid summaries and retries only after durable surface progress | Keep official implementation; add no duplicate backend |
| Oversized request prevention | Loop requests expose exact identity; sessions log route capacity; token meter exposes replay pressure | Implemented as pre-dispatch policy in `compaction-resilience-policy` |
| Compaction output, reasoning, and elapsed limits | `purpose: compaction` and cooperative signals are public; no purpose policy is shipped | Implemented as global LLM policy and opt-in bundle |
| Hierarchical multi-call summarization | Current `compaction/summary.llmStreamCall` identifies one auxiliary call | Defer until upstream provenance can represent every intermediate call; never hide calls behind the one-call marker |
| Quality and local evaluation framework | Official session events and projections can host evidence, but the fork combines scoring, policy, and reporting | Split only as a complete evaluation seam with independent providers and consumers; do not port the monolith |
| Upstream reconciliation updater | Official bundles, profile patches, package-manager updates, and Git already own composition and source updates | Do not ship an in-process Git updater; it executes outside the agent sandbox and duplicates trusted tooling |
| Extension integrity and security manifest | Loader packages have inventory and lifecycle ownership, but same-process plugins retain host authority | Preserve manifest/integrity ideas for a loader proposal; do not describe hashing as sandbox isolation |
| Redaction heuristics | Session telemetry exposes a redact waterfall, while persistence and model input have different owners | Design one policy per explicit data flow; do not apply heuristic mutation across unrelated boundaries |
| Structured execution results and retained output | Foreground Bash/PowerShell and subprocess layers already expose exit, signal, timeout, truncation, and spill facts; persistent PTY tools still return a string, while generic tool values are not durable events | Keep official schemas; treat persistent-tool parity as a focused upstream change with durable result metadata instead of porting the fork's generic timestamp/UUID classifier |
| Web transport and workflow control files | Official Web and workflow seams already exist with durable lifecycle events | Evaluate concrete missing operations separately; do not replace either seam from the fork wholesale |
| Security, release, and Linux-readiness gates | The official branch has 1,834 later commits and current repository gates own these policies | Reproduce a concrete missing failure against current upstream before porting a focused gate; do not copy historical audit output or obsolete gate inventories |
| Generated `.agent`, `.upstream`, and gauntlet artifacts | Repository gates and Agent Notes own validation and decisions | Exclude from runtime packages and bundle contents |

<a id="upstream-safe-operating-model"></a>
## Upstream-safe operating model

Keep the customization packages in a branch or repository that regularly rebases or merges the official default branch, with no copied official source. Publish each behavior package independently and let one small bundle depend on the selected set. The bundle patch inserts new ids instead of rewriting existing rows; user or deployment patches remain later layers. Every new slice must state which public event/service it consumes, which durable facts it writes, how removal affects historical sessions, and which official capability it intentionally does not duplicate.

An idea that requires modifying a frozen loop request, inventing an unregistered session event, copying a shipped preset, monkey-patching a service instance, or launching trusted update commands from inside the harness is not bundle-ready. Its prerequisite belongs upstream as a narrow public extension or durable vocabulary change, recorded before the optional implementation is built.

<a id="verification"></a>
## Verification

The policy has deterministic tests for compaction option lifetime, supported reasoning selection, cooperative timeout classification, upstream cancellation, immutable requests, exact-capacity admission, overflow rejection without adapter dispatch, HMR disposal, and Loader export handling. An integration case runs the official compaction engine through a silent cooperative adapter and proves that the timeout closes the durable `compaction/start` bracket with `compaction/end`. The keyless headless [recorded-session scenario](../../snapshots/session/resilient-compaction-timeout/session.jsonl) verifies the assembled profile path from preflight rejection through the same durable close. The bundle test parses the declared patch with the production schema and pins its dependency and defaults. Repository type, lint, documentation, package, build, and install-layout checks remain the acceptance path; the [proposal](../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.md) defines the additional evidence required for later slices.
