# Fork v2 implementation report

English | [中文](fork-v2-implementation-report.zh.md)

## Summary

This report records which improvements from `deepseek-harness-v2` are available in this checkout without replacing official DeepSeek Harness packages. Purpose-scoped compaction limits, cooperative timeout handling, and pre-dispatch context admission are implemented as an optional plugin and profile bundle. The complete fork is intentionally not copied: official capabilities remain upstream-owned, unsafe replacements are excluded, and candidates that need new durable facts remain in a reviewed proposal.

## Table of Contents

- [Implementation answer](#implementation-answer)
- [Delivered extension](#delivered-extension)
- [Local activation](#local-activation)
- [Fork disposition](#fork-disposition)
- [Verification evidence](#verification-evidence)
- [Future maintenance](#future-maintenance)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="implementation-answer"></a>
## Implementation answer

The upstream-safe compaction improvements are implemented. This is a selective extraction, not a merge of every fork file: copying duplicate or incompatible mechanisms would increase drift and could make official sessions, profiles, or providers harder to update.

| Result | Scope |
|---|---|
| Implemented | Compaction output cap, optional reasoning selection, cooperative total deadline, immutable-request failure, oversized loop-request admission, installable profile layer, and durable recovery snapshot |
| Retained from official upstream | Fail-closed summary validation, model-free pruning, durable surface replacement, context-overflow retry, OAuth support, foreground shell/subprocess results, and output spill |
| Proposed | Session events for multi-call compaction, decomposed quality evaluation, loader-owned integrity metadata, data-flow-specific redaction, and operation-level Web/workflow additions |
| Requires a focused upstream change | Durable result parity for persistent terminal tools; a removable plugin cannot safely replace the registered `bash` or `pwsh` tools |
| Excluded | In-process Git updater, generic timestamp/UUID execution classifier, copied presets, private-field patches, and generated engineering corpora as runtime content |

-----

<a id="delivered-extension"></a>
## Delivered extension

The implementation consists of one behavior package, one composition package, and one keyless recorded-session case. Package READMEs own configuration, installation, failure behavior, and provider limitations.

- [`@deepseek-ai/dsh-compaction-resilience-policy`](../../packages/compaction/compaction-resilience-policy/README.md) applies the policy through the public global `llm/stream` waterfall and reads only public session and token-meter services.
- [`@deepseek-ai/dsh-resilient-compaction`](../../packages/bundle/resilient-compaction/README.md) inserts that policy as an opt-in profile patch with local-model defaults.
- [`resilient-compaction-timeout`](../../snapshots/session/resilient-compaction-timeout/session.jsonl) records preflight overflow, official recovery, compaction timeout, and the matching durable `compaction/end`.

The extension does not modify `agent-loop`, an official preset, `compaction-basic`, or the session format. Removing the bundle leaves official profile sources untouched and introduces no plugin-defined session event.

-----

<a id="local-activation"></a>
## Local activation

The local DSH home installs the packed bundle in both `web` and `headless`. Each profile manifest lists `@deepseek-ai/dsh-resilient-compaction` after its official bundles, and each profile's `pnpm-workspace.yaml` maps the unpublished policy dependency to the local tarball under `/home/ricardo/.dsh/packages`. The standalone pnpm peer checker does not model the parent module fallback and reports the policy peers as missing; resolved configuration inspection and a real Web boot confirm that DSH loads them. Both profiles show the `compaction-resilience-policy` row with the documented six values, and Web listens on `127.0.0.1:3080`; the launch token remains process-private and is not recorded here.

-----

<a id="fork-disposition"></a>
## Fork disposition

The [extraction matrix](fork-v2-extraction.md#extraction-matrix) is the detailed owner for every reviewed fork area. Each candidate must use an official public event or service, remain removable, preserve replayable model inputs, and avoid duplicating a capability already maintained upstream. The [ordered proposal](../../.agents/notes/proposed/architecture/2026-09-03-fork-v2-extension-extraction.md) defines the prerequisites for candidates that do not yet meet those conditions.

-----

<a id="verification-evidence"></a>
## Verification evidence

The following checks were executed against this checkout. The repository aggregates and focused behavior checks pass at the recorded contents.

| Check | Recorded result |
|---|---|
| Focused policy coverage | 36 tests passed; statements, branches, functions, and lines each reported 100% |
| `pnpm exec vitest run packages/bundle/resilient-compaction/tests/resilient-compaction.spec.ts` | 1 bundle manifest and patch-schema test passed |
| `pnpm run test:snapshot` | 82 headless recorded-session cases passed and 2 were skipped by their declared conditions |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run hygiene` | 16 passed, 0 failed, and 0 skipped |
| `pnpm run doc-sync` | 32 passed, 0 failed, and 0 skipped |
| `pnpm run verify-translation-pairing` | 1,128 bilingual pairs passed |
| `pnpm run verify-md-links` | 2,259 Markdown files passed link and fragment validation |
| Packed-profile smoke | Both unpublished tarballs were inspected and installed together in a temporary profile with an explicit package-manager override |
| `git diff --check` | Passed |

-----

<a id="future-maintenance"></a>
## Future maintenance

Keep these packages on top of the official default branch and re-run the focused policy test, bundle test, recorded-session suite, typecheck, lint, package checks, and documentation checks after an upstream update. Publish both packages before using the documented `dsh plugin --profile <name> add @deepseek-ai/dsh-resilient-compaction` path; source-checkout testing uses the bundle patch because workspace dependencies are not an external installation format. A deployment whose model does not advertise reasoning effort `off` must replace the complete policy configuration with a supported effort or omit `compactionReasoningEffort`.

<a id="further-exploration"></a>
## Further Exploration

- [Fork extraction guide](fork-v2-extraction.md) — repository comparison and decision matrix.
- [Compaction resilience decision](../../.agents/notes/implemented/bug-fix/2026-09-03-purpose-scoped-compaction-resilience.md) — architecture rationale, alternatives, and durable guarantees.
- [Customization index](README.md) — supported extension and bundle selection rules.

<a id="dev-note"></a>
## Dev Note

None.
