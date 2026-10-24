Runtime lane — IMPLEMENTED. No approval or aggregate-green claim.

- Shared worktree only; no index commands, commits, explicit install commands, generators, broad builds, or edits to other lanes. See final pnpm auto-install observation below. Root/packages/nested instructions and architecture read before edits.
- Upstream async ProjectionHandle registration retained, including callable legacy runtime behavior, retained readers after disposal, summary exclusions, and late registration recovery. Custom cacheFingerprint equality/invalidation, exact constructor baseline, preparation feed, hydrate/restore cuts, bounded persistence/repair writes retained. Live drive still rejects skipped sequence delivery.
- Custom inbox waking identities and continuous running intervals retained with AgentModel/current selection, step-owned tool admission and executor batches. Removed obsolete agent-loop/src/tool-calls.ts; deleted scheduler-symbol smoke migrated away because upstream removed that scheduler API.
- ACP cancellation now settles on its correlated durable turn/end plus queued-output drain, so retained autonomous wakes cannot hold the cancelled prompt until a later driver goes idle.
- Official approval projection and policy wording retained; required async readers replace package-private provider read folds. Permission default pinning follows upstream agent creation (session/created is read-only); mounting over existing knob state now recovers through handles.
- Session controller keeps custom activity and outstanding-call/error metadata; actual view values strip summary-only type marks. Image limits stay excluded from summaries. Remotes export both BundleDetail and custom PresetPluginInfo.
- Sandbox retains custom sticky writable /tmp and environment evidence, plus upstream extra writable roots and unsupported-policy diagnostics. Web fetch adopts upstream central proxy transport and removes imports of deleted network.ts. Schedule adopts shared upstream datetime parsers; old custom date changes were coverage annotations, not distinct semantics.
- Runtime audit event normalization tests passed; tool invocation/output/metadata flow uses upstream shared executor pipeline. Shell/goal implementations remain owned by their respective lanes.

Checks actually run:
- Narrow source tsc --noEmit passed for packages/session/session-projection/tsconfig.json, packages/core/agent/tsconfig.json, packages/api/session-controller/tsconfig.host.json, packages/core/agent-loop/tsconfig.json, packages/schedule/schedule/tsconfig.json, packages/web/web-fetch-http/tsconfig.json; packages/acp/acp/tsconfig.json also passed. Logs /tmp/dsh-runtime-tsc-{projection,agent,controller,loop,schedule,web,acp}.log.
- Focused vitest rounds/logs: /tmp/dsh-runtime-focused-4.log 245/245; -7.log 127/127; -9.log 69/69. These include controller models/activity/fork, permissions, sandbox, projection handles/compatibility, spill/PTC, ACP cancellation/teardown.
- Earlier wider focused rounds exposed and repaired old async-fixture/API assumptions. -5.log: 208/210, its cache-title/PTC fixture failures subsequently passed in -6/-7. -6.log: 208/220, its fork double-initialization failures subsequently passed in -7. -8.log: 202/204, its ACP and Schedule fixture failures subsequently passed in -9. -3.log: 395/407, its fs-column and Schedule parser failures subsequently passed in -4.
- Core loop lifecycle/resource/scope, tools/activation/concurrency, fs column reads, native resume and crash repair, title generation, runtime audit, loader title composition, Web proxy/fetch, todo/plan/test-support targeted suites were executed across those rounds. Initial native-addon absence resolved by lead build; resume suite subsequently passed in -5.
- git diff --check for owned package groups passed; conflict marker scan of owned .ts/.md found none. Index intentionally still MERGING and entirely lead-owned.
- Build2 owned test diagnostics addressed (unused locals/imports, single-call fs-search execution, awaitable Schedule registration, removed SessionProjectionStateMap title lookup, title-provider loadMessages). Final provider run /tmp/dsh-runtime-focused-11.log passed 17/17; isolated ripgrep case /tmp/dsh-runtime-search-isolated.log passed 1/1 selected (23 skipped by -t). Its prior 5-second timeout in the integration suite was not reproduced in isolation; no timeout threshold was changed.

