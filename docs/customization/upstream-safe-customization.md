# Upstream-safe customization

English | [中文](upstream-safe-customization.zh.md)

## Summary

This fork keeps the official repository easy to update by separating the clean mirror branch from the custom product branch. `master` mirrors `deepseek-official/master`; `custom/main` contains the complete maintained custom delta; short-lived improvement branches start from and return to `custom/main`. Every custom path has one owner in [the customization policy](../../.agents/customization-policy.json), and the policy check rejects unregistered files or an extension that edits production source outside its own packages.

## Contents

- [Repository topology](#repository-topology)
- [Configure a clone](#configure-a-clone)
- [Model an improvement](#model-an-improvement)
- [Update from upstream](#update-from-upstream)
- [Verification and recovery](#verification-and-recovery)

<a id="repository-topology"></a>
## Repository topology

| Ref | Owner | Permitted content |
|---|---|---|
| `deepseek-official/master` | Official repository | External source of truth; fetch only |
| `origin/master` and local `master` | Fork mirror | Exact fast-forward mirror; no custom commits |
| `origin/custom/main` and local `custom/main` | Custom integration | Reviewed improvements plus merges from `master` |
| `custom/<improvement-id>` | One improvement | Temporary topic branch based on `custom/main` |

The fork remains one repository because the custom packages still share the official workspace, types, tests, and release cadence. Move a package to a separate repository only after it consumes published APIs exclusively, passes a packed-install check independently, and can version and release without editing this workspace.

<a id="configure-a-clone"></a>
## Configure a clone

Use these settings in each clone. The official remote cannot receive an accidental push, `master` tracks the official branch, and ordinary pushes target the fork.

```sh
git remote set-url origin https://github.com/ricardoakinaga-dev/deepseek-harness.git
git remote add deepseek-official https://github.com/deepseek-ai/deepseek-harness.git
git remote set-url --push deepseek-official DISABLED
git config --local remote.pushDefault origin
git config --local branch.master.remote deepseek-official
git config --local branch.master.merge refs/heads/master
git config --local branch.master.rebase false
git config --local branch.custom/main.rebase false
```

When `deepseek-official` already exists, replace `git remote add` with `git remote set-url deepseek-official https://github.com/deepseek-ai/deepseek-harness.git`. Agents make product changes only from `custom/main` or a topic branch based on it.

<a id="model-an-improvement"></a>
## Model an improvement

Follow [the improvement development standard](improvement-development-standard.md) before editing production code. It owns the mandatory design sequence, solution-type selection, design brief, compatibility rules, machine-readable record, and verification evidence. This guide owns branch and update operations only.

The policy `kind` describes maintenance: an opt-in `extension`, a focused `upstream-patch` with an exit plan, or repository `governance`. The required `solutionType` describes implementation: configuration, profile patch, plugin, bundle, skill, library, complete capability seam, upstream package change, or repository automation. Every custom path has exactly one record in `.agents/customization-policy.json`.

<a id="update-from-upstream"></a>
## Update from upstream

Start with a clean `custom/main`. Fast-forward the mirror, publish the same official commit to the fork, then merge the mirror into the custom branch. Do not rebase or force-push the permanent custom branch.

```sh
git fetch --prune deepseek-official
git fetch --prune origin
git switch master
git merge --ff-only deepseek-official/master
git push origin master:master
git switch custom/main
git merge --no-ff master
node scripts/verify-customization-policy.mjs --base master
git push -u origin custom/main
```

Resolve merge conflicts in `custom/main`, never by editing the mirror to match custom code. Regenerate source-owned catalogs after resolution, run the checks selected for the affected paths, and commit the merge only when both official behavior and the registered improvements pass.

<a id="verification-and-recovery"></a>
## Verification and recovery

Run `node scripts/verify-customization-policy.mjs --base master` before each custom push. The dedicated GitHub workflow runs the same comparison against `origin/master` for `custom/**` pushes and pull requests targeting `custom/main`. Repository tests, documentation checks, build checks, and snapshots remain required according to the affected product paths; the policy check proves attribution and package isolation, not product correctness.

Before an upstream merge, create a recoverable checkpoint by committing the current topic or custom integration state. If the merge fails, abort it and return to that commit; do not reset the mirror or discard uncommitted user work. Keep release tags on verified `custom/main` commits so an installed custom build can identify its exact source independently of later upstream updates.
