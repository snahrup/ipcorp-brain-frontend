# Lane 2: Today snapshot assembler

Owner: foundation_today_snapshot

Status: complete

Files: new `server/today-snapshot.mjs` and `server/today-snapshot.test.mjs` only.

Build a pure, versioned snapshot assembler that accepts already-collected Jira, Agent
Board, reconciliation, and loop results. It must preserve partial results, name failed
sources, and emit one snapshot ID and capture time. Do not edit the gateway or client.

## Result

- Added the pure snapshot assembler and gateway assembly checks.
- Preserved healthy, partial, unavailable, failed, and missing source results without
  hiding usable data.
- Wired `/api/today/snapshot` to one Jira read, one cache-only Agent Board read, saved
  reconciliation state, and loop state.
- Cut Today over to the single snapshot response. Refresh and polling each request one
  new snapshot.

Evidence: 9 focused Today server checks and 7 focused Today browser checks passed. The
live page completed one initial read and one manual refresh without a Microsoft request.
