# F9 PTC eligibility repair — IMPLEMENTED

All production and test edits are complete. Source stable for the final artifact rebuild. Scope: packages/subagent/subagent/src/manager.ts and packages/subagent/subagent/tests/continuation.spec.ts. No timeout, artifact, SDK snapshot assertion, shared runner or git index edits.

## Producer-aligned repair

Inspected packages/core/tool-executor-ptc/src/ptc.ts:577–587: the scheduler appends tool/ptc-dispatch-start immediately before preparing a nested call; a blocked call therefore has a start record, while a queued call abandoned without starting has none. The separate tool/ptc-dispatch event records completion later.

The manager invalidates lastParentMessageText on native tool/call or nested tool/ptc-dispatch-start. It consumes only the event discriminator as a string, requiring no production import/dependency on the optional PTC executor or its payload. It does not invalidate on completion/results: a successfully delivered send_message reestablishes eligibility after its own start. Generic execution/pre-execute listeners do not offer the same policy-independent observation because earlier middleware may short-circuit them.

## Regression composition

Added three source integration cases using the real AgentLoop, SubagentManager, PTC executor and dispatch pipeline. Test-only Cordis YAML through the real Loader mounts the external program-runtime double and production subagent-control tool; the standard testkit mounts the real PTC executor. Only program execution is scripted; no Session PTC events are manually emitted.

- send matching canonical final → nested noop → same closing final: full canonical closing text delivered; the noop body actually executes.
- nested noop → successful send matching canonical final → same closing final: duplicate omitted, proving the send's own completion does not invalidate it.
- successful matching send → denied second nested send → same closing final: canonical closing text delivered; start/completion records prove the second send failed, and exactly one parent relay proves the denied send established no fresh eligibility.

Assertions also verify ordered producer dispatch-start names, both durable dispatch outcomes, parent relay count/content and exact settlement behavior. Existing native/input invalidation and canonical/progress distinction tests remain intact.

Initial fixture bring-up failures (duplicate Loader, required run_code description, and an incorrectly formed pre-policy deny) were corrected in tests, not hidden by assertion or timeout changes. The final policy is explicitly typed PreToolDecision.

## Actual verification

- `node node_modules/vitest/vitest.mjs run packages/subagent/subagent/tests/continuation.spec.ts -t 'producer PTC dispatch starts|preserves sender attribution|delivers settlement even|closing message when|closing message again when|closing message when the child ran' --maxWorkers=1`: 12 passed, 158 skipped, exit 0, 9.79s. Log /tmp/dsh-features-f9-ptc-tests-20261023.log.
- `node node_modules/oxlint/bin/oxlint --type-aware packages/subagent/subagent/src/manager.ts packages/subagent/subagent/tests/continuation.spec.ts`: exit 0. Log /tmp/dsh-features-f9-typed-lint-20261023.log.
- `pnpm exec tsc -p packages/subagent/subagent/tsconfig.json --noEmit --tsBuildInfoFile /tmp/dsh-features-f9-subagent.tsbuildinfo`: exit 0; narrow package source check; no workspace output. Log /tmp/dsh-features-f9-narrow-tsc-20261023.log. Production source remained unchanged after that check.
- `git diff --check -- packages/subagent/subagent`: passed.

## Handoff and limits

Lead notified immediately when the production listener edit finished, before source SDK work/rebuild. Test imports add direct use of @deepseek-ai/dsh-ptc-runtime; PTC executor is reached through the existing testkit's PTC option. Lead owns manifest/lockfile reconciliation; no manifests were edited here. No process-isolation claim is made for the scripted external runtime. No new full artifact/SDK/browser run or full-suite race diagnosis was performed. Existing timeout isolation evidence was left unchanged. Independent F9 recheck and rebuilt artifact verification remain lead/critic-owned; this is implementation evidence, not self-approval.

## Final source checkpoint: full continuation verification

`node node_modules/vitest/vitest.mjs run packages/subagent/subagent/tests/continuation.spec.ts packages/subagent/subagent/tests/continuation-messages.spec.ts --maxWorkers=2`: **179 passed / 179**, 2 files passed, exit 0, 31.90s. Log /tmp/dsh-features-f9-full-continuation-20261023.log. No production edits, fixture assertion changes, or timeout changes followed the earlier 12-case F9 check; no timeout workaround was needed. The previously passing two-file typed lint and narrow package tsc remain current for these exact files.

