# Independent integration review — bounded read-only scope

**Verdict: REJECT for the examined candidate metadata/fixture scope.** U4 has concrete candidate-only inconsistencies; U5 has failing current metadata/governance checks. This is not a release verdict for the complete integration. The lead reports source repairs complete and a headless refresh in progress; observations of changing fixtures require focused re-review after refresh. No build, refresh, install, staging, commit, push, source edit, or redelegation was performed by this verifier. The only intentional file write is this requested report.

## Largest gap: F1 — SDK wire goldens use invalid Session sequence coordinates

- **Criteria:** U4; U2 insofar as custom audit/environment insertions must retain reference relationships.
- **Severity:** High / P1. **Confidence:** High, confirmed by comparing actual candidate files and both input stages.
- **Evidence:** `snapshots/sdk/text-turn/notifications.expected.jsonl:12` contains a `session/title` event with `seq:13` and `messageSeqs:[9]`. Its sibling `session.v4.jsonl:16` has that title at seq 14 and correctly cites seq 10 (human `user/message`, line 12). Candidate seq 9 is a `system/message` at line 11. The first notification, line 1, uses seq 3 for `agent/inbox/spliced`, while Session seq 3 is `runtime/audit`; the splice is seq 4.
- **Both inputs:** stage 2 title notification/session agree at seq 14/ref 10; stage 3 agree at seq 12/ref 8. Candidate mismatches both its own Session and the coherent input-side relationships.
- **Additional unequivocal evidence:** `snapshots/sdk/subagent-spawn-in-process/notifications.expected.jsonl:12` and `:33` contain title `seq:32`, `messageSeqs:[28]`. The parent Session contains 28 events (max seq 27), and the child contains 18 (max seq 17). Even without disambiguating the legacy `{{sessionId}}` tokens, neither title coordinate can exist in either role.
- **Affected resolved wire files:**
  - `snapshots/sdk/account-provider-signout/notifications.expected.jsonl:1` (also title at line 12)
  - `snapshots/sdk/bash-tool/notifications.expected.jsonl:1` (title line 12)
  - `snapshots/sdk/dynamic-tool-updates/notifications.expected.jsonl:1` (title line 11)
  - `snapshots/sdk/subagent-dsh-sdk-diagnostic/notifications.expected.jsonl:1` (title line 12)
  - `snapshots/sdk/subagent-dsh-sdk-dynamic-route/notifications.expected.jsonl:14` (later parent events have wrong seq/type relationships)
  - `snapshots/sdk/subagent-spawn-in-process/notifications.expected.jsonl:1`, `:12`, `:33`
  - `snapshots/sdk/text-turn/notifications.expected.jsonl:1`, `:12`
  - `snapshots/sdk/tool-error-details/notifications.expected.jsonl:1` (title line 11)
  - `snapshots/sdk/tool-scheduler-recovery/notifications.expected.jsonl:1` (title line 12)
- **Why this is a real discrepancy:** `packages/sdk/server/src/server.ts:160` forwards the actual Session event unchanged. `snapshots/sdk/sdk.snapshot.ts:420` normalizes wire events without renumbering seqs; `:476` changes generation metadata only. `packages/test-support/session-snapshot/src/runtime-audit-oracle.ts:67` leaves every non-audit notification unchanged, so the audit oracle cannot repair these references.
- **Impact:** wire projection comparison cannot agree with the corresponding persisted Session even if application behavior is otherwise correct. A global notification-index shift is insufficient, especially for interleaved parent/child events.
- **Closure:** repair/refresh wire projections using each Session's coordinate system, then run affected SDK replay cases. Headless refresh alone does not establish closure for SDK wire goldens.

Read-only reproduction from the workspace:

```bash
node --import tsx/esm --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const p='snapshots/sdk/text-turn/notifications.expected.jsonl';
for (const stage of ['2','3','candidate']) {
  const get=f=>stage==='candidate'?readFileSync(f,'utf8'):
    execFileSync('git',['show',`:${stage}:${f}`],{encoding:'utf8'});
  const events=get(p.replace('notifications.expected.jsonl','session.v4.jsonl'))
    .trimEnd().split('\n').map(JSON.parse).slice(1);
  const title=get(p).trimEnd().split('\n').map(JSON.parse)
    .find(x=>x.params?.event?.type==='session/title').params.event;
  console.log({stage,wireSeq:title.seq,wireRef:title.data.messageSeqs[0],
    target:events[title.data.messageSeqs[0]]?.type,
    sessionTitleSeq:events.findIndex(x=>x.type==='session/title')});
}
JS
```

## F2 — Five Office fixtures have inconsistent skill text, counts and digests

- **Criterion:** U4. **Severity:** High / P1. **Confidence:** High.
- **Executed:** `normalizeSessionSnapshots(..., {nativeWriterOutput:true})` over all 45 conflict-list Session/writer JSONLs, excluding wire files: **40 accepted, 5 rejected**. Repeated with the same failures. All five files' stage 1, stage 2, and stage 3 inputs are accepted by the same current normalizer.
- **Exact evidence:**

| Candidate path:line | Event / skill | Recorded characters | Actual Unicode characters | Digest agrees with raw text |
| --- | --- | ---: | ---: | --- |
| `snapshots/session/office-authoring-checker/session.v4.jsonl:19` | tool/result, office-docx | 3960 | 4192 | No |
| `snapshots/session/office-progressive-native/session.v4.jsonl:34` | tool/result, office-export-pdf | 2305 | 2234 | No |
| `snapshots/session/office-progressive-ptc/session.v4.jsonl:27` | tool/ptc-dispatch, office-docx | 3960 | 4192 | No |
| `snapshots/session/office-progressive-ptc/session.v4.jsonl:34` | tool/ptc-dispatch, office-render | 5176 | 5262 | No |
| `snapshots/session/office-progressive-ptc/session.v4.jsonl:41` | tool/ptc-dispatch, office-export-pdf | 2305 | 2234 | No |
| `snapshots/session/office-sidecar-instructions/session.v4.jsonl:19` | tool/result, office-render | 4982 | 5068 | No |
| `snapshots/session/office-sidecar-instructions/session.v4.jsonl:24` | tool/result, office-export-pdf | 2111 | 2040 | No |
| `snapshots/session/office-skills-no-renderer/session.v4.jsonl:19` | tool/result, office-docx | 3960 | 4192 | No |

- **Failure:** `skill office-docx instructionCharacters does not match raw instruction text` (or the corresponding skill name). `packages/test-support/session-snapshot/src/normalize.ts:728` rejects counts; `:776` independently rejects the SHA-256 of `JSON.stringify([provider, text])`. Changing only counts will leave invalid digests.
- **Classification:** confirmed resolution regression at observation time; fixtures are now under an authorized lead refresh. Do not treat this as a source implementation defect or a finding against a future completed refresh.
- **Closure:** verify text and its measured metadata together, including all PTC dispatches, then repeat normalization and relevant replay.

```bash
node --import tsx/esm --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
import {normalizeSessionSnapshots} from './packages/test-support/session-snapshot/src/normalize.ts';
const p='snapshots/session/office-authoring-checker/session.v4.jsonl';
normalizeSessionSnapshots([readFileSync(p,'utf8')],
  {sessionIds:[],cwd:'{{cwd}}',repositoryRoot:process.cwd()},
  {nativeWriterOutput:true});
JS
```

## F3 — Web `present` sidecars still describe upstream behavior instead of retained custom capture

