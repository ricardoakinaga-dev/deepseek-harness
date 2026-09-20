# Agent Note: Govern the Triple-A quality program with one backlog and a frozen bar

Status: proposed

English | [中文](2026-09-20-aaa-quality-program.zh.md)

## Problem

The two 2026-09-20 audits cover different command sets and produce incompatible scores and verdicts. A narrative roadmap alone cannot preserve dependencies, current evidence, one safe next action, or the distinction between a historical command result and a verified release candidate. Duplicating task status across a report, roadmap, and plan would create another source of drift.

The remediation also crosses official runtime packages, custom extensions, CI, documentation, publication metadata, and security-sensitive behavior. One broad fork improvement record would hide which changes are removable extensions, focused upstream patches, or repository governance.

## Proposal

Use `.agent/backlog.json` as the only mutable task-status owner, `.agent/state.json` as the current pointer, append-only ledgers for chronology and evidence, and one living ExecPlan for milestone order, decisions, discoveries, recovery, and outcomes. Freeze objective release criteria in a versioned Quality Bar before product remediation starts. Keep the maintainer-facing roadmap status-free and link it to these owners.

Treat every audit claim as historical or proposed until a pristine exact-commit reproduction confirms it. Each production remediation receives a narrow customization-policy record with the `solutionType` selected by the behavior and lifecycle owner. The quality-program governance record owns only planning, audit, state, and verification automation artifacts.

A release receives the Triple-A label only when one immutable candidate has current evidence for every required Quality Bar criterion, no unresolved or accepted HIGH risk, a successful upstream-update rehearsal, and a fresh-context independent PASS audit with an unchanged mutation sentinel. Publish the dated repository audit in a documentation-only attestation commit that binds the candidate commit and evidence-index digest; do not treat that later commit as the qualified candidate without rerunning the complete bar.

## Alternatives considered

**Use the higher or lower audit score as the target.** Rejected because the scores summarize different executed scopes and cannot identify which required release property failed.

**Maintain a Markdown checklist as the backlog.** Rejected because prose cannot reliably enforce unique IDs, dependencies, one current action, or agreement with runtime state and append-only evidence.

**Register the complete remediation as one governance improvement.** Rejected because governance must not own product package source and because later upstream extraction requires each runtime delta to retain a narrow owner and solution type.

**Create a generic quality plugin or skill.** Rejected because repository automation owns checks and workflows, while official packages own the runtime findings. A plugin cannot safely replace those owners, and a skill cannot enforce runtime or durable-state behavior.

## Acceptance criteria

- The Quality Bar contains stable required criteria with targets, baseline status, evidence methods, conditions, and exact source identities.
- The canonical backlog contains stable tasks, dependencies, owners, solution types, acceptance summaries, and exactly one structured next action per task.
- The ExecPlan and runtime state pass the engineering-framework consistency checker and provide deterministic recovery after interruption.
- The executive roadmap links to the canonical owners without duplicating task status.
- Every production remediation creates or updates its own customization-policy entry before package source changes.
- Milestone transitions update the backlog, ExecPlan, evidence ledgers, and executive page according to their distinct ownership.
- The final Triple-A verdict requires current same-candidate evidence, a clean upstream-update rehearsal, and an independent PASS audit whose attestation identifies the candidate commit and evidence-index digest.

## Risks

Persistent planning state can become ceremony if agents update documents without executing the next action. The checker therefore verifies structure, while each DONE transition requires current evidence and the release verdict remains separate from progress prose.

A frozen Quality Bar can preserve a mistaken criterion. Revisions require a version change, reason, affected criteria, and renewed evidence; a revision cannot weaken a failing target only to obtain PASS.

The program can grow into unrelated cleanup. The backlog retains only findings with reproducible behavior, contract, security, release, or maintenance consequences. Count-only observations remain discovery inputs until their corpus and violated obligation are explicit.
