---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-12-session-audit-facts

English | [中文](2026-10-12-session-audit-facts.zh.md)

## Summary

Records durable deliverable copies, launcher configuration facts, sandbox execution semantics, and confirmed local child authority.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-12-session-audit-facts
baseline: false
changes:
  - root: "event:deliverables/presented"
    previous: "2026-09-11-initial"
    after: "c2562179620a32b65cc7d1d163604db65c4332fd207e8d4e9b1bb1c48241ef1d"
    decision: same-version
  - root: "event:runtime/audit"
    previous: null
    after: "3816f7d08fae774bf2d0952c3fbc160f07a74af1490ab5e217e3452bc0907ffe"
    decision: same-version
  - root: "event:sandbox/environment"
    previous: null
    after: "0237cf86dfd53b683c593cedef2e36d1721787cc3af7bbc74249b98f0327c9d9"
    decision: same-version
  - root: "event:subagent/authority"
    previous: null
    after: "25cc6c357d85dc66217a19e4d95bd2aaa5032de5e3e36ee99667d0c956a86ff2"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing deliverable records remain valid because capture is optional; absence means that no immutable saved copy is recorded. Three new ordinary event roots are recognized by the installed reader. Readers predating these events reject them as unknown; these additions do not promise downgrade readability. Event envelopes and Session header version remain unchanged.

<a id="verification"></a>
## Verification

Focused deliverable and download tests: 54 passed. Sandbox provider and policy tests: 61 passed, plus 8 real bubblewrap cases. Settings audit tests: 57 passed, including configuration reload, exported values, and secret exclusion. Local child authority and inheritance tests: 47 passed. Recorded-session integration replay remains a separate required check.

<a id="dev-note"></a>
## Dev Note

None.
