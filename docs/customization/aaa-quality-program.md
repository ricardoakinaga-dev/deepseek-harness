# Triple-A quality program

English | [中文](aaa-quality-program.zh.md)

## Summary

This program converts the 2026-09-20 audits into an executable, upstream-safe path to a state-of-the-art DeepSeek Harness fork. The current verdict is **FAIL**, not Triple-A: the broader audit recorded six failing aggregate tasks, incomplete release evidence, and unresolved runtime and publication decisions. Triple-A becomes true only when one immutable release candidate passes every required item in the frozen [Quality Bar](../../.agent/plans/deepseek-harness-aaa-quality-bar.json), survives an upstream-update rehearsal, and receives a fresh independent PASS audit bound to its commit and evidence-index digest.

## Table of Contents

- [Operating model](#operating-model)
- [Executive priorities](#executive-priorities)
- [Roadmap](#roadmap)
- [Solution routing](#solution-routing)
- [Progress updates](#progress-updates)
- [Human decisions](#human-decisions)
- [Release stop conditions](#release-stop-conditions)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="operating-model"></a>
## Operating model

The program keeps one owner for each kind of truth. The [Quality Bar](../../.agent/plans/deepseek-harness-aaa-quality-bar.json) owns objective release criteria. The [canonical backlog](../../.agent/backlog.json) owns task status, dependencies, classifications, and the single next action. The [ExecPlan](../../.agent/plans/deepseek-harness-aaa.md) owns context, milestone order, decisions, recovery, and accumulated outcomes. The source audits remain historical evidence and never become a competing live status page.

The program starts from evidence rather than fixes. A pristine checkout at an exact commit must reproduce or retire each finding before product code changes. Count-based observations such as suppressions, skipped tests, warnings, and residue become actionable only after one canonical procedure records its corpus, commit, environment, and result.

Every production remediation receives its own entry in the [customization policy](../../.agents/customization-policy.json) before implementation. The quality-program entry owns planning and governance artifacts only; it never claims package source on behalf of later work.

-----

<a id="executive-priorities"></a>
## Executive priorities

1. Establish trustworthy evidence: pin one commit and environment, reproduce the six failing aggregate leaves, and run the required release lanes that neither audit established.
2. Restore deterministic execution: remove only verified build residue, make spill fixtures portable, provision the pinned browser, and make standalone command prerequisites explicit.
3. Close the maintained custom delta: repair built snapshot resolution, synchronize persistent-shell documentation and rationale, and add the required keyless model-visible snapshot.
4. Resolve security-sensitive runtime contracts: define WebSocket close quiescence, static asset symlink containment, aggregate HTTP request memory, and dynamic extension trust and CSP behavior.
5. Restore architecture and generated truth: fix client-domain ownership, replay-generation selection, request-count behavior, and regenerate derivative graphs through their owners.
6. Make fork governance fail closed: repair weighted approval, reject invalid customization records, prove the official mirror identity, and emit comparable audit metrics.
7. Authorize publication behavior: decide fork package identity and public source exports before packed-artifact qualification.
8. Reduce static debt in owner-scoped waves, then qualify and independently audit one immutable release candidate.

-----

<a id="roadmap"></a>
## Roadmap

| Milestone | Observable outcome | Required evidence |
| --- | --- | --- |
| M0 — Baseline | One pristine commit has a complete environment and finding matrix | Exact refs, tools, umask, commands, outputs, and classification of every reported failure |
| M1 — Deterministic environment | Clean preparation, constraints, spill, browser, and hygiene paths behave predictably | Clean-tree constraints, two-umask spill results, pinned browser replay, and standalone hygiene evidence |
| M2 — Custom delta | Resilient compaction and shell diagnostics are attributable, removable, documented, and replayable | Built-path replay, focused tests, synchronized owner docs, and keyless Session snapshot |
| M3 — Runtime security | Close, symlink, memory, and dynamic-code policies have approved contracts and negative tests | Barrier, escape, concurrent-load, cancellation, CSP, and consent evidence |
| M4 — Architecture evidence | Domain imports, module graph, replay generations, and model requests agree with their owners | Focused graph, generator, snapshot, and expected-output checks |
| M5 — Governance | Fork automation rejects ownership, mirror, metric, and prerequisite drift | Positive and invalid fixtures plus top-level workflow or command execution |
| M6 — Publication | Namespace, repository identity, source exports, and packed entry points are authorized | Packed manifests, publint, release pack, packed install, and NodeNext consumer evidence |
| M7 — Static hardening | Deprecated readers, suppressions, lint rules, and compiler relaxations have declining owned debt | Canonical metrics, owner-scoped migrations, and reviewed probes |
| M8 — Release | One candidate passes the complete matrix and independent final audit | Same-commit local and CI evidence, update rehearsal, sealed critic, and dated PASS attestation bound to the candidate |

Milestones define dependency order, not calendar promises. Security design may proceed after M0 while deterministic-environment work continues, but shared package edits remain serialized and every required human decision precedes its implementation.

-----

<a id="solution-routing"></a>
## Solution routing

Use the [improvement development standard](improvement-development-standard.md) before code changes. Existing repository checks, workflows, metrics, provisioning, and generators use `repository-automation`. Defects in gateway, filesystem, HTTP bridge, Session, client ownership, or package exports use focused `upstream-package-change` records because official packages own those behaviors. Resilient compaction remains the existing opt-in `plugin-and-bundle`; persistent-shell wording remains its existing focused upstream patch.

Do not create a generic plugin, skill, or fork-only replacement to hide an official-owner defect. Use configuration only when an existing validated field already owns the deployment choice. Change generated outputs only through their source or generator.

-----

<a id="progress-updates"></a>
## Progress updates

At the start of a task, the integrator reads current instructions and the complete ExecPlan, validates persistent state, confirms dependencies, creates or updates the narrow customization-policy entry, changes the backlog status, and appends the start event. At a checkpoint, the integrator records discoveries and decisions, updates the single next action, and marks affected evidence stale when artifacts changed. At verification, the integrator appends exact command or observation records before moving a task through VERIFY to DONE.

At every milestone transition, update this page only when executive scope, order, acceptance, or human decisions changed. Update the ExecPlan for progress, discoveries, decisions, outcomes, and recovery. Update the backlog for status, dependencies, owner, classification, and next action. Append ledgers for chronology and evidence; never rewrite them to conceal a failed attempt.

The first queued backlog action is `AAA-001:A01`: select the exact post-planning baseline commit and record its environment manifest without changing product code. It remains `TODO` until the planning checkpoint is validated, committed, pushed, and transitioned to READY. Current task state and later next actions are authoritative only in [`.agent/backlog.json`](../../.agent/backlog.json).

-----

<a id="human-decisions"></a>
## Human decisions

The fork maintainer or relevant product/security owner must decide the following before implementation or release: package namespace, repository URL, and publication authority; WebSocket logical disposal versus confirmed physical closure; aggregate HTTP memory and admission behavior; dynamic extension deployments, CSP, consent, and defaults; whether `./src/*` is a supported published API; and whether English and Chinese community-channel differences are intentional localization. Static asset handling is not an open trust choice: resolved targets must remain under the configured root and symlink escapes must fail closed.

The backlog records the task that owns each decision. An agent may gather evidence and propose alternatives, but it must not infer publication authority, accept residual HIGH risk, or define exposed-deployment security policy without recorded human authority.

-----

<a id="release-stop-conditions"></a>
## Release stop conditions

Stop release when the candidate commit or worktree is not clean and attributable; a required criterion is failed, stale, blocked, unexecuted, or silently skipped; a model-visible change lacks required Session evidence and synchronized owner documentation; a HIGH-risk runtime contract remains undecided or lacks a negative test; publication identity is unresolved; packed install or required platform CI is red; a Session or loop change lacks adjacent migration and both SDK projections; or an optional extension changes official presets, bypasses a public extension point, or makes prior Session data unreadable after removal.

An audit score, a passing subset, or an accepted HIGH risk cannot produce the Triple-A verdict. The only successful stop is current evidence for every required Quality Bar criterion plus an independent PASS verdict on the sealed candidate. The dated repository audit is published in a documentation-only attestation commit that records the candidate commit and evidence-index digest; that later commit is not itself the qualified candidate unless the complete bar is rerun on it.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Repository audit — 2026-09-20](repository-audit-2026-09-20.md) — broader executed baseline and current FAIL decision.
- [Complete audit — 2026-09-20](../audits/auditoria-completa-2026-09-20.md) — Portuguese qualitative and static baseline with narrower execution scope.
- [Upstream-safe customization](upstream-safe-customization.md) — branch roles, synchronization, and recovery.
- [Improvement development standard](improvement-development-standard.md) — solution selection, compatibility obligations, and verification.

<a id="dev-note"></a>
### Dev Note

This page is the executive charter, not a release report. The exact baseline commands remain historical until M0 reproduces them on an immutable commit; the live verdict therefore remains FAIL.
