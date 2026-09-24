# Agent Note: Canonical audit metrics and English-canonical community parity

Status: implemented

English | [中文](2026-09-21-canonical-audit-metrics-community-parity.zh.md)

## Problem

The audit program had exploratory source counts without a machine-readable corpus, fixed counting rules, or retained environment data. The English and Chinese root READMEs also advertised different community destinations, so a translation check could not distinguish an approved localization from drift.

## Decision

`pnpm run audit:metrics` emits a validated JSON document with schema version, revision, capture time, runtime environment, corpus manifest, and the named `deprecated_reader`, `lint_suppression`, `todo_marker`, `explicit_any`, and `selected_skip` counts. The corpus contains tracked source files under `packages/`, `apps/`, `scripts/`, `python/`, `native/`, and `benchmarks/`; it excludes generated, build, dependency, vendor, snapshot, and retained-artifact paths. Each count is a source-line match using the rule recorded beside the result, and the sorted file list is represented by a digest.

`README.md` owns the root community-channel list. `README.zh.md` translates that list and advertises the same three targets. `pnpm run verify-readme-community-parity` compares exact HTTP(S) targets in the two named sections and fails for a missing or locale-only target. The parity check is part of the documentation quick and full aggregates.

## Alternatives considered

**Keep the locale-only WeCom and WeChat destinations.** Rejected because the maintainer selected the English README as the canonical channel source and required exact localized parity.

**Use recursive workspace globs without a resolved corpus.** Rejected because generated files, vendored files, and untracked files make repeated counts incomparable.

**Publish independent count files without a shared schema.** Rejected because consumers could not verify the revision, environment, corpus, or counting rule attached to a result.

## Consequences

Static-debt trends are comparable only when the command, corpus, and counting rules remain unchanged; the metrics are line-based indicators rather than AST classifications. A change to the English community list requires the Chinese README and its pairing record to be updated, and the parity gate rejects an omission or an additional localized destination.

## Testing

The focused Vitest suite covers positive and negative metric fixtures, invalid retained output, exact target parity, missing targets, extra targets, and section termination. The command writes a retained JSON artifact when given `--output`; the parity command passes against the root README pair.
