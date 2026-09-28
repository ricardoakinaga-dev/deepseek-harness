---
name: audit-evidence
description: Coordinate a delegated DeepSeek Harness audit with revision-bound evidence reports and reconciled parent decisions. Use for multi-agent finding audits that need explicit source, test, dependency, runtime, or external evidence; ordinary code review uses dsh-code-review.
---

# Audit evidence

Use this workflow for a named audit with tracked findings. The live [record schemas](../../../scripts/audit-evidence/contracts.ts) own fields and status rules; read them before assigning work or writing JSON. [The worked example](references/example.md) shows report delivery and parent disposition for two findings.

## Establish the audit

Pin `auditId`, finding IDs, required scopes, `independentReviewer`, and the exact source revision in a `requirementsSchema` record before delegation. Use the commit SHA plus an identity for relevant uncommitted changes when the source is dirty; refresh evidence if either changes. Give each child the same audit ID and revision, a bounded set of finding/scope pairs, the source paths to inspect, and the report schema. A finding's status covers only its named scope at that revision.

Before treating missing credentials or a test failure as product evidence, inspect the **current source** that loads credentials and decides whether the target test runs. Name the actual provider and credential route in the search declaration; its `currentSources` must include the file that reads `credentialEnv`, and a literal key, account token, or credential service needs its own declaration. Check only credential presence and relevant configuration; keep values out of reports. Preflight the exact test command, working directory, dependencies, required fixtures, and environment variables against current scripts and test source. Record a check that cannot run as `NOT_RUN` or `BLOCKED`, with its reason; its scope remains pending.

Search incrementally: use `rg -n` over likely paths and patterns, then read bounded line ranges at the returned offsets. Expand to adjacent callers or later offsets only as needed. Capture the actual method performed, observed result, timestamp, revision, and a retrievable file/line, command/result, advisory, runtime, or external reference. Do not turn a proposed check into `PASS` evidence.

## Collect reports

Each child returns one strict `reportSchema` JSON record with `schemaVersion: 1`, `auditId`, `agentId`, `revision`, `observedAt`, and scoped `findings`. Each finding has `id`, `scope`, `status`, `confidence` (`high`, `medium`, or `low`), `summary`, `evidence[]`, and `limitations[]`. Evidence records identify `kind`, `outcome`, `reference`, `observedAt`, and `revision`; an executed test states its command and exit code, while a preflight-only record states its command and reason. `RESOLVED` requires matching successful evidence and excludes matching failed evidence; `OPEN` requires matching failed evidence and excludes matching successful evidence; `UNVERIFIED` and `BLOCKED` state a limitation. Use `PARTIAL` for mixed evidence that does not settle the scope. Preserve failed and unavailable observations.

For continuable children, request the complete JSON in `send_message` and persist the received record. For one-shot workflow children whose provider advertises `outputSchema`, pass [report-output.schema.json](../../../scripts/audit-evidence/report-output.schema.json) as the child request's `outputSchema`, persist `result.structured`, and validate it against `reportSchema`; an absent structured result is pending. The JSON Schema uses the workflow-supported subset to constrain fields and enum values; `reportSchema` also enforces timestamps, revision identity, evidence consistency, and test command/exit-code claims. Validate both delivery forms against the live parser and verify the audit ID and revision before reconciliation. A child message or prose summary alone does not establish a finding.

Obtain an independent **read-only** review in a fresh context without inherited audit conclusions. Give that reviewer the revision, every tracked finding, every required scope, and relevant source entry points; ask it to inspect the source and return a schema-valid report with direct references before seeing other reports. Save the review under the designated `independentReviewer` agent ID. Treat its report as another observation, not as an automatic verdict. The reconciler rejects a missing reviewer or an omitted required scope; the parent checks whether the reviewer truly used a fresh context and left the source unmodified. A reviewer unable to inspect a required scope reports it as `UNVERIFIED` or `BLOCKED` with a limitation.

## Decide and reconcile

Compare every required scope across child and reviewer reports. Investigate conflicting observations before a final claim. The parent records `decisionsSchema` with `parentAgentId`, one decision per tracked finding, cited `evidenceIds`, and `adjudications[]`. For a conflict or missing scope, the parent may settle it only with a new direct observation at the same revision and an adjudication naming the scope, rationale, and evidence. Otherwise choose `PENDING` and explain the unresolved scope. An unavailable required check is pending even when another scope passes.

Run `pnpm exec tsx scripts/audit-evidence/reconcile.ts --requirements <file> --reports <files...> --decisions <file> --require-closed` on the saved records. Resolve its reported gaps and conflicts, or carry them into the final result as pending. Exit 1 means valid records still have pending work; exit 2 means invalid records or an unsupported parent decision. Report only methods actually executed, each finding's decision and limitations, and the exact revision; do not present unavailable checks as completed.
