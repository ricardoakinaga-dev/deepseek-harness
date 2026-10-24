# Upstream integration 2026-10-23 — ExecPlan

<!-- engineering-framework: active_action_id=UPSTREAM-20261023:INTEGRATE -->

## Purpose / Big Picture

Merge the official master into permanent custom/main, preserve the custom features, publish the verified branch, and update the checkout launched by the local dsh wrapper.

## Progress

- [x] Located repository, runtime wrapper, branches and unrelated user files.
- [x] Fetched origin and deepseek-official; both master refs identify the same upstream commit.
- [x] Created backup/custom-main-before-upstream-20261023 and an isolated integration worktree.
- [x] Resolve semantic source conflicts and regenerate source-owned artifacts.
- [x] Run build, custom regression tests, snapshots, policy checks and independent review.
- [ ] Fast-forward permanent custom/main, publish, update local runtime and smoke-test.

## Surprises & Discoveries

The upstream contains 1,661 commits absent from the local branch, spanning 6,692 files, with 312 conflicting paths. The local custom branch also contains an unpublished persistent built-in plugin controls commit. The dsh executable launches the separate deepseek-harness-consolidated worktree. Existing .agent/state.json describes an older unrelated AAA program; it remains historical and is not evidence for this integration.

## Decision Log

- Use a merge, preserving both parents and permanent branch history. Never force-push custom/main.
- Resolve in /home/ricardo/deepseek-harness-upstream-20261023 so current launch artifacts and unrelated user documents remain intact until validation.
- Split non-generated source conflict ownership into runtime, UI/boot and feature lanes; lead owns manifests, lockfile, documentation, snapshots, generators and integration.
- Adopt upstream AST-aware vendor rescoping, which includes the custom module-literal preservation behavior.
- Keep official master as an exact mirror; do not add custom changes to it.

## Outcomes & Retrospective

All 312 conflict paths were resolved semantically. The candidate retains the prior custom tip and merges upstream 22ddee3792 (0.2.1-rc.3). The consolidated custom regression matrix passes 630 tests across 31 files; runtime owning tests pass 226, plan-mode admission tests pass 70, and the final subagent continuation matrix passes 179. The independent critic reproduced the canonical-final loss, then verified its exact-text/native/PTC repair through the real manager and producer integration tests.

Headless read-only evidence covers 174 applicable cases (171 in the combined run and three independently repaired compaction fixtures); 17 PowerShell platform cases remain skipped on Linux. SDK artifact refresh and read-only replay pass 37/37 each. SDK source full replay passes 36 cases; the remaining case initially lacked its oracle after a strict identity refresh failure, then passes isolated refresh and read-only replay with all identity fields equal. The original mismatching raw identity was not retained, so concurrent source mutation is a plausible explanation rather than a proven reconstruction. No identity assertion or normalizer was relaxed. Temporary source-mode bin movement was restored with its original checksum and diagnostics were removed.

The selected browser matrix covers all 34 runnable cases across the initial run and focused repairs/replays; one record-only case is skipped. No full browser rerun is claimed. Durable present expectations now use canonical paths and the actual production description. Five Office measurement fixtures pass strict native normalization. Historical v0–v3 Session recordings remain; current v4 fixtures were refreshed through their owners. Three compaction fixtures retain the same assertions with thresholds adjusted for upstream progressive plan-tool admission. Plan-mode production source is unchanged from upstream; stale generator guidance was corrected.

Documentation synchronization initially passed 42/45 checks, including the site build. Its three failures were repaired through the format-index generator and concise paired prose; the quick documentation aggregate subsequently passes 23/23. Type equivalence passes 524 primary blocks and 524 paired derivatives. Persistence history passes 69 roots against 20 records. The three custom historical inventories were losslessly encoded into upstream shared node tables, preserving all seven root digests. Final config/module/dependency catalogs were regenerated and checked after the latest source and manifest edits.

Hygiene initially passed 21/24 gates. Vendor rescoping now scans all 13,480 tracked files with a sufficient Git-output buffer; missing optional-package locale assets were supplied and locale checks plus 37 owning tests pass. AuthorizationDeclinedError is peer-required because the real consumer uses instanceof; the critic verified the class-identity path and negative control. The full dependency gate then identified seven old Codex manifest placements, which were corrected exactly as the upstream policy requires, with lockfile and graph regeneration. The final full typed lint exits 0 (one inherited unused-disable warning). All eight artifact gates pass; the aggregate Host check exposed an invalid test-only Loader cast, replaced with the existing typed sourceModuleLoader fixture. Its three PTC cases pass again, and a subsequent build:check passes both Host and Client aggregates. The rebuilt-artifact SDK replay passes all three selected canonical-final, one-shot-final and background-wait cases. The final full dependency scan exits 0: all 92 classified packages match published dependency policy (5 Client-only, 85 Client/Host, 2 configured Host). The final independent scoped review approves the staged source, fixtures and metadata and closes all nine identified findings. Publication and installed-runtime acceptance remain the next steps.

