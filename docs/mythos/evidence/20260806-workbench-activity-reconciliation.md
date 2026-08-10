# Workbench activity reconciliation evidence

## Result

The Workbench activity reconciliation feature is implemented on the Work screen. It is
user-started, saved, incremental, cancelable, resumable, review-first, and limited to one
active run in the local gateway process.

## Implemented areas

- `server/activity-reconciliation/` owns saved run state, source windows, evidence identity,
  Jira association, proposals, apply receipts, cancellation, resume, and recap data.
- `server/m365-reconcile.py` accepts the fixed source window and returns separate Outlook,
  Teams, and ready-meeting streams with truthful source states.
- `server/meeting-closeout.mjs` inspects and repairs each missing meeting piece instead of
  treating a summary marker as full completion.
- `server/meeting-infographic-renderer.mjs` renders the saved meeting infographic PNG.
- `server/jira-gateway.mjs` mounts status, start, stop, resume, recap, and Jira apply routes.
- `src/features/activity-reconciliation/` provides the Work panel and all visible states.
- `src/features/jira/JiraWorkSurface.tsx` adds the Work screen entry point without changing
  existing Jira layouts.

## Observable behavior

- Opening Work does not start source reads. Selecting `Reconcile activity` checks saved
  status, then creates a new run or resumes the stopped run without a second start action.
- The first run reads from 2026-01-01 through the captured run start time.
- Later runs use each source's last successful position minus 15 minutes and include a
  7-day late-item sweep.
- Evidence after the captured run start is deferred. A source position cannot move past
  that time.
- Stable source identities prevent repeat proposals. Content changes create a new evidence
  version while preserving history.
- Outlook received, replied, and sent activity are separate sources. Teams channel, group,
  and direct messages are separate sources. Ready meetings and Brain updates are separate
  sources.
- Direct and previously saved Jira links can associate exactly. Quoted, forwarded, copied,
  attached, or unclear keys require target review. Similarity remains review-only.
- No-op comments, worklogs, status changes, and closure proposals are removed.
- Jira create and update proposals show reason, confidence, evidence receipt, current state,
  and exact proposed changes. Apply requires selected proposals plus an exact typed phrase.
- Email follow-ups are drafts only.
- The running view shows phase, per-source counts, elapsed time, current activity, Stop,
  Resume, and source-specific failures.
- The recap shows only changes, proposals, and failures. It does not list unchanged items.
- Meeting recovery checks every expected file, record, association, and log entry. Completed
  unchanged meetings are skipped without writes.
- Before a meeting write, the service reads the Brain instructions, dated change history,
  and every open MANIFEST row. It stops before writing when an unresolved file change is
  still pending.
- Raw meeting text is not written to the saved activity state.

## Verification results

### Server and integration

Command:

```text
node --test server/activity-reconciliation/*.test.mjs server/meeting-closeout.test.mjs server/meeting-closeout-gateway.test.mjs
```

Result: 26 passed, 0 failed. Coverage includes first run, later overlap, duplicate
suppression, changed evidence, fixed run end, source failure positions, Stop and Resume,
simultaneous apply calls, quoted Jira keys, no-op suppression, Brain metadata reads,
interrupting an active Microsoft 365 child process, meeting-derived review output, partial
meeting repair, pending MANIFEST work, and the pasted meeting path against a temporary
Brain.

### Browser

Command:

```text
npx playwright test tests/activity-reconciliation.spec.ts
```

Result: 10 passed across Chromium and Firefox. The checks cover visible progress,
partial source failure, typed Jira approval, apply receipts, draft email output, Stop and
Resume with the same ID, reduced motion, phone overflow, loading, unavailable status,
completed empty output, and a recap with no unchanged rows.

### Code checks

The following passed:

```text
npm run typecheck
npm run build
npx biome check server/activity-reconciliation server/meeting-closeout.mjs server/meeting-closeout.test.mjs server/meeting-closeout-gateway.test.mjs server/meeting-infographic-renderer.mjs server/jira-gateway.mjs src/features/activity-reconciliation src/features/jira/JiraWorkSurface.tsx tests/activity-reconciliation.spec.ts
python -m py_compile server/m365-reconcile.py
node --check server/jira-gateway.mjs
git diff --check
```

The production build retains the existing large-chunk warning. It does not stop the build.

The full repository lint command still reports existing findings in
`scripts/generate-brain-graph.ts`. The full 124-test browser run still has 12 failures in
the agent transcript, Jira modal smoke, and Workbench agent registry areas. Those files and
checks are outside this feature. The focused activity suite passes all 10 checks.

### Real read-only checks

- The local launcher path returned healthy frontend and gateway responses on ports 5217
  and 8817.
- The app launcher restarted only the gateway after the final server fix. The refreshed
  gateway returned its expected health payload, the frontend returned HTTP 200, and the
  activity status remained empty.
- The real Work screen loaded its Jira data, showed `Reconcile activity`, made zero activity
  reconciliation requests on page open, and logged no browser error. The direct status read
  reported no saved run.
- A narrow Microsoft 365 read returned healthy empty results for all seven Microsoft 365
  streams with the same confirmed-through time.
- A real Jira GET returned 376 issues. No Jira write route was called.
- The real Brain reader returned metadata records from dated change rows, processed rows,
  structured project records, meeting packages, work artifacts, and infographic status
  files without returning private file bodies.

## Safety evidence

- The live browser check stopped before selecting `Reconcile activity` because that action
  now starts or resumes work.
- The live status response was `ok: true` with no saved run.
- Tests used temporary state files and a temporary Brain root.
- No email send route was called.
- No Jira mutation route was called against the real Jira site.
- No real meeting was processed.
- No real Brain file was created or changed.
- Raw meeting text is tested as absent from saved activity state.

## Residual notes

- The narrow live Microsoft 365 window contained no activity. It proved connector health,
  not a full real baseline.
- A full real baseline was intentionally not run because it could process a ready meeting
  and write Brain files.
- Saved writes are serialized inside the current single local gateway process. A future
  multi-process service needs shared write coordination.
- The checkout contains unrelated work from other sessions. No cleanup, staging, or commit
  was performed.
