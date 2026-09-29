---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-29-goal-required-task-manifest

English | [中文](2026-09-29-goal-required-task-manifest.zh.md)

## Summary

Persist required-task manifests in goal change payload version 2.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-29-goal-required-task-manifest
baseline: false
changes:
  - root: "event:goal/change"
    previous: "2026-09-11-initial"
    after: "85a122f576169e68e7896fd5b8d78b6aad15fcd82ebc47fd493ad3a14f6aa041"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Released version 1 payloads remain structurally unchanged and readable. Current writers emit version 2, whose snapshots add an optional task manifest so edits to historical goals remain representable. A human can establish the first scope on a historical manifestless goal; that version 2 snapshot records an empty `originalRequiredTasks`, one explicit scope revision, and pending tasks. Current readers accept version 1 and version 2, with or without a manifest. Older readers may reject version 2; the Session header remains V4.

<a id="verification"></a>
## Verification

GoalService, tool-goal, command-goal, and command-runtime focused tests cover version 1 replay, version 2 writes, task acceptance reset after objective edits, and command-definition authority.

<a id="dev-note"></a>
## Dev Note

None.
