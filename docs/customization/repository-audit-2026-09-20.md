# Repository audit report — 2026-09-20

English | [中文](repository-audit-2026-09-20.zh.md)

## Summary

The repository remains buildable and has strong coverage on documentation, GUI, type checking, linting, focused runtime tests, and the official release path, but the current checkout does not meet the repository quality bar because the aggregate gate fails and several model-visible, graph, hygiene, and governance findings remain open.

## Table of Contents

- [Scope and decision](#scope-and-decision)
- [Scorecard](#scorecard)
- [Executed evidence](#executed-evidence)
- [Findings](#findings)
- [Strengths](#strengths)
- [Recommended order](#recommended-order)
- [Limitations](#limitations)

-----

## Scope and decision

<a id="scope-and-decision"></a>

The audit covers the `custom/main` checkout at the recorded 2026-09-20 audit revision, version `0.1.6-alpha.2`, including source integrity, documentation, tests, snapshots, package graphs, builds, release verification, runtime behavior, security-sensitive file handling, and upstream-governance controls.

The decision is **FAIL pending remediation**: the repository has substantial working functionality, but `pnpm run check:all` ended with 61 passed gates and 6 failed gates, so the aggregate quality signal is not releasable as-is.

-----

## Scorecard

<a id="scorecard"></a>

The scores below use a 0–100 scale and reflect the executed checks and confirmed findings in this audit.

| Area | Score | Assessment |
| --- | ---: | --- |
| Documentation and current-state accuracy | 55 | Structural gates pass, but historical counts, shell timeout text, and README semantic parity need updates. |
| Bilingual structure and website hygiene | 80 | Documentation gates and the docs build pass; the audited customization area is not part of the website projection. |
| Build, packages, and release | 78 | Typecheck, build, and the official release sequence pass; local residue still causes hygiene and worker-import failures. |
| Tests and evidence | 35 | The aggregate gate fails, snapshots are stale or environment-dependent, and one model-visible shell change lacks a corresponding recorded-session update. |
| Architecture and maintenance | 68 | The main architecture is coherent, but the client domain graph and module graph are stale or violated. |
| Runtime and security | 68 | Focused paths pass, while WebSocket close quiescence, symlink following, and buffered HTTP concurrency retain conditional risks. |
| Frontend and performance | 78 | GUI and type checks pass; build output contains large client chunks and domain-graph violations remain. |
| CI and operations | 55 | The official release workflow is correct, but aggregate CI evidence is blocked by test, graph, and residue failures. |
| Upstream governance | 72 | Customization policy and approval gates pass, while repository identity and upstream-mirror enforcement need review. |
| **Overall** | **65** | **Strong implementation baseline, but not ready for a clean quality verdict.** |

-----

## Executed evidence

<a id="executed-evidence"></a>

The following checks passed: `pnpm run test:docs`, `pnpm run docs:check`, `node scripts/verify-customization-policy.mjs`, the policy specification, approval-policy and issue-management gates, `pnpm run test:gui`, `pnpm run typecheck`, `pnpm run build`, `pnpm run lint`, the focused gateway/connection/frontend-static tests, the focused SQLite/file-upload/http-bridge/attachment/compaction/subprocess tests, and `pnpm run release:verify --family dsh`.

The official release sequence also passed: `pnpm run build:official` followed by `pnpm run release:pack --family dsh --out /tmp/dsh-audit2-npm --concurrency 8`, producing 295 family tarballs for version `0.1.6-alpha.2`.

The aggregate `pnpm run check:all` failed with six gates: client domain graph, unit tests, snapshots, expected outputs, constraints, and module graph.

The unit-test portion reported 1,508 passing files, 13 failing files, 13 skipped files, 26,150 passing tests, 26 failing tests, one expected failure, and 181 skipped tests.

The spill-cleanup failures reproduce under the host `umask 0002` because test-created session directories become group-writable and are intentionally rejected; the isolated spill tests passed under `umask 0022`, so this item is a portability failure that still needs a deterministic test or fixture policy.

The snapshot gate reported a generation-v0 versus generation-v3 mismatch, a resilient-compaction replay using a missing `resilience-snapshot` adapter in `lib` mode, and a web replay blocked by a missing Playwright Chromium executable.

The expected-output gate reported a DeepSeek compatibility case that observed three server requests where the fixture expected two.

The client domain graph gate reported 38 violations, including sibling imports from `ui-conversation`, `ui-sidebar-browser`, and multiple `ui-sidebar-documentpreview` modules.

The module graph gate reported stale `docs/module-graph.md`, `docs/module-graph.zh.md`, and `docs/module-graph.i18n.yaml`.

The hygiene constraints gate reported eight ignored, manifest-less package directories, including code-runtime, E2B, experimental Python, workflow worker-thread, and text-preview residue.

-----

## Findings

<a id="findings"></a>

### Test evidence and model-visible behavior

The shell persistent providers return a detailed timeout message from `packages/shell/tool-bash-persistent/src/index.ts` and `packages/shell/tool-pwsh-persistent/src/index.ts`, while the package README and the corresponding Agent Note still describe the older `[Command timed out or OOM]` text.

The custom delta changes shell behavior and tests without adding a matching keyless recorded-session snapshot, despite the repository testing policy requiring snapshots for model-visible behavior.

### Graph and generated-residue hygiene

The 38 client-domain violations and stale module-graph files weaken the repository's declared dependency evidence even though the implementation and documentation builds pass.

The ignored package directories have no tracked source or manifests, but they are visible to hygiene and worker-import gates; cleanup or an explicit, validated residue policy is required before the aggregate gate can pass.

### Runtime and security-sensitive paths

The WebSocket client resolves `close()` while the socket can still be in `CLOSING`, so callers can observe disposal before the physical close event; the fake WebSocket fixture currently closes synchronously and does not prove quiescence.

The frontend static server performs lexical containment before reading a file but follows a symlink after that check, leaving a conditional escape if an attacker or build input can place a symlink inside the served tree.

The HTTP bridge buffers up to 300 MiB per request and has no aggregate concurrency cap, which creates a conditional memory-amplification risk under concurrent large requests.

### Documentation and governance

The root English README describes GitHub Discussions, topic discussions, and Discord, while the Chinese README substitutes WeChat, a form, and QR-code images; the structural pairing gate passes but does not verify semantic parity of those contact channels.

The historical customization implementation report records 1,128 bilingual pairs and 2,259 Markdown files, while the current docs checks report 1,018 pairs and 2,023 raw Markdown files; the historical report has no date or commit marker explaining the difference.

The customization-policy script accepts `packageRoots` for a `configuration` solution type even though the written standard restricts package-source additions to packaged extensions; this is a policy enforcement gap.

The customization workflow compares against `origin/master`, while the written fork policy requires an exact local/fork master mirror of `deepseek-official/master`; the refs were equal during this audit, but the workflow does not enforce that stronger relationship.

Two newly inspected package manifests point their `repository.url` to the official upstream repository instead of the fork URL, which requires an ownership decision before publication.

-----

## Strengths

<a id="strengths"></a>

Documentation quick checks, the full docs build, GUI tests, type checking, linting, focused runtime suites, customization policy, and release-family verification provide a strong passing baseline.

The official release workflow correctly records the client build through `build:official` before packaging; the direct package command only failed when run without that required official-build metadata.

The source Git worktree was clean at the audit checkpoint, and `git diff --check` passed; build and packaging commands changed only ignored artifacts and temporary release outputs.

-----

## Recommended order

<a id="recommended-order"></a>

1. Make `pnpm run check:all` deterministic by resolving spill-directory portability, fixture cleanup, missing adapters, Playwright provisioning, expected request counts, and ignored build residue.

2. Update or regenerate the client and module graph evidence, then make the domain-graph violations conform to the declared package ownership rules.

3. Reconcile shell timeout documentation and add the required keyless recorded-session snapshot for the model-visible behavior change.

4. Decide and document the WebSocket close quiescence contract, symlink policy, HTTP bridge resource limits, and the fake WebSocket fixture behavior.

5. Correct or explicitly approve README channel differences, historical count provenance, customization-policy enforcement, upstream-master checking, and package repository metadata.

6. Rerun the focused gates and then `pnpm run check:all`; record the new commit, environment, and exact command results in the next dated audit.

-----

## Limitations

<a id="limitations"></a>

The audit did not change product source, tests, or generated documentation, and it did not run destructive cleanup of ignored build residue; findings about residue therefore remain based on observed filesystem state and gate behavior.

The conditional security findings depend on deployment or build-input capabilities that are not necessarily present in normal operation; they should be resolved according to the threat model rather than treated as confirmed exploitation.

### Dev Note

This report records the repository state and command evidence from 2026-09-20. Run a new dated audit after remediation instead of editing this historical record.
