# Workbench Today Freshness Evidence

## Outcome

The live Today page now combines the current Jira read, cached Agent Board, saved
activity run, persisted ticket-agent history, and local loop status. It labels the
header `Current` on Today and leaves prepared-snapshot wording on the prepared knowledge
views.

At the final live check, Today showed:

- 10 delivered today
- 0 working now
- 49 waiting on Steve
- 104 open Jira issues
- activity reconciliation: partial success
- loop: shadow, 64 items observed today, nothing executed

Delivered and waiting previews link to Agent Board when more than two cards exist. The
Agent Board included every verified meeting infographic finished today, the saved
activity result, stored meeting packages, all review items, and seven restored ticket
agent runs. The count rose from 8 to 10 during final review when the scheduled Brain pass
finished and verified the Fabric Bi-Weekly and Programs, Projects and Tasks infographics;
MDM Projects also moved from pending to a verified infographic with two review notes.

## Saved activity receipt

- Run: `activity-20260814011850-0e48fb03`
- Started: `2026-08-14T01:18:50.390Z`
- Finished: `2026-08-14T02:58:01.745Z`
- Status: `partial_success`
- Resume count: 2, always the same saved run
- Observed: 1,480
- New: 86
- Changed: 4
- Unchanged: 942
- Jira proposals prepared for review: 25
- Email drafts prepared inside Workbench: 4
- Jira and email changes executed: 0
- MDM comparison: completed, preview `mdm-preview-1786676281703`, 2 corrections
- Outlook draft delivery: disabled

The Brain update source remained partial because it found 1,448 records and retained
only the first 1,000, so its saved position did not advance. The other requested sources
completed or returned an honest empty result.

Meeting results:

| Meeting | Result | Note |
|---|---|---|
| MDM Projects | repaired | Full Cluely capture plus partial Teams excerpt consolidated |
| Programs, Projects and Tasks | repaired | Full Cluely capture plus partial Teams excerpt consolidated |
| Fabric Bi-Weekly Stand-Up | repaired | Two full captures compared; repeated Teams excerpt retained as a receipt and deduplicated |
| Weekly Dev/Data Stand-up | partial | Teams returned an excerpt; meeting remains unprocessed |
| ETL UPDATE | partial | Teams returned excerpts; meeting remains unprocessed |

The three repairs were saved by the existing meeting-closeout process in Brain commits
`48db2e9`, `e1469ce`, and `3e53127`. The only unrelated Brain edit left afterward was
`SESSION-JOURNAL.md`.

The scheduled infographic pass later finished successfully. It found that closeout had
replaced three verified `status.json` receipts with local preview status. It restored and
rechecked Fabric Bi-Weekly Stand-Up, Programs, Projects and Tasks, and MDM Projects without
creating duplicate images. That repair is Brain commit `1374209`.

## Transcript comparison receipts

Each consolidated artifact names every input, classifies its coverage, records its
SHA-256 receipt, preserves the original files, removes duplicate text, and states source
differences inside the cleaned context. When Teams and Cluely overlap, Teams is the
stronger source for exact wording and speaker attribution; Cluely fills gaps and extends
a partial Teams capture.

| Meeting | Consolidated file | Inputs |
|---|---|---|
| MDM Projects | `core/meetings/transcripts/consolidated/2026-08-13-mdm-projects.md` | full `dbaafa1e...72ec`; partial `636552ef...ba21` |
| Programs, Projects and Tasks | `core/meetings/transcripts/consolidated/2026-08-11-programs-projects-and-tasks.md` | full `767cd242...e512`; partial `4e980a99...b7eff` |
| Fabric Bi-Weekly Stand-Up | `core/meetings/transcripts/consolidated/2026-08-07-fabric-bi-weekly-stand-up.md` | full `e68f9761...f484`; full `d147c8cf...5892`; partial `b992949d...edb4` |

The resulting consolidated file hashes were:

- MDM Projects: `E65FDF2334926C711BBFE5630666CB72ED35CFB3AF359AAEC4E9070F44C9AA48`
- Programs, Projects and Tasks: `3BCCD305086EE4D4B7E5D240A35759DD4239FC365B0283558D715944906A9789`
- Fabric Bi-Weekly Stand-Up: `D7D85C62316F4220DCBE239A424F180FA6CFFFB466A5A480802C5F492D13D2CF`

