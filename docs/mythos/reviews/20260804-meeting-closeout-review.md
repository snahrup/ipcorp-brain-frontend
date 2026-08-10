# Meeting Closeout Review

Verdict: needs-changes

## Findings

1. High: Brain persistence skips the required MANIFEST update.
   The source Brain instructions require every Brain file alteration to append CHANGELOG and record staged-but-unwritten files in MANIFEST (`C:\Users\snahrup\OneDrive - IP-Corporation\ipcorp-architecture-brain\AGENTS.md:206`). The closeout write path creates transcript, summary, task spec, infographic, run report, processed log, and CHANGELOG entries (`server/meeting-closeout.mjs:763`, `server/meeting-closeout.mjs:764`, `server/meeting-closeout.mjs:765`, `server/meeting-closeout.mjs:773`, `server/meeting-closeout.mjs:778`), but there is no MANIFEST read or write in the persistence flow (`server/meeting-closeout.mjs:706`). This leaves the Brain bookkeeping incomplete for every successful package.

2. Medium: Non-closeout Jira write routes are mixed into the reviewed gateway diff.
   The closeout acceptance checks say no Jira issue is created or changed (`docs/mythos/gates/20260804-meeting-closeout.md:16`, `docs/mythos/gates/20260804-meeting-closeout.md:38`). The gateway diff for this slice also contains attachment upload and delete routes (`server/jira-gateway.mjs:2134`, `server/jira-gateway.mjs:2160`) and a subtask apply route that calls `createSubtasks` (`server/jira-gateway.mjs:2170`, `server/jira-gateway.mjs:2178`). These are outside the closeout feature and create live Jira write surface in the same change set, so the review-only claim is harder to verify and the risk belongs in a separate reviewed slice.

3. Medium: Closeout verification evidence is not recorded.
   The acceptance checks call for Node tests, typecheck, build, lint, Playwright, direct local health, and launched Workbench verification (`docs/mythos/gates/20260804-meeting-closeout.md:41`). `docs/mythos/commands.md` lists the intended closeout commands (`docs/mythos/commands.md:3`), but `docs/mythos/evidence` has no meeting-closeout evidence file, and the existing evidence file is for daily meeting prep only (`docs/mythos/evidence/20260804-daily-meeting-prep.md:1`). The lane notes still say server is in progress and UI is pending (`docs/mythos/lanes/20260804-meeting-closeout-lane-1-server.md:9`, `docs/mythos/lanes/20260804-meeting-closeout-lane-2-ui.md:9`), and the handoff says closeout is in progress (`docs/mythos/handoff.md:3`). The code may work, but the required evidence trail does not support a pass yet.

## Notes

- The closeout page does automatically request `/api/meeting-closeout/today` and `/api/meeting-closeout/packages` on mount (`src/features/meeting-closeout/MeetingCloseoutPanel.tsx:344`).
- The pasted transcript fallback is wired after `transcript_unavailable` (`src/features/meeting-closeout/MeetingCloseoutPanel.tsx:409`, `src/features/meeting-closeout/MeetingCloseoutPanel.tsx:512`).
- The package UI shows all required review sections and marks email and Jira as unchanged (`src/features/meeting-closeout/MeetingCloseoutPanel.tsx:249`, `src/features/meeting-closeout/MeetingCloseoutPanel.tsx:241`).
