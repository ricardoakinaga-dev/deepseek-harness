# Builder source review

Read only this assignment, `a24-03.ts`, `a24-03.test.ts`, and `a24-07.ts` with `read`. Check the dependency path using exactly `if test -e a24-07.dependency.ts; then echo DEPENDENCY_PRESENT; else echo DEPENDENCY_MISSING; fi` in `bash`. Do not list files, read another report, run the test, or contact a provider. Write the report with `file_path` exactly `web.json` (a relative path) and return only that filename after `write` succeeds.

Assess three scopes independently from the observed files:

| Finding | Scope | Builder criterion |
| --- | --- | --- |
| A24-03 | source | Does the exported `readiness()` satisfy the narrow source API of returning a boolean readiness signal? Judge the source declaration, not a production readiness guarantee. |
| A24-03 | test | What can reading the test source establish without executing a test command? |
| A24-07 | source | For an integrated source path, does the exported dependency reference resolve to a sibling source file? |

Use `schemaVersion: 1`, `auditId: audit-keyless`, `agentId: web`, `revision: 2c3281fed6df8416b60d8046ec59b5cb2cc62f06402d1c0e33beafa12ab8b392`, and `observedAt: 2026-09-28T12:00:00Z`. The JSON object has a `findings` array. Each finding has separate `id`, `scope`, `status`, `confidence`, `summary`, `evidence`, and `limitations` fields. Choose each status from `RESOLVED`, `OPEN`, `PARTIAL`, `UNVERIFIED`, or `BLOCKED` based on your criterion and observation; use `confidence: medium`. The finding id is `A24-03` or `A24-07`, while `scope` is a separate field.

For source scopes use one `source-read` evidence item. Use outcome `PASS` when the named criterion is satisfied and `FAIL` when it is not. For the test scope use one `test-run` evidence item: its outcome must reflect whether a command actually ran. Do not claim a test passed from reading its source. Every evidence item needs a unique `id`, `kind`, `outcome`, `reference`, `observedAt`, and `revision`; prefix each evidence `id` with `web-` so it remains distinct across agent reports. Use the report timestamp and revision. Name the inspected relative file in `reference`. When a check did not run, omit `command` and `exitCode` and give the finding a concrete limitation. Use `[]` for limitations when there is no limitation.

Apply the same evidence-to-status rule to any finding: an observed `source-read` `PASS` maps to `RESOLVED`; an observed `source-read` `FAIL` maps to `OPEN`; a `test-run` `NOT_RUN` maps to `UNVERIFIED`. `RESOLVED` requires matching `PASS` evidence, and `OPEN` requires matching `FAIL` evidence. Decide the evidence outcome from the file inspection before applying this rule; no outcome is assigned in advance.
