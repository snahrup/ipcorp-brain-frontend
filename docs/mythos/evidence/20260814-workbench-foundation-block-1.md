# Workbench Foundation Block 1 Evidence

Completed: 2026-08-14 03:27 ET

Acceptance record: `docs/mythos/gates/20260814-024852-workbench-foundation-block-1.md`

## Result

The Workbench now has a restart-safe append-only state engine, one server-produced Today
snapshot, and a current architecture index. Automatic execution remains off.

The state engine provides versioned observations, work items, events, turn receipts,
verification evidence, approvals, and page snapshots. Production, development, and test
state roots are explicit. Test mode requires a temporary root and refuses the production
location.

Lease claim, renewal, and release are recorded in the event journal while a per-item
Windows file lock and the journal writer lock are held. Exact event retries return a
no-op result. Changed retries are recorded as conflicts and do not change replayed state.
Turn completion requires the six ordered successful phases in the acceptance record.

Today now reads `/api/today/snapshot` once per load or refresh. The server collects Jira,
the cache-only Agent Board, saved reconciliation state, and loop state under one snapshot
ID and capture time. A failed or partial source stays visible beside the healthy results.

The architecture index names the current Workbench product, runtime, data, meetings,
loop, design, launcher, and local-state documents. The donor matrix records useful prior
patterns and keeps LoopX as a reference only.

## Automated Evidence

- 12 consecutive Windows state-engine stress runs passed.
- 17 final state and Today server checks passed.
- 59 combined server checks passed earlier in the integration pass, covering state,
  Today, Agent Board, poll safety, and loop behavior.
- 7 focused Chromium Today checks passed.
- TypeScript passed.
- Focused Biome passed on every touched implementation, test, and architecture file.
- Node syntax check passed for `server/jira-gateway.mjs`.
- Production build passed. Vite still reports the existing large main-chunk warning.
- `git diff --check` passed with line-ending notices only.

The full `npm run lint` remains red because of existing repo-wide findings in
`scripts/generate-brain-graph.ts` and generated/data JSON files. That run reported 8
errors, 166 warnings, and 9 information messages. The files changed in this block pass
the focused check.

## Live Workbench Evidence

The gateway was restarted from the current checkout and
`GET http://127.0.0.1:8817/api/today/snapshot` returned HTTP 200 with one snapshot ID,
one capture time, and all four source observations readable.

The real page at `http://127.0.0.1:5217/` showed:

- 0 delivered today
- 0 working now
- 49 waiting on Steve
- 104 open Jira issues
- the saved reconciliation run as partial success with 3 failures
- loop mode off
- snapshot time Aug 14, 3:24 AM ET

The live desktop and 390-pixel phone checks had no console errors, failed requests, or
horizontal overflow. The initial load and manual refresh each made one Today snapshot
request. The browser made no Microsoft 365, Outlook, or Teams request. The global
activity dock continued its normal read-only reconciliation status polling.

Screenshot: `%TEMP%\ipcorp-workbench-today-live.png`

## Safety

No Jira item, email, Teams message, Outlook item, or Brain file was changed. No Microsoft
refresh was started. LoopX was not installed or run. The local gateway restart was the
only runtime change.

## Review

The fresh reviewer found and reproduced three state-engine issues during review: lease
and replay disagreement on changed event IDs, wrapper retries returning busy or missing,
and Windows `EPERM` lock contention. All three were fixed and covered by tests. The final
review passed with no remaining acceptance finding.

