# Workbench Today Freshness Review

Verdict: pass after fixes and final live proof

Reviewed at: 2026-08-13 22:47 ET

Reviewer role: Mythos reviewer

## Scope reviewed

- Acceptance notes: `docs/mythos/gates/20260813-212000-workbench-today-freshness.md`
- Lane notes:
  - `docs/mythos/lanes/20260813-212000-workbench-today-freshness-lane-1-read-model.md`
  - `docs/mythos/lanes/20260813-212000-workbench-today-freshness-lane-2-ticket-run-history.md`
  - `docs/mythos/lanes/20260813-212000-workbench-today-freshness-lane-3-live-proof.md`
  - `docs/mythos/lanes/20260813-213400-workbench-transcript-reconciliation-lane-4.md`
- Current diff for Today, Agent Board, ticket-run persistence, meeting closeout, gateway wiring, styles, and focused tests.

No live activity run was queried, resumed, stopped, or started during this review.
No Jira, Microsoft 365, Outlook, Teams, or Brain writes were made during this review.

## Findings

### P1: Today can still miss a same-title meeting that needs a capture

`server/agent-board.mjs` builds `packagesByTitle` from all stored packages using only the normalized meeting title, then skips any current calendar meeting whose title exists in that map. The match does not compare meeting date, start time, calendar id, or package meeting start.

Relevant lines:

- `server/agent-board.mjs:160-162`
- `server/agent-board.mjs:183-186`

This means a recurring meeting can be hidden from Today if an older package has the same title. I verified the behavior with a local one-line read-only repro:

```text
[["watching",[]],["working",[]],["waiting",[]],["delivered",[]]]
```

That input had an ended 2026-08-13 calendar event titled `Weekly Standup` and an older 2026-08-06 package with the same title. The board showed no waiting capture and no delivered item.

Why this matters: the user specifically asked for confidence that Today reflects meetings from today. This case makes Today look clean when a meeting may still need a transcript or closeout. The issue existed before this change, but this task makes Today depend on this board for the first visible freshness answer.

Suggested fix: match a package to a calendar event by same local meeting date plus title, or by calendar id when available. If only title matches but the dates differ, keep the current meeting visible as waiting or watching.

### P2: Final live-proof lane is still marked pending and current evidence is incomplete

The acceptance notes require one serialized activity run with a terminal receipt, source receipts, meeting results, MDM comparison, no Outlook draft delivery, and real desktop plus phone-width Today proof.

Relevant lines:

- `docs/mythos/gates/20260813-212000-workbench-today-freshness.md:56-62`
- `docs/mythos/lanes/20260813-212000-workbench-today-freshness-lane-3-live-proof.md:28-39`

The code and focused tests support most implementation claims, but the live-proof lane still says `Status: pending`, and there is no current evidence file for the final run receipt or browser proof. The handoff summary says those checks were in progress, not complete.

Suggested fix: once the exact saved activity run reaches a terminal status, record its receipt and desktop/mobile verification under `docs/mythos/evidence/`, then update lane 3.

## Acceptance comparison

| Check | Result | Evidence |
|---|---|---|
| 1. Today shows Jira read time and manual refresh rereads local sources | pass | `TodayView` reads Jira and current local state separately, with manual `load()` at `src/views/workbench/TodayView.tsx:252-280`. |
| 2. Today shows delivered, working, waiting counts and relevant titles | needs-changes | UI renders board lanes, but P1 can hide a current same-title meeting from waiting. |
| 3. Today states latest activity run and old-run state | pass | `TodayView` derives old run wording at `src/views/workbench/TodayView.tsx:361-374`. |
| 4. Today states loop mode and shadow observed-only language | pass | `TodayView` says shadow mode observed items and executed nothing at `src/views/workbench/TodayView.tsx:375-377` and following lines. |
| 5. Failed sources do not leave old success data visible | pass | `TodayView` clears failed source data and source problems are rendered from source errors at `src/views/workbench/TodayView.tsx:348-356`. |
| 6. Today cache reads do not request live Microsoft refresh | pass | `readBoard()` calls `${GATEWAY}/agent-board` without `refresh=1` at `src/views/workbench/TodayView.tsx:103-120`; focused Playwright tests assert no `refresh=1`. |
| 7. Ticket-agent summaries survive restart without raw prompt/output fields | pass | `agent-dispatch` allowlists summary fields and excludes raw messages unless live public messages are explicitly requested; focused tests passed. |
| 8. One serialized activity run finishes safe refresh | needs-changes | Required by notes, but lane 3 is still pending and no terminal receipt evidence is present in Mythos docs. |
| 9. Real desktop and phone-width Today proof | needs-changes | Focused Playwright phone-width coverage exists, but final live desktop and phone proof is not recorded in current evidence docs. |
| 10. Checks and baseline failures documented | partial | Focused server tests passed in this review. Handoff says typecheck/build passed and full test failures were baseline, but the final evidence file is missing. |
| 11. Discover stored transcript sources and include incoming capture | pass | `discoverStoredTranscriptSources` and incoming source combination at `server/meeting-closeout.mjs:732-855`. |
| 12. Exclude unusable captures before comparison | pass | `selectTranscriptSources` filters unusable captures at `server/meeting-closeout.mjs:774-792`. |
| 13. Consolidate different usable sources through model cleanup | pass | Consolidation prompt and parse path at `server/meeting-closeout.mjs:795-844`. |
| 14. Saved context artifact names sources and keeps originals | pass | Source receipts and hash-suffixed conflict writes at `server/meeting-closeout.mjs:878-950`. |
| 15. Reprocessing replaces stale closeout sections | pass | Closeout section removal and rewrite at `server/meeting-closeout.mjs:1487-1515`. |

