# Repository configuration report

English | [中文](repository-configuration-report.zh.md)

## Summary

This report records the upstream-safe configuration of `ricardoakinaga-dev/deepseek-harness`. The fork uses `master` as an exact mirror of the official repository and `custom/main` as its protected default integration branch. Local improvements are registered in a machine-readable policy, checked locally and in GitHub Actions, and merged forward after official updates. This repository configuration does not replace a globally installed `dsh` executable.

## Table of Contents

- [Configured topology](#configured-topology)
- [Protection and automation](#protection-and-automation)
- [Registered improvements](#registered-improvements)
- [Verification evidence](#verification-evidence)
- [Operational limits](#operational-limits)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="configured-topology"></a>
## Configured topology

| Setting | Recorded configuration |
|---|---|
| Fork | `https://github.com/ricardoakinaga-dev/deepseek-harness.git` |
| Official source | `https://github.com/deepseek-ai/deepseek-harness.git` through the fetch-only `deepseek-official` remote |
| Mirror | Local and fork `master`, fast-forwarded from `deepseek-official/master` without custom commits |
| Integration | Local and fork `custom/main`, containing reviewed custom commits and merge commits from `master` |
| GitHub default branch | `custom/main` |
| Topic branches | `custom/<improvement-id>`, based on and returned to `custom/main` |
| Update strategy | Fast-forward `master`, publish that mirror, then merge `master` into `custom/main` without rebasing the permanent branch |

The repository remains a single fork while its custom packages depend on workspace APIs, coordinated tests, and the official release cadence. [The operating procedure](upstream-safe-customization.md) owns clone setup, update commands, and recovery.

-----

<a id="protection-and-automation"></a>
## Protection and automation

GitHub protects both `master` and `custom/main` from force pushes and deletion. The default branch points to `custom/main`, so ordinary clone and pull workflows select the maintained product branch while the official mirror remains available for exact comparison.

The `Customization policy` workflow runs on `custom/**` pushes and pull requests targeting `custom/main`. It compares the change with `origin/master` and rejects an unregistered custom path, duplicate path ownership, an incompatible `kind` and `solutionType`, a package extension without declared package roots, or an extension that modifies production package source outside those roots.

-----

<a id="registered-improvements"></a>
## Registered improvements

| Improvement | Classification | Ownership |
|---|---|---|
| Persistent shell diagnostics | `upstream-patch` / `upstream-package-change` | Focused official shell-tool edits with an extraction plan |
| Resilient compaction | `extension` / `plugin-and-bundle` | Opt-in behavior and composition packages, their tests, snapshot, and documentation |
| Upstream-safe customization governance | `governance` / `repository-automation` | Branch policy, verifier, workflow, agent rule, and customization documentation |

Every custom path relative to `master` has exactly one owner in [`.agents/customization-policy.json`](../../.agents/customization-policy.json). New work follows [the improvement development standard](improvement-development-standard.md) before production code is edited.

-----

<a id="verification-evidence"></a>
## Verification evidence

The configured state was checked through the repository's own commands and the GitHub API. Local and remote `custom/main` resolved to the same commit; fork `master` and `deepseek-official/master` resolved to the same commit; the default branch and both protection rules matched the table above. The customization verifier, its focused tests, the affected package tests, typecheck, lint, build, documentation synchronization, and pre-push checks passed for the configuration change that established this topology.

These commands provide the repeatable current-state checks:

```sh
git status --short --branch
git rev-parse HEAD origin/custom/main
git rev-parse origin/master deepseek-official/master
node scripts/verify-customization-policy.mjs --base master
```

GitHub accepting a workflow run proves dispatch only. A completed green run remains the remote evidence for the exact pushed commit.

-----

<a id="operational-limits"></a>
## Operational limits

- This configuration governs repository history and custom source; it does not install or replace the machine's global `dsh` command.
- Local `.opencode/` state is excluded from this clone and is not part of the maintained custom delta.
- Existing Git stashes remain untouched and are not evidence for either permanent branch.
- Branch protection prevents destructive remote rewrites; it does not replace local clean-tree checks, focused tests, or review of the complete `master...HEAD` delta.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Improvement development standard](improvement-development-standard.md) — mandatory design order and solution-type selection.
- [Upstream-safe customization](upstream-safe-customization.md) — clone configuration, synchronization, and recovery.
- [Fork v2 implementation report](fork-v2-implementation-report.md) — delivered product extension and its verification evidence.

<a id="dev-note"></a>
## Dev Note

None.