- **Criteria:** U2/U4. **Severity:** Medium / P2. **Confidence:** High for observed mismatch; **refresh closure pending**.
- **Paths:** `snapshots/web/fresh-round-trip/tool-schemas.expected.json:422`; `snapshots/web/ptc-round/system-prompt.expected.md:172`.
- **Evidence:** both describe opening current files whose contents are not copied. Candidate `packages/deliverables/tool-present/src/index.ts:52` describes durable saved copies and its `:142` saves an attachment. The PTC sidecar itself retains `capture` output fields at line 567, contradicting its own description.
- **Executed reproduction:** import `apply` from the source tool, collect the definition through a read-only fake `ctx.tools.register`, and compare its description with the JSON sidecar and PTC JSDoc. Both comparisons returned false, including the follow-up after the lead's update. No tool execution or application launch was involved.
- **Classification:** concrete expected-output drift; the lead reports present refresh work, so it needs a check against the completed refresh before final disposition. This does not mean custom durable capture was lost from source.

## F4 — Source-mode runtime audit oracle remains pinned to a different runtime version

- **Criterion:** U4 (source profile snapshot oracle), U5 (version synchronization). **Severity:** Medium / P2. **Confidence:** High for version mismatch; no live launch claimed.
- **Evidence:** `apps/cli/package.json:3` is `0.2.1-rc.3`; `apps/cli/src/runtime-identity.ts:134` takes the source identity version from that manifest. Calling `readRuntimeIdentity` on the source profile boot returned `0.2.1-rc.3` / `package-manifest-observation`. `snapshots/sdk/text-turn/runtime-audit.source.expected.jsonl:1` remains `0.2.1-alpha.3` with the same version source.
- `packages/test-support/session-snapshot/src/runtime-audit.ts:51` normalizes selected volatile identity fields, not `runtime.version`. `runtime-audit-oracle.ts:43` compares complete normalized audit records with strict deep equality.
- **Impact:** this source-mode oracle cannot match a newly observed rc.3 source runtime; canonical historical Session audit rows may remain historical, but mode oracles used to assert the current launch need separate current evidence.
- **Reproduction:** inspect those fields or call `readRuntimeIdentity(new URL('./apps/cli/src/profile-boot.ts', import.meta.url).href)` and compare with the oracle row.
- **Classification:** pending snapshot refresh/integration synchronization. Artifact oracle freshness depends on the actual latest build and was not established by this review.

## F5 — Three custom package versions fail the current workspace manifest gate

- **Criterion:** U5. **Severity:** Medium / P2. **Confidence:** High.
- **Evidence:** `packages/bundle/resilient-compaction/package.json:5`, `packages/compaction/compaction-resilience-policy/package.json:5`, and `packages/experimental/codex-login/package.json:4` remain `0.2.1-alpha.3`, while root `package.json:3` is `0.2.1-rc.3`.
- **Reproduction:** `pnpm exec tsx scripts/check-workspace-constraints.ts` exits 1 and names precisely these three version mismatches. Repeated after the lead reported source workers complete; same result.
- **Classification:** current integration metadata defect, not a compiler/build failure. Private status does not exempt the first two packages from the implemented version check (`scripts/check-workspace-constraints.ts:485`).

## F6 — Customization policy lacks owners for current custom deltas

- **Criterion:** U5. **Severity:** Medium / P2. **Confidence:** High for current delta; path set can grow during concurrent repairs.
- **Evidence:** direct invocation of exported `validateCustomizationPolicy` on the actual working-tree delta from MERGE_HEAD reports missing ownership for:
  1. `packages/compaction/compaction-basic/tests/manual-compaction.spec.ts`
  2. `packages/core/agent/src/model-selection.ts` (custom type change at line 72)
  3. `packages/core/tool-executor-ptc/src/ptc.ts`
  4. `packages/core/tool-executor-ptc/src/py-types.ts`
  5. `packages/core/tool-executor-ptc/src/ts-types.ts`
  6. `packages/core/tool-executor-ptc/tests/ptc.spec.ts`
  7. `packages/session/session-projection/tests/compatibility.spec.ts`
  8. `packages/session/session-title/tests/initialization.spec.ts` (appeared during source repairs)
- The actual `.agents/customization-policy.json` additions at lines 1044–1069 attribute new package manifests, including `tool-executor-ptc/package.json:1050`, but do not cover these source/test files. Absence is established against every policy pattern, not just that nearby block.
- **Reproduction:** import `validateCustomizationPolicy` from `scripts/verify-customization-policy.mjs`; supply the parsed candidate policy and unique paths from `git diff 22ddee3792402c3e70ec5f86a63c3e3e895a2f60 --name-only --diff-filter=ACDMRTUXB`.
- **Limitation:** the normal CLI with `--base MERGE_HEAD` exits at its ancestry precondition (`verify-customization-policy.mjs:189`), since the merge is not yet committed. That expected in-progress state is **not** a U1 defect. The read-only direct validator was used without weakening ownership rules or changing Git state.

## F7 — Generated config catalog is stale against current source

- **Criterion:** U5. **Severity:** Medium / P2. **Confidence:** High; generated synchronization may be in progress.
- **Reproduction:** `pnpm exec tsx scripts/gen-config-catalog.ts --check` exits 1, naming `docs/config-catalog.md` and `docs/config-catalog.zh.md`.
- **Exact first difference:** `docs/config-catalog.md:2477` and `docs/config-catalog.zh.md:2479` include `sessions` in the inject list; in-memory `computeConfigCatalogOutputs()` returns `shell · approval · agents · sessionProjections`, without `sessions`. The generator was imported and compared in memory; no output was written.
- **Closure:** synchronize the generated files after source stabilizes and rerun the check. This is not evidence of runtime dependency failure.

## F8 — Duplicate Host project reference is retained from both inputs

- **Criterion:** U5 / source metadata hygiene. **Severity:** Low / P3, nonblocking observation. **Confidence:** High.
- **Evidence:** `tsconfig.host.json:328` and `:388` both reference `./packages/client/ui-settings-general/tsconfig.host.json` (reference indices 24 and 44).
- **Reproduction:** parse with TypeScript's JSONC parser and count `references[].path`.
- **Attribution:** present twice in stage 2 (lines 290 and 347) and stage 3 (lines 284 and 305). This is inherited, not introduced by the conflict resolution. No duplicate references were found in the other examined conflict tsconfigs. No claim that this duplicate causes compilation failure.

## Positive evidence and limits