## Checks run by reviewer

```powershell
node --test server/agent-board.test.mjs server/agent-transcript.test.mjs server/meeting-closeout.test.mjs server/meeting-closeout-gateway.test.mjs
```

Result: pass, 72 tests passed, 0 failed.

Read-only repro for P1:

```powershell
node --input-type=module -e "import { buildAgentBoard } from './server/agent-board.mjs'; const board=buildAgentBoard({now:new Date('2026-08-13T18:00:00-04:00'), calendar:{ok:true,meetings:[{id:'evt-2',title:'Weekly Standup',start:'2026-08-13T16:00:00-04:00',end:'2026-08-13T17:00:00-04:00'}]}, packages:{ok:true,items:[{id:'pkg-old',meeting:{title:'Weekly Standup',start:'2026-08-06T16:00:00-04:00'},createdAt:'2026-08-06T22:00:00.000Z',commitments:[]}]}, activityState:{ok:true,state:{runs:[],applyReceipts:{}}}, agentRuns:{ok:true,items:[]}, brainCompletions:{ok:true,items:[]}}); console.log(JSON.stringify(board.lanes.map(l=>[l.id,l.cards.map(c=>c.title)])));"
```

Result: reproduced hidden current meeting.

## Positive review notes

- Transcript reconciliation is materially better than the previous same-name collision behavior. It keeps originals, writes one consolidated context artifact, and records source receipts with hashes.
- Verified infographic listing is strict enough to avoid treating a standalone PNG as complete. It requires `status.json`, a completed status, artifact id, at least two source ids, output filename, hash match, readable PNG, and a verification value.
- Ticket-run summaries now live outside the repo and are reduced to an allowlisted public shape, which avoids the reload-trigger problem and raw prompt leakage risk.
- Today does not call the live Board refresh path from initial load or the 60 second reread path.

## Residual risks

- The verification field in infographic `status.json` is only checked for non-empty text. If future status files record a failed verification in that field while also saying the run completed, Today may still display it. Consider checking the exact accepted verification values when the status schema is settled.
- The full Playwright suite has known baseline failures from older expectations. This change should not be accepted as fully proven until the final evidence file states the exact baseline and the current focused pass.
- `playwright-report/index.html` and `test-results/.last-run.json` are changed by test execution. They are generated artifacts and should not be mixed into the product diff unless intentionally kept as evidence.

## Final re-review, 2026-08-13 23:08 ET

The recurring-meeting finding was fixed by matching calendar id and local meeting day,
with title plus local day as the fallback. A regression test now proves that an older
same-title package cannot hide today's meeting.

The saved activity run reached a terminal `partial_success` result. Its receipt records
1,480 observed items, three repaired meetings, two honest partial meetings, 25 Jira
proposals, four email drafts, two MDM corrections, and no executed change. The final
gateway restart loaded the new Agent Board behavior and retained loop mode `shadow`.

Fresh checks passed:

- 74 focused server tests
- 7 focused Today Chromium tests
- TypeScript
- production build
- focused Biome
- live desktop and phone proof with no browser errors, failed requests, or overflow

The Today header now says `Current` and names Jira, Agent Board, and local status instead
of showing the prepared-snapshot label on this live-read page. Evidence is recorded in
`docs/mythos/evidence/20260813-workbench-today-freshness.md`.
