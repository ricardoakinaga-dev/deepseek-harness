# Agent Note: Make standalone hygiene prerequisites explicit

Status: implemented

English | [中文](2026-09-20-hygiene-prerequisite-preflight.zh.md)

## Problem

The standalone `hygiene` aggregate consumed compiled JavaScript and declaration files without checking that a complete build had produced them. A fresh checkout therefore started several leaves in parallel and reported downstream missing-file errors instead of the required preparation command.

## Decision

`pnpm run hygiene` starts with `verify-hygiene-prerequisites`. The preflight scans vendor and workspace package manifests, checks their manifest-declared `lib/` JavaScript and declaration targets, and fails before the remaining hygiene leaves when an output is absent. Its diagnostic names the missing target and instructs the caller to run `pnpm run build`.

The preflight is specific to the standalone aggregate. `check:all` keeps its existing scheduler dependency from the hygiene artifact consumers to `build`, so the aggregate does not build twice and the ordering remains explicit.

## Alternatives considered

**Make standalone `hygiene` own `build`.** Rejected because this changes a validation command into an artifact-producing command and duplicates the build already owned by `check:all` and CI artifact lanes.

**Only document the existing prerequisite.** Rejected because the documented prerequisite was not enforced at the aggregate entry point and downstream diagnostics remained ambiguous.

## Consequences

Missing build output produces one early, actionable failure and no concurrent hygiene leaf begins. A complete checkout still runs the same hygiene checks with the existing worker cap. The preflight verifies file presence, while the downstream publication and NodeNext checks continue to own file validity and consumer compatibility.

## Testing

The preflight has fixture coverage for missing and complete manifest-declared outputs. The gate graph test pins the prerequisite as the only predecessor of every standalone hygiene leaf.
