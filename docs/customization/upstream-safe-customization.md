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

Choose the least coupled kind that preserves the behavior:

| Kind | Use when | Required maintenance record |
|---|---|---|
| `extension` | Public Cordis events, services, profile patches, and package exports are sufficient | Opt-in package roots; no edits to official production source |
| `upstream-patch` | The official source must change because no public extension preserves the required behavior | Focused paths and an `upstreamPlan` pointing to extraction or upstream work |
| `governance` | The change controls this fork's repository workflow rather than product runtime | Repository-only paths; no runtime package source |

An extension normally contains one behavior package, its tests and README, and a small optional bundle that mounts it. It must not copy a shipped preset, modify `agent-loop`, replace an already registered service or tool, or add model-visible state that official session events cannot reconstruct. If one of those changes is necessary, first propose the narrow official API or durable event change; keep the optional behavior separate.

Add one entry to `.agents/customization-policy.json` before the implementation leaves its topic branch. This abbreviated record is the reusable template:

```json
{
  "id": "improvement-id",
  "kind": "extension",
  "status": "active",
  "summary": "One current-state sentence.",
  "optIn": true,
  "packageRoots": ["packages/<group>/<package>/"],
  "paths": [
    "packages/<group>/<package>/",
    "packages/bundle/<bundle>/",
    "docs/<owning-guide>*"
  ]
}
```

The record owns every custom path exactly once. Shared generated files belong to the improvement that causes their content. A core patch uses `kind: "upstream-patch"` and replaces `optIn` and `packageRoots` with an `upstreamPlan`; it remains small enough to submit or retire independently.

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
