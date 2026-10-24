# ui-boot integration report — 2026-10-23

Status: IMPLEMENTED candidate; ready for lead aggregate validation, not self-approved. Work stayed in /home/ricardo/deepseek-harness-upstream-20261023. Index untouched; all 35 assigned files exist and have no conflict markers. No dependency install, broad build/typecheck, repository generator, commit, checkout, or push was run by this lane.

## Decisions

- Preserve persistent global/preset-child plugin controls, sparse profile patches, management dependency protection, source/publisher policy, disabled-by-default installation, and saved-copy downloads.
- Adopt upstream official-bundles ownership, version listing/update APIs, registry lookup helper, pnpm 11 git build approvals with credential exclusion, optional bundle metadata/detail behavior, shared Timer, and Fetch route handling. Custom management protection extends PROTECTED_PLUGINS rather than duplicating upstream membership.
- Registry inspection reads author for publisher precedence; updates enforce the source/publisher policy before removing the previous version. New tests verify refused updates leave the dependency intact. Narrow inspection names with `inspection.name ?? parsed.name`; this fixes the first aggregate's TS2345 at plugin-manager/src/index.ts:703.
- Remove the obsolete modules serveBundle Node adapter; current Fetch delivery remains. Preserve explicit dynamic browser-delivery policy with upstream release metadata.
- Use the shared deliverable-file-references plugin as the sole prompt owner; keep client authenticated native opens and attachment downloads. Retain upstream completed-turn delivery collection, hover/reduced-motion behavior, and custom capture/download card layout.
- Document-preview files were reorganized upstream, not removed as a feature. Keep custom package-local layout and migrate conflicting imports to its actual files while retaining upstream line-mark navigation, file drag, and all dictionaries. No retired API was recreated.
- Source scan of packages/{boot,client,extensions} found no production calls to removed projection-registry read/stateOf APIs, no SessionProjectionStateMap, and no legacy ProjectionDefinition usage. Remaining `stateOf` identifiers are local presentation helpers. Preset test composition now mounts AgentRegistry for upstream's new required `agents` injection; tool fixtures retain SessionStore and add NativeToolExecutor.
- Completed typed custom-control/saved-copy keys for the six newly supported dictionaries; JSON locale assets/pairing remain lead-owned.

## Focused verification

Executed after lead confirmed dependency installation:

1. `pnpm exec vitest run packages/boot/plugin-manager/tests/build-approval.spec.ts packages/client/ui-sidebar-documentpreview/tests/lines.client.spec.ts packages/client/ui-sidebar-documentpreview/tests/apply.client.spec.ts packages/extensions/cordis-client-runner/tests/plugin.client.spec.ts packages/client/ui-settings-plugin-inventory/tests` — 8 files / 94 tests passed.
2. Initial mixed regression run — 430 tests passed, 12 failed plus one import-failure suite. Failures exposed duplicate setSandboxMode import, missing agents fixture dependency, and upstream fixture manifests missing the custom allowlisted publisher; corrected. Two real I/O tests hit the 5s default under concurrent load.
3. `pnpm exec vitest run packages/boot/plugin-manager/tests/tools.spec.ts packages/boot/plugin-manager/tests/manager.spec.ts --maxWorkers=2` — 2 files / 218 tests passed after fixture corrections, including real Git/pnpm fixture tests. Subsequent source-policy additions are covered by runs 4 and 7 below.
4. `pnpm exec vitest run packages/boot/plugin-manager/tests/manager.spec.ts packages/client/ui-settings-plugin-inventory/tests -t 'preset|management module graph|update|newer registry|enabl|togg|saved|refresh|client sync' --maxWorkers=2` — 73 selected tests passed, 155 filtered out. Includes persistent preset controls, protected dependency graph, new source/publisher update refusal, upstream version/update behavior, and inventory enablement UI. Log: /tmp/dsh-ui-boot-compat-20261023.log.
5. Download authenticated-HTTP test passed in isolation; then full present-download, presented-file-card, text-preview selection passed: 3 files / 91 tests. Log: /tmp/dsh-ui-boot-regression-20261023.log. This command also supplied three nonexistent module/position test selectors, which Vitest ignored; those were corrected and covered in run 6.
6. `pnpm exec vitest run packages/client/modules/tests/node-half.client.spec.ts packages/client/modules/tests/loader.client.spec.ts packages/client/ui-primitives/tests/use-anchored-position.client.spec.tsx --maxWorkers=2` — 3 files / 143 tests passed. Log: /tmp/dsh-ui-boot-modules-20261023.log.
7. `pnpm exec vitest run packages/boot/plugin-manager/tests/manager.spec.ts -t 'inspects canonical|publisher|refuses an update|updates a registry bundle' --maxWorkers=2` — 13 selected tests passed, 176 filtered out, after the final name-narrowing fix. Log: /tmp/dsh-ui-boot-policy-20261023.log.
8. Assigned-file conflict scan: 35 files, zero markers. `git diff --check` for edited package scope plus both assigned E2Es: exit 0.