The three PTC cases execute the production executor's actual scheduler/prepare/dispatch/complete path and assert both durable start and completion records, actual noop execution, exactly one successful parent relay, and final settlement text. The Loader mounts the external runtime double and real messaging plugin; the runtime double invokes actual executor-provided bindings rather than fabricating Session events. This proves the producer-aligned distinction between a subsequent PTC call (including a denial) and the send_message result itself. It does not claim real-process runtime isolation.

Frozen source checkpoint hashes:

- `packages/subagent/subagent/src/manager.ts`: `7fe92c8934c84c5b3f493742119a95ea885f934ccbbaa8c5689b0828b8ea3287`
- `packages/subagent/subagent/tests/continuation.spec.ts`: `84210313a0748924c4a7af813748bdb4d051fe0a2c4b18021bb6037ef7cdab45`

No further production edits planned absent a concrete failure. SDK source refresh, independent approval, final artifact rebuild and artifact verification remain with lead/runtime.


## Final Loader typing and reliability checkpoint

Latest edits are test-only in `packages/subagent/subagent/tests/continuation.spec.ts`; production manager remains unchanged (SHA-256 `7fe92c8934c84c5b3f493742119a95ea885f934ccbbaa8c5689b0828b8ea3287`). Current test SHA-256 is `33884c4a4b297729523159f07cde59fadeda93d23d4d68e272b8ff4478d58a1c`; this supersedes the earlier frozen test hash.

The Host aggregate exposed an incomplete ModuleLoaderV2 mock hidden by a type assertion. Replaced it with the existing `sourceModuleLoader` factory from `packages/llm/llm-deepseek/tests/helpers.ts`. Its declared ModuleLoaderV2 result provides the real interface's cache and methods, with unsupported HMR operations explicitly throwing. No assertion/double cast, production export restoration, manifest change or weakened behavior assertion.

Applied `.agents/skills/dsh-ci-test-reliability/SKILL.md` to the three F9 composition cases. Found and corrected one concrete teardown gap: immediately after creating their Context, register awaited `ctx.fiber.dispose()` and assert the captured AgentRegistry has no live agents. FIFO cleanup now drains the owning Context before the existing persistence/file cleanup. The manager drains owned activations/materializations; the AgentLoop ownership disposer stops admission and awaits live-agent disposers/startup work. Context-owned Loader, event observers and policy hooks are disposed together. These fixtures mutate no process-global environment, cwd, timer mode, module mock, fetch or console state; the Loader map/builtin changes are instance-local and need no global restoration. Temporary roots are atomically unique; existing file removal retains bounded Windows handle retries. Scripted external-runtime binding calls are awaited and use no subprocess, listener, fixed sleep or detached work. The production-start negative control is critic-proven per lead; it was not rerun by temporarily changing frozen production source.

Actual final checks (all exit 0):

- `node node_modules/vitest/vitest.mjs run packages/subagent/subagent/tests/continuation.spec.ts -t 'producer PTC dispatch starts' --maxWorkers=1`: **3 passed, 167 skipped**, 9.95s. Log `/tmp/dsh-features-f9-loader-tests-20261023.log`. These include the new quiescent cleanup. No timeout changes.
- `node node_modules/oxlint/bin/oxlint --type-aware packages/subagent/subagent/src/manager.ts packages/subagent/subagent/tests/continuation.spec.ts`: PASS. Log `/tmp/dsh-features-f9-loader-lint-20261023.log`.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc -p tsconfig.host.json`: **Host aggregate PASS** against candidate-build fresh package declarations. Log `/tmp/dsh-features-f9-loader-host-20261023.log` (empty, successful). No compiler/generator/artifact build invoked here.
- `git diff --check -- packages/subagent/subagent/tests/continuation.spec.ts`: PASS.

Earlier full continuation + continuation-messages **179/179 PASS** predates only test lifecycle/typing edits; no behavior assertion or production change required repeating the full suite. Source edits complete and lead notified immediately, then notified of successful Host aggregate. Final artifact/SDK/independent approval remains lead-owned. IMPLEMENTED; no self-approval.