Lead/cross-lane actions and limitations:
- Re-run aggregate checks after all lane changes. No aggregate build was run here. Lead reported host source PASS in build2; aggregate test/client success remains lead verification.
- Generated extension API catalog must reflect ToolsService and ProjectionHandle APIs; owned by UI/lead and not edited here. Generated documentation/snapshots/index stay with lead.
- Material upstream ordering: constructor seed is durably paged before session entry; session/created completes read-only; setup writes through the live feed; Agent publication follows setup. Failed setup can retain already-written constructor history. Old custom setup-before-session/publication and no-residue assertions were migrated to this upstream behavior.
- Snapshot implications: approval wording and permission/model pinning follow upstream lifecycle. Preserve custom audit records and their real seq references; update snapshots from actual event order, not blanket old offsets.
- Features manual detached append + sparse ctx.emit(session/event) fixtures must migrate to real SessionStore enter/announce/live append delivery. Registry sequence validation was not relaxed.
- Source consumers in owned groups no longer call deprecated registry stateOf/read; only the explicit legacy compatibility implementation remains. Custom projection tests now await registration, except dedicated upstream legacy-compatibility cases.
- No new manifest/tsconfig changes requested. No performance benchmark or exhaustive cross-platform/SDK/snapshot build claim.

Assigned paths resolved (including upstream-only results and the deleted scheduler source):
- packages/acp/acp/src/session.ts
- packages/api/remotes/src/client/index.ts
- packages/api/remotes/tests/built-lib.e2e.ts
- packages/api/session-controller/src/list.ts
- packages/api/session-controller/src/types.ts
- packages/api/session-controller/tests/session-cold.host.spec.ts
- packages/api/session-controller/tests/session-fork.host.spec.ts
- packages/api/session-controller/tests/session-history-journal.host.spec.ts
- packages/api/session-controller/tests/session-models.host.spec.ts
- packages/api/session-controller/tests/session-projections.host.spec.ts
- packages/api/session-controller/tests/session-search.host.spec.ts
- packages/api/session-controller/tests/test-remote.ts
- packages/api/session-controller/tests/transport.host.spec.ts
- packages/core/agent-loop/src/agent.ts
- packages/core/agent-loop/src/index.ts
- packages/core/agent-loop/src/tool-calls.ts
- packages/core/agent-loop/tests/inbox.spec.ts
- packages/core/agent-loop/tests/request-freeze.spec.ts
- packages/core/agent-loop/tests/resume.spec.ts
- packages/core/session/src/index.ts
- packages/core/tools/src/index.ts
- packages/core/tools/tests/tools.spec.ts
- packages/fs/tool-fs/tests/tools.spec.ts
- packages/interaction/permission-presets/src/index.ts
- packages/interaction/permission-presets/tests/permission-presets.spec.ts
- packages/interaction/user-approval/src/index.ts
- packages/interaction/user-approval/tests/approval.spec.ts
- packages/plan/plan-mode/tests/plan-mode.spec.ts
- packages/sandbox/sandbox-local/src/index.ts
- packages/sandbox/sandbox-local/src/profiles.ts
- packages/sandbox/sandbox-policy/src/index.ts
- packages/sandbox/sandbox-policy/tests/policy.spec.ts
- packages/schedule/schedule/src/domain.ts
- packages/session/session-persistence-jsonl/src/zstd-private-decoder.ts
- packages/session/session-projection-cache/tests/cache.spec.ts
- packages/session/session-projection-cache/tests/fixtures.spec.ts
- packages/session/session-projection/README.md
- packages/session/session-projection/README.zh.md
- packages/session/session-projection/src/index.ts
- packages/session/session-projection/tests/registry.spec.ts
- packages/session/session-title-first-prompt-llm/tests/loader-composition.spec.ts
- packages/session/session-title-first-prompt-llm/tests/provider.spec.ts
- packages/session/session-title/src/types.ts
- packages/session/session-title/tests/projection.spec.ts
- packages/spill/spill-policy/tests/spill-policy.spec.ts
- packages/test-support/agent-loop-testkit/tests/agent-loop-testkit.spec.ts
- packages/test-support/client-runtime/src/assembly/bundle-roster.ts
- packages/test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts
- packages/todo/tool-todo/tests/loader-composition.spec.ts
- packages/todo/tool-todo/tests/projection.spec.ts
- packages/todo/tool-todo/tests/tool-todo.spec.ts
- packages/web/web-fetch-http/src/provider.ts

