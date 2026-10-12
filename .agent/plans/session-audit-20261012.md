# Session audit implementation — 2026-10-12

<!-- engineering-framework: active_action_id=NONE -->

## Purpose / Big Picture

Implement the session-audit improvement order on custom/session-audit-fixes-20261012, preserving recorded Session generations and existing user work.

## Progress

2026-10-12: implemented the accepted session-audit scope, repaired policy ownership and goal schema pins, preserved historical generations, and completed independent review fixes. Keyless replay passed 191 tests with two skipped; documentation passed 22 gates; GUI replay passed 24 tests; packaged Python advanced/recovery/restart checks passed. Host/Client/Web builds and full lint passed. The local Web installation returned authenticated HTTP 200; prior worktrees remain unchanged. Commits are local; no push or merge.

## Surprises & Discoveries

The existing AAA runtime pointer describes a September task and is not the execution authority for this user-authorized October scope. Retain its history; this scoped plan records the current work.

## Decision Log

Use the existing goal schema as source of truth and the official keyless refresh runner. Narrow erroneous client ownership instead of waiving the policy gate. Capture all presented regular files under a configurable size limit; reuse attachment storage. Delegation may only narrow effective parent authority and retains the existing approval policy. User chose first-prompt titles; keep that provider and avoid recurring title calls.

## Outcomes & Retrospective

The implemented scope is validated and installed locally. Shared per-session temporary storage remains proposed; provider-backed long-session compaction remains unverified. No global AAA verdict, push or merge is claimed.

## Context and Orientation

Repository worktree: /home/ricardo/deepseek-harness-session-fixes. Base: custom/main. Scope and proposed mechanisms: docs/audits/propostas-correcao-sessao-dsh-2026-10-12.md. Live web uses a separate checkout and installed profile packages.

## Scope and Constraints

Follow AGENTS.md and package instructions. No raw Git force, no changes to committed historical Session generations, no secrets in telemetry, no partial branch presented as ready. Shared policy, catalogs, SDK pins and integration belong to the lead; workers receive disjoint package scopes.

## Architecture and Interfaces

Use official attachment storage/export, subagent provider capabilities, sandbox provider facts, configuration and Session logging. Resolve open routine implementation choices from existing contracts and record them before changes.

## Milestones

1. Repair goal schema pins and customization ownership; replay affected corpus.
2. Configure title preference; implement deliverable capture and delegation narrowing.
3. Implement auditable runtime/config facts and sandbox semantics.
4. Implement output retention, glob ignore annotation, duplicate message suppression and skill context improvements.
5. Review, run required checks, integrate and update local web through its supported launch.

## Plan of Work

Complete each milestone with focused regression, model-visible snapshots, owning documentation and policy records. Review existing commits concurrently with the prerequisite repair.

## Concrete Steps

1. [DONE] Integration, ownership, lint, docs, and shared catalogs.
2. [DONE] Current writer expectations and goal schema pins; committed historical inputs retained.
3. [DONE] Keyless replay: 191 passed, 2 skipped; Web: 24 passed; Python packaged advanced/recovery/restart replay passed; docs: 22 gates passed.
4. [DONE] Local runtime rollout with private backup and HTTP 200 smoke; protected worktree digests unchanged. Feature and integration changes are recorded locally; no push or merge.

## Validation and Acceptance

Relevant tests must pass on the actual changed behavior, new negative controls must reject regressions, source types and persistence acknowledgements must be consistent, and required snapshot checks must run without inherited header failures. Runtime startup and compaction need separate evidence after deployment.

## Risks and Human Decisions

Do not reload new configuration into an old plugin build. Ask only for material preferences not inferable from the authorized improvement request. No final AAA qualification is claimed.

## Idempotence and Recovery

Read this plan, branch status, proposal and worker ownership before resuming. Preserve preexisting work. Check generated diffs before refreshing further scenarios. Record pending command sessions and verification results here at checkpoints.

## Artifacts and Evidence

Baseline text-turn failure: /tmp/dsh-snapshot-baseline.log. Customization baseline: /tmp/dsh-session-policy-before.log. Root tsc -b tsconfig.json passed: /tmp/dsh-types-verified.log. Sandbox tests: 61 plus real bwrap 8. Web/app boot focused tests: 113. Glob tests: 130. Skill UI tests: 41. Compaction budget refresh: 2 passed /tmp/dsh-compaction-budgets-final.log. Settings audit: 57; config static gate: 30. Deliverable/download: 54. Subagent targeted producer/inheritance: 47. Persistence acknowledgement generated: docs/persistence-changes/2026-10-12-session-audit-facts.md. Initial full build passed: /tmp/dsh-session-fixes-build.log. Header refresh: /tmp/dsh-final-header-refresh.log. These are focused results, not a global readiness verdict.

2026-10-12 integration checkpoint: GUI present refresh/replay 2 tests each; GUI skills/authority refresh/replay 15 tests each. Skill package 35 passed, glob unit/integration 134 passed. Source-reference fixture now follows prepare/enter/announce after projection registration; dynamic SDK child fixture installs its provider and awaits tool activation. Focused refresh/replay passed for both. Complete keyless refresh, full lint/Host build and documentation quick gates are running. Python carrier verification follows the final artifact build. Historical committed V0–V3 Session inputs are unchanged.

Integration sequencing correction: the Python executable packager uses legacy pnpm deploy with hoisted dependencies and temporarily removes workspace-local links. Do not run source/profile snapshots or browser tests while packaging or workspace installation is in progress. The complete refresh passed 185 tests and failed five ACP cases with missing dependency files during this overlap; restore the normal workspace installation, refresh those failed cases, then replay without writes. The Host and Client/Web builds themselves completed. Private rollout backup: /home/ricardo/.dsh/backups/session-audit-20261012-102755 (launchers, profile manifests/patch, and central Session data). No live profile or launcher has been changed yet.

Final evidence: /home/ricardo/Downloads/dsh-session-audit-fixes-2026-10-12/README.md and SHA-256 manifest. Local launchers point to this worktree; Codex-login link and first-prompt title provider are preserved. The profile pins pnpm 11.11.0 to match its existing store. Rollout created no agent turn and its smoke server stopped normally.
