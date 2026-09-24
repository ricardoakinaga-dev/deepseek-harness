# Agent Note: Enforce official mirror equality before custom-delta attribution

Status: implemented

English | [中文](2026-09-20-upstream-mirror-workflow-equality.zh.md)

## Problem

The customization workflow compared the custom delta with `origin/master` but did not fetch or verify that the fork mirror matched `deepseek-official/master`. A fork could therefore pass path attribution while its mirror branch diverged from the official source.

## Decision

The policy verifier accepts `--require-official-mirror`. In that mode it uses the configured official remote and URL, fetches the configured mirror branch, compares the fork remote's mirror ref with the official ref by exact commit ID, and fails before custom-delta attribution when the refs are missing or different. The workflow invokes this mode before the existing policy checks.

The verifier exports a pure equality check with matching, mismatched, and missing-ref fixtures. The correction remains `repository-automation` under the existing upstream-safe customization governance owner; it does not change runtime packages, released Session data, or publication identity.

## Alternatives considered

**Keep comparing only with `origin/master`.** Rejected because that proves attribution against the fork but not identity with the official source.

**Hardcode the official URL in the workflow.** Rejected because the policy record already owns repository identity and the workflow must fail when its configured remote differs.

**Compare ancestry instead of exact commit identity.** Rejected because the mirror contract requires the fork and official branch to resolve to the same commit, not merely to share history.

## Consequences

The workflow performs a read-only official fetch and rejects stale or diverged mirror refs with both ref names and commit IDs in the diagnostic. Offline fixtures protect the pure equality rule without depending on network state. A public official remote remains required for the workflow lane.

## Testing

The focused policy suite passes matching, mismatched, and missing-ref equality cases and asserts that the workflow invokes `--require-official-mirror`. The workflow-equivalent command, top-level customization verifier, paired documentation, note format, and whitespace checks are run after implementation.
