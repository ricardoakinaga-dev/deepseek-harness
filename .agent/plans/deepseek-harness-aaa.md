# DeepSeek Harness Triple-A quality program — ExecPlan

<!-- engineering-framework: active_action_id=AAA-022:A24 -->

## Purpose / Big Picture

This program turns the fork into a release candidate whose quality claim is supported by reproducible evidence rather than a score. A maintainer can observe success by checking one immutable commit against `AAA-QB-v1.4`, reproducing the release matrix, confirming that every custom path remains attributable and removable, and reading a fresh independent audit with an unconditional PASS verdict bound to that commit.

The current repository is not Triple-A. The broader 2026-09-20 audit recorded six failing aggregate tasks and several undecided runtime and publication contracts. This plan preserves that baseline and prevents a planning artifact from being mistaken for a completed remediation.

## Progress

- [x] (2026-09-24T09:29:14-03:00) Complete W2 core/tools design; the exact 15-path candidate has fresh independent approval, the policy validator and implementation-ready gate pass, and the gate is bound to AAA-022. No product behavior or implementation tests ran; retain FAIL-358, the M09 metrics limitation, and sealed A28. Activate W2 core/tools implementation.

- [x] (2026-09-24T06:31:37-03:00) Complete the 29-path W2 Schedule preparation successor implementation. Focused tests, typecheck, Oxlint, docs, catalog, pairing, ownership, diff check, and fresh independent review pass; doc-sync remains 38/43 with five out-of-scope findings, and the state checker remains exactly FAIL-358. Begin the final W2 owner design for `packages/core/tools` / REM-028-S029. The user selected a credential-free local proxy broker with fail-closed launch support for M01; record that decision for AAA-023 while its A38 dependency remains blocked.
- [x] (2026-09-24T05:43:30-03:00) Reopen and supersede the 19-path W2 Schedule gate with the independently reviewed 29-path preparation successor; include the registry hook, Schedule baseline/setup-append validation, corrected projection fixtures, bilingual API docs, and generated catalog. The focused predecessor spec reproduced 3/5 failures; policy, path ownership, fingerprints, and canonical gate validation pass. Implementation remains active, with FAIL-358 and the M09 metrics limitation retained.

- [x] (2026-09-24T04:05:00-03:00) Pass the exact W2 Schedule IMPLEMENTATION_READY gate with 19 implementation paths, 7 verification-only paths, the 18-path collision-free owner, and the confirmed A03-derived authority; move AAA-022 to BUILD/IMPLEMENT while retaining FAIL-358 and the M09 metrics limitation.

- [x] (2026-09-24T03:55:48-03:00) Complete four independent W2 Schedule design review rounds: correct the 42-input fingerprint, add baseline error ownership, provider/key failures, contributor disposal order and live resume/fork coverage, approve the exact 19 implementation/7 verification-only paths, and reassign only invariant.ts/runtime.ts while preserving their three existing V8 markers; no product edits or tests ran.

- [x] (2026-09-24T03:20:29-03:00) Re-run the state checker after the A27 disposition and W2 schedule-design start: the result remains FAIL-358 with zero diagnostic additions or removals.

- [x] (2026-09-24T03:19:35-03:00) Start AAA-022:W2-SCHEDULE-READERS-DESIGN under the confirmed W2 owner order; this SPEC action covers only design of schedule sites S053-S058.

- [x] (2026-09-24T03:19:10-03:00) Resolve AAA-022:A27-STATE-REPAIR-DECISION: the user selected the existing FAIL-358 baseline; the current checker reports 358 findings, and no historical control-plane record was edited. The next owner in W2 order is schedule.

- [x] (2026-09-24T01:43:36-03:00) Record the final independent A27 scope review: the 1,715-path candidate has 302 assignments and zero candidate-validation errors, the state baseline remains FAIL-358, and sealed A28 is unchanged; the A27 design action remains ungated in SPEC.


- [x] (2026-09-24T00:31:55-03:00) Preserve and supersede the first pointer-reconciliation checkpoint after the post-transaction checker exposed a tail-text binding issue; the dependency finding cleared, and A27 remains the active scope-design action.

- [x] (2026-09-24T00:29:42-03:00) Reconcile AAA-023:A38 as an explicit wait on AAA-022:A27: retarget the stale A16 reference, block the dependent release task, and preserve the sealed A28 candidate; the exact A27 implementation scopes remain to be gated.

- [x] (2026-09-23T23:02:04-03:00) Complete the approved A26 consumer fixture changes: the 12-file batch passes 341/341, scoped types and Oxlint pass, all five remaining consumer tests match their gate-start hashes, and the full-scope diff check passes. The current policy run has 302 broad findings with none for the three approved paths or their owner; the aggregate task remains blocked by the prior 10 unrelated doc-typecheck diagnostics and global policy findings.

- [x] (2026-09-23T23:16:15-03:00) Close the exact A26 consumer-test scope after its focused pass; retain AAA-022 as BLOCKED on the prior 10 unrelated doc-typecheck diagnostics and 302 current repository-wide customization-policy findings, with an exact-scope decision as the only next action.

- [x] (2026-09-23T22:45:01-03:00) Start the A26 three-path consumer fixture action after the successor implementation-ready gate passed; no test files have been changed yet.

- [x] (2026-09-23T22:45:00-03:00) Approve the exact three-path A26 consumer-test successor gate, bind the 34-path owner and current fingerprint, and reopen only fixture/test-expectation work; the other five consumer tests and inherited aggregate blockers remain unchanged.

- [x] (2026-09-23T20:32:55-03:00) Record A26 implementation and independent review; owner-focused checks pass, while the fixed 12-file consumer batch fails in three verification-only files and repository-wide documentation/policy checks retain unrelated diagnostics. Verification is blocked pending a scope decision.
- [x] (2026-09-23T19:00:17-03:00) Complete AAA-022:A25: bind the corrected implementation-ready gate to the current 55-path A24 review and 61-file candidate snapshot; activate A26 with all implementation behavior and verification still pending.
- [x] (2026-09-23T18:42:09-03:00) Checkpoint A25 after appending the corrected gate authority: state ordering now advances past the authority decision while A25 remains the active DESIGN action; no implementation began and the aggregate checker limitation remains 359 findings.

- [x] (2026-09-23T18:30:00-03:00) Preserve and roll back the failed A25 gate draft after its stable-scope and authority-decision mismatches added three state-check findings; restore A25 as the active DESIGN action and prepare a corrected successor before implementation.


- [x] (2026-09-23T17:36:06-03:00) Bind the post-revalidation state-check evidence with a state-last checkpoint; the aggregate checker remains at the 359-finding baseline with no new A19/A25 diagnostics, and A25 remains active.

- [x] (2026-09-23T17:32:57-03:00) Revalidate A19 exact 31-input scope after later shared-input updates: the current fingerprint and owner attribution match, required scoped docs/API checks pass, doc-sync remains partial, and the state checker matches its 359-finding baseline; AAA-022:A25 stays active.


- [x] (2026-09-23T16:52:06-03:00) Re-run the aggregate state checker after the A25 phase and ledger-reference corrections; it returns to the pre-checkpoint 359-finding baseline with no A24/A25-specific diagnostic.

- [x] (2026-09-23T16:48:16-03:00) Classify AAA-022:A25 gate preparation as DESIGN; the intermediate VERIFY classification triggered implementation-gate diagnostics, so preserve its 362-finding transcript and correct the active phase before proceeding.

- [x] (2026-09-23T16:43:56-03:00) Complete AAA-022:A24: the independent reviewer approves A24-01 through A24-07 and the exact 33-path implementation scope; retain the pre-checkpoint aggregate state-check FAIL with 359 findings. A25 is active for implementation-gate preparation.

