# Improvement development standard

English | [中文](improvement-development-standard.zh.md)

## Summary

Every custom improvement must preserve the official repository as the source of truth, choose its solution type before implementation, and remain attributable, testable, removable, and compatible with later upstream updates. This standard is mandatory for agents and maintainers working from `custom/main`. It decides whether a change belongs in configuration, a profile patch, a plugin, a bundle, a skill, a library, a complete capability seam, a focused upstream package change, or repository automation.

## Table of Contents

- [Mandatory design sequence](#mandatory-design-sequence)
- [Solution type selection](#solution-type-selection)
- [Improvement record](#improvement-record)
- [Architecture and compatibility rules](#architecture-and-compatibility-rules)
- [Verification by solution type](#verification-by-solution-type)
- [Review and commit requirements](#review-and-commit-requirements)
- [Current examples](#current-examples)
- [When no safe extension exists](#when-no-safe-extension-exists)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="mandatory-design-sequence"></a>
## Mandatory design sequence

An agent completes steps 1 through 6 before editing production code. A proposal may use `status: "proposed"`; it becomes `active` only when its implementation and required evidence are ready to commit.

1. State the user-visible outcome, present failure, non-goals, removal behavior, and affected users or profiles.
2. Read [the architecture](../architecture.md), the owning package READMEs, the generated event/service references, and the relevant Agent Notes. Identify the official capability that already owns the behavior.
3. Search for an existing public event, service, registry, configuration field, profile layer, or package export. Record what the improvement reuses and which official behavior it deliberately does not duplicate.
4. Select exactly one `solutionType` from the table below. Do not choose a plugin merely because it avoids editing an existing file; the selected type must match the behavior and lifecycle owner.
5. Add or update the improvement entry in [the customization policy](../../.agents/customization-policy.json), including its expected paths, before implementation spreads across the repository.
6. Define compatibility obligations and evidence: model-visible logging, released Session readability, configuration validation, lifecycle and disposal, public consumers, snapshots, package checks, and removal after an upstream update.
7. Implement the smallest complete behavior on a topic branch based on `custom/main`. Update the owning README, generated artifacts, tests, and one existing Agent Note or a new note when durable rationale is required.
8. Run the policy verifier and the checks selected for every affected path. Change the record to `active`, review the complete delta from `master`, and then commit and push to the fork.

-----

<a id="solution-type-selection"></a>
## Solution type selection

Choose the first row that fully owns the required behavior. A later row must not replace a simpler official mechanism that already satisfies the outcome.

| `solutionType` | Policy `kind` | Choose when | Do not use it for |
|---|---|---|---|
| `configuration` | `extension` | Existing validated fields already produce the behavior | New runtime logic or hidden defaults |
| `profile-patch` | `extension` | Existing plugins only need a different ordered composition or config row | Shipping new behavior code |
| `plugin` | `extension` | One public Cordis event, service, or registry can own removable runtime behavior | Replacing private state or an already registered owner |
| `bundle` | `extension` | An installable layer only composes existing plugins and configuration | Implementing behavior inside the bundle entry module |
| `plugin-and-bundle` | `extension` | A new plugin needs one optional installable profile layer | Copying an official preset or making the behavior mandatory |
| `skill` | `extension` | The result is agent guidance, a reusable workflow, or supporting resources | Runtime enforcement, durable state, or application behavior |
| `library` | `extension` | Several packages need a reusable same-process API with no plugin lifecycle | A service, provider, tool, profile, or executable |
| `capability-seam` | `extension` | A replaceable capability requires complete Service Definition, Service Provider, and Consumer roles | One implementation with no independent consumer or substitution need |
| `upstream-package-change` | `upstream-patch` | No public extension can preserve the required official behavior or durable facts | Broad fork-only rewrites, copied source, or private monkey-patches |
| `repository-automation` | `governance` | A checker, workflow, generator, or agent rule governs this fork | Product runtime behavior |

A skill changes how an agent performs work; a plugin changes what the running Harness does. A bundle distributes composition; it does not own runtime logic. A capability seam is complete only when all three roles exist, even when one package contains more than one role.

-----

<a id="improvement-record"></a>
## Improvement record

The design brief answers these questions before implementation:

- What observable problem and outcome define the improvement?
- Which official package, service, event, registry, profile, or document owns the neighboring behavior?
- Which `solutionType` applies, and why do earlier rows in the selection table not satisfy the outcome?
- Which public extension points and package exports does the implementation consume?
- Which files and packages does the improvement own?
- Which model-visible inputs or decisions must be reconstructed from the Session log?
- What configuration varies by deployment, and where does validation fail?
- How do cancellation, timeout, concurrency, disposal, reload, and partial failure behave?
- What happens to stored data, profiles, and sessions when the improvement is removed?
- Which focused tests, snapshots, built smokes, documentation checks, or real-provider checks demonstrate the result?

Add the machine-readable portion to `.agents/customization-policy.json`. This plugin template includes package roots because it ships runtime package source:

```json
{
  "id": "improvement-id",
  "kind": "extension",
  "solutionType": "plugin",
  "status": "proposed",
  "summary": "One current-state sentence.",
  "optIn": true,
  "packageRoots": ["packages/<group>/<package>/"],
  "paths": [
    "packages/<group>/<package>/",
    "docs/<owning-guide>*",
    ".agents/notes/<lifecycle>/<class>/<date>-<topic>*"
  ]
}
```

`configuration`, `profile-patch`, and `skill` records may omit `packageRoots` because they must not add production package source. `upstream-package-change` uses `kind: "upstream-patch"` and an `upstreamPlan`; `repository-automation` uses `kind: "governance"`. Each custom path belongs to exactly one improvement.

-----

<a id="architecture-and-compatibility-rules"></a>
## Architecture and compatibility rules

- **Preserve upstream ownership.** Reuse official services and events. Do not copy an official package, preset, generated catalog, or implementation into a custom package.
- **Depend on public entries.** Import package exports, never another package's `src/*`, private fields, build residue, or unpublished internal file.
- **Keep the loop replaceable.** New behavior belongs on documented extension points. A required `agent-loop` change is an `upstream-package-change` and updates `docs/architecture.md`.
- **Log model-visible facts.** Any input or behavior-changing decision that reaches a model request must be reconstructable from official Session events or an accepted upstream event extension.
- **Preserve released data.** A removable extension does not make existing Session logs unreadable. Structural Session changes follow adjacent versioned migration and update both SDK projections.
- **Own lifecycle completely.** Registrations use `ctx.effect()` or `ctx.on()`. Disposal reaches quiescence, waterfall listeners delegate with `next()`, and asynchronous work has explicit cancellation and failure behavior.
- **Expose deployment choices.** Validated configuration owns every deployment-varying value. Defaults are resolved by the owning implementation and misconfiguration fails at the earliest resolvable point.
- **Remain removable.** An optional package leaves official profile sources untouched, does not replace a registered owner silently, and documents what state or behavior remains after removal.
- **Use supported launch paths.** Applications launch only through named `dsh` profiles. An improvement does not add a package bin, demo launcher, or SDK argument escape.
- **Keep one owner per fact.** Code and JSDoc own APIs, package READMEs own package behavior, generated catalogs own inventories, this standard owns solution selection, and Agent Notes own durable rationale.

Before lifecycle, concurrency, subprocess, or teardown work, apply [the defensive patterns](../defensive-patterns.md). Before adding a package or extension mechanism, use [the package guide](../cookbook/adding-a-package.md) and [extension cookbook](../cookbook/extension-cookbook.md).

-----

<a id="verification-by-solution-type"></a>
## Verification by solution type

Every improvement has one focused check that fails for its central regression. Add the applicable evidence below instead of substituting one broad suite for a missing behavior check.

| Solution type | Minimum direct evidence |
|---|---|
| Configuration or profile patch | Production schema parse, resolved-config inspection, and owning profile test |
| Plugin | Focused behavior tests plus cancellation, disposal, reload, and failure cases required by its lifecycle |
| Bundle or plugin and bundle | Production patch-schema test, dependency/default assertions, and packed or real Loader-path smoke |
| Skill | Skill metadata/invocation validation and inspection of every referenced script, asset, and resource |
| Library | Focused public-API tests, typecheck, and every consumer updated in the same change |
| Capability seam | Service Definition contract tests, at least one provider, one consumer, lifecycle coverage, and assembled-profile evidence |
| Upstream package change | Owning package tests, affected consumers, an extraction or upstream plan, and product/model snapshots when behavior is visible |
| Repository automation | Positive fixture, invalid fixture, top-level execution path, and diagnostics naming the violated rule and correction |

Use [the testing policy](../testing.md) to select snapshots, real-provider checks, built smokes, and package or repository checks. A green customization-policy check proves classification and path ownership only; it does not prove runtime correctness.

-----

<a id="review-and-commit-requirements"></a>
## Review and commit requirements

Before commit, the author or agent verifies all of the following:

- The diff is based on `custom/main`, and `master` remains identical to the fetched official branch.
- The policy record has the correct `kind`, `solutionType`, status, package roots when required, path ownership, and upstream plan when required.
- The implementation uses the selected mechanism and does not contain a second hidden mechanism.
- Public consumers, documentation pairs, generated outputs, tests, snapshots, and Agent Notes are synchronized.
- `node scripts/verify-customization-policy.mjs --base master` passes, followed by the checks selected through `dsh-pre-push-checks`.
- The complete `master...HEAD` delta contains no secret, generated build output, unrelated user state, copied official source, or unexplained core edit.
- The commit message names the behavior or policy outcome. The permanent branch receives ordinary commits or upstream merge commits and is never force-pushed.

-----

<a id="current-examples"></a>
## Current examples

| Improvement | Classification | Reason |
|---|---|---|
| Resilient compaction | `extension` / `plugin-and-bundle` | A public global `llm/stream` waterfall owns the policy, and an optional bundle mounts it without replacing official compaction |
| Persistent shell diagnostics | `upstream-patch` / `upstream-package-change` | The registered official Bash and PowerShell tools own their model-visible result wording; a second plugin must not replace them |
| Customization policy | `governance` / `repository-automation` | A repository verifier and GitHub workflow govern branch deltas without changing product runtime |

-----

<a id="when-no-safe-extension-exists"></a>
## When no safe extension exists

Do not force an idea into a plugin or skill when the required public mechanism does not exist. Record a focused `upstream-package-change` that names the missing event, service, durable fact, or package export; update its official consumers and tests together; then keep optional behavior in a separate extension after that prerequisite lands. If the prerequisite cannot preserve Session readability, lifecycle ownership, or supported application launch, stop the implementation and retain the proposal rather than shipping a private bypass.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Upstream-safe customization](upstream-safe-customization.md) — branch topology, synchronization, and recovery.
- [Fork extraction](fork-v2-extraction.md) — concrete analysis of extension-ready and upstream-dependent ideas.
- [Architecture](../architecture.md) — official services, events, capability seams, profiles, and extension points.
- [Extension cookbook](../cookbook/extension-cookbook.md) — code-level plugin patterns and mechanism map.

<a id="dev-note"></a>
## Dev Note

None.
