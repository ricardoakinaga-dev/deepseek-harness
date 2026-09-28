# Example: A24-03 and A24-07

These invented records demonstrate a source disagreement and an unavailable test. The revision, file paths, and observations are illustrative; replace them with current source evidence for a real audit. Save each JSON object as a separate file before reconciliation.

`requirements.json`:

```json
{"schemaVersion":1,"auditId":"A24","revision":"0123456789abcdef","independentReviewer":"reviewer","findings":[{"id":"A24-03","requiredScopes":["source"]},{"id":"A24-07","requiredScopes":["test"]}]}
```

`child-a.json` says its source read found the credential path and its test preflight could not run the target test:

```json
{
  "schemaVersion": 1,
  "auditId": "A24",
  "agentId": "child-a",
  "revision": "0123456789abcdef",
  "observedAt": "2026-09-28T12:00:00Z",
  "findings": [
    {"id":"A24-03","scope":"source","status":"RESOLVED","confidence":"high","summary":"Credential path is present in the inspected branch.","evidence":[{"id":"a-source","kind":"source-read","outcome":"PASS","reference":"example/credential-loader.ts:12","observedAt":"2026-09-28T11:58:00Z","revision":"0123456789abcdef","note":"Read the credential lookup and its caller."}],"limitations":[]},
    {"id":"A24-07","scope":"test","status":"UNVERIFIED","confidence":"low","summary":"The selected test was unavailable after command and environment preflight.","evidence":[{"id":"a-test","kind":"test-run","outcome":"NOT_RUN","reference":"example/test-command.txt","observedAt":"2026-09-28T11:59:00Z","revision":"0123456789abcdef","command":"pnpm run test:e2e -- example.spec.ts","note":"Required test environment variable is absent; value was not inspected."}],"limitations":["The test result is pending until its required environment is available."]}
  ]
}
```

`reviewer.json` is a fresh, read-only review that disagrees on `A24-03`:

```json
{"schemaVersion":1,"auditId":"A24","agentId":"reviewer","revision":"0123456789abcdef","observedAt":"2026-09-28T12:02:00Z","findings":[{"id":"A24-03","scope":"source","status":"OPEN","confidence":"high","summary":"The reviewer reads the caller as bypassing the credential lookup.","evidence":[{"id":"r-source","kind":"source-read","outcome":"FAIL","reference":"example/credential-caller.ts:26","observedAt":"2026-09-28T12:01:00Z","revision":"0123456789abcdef"}],"limitations":[]},{"id":"A24-07","scope":"test","status":"UNVERIFIED","confidence":"low","summary":"The required test did not run.","evidence":[{"id":"r-test","kind":"test-run","outcome":"NOT_RUN","reference":"example/test-command.txt","observedAt":"2026-09-28T12:01:00Z","revision":"0123456789abcdef","command":"pnpm run test:e2e -- example.spec.ts","note":"Prerequisite is unavailable."}],"limitations":["No test execution was observed."]}]}
```

The parent reads both paths at the same revision, records its own direct observation for the disputed scope, and leaves `A24-07` pending:

`decisions.json`:

```json
{
  "schemaVersion": 1,
  "auditId": "A24",
  "parentAgentId": "parent",
  "revision": "0123456789abcdef",
  "decisions": [
    {"id":"A24-03","status":"RESOLVED","rationale":"The parent traced the caller into the credential lookup at this revision; the reviewer's bypass reading does not match that path.","evidenceIds":["a-source","r-source","p-source"],"adjudications":[{"scope":"source","rationale":"The caller reaches the inspected lookup before the operation.","evidence":{"id":"p-source","kind":"source-read","outcome":"PASS","reference":"example/credential-caller.ts:26 and example/credential-loader.ts:12","observedAt":"2026-09-28T12:04:00Z","revision":"0123456789abcdef"}}]},
    {"id":"A24-07","status":"PENDING","rationale":"The required test could not run with the available environment.","evidenceIds":["a-test"],"adjudications":[]}
  ]
}
```

Run `pnpm exec tsx scripts/audit-evidence/reconcile.ts --requirements requirements.json --reports child-a.json reviewer.json --decisions decisions.json --require-closed` on the saved files. The reconciler returns exit code 1 because the required test remains pending.
