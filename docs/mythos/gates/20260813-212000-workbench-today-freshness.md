# Workbench Today Freshness

## Task summary

Make the default Today page an honest, compact view of what is current across Jira,
meeting closeout, activity reconciliation, ticket-agent runs, and the local loop. Then
bring the saved activity state through today with one serialized read run.

## User-visible outcome

Opening Today answers four questions without requiring a trip through the rest of the
Workbench:

1. When Jira was last read and whether MT changed today.
2. What finished today, with direct links when a real target exists.
3. What is running or waiting for Steve.
4. Whether the local loop is acting, observing only, stopped, or unreadable.

Completed ticket-agent work remains visible after the local gateway restarts.

## Non-goals

- No Jira change is applied.
- No email or Teams message is sent.
- No Outlook draft is created by the activity refresh.
- No loop class is promoted to automatic execution.
- No page-load or timer starts a Microsoft 365 request.
- No unrelated visual redesign or data-model refactor.

## Likely files in scope

- `src/views/workbench/TodayView.tsx`
- `src/App.css`
- `src/views/workbench/agent-board-model.ts` or a small shared read helper
- `server/agent-dispatch.mjs`
- `server/jira-gateway.mjs`
- focused server and Playwright tests
- current Mythos state, evidence, review, and handoff files

## Acceptance checks

1. Today shows the Jira `fetchedAt` time and offers a manual refresh that rereads Jira,
   cached Agent Board state, current reconciliation state, and loop state.
2. Today shows Delivered today, Working now, and Waiting on Steve counts from the Agent
   Board, plus the titles of the most relevant delivered and waiting items.
3. Today states the latest activity reconciliation time and outcome. A run older than
   today is visibly old.
4. Today states loop mode. Shadow mode explicitly says it observed work and executed
   nothing.
5. Today declares failed or unreadable sources. It never keeps an old success-looking
   summary after a read fails.
6. Opening Today and its automatic cache rereads never request
   `/api/agent-board?refresh=1` and never start a Microsoft 365 request.
7. Ticket-agent completion summaries survive a gateway restart and expose only the
   fields needed by the board, never raw prompts, raw output, or hidden reasoning.
8. One serialized activity run reads the selected current sources, processes ready
   meetings, performs the stale-ticket review and MDM comparison, and skips Outlook
   draft delivery. Jira output remains review-only.
9. The real desktop and phone-width Today page visibly show current state and remain
   usable without horizontal overflow.
10. Focused tests, TypeScript, Biome, production build, and the full local CI command
    either pass or every unrelated pre-existing failure is documented with a baseline.

## Verification

- Focused server tests for archived ticket-agent summaries and Agent Board assembly.
- Focused Playwright checks for Today success, stale, unreadable, loop-off, desktop, and
  phone-width states.
- Network assertion that Today never calls `agent-board?refresh=1`.
- `npm run typecheck`
- focused `npx biome check` on touched files
- `npm run build`
- `npm run ci`
- direct local reads from ports 5217 and 8817 after the final gateway restart
- live browser inspection of Today at desktop and mobile widths
- exact saved activity-run receipt after the serialized refresh finishes

## Risk notes

- A landing-page refresh must not recreate the billed fifteen-minute Microsoft polling
  failure.
- Shadow decisions are observations, not completed work.
- Archived run files can contain raw output. Only a small summary may reach the API.
- The shared checkout may change during the task. Preserve unrelated edits and recheck
  status before every write or commit.
- Meeting processing may create local Brain artifacts. The live run must remain
  serialized and its receipts must be inspected before any retry.

## Rollback

- Revert the Today UI and archived-summary code changes.
- Leave the saved activity receipt intact as evidence of what actually ran.
- No Jira, email, or Teams rollback should be needed because those writes are excluded.

## Created

2026-08-13 21:20 ET

## Frozen status

Frozen before implementation. Changes require a timestamped amendment with the reason.

## Amendment 2026-08-13 21:34 ET

Steve clarified how transcript collisions must work while the live catch-up run was
processing meetings. When several transcript files describe the same meeting, the
Workbench must compare every usable source, discard filler and failed captures, merge
complementary details, remove duplication and noise, and save one comprehensive meeting
context artifact with source receipts. Existing source files remain intact. A different
file must no longer stop closeout processing.

Added acceptance checks:

11. Meeting closeout discovers matching transcript files across the supported transcript
    folders and includes the incoming capture as another source.
12. Clearly unusable captures are excluded before comparison.
13. Different usable sources are consolidated through a model-written cleanup pass that
    preserves uncertainty and never invents missing words.
14. The saved context artifact names every source used, preserves the source files, and
    becomes the transcript reference for the refreshed meeting package.
15. Reprocessing replaces the Workbench closeout section and its package marker instead
    of stacking another stale marker.