- Read root `AGENTS.md` and `snapshots/AGENTS.md` fully. Compared candidate files with the preserved base/custom/upstream stages, rather than relying on the lead's account.
- No custom `runtime/audit`, `sandbox/environment`, or `subagent/authority` event payload from the examined conflicting JSONLs was lost or altered. The count comparison found no missing input-side event types/counts. Upstream `model/selection` additions in session-resume and model-switch-notice are present.
- Same-artifact reference target identities in the 45 examined Session/writer JSONLs match the corresponding input-side event identities. F1 concerns the separate SDK wire projections, not that Session reference scan.
- `pnpm exec vitest run --config vitest.snapshot.config.ts scripts/session-snapshot-corpus.corpus.ts --no-cache`: 1 file, 3 tests passed. This verifies corpus ownership, sidecar declarations, typed-id redaction, version filenames and migration coverage; it does not validate skill metadata, current schema text or wire sequence coherence. It ran before the ongoing refresh and is not a final post-refresh replay result.
- `pnpm exec tsx scripts/gen-tsconfig-paths.ts --check`: passed, aliases current. Removal of unsupported `./src/*` exports is intentional and accompanied by source-plane aliases; it was not reported as a lost API merely because upstream still had those exports.
- `pnpm exec tsx scripts/verify-type-equiv.ts`: 524 source blocks and 524 paired derivatives passed.
- `pnpm exec tsx scripts/gen-persistence-catalog.ts --check`: passed all listed catalog artifacts, `known-event-types.ts`, and `docs/persistence-schema.json`.
- Independently parsed the three re-encoded custom schema snapshots using `parsePersistenceSnapshot`: `docs/persistence-changes/2026-09-29-goal-required-task-manifest.schema.json` (1 root), `2026-10-12-session-audit-facts.schema.json` (4 roots), and `2026-10-15-harness-evidence-runtime-audit.schema.json` (2 roots). All contain top-level node tables; all seven root digests recompute with `schemaDigest`; every root key/digest pair is unchanged from custom HEAD. No encoding-loss finding for these files.
- `pnpm exec tsx scripts/gen-tool-catalog.ts --check`: passed.
- `pnpm exec tsx scripts/gen-doc-graphs.ts --check`: all 7 graph documents passed, including event producer/consumer generation.
- Examined 52 conflict-list manifests mechanically. The version gate found the three F5 failures; no additional publication-files/dependency-face diagnostics were emitted. Focused lock-importer comparison found no non-override dependency mismatches after accounting for pnpm overrides and dependencies taking precedence over duplicate devDependencies. No install/frozen-lockfile command was run, so this is not installation validation.
- Former standalone list-agents export removal was investigated: candidate source registers discovery from the shared control plugin (`packages/subagent/tool-subagent-control/src/index.ts:30`); no claim of lost list_agents behavior was made from the export removal alone.
- **U1:** not approved; merge remains uncommitted as expected. **U2:** only the retained event payloads and inspected custom surfaces were examined, not complete behavioral regression. **U3:** no build run, per assignment. **U4:** reject current examined expected outputs; full profile/keyless replay not run. **U5:** reject current failing metadata checks, while specific generated checks above passed. **U6/U7:** no installed-runtime launch or publication equality observation; not assessed. Lead-reported build results are context, not independent execution evidence.

## Follow-up

Re-review the completed headless/SDK/Web refresh and final metadata state. Require fresh normalization, coherent per-role wire references, current sidecar/schema checks, workspace version and policy ownership gates, and affected keyless replay evidence before changing this scoped verdict. Keep the normalizers strict; do not suppress valid count/digest or sequence checks to make these fixtures pass.

## Observation identity

- Report written at 2026-10-24T01:07:38.565778+00:00. Concurrent source/fixture work was present during review; this is a dated observation, not a frozen-tree attestation.
- HEAD: `df5b0aa151b6648ef8800b0d59f826402b6eed89`.
- MERGE_HEAD: `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`.

Representative bytes when this report was written (SHA-256):

- `snapshots/sdk/text-turn/notifications.expected.jsonl`: `e2840bd76283fb6e39674f0588349c729c41e8fcb05bfb831b327089968b1711`.
- `snapshots/sdk/subagent-spawn-in-process/notifications.expected.jsonl`: `4d4f6aca5a1be6cd1ddc9e6ce4593655025cbbc626fab9108a3d06e64af3fca0`.
- `snapshots/session/office-authoring-checker/session.v4.jsonl`: `22f8b1756628dd8575b4a557519132f3080a2d94cec309e40a4b3bf90bdf669a`.
- `snapshots/web/fresh-round-trip/tool-schemas.expected.json`: `beb74fdb8a5d7cc9d7c4572c084e9ff450971b2a5bf3a59c4a22cc53830450c8`.
- `snapshots/web/ptc-round/system-prompt.expected.md`: `be415c95b60b22f82bcdd291cb9e5d05e8ceb824bac8151c48057005ea302567`.
- `tsconfig.host.json`: `0b106e0c91a61f76abcc80e2f091cf1d8f2ad5edd9de24040f6be27f0f28a4bf`.
- `.agents/customization-policy.json`: `95fca3e38f2b6470d704d9f5ecfa6d55e897f454cb5c91ab1ae1fdf9c44990e2`.

## Focused remediation recheck — F2/F5/F6/F7

Observed at 2026-10-24T01:09:44.492459+00:00. This addendum preserves the original findings and observation hashes. It supersedes only the individual statuses below; it does not replace the original scoped verdict with approval. The lead has requested that fixture-wide re-review wait for an explicit stabilization notice while SDK and headless refreshes execute.

- **F2: RESOLVED for the five examined file contents at this observation.** Independently executed strict `normalizeSessionSnapshots` with `{nativeWriterOutput:true}` on office-authoring-checker, office-progressive-native, office-progressive-ptc, office-sidecar-instructions, and office-skills-no-renderer. All five passed; process exit 0. This validates both character counts and provider/text digests. No replay or refresh was run by this verifier.
- **F5: RESOLVED.** All three previously named custom manifests now declare `0.2.1-rc.3`. `pnpm exec tsx scripts/check-workspace-constraints.ts` exited 0 with no diagnostics.
- **F7: RESOLVED.** `pnpm exec tsx scripts/gen-config-catalog.ts --check` exited 0: all three artifacts are up to date.
- **F6: Original eight paths are now covered; whole-candidate attribution remains pending refresh stabilization.** Direct candidate validation against the MERGE_HEAD working-tree delta examined 3230 paths and reported only two missing owners: `snapshots/session/background-job-notice/session.v4.jsonl` and `snapshots/session/deepseek-fetch/session.v4.jsonl`. None of the original eight paths was reported. These additional snapshot deltas appeared during the active headless refresh; this observation is not a finding against a completed refresh or evidence that the previous policy remediation failed.
- **F1/F3/F4: NOT RE-REVIEWED in this focused pass.** Awaiting the lead's explicit stabilized-fixture notice. No refresh logs were polled or fixtures continuously reread. **F8:** lead-reported deduplication not independently rechecked in this pass.

Representative corrected-file SHA-256 values from this pass:

- `snapshots/session/office-authoring-checker/session.v4.jsonl`: `0e87105e3c53212fd16d407c779e43a5b1fc317db3c140b6b2f5b94e846039d2`
- `snapshots/session/office-progressive-native/session.v4.jsonl`: `6fa0f53903855cd126df2ede1374c090636023eba6e21df998107854b2bfdaaf`
- `snapshots/session/office-progressive-ptc/session.v4.jsonl`: `b892d1c4b37019724fec2699f2dc369fd7375d3dcd24cda5a7bfade567c4f9c4`
- `snapshots/session/office-sidecar-instructions/session.v4.jsonl`: `ff8ac7205f611b84efd175b3bfc3487feee3f627570bc946dd86c5f00a1c437a`
- `snapshots/session/office-skills-no-renderer/session.v4.jsonl`: `9a98e6098679f678c24f3a9c208fe2ce29add5600b77ef91233125a02c4e3130`
- `.agents/customization-policy.json`: `95fca3e38f2b6470d704d9f5ecfa6d55e897f454cb5c91ab1ae1fdf9c44990e2`
- `docs/config-catalog.md`: `810fae7190bca8b45a80f8405e1dc019a5174e7b89906d3875f9a3449d1c4f70`
- `docs/config-catalog.zh.md`: `b428b11182cc4c85cb3fa267aa79fd90a218e53c77fe5c11771b11559e860b9c`

## Independent subagent source follow-up — U2

**Scoped verdict: REJECT.** One concrete remaining U2 blocker, F9, in PTC invalidation. This follow-up examines manager/activation/continuation messages and their execution/lifecycle callers, not changing fixtures. No source edits or redelegation. Original fixture/governance findings above remain historical observations with their existing addenda.

### F9 — PTC nested tool calls do not invalidate final-text suppression

