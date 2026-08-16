# Lane 1: Current Workbench Read Model

## Purpose

Create the smallest shared, read-only client model for Agent Board, activity, and loop
state used by Today.

## In scope

- shared types and read helpers
- Today data loading and refresh behavior
- explicit failure handling and timestamps

## Out of scope

- Microsoft refresh requests
- Jira, email, Teams, meeting, or Brain writes
- loop execution changes

## Dependencies

Existing `/api/agent-board`, `/api/work/activity-reconciliation/status`,
`/api/loop/status`, and `/api/jira/initiative` responses.

## Verification expectations

Focused component or Playwright checks prove one cache-only request per source, accurate
timestamps, and unavailable states.

## Owner role

builder

## Status

complete

## Implementation notes

- `src/views/workbench/TodayView.tsx` now reads Jira, cached Agent Board, current
  activity reconciliation status, and loop status as separate sources.
- Automatic rereads use cache-only `GET /api/agent-board`. Manual Refresh Today rereads
  the same local sources and Jira. No Today path appends `?refresh=1`.
- Failed source reads clear their section and show a source problem instead of leaving
  old success-looking data on the page.
- The day clock is stateful and updates after mount, so due buckets and "changed today"
  text do not stay pinned to the day the tab opened.
- `src/App.css` adds the compact blue/white current-work panel and a one-column phone
  layout.
- `tests/smoke.spec.ts` adds fixtures for Board, loop, and activity status plus a
  focused check for delivered work, waiting work, stale activity, shadow observed-only
  wording, and no `agent-board?refresh=1` request.

## Verification evidence

- `npm run typecheck` passed.
- `npx biome check src\views\workbench\TodayView.tsx tests\smoke.spec.ts --max-diagnostics=80`
  passed.
- `npx playwright test tests/smoke.spec.ts --project=chromium` passed: 9 tests.
- `npx biome check src\views\workbench\TodayView.tsx tests\smoke.spec.ts src\App.css`
  still reports pre-existing App.css warnings outside the lane change; touched TypeScript
  files are clean.
