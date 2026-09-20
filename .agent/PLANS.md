# Execution Plans

An ExecPlan is the living implementation document for work that is complex, long-running, cross-package, risky, or likely to outlive one session. It complements the repository documentation; it does not replace architecture, package contracts, Agent Notes, or the canonical backlog.

## Required properties

Every ExecPlan must remain self-contained, outcome-driven, implementation-oriented, safe to resume, and verifiable. It records progress, discoveries, decisions, limitations, recovery steps, and evidence without erasing failed attempts.

The canonical mutable status lives in `.agent/backlog.json`. The current runtime pointer lives in `.agent/state.json`. The plan explains order and context but does not create a second status inventory.

When runtime state has an active task, the plan contains exactly one `<!-- engineering-framework: active_action_id=<TASK:ACTION> -->` marker and the first visible ordered item under `Concrete Steps` begins with the same `[<TASK:ACTION>]`. When no task is active, the marker is `NONE` and the first item begins with `[NONE]`.

## Required sections

1. Purpose / Big Picture
2. Progress
3. Surprises & Discoveries
4. Decision Log
5. Outcomes & Retrospective
6. Context and Orientation
7. Scope and Constraints
8. Architecture and Interfaces
9. Milestones
10. Plan of Work
11. Concrete Steps
12. Validation and Acceptance
13. Risks and Human Decisions
14. Idempotence and Recovery
15. Artifacts and Evidence

## Maintenance rules

Before work starts or resumes, read the complete current plan, repository instructions, state, backlog, ledgers, relevant documentation, and Git status. Reconcile contradictions against observed files and current evidence before changing state.

Update the plan whenever evidence changes scope, architecture, risk, order, or acceptance. Update `.agent/backlog.json` whenever task status, dependencies, or the single next action changes. Append execution and verification records; never rewrite history to hide a failure.

At every stopping point, record the completed outcome, current limitations, and one safe next action. A checked progress item is not acceptance evidence; the referenced verification procedure must have run and must remain current.