- **Criterion:** U2: new input/tool calls invalidate suppression. **Severity:** Medium / P2; blocks this stated criterion. **Confidence:** High.
- **Exact evidence:** `packages/subagent/subagent/src/manager.ts:980` registers the event observer; `:981` clears `lastParentMessageText` only for `tool/call`. `packages/core/tool-executor-ptc/src/ptc.ts:577` logs a nested call as `tool/ptc-dispatch-start`, then prepares and dispatches it at `:587`. It does not log a separate `tool/call`. The root run_code call is logged before the embedded program runs, so it cannot invalidate a message delivered later inside that program.
- **User-visible sequence:** child runs `await tools.send_message({agent_id: parentId, message: 'CANONICAL_CHILD_FINAL'}); await tools.noop({});` inside one run_code call, then produces final text `CANONICAL_CHILD_FINAL`. The successful send sets eligibility at `manager.ts:1338`; the following noop leaves it unchanged; `:1220`–`:1224` passes `omitClosingText:true`. The automatic settlement says the closing message is omitted despite the intervening tool call, violating the required invalidation rule.
- **Executed reproduction:** read-only in-memory source probe instantiated the real `SubagentManager` with fake service/Agent handles, called its actual `materializeTracked` so the real listeners were installed, delivered through its actual `sendMessage`, emitted the PTC event to those listeners, and called its actual `notifySettlement`. Output retained `eligibility: CANONICAL_CHILD_FINAL` and the omission notice after `tool/ptc-dispatch-start`. The same probe with native `tool/call` cleared eligibility and included the closing final.
- **Attribution against inputs:** custom HEAD always included automatic closing text; upstream MERGE_HEAD already had boolean suppression with the same native-only invalidation listener. Candidate's exact-text change fixes the upstream progress-versus-final loss, but carries forward this PTC gap. It is an inherited upstream limitation that fails the explicit U2 bar, not a claim that the candidate newly introduced all of it.
- **Coverage gap:** new order-sensitive continuation cases at `packages/subagent/subagent/tests/continuation.spec.ts:3019` exercise native tool batches; they do not exercise tools following send_message within a PTC program. The retained canonical SDK assertion does not cover that order either.
- **Closure:** invalidate at the durable nested-call start as well as native calls, retaining ordering so a later successful nested send may establish fresh eligibility. Add/execute equivalent PTC cases for send→tool→matching final and tool→send→matching final, and a failed nested send after an earlier eligible message. Keep failed delivery from establishing fresh eligibility. This is a remediation direction, not an edit performed by this reviewer.
- **Limit:** the executed reproducer is a source-level manager/listener probe with fake delivery/handles, not a full shipped-profile PTC run. The actual PTC event producer and native pipeline were separately inspected; no assembled fixture replay was run while the lead refreshes fixtures.

Source-level reproduction (no writes):

```bash
node --import tsx/esm --input-type=module - <<'JS'
import {SubagentManager} from './packages/subagent/subagent/src/manager.ts';
import {ActivationPool} from './packages/subagent/subagent/src/activation.ts';
const signal=new AbortController().signal;
const hooks=new Map(), received=[];
const child={id:'child',session:{seq:0,header:{parentSession:'parent'}},
  ctx:{on(name,cb){const list=hooks.get(name)??[];list.push(cb);hooks.set(name,list);return ()=>{};}}};
const parent={id:'parent',status:'running',session:{header:{}},
  steer(m){received.push(m);},followup(m){received.push(m);}};
const agents=new Map([['parent',parent],['child',child]]);
const handle={agent:child,dispose:async()=>{}};
const ctx={agents:{get:id=>agents.get(id)},logger:{warn:console.log},
  plugin(){return {ctx:{agents:{resume:async()=>handle}},dispose:async()=>{}};},
  on(){return ()=>{};},effect(){}};
const manager=new SubagentManager(ctx,
  {observeActivation(){return {start(){},settle(){}};}},()=>10);
const a=await manager['materializeTracked']({kind:'local',childId:'child',provider:'spawn',
  parent,signal,agentOptions:{},composition:{}},[parent],new ActivationPool(),()=>{});
a.announced=true;
await manager.sendMessage(child,'parent',[{type:'text',text:'CANONICAL_CHILD_FINAL'}],{signal});
for(const callback of hooks.get('session/event')??[])
  callback(child.session,{type:'tool/ptc-dispatch-start',data:{name:'noop'}});
manager['notifySettlement'](a,{stopReason:'completed',output:[{type:'text',text:'CANONICAL_CHILD_FINAL'}]});
console.log({eligibility:a.lastParentMessageText,
  notice:received.at(-1).content.map(x=>x.text).join('\n')});
JS
```

### Other U2 and lifecycle observations

The real source-method probe exercised six cases:

| Case | Observed settlement | Assessment |
| --- | --- | --- |
| Successful PROGRESS_ONLY, distinct CANONICAL_CHILD_FINAL | Includes canonical closing text | Meets requested distinction |
| Successful identical final, no intervening work | Omits duplicate closing text | Meets duplicate suppression |
| Identical final then native tool/call | Includes canonical closing text | Native invalidation works |
| Identical final then PTC dispatch-start | Omits canonical closing text | F9 |
| Identical final then agent/inbox/claimed | Includes canonical closing text | Claimed-input invalidation works |
| Send rejects with PARENT_UNAVAILABLE, then settlement | Includes canonical closing text | Failed send does not establish eligibility |

- Candidate writes eligibility only after synchronous `sendAgentMessage` success (`manager.ts:1336`). Distinct text and strict equality at `:1222` prevent progress/substrings from suppressing a distinct canonical final. `messageText` ignores private reasoning/tool blocks consistently with settlement text selection.
- New activation materialization resets eligibility (`manager.ts:940`), preventing old residency epochs from suppressing a resumed child's final. Exact live sender and parent checks remain in the connected send path; settlement verifies the same parent object before delivery, preventing delivery to a replacement parent that merely shares its id.
- Settlement observation retains the child-lock recheck after final flush and the Session sequence check. `close` publishes `activation.closing` synchronously before async disposal (`manager.ts:784`); competing natural/disposal calls share that close transaction. `finishDisposal` captures output before handle disposal and calls `notifySettlement` once in that transaction. No additional concrete race/lifecycle regression was established in this bounded review.
- `snapshots/sdk/sdk.snapshot.ts:1090` retains `assertCanonicalSubagentFinal`; lines 1103–1113 require one settlement notice, canonical final content, and a separate PROGRESS_ONLY relay excluded from the final notice. These assertions were inspected, not rerun while SDK fixtures change.
- **Independent executed tests:** `pnpm exec vitest run packages/subagent/subagent/tests/continuation.spec.ts packages/subagent/subagent/tests/continuation-messages.spec.ts --no-cache` ran 176 tests: 175 passed; the final-flush inbox-race test at `continuation.spec.ts:1339` timed out at 5000ms. It was then rerun unchanged in isolation with `-t 'rechecks direct Agent inbox work accepted during the final flush'`: 1 passed, 166 deliberately filtered/skipped, test execution 256ms. This is an unresolved load-sensitive timeout observation, not a proven source defect. It does not erase the first failed run, and no independent 176/176 pass is claimed. The lead's earlier 176/176 log was read as separate evidence.

Await the lead's stabilized metadata/fixture request. Do not poll or refresh those files in the meantime. Overall integration/release criteria remain outside this narrow U2 source verdict.

Observed at 2026-10-24T01:20:53.285047+00:00. Source SHA-256:

- `packages/subagent/subagent/src/manager.ts`: `a5ea21baa9be540975ca2980b87e0028ab2d01a38ec8d9e83ade0d910ba3627b`.
- `packages/subagent/subagent/src/activation.ts`: `f646f6d2c41575e9060caa7deff4c10c5747964e9a67e69ed7655f903048d7f5`.
- `packages/subagent/subagent/src/continuation-messages.ts`: `db082f3362bcf378eeb7aad216e3637713bebbcf93be7ba592acd01fd2716040`.
- `packages/core/tool-executor-ptc/src/ptc.ts`: `4a0b5f27b48b0702b4b99e8a5184c2003366b93f1c523135230c2f42ee23c059`.

