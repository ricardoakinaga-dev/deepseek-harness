# DeepSeek Harness Triple-A quality program — ExecPlan

<!-- engineering-framework: active_action_id=AAA-001:A02 -->

## Purpose / Big Picture

This program turns the fork into a release candidate whose quality claim is supported by reproducible evidence rather than a score. A maintainer can observe success by checking one immutable commit against `AAA-QB-v1.4`, reproducing the release matrix, confirming that every custom path remains attributable and removable, and reading a fresh independent audit with an unconditional PASS verdict bound to that commit.

The current repository is not Triple-A. The broader 2026-09-20 audit recorded six failing aggregate tasks and several undecided runtime and publication contracts. This plan preserves that baseline and prevents a planning artifact from being mistaken for a completed remediation.

## Progress

- [x] (2026-09-20T16:52:37-03:00) Read both requested audit reports, repository instructions, improvement standard, current policy, and static evidence for the leading findings.
- [x] (2026-09-20T16:52:37-03:00) Classify the program as `BROWNFIELD`, `EVOLUTION/PLAN`, `T3_SYSTEM`, `HIGH` risk, and `SYSTEM` blast radius.
- [x] (2026-09-20T16:52:37-03:00) Freeze the initial Quality Bar, create the canonical remediation backlog, and establish persistent state and recovery artifacts.
- [x] (2026-09-20T17:20:00-03:00) Correct the first critic's qualification deadlock, action granularity, authority reference, publication routing, and under-specified criteria in `AAA-QB-v1.1`.
- [x] (2026-09-20T17:42:00-03:00) Restore audit-source provenance, align AAA-013 with fail-closed containment, and name the mandatory risk-document pairs in `AAA-QB-v1.2`.
- [x] (2026-09-20T18:02:00-03:00) Pin every mutable normative source, remove the stale static-root authority phrase, and specify state-last task and gate transitions in `AAA-QB-v1.3`.
- [x] (2026-09-20T18:30:00-03:00) Move implementation readiness to the first IMPLEMENT action, remove the gate-event ordering ambiguity, cover weighted approval and dynamic extensions in `AAA-QB-v1.4`, and bind final attestation to the immutable candidate.
- [x] (2026-09-20T18:13:00-03:00) Commit and push the independently approved planning checkpoint as `b7e934dc9d`, with `HEAD` equal to `origin/custom/main` and a clean worktree.
- [x] (2026-09-20T18:16:00-03:00) Record the immutable checkpoint and supported host environment in `.agent/evidence/AAA-001/environment.json`.
- [ ] Reproduce and classify each reported failing leaf and required unexecuted release lane in the canonical M0 evidence matrix.

- [ ] Reproduce the baseline at one pristine immutable commit before changing product behavior.
- [ ] Execute milestones M1 through M8 and update this plan, the backlog, ledgers, and program page at every transition.

## Surprises & Discoveries

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
  Impact: canonical metric provenance is required before debt trends become acceptance evidence.
- Observation: the first fresh-context critic found a circular final-qualification obligation, but its read-only sentinel also detected a changed ignored Vitest cache result.
  Evidence: the pre/post repository fingerprint differed only at `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`.
  Impact: the verdict is retained as INVALID mutation evidence; its independently reproducible findings were remediated and require a new sealed critic.

## Decision Log

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

## Outcomes & Retrospective

The planning checkpoint creates the control plane but does not improve runtime quality by itself. The present verdict remains FAIL until the baseline is reproduced and the required criteria pass. Record actual product outcomes, discarded hypotheses, and residual limitations here after each milestone; never rewrite the original baseline.

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
- Acceptance/evidence: AAA-001 plus `AAA-QB-01`, `AAA-QB-02`, and release provenance in `AAA-QB-13`.

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

