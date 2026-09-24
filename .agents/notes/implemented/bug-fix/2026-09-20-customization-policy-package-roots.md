# Agent Note: Reject package roots on non-packaged extension records

Status: implemented

English | [中文](2026-09-20-customization-policy-package-roots.zh.md)

## Problem

The customization-policy verifier validated `packageRoots` only when an extension solution type shipped package source. It silently accepted the field on `configuration`, `profile-patch`, and `skill` records, so a non-packaged record could claim package-source ownership without an invalid-fixture failure.

## Decision

The verifier rejects `packageRoots` whenever an extension uses `configuration`, `profile-patch`, or `skill`. Packaged extension types continue to require non-empty `packages/<...>/` roots, and existing records without the field remain valid. The focused policy suite contains one invalid fixture for each non-packaged solution type and retains the packaged-extension positive fixture.

The change remains `repository-automation` under the existing upstream-safe customization governance owner. It changes policy validation and its tests only; no runtime package, profile, or released Session data changes.

## Alternatives considered

**Ignore the field on non-packaged solution types.** Rejected because an ignored ownership field creates a false-green policy record.

**Allow non-packaged records to declare package roots.** Rejected because configuration, profile-patch, and skill records do not own package source and must remain removable without package-source attribution.

## Consequences

Policy records now fail at validation when a non-packaged extension claims package roots. The diagnostic names the record, field, solution type, and required correction. Packaged extensions retain the source-containment check that compares changed paths with their declared roots.

## Testing

The focused policy suite passes the existing positive and invalid classification cases plus three new forbidden-packageRoots cases. The top-level verifier and customization ownership check pass after the rule and fixtures are updated.