## Staged-candidate re-review — F1/F2/F5/F6/F7/F8

**Verdict: REJECT for the examined staged metadata/fixture scope.** F1, F2, F5 and F8 are resolved. F6 passes in the working tree but fails for the staged policy. F7 has reopened as generated source-line drift. The separately reported F9 U2 blocker remains unchanged. This supersedes earlier individual assessments for these six findings only; the original findings and prior addenda are preserved.

### Independently resolved findings

- **F1 RESOLVED:** independently executed artifact-mode, keyless, read-only replay of all nine affected SDK cases:

  `DSH_EXAMPLE_MODE=lib DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts --no-cache -t 'account-provider-signout|bash-tool|dynamic-tool-updates|subagent-dsh-sdk-diagnostic|subagent-dsh-sdk-dynamic-route|subagent-spawn-in-process|text-turn|tool-error-details|tool-scheduler-recovery'`

  **9 passed, 28 deliberately filtered/skipped, exit 0**, duration 45.36s. Independently checked 240 session.event envelopes across the nine wire goldens: seq/type coordinates, human-title references and tool-result call references agree with corresponding Session roles. Legacy `{{sessionId}}` collapses role identities in some goldens, so the static check considered candidate roles; the actual per-session runtime replay supplies the stronger evidence. Both formerly invalid parent/child title notifications now use seq 14/ref 10. All examined conflict-list wire/Session files match their staged bytes.
- **F2 RESOLVED:** strict normalization of all five Office fixtures passed again with `{nativeWriterOutput:true}` and exit 0. These fixtures match staged bytes. This independently verifies current counts and provider/text digests rather than accepting the refresh log alone.
- **F5 RESOLVED:** `pnpm exec tsx scripts/check-workspace-constraints.ts` exited 0 with no diagnostics; the three custom manifest versions remain rc.3. Examined manifests match staged bytes.
- **F8 RESOLVED:** TypeScript JSONC parsing found no duplicate project references: Host 312 references, Client 107, core/tools 10. These configs match staged bytes.

### F6 — Working policy corrected, staged policy still omits 18 owners

- **Criterion U5; medium / P2; high confidence.** The worktree policy passes against the 3258-path MERGE_HEAD delta. However, the staged `.agents/customization-policy.json` differs from the worktree and fails the same exported validator against the **staged** MERGE_HEAD delta.
- Exact supporting location: the worktree adds owners beginning at `.agents/customization-policy.json:2921`; `git diff -- .agents/customization-policy.json` shows those additions are not staged. The same newly added paths are already part of the staged integration delta.
- Index-only validator diagnostics:
  1. `packages/api/session-controller/src/control.ts`
  2. `packages/api/session-controller/src/index.ts`
  3. `packages/subagent/subagent/src/activation.ts`
  4. `snapshots/session/background-job-notice/session.v4.jsonl`
  5. `snapshots/session/deepseek-fetch/session.v4.jsonl`
  6. `snapshots/session/headless-auto-review/session.v4.jsonl`
  7. `snapshots/session/in-history-series-start/session.v4.jsonl`
  8. `snapshots/session/in-history-series-start/system-prompt.expected.md`
  9. `snapshots/session/model-switch-compaction/cordis.snapshot.yml`
  10. `snapshots/session/model-switch-compaction/cordis.yml`
  11. `snapshots/session/model-switch-compaction/session.v4.jsonl`
  12. `snapshots/session/model-switch-compaction/system-prompt.expected.md`
  13. `snapshots/session/pi-ai-malformed-tool-arguments/session.v4.jsonl`
  14. `snapshots/session/product-subagent-oar/session.v4.jsonl`
  15. `snapshots/session/product-subagent-oar/system-prompt.expected.md`
  16. `snapshots/session/product-subagent-oar/tool-schemas.expected.json`
  17. `snapshots/session/web-search-unconfigured/session.v4.jsonl`
  18. `snapshots/session/web-search-unconfigured/system-prompt.expected.md`
- **Reproduction:** call `validateCustomizationPolicy(JSON.parse(execFileSync('git',['show',':.agents/customization-policy.json'])), paths)` where paths come from `git diff --cached MERGE_HEAD --name-only --diff-filter=ACDMRTUXB`. Use a 16MiB maxBuffer for Git output. This exits 1; the equivalent worktree-policy validation returns no errors.
- **Closure:** include the corrected worktree policy in the candidate index, then rerun index-only ownership validation. No staging was performed by this verifier.

### F7 — Config catalogs reopened due source-location drift

- **Criterion U5; low semantic severity / P3, but the required generated-sync gate fails; high confidence.** `pnpm exec tsx scripts/gen-config-catalog.ts --check` exits 1 and names both language catalogs.
- **Exact difference:** `docs/config-catalog.md:248` and `docs/config-catalog.zh.md:250` point to `packages/api/session-controller/src/index.ts:109`; current in-memory generation points to `:108`. These are the only line differences returned by the in-memory comparison for each page. Both catalog files equal their staged versions.
- This replaces the old F7 inject-list discrepancy, which was corrected; it is new source-location drift after later source edits. No runtime behavior defect is inferred from a shifted source-line citation.
- **Closure:** regenerate from final source, include those generated bytes in the index, and rerun the check. No generation/write was performed by this verifier.

### Additional current observations and limits