- [x] (2026-09-20T16:52:37-03:00) Read both requested audit reports, repository instructions, improvement standard, current policy, and static evidence for the leading findings.
- [x] (2026-09-20T16:52:37-03:00) Classify the program as `BROWNFIELD`, `EVOLUTION/PLAN`, `T3_SYSTEM`, `HIGH` risk, and `SYSTEM` blast radius.
- [x] (2026-09-20T16:52:37-03:00) Freeze the initial Quality Bar, create the canonical remediation backlog, and establish persistent state and recovery artifacts.
- [x] (2026-09-20T17:20:00-03:00) Correct the first critic's qualification deadlock, action granularity, authority reference, publication routing, and under-specified criteria in `AAA-QB-v1.1`.
- [x] (2026-09-20T17:42:00-03:00) Restore audit-source identity, align AAA-013 with fail-closed containment, and name the mandatory risk-document pairs in `AAA-QB-v1.2`.
- [x] (2026-09-20T18:02:00-03:00) Pin every mutable normative source, remove the stale static-root authority phrase, and specify state-last task and gate transitions in `AAA-QB-v1.3`.
- [x] (2026-09-20T18:30:00-03:00) Move implementation readiness to the first IMPLEMENT action, remove the gate-event ordering ambiguity, cover weighted approval and dynamic extensions in `AAA-QB-v1.4`, and bind final attestation to the immutable candidate.
- [x] (2026-09-20T18:13:00-03:00) Commit and push the independently approved planning checkpoint, now identified by `refs/tags/aaa-m0-source-2026-09-20`, with `HEAD` equal to `origin/custom/main` and a clean worktree.
- [x] (2026-09-20T18:16:00-03:00) Record the immutable checkpoint and supported host environment in `.agent/evidence/AAA-001/environment.json`.
- [x] (2026-09-20T19:21:30-03:00) Reproduce and classify each reported failing leaf and required unexecuted release lane in the canonical M0 evidence matrix; 41 command records, 16 source findings, 14 criterion entries, and 23 required lanes are retained, with automatic source-to-command coverage passing.
- [x] (2026-09-20T19:39:20-03:00) Classify the eight manifest-less package-depth directories: each contains zero tracked files and only ignored `lib` and `node_modules` output, and `pnpm run clean` is the bounded safe cleanup procedure.
- [x] (2026-09-20T19:47:02-03:00) Complete `AAA-004:A01`: the focused spill suite now passes under umask 0002 and 0022 after trusted fixtures request mode 0700; the unsafe-directory negative controls remain passing, and no product source change was needed.
- [x] (2026-09-20T19:50:02-03:00) Start `AAA-003:A01` after the task-bound implementation-ready gate passed; update the live production-path classifier and its focused positive/invalid fixture coverage.
- [x] (2026-09-20T19:52:02-03:00) Complete `AAA-003:A01`: the classifier accepts `ptc-runtime-python`, rejects the removed `code-runtime-python` path, the documented Python suite passes 12/12, and the approval-policy gate passes 80/80.
- [x] (2026-09-20T20:02:25-03:00) Complete the `AAA-005:A01` reproduction: the corpus policy expects v3, the resilient-compaction owner selects only a filename/header-consistent v0 fixture, and the resolver is not the defect.
- [x] (2026-09-20T20:55:12-03:00) Complete `AAA-008:A01`: the focused DeepSeek compatibility case passes five repeated runs, the assembled local capture observes two intended requests, and the historical third request is not reproduced.
- [x] (2026-09-20T21:04:30-03:00) Hold `AAA-008:A02` at VERIFY pending maintainer approval or the original failing trace, then prepare independent client-domain ownership inspection `AAA-009:A01`.
- [x] (2026-09-20T21:10:22-03:00) Complete `AAA-009:A01`: the client-domain verifier reports 38 violations, reconciled into five owner/dependency groups with 38 explicit inventory entries; no product source changed.
- [x] (2026-09-20T21:24:57-03:00) Complete `AAA-013:A01`: the current frontend-static symlink escape returns 200 with outside bytes, the existing composition baseline passes 1/1 without a symlink case, and the canonical containment design plus negative fixtures are specified.
- [x] (2026-09-20T21:38:05-03:00) Complete `AAA-013:A02`: canonical resolved-target containment, in-root alias support, outside symlink/junction rejection, configured-index rejection, paired documentation, and the real-composition matrix pass; focused source coverage is 100% and the GUI suite passes 6,180 tests.
- [x] (2026-09-20T21:43:33-03:00) Complete `AAA-011:A01`: expand `persistent-shell-diagnostics` ownership to both shell source/test trees, paired documentation, the durable rationale note, and the Bash/PowerShell keyless snapshot families; policy and diff gates pass.
- [x] (2026-09-20T21:55:30-03:00) Start and complete `AAA-011:A02`: synchronize timeout diagnostics, paired documentation, exact focused assertions, policy ownership, Bash keyless replay, and the expected Linux skip for the PowerShell snapshot lane.
- [x] (2026-09-20T22:00:37-03:00) Reproduce `AAA-016:A01`'s packageRoots false-green path: configuration records with packageRoots are accepted, the focused suite lacks invalid fixtures, and the existing governance owner is the correct implementation surface; bind the task gate for the bounded correction.
- [x] (2026-09-20T22:10:29-03:00) Complete `AAA-016:A02`: reject packageRoots for configuration, profile-patch, and skill records, retain packaged-extension roots, add invalid fixtures and a paired rationale note, and pass the focused/top-level policy checks.
- [x] (2026-09-20T22:12:11-03:00) Complete `AAA-017:A01` design inspection: reproduce the missing official-mirror equality enforcement, retain current-ref and contract evidence, and specify fetch, equality, diagnostic, and offline mismatch-fixture obligations.
- [x] (2026-09-20T22:24:27-03:00) Complete `AAA-017:A02`: enforce configured official-remote fetch and exact mirror equality before attribution, add matching/mismatched fixtures, synchronize paired topology documentation, and pass the workflow-equivalent policy checks.
- [x] (2026-09-20T22:27:00-03:00) Complete `AAA-018:A01` design inspection: confirm the missing canonical metric owner/corpus, inventory exploratory count sensitivity, compare English/Chinese community channels, and specify the schema and decision options without changing product or README content.
- [x] (2026-09-20T22:50:01-03:00) Complete `AAA-021:A01`: add a manifest-driven fail-fast hygiene preflight, bind it before every standalone leaf, preserve `check:all` build ordering, and pass focused tests, hygiene, typecheck, lint, and documentation ownership checks.
- [x] (2026-09-20T23:15:16-03:00) Prepare independent read-only decision packets for `AAA-012:A01`, `AAA-014:A01`, and `AAA-015:A01`; reproduce the source-level gaps and leave all three explicit human decisions pending.
- [x] (2026-09-20T23:26:57-03:00) Prepare source-grounded read-only decision packets for `AAA-019:A01` and `AAA-020:A01`; reproduce the fork identity and public source-export gaps and leave publication decisions pending.
- [x] (2026-09-20T23:36:07-03:00) Rebaseline the Gauntlet candidate after material evidence and documentation updates; validate the frozen bar and confirm the run is resumable without drift.
- [x] (2026-09-20T23:39:35-03:00) Re-run the current publication gates: NodeNext declaration consumers pass for 302 workspace APIs and publint exits 0 for 293 packages while the known source-export warning remains unresolved.
- [x] (2026-09-20T23:50:56-03:00) Prepare and revalidate the AAA-022 static-contract debt packet; reproduce corpus ambiguity, owner groups, and relaxed compiler/lint defaults while keeping canonical metrics and migration decisions pending.
- [x] (2026-09-20T23:53:09-03:00) Prepare the AAA-023 release-qualification and AAA-024 final-critic readiness packets; map all 14 current evidence gaps and preserve the requirement for one sealed candidate.
- [x] (2026-09-20T23:58:30-03:00) Refresh the bilingual repository-analysis report and sidecar with AAA-022/023/024 evidence; translation pairing passes 1,026/1,026 and doc-quick remains 18/20 with only the two retained historical failures.
- [x] (2026-09-21T00:11:05-03:00) Execute `check:all` on the current worktree and record the blocking client-domain graph result: 38 violations and direct gate exit 1; no release qualification is inferred.
- [x] (2026-09-21T00:23:58-03:00) Reproduce the current module-graph freshness failure for `AAA-010:A01`; three paired generated artifacts are stale, and write-mode regeneration remains behind the unresolved `AAA-009` ownership decision.
- [x] (2026-09-21T08:50:08-03:00) Reexecute `pnpm run check:all` after the resumed audit: 55 gates passed, 6 failed, and 6 skipped; the test leaf failed 20 tests in 11 files, the build leaf failed on two missing temporary contract files, and the existing graph and documentation blockers remained current.
- [x] (2026-09-21T08:57:56-03:00) Revalidate the bilingual report and executive charter after the aggregate refresh: translation pairing passes 1,026/1,026, `git diff --check` and control-plane validation pass, and doc-quick remains 18/20 with only the two retained historical failures.
- [x] (2026-09-21T09:23:07-03:00) Complete `AAA-018:A03`: confirm the English README as the canonical community-channel source, align `README.zh.md`, add exact-target parity and validated canonical metrics commands, retain the 4,436-file result, and pass the focused 9-test suite; doc-quick remains 19/21 with only the two retained historical findings.
- [x] (2026-09-21T16:21:53-03:00) Execute the independent remediation wave: fork-runner isolation, plugin-manager approval, safe spill fixtures, CI and supply-chain controls, dependency extraction hardening, Session-title projection migration, workspace-change teardown, README contracts/order, Agent Note cleanup, canonical metrics, and documentation gates; focused and aggregate documentation checks pass, while decision-dependent work remains held at `AAA-009:A02`.
- [x] (2026-09-21T16:29:04-03:00) Register the release SBOM/attestation verifier in the root script and `ci-primary`/`ci-static`/`check-all` gate graphs; the verifier and 126-test regression run pass, while release publication policy remains decision-dependent.
- [x] (2026-09-21T16:35:45-03:00) Revalidate `AAA-022:A01` against the current 4,436-file corpus: all five debt metrics remain non-increasing, owner groups and migration candidates are recorded, and correctness/compiler defaults remain explicitly unchanged pending authority.
- [x] (2026-09-21T17:36:22-03:00) Reconcile the post-fix qualification checkpoint: the focused resolver/workflow suite passes 312/312, typecheck/lint/documentation/static ownership gates pass, the canonical metric ratchet remains non-increasing, and the full unit suite remains partial at 22 failed files and 186 failed tests; the decision pointer stays at `AAA-009:A02`.
- [x] (2026-09-21T17:44:49-03:00) Complete the bounded `AAA-022:A01` Session-title wave: the focused package suite passes 50/50, `deprecated_reader` and `lint_suppression` each decrease by one against the frozen baseline, retained complete-history waivers have local reasons, and broad lint/compiler policy remains unchanged; the active decision pointer stays at `AAA-009:A02`.
- [x] (2026-09-21T17:54:43-03:00) Reconcile the append-only AAA-022 lifecycle and verification streams: all historical preparation streams now have current PASS revalidations, the valid TODO-to-READY-to-IN_PROGRESS-to-VERIFY-to-DONE sequence is recorded, and `check_state.py` passes 11/11 while the active pointer remains `AAA-009:A02`.
- [x] (2026-09-21T18:29:38-03:00) Complete the current AAA-023 unit-qualification checkpoint: `pnpm run test` passes 1,535 files and 26,283 tests with 12 skipped files, 153 skipped tests, and one expected failure; the browser/client/PDF group passes 60/592, the process-bound workspace suite passes 17/17, ownership attribution passes for 693 paths, and release qualification remains partial pending the seven maintainer decisions and external/release lanes.
- [x] (2026-09-21T18:34:22-03:00) Revalidate the corrected surfaces through `pnpm run typecheck` and `pnpm run lint`; both pass after Host rebuilds, customization ownership attributes 695 paths, and `check_state.py` remains 11/11 while the release candidate stays unqualified.
- [x] (2026-09-21T19:45:13-03:00) Reconcile the aggregate test-isolation correction: the full unit run passes 1,535 files and 26,284 tests, Git passes 11/11, real PTY terminal I/O passes 7/7 with 3 platform skips, built snapshots pass 167/167 with 2 skips, ownership attributes 698 paths, and the active decision pointer remains `AAA-009:A02`.
- [x] (2026-09-21T20:45:50-03:00) Complete the final aggregate qualification rerun: `check:all` records 75 passed, 2 failed, and 0 skipped gates; its bounded unit gate passes 1,535 files and 26,284 tests, while the only failures are the 38-entry AAA-009 client graph and stale AAA-010 module graph. Typecheck, lint, scheduler tests (`123/123`), ownership (`698` paths), state (`11/11`), and diff checks pass.
- [x] (2026-09-21T20:48:53-03:00) Revalidate the post-A08 control-plane append: state checks remain `11/11`, ownership attributes `699` paths after the new evidence file is counted, and `git diff --check` passes; no release or decision status changes.
- [x] (2026-09-21T20:50:57-03:00) Close the post-A09 control-plane revalidation without adding another evidence file: ownership is `700` paths, state remains `11/11`, and `git diff --check` passes; AAA-009:A02 and the partial release status remain unchanged.
- [x] (2026-09-21T21:03:21-03:00) Run the explicit documentation gates named by the remediation prompt: `test:docs` passes `22/22` and `doc-sync` passes `43/43`; the post-evidence ownership count is `701`, state validation is `11/11`, and `git diff --check` passes.
- [x] (2026-09-21T21:10:13-03:00) Complete one consolidated decision packet for the seven security, platform, ownership, and publication gates; all `7/7` entries include recommendation, alternatives, impact, reversibility, compatibility, and affected files, while implementation authority remains false.
- [x] (2026-09-21T21:12:27-03:00) Directly revalidate the fork-runner policy and model-authored proxy/environment isolation: the verifier passes, and four focused security/process files pass `56` tests with one explicit skip under serial file execution.
- [x] (2026-09-21T21:17:17-03:00) Build the interim 15-dimension re-audit matrix against the frozen 63/100 baseline; all `15/15` dimensions have current evidence and explicit gaps, while final numeric scoring and verdict remain withheld until same-SHA and external evidence exist.
- [x] (2026-09-21T21:23:54-03:00) Run the official build and isolated temporary packaging lane: build passes, DSH/vendor packing produces `295 + 9` tarballs, and packed installation passes with `571` default-product packages and the installed CLI reporting `0.1.6-alpha.2`; this remains dirty-worktree diagnostic evidence.
- [x] (2026-09-21T21:58:33-03:00) Complete qualification diagnostic A16: DSH/vendor release-order verification, the CI benchmark gate, and the audit-metric ratchet pass; the bare coverage command exposes three instrumentation timeouts while the focused 90-second reproduction passes `80/80`, so coverage remains partial and `AAA-009:A02` remains the active human-decision pointer.
- [x] (2026-09-21T22:21:07-03:00) Record Ricardo Akinaga's explicit approval of all seven recommendations in the authority ledger and decision packet; authorize local implementation gates for AAA-009, AAA-012, AAA-014, AAA-015, AAA-019, and AAA-020 while keeping AAA-008, publication, registry, push, merge, release, and final-verdict actions outside that authority.
- [x] (2026-09-21T22:34:14-03:00) Pass the task-bound AAA-009 implementation-ready gate for the approved five-group client-domain ownership correction; the gate keeps public feature exports closed, reserves top-level Office-to-PDF assembly for `index.ts`, and requires graph, GUI, type, generator, documentation, policy, and whitespace evidence.
- [x] (2026-09-21T23:38:21-03:00) Complete AAA-009:A03 implementation: the client-domain graph, affected GUI/type/runtime suites, generated module graph, bilingual pairing, source-plane aliases, public-entry migrations, policy ownership, and whitespace checks pass; advance the action to VERIFY.
- [x] (2026-09-21T23:55:00-03:00) Close AAA-009 and AAA-010: approved client-domain ownership is complete, and the owner-generated module graph is current after the source moves.
- [x] (2026-09-21T23:55:25-03:00) Reconcile the approved local implementation wave for AAA-012, AAA-014, AAA-015, AAA-019, and AAA-020; their focused behavior, type, documentation, package, and policy evidence passes, while AAA-008 remains the active unresolved oracle.
- [x] (2026-09-22T01:15:47-03:00) Record maintainer approval of AAA-008's current two-request oracle, re-run the focused compatibility test, and close the task without authorizing a product change; the historical third request remains unqualified.
- [x] (2026-09-22T01:15:49-03:00) Prepare AAA-023:A01 as the next local qualification action; same-SHA, external-provider, coverage, upstream-rehearsal, publication, release, and final-verdict evidence remain outside the current authority or incomplete.
- [x] (2026-09-22T02:28:13-03:00) Execute the current `check:all` matrix: 66 gates pass, 5 fail, and 6 skip; the client/module graphs pass, while duplication, audit-metric/rescope paths, client bundle purity, and one sandbox-local built-entry expectation keep AAA-023 partial.
- [x] (2026-09-22T02:28:17-03:00) Route the partial AAA-023:A01 matrix result into AAA-023:A02 for failure classification; no repair, candidate sealing, publication, or release action is inferred from the failed gates.
- [x] (2026-09-22T02:56:13-03:00) Complete AAA-023:A02: reproduce and classify all five failed gates and six dependent skips, preserving the deleted-path failures as candidate-tree blockers and recording bounded repairs for the three source regressions.
- [x] (2026-09-22T03:03:18-03:00) Bind `implementation-ready-AAA-023.json` for the three bounded source repairs; no audit-baseline, vendor-postcondition, publication, push, merge, release, or final-verdict change is authorized.
- [x] (2026-09-22T03:10:36-03:00) Complete AAA-023:A03: factor the generator clone, remove the unsupported browser value import, fix the ACL source fallback, and pass the focused 165-test suite, duplication, client-package verifier, and full build.
- [x] (2026-09-22T03:29:29-03:00) Execute AAA-023:A04: the aggregate matrix passes 74 of 77 gates; canonical metrics and vendor rescope still read the absent tracked ContextMeter path, while test:expected exposes a cordisInspect activation failure in the Web profile.
- [x] (2026-09-22T03:36:48-03:00) Complete AAA-023:A05: classify the shared ContextMeter candidate-tree prerequisite and the Web composition incompatibility; bind a successor gate for an inspection-only host runner with dynamic execution and browser delivery disabled.
- [x] (2026-09-22T03:41:50-03:00) Execute AAA-023:A06: the inspection-only host runner repair removes the cordisInspect mount failure, and the focused expected lane reaches installation before exposing its separate registry-only versus temporary-path fixture mismatch.
- [x] (2026-09-22T04:08:00-03:00) Complete AAA-023:A07: keep the shipped Web plugin-manager policy registry-only, add a test-owned registry/path overlay by targeting the existing row id, declare the fixture publisher, request explicit activation, and pass the focused expected and policy tests.
- [x] (2026-09-22T04:21:27-03:00) Execute AAA-023:A08: the aggregate matrix reaches 75/77 gates with the Web expected lane passing; only the two shared ContextMeter old-path gates remain.
- [x] (2026-09-22T04:45:05-03:00) Complete AAA-023:A09: confirm that 16 deleted tracked UI paths and their 16 untracked replacements share one candidate-tree prerequisite, verify vendor rescope on a temporary complete candidate, and isolate the rename-sensitive audit reader from the independent explicit_any ratchet increase.
- [x] (2026-09-22T04:54:25-03:00) Complete AAA-023:A10: make the canonical audit baseline reader pass `--no-renames`, then verify the temporary complete candidate reaches the independent `explicit_any` ratchet result while vendor rescope passes.
- [x] (2026-09-22T04:58:06-03:00) Complete AAA-023:A11: trace the sole `explicit_any` increase to the new `expect.any(String)` test matcher and specify a non-empty string matcher that preserves the assertion without changing metric policy.
- [x] (2026-09-22T05:03:46-03:00) Complete AAA-023:A12: replace the metric-only matcher, pass the focused browser-policy test, and confirm that the temporary complete candidate passes both canonical audit metrics and vendor rescope.
- [x] (2026-09-22T05:24:20-03:00) Execute AAA-023:A13: the clean temporary candidate passes `git write-tree` and 76/77 aggregate gates; the sole test-gate failure is shared temporary-index concurrency across four workers.
- [x] (2026-09-22T05:34:35-03:00) Execute AAA-023:A14: the serial test alternative still inherits the temporary `GIT_INDEX_FILE` and reproduces Git fixture lock/object failures, confirming that a real candidate checkout is required for the full test gate.
- [x] (2026-09-22T12:02:08-03:00) Complete AAA-023:A15: seal private candidate tree `594d3afbb864b88bb5239f12d0ffdf54adc983c9` and pass the final local matrix at 77/77 gates; coverage and external release lanes remain open.
- [x] (2026-09-22T14:26:57-03:00) Complete AAA-023:A16: update the private candidate to tree `d122da6d97d38e0be1e8843ca642c537f759d460`, pass `pnpm run test:coverage` at 100% for statements, branches, functions, and lines, and retain the unchanged skip inventory and bounded Inspector exclusions.
- [x] (2026-09-22T14:57:37-03:00) Complete AAA-023:A17: repair the retained same-candidate failures and pass `check:all` at 77/77 gates on tree `f3b4cb2064db3af52807cfd631afda85dfa56aae`.
- [x] (2026-09-22T15:24:17-03:00) Complete AAA-023:A18: simplify the redundant `plugin-manager` name fallback and pass `pnpm run test:coverage` on candidate tree `023906dd82be40ed0ef187acd59fd7b5fb56eaae` at 100% in all four dimensions with unchanged skips.
- [x] (2026-09-22T15:35:33-03:00) Complete AAA-023:A19: rerun `pnpm run check:all` on candidate tree `023906dd82be40ed0ef187acd59fd7b5fb56eaae`; all 77 gates pass with no failures or dependent skips.
- [x] (2026-09-22T15:42:14-03:00) Execute AAA-023:A20: the complete benchmark lane fails two timing assertions, but the immediate focused rerun passes both with unchanged budgets; reproduce the complete lane before optimization or calibration.
- [x] (2026-09-22T15:45:48-03:00) Complete AAA-023:A21: rerun the complete benchmark lane on the unchanged sealed candidate; the 1/1 gate passes with no failures or skips.
- [x] (2026-09-22T15:54:03-03:00) Complete AAA-023:A22: official build, DSH/vendor packing, and the isolated 302-tarball consumer installation pass on unchanged candidate tree `023906dd82be40ed0ef187acd59fd7b5fb56eaae`; the initial npm metadata failure is retained as transient external variance after the unchanged retry passed.
- [x] (2026-09-22T16:42:38-03:00) Complete AAA-023:A23: candidate tree `3762900cd0a28245ef433647b8bdaf4d5cd84fac` passes the renewed aggregate, coverage, benchmark, build, packed-install, Node-compatibility, and keyless E2E checks; Windows, macOS/ARM64, and credentialed providers remain explicit external prerequisites. Three E2E `import.meta.resolve` sites were made compatible with Vitest's module runner and the full keyless suite then passed.
- [x] (2026-09-22T16:53:22-03:00) Complete AAA-023:A24: fetch `deepseek-official/master` at `00102833dfaee1da9f48a3a8eae9d34005a75218` and `origin/master` at `ddefc45fbc7f8e46dd73185e68295696d1297887` in a disposable worktree; the ordinary merge conflicts in 233 paths, including 12 modify/delete conflicts, and the policy verifier reports 293 unowned delta paths against `origin/master`; `git merge --abort` restores candidate tree `3762900cd0a28245ef433647b8bdaf4d5cd84fac` with no disposable changes.
- [x] (2026-09-22T17:05:09-03:00) Complete AAA-023:A25: classify 233 upstream conflicts as 195 paths matching existing owners and 38 ownerless paths; classify the 293 policy diagnostics as 266 coverage-comment paths, 11 ignored `.opencode` state paths, and 16 bounded generated/fixture/runtime paths. No policy mutation or candidate change was made.
- [x] (2026-09-22T17:07:52-03:00) Complete AAA-023:A26: prepare a bounded disposition: propose one exact-path `coverage-comment-preservation` upstream-patch owner for 266 paths, extend only semantically matching existing owners, keep five tool-identity paths and one jobs test explicit, and rebuild only a successor candidate without the 11 ignored `.opencode` state files. No policy or candidate mutation was applied.
- [x] (2026-09-22T17:19:59-03:00) Complete AAA-023:A27: record Ricardo Akinaga's explicit authority for six exact-path policy owners, removal of only the 11 ignored `.opencode` state paths from a successor, and same-candidate requalification; the implementation-ready gate passes with external actions excluded.
- [x] (2026-09-22T18:08:46-03:00) Complete AAA-023:A28: construct successor tree `e5db2822132da3cdcc48aad11d087cb3a3d32ab1`, pass policy attribution for 1,445 paths across 23 improvements, and pass the complete local matrix: check-all 77/77, coverage 100% across four dimensions, benchmark 1/1, Node compatibility 6/6, keyless E2E 43/43 files, official build 248 client artifacts, and packed install 302/302 tarballs; Windows/Wine and non-Linux/credentialed lanes remain external partials.
- [x] (2026-09-22T18:16:21-03:00) Complete AAA-023:A29: rehearse `deepseek-official/master` against successor tree `e5db2822132da3cdcc48aad11d087cb3a3d32ab1` in a disposable worktree; the merge aborts cleanly after 233 conflicts, policy attribution passes for 1,445 paths across 23 improvements, and three conflicted paths remain without an existing owner.
- [x] (2026-09-22T18:20:04-03:00) Complete AAA-023:A30: compare the three remaining paths with the successor, fork, official ref, and common base; all three are upstream-only additions and need no customization-policy owner or wildcard.
- [x] (2026-09-22T18:24:21-03:00) Complete AAA-023:A31: record official-upstream updateability as unresolved after the 233-conflict rehearsal, preserve successor tree `e5db2822132da3cdcc48aad11d087cb3a3d32ab1`, and make no merge or publication claim.
- [x] (2026-09-22T18:28:34-03:00) Complete AAA-023:A32: reconcile the frozen quality bar against current successor evidence; local lanes are current, while external platform/provider, unresolved upstream, release-identity, and final-critic gaps remain explicit.
- [x] (2026-09-22T18:32:09-03:00) Complete AAA-023:A33: assemble the local-only identity packet binding successor commit/tree, refs, clean status, policy, local matrix, open prerequisites, and six evidence digests.
- [x] (2026-09-22T18:33:15-03:00) Complete AAA-023:A34: reproduce all 12 identity checks, including six evidence digests, with PASS; the candidate is ready only for external prerequisites.
- [x] (2026-09-22T18:37:12-03:00) Complete AAA-023:A35: map Wine, native platform, Node compatibility, benchmark, provider, and final-critic lanes to exact workflow jobs, carriers, commands, and secret boundaries; no external action was dispatched.
- [x] (2026-09-22T18:49:16-03:00) Classify the 140 current state-checker failures as historical control-plane residue; preserve append-only records and keep the checker result explicit until a separately authorized migration exists.
- [x] (2026-09-22T18:51:55-03:00) Complete AAA-023:A36 as an explicit external wait: the exact candidate remains clean, but Wine, non-Linux carriers, alternate Node binaries, and authorized provider credentials are unavailable; no local substitute is promoted.
- [x] (2026-09-22T18:55:00-03:00) Complete AAA-023:A37: map all REM items and AAA-QB criteria to the exact candidate or an explicit gap; discover that REM-028 has only its first Session-reader wave and must be reopened before final qualification.
- [x] (2026-09-22T19:03:37-03:00) Complete AAA-022:A02 design: reconcile the 79/54 frozen scope, 82/44 prior inventory, 87/57 raw call probe, and canonical 89-line metric; define W0-W4 owner waves and focused acceptance without changing production.
- [x] (2026-09-22T19:10:03-03:00) Complete AAA-022:A03: record the user's scoped approval for W0-W4 and the bounded asynchronous reader, projection, and pre-commit seams; broad lint/compiler changes and release actions remain excluded.
- [x] (2026-09-22T19:12:30-03:00) Complete AAA-022:A04: reconcile the candidate-bound Session-reader corpus as 81 production call sites in 56 files, distinguish the 79/54 frozen exception unit from the 87/57 diagnostic and 89-line canonical metric units, and assign every site to W1-W3 with a retained local reason.
- [x] (2026-09-22T19:29:50-03:00) Complete AAA-022:A05: add the identity-only canonical-event validation seam, remove the telemetry eventAt waiver, pass 118 focused tests plus package type/lint/catalog/documentation checks, and retain the aggregate metric limitation caused by 12 pre-existing tracked deletions.
- [x] (2026-09-22T19:36:00-03:00) Complete AAA-022:A06: select the existing live-preferred SessionQuery observation seam, preserve the sdk-minimal fallback, and define fixed-cut, cancellation, inherited-prefix, wire-equivalence, lease-disposal, and complete-candidate metric acceptance.
- [x] (2026-09-22T20:00:41-03:00) Complete AAA-022:A07: implement the optional observation-based session-log-deepseek reader seam; 46 package tests, typecheck, Oxlint, dependency, documentation, cancellation, fixed-cut, fork, disposal, and fallback checks pass, while canonical metrics remain withheld for the incomplete worktree.
- [x] (2026-09-22T20:18:00-03:00) Complete AAA-022:A08: select the SessionObservationReader-owned live capture seam for SessionCorpus and SQLite, preserve complete-history and persistence semantics, and retain session-projection as a separate owner.
- [x] (2026-09-22T20:29:30-03:00) Complete AAA-022:A09: implement the bounded SessionCorpus/SQLite live-observation owner seam; focused verification passes with the incomplete-worktree metrics limitation recorded in A80.
- [x] (2026-09-22T20:39:30-03:00) Complete AAA-022:A10: design the session-projection owner seam; retain S067-S069 until a core Session lifecycle baseline handoff is specified, and preserve the no-query dependency rule.
- [x] (2026-09-22T20:47:00-03:00) Complete AAA-022:A11: specify the core Session/SessionStore lifecycle handoff for exact projection baselines, existing-session registration, and disposal ordering; A12 is gated for implementation.
- [x] (2026-09-22T21:18:01-03:00) Complete AAA-022:A12: implement the transient SessionCreationBaseline handoff and strict session-projection baseline seam; focused lifecycle, cache, consumer, type, lint, generated-documentation, and pairing checks pass, while canonical metrics and four aggregate doc-sync lanes remain unavailable on the incomplete dirty worktree.
- [x] (2026-09-22T21:24:20-03:00) Correct the two stale session-title projection expectations exposed by the A13 baseline sweep; the late registration test now expects the exact-baseline rejection and the bounded aggregate test installs before appending, with the focused six-file suite passing 73/73.
- [x] (2026-09-22T21:26:19-03:00) Complete AAA-022:A13: disposition the remaining W1 sites, close S070 through the existing canonical-event seam, retain complete-history and synchronous-pre-commit exceptions with local reasons, and gate A14 for baseline adoption in the two invariant creation paths.
- [x] (2026-09-22T21:34:52-03:00) Complete AAA-022:A14: consume SessionCreationBaseline in the core and title invariant creation paths; 558 affected-package tests, 24 focused invariant tests, package builds, host tsc, Oxlint, dependency policy, export-JSDoc, and diff checks pass.
- [x] (2026-09-22T21:40:19-03:00) Complete AAA-022:A15: retain the deprecated own-events compatibility API and the synchronous complete-history fork exception, define the future storage-owned fork-cut requirements, and pass the focused fork/sequence suite without production changes.
- [x] (2026-09-23T01:10:01-03:00) Complete AAA-022:A16: retain bounded telemetry suffix capture, select provider-owned asynchronous all-history title loading, specify a committed-human-message citation index, and pass the 119-test focused baseline; A17 is gated.
- [x] (2026-09-23T03:30:02-03:00) Complete AAA-022:A17: implement the provider-owned title history loader, committed-human-message citation index, and app-boot startup enforcement; the focused suite passes 12 files/163 tests and the fresh I1 critic approves all six criteria. Scoped type, lint, generated API/module graph, pairing, test:docs, targeted ownership, and whitespace checks pass; full doc-sync retains four failures, broad customization-policy validation retains unrelated dirty-tree diagnostics, and the canonical debt metric remains unavailable.
- [x] (2026-09-23T04:28:00-03:00) Complete AAA-022:A18: the fresh read-only critic approves W2-01–W2-05 for design readiness; rejected append recovery reads the backend's actual log, prepared projection failures are critical pre-acceptance work, and A19 is limited to the preparation feed/projection prerequisite. Retain the recorded unpublished turnBoundary baseline failure for A19; the A20 storage drain and page policy remain unimplemented.
- [x] (2026-09-23T08:20:09.374182-03:00) Complete AAA-022:A19 with scoped PASS: preparation-owned event capture and preconstruction projection readiness pass implementation review, focused type/lint/build/documentation checks, and generated catalog checks; retain five doc-sync failures and the equal-timestamp state-check diagnostic. A20 is gated for bounded storage pages and ambiguous append recovery.
- [x] (2026-09-23T05:03:23-03:00) Reconcile the A19 entry records without rewriting history: the earlier action-scoped gate and malformed binding events remain preserved; the current A19 gate is bound to stable backlog task AAA-022, its 24-path candidate fingerprint matches, and implementation starts under that record. The repository-wide state checker still reports historical and unrelated findings.
- [x] (2026-09-23T05:14:49.580895-03:00) Revalidate A19 gate readiness under the canonical framework schema: preserve the earlier action-scoped and first task-scoped records, bind the approved 24-path candidate to the canonical IR-001–IR-003 criteria and A03-derived subject authority, and keep the active action at AAA-022:A19.