The first failed compiler run emitted twelve untracked JS/declaration artifacts into http-proxy/src; only those generated files were removed from this isolated worktree. Their removal raced the first lint enumeration and caused a missing-file panic. Subsequent diagnostics and corrections retain the lint rules, hooks, assertions and selected test coverage. Unrelated user documents and the old AAA state were preserved.

## Context and Orientation

Main checkout: /home/ricardo/deepseek-harness on custom/main at df5b0aa151. Origin is ricardoakinaga-dev/deepseek-harness. Official/master and origin/master currently point to 22ddee3792. Runtime checkout: /home/ricardo/deepseek-harness-consolidated on fix/builtin-plugin-controls, also df5b0aa151. /home/ricardo/.local/bin/dsh and dsh-web-window.mjs launch its built CLI. Initial main checkout has three untracked audit Markdown documents; preserve them byte-for-byte.

## Scope and Constraints

This is BROWNFIELD / NORMAL maintenance, BUILD integration, T3_SYSTEM, system-wide compatibility exposure. User explicitly authorizes integrating upstream into the permanent custom branch and the local running installation. Root AGENTS.md, packages/AGENTS.md, docs/AGENTS.md, scripts/AGENTS.md and relevant nested instructions apply. Preserve session data, credentials, unrelated files and custom capabilities. Do not weaken verification rules or bypass hooks.

## Architecture and Interfaces

This is a Cordis plugin workspace. Upstream changes Session preparation, projection registration handles, model selection, approvals, plugin management and packaging. Custom extensions and patches must consume current upstream interfaces while retaining audit/runtime identity events, goal task manifests, durable deliverables, resilient compaction, optional Codex sign-in, OpenCode routing, bounded shell/skill output and built-in plugin controls. Generated catalogs derive from source after resolution.

## Milestones

1. Coherent source candidate: all conflicts resolved with both feature sets, manifests and lockfile synchronized.
2. Executable candidate: build and aggregate build checks, selected custom and affected behavior tests, keyless replay and customization ownership pass.
3. Permanent integration: remote custom/main contains upstream and prior custom tip; installed dsh launches the verified version.

## Plan of Work

Discovery and checkpoint precede parallel disjoint source resolution. Lead resolves shared metadata and fixtures, installs dependencies, regenerates catalogs, reconciles cross-lane APIs, and executes combined checks. Independent read-only review examines retained custom behaviors and actual evidence. Only a validated candidate is fast-forwarded into permanent branches and the runtime checkout.

## Concrete Steps

1. [UPSTREAM-20261023:INTEGRATE] Resolve source conflicts using index stages, preserving custom behavior and adopting upstream contracts; inspect the combined diff.
2. Regenerate aliases and catalogs through owning scripts; record bilingual pair changes only after checking both languages.
3. Run pnpm run build, targeted owning suites and keyless replay; diagnose each failure rather than weakening checks.
4. Run node scripts/verify-customization-policy.mjs --base origin/master and relevant documentation/static checks. Review final source against frozen criteria.
5. Commit normally, fast-forward custom/main and runtime checkout, push normally, verify remote ref and smoke-test the installed CLI/Web profile.

## Validation and Acceptance

| Criterion | Required | Procedure | Expected result |
| --- | --- | --- | --- |
| U1 upstream ancestry | yes | git merge-base --is-ancestor origin/master candidate | exit 0 |
| U2 custom ancestry | yes | git merge-base --is-ancestor df5b0aa151 candidate; custom regression suites | ancestry and behavior retained |
| U3 build | yes | pnpm run build | artifacts and aggregate types pass |
| U4 integration behavior | yes | owning tests and keyless snapshots covering custom/profile boundaries | pass, no hidden failures |
| U5 governance | yes | customization policy, source-generated checks, whitespace and applicable hooks | pass |
| U6 installation | yes | built CLI version/help, isolated Web startup and HTTP readiness | current candidate launches |
| U7 permanence | yes | remote ref equality and local/runtime ancestry | verified candidate published and installed |

## Risks and Human Decisions

Session compatibility and generated fixtures require special care: preserve stored user data and historical format generations. Different custom and upstream projection APIs can compile partially but fail at load; profile and replay checks must exercise the Loader. Branch protection may reject ordinary publication; inspect actual remote response and use an authorized non-destructive alternative if necessary. No unmade product decision currently blocks the merge.

## Idempotence and Recovery

Backup ref retains the complete prior code state. The main and runtime working trees are untouched during preparation. Resume by inspecting this plan, git status, worker reports and logs. Never reset or overwrite unrelated user work. If the candidate fails, fix it in the isolated worktree. Rollback of installation means restoring the launcher to the preserved built checkout, without modifying user session data. Any future rollback requiring older code to read newly written data needs a separate compatibility check.

## Artifacts and Evidence

- /tmp/dsh-merge-preview-20261023.txt: original merge-tree preview.
- /tmp/dsh-lane-*-20261023.json: exact initial ownership partitions.
- /tmp/dsh-lane-REPORT-*-20261023.md: worker decisions and actual checks.
- /tmp/dsh-install-20261023.log: dependency installation output.
- This plan owns the integration narrative; unrelated historical AAA state is preserved.