Initial mixed run also passed patch.spec, model-list-catalog, provider-form, deliverables, and presented-file-card suites. No broad success claim: lead's first aggregate failed, with one owned error corrected as above and other errors outside this lane.

## Lead follow-up / limits

- Rerun aggregate compiler/build after all lanes settle. This lane did not self-approve.
- Regenerate catalogs and remote faces; preserve listPresetPlugins/setPresetPluginEnabled and browser delivery payloads. packages/api/remotes was not edited.
- Finish lead-owned manifests/tsconfigs, JSON locales, i18n pairing, generated snapshots/docs and index resolution. Extension TS catalogs were resolved manually under the temporary assignment and require normal regeneration.
- Assigned navigation-panes/present E2Es were merged semantically but not executed; no browser server/build was started. Real I/O cases initially timed out under load; bounded-worker reruns passed.

## Changed paths

- `apps/web/tests/navigation-panes.e2e.ts`
- `apps/web/tests/present.e2e.ts`
- `packages/boot/app-boot/README.md`
- `packages/boot/app-boot/README.zh.md`
- `packages/boot/app-boot/src/profile-resolution/resolver.ts`
- `packages/boot/plugin-manager/README.md`
- `packages/boot/plugin-manager/README.zh.md`
- `packages/boot/plugin-manager/src/build-approval.ts`
- `packages/boot/plugin-manager/src/index.ts`
- `packages/boot/plugin-manager/tests/manager.spec.ts`
- `packages/boot/plugin-manager/tests/tools.spec.ts`
- `packages/client/modules/src/client/index.ts`
- `packages/client/modules/src/index.ts`
- `packages/client/ui-agent-preset/src/client/index.ts`
- `packages/client/ui-approval/README.md`
- `packages/client/ui-approval/README.zh.md`
- `packages/client/ui-deliverables/README.md`
- `packages/client/ui-deliverables/README.zh.md`
- `packages/client/ui-deliverables/src/client/Deliverables.module.css`
- `packages/client/ui-deliverables/src/index.ts`
- `packages/client/ui-primitives/src/useAnchoredPosition.ts`
- `packages/client/ui-settings-models/src/client/ModelListEditor.tsx`
- `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- `packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css`
- `packages/client/ui-settings-plugin-inventory/src/client/index.ts`
- `packages/client/ui-sidebar-documentpreview/src/client/image/index.ts`
- `packages/client/ui-sidebar-documentpreview/src/client/index.ts`
- `packages/client/ui-sidebar-documentpreview/src/client/office/index.ts`
- `packages/client/ui-sidebar-documentpreview/src/client/text/TextBody.tsx`
- `packages/client/ui-sidebar-documentpreview/src/client/text/TextPreview.tsx`
- `packages/client/ui-sidebar-documentpreview/src/client/text/lines.ts`
- `packages/client/ui-sidebar-documentpreview/tests/apply.client.spec.ts`
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`
- `packages/extensions/cordis-client-runner/tests/plugin.client.spec.ts`
- `packages/extensions/tool-cordis/src/api-catalog.ts`

Additional owned source/tests (announced to lead):
- `packages/boot/plugin-manager/tests/build-approval.spec.ts`
- `packages/client/ui-settings-plugin-inventory/src/client/locales.ts`
- `packages/client/ui-deliverables/src/client/locales.ts`


## Build2 locale follow-up

IMPLEMENTED under lead's expanded ownership. Added all missing custom keys to ja/es/fr/de/ru/pt in `packages/client/ui-skill/src/client/locales.ts` (2 keys × 6) and `packages/client/ui-subagent/src/client/locales.ts` (30 keys × 6). Preserved existing keys and interpolation names. No JSON locales, codegen, index operations, or browser execution.

A concrete focused-test failure exposed a stale hardcoded Japanese dictionary in `packages/client/ui-skill/tests/browser-plugin.client.spec.ts`; added the same two expected strings without relaxing equality.

Checks:

- `pnpm exec tsc --project packages/client/ui-skill/tsconfig.json --noEmit --tsBuildInfoFile /tmp/dsh-ui-skill-locales-20261023.tsbuildinfo` — exit 0; log `/tmp/dsh-ui-skill-locales-tsc-20261023.log`.
- `pnpm exec tsc --project packages/client/ui-subagent/tsconfig.json --noEmit --tsBuildInfoFile /tmp/dsh-ui-subagent-locales-20261023.tsbuildinfo` — exit 0; log `/tmp/dsh-ui-subagent-locales-tsc-20261023.log`.
- Read-only native Node import/assert check — all six added dictionaries in each namespace have exact English key parity, nonempty values, and matching interpolation placeholders (skill: 10 keys per locale; subagent: 71).
- Focused Vitest: ui-skill skill-row + browser-plugin, ui-subagent conversation-ui + browser-plugin — initial 107 passed / 1 stale Japanese expected-dictionary failure; after the expectation fix, ui-skill browser-plugin recheck passed all 34 tests. The other 3 suites passed all 74 tests in the initial run, giving all 108 focused cases passing across the runs. Logs `/tmp/dsh-ui-skill-subagent-locales-tests-20261023.log` and `/tmp/dsh-ui-skill-locales-recheck-20261023.log`.
- `git diff --check` for all three changed files — exit 0.

Ready for lead's aggregate rerun. Browser lane remains on hold pending confirmed aggregate success; no self-approval.


## Built browser follow-up — completed, processes stopped

IMPLEMENTED candidate. Only tests/expected artifacts changed in this browser follow-up; NO production source changes and NO artifact rebuild, bin movement, index operation, or automatic broad refresh.

Exact initial command:

`DSH_SNAPSHOT=replay pnpm run test:web:built apps/web/tests/present.e2e.ts apps/web/tests/navigation-panes.e2e.ts apps/web/tests/plugin-manager.e2e.ts --maxWorkers=2`

Actual Chromium launched and rendered the built application. Locale source timestamps were 22:03:59; matching package declarations were built at 22:06:48–50 and Web dist at 22:07:30. Built artifacts included the six-language repairs.

Initial result: 30 passed / 4 failed / 1 record-only skipped (35 cases), with an additional present teardown replay-comparison failure. Navigation passed; 20 plugin-manager cases passed. Log: `/tmp/dsh-ui-boot-browser-20261023.log`.

Diagnosed and fixed:

- `apps/web/tests/plugin-manager.e2e.ts`: custom global/preset switches used Vitest's default one-second polling budget despite the repository's measured existing PLUGIN_TOGGLE_SETTLE_MS budget; use that same budget for all four state changes. The explicit fixture inventory omitted its existing custom `builtin-preset-disabled.expected.md`; add it. No assertion was removed. The actual initial screenshot `.artifacts/builtin-plugin-controls.png` was inspected; captured after finally-cleanup, it shows the rendered home with the saved-state toast, so it does not identify the failed assertion by itself. The log identifies the first preset false-state poll.
- `apps/web/tests/present.e2e.ts`: delivery expectations used relative paths while the recorded/public event and existing absolute-path assertion require canonical absolute paths. Derive both live-event and exported-ZIP expectations from the session cwd. Kept all attachment byte/hash, deletion, reload, geometry, native-open, and archive assertions.
- `snapshots/web/present/ui.expected.md` and `snapshots/web/present/session.v4.jsonl`: refreshed ONLY after inspecting initial semantic diffs. Current expected persisted output includes sandbox/environment and matching policy context, added Bash exit metadata, custom stored attachment capture, and corrected sequence references. The absent source-root hint is expected: harness-dev-context developmentContext:auto suppresses it for the scaffold's temporary workspace outside the implementation checkout. UI diff is PTC header label ordering and saved-copy sequence coordinates (20 -> 24). Stream/job timing updates were also inspected. No model text or tool code changed; older v2/v3 generations and independent workspace expectations are untouched.

Verification after fixes:

1. `DSH_SNAPSHOT=replay pnpm run test:web:built apps/web/tests/plugin-manager.e2e.ts -t 'persists built-in preset and global switches from Settings|keeps the fixture inventory closed' --maxWorkers=2` — 2 passed / 20 filtered, exit 0. `/tmp/dsh-ui-boot-browser-plugins-recheck-20261023.log`.
2. Inspected refresh: `DSH_SNAPSHOT=refresh pnpm run test:web:built apps/web/tests/present.e2e.ts --maxWorkers=2` — 2 passed, exit 0. `/tmp/dsh-ui-boot-browser-present-refresh-20261023.log`. Reviewed both resulting expected-file diffs.
3. Final READ-ONLY replay: `DSH_SNAPSHOT=replay pnpm run test:web:built apps/web/tests/present.e2e.ts apps/web/tests/plugin-manager.e2e.ts -t 'web e2e: explicit file delivery|persists built-in preset and global switches from Settings|keeps the fixture inventory closed' --maxWorkers=2` — 4 passed / 20 filtered, exit 0, including persisted present teardown comparison. `/tmp/dsh-ui-boot-browser-final-replay-20261023.log`.
4. `git diff --check` for the two tests and present expected artifacts — exit 0.

Coverage conclusion: all 34 runnable cases from the original three-file selection passed across the full initial run plus affected-case replays; one recording-only case intentionally skipped. The exact full three-file command was not rerun after these localized test/expected changes. This is implementation/check evidence, not independent approval.