- `git ls-files -u` returned no entries. Original stage 2/3 entries are gone, as expected. Old custom comparisons now use HEAD `df5b0aa151b6648ef8800b0d59f826402b6eed89`; upstream uses MERGE_HEAD `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. The merge is still uncommitted; no final ancestry verdict is inferred.
- `git diff --cached --check` exited 0.
- `pnpm exec vitest run --config vitest.snapshot.config.ts scripts/session-snapshot-corpus.corpus.ts --no-cache`: **3/3 passed**, exit 0, after the latest refresh.
- `pnpm exec tsx scripts/rescope-vendor.ts --check`: **PASS over 13,480 tracked files**, no residue, all exact edits landed, idempotent. `scripts/rescope-vendor.ts:670` explicitly uses 16MiB maxBuffer. This independently confirms the corrected check; the earlier buffer exhaustion is not retained as a current defect.
- The reported build log was read: 10 passed, 0 failed, 0 skipped. The artifact refresh log was read: 37/37 passed. Those are lead-executed evidence, not a build or full SDK rerun independently performed here. The nine-case artifact replay above was independently executed.
- **F9 remains OPEN:** staged `packages/subagent/subagent/src/manager.ts:981` still clears eligibility only for `tool/call`; its SHA-256 is unchanged from the prior source probe. No new PTC end-to-end claim is made.
- **F3 and F4 NOT RE-REVIEWED:** the lead explicitly identifies the two UI sidecars and supported source fallback oracles as pending. This pass approves neither. It does not cover the full headless corpus, all hygiene gates, an actual installed runtime (U6), or publication equality (U7).
- Working-tree policy validation is not approval of the staged policy. Of the examined conflict snapshots/manifests/tsconfigs plus selected source/catalog files, only `.agents/customization-policy.json` differed between worktree and index during this recheck.

Observation identity: 2026-10-24T01:25:57.873397+00:00. Representative staged SHA-256:

- `snapshots/sdk/text-turn/notifications.expected.jsonl`: `bbbcc3e73fead1e2b490360a391f1734137f9811e6e2d5fcb8bc4287cf70c368`.
- `snapshots/sdk/subagent-spawn-in-process/notifications.expected.jsonl`: `4009a1bda35690f600d4ecfacb229b7382f67547117c7af66e19a4372ed07829`.
- `snapshots/session/office-authoring-checker/session.v4.jsonl`: `3aed497510e00ff115fa8e2e6568472cc8d1b3269607689c477260070689531a`.
- `tsconfig.host.json`: `3103160269e90751150efae7bd606cd61907252aa302c2e10bf9142a67446eed`.
- `.agents/customization-policy.json`: `2414e0ed0823838aac88afdba12bfe2227bcb9223f476ba1933ab365153b28cd`.
- `docs/config-catalog.md`: `810fae7190bca8b45a80f8405e1dc019a5174e7b89906d3875f9a3449d1c4f70`.
- `docs/config-catalog.zh.md`: `b428b11182cc4c85cb3fa267aa79fd90a218e53c77fe5c11771b11559e860b9c`.
- `packages/subagent/subagent/src/manager.ts`: `a5ea21baa9be540975ca2980b87e0028ab2d01a38ec8d9e83ade0d910ba3627b`.

## Stabilized scoped recheck — F1/F2/F3/F5/F6/F7/F8

**Current scoped verdict: REJECT for staged metadata. No global approval.** F1, F2, F3, F5 and F8 independently pass. F6 is corrected only in the working policy; the staged policy still fails. F7 still fails current generated-sync verification. F4 source fallback oracles and F9 feature repair were explicitly excluded as pending and require a later final-critic pass.

| Finding | Independently observed status | Evidence |
| --- | --- | --- |
| F1 SDK wires | RESOLVED | Re-executed read-only artifact replay for the nine affected SDK cases: 9 passed, 28 intentionally filtered/skipped, exit 0, 28.86s. |
| F2 Office metadata | RESOLVED | Re-executed strict native-writer normalization of all five Office fixtures: 5/5 accepted, exit 0. |
| F3 Web present sidecars | RESOLVED | Real source `apply` registered the tool definition into a read-only collector. Its complete description exactly equals both the native schema description and the PTC prompt's present JSDoc. The source output schema still includes durable `capture`. Both sidecars and source equal staged bytes. No browser or boot-proof report was used as substitute evidence. |
| F5 custom versions | RESOLVED | `pnpm exec tsx scripts/check-workspace-constraints.ts` exited 0 with no diagnostics. The three manifests equal staged bytes. |
| F6 ownership | WORKTREE PASS; INDEX FAIL | Both validators executed against corresponding MERGE_HEAD deltas (3258 paths): worktree policy has zero errors, staged policy reports the same 18 unowned paths listed in the preceding staged-candidate addendum. `.agents/customization-policy.json` still differs between worktree and index. |
| F7 generated config | OPEN | `pnpm exec tsx scripts/gen-config-catalog.ts --check` exited 1. In-memory generation finds exactly one different line in each catalog: English line 248 and Chinese line 250 cite source line 109 instead of current 108. Catalogs equal staged bytes. |
| F8 references | RESOLVED | TypeScript JSONC parse: no duplicates in Host (312 refs), Client (107 refs), or core/tools (10 refs). |

The independent F1 command was:

```bash
DSH_EXAMPLE_MODE=lib DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts --no-cache -t 'account-provider-signout|bash-tool|dynamic-tool-updates|subagent-dsh-sdk-diagnostic|subagent-dsh-sdk-dynamic-route|subagent-spawn-in-process|text-turn|tool-error-details|tool-scheduler-recovery'
```

F3 specifically closes the actual description inconsistency at `snapshots/web/fresh-round-trip/tool-schemas.expected.json:422` and `snapshots/web/ptc-round/system-prompt.expected.md:172`; it does not claim full Web UI/browser validation. The supplied UI boot proof was not needed to establish this exact source-to-sidecar equality.

F6 closure requires including the existing ownership additions in the candidate index and validating that index. F7 closure requires generating catalog bytes from current source and including those bytes in the candidate, then rerunning `--check`. These are additional current metadata gaps; they cannot be treated as closed merely because the requested final critic is expected after the separate F4/F9 work.

Source/fixture identities: no unmerged index stages remain. HEAD remains old custom `df5b0aa151b6648ef8800b0d59f826402b6eed89`; MERGE_HEAD remains upstream `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. All nine examined wire files, all five Office files, all three custom manifests and examined tsconfigs match their index contents. The policy remains unstaged. The manager now has an unstaged change during the pending F9 repair; this pass makes no claim that its latest working bytes retain or fix F9.

No broad compile, browser, refresh, source edit, staging, commit or publication operation was performed. Only this report was written. The full 37-case SDK and 171-case headless results supplied by the lead remain separate evidence; this pass claims only the independently executed narrow checks above. Overall final-critic approval remains withheld pending F4/F9 review and clean staged metadata checks.

Observed at 2026-10-24T01:28:25.142769+00:00. Selected identities (SHA-256):

- `snapshots/web/fresh-round-trip/tool-schemas.expected.json`: worktree `fc9843fd8ef82ad5ab4fb1fc84723fcb988c4d606649a7965eb30a7c58eed242`; index `fc9843fd8ef82ad5ab4fb1fc84723fcb988c4d606649a7965eb30a7c58eed242`.
- `snapshots/web/ptc-round/system-prompt.expected.md`: worktree `57e6fb54080f20307922b343b13ba18a36dacc84128035c813d1e94f9b210547`; index `57e6fb54080f20307922b343b13ba18a36dacc84128035c813d1e94f9b210547`.
- `.agents/customization-policy.json`: worktree `5ed0bb4431aec555959f70b633173e04e0cc2134f1f5b75ab0259e2414235240`; index `2414e0ed0823838aac88afdba12bfe2227bcb9223f476ba1933ab365153b28cd`.
- `docs/config-catalog.md`: worktree `810fae7190bca8b45a80f8405e1dc019a5174e7b89906d3875f9a3449d1c4f70`; index `810fae7190bca8b45a80f8405e1dc019a5174e7b89906d3875f9a3449d1c4f70`.
- `docs/config-catalog.zh.md`: worktree `b428b11182cc4c85cb3fa267aa79fd90a218e53c77fe5c11771b11559e860b9c`; index `b428b11182cc4c85cb3fa267aa79fd90a218e53c77fe5c11771b11559e860b9c`.

## Authorization peer-classification and F9 repair review

**Scoped verdict: APPROVE the examined working-tree authorization classification and F9 source repair.** F9 is resolved for the executed working-tree bytes. This does not approve the staged candidate or overall integration: the repaired source/tests and classifier entry are not staged at this observation. F4 source-mode SDK evidence remains pending. Earlier F6/F7 metadata observations are not silently cleared by this source review.

### AuthorizationDeclinedError classification — accepted