1. [AAA-001:A02] Reproduce and classify every reported failing leaf and required unexecuted release lane in `.agent/evidence/AAA-001/findings.json` and `.agent/evidence/AAA-001/commands.jsonl`; completion is every source finding and required lane having one command record, observed status, classification, owner, and retained-output digest.
2. Commit and push the complete planning checkpoint only after step 1 passes, then confirm `HEAD` equals `origin/custom/main` and the worktree is clean.
3. Prepare AAA-001, move its backlog record from TODO to READY, append the declared DECISION transition with a null action pointer, then update state last with `last_event_id`, incremented `state_revision`, READY status, null task/action pointers, `next_gate: AUDIT_RESOLVED`, and the transition timestamp.
4. Start the environment-capture action by updating this plan's marker and first step, moving only AAA-001 from READY to IN_PROGRESS, appending START with the exact action ID, then updating state last with matching task/action pointers, event ID, incremented revision, `AUDIT/INSPECT`, and timestamp.
5. Create `.agent/evidence/AAA-001/environment.json` and verify its required fields. When the environment-capture action completes, install this exact successor through the checkpoint transaction: `AAA-001:A02`, kind `REPRODUCE`, summary `Reproduce and classify every reported failing leaf and required unexecuted release lane`, target `.agent/evidence/AAA-001/findings.json and commands.jsonl`, completion signal `Every source finding and required lane has one command record, observed status, classification, owner, and retained-output digest`.

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

- `docs/audits/auditoria-completa-2026-09-20.md`: broad qualitative and static inventory with partial executed evidence; not release proof.
- `docs/customization/repository-audit-2026-09-20.md`: stronger executed baseline with a FAIL verdict; still lacks complete release qualification.
- `docs/customization/aaa-quality-program.md`: maintainer-facing executive charter and status-update protocol.
- `.agent/plans/deepseek-harness-aaa-quality-bar.json`: frozen objective acceptance criteria.
- `.agent/backlog.json`: canonical task status, dependency graph, classification, and next actions.
- `.agent/state.json`: current program pointer and classification.
- `.agent/execution-log.jsonl`: append-only chronology once task execution begins.
- `.agent/verification.jsonl`: append-only verification evidence once procedures run.
- `.agent/reviews/plan-critic-round-1-invalid.md`: preserved first critic findings and the ignored-cache mutation that invalidated its verdict.
- `.agent/reviews/plan-critic-round-2-reject.md`: mutation-clean rejection and the source-provenance, containment, and documentation-corpus remediations.
- `.agent/reviews/plan-critic-round-3-reject.md`: mutation-clean rejection and the state-last transition, implementation-readiness, and normative-source remediations.
- `.agent/reviews/plan-critic-round-4-reject.md`: mutation-clean rejection and the gate-record and active-action checkpoint remediations.
- `.agent/reviews/plan-critic-round-5-reject.md`: mutation-clean rejection and the implementation-entry, missing-criterion, and immutable-attestation remediations.
- `.gauntlet/`: independent-critique state and frozen bar copy; auxiliary to `.agent/`.

Plan revision note, 2026-09-20: initial plan created from both requested audits, direct repository inspection, the upstream-safe improvement standard, and two independent read-only audit cross-checks. The backlog treats disputed catalog, generated-file, and count claims as hypotheses until M0 reproduces them.

Plan revision note, 2026-09-20: the first sealed critic exposed a final-qualification deadlock, a compound first action, a wrong authority pointer, incorrect publication routing, and three under-specified criteria. Quality Bar v1.1 and the backlog correct those gaps. The critic verdict itself remains INVALID because its pre/post sentinel detected an ignored Vitest cache mutation; a new sealed critic is required.

Plan revision note, 2026-09-20: the second sealed critic remained mutation-clean and rejected stale source provenance, AAA-013's trust-based alternative, and an unnamed documentation corpus. Quality Bar v1.2 pins the corrected report, requires resolved-target containment, and binds each risk task to exact English/Chinese pairs.

Plan revision note, 2026-09-20: the third sealed critic remained mutation-clean and rejected future task-start ordering, missing task-bound implementation readiness, incomplete normative-source hashes, and stale static-root authority prose. The plan now defines both state-last transactions, BUILD/IMPLEMENT gate binding, fail-closed containment, and Quality Bar v1.3 source snapshots.

Plan revision note, 2026-09-20: the fourth sealed critic remained mutation-clean and rejected an incomplete gate handoff and an undefined successor after the first evidence action. Readiness and start now persist and revalidate the exact task-bound gate, while action advancement uses an explicit artifact-to-backlog-to-ledger-to-state transaction with `AAA-001:A02` as the first successor.

Plan revision note, 2026-09-20: the fifth sealed critic remained mutation-clean and found that gating every BUILD-labelled task blocked its own preparatory actions, the gate event order was circular, weighted approval and dynamic extension enforcement were absent from the release bar, and the dated audit could mutate the sealed candidate. Quality Bar v1.4 gates only entry into IMPLEMENT, expands the two affected criteria, and separates the immutable candidate from its documentation-only attestation commit.