## Data refresh and live proof

`npm run sync:data` completed after the meeting repairs and exported 18 prep packets,
28 insights, 18 action proposals, 96 open questions, 26 risks, 10 decision records, and
23 decision candidates.

The gateway was restarted from the current checkout, returned ready at `/healthz`, and
returned loop mode `shadow`. `/api/agents/runs` returned seven reduced summaries with no
prompt, raw output, or raw message fields.

The live Today verification ran against ports 5217 and 8817 at desktop and 390-pixel
phone width. Both runs found Today, activity reconciliation, and loop status visible.
Both had zero horizontal overflow, zero browser errors, and zero failed requests.
Screenshots are under `.frontend-verify/today-live/` and are intentionally ignored.

The final restart crossed into August 14. Today correctly reset its day-scoped delivered
count and showed 0 delivered today, 0 working, 49 waiting, and 104 open Jira issues at
12:10 AM ET. The activity card named the August 13 run as old instead of presenting it as
current work. The loop card showed shadow mode, 64 items observed, nothing executed, and
a 12:10 AM last-pass time.

That final check found and fixed a last-pass reporting defect. A successful shadow scan
with no new cards previously saved no row, so the visible timestamp remained old even
though the timer was healthy. Every pass now appends a compact pass receipt. The live
post-restart pass considered 49 items, recorded 0 new shadow rows, and advanced the
visible time to `2026-08-14T04:10:17.825Z`.

## Final infographic generation path

Meeting closeout no longer creates an HTML visual or screenshots it into a placeholder.
It now behaves as follows:

- Reuse an existing verified Codex or NotebookLM image only after the saved PNG decodes,
  its recorded SHA-256 matches, and its status carries real source and artifact receipts.
- Prefer Codex built-in `$imagegen` for a missing image.
- Keep NotebookLM available as the alternate image provider and for other Studio artifact
  types.
- Leave `status.json` at `pending_generation` with no PNG when generation fails.
- Report the meeting as partial until a real image is saved, associated, and displayable.

The real Codex proof ran under task
`019ffe5a-0f38-79c2-a8ce-1933f5038277`. It produced a 1672 by 941 PNG, 1,699,621
bytes, SHA-256 `2eb87e4752946801e8289063d8013dafae21f907a9a446cda329a889d0340896`.
The first integration attempt exposed a real filing defect: the image existed in Codex's
generated-image folder but had not been copied to the requested job path. The server now
uses the exact Codex task ID to retrieve the newest reviewed PNG for that task, decodes it,
and copies it atomically to the meeting package. The image was inspected visually and has
clean text, the expected IP Corporation palette, and a purpose-built evidence-flow layout.
No real Brain package was touched by this proof.

The broader architecture review is saved at
`docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`.

## Checks

- `node --test server/agent-board.test.mjs server/agent-transcript.test.mjs server/meeting-closeout.test.mjs server/meeting-closeout-gateway.test.mjs`: 74 passed, 0 failed
- Focused Today Chromium checks: 7 passed, 0 failed
- `npm run typecheck`: passed
- `npm run build`: passed
- `npx biome check src/components/workbench/WorkbenchHeader.tsx tests/smoke.spec.ts`: passed
- Broader touched-file Biome check: exit 0; 61 existing warnings remain in the old `App.tsx` sections
- Final Codex and closeout focused suite: 56 passed, 0 failed
- Activity reconciliation server suite: 30 passed, 0 failed
- Final combined focused server suite: 131 passed, 0 failed
- Loop suite after the no-change pass receipt: 23 passed, 0 failed

The previous full Playwright baseline remains 145 passed, 15 failed, and 4 skipped. The
failures are older expectations in transcript mocking, infographic counts, registered
views, focus order, and navigation. Full `npm run ci` also remains stopped by existing
lint findings in `scripts/generate-brain-graph.ts`. The focused files and current paths
are green.

## Safety receipt

No Jira proposal was applied. No Outlook draft was created. No email or Teams message was
sent. The local loop stayed in shadow and executed nothing.
