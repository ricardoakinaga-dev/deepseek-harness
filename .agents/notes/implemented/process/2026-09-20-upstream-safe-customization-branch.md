# Agent Note: Keep custom work on an upstream-fed integration branch

Status: implemented

English | [中文](2026-09-20-upstream-safe-customization-branch.zh.md)

## Problem

A fork needs a stable place for local product improvements without turning the official default branch into a mixed history. If custom commits land on the mirror branch, each official update must distinguish local work from upstream work before it can fast-forward. If agents add files without a recorded owner, an apparently isolated extension can quietly acquire edits to official runtime packages and become costly to update or remove.

## Decision

Local and remote `master` are the fast-forward mirror of `deepseek-official/master`. The permanent `custom/main` branch contains the maintained custom delta and receives ordinary merge commits from `master`. Improvement branches start from `custom/main` and return to it; the permanent branch is neither rebased nor force-pushed.

[The customization policy](../../../customization-policy.json) records the remotes, branch roles, merge strategy, and every proposed, active, or retiring improvement. Each changed path relative to `master` belongs to exactly one improvement classified as an opt-in `extension`, an `upstream-patch` with an exit plan, or repository `governance`. Each record also declares a compatible `solutionType`; packaged extensions name their new package roots, and the verifier rejects production source changes outside those roots. The dedicated workflow runs the verifier on custom branch pushes and pull requests targeting `custom/main`.

The [operating procedure](../../../../docs/customization/upstream-safe-customization.md) owns clone configuration, update commands, and recovery. The [improvement development standard](../../../../docs/customization/improvement-development-standard.md) owns the mandatory pre-code design sequence, solution-type selection, compatibility rules, improvement record, and evidence requirements. The [fork extraction proposal](../../proposed/architecture/2026-09-03-fork-v2-extension-extraction.md) continues to own the architectural criteria for turning experimental behavior into independent plugins and complete capability seams.

## Alternatives considered

**Commit custom work directly to `master`.** Rejected because the fork loses an exact official mirror and a fast-forward update becomes a reconciliation of product and upstream history.

**Keep all customization in a second repository now.** Rejected because the current extensions still depend on workspace types, generated catalogs, snapshots, and coordinated packages. Extraction to another repository remains available after a package consumes only published APIs and owns its release lifecycle.

**Rebase `custom/main` after each official update.** Rejected because rewriting a shared permanent branch invalidates installed commit identities and requires force pushes. Topic branches may still rebase under the repository's ordinary lease-protected rules.

**Rely on prose without a path inventory.** Rejected because guidance cannot detect an unregistered core edit. The machine-readable policy makes ownership and extension package isolation reviewable in every custom delta.

## Consequences

The fork retains an exact official comparison point while custom releases have stable commit identities. Upstream updates may still conflict in files intentionally classified as `upstream-patch` or in generated shared files, but each conflict has a named improvement owner and an explicit extraction path. The policy adds design and maintenance work whenever an improvement or custom path is proposed, introduced, moved, or retired; that cost prevents solution-type drift and silent coupling from accumulating.
