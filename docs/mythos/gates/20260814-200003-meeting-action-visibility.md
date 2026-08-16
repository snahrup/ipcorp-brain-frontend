# Meeting Action Visibility

Created: 2026-08-14 20:00 ET

Frozen status: implementation may begin.

## Task summary

Meeting follow-ups currently render as static prose. The data export drops Jira keys, has no
stable action identity, and the modal does not read the cached Agent Board. This increment
connects the meeting record to the truthful Jira and work-run evidence that already exists.

## User-visible outcome

Each meeting follow-up shows:

1. Its stable action identity in the data model.
2. A real Jira link when the closeout package names an existing issue.
3. The current cached Agent Board state when a linked ticket agent or meeting commitment
   card exists.
4. A direct statement when no Jira issue or autonomous run is linked.
5. Source-unavailable state when the cached board cannot be read.

## Non-goals

- Do not create or change Jira issues in this increment.
- Do not start an autonomous run from the modal yet.
- Do not start a Microsoft 365 read when the modal opens.
- Do not infer a Jira key from prose.
- Do not present queued, running, or completed work without saved evidence.

## Likely files

- `scripts/brain-sources.mjs`
- `scripts/brain-sources.test.mjs`
- `src/types/brain.ts`
- `src/components/drawer/MeetingDetail.tsx`
- `src/components/drawer/meeting-infographic.css`
- `src/features/meeting-actions/meetingActionState.ts`
- `tests/meeting-action-status.spec.ts`

## Acceptance criteria

1. Exported follow-ups retain a valid direct Jira key from the meeting closeout package.
2. Every exported follow-up has a stable action ID derived from meeting ID, kind, and
   normalized content.
3. Rebuilding unchanged source data produces the same action IDs.
4. The modal reads only the cached Agent Board route.
5. A linked Jira key renders as a real `ip-corporation.atlassian.net` link.
6. A running ticket-agent card renders as running with its latest truthful detail.
7. A delivered ticket-agent card renders as completed with its saved detail.
8. A meeting commitment card renders its waiting state and evidence.
9. A follow-up with no linked Jira or run says both are not linked or not started.
10. A failed board read is visible and does not erase the follow-up text.
11. The modal remains keyboard usable and contained at phone width.
12. No Jira, Microsoft 365, Brain, email, or Teams effect occurs during verification.

## Verification

- `node --test scripts/brain-sources.test.mjs`
- `npm run sync:data`
- `npm run typecheck`
- `npx biome check` on the touched source and test files
- Focused Playwright checks in Chromium and Firefox
- Production build
- Fresh review against this file

## Risks

- Title matching could link the wrong action. It is prohibited. Join only by stable meeting
  identity, explicit Jira key, or Agent Board reference.
- The Agent Board may be unavailable. The modal must state that instead of showing stale
  success.
- The shared checkout is dirty. Touch only the named files and preserve all other edits.

## Rollback

Remove the new presentation component and optional fields. The existing static follow-up
text remains available from the unchanged closeout package.