- [x] (2026-09-20T19:21:30-03:00) Reproduce the baseline at one pristine immutable commit before changing product behavior; retain the environment manifest, command matrix, and raw output digests.
- [ ] Execute milestones M1 through M8 and update this plan, the backlog, ledgers, and program page at every transition.

- [x] (2026-09-23T09:16:28.004476-03:00) Complete AAA-022:A20: implement bounded prepublication persistence pages, fixed-cut synchronous publication handoff, and explicit exact-ID recovery; 49 focused tests, typecheck, Oxlint, package build, focused docs, catalog/type-equivalence, ownership, pairing, whitespace, and fresh scoped review pass at candidate 81096ad9c391997963a8245b5dc2840e4a2aa461c6117c5ef0122d3ebed3ed8c. Retain the A20 gate-history diagnostic and five prior aggregate doc-sync findings; A21 is active for W2 context design.

## Surprises & Discoveries
- Observation: the first W2 design-to-implementation checkpoint declared an illegal IN_PROGRESS-to-IN_PROGRESS transition. The append-only correction records the legal IN_PROGRESS-to-READY checkpoint and a gated READY-to-IN_PROGRESS start; no earlier ledger row was edited. Evidence: `.agent/evidence/AAA-022/w2-gate-transition-correction-20260924.json`.
- Observation: the reviewed Schedule migration can reuse scheduleProjectionDefinition at stateVersion 2 and the existing SessionProjectionRegistry; changing the serialized projection, Session format, Session services, catalogs, or bundles is unnecessary. Invalid creation baselines need a prepended global session/created preflight that catches only ScheduleLogError and calls the package invariant fail() path before the registry folds the baseline. Evidence: `.agent/evidence/AAA-022/schedule-reader-design-amendment-3-w2-20260924.json` and `.agent/evidence/AAA-022/schedule-reader-design-amendment-3-review-w2-20260924.json`.
- Observation: customization ownership is path-exclusive, so the current coverage-marker owner collides with the Schedule implementation on invariant.ts and runtime.ts even though those files already contain separate coverage edits. The approved owner reassigns only those two files, leaves domain.ts with its existing owner, excludes the separately dirty package.json, and preserves all three current V8 annotation lines byte-for-byte. Evidence: `.agent/evidence/AAA-022/schedule-reader-policy-candidate-validation-3-w2-20260924.json` and `.agent/evidence/AAA-022/schedule-reader-design-amendment-3-review-w2-20260924.json`.
- Observation: the A20-to-A21 transition uses CHECKPOINT IN_PROGRESS to READY, followed by START READY to IN_PROGRESS. The checkpoint's initial self-transition was preserved and corrected in the append-only ledger. Its ungated START also preserved an explicit `gate_ref: null`; gate-binding validation does not apply ledger corrections, so this leaves two recorded diagnostics.
  Evidence: `.agent/execution-log.jsonl#EVT-AAA-022-CHECKPOINT-A20-A21-001-094`, `.agent/execution-log.jsonl#EVT-AAA-022-CHECKPOINT-A20-A21-001-094-CORRECTION-001`, `.agent/execution-log.jsonl#EVT-AAA-022-START-A21-096`, `.agent/execution-log.jsonl#EVT-AAA-022-START-A21-096-CORRECTION-001`, `.agent/evidence/AAA-022/a20-state-check-post-closeout-20260923.txt`, and `.agent/evidence/AAA-022/a20-a21-control-revalidation-20260923.json`.
  Decision: preserve each original event and its correction, keep A21 active, and report the two remaining gate-binding diagnostics with the 353-finding aggregate state check.