- **Criterion U5 / dependency metadata; no new blocker.** `scripts/package-dependency-policy.ts:67` adds the exact `@deepseek-ai/dsh-authorization#AuthorizationDeclinedError` export to `PEER_REQUIRED_HOST_EXPORTS`.
- **Identity requirement independently confirmed:** the class is defined in `packages/credentials/authorization/src/index.ts:79`; the real consumer uses `instanceof AuthorizationDeclinedError` at `:414`. The real producer imports it through the package at `packages/experimental/codex-login/src/exchange.ts:3` and constructs it for human decline at `:72`. Separate module copies would break this identity test, so peer-required is the appropriate classification.
- **Classifier behavior executed:** the actual runtime-export parser detects only `AuthorizationDeclinedError` from this package in the exchange source. The actual dependency derivation returns `peer-dev`; the actual codex manifest already supplies both `peerDependencies` and `devDependencies` with `workspace:*`, without a normal dependency for authorization. Removing the classification in a bounded in-memory negative control is rejected as unclassified; supplying this exact peer-required entry is accepted. These were narrow parser/policy probes, not a replacement for the full package-dependency scan.
- **No safe-list exemption added:** AST initializer comparison confirms `SAFE_HOST_DEPENDENCY_EXPORTS` is unchanged between the index and this working-tree classifier change. Authorization is absent from both that list and duplicate-safe packages. The diff against MERGE_HEAD and the index contains only the two-line peer-required addition (comment plus exact entry). Thus the human-review rule governing *new safe duplicate-install exceptions* was not used or bypassed.
- **Actual producer exercised:** constructed `LoginExchange`, opened a prompt, accepted its real decline reply, and checked the returned error against the source authorization class. `instanceof` and code `DECLINED` both passed. No login, credentials write, external call, or browser was performed.
- **Independent tests:** `pnpm exec vitest run packages/credentials/authorization/tests/authorization.spec.ts --no-cache -t 'declined prompts'`: **3 passed, 25 intentionally filtered/skipped, exit 0**. Covers cancelled human decline, rewrapped decline, and a non-decline failure remaining a failure.
- **Limit:** approval is for this exact classification and source identity path. The lead's long-running full package-dependency gate was not duplicated or declared passed. No packed-artifact duplicate-install test or whole-hygiene approval is claimed.

### F9 — resolved in current source with producer integration evidence

- **Criterion U2; high confidence for examined current source.** `packages/subagent/subagent/src/manager.ts:980`–`:981` now clears eligibility on both `tool/call` and `tool/ptc-dispatch-start`. It consumes only the event type string and adds no production PTC import or manifest dependency. Result events do not clear a newly successful send's eligibility.
- Re-executed the original real-manager/listener probe, now with assertions, across seven cases: distinct progress/final; exact duplicate suppression; native start invalidation; PTC start invalidation; PTC result preserving eligibility; claimed-input invalidation; rejected send leaving the final unsuppressed. **All seven passed.** The original F9 PTC-start reproducer now includes the canonical closing text as required.
- **Inspected the new producer tests:** `packages/subagent/subagent/tests/continuation.spec.ts:3102` onward covers `send,noop` (final included), `noop,send` (duplicate omitted), and `send,denied-send` (final included). The test mounts PTC mode through `mountAgentLoopTestDependencies`, which mounts the production executor; a Loader composition installs the control plugin and runtime double. `SettlementPtcRuntime` at `:2918` invokes the actual tools bindings; it does not synthesize the durable start events or call manager listeners. Production executor/pipeline code generates starts/results. Assertions inspect emitted event names and error flags, actual noop execution, exactly one settlement notice, and exactly one successfully delivered relay.
- The only external execution runtime is doubled. The production event at `packages/core/tool-executor-ptc/src/ptc.ts:577` precedes policy and dispatch; this covers denied calls as well. Actual non-safe scheduling preserves submission order, allowing a later successful send to reestablish eligibility and leaving later result events harmless.
- **Independent focused regression run:**

  `pnpm exec vitest run packages/subagent/subagent/tests/continuation.spec.ts --no-cache -t 'uses producer PTC dispatch starts|reports the closing message|omits the closing message|delivers settlement even|includes the child answer'`

  **11 passed, 159 intentionally filtered/skipped, exit 0**, duration 6.50s. Includes all three new PTC cases plus related native/final-settlement cases. This is an independent 11-case result, not a restatement of the lead's differently filtered 12-case run.
- No additional concrete lifecycle or policy regression was found in this bounded change. This is not a shipped-profile end-to-end PTC replay, broad compile, or full U2 certification. The prior full-suite timeout observation remains historical evidence; it was not converted into a new full-suite pass.
- **Staging limitation:** current `manager.ts`, `continuation.spec.ts`, and `scripts/package-dependency-policy.ts` all differ from their index bytes. Final candidate approval requires inclusion of these reviewed bytes and subsequent final checks. This is a candidate bookkeeping requirement, not an unresolved source F9 failure.

Await supported-source SDK completion and a final candidate metadata/fixture re-review request. No global approval is issued by this addendum.

Observed at 2026-10-24T01:32:20.802108+00:00. Reviewed working-tree SHA-256:

- `scripts/package-dependency-policy.ts`: `5489e176375bdf7bd7da4678c8d7a3dd083d5dc650f3e0284c813a9d0259f822`; index equal: False.
- `packages/subagent/subagent/src/manager.ts`: `7fe92c8934c84c5b3f493742119a95ea885f934ccbbaa8c5689b0828b8ea3287`; index equal: False.
- `packages/subagent/subagent/tests/continuation.spec.ts`: `84210313a0748924c4a7af813748bdb4d051fe0a2c4b18021bb6037ef7cdab45`; index equal: False.

## Final scoped candidate verdict — APPROVE

**APPROVE for the examined source/fixture/metadata integration scope.** This supersedes the earlier scoped REJECT verdicts and staging limitations for the findings examined here. No concrete blocker remains within this bounded review. It is not a global release approval: no final committed ancestry, installed-runtime acceptance (U6), or publication equality (U7) is independently certified here, and this verifier did not run a broad build, full lint, full package-dependency gate, or full source SDK replay.

### Final closure decisions

| Finding | Final scoped status | Current evidence |
| --- | --- | --- |
| F1 SDK wire coordinates | CLOSED; earlier independent closure retained | Prior nine affected artifact cases passed independently with coherent 240 wire envelopes; current post-F9 canonical/one-shot/background artifact cases pass 3/3 independently. |
| F2 Office skill metadata | CLOSED; earlier independent closure retained | Five strict normalization passes and staged-byte checks were independently established in preceding addenda. No subsequent production fixture mutation reported in this final stage. |
| F3 Web present descriptions | CLOSED; earlier independent closure retained | Both source-definition-to-sidecar exact equality checks passed, capture schema retained, and sidecars matched staged bytes. No browser approval claimed. |
| F4 source runtime audit oracles | CLOSED for the stale-oracle finding, with execution limitation below | All 36 source oracle files / 51 records match the index, declare rc.3/source identity correctly, and each normalized runtime object equals a fresh independently observed source identity. Source replay execution logs were reviewed directly. |
| F5 custom package versions | CLOSED | Independently reran workspace constraints: exit 0, no diagnostics. |
| F6 policy ownership/index | CLOSED | Independently executed both worktree and index-only ownership validation: 3277 custom-delta paths each, no errors. Corrected policy now equals the index. |
| F7 generated config/index | CLOSED | Independently reran `gen-config-catalog.ts --check`: all three artifacts current, exit 0; both language pages equal staged bytes. |
| F8 project reference duplication | CLOSED; earlier independent closure retained | Host duplicate removed; prior independent JSONC counts confirmed 312/107/10 references without duplicates. |
| F9 PTC invalidation | CLOSED in staged candidate | Reviewed repaired listener is now staged; new typed-loader producer regressions independently rerun: 3/3 passed. Previously executed seven-case manager probes and related 11-case run remain supporting evidence. |

### F4 source evidence and its limits

