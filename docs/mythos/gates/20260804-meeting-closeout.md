# Frozen Acceptance Checks

Created: 2026-08-04 15:31 ET
Status: frozen

## Task summary

Add a meeting closeout experience to the existing Workbench Meetings page.

## User-visible outcome

The page loads today's meetings, lets Steve process one without typing its identity, falls back to a pasted Cluly transcript and optional notes when Teams capture is missing, shows a review package, and keeps that package visible after refresh.

## Non-goals

- No email is sent.
- No Jira issue is created or changed.
- No unrelated Workbench redesign.
- No rewrite of existing Brain records.

## Likely files

- `src/views/workbench/MeetingsWorkspaceView.tsx`
- `src/features/meeting-closeout/**`
- `server/meeting-closeout.mjs`
- `server/meeting-closeout-adapter.py`
- `server/jira-gateway.mjs`
- focused tests and styles

## Acceptance criteria

1. Today's meetings load from the fixed Microsoft 365 calendar route, with prepared Brain meetings as a truthful fallback.
2. Process requests Teams transcript, recap, recording notes, and related context for the selected meeting.
3. Missing capture opens a pasted-transcript form with optional context notes.
4. Processing creates review sections for Steve's commitments, Jira proposals, supporting material, document requests, reminder candidates, and draft email follow-ups.
5. Raw text, context, summary, review package, run report, infographic HTML, and CHANGELOG entry are written under the configured Brain root.
6. The completed package appears in the Workbench and survives a page reload.
7. No route sends email or changes Jira.
8. The unavailable-transcript fallback passes a browser click-through.

## Verification

- Focused Node tests with a temporary Brain root.
- TypeScript check, build, and lint.
- Playwright click-through with fixture-backed calendar and unavailable Teams capture.
- Direct local health plus the launched Workbench path.

## Risks

- Existing local edits in shared files.
- Slow Microsoft 365 jobs.
- Filename and path safety for Brain writes.

## Rollback

Remove only the new feature files and the narrow imports, route calls, and Meetings page insertion added for this work.