- Observation: gate history groups IMPLEMENTATION_READY records by the stable task reference and requires each successor to preserve its predecessor's scope string. The A20 gate's narrower action description adds one aggregate GATE_HISTORY_SCOPE finding; the exact A20 gate schema, authority, event binding, and candidate digest validate independently.
  Evidence: `.agent/gates/implementation-ready-AAA-022-A20-prepared-pages.json`, `.agent/evidence/AAA-022/a20-state-check-20260923.txt`, and `.agent/evidence/AAA-022/a19-state-check-20260923.txt`.
  Decision: preserve the append-only A20 record and carry the new control-plane finding while continuing the authorized local implementation; do not claim aggregate state-check PASS.

- Observation: the runtime checker accepts only canonical IR-001–IR-003 entry criteria and requires confirmed authority evidence to match the exact gate subject, scope, and task ID.
  Evidence: `/home/ricardo/.agents/skills/engineering-framework/references/contracts.json`, `.agent/gates/implementation-ready-AAA-022-A19-task-scope.json`, and the successful direct validation of `.agent/gates/implementation-ready-AAA-022-A19-canonical.json`.
  Impact: the canonical A19 record supersedes the first task-scoped attempt; its authority evidence narrows the existing A03 approval without adding authority.

- Observation: the earlier A19 gate record used an action ID for scope_ref and its lifecycle event used the raw gate-file digest; the A18 checkpoint also retains a partial gate binding.
  Evidence: `.agent/gates/implementation-ready-AAA-022-A19.json`, `.agent/execution-log.jsonl#EVT-AAA-022-GATE-A19-081`, and `.agent/execution-log.jsonl#EVT-AAA-022-CHECKPOINT-A18-082`.
  Impact: keep those append-only records intact, bind current A19 readiness to the stable task ID in a separate gate record, and retain the checker findings as historical diagnostics.