Additional owned non-generated source/tests edited:
- packages/api/session-controller/src/activity.ts
- packages/api/session-controller/tests/session-rename.host.spec.ts
- packages/core/agent/src/model-selection.ts
- packages/core/agent-loop/tests/tool-calls.spec.ts
- packages/fs/tool-fs/tests/read-columns.spec.ts
- packages/fs/tool-fs-search/tests/integration.spec.ts
- packages/schedule/schedule/src/projection.ts
- packages/schedule/schedule/tests/projection.spec.ts
- packages/session/session-projection/tests/compatibility.spec.ts
- packages/session/session-title/src/index.ts
- packages/session/session-title/tests/initialization.spec.ts
- packages/session/session-title/tests/provider.spec.ts

Build3 fixture typing follow-up — IMPLEMENTED:
- Restored fixture-local module augmentation of @deepseek-ai/dsh-session/types: SessionEventMap entries fixtures-test/set-title ({ title: string }) and fixtures-test/env-fold ({ amount: number }); retained OutOfBandSessionEventMap marker only for fixtures-test/set-title. Removed the orphaned comment about projection-map declarations. No projection state map was reintroduced.
- Narrow TypeScript program rooted only in fixtures.spec.ts, using tsconfig.host.json compiler options and project references, passed with zero diagnostics. No config file was written and no emit/build/generator ran. Log: /tmp/dsh-runtime-fixture-typecheck-final.log.
- Focused suite passed 18/18: pnpm exec vitest run packages/session/session-projection-cache/tests/fixtures.spec.ts --reporter=dot. Log: /tmp/dsh-runtime-fixtures-final.log.
- git diff --check for the changed fixture passed. Index remains lead-owned. Lead can rerun Host aggregate; no aggregate success claimed here.
- Tooling observation: this final pnpm exec unexpectedly invoked the configured auto-install workflow, reporting lockfile up to date / Already up to date and executing postinstall hook synchronization. No explicit install command was invoked. Use the direct Node Vitest launcher for subsequent checks to avoid that implicit behavior.

Final typed-lint follow-up — source stable for final build:
- Removed unused SessionProjectionValues imports left after lead autofix removed unnecessary assertions, wrapped long signatures/exports/calls, replaced Promise.withResolvers<void> with undefined gates and explicit resolution, and awaited the controller fixture's registration path.
- Migrated all deprecated registry.stateOf reads in registry.spec.ts and title projection.spec.ts to ready retained handles. No deprecation suppression was added for these tests.
- Removed title-state undefined guard because its retained handle is ProjectionHandle<TitleProjection | null>; null remains the intentional absent state. Removed optional chaining from turnBoundaryOf's return because the owning AgentRegistry method returns a required TurnBoundaryProjection or throws.
- Only an existing source snapshotEvents suppression comment was repositioned after line wrapping; no live recovery/sequence invariant changed.
- Focused regression suite passed 226/226 across registry/registration-reader/compatibility, title projection, loop/resume, and controller projections. Log /tmp/dsh-runtime-lint-regressions-20261023.log.
- Final targeted typed lint PASSED (exit 0, no diagnostics), covering 12 edited runtime source/test files through node --import tsx/esm scripts/run-oxlint.ts (repository typeAware=true). Log /tmp/dsh-runtime-lint-final-20261023.log. Source stable; no SDK pin reruns or bin movement in this follow-up.

SDK follow-up complete: artifact refresh/replay each 37/37 PASS; source full refresh/replay each 36/37 with the one missing-oracle/freshness case closed by isolated strict refresh/replay PASS. All 36 source SDK oracle files / 51 records now version 0.2.1-rc.3, source launcher. Bin and checksum restored, backup and temporary diagnostic removed, manager hash unchanged. Full logs, exact limitations and F9 artifact rebuild handoff: /tmp/dsh-runtime-sdk-followup-20261023.md.

Post-F9 candidate artifacts: requested readonly SDK trio PASS (3 passed, 34 skipped, exit 0); /tmp/dsh-sdk-post-f9-artifact-final-20261023.log. 34 scenario file checksums unchanged; bin present, no fallback/refresh/source edits. Full evidence in SDK follow-up report.
