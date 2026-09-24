# M0 repository analysis — 2026-09-20 (updated 2026-09-21)

English | [中文](repository-analysis-2026-09-20.zh.md)

## Summary

This report records the updated M0 analysis and focused follow-up evidence for the DeepSeek Harness fork. It distinguishes reproduced failures, environment prerequisites, deferred release lanes, and control-plane validation so that a passing command cannot hide an unqualified criterion. AAA-021 now makes standalone hygiene's build prerequisite explicit and passes its 17-leaf aggregate, but the repository is not release-qualified because the latest aggregate `check:all` run has 55 passing gates, 6 failing gates, and 6 dependency-skipped gates, while security-review, publication, and platform lanes remain open.

The Gauntlet v1.4 run was rebaselined after the material evidence and documentation updates. Its state remains `ACTIVE` in `BUILD_RUN` and requires fresh same-candidate release gates; rebaselining synchronizes candidate identity but does not make any Quality Bar criterion pass.

## Table of Contents

- [Scope and status](#scope-and-status)
- [Evidence identity](#evidence-identity)
- [Current findings](#current-findings)
- [Updates since the M0 baseline](#updates-since-the-m0-baseline)
- [Release-lane matrix](#release-lane-matrix)
- [Quality Bar reconciliation](#quality-bar-reconciliation)
- [Ownership and next action](#ownership-and-next-action)
- [Reproducibility](#reproducibility)
- [Limitations](#limitations)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

## Scope and status

<a id="scope-and-status"></a>

The analysis covers the `custom/main` checkout, the M0 reproduction action `AAA-001:A02`, completed focused follow-up actions through `AAA-021:A01`, completed `AAA-018:A03` canonical metrics and README parity work, current read-only decision packets for `AAA-012:A01`, `AAA-014:A01`, `AAA-015:A01`, `AAA-019:A01`, `AAA-020:A01`, and `AAA-022:A01`, plus release-readiness packets for `AAA-023:A01` and `AAA-024:A01`; the active control-plane pointer is `AAA-009:A02`, awaiting the maintainer's client-domain ownership and shared-API decision. The source baseline is the immutable tag `aaa-m0-source-2026-09-20`; the savepoint tag `aaa-savepoint-2026-09-20-m0-a02-01` identifies the clean control-plane starting point, and current evidence updates remain in the working tree.

The current decision is **FAIL — not release-qualified**. The result is based on current command records and retained raw-output digests, not on the historical audit scores of 86 or 65.

The latest `pnpm run check:all` run completed with a non-zero result: 55 gates passed, 6 failed, and 6 were skipped after the build dependency failed. The client-domain graph reported 38 violations; the build reported two missing temporary `oxlint-contract-...ts` files; the module graph reported three stale artifacts; the repository-reference and concrete-term gates retained their two historical findings; and the test gate reported 20 failing tests across 11 files. The aggregate remains blocked and does not qualify the release candidate. Evidence is in [`AAA-023/check-all-a02.json`](../../.agent/evidence/AAA-023/check-all-a02.json).

The engineering control plane is consistent: `check_state.py` reports 11 passes and 0 failures, but that check validates evidence bookkeeping and does not replace the 14 required Quality Bar criteria.

AAA-013 is now complete at its scoped acceptance: resolved static targets are contained by the configured root, outside symlink or junction targets return 403 without external bytes, and in-root aliases remain usable. The implementation and real-composition evidence are current in [`AAA-013/findings-a02.json`](../../.agent/evidence/AAA-013/findings-a02.json) and [`commands-a02.jsonl`](../../.agent/evidence/AAA-013/commands-a02.jsonl).

AAA-011 is also complete at its scoped acceptance. The Bash and PowerShell providers, paired READMEs, durable rationale, and focused timeout assertions now agree on the full timeout prefix and fresh-shell reset message. The Bash SDK snapshot passes; the official PowerShell headless snapshot is discovered and skipped by its manifest because this Linux host has no supported `pwsh` executable. Evidence is in [`AAA-011/findings-a02.json`](../../.agent/evidence/AAA-011/findings-a02.json) and [`commands-a02.jsonl`](../../.agent/evidence/AAA-011/commands-a02.jsonl).

AAA-016 is complete at its bounded governance acceptance. The verifier now rejects `packageRoots` on `configuration`, `profile-patch`, and `skill` records, while packaged-extension roots remain valid. The focused policy suite passes 7/7, the invalid matrix reports actionable failures for all three non-packaged types, and the top-level verifier reports 171 attributed custom paths across five improvements. Evidence is in [`AAA-016/findings-a02.json`](../../.agent/evidence/AAA-016/findings-a02.json) and [`commands-a02.jsonl`](../../.agent/evidence/AAA-016/commands-a02.jsonl).

AAA-017 is complete at its scoped governance acceptance. The verifier now validates the configured official remote, fetches its mirror branch, compares exact commit IDs with `origin/master`, and fails before attribution on missing or divergent refs. The focused suite passes 10/10, offline fixtures cover matching/mismatched/missing refs, and the workflow-equivalent command proves equality and attributes 179 custom paths across five improvements at that checkpoint; the policy run attributed 196 after AAA-021, and the current run attributes 204 after the eight current evidence-packet files were added. Evidence is in [`AAA-017/findings-a02.json`](../../.agent/evidence/AAA-017/findings-a02.json) and [`commands-a02.jsonl`](../../.agent/evidence/AAA-017/commands-a02.jsonl).

AAA-021 is complete at its bounded repository-automation acceptance. `verify-hygiene-prerequisites` scans 302 workspace package manifests and fails early with an actionable build instruction when required `lib/` outputs are missing; when outputs exist, standalone `pnpm run hygiene` passes all 17 leaves, and `check:all` retains its explicit build-before-hygiene ordering. Focused scheduler and fixture tests pass 106/106, repository typecheck and lint pass, and the customization policy now attributes 196 paths across five improvements. Evidence is in [`AAA-021/findings-a01.json`](../../.agent/evidence/AAA-021/findings-a01.json), [`commands-a01.jsonl`](../../.agent/evidence/AAA-021/commands-a01.jsonl), and [`implementation-ready-AAA-021.json`](../../.agent/gates/implementation-ready-AAA-021.json).

AAA-012:A01 has a current read-only decision packet for the WebSocket close gap. The client `RemoteStreamMuxClient.close()` requests socket closure without proving that the socket has reached `CLOSED`, while the deterministic fixture can remain `CLOSING`; the gateway README does not define the caller-visible completion, timeout, error-ordering, repeated-close, or late-callback contract. The maintainer must choose physical closure or logical disposal before implementation. Evidence is in [`AAA-012/scout-a01.json`](../../.agent/evidence/AAA-012/scout-a01.json).

AAA-014:A01 has a current read-only decision packet for HTTP bridge resource admission. The bridge enforces a 300 MiB per-request buffered-body limit but has no aggregate reservation, concurrency cap, queue, or shared release path; dedicated RPC bridge calls also bypass the configured connection cap. The maintainer must decide route scope, budget accounting, admission behavior, rejection semantics, quiescent release, and configuration ownership before implementation. Evidence is in [`AAA-014/scout-a01.json`](../../.agent/evidence/AAA-014/scout-a01.json).

AAA-015:A01 has a current read-only decision packet for dynamic extension trust and deployment. Host-only execution can be immediate, browser evaluation uses `new Function` and dynamic loading, no repository-owned CSP or Trusted Types policy was found in the inspected surfaces, and Plugin Manager accepts multiple source forms with default enablement. The maintainer must approve supported deployments, consent binding, CSP stance, source trust, and default enablement before implementation. Evidence is in [`AAA-015/scout-a01.json`](../../.agent/evidence/AAA-015/scout-a01.json).

AAA-019:A01 has a current read-only decision packet for fork package publication identity. The inventory finds 293 package manifests, all under the `@deepseek-ai/dsh-*` namespace, all public, and all claiming the official repository URL while the checkout's fork remote is `ricardoakinaga-dev/deepseek-harness`; `pnpm run publint` exits 0, but namespace ownership, publication authority, and migration policy remain undecided. Evidence is in [`AAA-019/scout-a01.json`](../../.agent/evidence/AAA-019/scout-a01.json).

AAA-020:A01 has a current read-only decision packet for public source-export compatibility. The inventory finds `./src/*` exports in 279 of 293 package manifests while affected `files` arrays omit source files; `pnpm run publint` exits 0 with the unmatched-source warning. The maintainer must decide whether to remove the export, publish and support the source tree, or isolate it in a separately authorized development distribution. Evidence is in [`AAA-020/scout-a01.json`](../../.agent/evidence/AAA-020/scout-a01.json).

AAA-018:A03 is complete at its scoped acceptance. The maintainer confirmed `README.md` as the canonical community-channel source; `README.zh.md` now carries the same three targets, and `pnpm run verify-readme-community-parity` passes with negative fixture coverage for missing and locale-only targets. `pnpm run audit:metrics` emits validated JSON with the required schema, revision, environment, corpus digest, and five named counts. The retained current result contains 4,436 source files with counts of 90 `deprecated_reader`, 263 `lint_suppression`, 53 `todo_marker`, 1,625 `explicit_any`, and 7 `selected_skip`; it is stored at [`AAA-018/metrics.json`](../../.artifacts/aaa-018/aaa-018-a03-2026-09-21/metrics.json). This does not authorize static-debt migration or broad rule/compiler changes.

AAA-022:A01 has a current read-only static-contract debt packet. The canonical AAA-018 command now defines the tracked source corpus and counting semantics; its current values are retained above, while the earlier exploratory inventory remains historical evidence only. Effective host and client TypeScript programs enumerate 1,599/249 and 551/74 files/references, and the selected owner-path Oxlint probe exits 0. No migration wave or broad rule/compiler change is authorized. Evidence is in [`AAA-022/scout-a01.json`](../../.agent/evidence/AAA-022/scout-a01.json).

AAA-023:A01 and AAA-024:A01 now have release-readiness packets. The 14-criterion matrix records the exact missing or stale evidence for each Quality Bar item; the current worktree is not an immutable candidate, prior scoped passes are stale after the Gauntlet rebaseline, and the final critic is not runnable. The packets preserve the required order: resolve decisions, complete dependencies, seal one candidate, collect local and external lanes, rehearse upstream updateability, then run the fresh final critic. Evidence is in [`AAA-023/scout-a01.json`](../../.agent/evidence/AAA-023/scout-a01.json) and [`AAA-024/preflight-a01.json`](../../.agent/evidence/AAA-024/preflight-a01.json).

The current publication gates provide supporting evidence only: `pnpm run verify-node-next-types` passes for 302 workspace declaration APIs, while `pnpm run publint` exits 0 for 293 packages and retains the known `./src/*` unmatched-source warning. These results do not resolve AAA-019/020 policy or qualify a release lane.

-----

## Evidence identity

<a id="evidence-identity"></a>

The canonical matrix is [`AAA-001/findings.json`](../../.agent/evidence/AAA-001/findings.json) with [`commands.jsonl`](../../.agent/evidence/AAA-001/commands.jsonl), the environment manifest, and raw outputs under the ignored `.artifacts/aaa-001/` directory.

The matrix contains 41 command records, 43 direct source references, 16 findings covering P1–P16, 14 Quality Bar criterion entries, and 23 required release lanes. Automatic validation found no orphan command, missing raw output, or digest mismatch.

The independent read-only coverage review agreed that M0 must preserve the P1 count discrepancy and the P3/P11 classification conflict. M0 now records P15 with a current generated-file inventory; the earlier review's uncovered-P15 observation is superseded by the appended command record.

-----

## Current findings

<a id="current-findings"></a>

The following table preserves the M0 baseline failures. A `PASS` exit status is not treated as a criterion pass when the command's classification identifies a false-green fixture or enforcement gap; focused follow-up outcomes appear in the next section.

| Area | Current observation | Owner |
| --- | --- | --- |
| Workspace and graphs | Constraints finds eight manifest-less package-depth directories; the refreshed aggregate still fails because the client-domain graph reports 38 violations; module-graph outputs are stale. | AAA-002, AAA-009, AAA-010 |
| Tests and model-visible behavior | The latest aggregate test gate fails 20 tests in 11 files while 26,165 tests pass, 181 are skipped, and one is an expected failure; the earlier snapshot and expected-output baseline remains retained separately. | AAA-004, AAA-005, AAA-006, AAA-008, AAA-023 |
| Coverage and release consumers | Coverage fails in 11 files and 28 tests; e2e fails in three files and 14 tests; Web fails in 105 files and 47 tests with 357 skips. | AAA-004, AAA-005, AAA-007, AAA-021, AAA-023 |
| Browser and benchmark prerequisites | Chromium is absent for Web and two long-session benchmark cases; the designated runner has not supplied a current replacement signal. | AAA-007, AAA-023 |
| Runtime and security contracts | Static review retains early WebSocket close resolution, request-local HTTP buffering without an aggregate cap, and dynamic-code policy gaps; AAA-013's static-target escape is resolved at the focused package scope. | AAA-012, AAA-014, AAA-015; AAA-013 complete |
| Governance and publication | Weighted approval names a removed path; packageRoots validation is fail-closed for non-packaged records; official-mirror equality is now enforced; custom packages still claim the official namespace and repository, and source-export policy remains undecided. | AAA-003, AAA-016, AAA-017, AAA-019, AAA-020 |
| Documentation and metrics | The current documentation quick aggregate has 19 passing gates and the two retained historical failures; README community parity passes, and the canonical metrics command records a 4,436-file corpus. The persistent-shell wording gap is closed at its scoped owner paths. | AAA-018, AAA-022 |

The historical P1 residue count is retained as a scoped conflict: the Portuguese report says four directories, while the current constraints and English audit record eight. The P3 catalog finding and P11 generated-name finding are also retained with their current classifications instead of being silently removed.

-----

## Updates since the M0 baseline

<a id="updates-since-the-m0-baseline"></a>

The M0 matrix remains the historical baseline. The follow-up evidence below is scoped to individual tasks and does not retroactively turn the aggregate M0 failures into a release pass.

AAA-002 removed the eight verified ignored package-depth residue targets; the post-clean `constraints` check passes.

AAA-003 corrected weighted-approval ownership to `ptc-runtime-python`; the documented Python suite passes 12/12 through `uv`, and the Node approval-policy gate passes 80/80.

AAA-004 found a test-fixture permission issue rather than a spill product defect. The focused suite passes 41/41 under umask `0002` and `0022`, and the unsafe-directory negative controls still pass.

AAA-005 and AAA-006 now retain the original session generation v0, provide the adjacent current-writer v3 generation, resolve the custom adapter in CI-representative `lib` mode, and pass the focused corpus 3/3. The source-mode ToolRuntime identity observation remains separate and is not hidden by the lib result.

AAA-007 confirmed that supported CI jobs already install the package-owned Playwright Chromium before Web consumers. Local `chromium.launch()` still fails without the browser binary and emits the standard actionable install command; no host browser or OS package was installed.

AAA-008:A01 passes the focused pi-ai DeepSeek compatibility case five repeated times. A direct assembled-profile capture observes two intended requests: the user-triggered agent turn and the background session-title request. The historical third request is not reproduced, so no product change is justified; maintainer approval or the original failing trace remains pending at `AAA-008:A02`.

AAA-009:A01 inventories all 38 client-domain graph violations in five groups with 38 explicit file/import entries, an owner, dependency order, and focused acceptance path for each group. The verifier remains red because the proposed ownership and shared-document-API decisions have not yet been implemented; no product source changed. Evidence is retained in [`AAA-009/findings.json`](../../.agent/evidence/AAA-009/findings.json) and [`commands.jsonl`](../../.agent/evidence/AAA-009/commands.jsonl). `AAA-009:A02` is held at VERIFY for that maintainer architecture decision.

AAA-010:A01 re-ran the owning module-graph freshness check. The verifier reports `docs/module-graph.md`, `docs/module-graph.zh.md`, and `docs/module-graph.i18n.yaml` as stale; write-mode regeneration remains sequenced after the AAA-009 ownership and shared-API decision. Evidence is in [`AAA-010/verify-a01.json`](../../.agent/evidence/AAA-010/verify-a01.json).

AAA-013:A01 reproduced the lexical-only static-file escape and specified canonical resolved-target containment. AAA-013:A02 then changed `packages/host/frontend-static/src/index.ts`, added real-composition in-root and outside-target fixtures, synchronized the paired README and implemented Agent Note, and passed focused coverage at 100% statements, branches, functions, and lines. `pnpm run test:gui` also passed 433 files and 6,180 tests with one skipped test; host build, repository typecheck, policy, note-format, pairing, and diff checks passed. The current evidence retains the Linux-only limitation for the Windows junction branch and the portable resolve-to-read race.

AAA-011:A01 expanded ownership to both persistent-shell implementations, their tests, paired documentation, the durable rationale, and the Bash/PowerShell keyless snapshot families. AAA-011:A02 synchronized the timeout and reset prose and strengthened both provider tests to assert the complete model-visible wording. The focused shell compositions pass 39/40 with one expected platform-dependent skip; the Bash SDK replay passes 1/1, while the PowerShell headless scenario is an official manifest skip on this host. Package typechecks, named translation pairing, policy attribution, and diff checks pass. The native PowerShell replay remains a CI-owned platform check rather than an unsupported local claim.

AAA-016:A01 reproduced the governance false-green, and its bounded correction is now complete. `validateCustomizationPolicy` rejects `packageRoots` on `configuration`, `profile-patch`, and `skill` records, preserves valid packaged-extension roots, and passes the focused suite 7/7 plus the top-level verifier. The implemented bilingual note and development-standard pairing also pass; evidence is in [`AAA-016/findings-a02.json`](../../.agent/evidence/AAA-016/findings-a02.json) and [`commands-a02.jsonl`](../../.agent/evidence/AAA-016/commands-a02.jsonl).

AAA-017:A01 reproduced the official-mirror workflow gap, and AAA-017:A02 implemented its bounded correction. The verifier now derives the official remote from policy, fetches the configured branch, rejects exact-commit divergence before attribution, and exposes actionable diagnostics. The focused suite passes 10/10, matching/mismatched/missing fixtures pass, the workflow-equivalent command passes against the public remote, three named documentation/note pairs are consistent, all 473 Agent Notes pass format checks, and `git diff --check` passes. The current policy run attributes 196 paths across five improvements. GitHub Actions dispatch and a deliberately divergent live remote remain unexecuted platform/reproduction limits.

AAA-021:A01 implemented the standalone hygiene preflight. The new manifest-driven check covers 302 workspace manifests, fails before any hygiene leaf when built outputs are absent, and returns an actionable `pnpm run build` instruction. The standalone hygiene aggregate passes 17/17; the `check:all` build dependency remains explicit rather than being hidden inside hygiene. The focused scheduler/fixture suite passes 106/106, typecheck and lint pass, note format and translation pairing pass, and the customization-policy verifier reports 196 attributed paths across five improvements.

AAA-022:A01 reproduced the static-contract debt and ownership gap without changing source or configuration. The read-only packet records the corpus mismatch, exploratory debt counts, owner groups, compatibility exceptions, and separate rule/compiler probes; it keeps the historical values versioned and defers implementation until AAA-018 defines canonical metrics and a maintainer approves the first wave.

AAA-023:A01 and AAA-024:A01 establish readiness evidence rather than release evidence. The matrix confirms that the current worktree cannot qualify the 14 criteria because it is dirty, prior scoped passes are stale after rebaseline, platform and credential lanes remain external, and no final independent critic or attestation exists.

AAA-023:A01 was reexecuted on the current worktree through `pnpm run check:all`. The aggregate completed with 55 passed gates, 6 failed gates, and 6 skipped gates. The test leaf failed 20 tests in 11 files, and the build failure caused six dependent release leaves to skip; this run is current evidence of non-qualification, not a release-candidate verdict. Evidence is in [`AAA-023/check-all-a02.json`](../../.agent/evidence/AAA-023/check-all-a02.json).

AAA-019:A01 reproduced the fork publication identity gap without mutating manifests or contacting a registry. All 293 inspected package manifests use the upstream `@deepseek-ai/dsh-*` namespace and official repository metadata even though the checkout's writable remote is the fork; the packet records bounded namespace, visibility, authority, and migration alternatives. No publication or rename is authorized until the fork maintainer decides.

AAA-020:A01 reproduced the public source-export warning debt without changing an export map. 279 of 293 manifests expose `./src/*` while affected package files lists omit source, and current publint emits the unmatched-source warning while exiting successfully; the packet records remove, publish, and separate-development-distribution alternatives. No compatibility claim is made until the public API policy is approved.

AAA-018:A03 implemented the canonical audit metrics command, retained its current JSON result, aligned `README.zh.md` to the English community list, and added the exact-target parity gate. The focused tests pass 9/9; the documentation quick aggregate passes 19/21 with only the two retained historical findings. Translation pairing passes 1,027/1,027, and the new Agent Note records the corpus and channel decision.

The canonical AAA-018 result records 90 `no-deprecated` lines, 263 `oxlint-disable` lines, 53 `TODO/FIXME/XXX` lines, 1,625 `any`-token lines, and 7 selected `.skip(` lines over 4,436 tracked source files. The result is comparable only when the command, corpus, and counting rules remain unchanged; it does not itself establish a Quality Bar pass.

The report-update documentation check `pnpm run test:docs` completed 19/21 gates. Translation pairing passed for 1,027 pairs, the README parity gate passed, and the two remaining failures are the immutable historical `commit-hash` record at `.agent/execution-log.jsonl:1` and the historical forbidden wording at `docs/customization/repository-audit-2026-09-20.md:140`.

-----

## Release-lane matrix

<a id="release-lane-matrix"></a>

M0 records a lane as `NOT_RUN` when repository policy, credentials, platform ownership, or candidate sequencing prevents execution. `NOT_RUN` is an evidence gap, not a pass.

| Lane | M0 result | Evidence |
| --- | --- | --- |
| Build and release-family ordering | PASS | `CMD-AAA-001-006`, `CMD-AAA-001-030` |
| Constraints, graphs, unit tests, snapshots, expected outputs | FAIL | `CMD-AAA-001-001` through `CMD-AAA-001-008` |
| Coverage, e2e, Web, and browser benchmark cases | FAIL | `CMD-AAA-001-027`, `026`, `028`, `031` |
| Documentation and hygiene | FAIL | `CMD-AAA-001-025`, `029` |
| Typecheck and lint | NOT_RUN | `CMD-AAA-001-039`, `040` |
| Aggregate check:all | FAIL — 55 gates passed, 6 failed, and 6 skipped; client-domain graph reports 38 violations and the test gate reports 20 failures in 11 files | [`AAA-023/check-all-a02.json`](../../.agent/evidence/AAA-023/check-all-a02.json) |
| Windows, supported Node versions, and credentialed provider cases | NOT_RUN | `CMD-AAA-001-033` through `035` |
| Packed-install qualification | NOT_RUN | `CMD-AAA-001-036` |
| Official-mirror fetch and merge rehearsal | NOT_RUN | `CMD-AAA-001-037` |
| Fresh independent final critic | NOT_RUN | `CMD-AAA-001-041` |

The matrix does not claim a final release candidate. The failed and deferred lanes remain blockers for `AAA-QB-01` through `AAA-QB-14` until current evidence replaces them.

### Focused follow-up results

The current task evidence adds these scoped results:

- `AAA-002`: post-clean constraints pass; `AAA-003`: approval ownership and focused policy tests pass.
- `AAA-004`: spill suite passes under umask `0002` and `0022`, including the unsafe-directory controls.
- `AAA-005`/`AAA-006`: v0 is preserved, v3 is current, custom `lib` replay passes 1/1, and the corpus passes 3/3.
- `AAA-007`: CI browser ownership is present; the missing local browser is an expected prerequisite failure.
- `AAA-008:A01`: the focused expected-output test passes 1/1 and five repeats; the direct capture observes two intended requests.
- `AAA-009:A01`: the 38 client-domain violations are fully inventoried and grouped; the refreshed aggregate and direct gate reproduction still exit 1, so implementation is not authorized until the shared API and ownership decision is recorded.
- `AAA-023:A01`: the latest aggregate run completes 55 gates successfully, fails 6 gates, and skips 6 dependent gates; its test leaf fails 20 tests in 11 files, so the candidate remains unqualified.
- `AAA-013:A02`: canonical resolved-target containment is implemented and verified; the focused source has 100% coverage and the host/client GUI suite passes 6,180 tests.
- `AAA-011:A02`: persistent-shell timeout and reset wording is synchronized; 39/40 focused tests pass with one expected platform skip, Bash SDK replay passes, and the PowerShell replay is explicitly CI-owned on this host.
- `AAA-016:A02`: packageRoots is rejected for all three non-packaged solution types, valid packaged roots remain accepted, and the focused/top-level policy checks pass.
- `AAA-017:A02`: official-mirror fetch and exact equality are enforced before attribution; focused and workflow-equivalent checks pass, with GitHub Actions dispatch still platform-owned.
- `AAA-021:A01`: the manifest-driven hygiene preflight covers 302 package manifests, standalone hygiene passes 17/17, focused scheduling/fixture tests pass 106/106, typecheck and lint pass, and `check:all` retains build-before-hygiene ordering.
- `AAA-018:A03`: the maintainer-confirmed English README channel policy is implemented; the Chinese README has exact target parity, the metrics artifact is retained, the focused suite passes 9/9, and the documentation quick aggregate passes 19/21 with only the two historical findings.

These results do not replace the failed aggregate matrix, the unexecuted credentialed/platform lanes, or the pending human decisions.

-----

## Quality Bar reconciliation

<a id="quality-bar-reconciliation"></a>

The frozen bar remains `AAA-QB-v1.4`. Its normative source hashes, criteria, and revision log now match `.gauntlet/bar.json` exactly; the Gauntlet state was rebaselined after this reconciliation and retains prior fingerprint history as stale evidence.

No `AAA-QB-v1.5` correction is required from M0. The canonical AAA-018 command reports 90 `no-deprecated` lines, 263 `oxlint-disable` lines, 53 `TODO/FIXME/XXX` lines, 1,625 lines containing `any`, and 7 selected `.skip(` lines over its 4,436-file tracked-source corpus.

The historical values remain preserved: 85, 205, 81, 66, and 8 for the corresponding observations. The new result records corpus exclusions, revision, environment, and counting semantics, but it does not revise the frozen bar; an append-only v1.5 revision still requires evidence that v1.4 is invalid.

-----

## Ownership and next action

<a id="ownership-and-next-action"></a>

AAA-001 through AAA-007, AAA-011, AAA-013, AAA-016, AAA-017, AAA-018, and AAA-021 have current scoped evidence recorded as complete, except that the full aggregate qualification remains open. `AAA-008` remains held at VERIFY because its two-request oracle still needs maintainer approval or the original failing trace. `AAA-009` remains held at VERIFY for the shared document API and domain-owner decision. `AAA-012:A01`, `AAA-014:A01`, `AAA-015:A01`, `AAA-019:A01`, `AAA-020:A01`, and `AAA-022:A01` have current decision packets but remain TODO/DECIDE pending their respective human policies or static-debt migration decisions. `AAA-023:A01` and `AAA-024:A01` have readiness packets but remain TODO until a sealed candidate exists.

Product changes remain gated by separate customization-policy records and, where required, human decisions. The unresolved decisions include the AAA-008 request oracle, WebSocket close semantics, aggregate HTTP memory policy, dynamic-extension deployment policy, package publication identity, public source-export compatibility, static-debt migration order, and broad lint or compiler changes. The remaining decision packets and two release-readiness packets are preparation evidence only; they do not authorize unrelated implementation or reduce the Quality Bar.

The backlog remains the only task-status authority; this report summarizes its current pointer but does not create a second queue.

-----

## Reproducibility

<a id="reproducibility"></a>

Reproduce the control-plane consistency check with `python3 /home/ricardo/.agents/skills/engineering-framework/scripts/check_state.py /home/ricardo/deepseek-harness`.

Reproduce the current aggregate blocker with `pnpm run check:all` and the focused gate `pnpm run verify-client-domain-graph`; the aggregate should report the current failed test, build, documentation, module-graph, and client-domain gates until their owners remediate them, while the focused client-domain gate should continue to report 38 violations until the AAA-009 ownership and shared-API decision is implemented.

Reproduce the retained canonical metrics result with `pnpm run audit:metrics -- --output .artifacts/aaa-018/aaa-018-a03-2026-09-21/metrics.json`, and verify the English-canonical README channel set with `pnpm run verify-readme-community-parity`.

Validate the frozen Gauntlet copy with `python3 /home/ricardo/.codex/skills/gauntlet-loop/scripts/gauntlet_state.py validate --repo /home/ricardo/deepseek-harness`.

Reproduce the AAA-021 prerequisite result with `pnpm exec vitest run scripts/run-gates.spec.ts scripts/verify-hygiene-prerequisites.spec.ts`, `pnpm run verify-hygiene-prerequisites`, `pnpm run hygiene`, `pnpm run typecheck`, `pnpm run lint`, and `node scripts/verify-customization-policy.mjs --base origin/master --require-official-mirror`.

Re-run the matrix validator described in `findings.json` and compare every raw-output SHA-256 before interpreting a result. The full release matrix must run on one sealed candidate after remediation; M0 intentionally does not substitute for that qualification.

-----

## Limitations

<a id="limitations"></a>

The refreshed analysis did not execute Windows/Wine, the supported Node matrix, credentialed provider cases, packed-install qualification, or the network-fresh upstream merge rehearsal. It did execute the aggregate `check:all`; the runner completed with a non-zero result because the client-domain graph gate reported 38 violations. AAA-021 still only verifies the standalone hygiene aggregate and preserves the aggregate scheduler's build ordering.

Static inspection did not prove the remaining security contracts in `AAA-QB-05`; deterministic lifecycle, aggregate-memory, CSP, consent, and default-policy tests remain required. AAA-013's focused symlink-escape contract now has implementation and composition evidence, but the portable application check does not claim kernel-grade protection against a concurrent filesystem attacker and the Windows junction branch was not executed on this host.

The follow-up did not use a real `DEEPSEEK_API_KEY` or download Chromium. The latest aggregate suite did run and failed in the six gates recorded above, including 20 tests across 11 files; its six dependency-skipped release leaves remain unexecuted. The historical third-request observation lacks its original request trace and remains pending maintainer disposition. The client-domain graph remains failing until the AAA-009 ownership and shared-API decision is implemented and retested. The latest documentation quick check retains two immutable historical failures described above.

The report records repository evidence at a point in time. The six decision packets and two release-readiness packets were produced by I1 read-only scouts with lead source reconciliation; they are not independent final qualification. The report does not authorize publication, remove human decisions, or declare Triple-A quality.

-----

## Further Exploration

<a id="further-exploration"></a>

- [Triple-A quality program](aaa-quality-program.md) — roadmap, ownership, and release stop conditions.
- [Frozen Quality Bar](../../.agent/plans/deepseek-harness-aaa-quality-bar.json) — exact required criteria and evidence methods.
- [Customization development standard](improvement-development-standard.md) — solution types and ownership rules.
- [Upstream-safe customization](upstream-safe-customization.md) — branch, mirror, and update procedure.

-----

## Dev Note

<a id="dev-note"></a>

This report is the dated M0 evidence summary updated on 2026-09-21 with the completed `check:all` run, follow-up through `AAA-021:A01`, completed `AAA-018:A03` canonical metrics and README parity work, decision packets for `AAA-012:A01`, `AAA-014:A01`, `AAA-015:A01`, `AAA-019:A01`, `AAA-020:A01`, and `AAA-022:A01`, and release-readiness packets for `AAA-023:A01` and `AAA-024:A01`. The raw command records and canonical control-plane files remain authoritative for execution state; this report does not replace the backlog or verification ledgers.