- Observation: AgentLoop constructs from an unpublished prepared Session before session-created or hydrate initializes turnBoundary projection state.
  Evidence: `.agent/evidence/AAA-022/session-core-agent-loop-reader-design-a92.json`; the focused baseline has 48 failed and 29 passed tests across five files.
  Impact: the W2 implementation gate must initialize and advance prepared projections before Agent construction; this baseline failure remains explicit until fixed.

- Observation: a rejected persistence append can have provider-specific effects, and configured creation may use either a fixed ID or a generated ID.
  Evidence: `.agent/evidence/AAA-022/session-core-agent-loop-reader-failure-amendment-a95.json` and `.agent/evidence/AAA-022/session-core-agent-loop-reader-design-review-a96.json`.
  Impact: A20 must reopen and inspect the actual valid log rather than infer a cursor from resolved pages or retry an ambiguous page; generated-ID recovery uses the reported ID, while a later fixed-ID remount keeps the existing resume-first behavior.

- Observation: the Portuguese audit returns CONDITIONAL PASS with a score of 86, while the broader repository audit returns FAIL with a score of 65.
  Evidence: `docs/audits/auditoria-completa-2026-09-20.md` and `docs/customization/repository-audit-2026-09-20.md`.
  Impact: numeric scores are not release evidence; the later audit's executed failures establish the conservative baseline.
- Observation: the reported ghost workflow dependency belongs to a dated public npm resolution catalog, not necessarily the current workspace.
  Evidence: `scripts/gen-dependency-catalog.ts` and `scripts/dependency-catalog/resolution.json`.
  Impact: do not delete the entry; reproduce a published-package failure before opening a product remediation.
- Observation: the generated Cordis catalog's `verify-cordis-api` name has a live compatibility entry point.
  Evidence: `scripts/gen-cordis-api.ts` and repository scripts.
  Impact: do not treat the banner alone as a defect.
- Observation: count-based findings vary with corpus, exclusions, and checkout state.
  Evidence: the reports disagree on residue and skipped-test counts and omit an immutable audited commit.
  Impact: the canonical metric command and corpus are required before debt trends become acceptance evidence.
- Observation: the first fresh-context critic found a circular final-qualification obligation, but its read-only sentinel also detected a changed ignored Vitest cache result.
  Evidence: the pre/post repository fingerprint differed only at `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`.
  Impact: the verdict is retained as INVALID mutation evidence; its independently reproducible findings were remediated and require a new sealed critic.
- Observation: the expected-output fixture's current DeepSeek compatibility oracle is stable at two requests: one agent turn and one background session-title request.
  Evidence: `.agent/evidence/AAA-008/commands.jsonl#CMD-AAA-008-001` through `#CMD-AAA-008-004` and the retained request-role capture.
  Impact: the historical third-request report has no current reproduction or request-body trace; do not change product behavior or weaken the oracle without an original failing-run trace or maintainer decision.
- Observation: the client-domain graph's 38 violations are implementation coupling below existing package assembly points, not one undifferentiated failure.
  Evidence: `.agent/evidence/AAA-009/findings.json` and `.agent/evidence/AAA-009/commands.jsonl#CMD-AAA-009-001` through `#CMD-AAA-009-004`.
  Impact: the next action must settle the shared document API placement and semantic owners of the composer and Browser presentation files before any relocation or public-export change.
- Observation: frontend-static's lexical fence does not contain resolved symlink targets.
  Evidence: `.agent/evidence/AAA-013/findings.json` and `.agent/evidence/AAA-013/commands.jsonl#CMD-AAA-013-001` through `#CMD-AAA-013-004`.
  Impact: the official fallback owner needs canonical root/target resolution and real-composition negative fixtures before the static-security criterion can pass; the task has a task-bound implementation gate and no human decision dependency.

## Decision Log
- Decision: migrate Schedule readers to the exact SessionProjectionRegistry value and fail closed when its provider or Schedule key is absent; retain synchronous pre-append validation and fork ownership using the same stateVersion-2 projection definition. Keep the existing Session format and projection schema. Context and evidence: four review rounds found and resolved exact-input, baseline-error, lifecycle, coverage, and file-owner gaps; the final 19-path implementation set and 7 read-only paths are in `.agent/evidence/AAA-022/schedule-reader-design-amendment-3-w2-20260924.json`. Date/Author: 2026-09-24, program integrator under `.agent/authority.jsonl#AUTH-AAA-022-READER-MIGRATION-A03-001`.

- Decision: replace aggregate quality scores with a frozen rejectable Quality Bar.
  Context: the two reports used different executed scopes and produced incompatible verdicts.
  Alternatives: average the scores; adopt the higher score; adopt the lower score without criteria.
  Reason: exact targets and evidence methods make failure reproducible and prevent narrative grading.
  Consequences: no Triple-A claim is allowed until every required criterion has current same-candidate evidence.
  Date/Author: 2026-09-20, program integrator.
- Decision: keep one mutable task-status owner in `.agent/backlog.json`.
  Context: roadmap prose, the ExecPlan, and task ledgers can otherwise drift into competing status inventories.
  Alternatives: duplicate checklists in every document; use only narrative prose.
  Reason: the backlog can encode dependencies and one next action while the ExecPlan owns context, ordering, and recovery.
  Consequences: human-facing roadmap phases remain status-free and link to the backlog for current execution state.
  Date/Author: 2026-09-20, program integrator.
- Decision: use existing extension types and focused upstream changes rather than create a generic quality plugin or skill.
  Context: most findings belong to official test, gateway, filesystem, client, Session, or package owners.
  Alternatives: intercept official behavior with fork-only plugins; create a skill that cannot enforce runtime behavior.
  Reason: the improvement standard requires the behavior and lifecycle owner to determine `solutionType`.
  Consequences: governance uses `repository-automation`; official runtime defects use `upstream-package-change`; resilient compaction retains its existing `plugin-and-bundle` owner.
  Date/Author: 2026-09-20, program integrator.
- Decision: require a separate customization-policy record before each production remediation begins.
  Context: this quality-program record owns planning and governance artifacts, not product package source.
  Alternatives: let one broad governance record claim all future files; defer attribution until commit.
  Reason: narrow ownership keeps each change removable and makes upstream extraction explicit.
  Consequences: a task may advance through reproduction and design, but package edits wait for a correctly classified proposed record.
  Date/Author: 2026-09-20, program integrator.
- Decision: use the English root README as the canonical community-channel source and measure static debt from one tracked-source corpus.
  Context: the root README pair advertised different community destinations and exploratory counts used incomparable file selections and token rules.
  Alternatives: retain locale-only destinations; use recursive globs without a resolved corpus; publish counts without a shared result schema.
  Reason: the maintainer confirmed exact localized target parity, and a validated schema with a corpus digest makes later counts comparable.
  Consequences: the parity gate rejects missing or locale-only README targets, while metric changes remain line-based indicators and do not authorize static-debt migration.
  Date/Author: 2026-09-21, Ricardo Akinaga.
- Decision: split W2 implementation so A19 establishes the preparation-owned event feed and exact projection readiness before Agent construction; A20 owns bounded storage drains, page configuration, and the final live-writer handoff.
  Context: the recorded baseline fails because the unpublished Agent reads turnBoundary before the projection registry initializes a cell, while storage writes need a separate bounded failure policy.
  Alternatives: combine projection readiness and storage drain in one implementation gate; publish before storage completes.
  Reason: projection readiness has a direct local acceptance oracle and can be fixed without changing the persistence cursor or failure contract.
  Consequences: A19 does not add the page Config or implement S020 storage draining; every later slice retains its own gate and recovery tests.
  Date/Author: 2026-09-23, program integrator.
- Decision: reconcile a rejected SessionHandle append by reopening the exact id and reading the backend's actual valid log; do not infer stored state from the number of resolved pages or blindly replay the rejected page.
  Context: the persistence API does not promise that rejection means no effect, and JSONL write effects are provider-specific.
  Alternatives: assume only resolved pages exist; retry the rejected append; introduce all-provider atomic staging.
  Reason: append-only history forbids truncating acknowledged events, while no frozen all-or-none create requirement or staging transaction exists.
  Consequences: callers receive the create failure and explicitly reconcile the exact id; future fixed-id configured remounts preserve the existing resume-first behavior, while generated IDs require explicit recovery from the reported id.
  Date/Author: 2026-09-23, program integrator.

- Decision: preserve the malformed A19 gate history and use a separate task-scoped readiness record for implementation.
  Context: the prior gate record identifies action AAA-022:A19 as its scope_ref and its event stores a raw file digest, while runtime state requires scope_ref to equal the active backlog task ID. The following checkpoint also carries a partial gate binding.
  Alternatives: rewrite gate or execution history; add another action-level binding that still conflicts with the task pointer; leave A19 without a current typed gate.
  Reason: append-only evidence stays auditable, and the task-scoped record is the only current binding that satisfies runtime state.
  Consequences: A19 starts under a PASS gate scoped to AAA-022; prior mismatches remain explicit and keep the repository state check from passing.
  Date/Author: 2026-09-23, program integrator.
- Decision: use the canonical task-scoped A19 gate schema and bind its authority record to the existing A03 approval.
  Context: the first task-scoped recovery record retained custom criterion IDs and untyped conditions, which the runtime contract rejects; the original A03 authority subject also cannot directly serve as a gate-specific authority subject.
  Alternatives: rewrite either immutable gate, authority, or execution history; keep the schema-invalid record current; record a narrowly scoped authority projection for the already approved A19 action.
  Reason: exact subject and criterion binding let current state validate while preserving the historical attempts and the user-approved W0–W4 scope.
  Consequences: the canonical record supersedes the first task-scoped attempt and remains bound to AAA-022; historic records and unrelated checker failures stay visible.
  Date/Author: 2026-09-23, program integrator.
- Decision: set `prepublicationAppendBatchSize` to a validated default of 128 events and a maximum of 4096.
  Context: focused fixtures cover completed and interrupted turns with one to three events, while the prepublication writer needs a finite per-call event bound and deployment-level configurability.
  Alternatives: retain one unbounded append, cap at the largest current fixture, or omit a finite maximum.
  Reason: 128 leaves room for setup events while keeping append calls bounded; 4096 is a finite safety ceiling. Neither value claims an optimal throughput point or byte-size limit.
  Consequences: callers can tune the page size through validated agent-loop Config; later changes to the default or maximum need fresh compatibility and persistence evidence.
  Date/Author: 2026-09-23, program integrator.

## Outcomes & Retrospective

The planning checkpoint creates the control plane but does not improve runtime quality by itself. The present verdict remains FAIL until the baseline is reproduced and the required criteria pass. Record actual product outcomes, discarded hypotheses, and residual limitations here after each milestone; never rewrite the original baseline.

AAA-022:A20 completed with scoped acceptance and a fresh read-only review PASS on the exact 15-path candidate 81096ad9c391997963a8245b5dc2840e4a2aa461c6117c5ef0122d3ebed3ed8c. The implementation bounds each append, drains to a fixed sequence cut, and hands off synchronously to live persistence; ambiguous rejection is repaired only through explicit exact-ID resume. The repository state checker retains 351 findings and the latest doc-sync evidence remains 38/43; AAA-022 continues at A21 for the next W2 owner design.

## Context and Orientation