- Independently inspected **36 `runtime-audit.source.expected.jsonl` files / 51 records** and **36 artifact files / 51 records** in SDK scenarios. Every examined oracle equals its staged bytes. All source records identify `0.2.1-rc.3`, `launcher.kind=source`, `versionSource=package-manifest-observation`, a present source identity and `build=null`. Artifact records retain their distinct artifact mode. No source/artifact availability was normalized away.
- Independently called `readRuntimeIdentity` on the source profile boot, applied the actual `normalizeRuntimeAudit`, and asserted exact runtime-object equality against **all 51 source records**. Every assertion passed. This directly rejects the original old-version oracle defect without relying on the lead's narrative.
- Directly read the actual source replay logs: `/tmp/dsh-sdk-source-replay-final-20261023.log` has 36 passes and one ENOENT for the missing background-wait-steer source oracle; `/tmp/dsh-sdk-source-background-replay-20261023.log` subsequently passes that isolated case with the temporary diagnostic removed. This is collective 37-case evidence across two executions, not a single clean 37/37 full execution.
- Directly inspected `/tmp/dsh-sdk-source-background-diagnostic-20261023.log`: its successful targeted refresh recorded equal expected/captured raw runtime objects, including source kind, rc.3 version, launcher hash, source revision, dirty state and source content hash. The initial failing raw object was not retained, so concurrent source mutation remains an explanation, not an independently established exact root cause. The passing diagnostic does not erase the earlier failed attempt.
- Verified current `sdk.snapshot.ts:877` still calls `assertFreshRuntimeAuditIdentity`; `runtime-audit.ts:86` still compares raw identity with `isDeepStrictEqual`; `runtime-audit-oracle.ts:43` still strictly compares normalized mode records. No weakened assertion or temporary identity diagnostic was found in the current source.
- The normal SDK resolver prefers the existing built bin (`packages/sdk/client/src/launch.ts:100`). Under the explicit no-production-writes constraint, this verifier did **not** move that bin to repeat automatic source fallback. The original stale-oracle issue is closed through independent artifact inspection, fresh source identity equality, and direct execution-log review. This is not a claim of an independently executed source SDK replay.
- The source-window restoration record identifies an older built-bin checksum. The current bin has a different checksum after the documented subsequent rebuild; that difference is not treated as a failed restoration. Current artifact SDK replay passed independently, as below.

### Staged F9 and typed test loader

- Staged `manager.ts:981` handles both native `tool/call` and nested `tool/ptc-dispatch-start`. The source bytes equal the previously approved repair (`7fe92c8934c84c5b3f493742119a95ea885f934ccbbaa8c5689b0828b8ea3287`). No production PTC dependency was introduced.
- Inspected the updated regression setup at `continuation.spec.ts:3137`: it uses the existing `sourceModuleLoader` helper from `packages/llm/llm-deepseek/tests/helpers.ts:106`. That helper returns `ModuleLoaderV2` with the required cache and protocol members; unexpected HMR hooks explicitly reject. The previous incomplete `as ...ModuleLoader` stand-in is gone from this setup.
- Independently executed `pnpm exec vitest run packages/subagent/subagent/tests/continuation.spec.ts --no-cache -t 'uses producer PTC dispatch starts'`: **3 passed, 167 intentionally filtered/skipped, exit 0**, 6.35s. All three cases use actual production nested dispatch starts and actual automatic settlement, with only the external execution runtime doubled.
- Independently executed current built replay:

  `DSH_EXAMPLE_MODE=lib DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts --no-cache -t 'replays (subagent-canonical-final|subagent-one-shot-final|background-wait-steer) through'`

  **3 passed, 34 intentionally filtered/skipped, exit 0**, 9.45s. This supplies current canonical/one-shot/background artifact evidence; it is not a PTC-specific artifact replay or full 37-case rerun.

### Codex dependency placements and classification

- Reviewed the final staged manifest and lock importer. Independently asserted all seven corrections, including exact sole section and `workspace:*` specifier in both manifest and lock:

| Dependency | Manifest and lock classification |
| --- | --- |
| `@deepseek-ai/dsh-api-remotes` | devDependencies only |
| `@deepseek-ai/dsh-client-locale` | devDependencies only |
| `@deepseek-ai/dsh-client-ui-renderer` | devDependencies only |
| `@deepseek-ai/dsh-client-ui-settings-models` | devDependencies only |
| `@deepseek-ai/dsh-client-ui-slots` | devDependencies only |
| `@deepseek-ai/dsh-credentials` | dependencies only |
| `@deepseek-ai/dsh-typert-protocol` | dependencies only |

- Authorization remains a shared peer plus development dependency. The reviewed exact `AuthorizationDeclinedError` peer-required classification is now staged; earlier producer/consumer identity checks and three decline tests passed. No duplicate-safe exemption was added.
- Reviewed actual policy semantics: Client injection/build uses become development dependencies; Host runtime exports default to dependencies except peer-required identity exports; `credentialKey` is explicitly duplicate-safe at the export level and typert-protocol is a duplicate-safe package. These final placements agree with those rules.
- Read the completed `/tmp/dsh-package-dependencies-corrected-20261023.log`: it reports all **92 packages** matching policy (5 Client-only, 85 Client/Host, 2 configured Host). This is lead-executed gate evidence reviewed directly, not an independently rerun full gate.
- A verifier single-package source-facts extraction invoked the expensive in-memory compiler path and had not completed when the corrected full gate became available. It was intentionally terminated (exit 137), not reported as a passing check or product failure. Only this verifier's positively identified process was stopped. Separate narrow manifest/lock assertions completed and passed; no full slow gate was restarted.

### Final candidate identity and remaining boundary

- At review, no unmerged paths remained. Examined production source, tests, fixtures, manifest, lock, classification policy, ownership policy and generated config bytes all equalled the index. Only `.agent/plans/upstream-integration-20261023.md` was unstaged, matching the lead's declared evidence-bookkeeping scope.
- HEAD is still old custom `df5b0aa151b6648ef8800b0d59f826402b6eed89`; MERGE_HEAD is upstream `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. No merge commit or publication was performed or approved by this verifier.
- Reviewed the completed build-check log: 2/2 checks passed. Broader build and lint results are lead-executed evidence; this review does not claim those commands were independently run. No new broad compile or browser run was performed.
- All prior findings and failures remain above as dated evidence. This final scoped approval applies to the examined staged production bytes and closes the identified findings. A production mutation or changed fixture invalidates the applicable closure until rechecked. Plan/evidence-only updates do not by themselves alter those reviewed production bytes.

Final review recorded at 2026-10-24T01:45:23.950674+00:00. Selected reviewed staged SHA-256:

- `.agents/customization-policy.json`: `9bfd3757372432d6a024ab547b09b9b7b0915fc3a194bf8a747ebeb42fbd1029`.
- `docs/config-catalog.md`: `0e1a6fb7a0b984b6df604848a582869b11973c8c5d339938421ac30456872e21`.
- `docs/config-catalog.zh.md`: `06477cc3f7ad1d0e10940e6792a9b0853dce349647622602b7518057e013790a`.
- `scripts/package-dependency-policy.ts`: `5489e176375bdf7bd7da4678c8d7a3dd083d5dc650f3e0284c813a9d0259f822`.
- `packages/experimental/codex-login/package.json`: `36543ddfd07b921118d2e9991f1435a9064822b35d3dd52d93f492b24f9c46ca`.
- `pnpm-lock.yaml`: `c98ab0b77f1df7c12dfcd96a737e08fd03ca952afffda613366951c3d82d00ca`.
- `packages/subagent/subagent/src/manager.ts`: `7fe92c8934c84c5b3f493742119a95ea885f934ccbbaa8c5689b0828b8ea3287`.
- `packages/subagent/subagent/tests/continuation.spec.ts`: `33884c4a4b297729523159f07cde59fadeda93d23d4d68e272b8ff4478d58a1c`.
- `snapshots/sdk/background-wait-steer/runtime-audit.source.expected.jsonl`: `4de3c8bbf6db0648db58c788fb4cfac85a8b7a56bbc66d1409d6ba459c3f47a5`.
- `snapshots/sdk/text-turn/runtime-audit.source.expected.jsonl`: `6f1b97d97edd573683eb9a342a122586e087a4fe2d67b14a4edb483db2a826c2`.