All Web commands started by this lane have exited, their awaited scaffold/browser cleanup completed, and final process inspection found no scoped Web Vitest or chrome-headless process. Tests are STOPPED pending the lead's next artifact build for the subagent source repair. No SDK built bin was moved; source-mode SDK fallback must be coordinated with lead after that build.


## Final typed-lint follow-up — writers stable

IMPLEMENTED. Only `packages/boot/plugin-manager/tests/manager.spec.ts` changed in this follow-up; no production source or built artifacts changed. The six unsafe assignments were Vitest's any-typed asymmetric matchers embedded in expected fixture values, not a parsed JSON variable. The preset fixture now returns its exact string-valued probe/broken module URLs, and all six expectations use those concrete URLs. This strengthens path assertions and introduces no any/unknown assertion escape, lint suppression, or validation bypass. Existing parsed-patch equality assertions remain intact.

- `pnpm exec tsx scripts/run-oxlint.ts packages/boot/plugin-manager/tests/manager.spec.ts` — exit 0 with the repository's typeAware:true configuration. Log: `/tmp/dsh-ui-boot-manager-typed-lint-20261023.log` (empty, no diagnostics).
- `pnpm exec vitest run packages/boot/plugin-manager/tests/manager.spec.ts -t 'preset' --maxWorkers=2` — 9 passed / 180 filtered, exit 0. Log: `/tmp/dsh-ui-boot-manager-lint-tests-20261023.log`.
- `git diff --check -- packages/boot/plugin-manager/tests/manager.spec.ts` — exit 0.

All lane edits and checks are complete. Lead was notified writers are stable and may start its final artifact build. No owned browser, test, lint, or build process remains running. No browser rerun or SDK bin movement was performed.


## F3 bounded expected-description repair

IMPLEMENTED; only these two assigned expected files changed in this follow-up:

- `snapshots/web/fresh-round-trip/tool-schemas.expected.json`: exactly one line, initial `present.description`.
- `snapshots/web/ptc-round/system-prompt.expected.md`: exactly one line, JSDoc on the PTC SDK's `present` member.

Owners located: `apps/web/tests/replay-round-trip.e2e.ts` (fresh) and `apps/web/tests/ptc-round.e2e.ts` (PTC); both opt into the owning replay/pin checks. A live refresh would unnecessarily launch Web and could collide with runtime's source-fallback bin move, so this explicitly authorized narrow repair used static source extraction instead.

Direct diff: replaced the stale final sentence `The user opens the current files; their contents are not copied.` with the exact current production text: `A saved copy preserves the presented bytes within the configured file-size limit; larger files are declared without a saved copy. The original path remains available for opening the current file.` All preceding description text is unchanged.

Evidence: parsed `packages/deliverables/tool-present/src/index.ts` using the TypeScript AST, identified the sole tool object named present, and evaluated ONLY string-literal concatenations in its description. No production module, Web host, browser, or SDK process was executed. The parsed expected JSON description and extracted PTC SDK JSDoc both equal that source string exactly (SHA-256 c64d603387a4d5f6663c9518c3e5cc217d35b49f99220444c96250e2641d536d). Deep equality confirms all other schema values, including parameters, are unchanged. Reverse replacement confirms all other PTC prompt bytes, including custom capture output types, are unchanged. Before/after SHA-256 checks confirmed all six v2/v3/v4 Session inputs across both scenarios are untouched. `git diff --check` for the two files exited 0.

Machine-readable proof: `/tmp/dsh-ui-boot-f3-proof-20261023.json`. No index, source, historical Session, or other expected artifact changed. No end-to-end claim: only exact source/schema/JSDoc equality was checked; any later owner replay must be coordinated with lead after runtime's bin fallback work.


## Finalprep read-only documentation verification

Completed with no worktree writes. Inspected package scripts and pairing CLI: `verify-translation-pairing` resolves to `tsx scripts/verify-translation-pairing.ts`; its default invocation checks the worktree corpus, while only explicit --write mutates records. Used no write flags.

- `pnpm run test:docs` — exit 0; 23 gates passed, 0 failed, 0 skipped in 60.36s. Includes type equivalence (passed in 12.63s), translation pairing, Markdown links/wrap, metadata references and documentation-standard tests. Log: `/tmp/dsh-ui-boot-final-docs-20261023.log`.
- `pnpm run verify-translation-pairing` — exit 0; all 1128 documentation pairs consistent. Log: `/tmp/dsh-ui-boot-final-pairing-20261023.log`.
- No separate type-equivalence rerun: test:docs already executes it and passed.

No stale pairing record, generated-config pair inconsistency, or other documentation blocker was reported. Did not duplicate lead's full typed lint/build/package dependency checks, regenerate content, alter pairing records, or start a Web/SDK process. Both verification commands have exited.