The repository root is `/home/ricardo/deepseek-harness`. `master` is the official mirror and `custom/main` is the permanent integration branch. `docs/customization/improvement-development-standard.md` selects the safe solution type. `.agents/customization-policy.json` assigns every custom delta to one improvement. The two source audits live at `docs/audits/auditoria-completa-2026-09-20.md` and `docs/customization/repository-audit-2026-09-20.md`.

This plan owns execution context and milestone order. `.agent/plans/deepseek-harness-aaa-quality-bar.json` owns exact release criteria. `.agent/backlog.json` owns task status, dependencies, acceptance summaries, and next actions. `.agent/state.json` owns the current runtime pointer. Append-only ledgers own chronology and verification. `docs/customization/aaa-quality-program.md` is the concise maintainer-facing charter and roadmap.

## Scope and Constraints

- In scope: reproduce audit findings; fix confirmed correctness, security, lifecycle, packaging, documentation, governance, performance, and maintainability gaps; qualify one immutable candidate; keep the fork updateable from upstream.
- Out of scope: changing product behavior only to improve a score; deleting generated or published-catalog entries without reproducing a defect; bypassing required credentials or platform jobs; rewriting the permanent integration branch.
- Applicable instructions: `AGENTS.md`, `docs/AGENTS.md`, `.agents/notes/AGENTS.md`, `.agent/PLANS.md`, and more-specific package instructions for each task.
- Requirements and decisions: the root architecture and defensive-pattern documents, the improvement development standard, the frozen bar, and active Agent Notes.
- Tier/risk/blast radius: `T3_SYSTEM`, `HIGH`, `SYSTEM`, because the work spans security-sensitive runtime code, Session evidence, CI, package publication, and most repository gates.
- Authorization constraints: publication identity, WebSocket close semantics, HTTP aggregate resource policy, dynamic extension policy, source-export compatibility, and intentional locale-specific communication channels require human decisions. Static-file resolved-target containment is fail-closed and non-waivable.

## Architecture and Interfaces

The program does not add a product runtime layer. It routes each confirmed finding to the existing owner. Repository checks and workflows use `repository-automation`. Official package behavior uses a focused `upstream-package-change`, with every consumer, documentation contract, and required snapshot updated together. The resilient-compaction customization remains an opt-in plugin plus bundle. Configuration is valid only when an existing validated field already owns the deployment choice.

Model-visible changes must be reconstructable from Session events and use keyless recorded-session evidence when repository policy requires it. Released Session generations remain adjacent and immutable. Lifecycle work follows `docs/defensive-patterns.md`. Generated files change only through their source owner. A custom product change cannot start until its policy record names the exact paths and exit or extraction plan.

M0 selects the exact planning-checkpoint commit only after the worktree is clean and `HEAD` equals `origin/custom/main`; otherwise AAA-001 records the mismatch and stops. Its detached worktree lives at `.worktrees/aaa-baseline-<12-character-commit>`. `.agent/evidence/AAA-001/environment.json` records the five relevant Git refs, clean status, OS, architecture, Node, pnpm, umask, worktree path, and capture time. `.agent/evidence/AAA-001/findings.json` records each source finding, reproduction command ID, observed status, classification, and owning backlog task. `.agent/evidence/AAA-001/commands.jsonl` records command ID, exact argv, working directory, start/end time, exit status, output digest, raw-output path, and limitations; raw logs live under ignored `.artifacts/aaa/AAA-001/`.

`state.human_approval_required` lists every known unresolved program-level approval, not only the next task's approval. A later authority record removes an item only after the named decision is confirmed, denied, or rendered inapplicable by evidence.

## Milestones

### M0 — Freeze and reproduce the baseline

- Outcome: one pristine immutable commit has a complete environment manifest and a current finding/evidence matrix.
- Scope/dependencies: no product changes; distinguish environment, stale-report, and product failures.
- Demonstration: rerun reported failing leaves and required unexecuted lanes in a disposable clean worktree.
- Acceptance/evidence: AAA-001 plus `AAA-QB-01`, `AAA-QB-02`, and release identity and platform evidence in `AAA-QB-13`.

### M1 — Make the execution environment deterministic

- Outcome: clean preparation, constraints, spill fixtures, browser provisioning, and standalone hygiene behave predictably.
- Scope/dependencies: AAA-002, AAA-004, AAA-007, and AAA-021 after M0.
- Demonstration: clean-tree constraints, spill tests under both supported umasks, pinned browser replay, and hygiene from its documented precondition.
- Acceptance/evidence: current focused command records plus aggregate rerun; no unexplained retry.

### M2 — Close the maintained custom delta

- Outcome: resilient compaction and persistent-shell changes are attributed, removable, documented, and replayable through shipped entry paths.
- Scope/dependencies: AAA-005, AAA-006, and AAA-011 after snapshot prerequisites.
- Demonstration: built/lib adapter replay, focused shell tests, synchronized README/Agent Note text, and assembled keyless snapshot.
- Acceptance/evidence: `AAA-QB-03` and `AAA-QB-06` pass for the custom delta.

### M3 — Resolve high-risk runtime contracts

- Outcome: WebSocket close, static file containment, HTTP aggregate memory, and dynamic extension trust have explicit contracts and negative tests.
- Scope/dependencies: AAA-012 through AAA-015; design may run after M0 while lower-risk work proceeds.
- Demonstration: barrier close test, symlink escape test, concurrent resource-budget test, and threat-model review.
- Acceptance/evidence: `AAA-QB-05` and applicable resilience evidence in `AAA-QB-10`.

### M4 — Restore graph and behavioral evidence

- Outcome: client-domain ownership, module graph, snapshot generation, and expected request behavior agree with their owners.
- Scope/dependencies: AAA-008 through AAA-010 plus AAA-005.
- Demonstration: focused graph/generator/replay checks followed by the aggregate gate.
- Acceptance/evidence: `AAA-QB-03` and `AAA-QB-04` pass.

### M5 — Repair governance controls

- Outcome: weighted approval, customization classification, official-mirror equality, metrics, documentation semantics, and gate prerequisites fail closed.
- Scope/dependencies: AAA-003, AAA-016 through AAA-018, and AAA-021.
- Demonstration: positive and invalid fixtures plus top-level workflow or command invocation.
- Acceptance/evidence: `AAA-QB-06`, `AAA-QB-09`, and `AAA-QB-13` pass.

### M6 — Settle publication and public API policy

- Outcome: fork package identity and source-export behavior are authorized and packed artifacts resolve every promised entry.
- Scope/dependencies: AAA-019 and AAA-020; human publication decision first.
- Demonstration: inspected packed manifests, release pack, packed-install verification, and NodeNext consumer check.
- Acceptance/evidence: `AAA-QB-07` and `AAA-QB-11` pass.

### M7 — Harden static contracts in bounded waves

- Outcome: deprecated readers, suppressions, correctness rules, and compiler relaxations have canonical metrics, owners, and declining debt without blanket exceptions.
- Scope/dependencies: AAA-022 after canonical metrics.
- Demonstration: owner-scoped migrations and compiler/linter probes with focused tests.
- Acceptance/evidence: `AAA-QB-08` passes; count-only observations do not become defects without behavior or contract evidence.

### M8 — Qualify and independently audit the release

- Outcome: one immutable candidate passes the complete release matrix, upstream update rehearsal, and fresh read-only criticism; a follow-up audit attestation binds its verdict to that exact candidate and evidence index.
- Scope/dependencies: AAA-023 and AAA-024 after every required remediation and human decision.
- Demonstration: AAA-023 first seals same-SHA local and CI evidence for `AAA-QB-01` through `AAA-QB-13`; AAA-024 runs the I1-or-better critic without changing that candidate, then publishes a documentation-only attestation that names the candidate commit and evidence-index digest.
- Acceptance/evidence: `AAA-QB-v1.4` passes all fourteen required criteria with no residual HIGH or CRITICAL risk. The attestation commit is not the qualified release candidate unless the complete bar is rerun on it.

## Plan of Work

Start with evidence, not fixes. M0 runs the smallest reproductions that can confirm or retire each audit claim. M1 removes environmental ambiguity before aggregate results are interpreted. M2 and M5 close the custom fork's existing correctness and governance obligations early. M3 runs in parallel only after its human-owned contracts have explicit decisions; implementation remains sequential per shared package owner. M4 updates generated truth through its owning source. M6 blocks release until publication identity is authorized. M7 uses bounded waves rather than a repository-wide flag flip. M8 seals one candidate and forbids drift between verification and verdict.

Prepare and start each task through two recoverable state-last transactions. While the current action only inspects, reproduces, specifies, decides, or reviews, set the task's current backlog stage to AUDIT, SPEC, or EVOLUTION before READY, append one DECISION transition, and preserve `last_gate_record: null`. Immediately before the first production or governance action that changes the governed deliverable—including an IMPLEMENT action or a generator RUN that writes tracked output—advance the task and runtime lifecycle to BUILD and create `.agent/gates/implementation-ready-<task-id>.json` with a task-bound `IMPLEMENTATION_READY` PASS and required authority. Validate its `scope_ref`, PASS decision, evidence and authority freshness, and candidate fingerprint; update a TODO task to READY with the material action; append exactly one matching `GATE_PASSED` event that both binds the gate record ID and records the transition; then update runtime state last with the event ID, incremented `state_revision`, READY status, null task/action pointers, the exact gate path in `last_gate_record`, next gate, and timestamp. Preparatory work therefore cannot manufacture implementation authority before its evidence or human decision exists.

To start a READY task, revalidate the task ID and event binding recorded at `state.last_gate_record` when the current backlog stage is BUILD, together with its PASS decision, authority, evidence freshness, and candidate fingerprint. For an ungated AUDIT, SPEC, or EVOLUTION action, require `last_gate_record: null`. Then update its task/plan artifact and active-action marker, change only that backlog item to IN_PROGRESS, append START with `status_from: READY`, `status_to: IN_PROGRESS`, and the exact backlog `next_action.id`, and update runtime state last with matching `active_task`, `active_action_id`, `last_event_id`, incremented `state_revision`, activity, status, next gate, timestamp, and the same gate path or null value.

Advance between actions through a third state-last checkpoint transaction. Persist the completed action artifact and verification first; update this plan's marker and first concrete step. If the successor enters BUILD, create and validate the task-bound implementation gate, update the backlog stage and single `next_action`, append exactly one `GATE_PASSED` binding, and append CHECKPOINT with the completed action evidence and successor `active_action_id`; otherwise replace only the backlog action and append CHECKPOINT. Then update state last with the successor, latest event ID, incremented `state_revision`, lifecycle/activity, next gate, timestamp, and the exact gate path or null value. Recovery inspects the completed artifact, gate when applicable, backlog, ledger tail, and state in that order and completes or corrects an interrupted transaction by appending evidence; it never rewrites an earlier event. At every checkpoint, update this plan only when scope, order, risk, decisions, or the active action changed. At verification, append exact evidence and advance through VERIFY to DONE only when the required current records exist.

## Concrete Steps

From `/home/ricardo/deepseek-harness`:

1. [AAA-022:A24] Design the next W2 interaction-owned current-event and synchronous-invariant migrations for REM-028-S041 through REM-028-S046; define lifecycle, pre-commit, restore/fork, cancellation, teardown, falsifiers, and exact implementation paths before any implementation gate.
1. [x] (2026-09-24T13:03:00Z) [AAA-022:W2-CORE-TOOLS-IMPLEMENT] Implement the exact 15-path transactional baseline fold for REM-028-S029; focused tests, typecheck, lint, scoped docs/catalog/JSDoc/policy checks pass, with the unsupported literal pairing wrapper and unchanged FAIL-358 baseline recorded in `.agent/evidence/AAA-022/core-tools-implementation-20260924.json`.
1. [x] (2026-09-23T19:00:17-03:00) [AAA-022:A25] Bind the corrected implementation-ready gate to the fresh 55-path A24 review, exact owner attribution, and 64-path preimplementation scope snapshot.
1. [x] (2026-09-23T16:43:56-03:00) [AAA-022:A24] Complete the independent design review for REM-028-S041 through REM-028-S046; approve the 33-path implementation scope and retain the 359-finding aggregate state-check result.
1. [x] (2026-09-23T13:24:36-03:00) [AAA-022:A21] Complete W2 context-reader and synchronous-invariant design; the independent round-two review approves A21-01 through A21-07 and the exact 33-path implementation scope.
1. [x] (2026-09-23T15:24:06-03:00) [AAA-022:A22] Implement the approved A21 context-reader migrations across 33 paths; the final independent review approves A21-01 through A21-07 and post-checkpoint scoped verification passes 295 tests, type, lint, documentation, catalog, pairing, and whitespace checks, with repository-wide limitations retained.
1. [x] (2026-09-23T15:28:30-03:00) [AAA-022:A23] Reconcile the missing REM-028-S029 owner: keep `packages/core/tools` as the final W2 slice after the A74 owner sequence, preserving the order of every listed owner and leaving `packages/interaction` next.
1. [x] (2026-09-23T09:16:28.004476-03:00) [AAA-022:A20] Implement bounded prepublication persistence pages, explicit page sizing, fixed-cut synchronous publication handoff, and explicit exact-ID recovery within the 15-path gate; retain the recorded state-check and doc-sync findings.
1. [x] (2026-09-23T08:20:09.374182-03:00) [AAA-022:A19] Complete the prepared Session append feed and exact projection readiness before Agent construction, update the paired subsystem pages and generated Cordis catalog, and pass scoped review; retain five aggregate doc-sync failures and the equal-timestamp state-check finding.
1. [x] (2026-09-23T04:28:00-03:00) [AAA-022:A18] Design and independently review W2-01–W2-05 for REM-028-S020–S023; approve the prepared feed, critical projection and failure semantics, fixed-cut handoff design, and compatibility requirements, with the unpublished turnBoundary baseline failure retained.
1. [x] (2026-09-22T20:29:30-03:00) [AAA-022:A09] Implement the bounded SessionCorpus/SQLite live-observation owner seam and prove its acceptance matrix; focused verification passes with the incomplete-worktree metrics limitation recorded in A80.
1. [x] (2026-09-22T20:39:30-03:00) [AAA-022:A10] Design the session-projection owner seam; retain S067-S069 until a core Session lifecycle baseline handoff is specified, and preserve the no-query dependency rule.
1. [x] (2026-09-22T20:47:00-03:00) [AAA-022:A11] Specify the core Session/SessionStore lifecycle handoff for exact projection baselines, existing-session registration, and disposal ordering; A12 is gated for implementation.
1. [x] (2026-09-22T21:18:01-03:00) [AAA-022:A12] Implement the transient SessionCreationBaseline handoff and strict projection baseline seam with lifecycle, cache, documentation, and focused regression coverage.
1. [x] (2026-09-22T21:26:19-03:00) [AAA-022:A13] Design the remaining W1 Session-reader dispositions for core/session, session-telemetry, and session-title, preserving explicit complete-history and pre-commit exceptions and selecting the next bounded seam.
1. [x] (2026-09-22T21:34:52-03:00) [AAA-022:A14] Implement SessionCreationBaseline adoption in the core and title invariant creation paths with seeded/existing-session and invalid-event coverage.
1. [x] (2026-09-22T21:40:19-03:00) [AAA-022:A15] Design the core Session fork and own-events history seam, preserving synchronous boundary and inherited-prefix behavior before any production change; retain the explicit complete-history exception and specify the future storage-owned fork cut.
1. [x] (2026-09-23T03:30:02-03:00) [AAA-022:A17] Implement the gated Session-title provider history loader and committed-human-message citation index; the 12-file/163-test focused suite and scoped type, lint, documentation, generated-output, ownership, and whitespace checks pass, with the four doc-sync failures, unrelated broad-policy diagnostics, and unavailable canonical metric retained.
1. [x] (2026-09-23T01:10:01-03:00) [AAA-022:A16] Design the remaining W1 session-telemetry and session-title history seams; retain S071, select provider-owned async loading for S072, and specify the synchronous committed-message index for S073.
1. [x] [AAA-022:A03] Approve the canonical REM-028 inventory, migration order, and any new compatibility seam before implementation.
2. [x] [AAA-022:A04] Reconcile and freeze the candidate-bound production call-site inventory with owner, wave, classification, rationale, and retained-exception semantics.
3. [x] [AAA-022:A05] Implement the first W1 reader/projection owner slice and prove behavioral equivalence before removing its waivers.
4. [x] [AAA-022:A06] Specify the next session-log-deepseek reader seam before changing its production history reads.
5. [x] [AAA-022:A07] Implement the optional observation-based session-log-deepseek reader seam and prove wire, cancellation, fork, disposal, fallback, type, lint, docs, and metric equivalence.
6. [x] [AAA-022:A08] Specify the SessionObservationReader-owned SessionCorpus/SQLite live capture seam, preserve complete-history semantics, and create the A09 implementation gate.
4. [x] [AAA-022:A02] Define the remaining REM-028 Session-reader migration waves, owners, compatibility tests, and authority before implementation.
5. [x] [AAA-023:A37] Recompute candidate-bound traceability for REM-001 through REM-037 and AAA-QB-01 through AAA-QB-14; preserve explicit external conditions and withhold the final verdict.
6. [x] [AAA-023:A36] Await external Windows/Wine, native-platform, supported-Node, and credentialed-provider artifacts bound to the candidate; preserve unresolved status when unavailable.
7. [x] [AAA-023:A28] Construct the successor candidate from the exact six-owner policy disposition, verify its clean tree and policy attribution, then execute the complete local qualification matrix against that same tree.
4. [x] [AAA-023:A16] Qualify coverage on the sealed candidate; final tree `d122da6d97d38e0be1e8843ca642c537f759d460` passes the 100% per-file contract with unchanged skipped-test counts and bounded Inspector exclusions.
5. [x] [AAA-023:A17] Requalify `pnpm run check:all` on the repaired sealed candidate; tree `f3b4cb2064db3af52807cfd631afda85dfa56aae` passes 77/77 gates.
6. [AAA-023:A21] Reproduce the complete benchmark lane on the exact unchanged candidate before remaining release lanes.
7. Keep the 38-entry ownership inventory and its dependency order explicit; do not implement client-domain moves without the recorded architecture decision.
8. Revalidate the client-domain gate after the decision, then advance the approved implementation through the state-last verification transaction.
9. Revalidate `AAA-009`, then complete its approved client-domain ownership/API changes before running the `AAA-010` generator in write mode; verify generated freshness and bilingual pairing through the owning commands.
10. Resolve the remaining runtime, publication, static-debt, and release dependencies in backlog order; after coverage and the other required lanes qualify, run the fresh independent critic required by `AAA-024`.

## Validation and Acceptance

| Criterion | Required | Procedure/environment | Expected observation | Evidence destination |
| --- | --- | --- | --- | --- |
| `AAA-QB-01` to `AAA-QB-14` | Yes | Use each criterion's frozen method on one candidate | Every required criterion is PASS and current | `.agent/verification.jsonl` and release evidence index |
| Controller consistency | Yes | Run the engineering-framework state checker | State, backlog, ledgers, and plan pointers agree | Planning checkpoint command output |
| Gauntlet integrity | Yes | Validate `.gauntlet/`, seal fingerprints before critics, verify after | Frozen bar and mutation sentinels remain valid | `.gauntlet/` history and artifacts |
| Upstream-safe ownership | Yes | Run policy fixtures and top-level verifier against `master` | Every custom path has exactly one compatible owner | Focused test output and workflow evidence |
| Documentation integrity | Yes | Run pairing, quick docs, full doc sync, and semantic review | Structure, links, generated truth, and meaning agree | Verification ledger and reviewed diff |

## Risks and Human Decisions

| Risk/decision | Evidence/confidence | Controls | Residual/authority | Trigger |
| --- | --- | --- | --- | --- |
| Audits describe different checkouts or environments | High; neither report pins an immutable audited commit | M0 pristine reproduction and environment manifest | No release authority until resolved | Any failure cannot be reproduced |
| Publication identity | High; custom manifests advertise official ownership | AAA-019 and packed metadata check | Fork maintainer approval required | Before package publication or release PASS |
| WebSocket close semantics | Medium; implementation awaits logical work, not demonstrated physical closure | AAA-012 contract decision and barrier test | Product owner approval required | Before implementation |
| Static asset symlink escape | High if any in-root link reaches an external target | AAA-013 resolved-target containment and symlink negative test | Fail closed; no trust-based exception | Before release |
| Aggregate HTTP memory | High under concurrent large requests | AAA-014 budget and admission tests | Operator/product approval required | Before implementation |
| Dynamic code execution | Medium to high by deployment | AAA-015 threat model, CSP and consent policy | Security/product approval required | Before exposed deployment qualification |
| Source export compatibility | High blast radius across packages | AAA-020 packed and consumer evidence | API owner approval required | Before manifest migration |
| Broad lint/compiler hardening creates false progress | Medium | AAA-022 owner-scoped probes and no new blanket suppressions | Rule adoption decisions remain explicit | Any repository-wide flag change |

## Idempotence and Recovery

On resume, read `AGENTS.md`, this complete plan, `.agent/state.json`, `.agent/backlog.json`, all three ledgers, the frozen bar, Git status, and the current task's package instructions. Run the state checker before acting. If files changed after the latest verification, mark affected evidence stale and rerun it; do not preserve a PASS by timestamp manipulation.

Use disposable worktrees for pristine baseline and upstream merge rehearsals. Never delete ignored directories until exact targets are classified and verified as residue. Re-run generators instead of hand-editing derivatives. Append correction events rather than rewriting ledgers. If an implementation fails, preserve the first failure, return the task to its last valid state, and keep one safe next action.

## Artifacts and Evidence

- .agent/evidence/AAA-022/interaction-reader-design-review-a24-postcheckpoint-20260923.json: independent A24 approval on the current 55-path digest 99d90111f9086133730ae0b1b8deddc942dfe0941eccf09c1a294b86fd76c424 after the A25 state-last authority checkpoint.
- .agent/evidence/AAA-022/a25-implementation-gate-fingerprint-20260923.json: current A25 64-path union fingerprint, 61 existing inputs, and three named future helper paths, recorded before the control-plane successor transition.
- .agent/evidence/AAA-022/a26-consumer-test-verification-20260923.json: exact A26 consumer test, scoped type/lint, owner-policy, diff, path-hash, and state-check evidence; the three approved files changed and five verification-only files remain byte-identical.
- .agent/evidence/AAA-022/a26-consumer-preclose-state-check-20260923.txt: pre-closeout checker output matching all 359 findings in the preserved A25 baseline.
---
- .agent/gates/implementation-ready-AAA-022-A25-interaction-readers.json: corrected A25 implementation-ready gate for the exact 33 implementation paths, 8 verification-only consumers, 31-path interaction owner, and gate-bound A26 checks.
- .agent/evidence/AAA-022/a19-scope-34-refresh-state-check-postcheckpoint-20260923.txt: the refreshed 34-input A19 state-check comparison reproduces all 359 baseline findings with zero additions or resolutions.
- .agent/evidence/AAA-022/a19-scope-34-fingerprint-refresh-20260923.json: current 34-input A19 fingerprint after the exact A25 interaction owner was declared, with preserved owner/catalog attribution and focused checks.
- .agent/evidence/AAA-022/a19-scope-34-current-state-check-postcheckpoint-20260923.txt: post-checkpoint aggregate state-check comparison reproduces all 359 baseline findings with zero additions or resolutions.
- .agent/evidence/AAA-022/a19-scope-34-current-revalidation-20260923.json: current exact 34-input fingerprint, 32-path prepared-session owner including all three Session subsystem docs, shared API-catalog ownership, focused check results, and repository-wide doc-sync limitation.
- `.agent/evidence/AAA-022/a19-scope-31-current-revalidation-20260923.json`: current 31-input digest, exact owner attribution, scoped check results, and retained doc-sync failures.


