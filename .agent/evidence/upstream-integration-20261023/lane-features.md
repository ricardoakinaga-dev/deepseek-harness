# Features lane — IMPLEMENTED, pending lead integration verification

Worktree: /home/ricardo/deepseek-harness-upstream-20261023. No git index/branch/commit operations, dependency installation, generators, broad builds or broad typechecks performed. All 41 assigned conflicted paths are marker-free. No removed generic projection reads/state map declarations remain in owned source/tests, including subsequently authorized packages/skill/**. No self-approval.

## Decisions

- Combined custom resilient compaction with upstream destination-model pressure checks and EpochHeader pricing. Retained summary-error events, durable-progress overflow retries, per-turn configuration-failure suspension, adapter/config-reload recovery, and image offload hooks. Added a regression ensuring suspension cannot bypass destination-model pressure validation.
- Migrated harness-dev context, goal activation, hooks-codex, present, subagent model-selection and active-skills readers to awaited private projection handles or AgentRegistry.turnBoundaryOf(). Retained development-context policy, explicit goal task manifests/human acceptance, child sandbox/tool-filter ceilings and custom completion notices.
- Kept custom durable present byte capture, size limits and deliverables/presented emission alongside upstream final-file timing guidance and new native tool execution fixtures.
- Kept frontend physical/symlink containment in upstream Fetch/resource serving, browser/Peer-specific index authentication and ETag handling.
- Preserved ZIP cancellation/quiescence and added upstream Markdown export within the same route lifetime.
- Kept time-context's durable validation/Intl fingerprint fold; adopted private handles, Duration and detailed timezone rejection causes. Bumped host-only checkpoint version to 4 because upstream v3 and custom v3 describe different states; stale rows rebuild. Preserved upstream historical-turn fallback.
- Migrated lifecycle fixtures to required SessionStore/Agent/model/executor setup; removed production test-helper imports. Agent-instructions observer fixtures now forward complete actual SessionStore creation/append streams instead of sparse manual events. The no-marker filesystem fixture explicitly disables markers, isolating it from an existing unrelated /tmp/.git.
- OpenCode fixture routes now declare openai-completions explicitly rather than depending on a provider/model remaining in the installed pi-ai catalog. Conversation routing/auth behavior preserved.

## Executed checks

All commands used `pnpm exec vitest run`, source mode, maxWorkers 1–4; no dependency install until lead's installation-complete notice.

- compaction-basic + goal service + time-context: 207 passed; subsequent compaction-basic safety regression: 132 passed (/tmp/dsh-features-recheck.log, /tmp/dsh-features-switch-safety.log).
- present: 19 passed (/tmp/dsh-features-present-recheck.log). Initial parallel execution had capture timeouts; isolated reproduction and the full focused rerun passed without a runtime change. Temporary diagnostic test/instrumentation removed.
- adapters/context/export/Codex-login matrix: 740 passed, three initial fixture failures; exact session-reference/OpenCode failures corrected and covered by the final five-file rerun, 85 passed, also including model-selection settings, manual compaction and llm-retry (/tmp/dsh-features-adapters.log, /tmp/dsh-features-final-recheck.log).
- shell/subagent-policy/resilience/hooks/util-time matrix: 369 passed, one missing Session import subsequently corrected in the above 85-pass rerun (/tmp/dsh-features-shell.log).
- remaining tool-subagent package tests: 159 passed (/tmp/dsh-features-subagent-final.log).
- tool-skill/active-skills/bash-persistent/tool-goal: 89 passed with one malformed partial-Agent fixture failure; final tool-skill file rerun 32 passed. Thus all four files' latest checks pass (/tmp/dsh-features-extra-recheck.log, /tmp/dsh-features-skill-final.log).
- goal-round-driver and subagent authority passed in /tmp/dsh-features-lifecycle-final.log; other files initially failed there, then agent-instructions + actual WebSocket retry composition passed 211 tests (/tmp/dsh-features-observer-recheck.log).
- deliverable-file-references prompt passed; agent-instructions initially failed, subsequently corrected in the 211-pass run (/tmp/dsh-features-prompt-final.log).
- Focused headless replay of success/timeout/route-effort: 3 comparisons FAIL on remaining recorded artifact differences (/tmp/dsh-features-compaction-snapshots.log). Success stdout and timeout stderr now match; execution reaches normalized Session/schema comparisons. This is not a passing snapshot claim.
- git diff --check passed for owned groups; marker scan found zero assigned conflicts; removed-projection-API scan empty.

## Snapshot fixture decisions and remaining lead work

User explicitly extended fixture ownership to resilient-compaction-success, timeout and route-effort. Changed success cordis.yml + cordis.snapshot.yml headroom 1800→1850 (threshold 6700→6650): upstream's smaller tool/prompt envelope no longer crossed the original threshold, consuming the scripted auxiliary answer as an ordinary answer. The retuned case again emits the expected compaction and final PROACTIVE COMPACTION COMPLETE. Changed only current timeout session.v4.jsonl diagnostic counts 6571/6570→6449/6448 to reflect the 122-token reduction; the 25ms deadline and oversized-loop rejection remain unchanged. Historical generations untouched. Route-effort files were inspected, not edited.

Lead can now refresh those three cases once their pinned schema owner is current: route-effort inherits tool-call-turn/advanced-toolchain schemas, whose obsolete exit_plan_mode declaration must disappear at its owner. Success still has runtime/audit and shadowedTokenCount 389→393 expected-data differences; timeout still has runtime/audit composition/version differences. No snapshot refresh/generator was run by this lane.

Lead owns all manifests, tsconfigs, lockfile, generated catalogs/snapshots beyond the explicit fixture exception, and .i18n.yaml fingerprints (including changed tool-skill README pair). Aggregate build/test typecheck must be rerun after the last fixture/API fixes. First build's skill source errors are fixed; build2 source passed before the latest test-fixture corrections. util/http-proxy/web-fetch-http rootDir/reference diagnostics require lead-owned tsconfig fixes, not source duplication. Built present e2e, real-provider e2e, full product build and full snapshot corpus were not run here.

## Changed paths

- packages/compaction/compaction-basic/README.md
- packages/compaction/compaction-basic/README.zh.md
- packages/compaction/compaction-basic/src/index.ts
- packages/context/agent-instructions/src/render.ts
- packages/context/harness-dev-context/README.md
- packages/context/harness-dev-context/README.zh.md
- packages/context/harness-dev-context/src/index.ts
- packages/context/session-reference/tests/fixtures/source-session.ts
- packages/context/time-context/README.md
- packages/context/time-context/README.zh.md
- packages/context/time-context/src/index.ts
- packages/context/time-context/src/request-zone.ts
- packages/context/time-context/tests/request-zone.spec.ts
- packages/context/time-context/tests/time-context.spec.ts
- packages/context/tmux-context/tests/tmux-context.spec.ts
- packages/deliverables/deliverable-file-references/tests/prompt.spec.ts
- packages/deliverables/tool-present/README.md
- packages/deliverables/tool-present/README.zh.md
- packages/deliverables/tool-present/src/index.ts
- packages/deliverables/tool-present/tests/built-errors.e2e.ts
- packages/deliverables/tool-present/tests/present.spec.ts
- packages/experimental/hooks-codex/src/index.ts
- packages/goal/goal/src/index.ts
- packages/goal/goal/tests/goal.spec.ts
- packages/goal/goal/tests/projection.spec.ts
- packages/host/frontend-static/README.md
- packages/host/frontend-static/README.zh.md
- packages/host/frontend-static/src/index.ts
- packages/llm/llm-retry/tests/retry.spec.ts
- packages/llm/plugin-package-inventory-deepseek/tests/inventory.spec.ts
- packages/llm/token-meter/tests/route-pricing.spec.ts
- packages/llm/token-meter/tests/token-meter.spec.ts
- packages/session-query/session-log-export/src/index.ts
- packages/shell/tool-bash/tests/tools.spec.ts
- packages/shell/tool-pwsh/tests/tools.spec.ts
- packages/subagent/subagent/tests/activation-policy.spec.ts
- packages/subagent/subagent/tests/continuation-inheritance.spec.ts
- packages/subagent/tool-subagent/src/index.ts
- packages/subagent/tool-subagent/src/model-selection-settings.ts
- packages/subagent/tool-subagent/tests/model-selection-settings.spec.ts
- packages/util/time/src/index.ts

Additional authorized non-generated files and explicit snapshot exceptions:

- packages/compaction/compaction-basic/tests/compaction-basic.spec.ts
- packages/compaction/compaction-basic/tests/manual-compaction.spec.ts
- packages/context/agent-instructions/tests/agent-instructions.spec.ts
- packages/context/session-reference/tests/loader-composition.spec.ts
- packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts
- packages/goal/tool-goal/tests/tool-goal.spec.ts
- packages/llm/llm-pi-ai/tests/opencode-session.spec.ts
- packages/llm/llm-retry/tests/websocket-recovery.spec.ts
- packages/shell/tool-bash-persistent/tests/tools.spec.ts
- packages/subagent/subagent/tests/authority.spec.ts
- packages/skill/tool-skill/README.md
- packages/skill/tool-skill/README.zh.md
- packages/skill/tool-skill/src/active-skills.ts
- packages/skill/tool-skill/src/index.ts
- packages/skill/tool-skill/tests/active-skills.spec.ts
- packages/skill/tool-skill/tests/tool-skill.spec.ts
- snapshots/session/resilient-compaction-success/cordis.yml
- snapshots/session/resilient-compaction-success/cordis.snapshot.yml
- snapshots/session/resilient-compaction-timeout/session.v4.jsonl

## Follow-up: canonical child final delivery

IMPLEMENTED source repair in manager.ts + activation.ts, with continuation-messages JSDoc, continuation tests and the subagent README pair. Last successful parent-message text replaces unconditional omission; only an exact full closing-text match can deduplicate while eligibility survives. Distinct canonical finals remain automatic; claimed input/later tool calls invalidate eligibility. Regression-first reproduction: 4 failures before source repair. Full owning continuation/message suites: 176 passed after repair; diff whitespace check passed. SDK canonical-final assertions and artifacts untouched. Ready for next artifact build; runtime SDK verification pending rebuilt manager. Full report: /tmp/dsh-features-canonical-final-repair-20261023.md.

## Final typed lint checkpoint

Source edits complete after lead autofix. Fixed time-context/tests/time-context.spec.ts historical-turn fixture with explicit PreStepDecision fallback and string[] readings; removed an unsafe nested asymmetric-matcher assignment without suppressions or weaker assertions. Focused historical-turn test passed (1 passed, 31 skipped; /tmp/dsh-features-time-fixture-final-20261023.log).

Targeted typed lint passed with exit 0 on these six files: time-context/tests/time-context.spec.ts; subagent/src/manager.ts, activation.ts, continuation-messages.ts; subagent/tests/continuation.spec.ts, continuation-messages.spec.ts. Both repository run-oxlint wrapper and direct `pnpm exec oxlint --type-aware <six paths>` exited 0. Logs: /tmp/dsh-features-final-typed-lint-20261023.log and /tmp/dsh-features-final-typed-lint-direct-20261023.log. `git diff --check` passed. No further workspace source edits after this checkpoint; lead notified before artifact build. README pairing remains lead-owned.

## Follow-up: three headless compaction fixtures

IMPLEMENTED only in compaction-output-reserve, compaction-summary-headroom and model-switch-compaction scenario directories. Restored valid replay sequences; pressure headroom 1800→1925; smaller model window 8622→9300. Preserved intended output-reservation/inherited-summary-cap/durable-model-switch behaviors, one compaction, two headers and final completion text. Focused owner refresh 3 PASS, subsequent read-only replay 3 PASS; hashes unchanged by replay, whitespace check clean. No production/driver/runner edits. Full report: /tmp/dsh-features-three-compaction-fixtures-20261023.md.

## Follow-up: independent F9 PTC invalidation

IMPLEMENTED minimal manager listener repair for tool/ptc-dispatch-start alongside native tool/call, without PTC production imports or completion-time invalidation. Real producer-aligned source composition regressions cover send→noop, noop→send and successful-send→denied-send with matching canonical finals. Final selected checks: 12 PASS; typed lint PASS; narrow subagent tsc PASS; whitespace check PASS. Production/test edits complete, source stable; no timeouts changed. Independent recheck and final rebuilt artifact verification remain outstanding. Full report: /tmp/dsh-features-f9-repair-20261023.md.

## Final F9 source checkpoint

Full continuation + continuation-messages suites: **179/179 PASS**, exit 0, 31.90s (/tmp/dsh-features-f9-full-continuation-20261023.log), including the real PTC producer/binding path regressions. No production edits or timeout adjustments since prior typed lint and narrow package tsc PASS. Exact source hashes and producer proof recorded in /tmp/dsh-features-f9-repair-20261023.md. Source stable for lead's SDK completion and final artifact rebuild; no self-approval.


## Final test lifecycle and Loader typing correction

IMPLEMENTED only in continuation.spec.ts: F9 fixtures now register awaited owning Context disposal immediately and assert zero live agents before persistence/file cleanup; replaced incomplete asserted Loader mock with existing typed sourceModuleLoader factory. No production changes, assertion weakening or timeout changes. Final focused PTC cases **3/3 PASS**; two-file typed lint PASS; **Host aggregate PASS** (`node --max-old-space-size=8192 node_modules/typescript/bin/tsc -p tsconfig.host.json`) against fresh candidate declarations; diff whitespace PASS. Logs `/tmp/dsh-features-f9-loader-{tests,lint,host}-20261023.log`. Prior full 179/179 PASS remains recorded with its timing and scope. This explicitly authorized final Host aggregate supersedes the initial report's earlier statement that no broad typecheck had yet been run. Reliability ownership, exact commands, current hashes and limitations are in `/tmp/dsh-features-f9-repair-20261023.md`. Source stable; lead notified. IMPLEMENTED, not self-approved.