- `docs/audits/auditoria-completa-2026-09-20.md`: broad qualitative and static inventory with partial executed evidence; not release proof.
- `docs/customization/repository-audit-2026-09-20.md`: stronger executed baseline with a FAIL verdict; still lacks complete release qualification.
- `docs/customization/aaa-quality-program.md`: maintainer-facing executive charter and status-update protocol.
- `.agent/plans/deepseek-harness-aaa-quality-bar.json`: frozen objective acceptance criteria.
- `.agent/backlog.json`: canonical task status, dependency graph, classification, and next actions.
- `.agent/state.json`: current program pointer and classification.
- `.agent/execution-log.jsonl`: append-only chronology once task execution begins.
- `.agent/verification.jsonl`: append-only verification evidence once procedures run.
- `.agent/evidence/AAA-022/session-core-agent-loop-reader-design-review-a96.json`: fresh read-only A18 review approving W2-01–W2-05 for design readiness and recording the A19/A20 split.
- `.agent/evidence/AAA-022/a20-closeout-20260923.json`: A20 scoped implementation checks, exact candidate identity, and retained limitations.
- `.agent/evidence/AAA-022/a20-critic-review-20260923.json`: fresh read-only A20 review with stable before/after digest and no P1/P2 findings.
- `.agent/evidence/AAA-022/a20-a21-control-revalidation-20260923.json`: append-only A20-to-A21 transition corrections and the final 353-finding state-check comparison.
- `.agent/evidence/AAA-022/a20-state-check-post-closeout-20260923.txt`: state checker output after the A20 closeout and A21 design start.
- `.agent/gates/implementation-ready-AAA-022-A19.json`: retained prior action-scoped gate record with its original binding diagnostics.
- `.agent/gates/implementation-ready-AAA-022-A19-task-scope.json`: retained first task-scoped recovery attempt; superseded after canonical schema validation failed.
- `.agent/gates/implementation-ready-AAA-022-A19-canonical.json`: current task-scoped A19 implementation gate with canonical criteria and matching authority evidence.
- `.agent/verification.jsonl#VER-AAA-022-A19-GATE-BINDING-RECOVERY-001`: exact candidate, task scope, and start-event binding inspection.
- `.agent/verification.jsonl#VER-AAA-022-A19-CANONICAL-GATE-001`: canonical gate schema, authority, candidate, and lifecycle binding inspection.
- `.agent/reviews/plan-critic-round-1-invalid.md`: preserved first critic findings and the ignored-cache mutation that invalidated its verdict.
- `.agent/reviews/plan-critic-round-2-reject.md`: mutation-clean rejection and the source-identity, containment, and documentation-corpus remediations.
- `.agent/reviews/plan-critic-round-3-reject.md`: mutation-clean rejection and the state-last transition, implementation-readiness, and normative-source remediations.
- `.agent/reviews/plan-critic-round-4-reject.md`: mutation-clean rejection and the gate-record and active-action checkpoint remediations.
- `.agent/reviews/plan-critic-round-5-reject.md`: mutation-clean rejection and the implementation-entry, missing-criterion, and immutable-attestation remediations.
- `.gauntlet/`: independent-critique state and frozen bar copy; auxiliary to `.agent/`.

Plan revision note, 2026-09-20: initial plan created from both requested audits, direct repository inspection, the upstream-safe improvement standard, and two independent read-only audit cross-checks. The backlog treats disputed catalog, generated-file, and count claims as hypotheses until M0 reproduces them.

Plan revision note, 2026-09-20: the first sealed critic exposed a final-qualification deadlock, a compound first action, a wrong authority pointer, incorrect publication routing, and three under-specified criteria. Quality Bar v1.1 and the backlog correct those gaps. The critic verdict itself remains INVALID because its pre/post sentinel detected an ignored Vitest cache mutation; a new sealed critic is required.

Plan revision note, 2026-09-20: the second sealed critic remained mutation-clean and rejected a stale source snapshot, AAA-013's trust-based alternative, and an unnamed documentation corpus. Quality Bar v1.2 pins the corrected report, requires resolved-target containment, and binds each risk task to exact English/Chinese pairs.

Plan revision note, 2026-09-20: the third sealed critic remained mutation-clean and rejected future task-start ordering, missing task-bound implementation readiness, incomplete normative-source hashes, and stale static-root authority prose. The plan now defines both state-last transactions, BUILD/IMPLEMENT gate binding, fail-closed containment, and Quality Bar v1.3 source snapshots.

Plan revision note, 2026-09-20: the fourth sealed critic remained mutation-clean and rejected an incomplete gate handoff and an undefined successor after the first evidence action. Readiness and start now persist and revalidate the exact task-bound gate, while action advancement uses an explicit artifact-to-backlog-to-ledger-to-state transaction with `AAA-001:A02` as the first successor.

Plan revision note, 2026-09-20: the fifth sealed critic remained mutation-clean and found that gating every BUILD-labelled task blocked its own preparatory actions, the gate event order was circular, weighted approval and dynamic extension enforcement were absent from the release bar, and the dated audit could mutate the sealed candidate. Quality Bar v1.4 gates only entry into IMPLEMENT, expands the two affected criteria, and separates the immutable candidate from its documentation-only attestation commit.

- [x] (2026-09-23T06:47:11.214255-03:00) Reopen the prior 24-path A19 scope and bind the authorized 34-path successor after validating its candidate digest, authority, canonical criteria, and nine newly owned subsystem documentation paths; keep catalog ownership overlap with M11.

- [x] (2026-09-23T06:50:35.090431-03:00) Run the repository state checker after the A19 successor gate transaction; preserve 350 findings (349 recorded baseline plus one strict A19 reopen-chronology finding) and continue only with the authorized A19 scope.

- Observation: the A19 gate checker reports one new `RECONCILE_GATE_REOPENED` finding because the successor gate timestamp equals the reopening event timestamp; preserve the append-only gate history and record this limitation while A19 remains active for its authorized source and documentation work. Evidence: `.agent/evidence/AAA-022/a19-state-check-20260923.txt`, `.agent/execution-log.jsonl#EVT-AAA-022-A19-STATE-CHECK-002-088`, and `.agent/verification.jsonl#VER-AAA-022-A19-STATE-CHECK-002`.

- [x] (2026-09-23T07:04:40.445287-03:00) Verify the A19 Session documentation surfaces: doc-quick passes 22/22, catalog/type-equivalence/pairing/export-JSDoc checks pass, and doc-sync remains PARTIAL at 38/43 with five generated/runtime findings recorded for scoped disposition.

- Observation: reader inventory A75 classifies REM-028-S029 in `packages/core/tools` as W2, but frozen A74 omits that package from its W2 owner order. A23 keeps S029 as the final W2 owner slice after the A74 sequence, so the existing order remains intact and `packages/interaction` is next. Evidence: `.agent/evidence/AAA-022/a23-w2-owner-order-disposition-20260923.json`, `.agent/evidence/AAA-022/reader-inventory-a75.json`, and `.agent/evidence/AAA-022/reader-migration-plan-a74.json`.
- `.agent/evidence/AAA-022/schedule-reader-design-amendment-3-w2-20260924.json`: current W2 Schedule reader design with the corrected 42-input fingerprint, exact 19 implementation/7 verification scope, 18-path owner, two-path reassignment, and preservation of existing coverage annotations.
- `.agent/evidence/AAA-022/schedule-reader-design-amendment-3-review-w2-20260924.json`: final independent PASS for amendment 3; no tests or product files changed, and the policy owner-summary text drift is recorded as non-blocking.
- `.agent/evidence/AAA-022/schedule-reader-policy-candidate-validation-3-w2-20260924.json`: read-only validation of the exact planned path union with zero owner collisions and zero validator errors; policy bytes remain unchanged.
- `.agent/verification.jsonl#VER-AAA-022-W2-SCHEDULE-DESIGN-REVIEW-INITIAL-001` through `#VER-AAA-022-W2-SCHEDULE-DESIGN-REVIEW-AMENDMENT-3-001`: append-only records for two failed review rounds followed by two passing reviews, with the superseded failures retained.
- `.agent/authority.jsonl#AUTH-AAA-022-W2-SCHEDULE-READERS-001`: exact local W2 Schedule authority derived from A03 and bound to the implementation-ready gate.
- `.agent/evidence/AAA-022/schedule-reader-implementation-gate-fingerprint-20260924.json`: 37-input pre-implementation hash binding for the 19 implementation paths, 7 verification-only paths, 3 protected exclusions, confirmed authority, and final reviewed design.
- `.agent/gates/implementation-ready-AAA-022-W2-schedule-readers.json`: canonical PASS gate for the exact W2 Schedule reader migration, with the retained FAIL-358 and M09 metrics limitations explicit.
- `.agent/evidence/AAA-022/schedule-reader-implementation-gate-validation-20260924.json`: direct canonical gate and fingerprint validation with zero schema findings.
- `.agent/evidence/AAA-022/w2-gate-transition-correction-20260924.json`: append-only correction for the invalid same-status checkpoint followed by the exact gated implementation START.
- `.agent/evidence/AAA-022/w2-projection-spec-predecessor-failure-20260924.txt`: current run of the formerly verification-only projection spec, with two missing-SessionStore fixtures and the invariant-owner persistence diagnosis retained.
- `.agent/evidence/AAA-022/schedule-reader-preparation-successor-design-review-20260924.json`: fresh independent PASS for the exact 29/6/3 scope and baseline, accepted-replay, pre-append, cleanup, docs, generator, and persisted-format acceptance.
- `.agent/evidence/AAA-022/schedule-reader-preparation-successor-policy-validation-20260924.json`: exact 29-path attribution to 19 Schedule, 9 prepared-projection, and one governance policy path with zero collisions.
- `.agent/evidence/AAA-022/schedule-reader-preparation-successor-fingerprint-20260924.json`: 56-input candidate fingerprint including implementation, verification-only, protected, authority, contract-source, and generator inputs.
- `.agent/gates/implementation-ready-AAA-022-W2-schedule-preparation-successor.json`: superseding implementation-ready PASS for the exact 29/6/3 scope; the previous gate and its events remain immutable.
- `.agent/evidence/AAA-022/schedule-reader-preparation-successor-gate-validation-20260924.json`: all 56 hashes match, all 3 pre-existing V8 annotations match, the owner map is collision-free, and canonical gate validation reports zero findings.
- `.agent/verification.jsonl#VER-AAA-022-W2-SCHEDULE-PREPARATION-SUCCESSOR-GATE-20260924-001` and `.agent/authority.jsonl#AUTH-AAA-022-W2-SCHEDULE-PREPARATION-SUCCESSOR-001`: append-only gate validation and exact local implementation authority.

- `.agent/evidence/AAA-022/w2-schedule-preparation-final-verification-20260924.json` and `.agent/evidence/AAA-022/w2-schedule-preparation-final-review-20260924.json`: exact 29/6/3 Schedule successor closeout, focused checks, 38/43 doc-sync, unchanged FAIL-358 baseline, scope integrity, and independent PASS.
