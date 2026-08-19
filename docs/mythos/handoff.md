# Handoff

## Current: Run readouts, the Autonomy screen, and what actually drives the MDM dates (2026-08-19, small hours ET)

Written by `/handoff`. Everything below was checked against disk, not recalled. Start with
`/pickup`. The entry below this one covers the first half of the same session and is still
accurate; this one carries everything after it.

**Where the work is.** Repo `C:\Users\snahrup\CascadeProjects\ipcorp-brain-frontend`, branch
`main`, in the MAIN checkout, not a worktree. Working tree clean. `main` is **30 commits ahead
of `origin/main` and nothing is pushed**, and most of that is not from this session.

Another session was committing to `main` in this same directory through the afternoon. Read
`git log` before trusting any sha here.

Sixteen commits from this session, newest first:

- `98a8ca1` the Agent Board opens tickets in place, including the card itself
- `cc008f3` readout written at run completion; ticket keys open the ticket
- `1135ac7` the run readout pipeline
- `a7cc4ce` the Autonomy screen, from the applied handoff package
- `871f3cf` `3127f05` measuring the waiting
- `bbcff28` the sensitivity sweep
- `204d247` the latency model
- `9b85965` `7ff3fc5` the estimate calibration loop
- `e57bbf3` the safe apply step for the domain plan
- `5fa7b25` `1d5fc61` `e0913e7` the four-domain schedule model
- `67647a4` `83d696c` the workbook crosswalk (covered by the entry below)

**Read these first.** `docs/specs/workbench-autonomy-monitor.md` decides the Autonomy screen's
behaviour. The header comments in `server/agent-readout.mjs`, `server/workbook/domain-plan.mjs`
and `server/workbook/latency-log.mjs` carry the reasoning for the parts that look unusual.
`docs/mythos/state.md` is the authority on proven versus owed.

**The finding that matters most, because it changes what to build next.** Steve said every
template step will eventually be handed to an agent. That breaks effort as a planning unit. A
sensitivity sweep over the domain plan settled it: doubling every effort figure moves the
program end 12%, doubling every agent duration moves it **0%**, and doubling the latency
figures moves it **77%**. One number, ten days to get six calendars aligned for a kickoff,
moves the end by 56 days on its own. Capacity has stopped being a lever: 60 hours a week and
100 hours a week finish on exactly the same day, and that is a test.

So the schedule is a claim about how fast people respond. Do not spend effort refining effort.

**What is done, and verified.**

- The **Autonomy screen** at `/autonomy`, from the applied package. Run list, review modal,
  four gateway endpoints. Exercised against real data: 17 runs, 11 needing review, durations
  matching the raw records to the second. Ask-a-question and request-changes both work.
- The **run readout**: `server/agent-readout.mjs` plus `GET /api/agents/runs/readout`. Compiled
  automatically as the last thing a dispatch does, then cached, so it is ready when it is
  wanted. Its sections follow how the run ended. Every claim carries a verbatim quote and
  anything unquotable is dropped and the drop reported. Proven on two real runs: the blocked one
  named the exact credential error with nothing dropped, the finished one explained why the
  document missed its date and correctly dropped one true-but-unquotable claim.
- **Ticket references open in place** everywhere now, including the Agent Board card itself,
  which is the whole tappable surface on a phone. Only `/browse/KEY` addresses are caught, so
  meeting and gateway links are untouched and a modified click still reaches Jira.
- The **workbook crosswalk** and the **four-domain schedule model**, covered below and in
  `state.md`.
- The **estimate calibration loop** and the **latency log**, both built to refuse rather than
  invent. Both currently silent, which is the correct state: there is no measured basis on this
  board for anything yet.

Checks at handoff: `npm run test:runs` 27 pass, `npm run test:workbook` 86 pass, `npx tsc
--noEmit` clean, tree clean.

**How to run and see it.**

```
npm run dev:jira
npm run dev
```

The frontend autostarts on 5217 and this repo requires `strictPort` there, so use the running
one rather than starting a second. The gateway on 8817 was restarted from this session and will
die with it; the ecosystem healer starts it again from its own scheduled task within five
minutes, or `npm run dev:jira` brings it straight back.

```
curl -s "http://127.0.0.1:8817/api/agents/runs"
curl -s "http://127.0.0.1:8817/api/jira/breakdown-crosswalk"
npm run test:runs && npm run test:workbook
```

State written outside the repo, on purpose, so Tailwind's source scan does not reload every open
tab: readouts in `%LOCALAPPDATA%\IPCorpBrain\run-readouts`, latency in
`%LOCALAPPDATA%\IPCorpBrain\latency-observations.json` (not created yet).

**What is next.**

1. Render the readout inside the run review modal. It is produced, cached and reachable by URL,
   but the modal was built before it existed, so right now nothing shows it.
2. The interactive planner Steve asked for: a global hours-per-week control, per-week or
   per-month capacity overrides, and a parallelism control. The parallelism one is not optional:
   30 serial tasks cannot take fewer than 30 working days, so without it the slider stops
   responding at the top end and looks broken when it is telling the truth.
3. `tests/autonomy.spec.ts`, covering gateway down, empty, list and needs-you, using the stub
   approach in `tests/agent-board.spec.ts`.

**What is owed.**

- No Playwright coverage for any of tonight's work. Node tests only.
- The readout's richest fields stay empty on every existing run. Plan step outcomes and
  attachments were added to the record tonight, so only runs dispatched from now on carry them.
- The 90 numbers in the domain plan are judgment, not measurement, and the sensitivity sweep
  says nine of them govern the answer. There is no measured basis available to fix that: the
  worklogs are written to match their estimates (51% land within 2%), and the status history has
  a median of 0.0 days against a 13-day average, which is bulk transitions rather than workflow.
- In the run list, a ticket key opens the ticket by click delegation, which is a mouse
  affordance and not a keyboard one, because the row is itself a button. The keyboard path is
  the run modal's header link. Revisit if that row is restructured.
- `main` is 30 ahead of `origin` and unpushed, mostly another session's work. Do not push
  without checking with Steve.
- Two CSS descending-specificity warnings in `agent-runs.css`, from the package as delivered.

**Do not redo.** Nothing tonight wrote to Jira, sent mail, or ran a Microsoft 365 action; every
Jira call was a read. **The 94-item domain plan was deliberately NOT written to Jira** after
Steve decided the dates stay local so the interactive model and the self-correcting loop can
work; the apply step exists, defaults to a dry run, and is safe to re-run. Two dry runs against
real data caught bugs that would have created 124 issues and duplicated the whole Customer
domain, so trust the dry run. `exceljs` was installed and removed during evaluation and the
lockfile restored, so do not look for it. `npm run lint:fix` rewrites line endings across ~45
files it does not otherwise change; run biome on specific paths instead.

**Open question for Steve.** The missing "apply the governance security template before build"
task still has no MT issue. He said it should be a replicated template step across all domains,
which is right and matches how `M10.1` already works, but only Customer has a domain parent
today. Create it for Customer alone, or wait until each later domain gets its parent?

**The transcript** is the archive, not the plan:
`C:\Users\snahrup\.nexus\materialized-transcripts\claude\5fb909af-850b-4970-bc7e-bc20b2c0dff4\messages.json`

## Previous: Workbook crosswalk on the Work screen (2026-08-18, evening ET)

Written by `/handoff`. Everything below was checked against disk, not recalled. Start with
`/pickup`.

**Where the work is.** Repo `C:\Users\snahrup\CascadeProjects\ipcorp-brain-frontend`, branch
`main`, in the MAIN checkout, not a worktree. `main` is 15 commits ahead of `origin/main` and
nothing is pushed.

Check `git log` before trusting any sha here. Another session was committing to `main` in this
same directory while this ran: three of its commits landed at 15:54, 15:58 and 15:59, and HEAD
moved from `46fba49` to `014d1b6` underneath this session. The two do not touch the same files,
but the branch is shared, so look before you rebase or reset.

One commit from this session:

- `83d696c` the workbook reader, the crosswalk, and the gateway route

**Read these first.** There is no spec document for this feature. The requirements came from
Patrick in Teams and from Steve in this session, so they are recorded here and nowhere else.

- Patrick, 2026-08-18: "You may also want to have them roll-up, that is the tasks with some
  hierarchical levels and then put the top 2 tiers into the Gant."
- Steve: build a new custom view whose job is making people confident that Jira matches the
  breakdown workbook, and letting them validate for themselves what lines up and what rolls up
  to what. The audience is Robin and Patrick, not Steve.
- Steve, asked which hierarchy "top 2 tiers" means and what to do about missing start dates,
  chose switchable for both: a tier-depth control (1, 2, or all) and a date-mode control
  (recorded dates with the gaps marked, versus estimate-derived spans labeled as derived).

The header comments in `server/workbook/xlsx-reader.mjs` and `server/workbook/breakdown.mjs`
explain the parts that look unusual.

**What is done, and verified.** The data foundation, all of it proven:

- `server/workbook/xlsx-reader.mjs` reads .xlsx with no new dependency. Verified two ways: 12
  unit tests, and a cell-by-cell comparison against openpyxl across all ten sheets of the real
  workbook with zero differences in text cells. The only differences are Excel date serials,
  which it deliberately does not convert, in a tab the crosswalk never reads.
- `server/workbook/breakdown.mjs` parses the workbook into programs, projects and tasks, lines
  it up against the MT issues, and totals the rollups. 16 unit tests.
- `GET /api/jira/breakdown-crosswalk` in `server/jira-gateway.mjs`. Exercised live against real
  Jira and the real file: HTTP 200, 102 KB, 2.3 seconds.
- Fail-closed proven rather than assumed. Pointed at a missing workbook path, the route returns
  `coverage: null` with a named reason and still reports the Jira side, instead of an empty
  crosswalk that would read as a clean result.
- `npm run test:workbook`, 28 tests, added to `npm run ci`. Node tests did not run in `ci`
  before this.

A real defect was found and fixed inside the reader, red first. Self-closing `<row/>` and `<c/>`
tags matched the open-tag branch of the pattern, and their lazy body ran to the next closing
tag, swallowing the following element and shifting values onto the wrong rows. The real workbook
has 16 such rows and 252 such cells. Against the original pattern order exactly the two
swallowing tests fail and the other ten pass; after the fix all twelve pass.

**What the crosswalk says today.** 52 of 52 workbook tasks are on the board. 50 match word for
word. One is reworded (`F1.4`, where "Chargeback" became "cost-tracking" under the banned-words
rule). One has no Jira issue at all (`M0.1`, apply the governance security template). Zero
WBS-coded issues are unaccounted for. Two rows that first looked like mismatches are one
problem: the workbook's `M4` group label is broken on two rows, which stripped their codes, and
the crosswalk detects that by text and reports it as a grouping repair instead of two gaps.

**How to run and see it.** The gateway has to be restarted to serve the new route. The instance
running on 8817 predates this work and returns 404 for it, confirmed.

```
npm run dev:jira
curl -s http://127.0.0.1:8817/api/jira/breakdown-crosswalk
npm run test:workbook
```

To exercise the route without disturbing a gateway another session is using, run a second one on
a spare port. The workbook path is overridable, which is how the unreadable-file path was proven:

```
IPCORP_JIRA_GATEWAY_PORT=8899 node server/jira-gateway.mjs
IPCORP_MDM_WORKBOOK_PATH=C:/nope/not-here.xlsx node server/jira-gateway.mjs
```

**What is next.** The view itself, which is the whole point and is not built yet.

1. A Breakdown view under the Work screen, added as a new layout tab in
   `src/features/jira/JiraWorkSurface.tsx` beside List, Board, Activity, Analytics, Timeline,
   Gantt and Dependencies. It renders the crosswalk: each workbook row beside its MT issue, the
   changed words where they differ, the rollup arithmetic expandable so a reader can see the
   rows that produced each total, and the gaps stated plainly.
2. The two switches Steve chose, tier depth and date mode, wired into that view and into
   `src/features/jira/JiraTimeline.tsx` so the Gantt honors them.

**What is owed.**

- No Playwright check exists for any of this. The route and the logic are covered by node tests.
  Nothing covers a rendered view, because there is no view yet.
- The date problem, which decides what the Gantt can honestly draw. The workbook-derived
  subtasks have no start dates at all and one shared due date per program: all 10 Fabric due
  2026-09-30, all 29 Wave 1 due 2026-12-19, all 5 Wave 2 due 2027-06-30. They were stamped, not
  scheduled. Board-wide, 310 of 383 MT issues have a due date and no start date, which is why
  the current Gantt draws 323 of its 375 rows as zero-length marks. Rolling children up rescues
  only 6 of the 33 affected top-tier rows.
- `MT-12` stores dates ending 2026-12-18 while its own children run to 2027-06-30. Parent bars
  should come from rolled-up child dates, not the parent's stored fields.
- `main` is 15 commits ahead of `origin` and unpushed, and most of that is another session's
  work. Do not push without checking with Steve first.

**Do not redo.** Nothing here sent mail, wrote to Jira, or ran a Microsoft 365 action. Every
Jira call was a read. Two temporary gateways were started on ports 8898 and 8899 and both were
stopped; the everyday one on 8817 was confirmed healthy afterward and was never touched.
`exceljs` was installed and removed during evaluation, and `package-lock.json` was restored to
HEAD, so the net dependency change is zero. Do not go looking for it.

**Open question for Steve.** Should the missing `M0.1` become a real MT subtask under `MT-420`,
or stay visible in the view as a workbook row with no issue? The view can show it honestly
either way, but creating it is a Jira write and nobody has asked for one.

**The transcript** is the archive, not the plan:
`C:\Users\snahrup\.nexus\materialized-transcripts\claude\5fb909af-850b-4970-bc7e-bc20b2c0dff4\messages.json`

## Previous: Track FB, the Foreman Briefing (2026-08-17, 8:30 PM ET)

Written by `/handoff`. Everything below was checked against disk at that time, not recalled.
Account-independent: a session signed in as the other Max account on this machine picks it up
the same way. Start with `/pickup`.

**Where the work is.** Branch `claude/dashboard-overload-brainstorm-7917fc`, checked out in the
worktree at `.claude/worktrees/dashboard-overload-brainstorm-7917fc`, NOT in the main checkout.
The main checkout is on `phase-2/activity-on-saved-steps`, which belongs to another session, so
do not switch or merge there. Working tree clean. Five commits, newest first, none pushed and
none merged:

- `697f7f6` the first handoff entry
- `e4cf45b` the side-by-side preview plus three live fixes
- `88a807a` FB-3a countdown scheduler, toast raiser, arm and outcome routes
- `b1364fd` FB-2 narration, fail closed
- `4987f11` FB-1 walkthrough, ranking, ledger, chapters

**Since that was written (2026-08-18).** One-click autonomous runs work: the dispatch engine
existed and had never been given a button, so the briefing item chapter now has Run it with
Claude or Codex, with live step counts and the verdict. Three defects were fixed first, all the
same root cause in different clothes: the prompt was passed as an "@file" argument that does not
resolve from a backslash Windows path, and where it did resolve a model refused it as injected
data. It travels on stdin now. That also explains the two Codex runs that hung 45 minutes and
posted BLOCKED; their logs literally read "Reading additional input from stdin". The agent
prompt became a real work packet (ticket discussion, prior worklogs and attachments, restate
the acceptance criteria, read the knowledge base and its house rules before writing, ask rather
than invent, platform practice as a silent sanity check rather than citation theater), and
deliverables now attach to the ticket as real files before the comment posts. Jira comments are
shaped for an ADHD reader and may never carry a local path. Nothing was purged from existing
tickets: six historical runs were audited and none had posted a false claim, the two failures
said plainly that they had not finished. Branch is pushed to origin.

**Read these first.** `docs/brainstorm/2026-08-17-foreman-briefing-spec.md` decides behavior and
holds the ten acceptance checks. The "Track FB" section of
`docs/architecture/SELF-DRIVING-WORKBENCH-BUILD-PLAN.md` decides order. `docs/mythos/state.md`
is the authority on proven versus owed. The concept, the research compendium, the nine-frame
storyboard, and the Cluely element map sit beside the spec in `docs/brainstorm/`.

**What is done, with the evidence.** FB-1 the guided walkthrough: ranking with the next-actor
rule and a cap of five, the anti-repetition ledger, briefing assembly, the chapters, and answers
that write receipts. FB-2 narration through the same headless drafting lane Weekly Status uses,
failing closed to mechanical copy with nothing canned. FB-3a the countdown: scheduler, Windows
toast raiser, arm and outcome routes, and a startup re-arm that reads only the cache so a
restart never starts a Microsoft read. Re-verified at handoff time: 33 unit checks pass (25 in
`npm run test:foreman`, 8 in the countdown and toast suites), `npx tsc --noEmit` clean. The 10
browser checks in both Chromium and Firefox passed at commit `e4cf45b`; the two commits since
are documentation only. Every new behavior was proven red first.

**How to run and see it.** From the worktree, two servers, both also in `.claude/launch.json`:

    npm run dev:foreman:gateway     # this branch's gateway on 8818
    npm run dev:foreman             # this branch's Vite on 5218

Then `http://127.0.0.1:5218/briefing?briefing=1`. The odd ports are deliberate: the everyday
Workbench holds 5217 and 8817 and is serving a different branch. Both were listening when this
was written, but they belong to that session and are gone now, so start them again.

**What is next.** FB-3b, the per-meeting prep chapters at `/briefing/meeting/<id>`. Today that
route falls through to the briefing itself, so a toast click does not dead-end, but the five
prep chapters (the room, last time, open threads, today's goal, materials) are not built. After
that, FB-4 Set the Room, whose choreography and Cluely element map are already written down.

**What is owed.** Nobody has watched a real toast appear at T-30; the scheduler and raiser are
covered by unit checks and the arm route returned 200 against the live calendar, but the moment
itself is unproven. The merge wants care in `server/jira-gateway.mjs`, where another session has
been working the Phase 2 activity lane. Roughly 40 commits landed on `origin/main` from another
session while this track was being built.

**Do not redo.** Do not touch the main checkout or its branch. Do not re-fire a Microsoft 365
action: an indeterminate result very likely succeeded. Narration is single-flight per day, so
today's run is already narrated and calling narrate again correctly returns the same result;
forcing a fresh draft means deleting that day's file under
`%LOCALAPPDATA%\IPCorpBrain\foreman\runs\`, which also discards any answers recorded in it.

**Open question for Steve.** Do you want a real toast armed against a near-future meeting so the
T-30 moment gets proven, and do you want this branch merged before FB-3b starts or after?

**The transcript, as archive rather than plan.** `node ~/.claude/skills/pickup/find-transcripts.mjs`
lists it; today's session is `claude:9c0a383e-9a8c-4c26-ac1f-d06f8a533287` at
`C:\Users\snahrup\.nexus\materialized-transcripts\claude\9c0a383e-9a8c-4c26-ac1f-d06f8a533287\messages.json`.
Its manifest title reads "Scheduled Jobs Viewer", which is wrong and left over from something
else, so match on the id. Read the tail only; the file runs past 200 KB.

## Previous: Phase 0 preserve and rewrite (2026-08-16)

The build sequence was stopped on 2026-08-15 by three independent reviews. Verdict: no go on
the sequence, continue the project. The previous plan created Jira issues automatically before
building the protections that make an external effect safe to retry, and its action identity
rule contradicted itself.

Anything below this entry that names a next implementation block is history. The build order
now lives in `docs/architecture/SELF-DRIVING-WORKBENCH-BUILD-PLAN.md`, phases 0 through 8.

Phase 0 done: the 116 uncommitted paths are 11 recovery points on `main`, pushed
`34b6684..90e9c64`; the inventory and the parked work are recorded at
`docs/mythos/evidence/20260816-phase-0-checkout-inventory.md`; the plan is rewritten; the
superseded documents carry history banners; Phase 1 checks are frozen at
`docs/mythos/gates/20260816-action-safe-state.md`.

Phase 0 open: Steve confirms the order, then the automatic Phase 0 infographic.

Next: Phase 1, Action-Safe State. Action identity, lease fencing, resume safety, the external
effect lifecycle, completion authority, cancellation, and the redaction and allowlist work moved
forward out of the old Phase 15. Nine checks, eight failure exercises, no live external effect.
Recommended in a branch or worktree so a later reviewer can tell a new regression from the work
already in `main`.

Paused, not discarded: the meeting-to-execution bridge at `3095f5c`. Read-only, creates nothing,
rebuilt on the corrected identity in Phase 3.

## Previous closeout: creative meeting visuals and execution architecture (2026-08-14)

The meeting index has been rebuilt from the reviewed provider receipts. It contains 123
real meetings, 109 selected creative visuals, and 14 meetings with no selected visual
because their evidence is missing, incomplete, or conflicting. The selector has no selected
placeholder, failed, pending, rejected, or source-blocked receipt. The historical files and
late unreviewed outputs remain preserved but unselected.

Every matching meeting source was compared. Teams evidence leads when available; secondary
captures fill only uncovered material. Duplicate representations are collapsed, source
hashes are saved, and disagreement stops generation instead of being smoothed over. The
two attached TrendOperator archives were also confirmed byte-identical, so only one needed
review.

Fresh verification passed: 16 focused visual selector and generator checks, the 123-meeting
audit, TypeScript through the production build, and actual desktop plus phone image-route
checks in Chromium and Firefox. All 109 selected image files resolve. The only build warning
is the already-known large JavaScript chunk.

The current remaining-work authority is
`docs/architecture/SELF-DRIVING-WORKBENCH-REMAINING-BUILD.md`. It now specifies one action
record per meeting follow-up, automatic Jira link or creation for clear work, autonomous
suitability and live run state, five review perspectives per convergence round, full dress
rehearsals for work awaiting signoff, work-class maturity, an Initiative Value reviewer,
and an Impact and Dependency reviewer before and after execution. This is architecture,
not a claim that the action engine is already built.

## Scout refresh: visuals and self-driving Workbench remaining work (2026-08-14)

Current live state was refreshed after the saved meeting job work. Gateway health passed,
`/api/today/snapshot` returned one coherent snapshot with Jira, Agent Board,
reconciliation, and loop sources all ok, and `/api/agent-board?cache=1` returned 0
watching, 0 working, 49 waiting, and 1 delivered. Meeting index now has 131 meetings,
52 displayable visuals, and 79 without a displayed visual.

The visual selector and regenerator tests passed. The remaining legacy-visual dry run
found 51 ready replacements, 0 blocked, 7 multiple-transcript cases, and 0 no-transcript
cases. The 2026-06-17 Purview pilot now has a real Codex-generated creative PNG and a
provider receipt with source hashes, output hash, dimensions, superseded local-renderer
receipt, and review notes. The server-side nested Codex path still has a real risk:
its first attempt hit `CryptUnprotectData failed: 2148073483`, so finish the batch
through a proven built-in image flow or a worker path that can reliably read sources.

Focused verification passed: 37 Node tests across visual selection, visual generation
receipts, Today snapshot, Workbench state, saved-step runner, and meeting job; TypeScript
passed; production build passed with the known large-bundle warning.

The ordered remaining-work audit is now:
`docs/mythos/evidence/20260814-self-driving-workbench-remaining-work.md`.

## Saved meeting closeout job (2026-08-14, complete)

Meeting Wrap-up is now the first real consumer of the common Workbench state engine. Each
user-started closeout has one saved work item and eight ordered stages: discover, reconcile
sources, synthesize, store, generate visual, associate, verify display, and finalize.

The process call returns an accepted job immediately. The UI restores saved progress,
shows every stage, stops between safe stages, resumes the same job, and restores the review
package when complete. Startup continues prepared or interrupted work after a dead local
process. Failed and user-stopped work waits for an explicit resume.

Transcript cleanup, comparison, consolidation, and source receipts remain in place. Raw
meeting text stays out of events, logs, status responses, and browser payloads. Activity
reconciliation now attaches to the same meeting job instead of opening a second closeout
path.

Codex remains the preferred visual provider. Verified NotebookLM output can still be
reused, and the NotebookLM integration remains available for later artifact types. A
provider failure creates no substitute image. Final completion requires the PNG, saved
receipt, association, processed row, change row, real Workbench image response, PNG decode,
and saved hash to agree.

Verification passed: 88 saved meeting and activity server checks, 10 Chromium and Firefox
browser checks, TypeScript, production build, focused Biome, and the diff whitespace
check. The saved-job browser flow also passed at 390 by 844 without horizontal overflow.
The fresh re-review found no remaining actionable issue.

Next implementation block: move the rest of activity reconciliation onto the same saved
work-item and ordered receipt model. Do not start a live reconciliation run, Jira change,
or email action as part of that build.

- Acceptance checks: `docs/mythos/gates/20260814-033500-workbench-meeting-job.md`
- Evidence: `docs/mythos/evidence/20260814-workbench-meeting-job.md`
- Review: `docs/mythos/reviews/20260814-042332-workbench-meeting-job-final-review.md`

## Workbench Foundation Block 1 (2026-08-14, complete)

The Workbench now has the common state and Today foundation needed for the remaining
program. `server/workbench-state/index.mjs` owns versioned state records, append-only
events, replayed work items, Windows-safe lease operations, exact retry no-ops, changed
retry conflicts, and ordered turn receipts. Automatic execution is still off.

`/api/today/snapshot` now assembles Jira, cache-only Agent Board, saved reconciliation,
and loop state once per capture. Today reads only that snapshot for its page data. A
partial or unavailable source remains visible without wiping out healthy source data.

The live Aug 14 3:24 AM ET page showed 0 delivered today, 0 working, 49 waiting on Steve,
104 open Jira items, the saved run as partial success with three failures, and loop off.
Desktop and phone checks had no browser error, failed request, Microsoft request, or
horizontal overflow.

The current architecture map is `docs/architecture/INDEX.md`; prior-app, TrendOperator,
and LoopX patterns are in `docs/architecture/FEATURE-DONOR-MATRIX.md`. LoopX remains a
reference only.

Next implementation block: make meeting closeout the first resumable consumer of the
state engine, with saved steps for discovery, transcript reconciliation, synthesis,
storage, visual generation, association, display verification, and final completion.
After that, move reconciliation onto the same work-item and receipt model.

- Acceptance checks: `docs/mythos/gates/20260814-024852-workbench-foundation-block-1.md`
- Evidence: `docs/mythos/evidence/20260814-workbench-foundation-block-1.md`
- Review: `docs/mythos/reviews/20260814-032700-workbench-foundation-block-1-final-review.md`

## Workbench Today, transcript reconciliation, and image generation (2026-08-14)

Today is now the live first answer for Jira, Agent Board, saved reconciliation state,
persisted ticket-agent history, and the local loop. Its header says `Current` and names
the sources it is reading. It shows the complete lane counts, previews two delivered and
waiting cards, and links to Agent Board for the rest.

The final pre-midnight state was 10 delivered, 0 working, 49 waiting on Steve, and 104
open Jira issues. After the local date changed to August 14, Today correctly reset the
day-scoped count to 0 delivered while keeping 0 working, 49 waiting, and 104 open issues.
The saved activity run `activity-20260814011850-0e48fb03` finished with 1,480
items observed, 86 new, 4 changed, three meeting repairs, two excerpt-only partials, 25
Jira proposals, four email drafts, and two MDM corrections. Nothing was applied or sent.

Meeting closeout now compares every matching transcript source. Equivalent text is
deduplicated. Different useful captures are cleaned and merged into one comprehensive
context artifact with source paths, coverage labels, and SHA-256 receipts. Originals are
preserved. A partial capture may support a full source but cannot be the sole basis for a
completed package. Reprocessing replaces the prior closeout section instead of stacking
another marker.

Three live meeting packages were repaired in Brain commits `48db2e9`, `e1469ce`, and
`3e53127`. Weekly Dev/Data Stand-up and ETL UPDATE remain partial until full captures are
available. The gateway was restarted, loop mode remained `shadow`, and seven reduced
ticket-agent histories were restored.

The scheduled infographic pass completed successfully and restored three overwritten
verification receipts without making duplicate visuals in Brain commit `1374209`.
Meeting closeout no longer makes an HTML or screenshot placeholder. It reuses a verified
Codex or NotebookLM PNG, prefers Codex `$imagegen` for a missing image, and otherwise
leaves the package honestly partial. NotebookLM remains available for images and other
Studio artifact types.

The real Codex proof task `019ffe5a-0f38-79c2-a8ce-1933f5038277` produced a reviewed
1672 by 941 PNG with SHA-256
`2eb87e4752946801e8289063d8013dafae21f907a9a446cda329a889d0340896`. The server
retrieves the result through that exact task ID, validates it, and files it atomically.
No real Brain package was touched by the proof.

The remaining architecture work is ordered in
`docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`. The first action is to align the
conflicting May and August product documents, followed by one coherent Today snapshot,
strict production versus test state roots, resumable closeout jobs, full reconciliation
evidence, Brain ingestion repair, code separation, and only then live loop execution.

The loop now records every successful pass, including a pass that finds no new card. This
keeps its visible heartbeat current without creating duplicate shadow work. The final live
pass considered 49 items, recorded 0, and advanced the time to 12:10 AM ET.

Verification passed: 131 combined focused server checks, 7 focused Today browser checks,
TypeScript, production build, focused Biome, and real desktop plus phone checks with no
browser errors, failed requests, or horizontal overflow. The local server was restarted
from the current checkout with loop mode still in shadow.

- Acceptance checks: `docs/mythos/gates/20260813-212000-workbench-today-freshness.md`
- Evidence: `docs/mythos/evidence/20260813-workbench-today-freshness.md`
- Initial review: `docs/mythos/reviews/20260813-224720-workbench-today-freshness-review.md`
- Final review: `docs/mythos/reviews/20260814-001600-workbench-final-review.md`

## Workbench activity reconciliation (2026-08-06, complete)

The Work screen now has a user-started activity reconciliation panel. It reads Outlook,
Teams, ready meeting captures, and relevant Brain updates through one saved incremental
run, associates supported evidence with Jira work, and prepares reviewable proposals.

- Entry point: Work, then `Reconcile activity`; that action creates or resumes the run
- Service: `server/activity-reconciliation/`
- Interface: `src/features/activity-reconciliation/`
- Jira and meeting integration: `server/jira-gateway.mjs`, `server/meeting-closeout.mjs`,
  `server/meeting-infographic-renderer.mjs`, `src/features/jira/JiraWorkSurface.tsx`
- Acceptance checks: `docs/mythos/gates/20260806-111351-workbench-activity-reconciliation.md`
- Evidence: `docs/mythos/evidence/20260806-workbench-activity-reconciliation.md`
- Review: `docs/mythos/reviews/20260806-activity-reconciliation-final-review.md`

The first run starts at January 1, 2026 and ends at its captured start time. Later runs
use each source's last successful position with a 15-minute overlap and a 7-day late-item
sweep. Stable source identities and content hashes suppress exact repeats while allowing
changed evidence to return. A stopped run resumes with the same run ID. Failed sources
keep their earlier successful positions.

Jira remains review-only until the user selects proposals and types the exact approval
phrase. Quoted or copied Jira keys require target review, no-op changes are removed, stale
issue reads stop apply, and the service saves an apply claim before any Jira write. Email
output stays draft-only.

Ready meetings are checked piece by piece. Missing summaries, decisions, actions, Brain
files, meeting records, infographic files, associations, processed-log rows, and Brain
change rows are repaired without repeating completed pieces. Raw meeting text stays in
memory for processing and is not saved in activity run state. Before any meeting file is
written, the service checks Brain instructions, dated change history, and open MANIFEST
rows, then stops if another pending file change still needs completion.

Verification passed: 26 server tests, 10 Chromium and Firefox browser tests, TypeScript,
focused Biome, Python and Node syntax checks, production build, live Work panel inspection,
and real read-only Microsoft 365, Jira, and Brain probes. Opening the live Work page made
no activity reconciliation request. The check stopped before selecting the action because
selection now starts or resumes work, and the status route confirmed that no run existed.

No email was sent, no Jira record was changed, no real meeting was processed, and no real
Brain file was written during verification. The shared checkout still contains unrelated
local work and must be preserved.

## Workbench agent (2026-08-06, expanded work in progress)

The Workbench now has one global agent surface mounted at the application shell.
It answers with live Agent SDK streaming, shows status while it thinks, supports Stop,
can move users to registered pages and sections, and can execute only the semantic
page actions the client reports as currently available.

- Service: `server/workbench-agent/`
- Interface: `src/features/workbench-agent/`
- Integration: `server/jira-gateway.mjs`, `src/App.tsx`
- Focused UI check: `tests/workbench-agent-registry.spec.ts`
- Acceptance checks: `docs/mythos/gates/20260806-065126-workbench-agent.md`
- Evidence: `docs/mythos/evidence/20260806-workbench-agent.md`

The service creates a local owner session with an HttpOnly cookie plus an in-memory
request token. Review records expire, are single-use, and are checked again before
any reviewed action runs. Workbench and Team Library reads are local, NotebookLM and
DevSpace expose readiness and safe reads, Microsoft 365 reads are exposed as read-only,
and write paths return unavailable unless a dedicated reviewed executor exists.

Verification passed: 24 server tests, 12 Playwright registry checks, TypeScript,
production build, focused Biome, the real `C:\Apps\IP Corp Brain Launch.bat`
path, direct health on ports 5217 and 8817, a safe live Workbench status lookup,
and a browser pass on desktop plus phone-width Workbench routes.

The Fabric Toolbox comparison expanded this work after the first verification pass.
SQL reads, Power BI reads and reviewed model changes, Fabric reads and reviewed cache
administration, richer answer formatting, and a visible source activity trail are now
being added. The earlier completion label and counts below are historical and will be
replaced after the expanded checks finish.

Residual limits: Microsoft 365 write execution is not enabled. The `frontend-verify`
wrapper dependency was missing, so the UI pass used the repo Playwright install
directly. Jira timed out on an earlier probe and then returned ready on the final
status read, proving the widget can report either state honestly.

## Meeting infographic coverage audit (2026-08-06, newest)

The Meetings overview now includes a collapsed, review-only infographic coverage audit.
It reads a checked snapshot produced by a repeatable read-only scanner and lists only
meetings that need attention.

- Audited: 118 meetings from the same array shown in Meetings
- Complete: 88
- Missing display only: 4
- Missing saved artifact only: 0
- Missing association only: 1
- Fully missing: 25
- Unavailable in the current run: 0
- Snapshot: `data/meeting-infographic-audit.json`
- Scanner: `scripts/meeting-infographic-audit.mjs`
- UI: `src/views/workbench/MeetingInfographicAudit.tsx`
- Evidence: `docs/mythos/evidence/20260805-meeting-infographic-audit.md`
- Review: `docs/mythos/reviews/20260805-meeting-infographic-audit-review.md`

One saved and associated PNG does not display because its Workbench image route returns
HTTP 500 with `ERR_INVALID_CHAR` for the response filename header. Three other saved and
associated files have no Workbench image link. One saved file is associated with a
different prepared meeting record. The snapshot contains the 25 fully missing meeting IDs.

Verification passed: 5 scanner tests, current snapshot check, focused Biome, TypeScript and
production build, 4 Chromium/Firefox audit tests with live image checking, the existing
Meetings smoke check, a phone keyboard/overflow check, and fresh read-only review.

No infographic or Brain record was created, changed, removed, or linked. The Brain checkout
already contains unrelated local edits and must remain untouched.

## MDM reconciliation scan ledger (2026-08-05, newest)

The Refresh and Reconcile MDM modal is now incremental. Every preview is a logged
scan; evidence is fingerprinted; dismissed and applied records stay gone unless
their substance changes; carried unresolved items hide behind a toggle; stale
tickets with no associated evidence are never turned into proposals.

- New module and tests: `server/mdm-reconciliation/scan-ledger.{mjs,test.mjs}` (10 tests)
- New route: `POST /api/jira/reconcile/dismiss` with fingerprints
- Ledger lives at `%LOCALAPPDATA%\IPCorpBrain\mdm-reconciliation-ledger.json`.
  NEVER move it into the repo: Tailwind v4's source scan watches every
  non-gitignored file and a mid-scan write reloads the whole app (verified live).
- The 169-item backlog is still pending-carried. Steve clears it himself in the
  modal: show carried, Select all shown, "Mark selected reviewed · no Jira change".
- Gate, evidence, review: `docs/mythos/{gates,evidence,reviews}/20260805-*`
- Phase 2 (not started): M365 window threading, issue creation from candidates,
  meeting catch-up sweep with infographics, full recap and live progress. Steve's
  full description is in the 2026-08-05 session, quoted in the gate's task summary.

The Meeting Wrap-up work is complete. The source Brain and frontend both contain unrelated local edits that must remain untouched.

## Meeting closeout result

- Path: `/meetings/wrap-up`, with the Meetings overview retained at `/meetings`
- Navigation: Meetings Overview, Daily Prep, then Meeting Wrap-up
- Calendar: current Outlook read returned three meetings for 2026-08-04 with times, organizers, and attendees
- Calendar states: loading, no meetings today, Microsoft 365 unavailable or not connected, and query error are shown separately
- Refresh resilience: a listed meeting stays visible and processable when refresh fails
- Processing: selected meeting identity drives a fixed Teams transcript, recap, and related-material lookup
- Fallback: unavailable Teams capture opens a pasted Cluely transcript form with optional context notes
- Review: commitments, Jira create or update proposals, supporting material, document requests, reminder candidates, and draft email follow-ups
- Storage: transcript, summary and context, task spec, run report, infographic HTML, processed log, and Brain changelog entry
- Workbench: saved closeouts reload from Brain meeting summaries
- Safety: email and Jira remain review-only, with no external change
- Verification: eight server checks passed, six browser checks passed across Chromium and Firefox, typecheck passed, the production build passed, and a fresh configured Microsoft 365 read returned three current meetings
- Evidence: `docs/mythos/evidence/20260804-meeting-closeout-verification.md`
- Repo note: full-project lint still reports existing findings in local worktrees, generated run files, and an unrelated server test; the eight touched implementation files pass focused checks

# Daily meeting prep handoff

The daily meeting prep work is complete in the shared checkout.

- Path: `/meetings/daily-prep`
- Navigation: child page under Meetings
- Data: dated prepared package folders only, with no Microsoft 365 read on page open
- Review: daily list, package detail, context, evidence note, and available files
- Actions: open, print, and download
- Truthful states: ready, incomplete, missing, empty, unavailable, and skipped
- Evidence: `docs/mythos/evidence/20260804-daily-meeting-prep.md`
- Status: completed and ready for coordinator review

## 2026-08-07 evening - Jira reconciliation reload fix

- Symptom: starting a Jira reconciliation (or any Workbench-dispatched run) full-reloaded the page back to Today
- Root cause: session hooks append SESSION-JOURNAL.md; the tracked file is scanned by Tailwind v4, so every write forced a Vite full reload
- Fix: `server.watch.ignored` in `vite.config.ts` for SESSION-JOURNAL.md plus the run-state lanes
- Verified live: fail repro before, pass repro after, two full reconciliation scans with journal writes mid-scan, zero reloads
- Evidence: `docs/mythos/evidence/20260807-jira-reconciliation-reload-fix.md`
- Open: data/meeting-infographic-audit.json can still reload via the module graph; journal remains tracked (gitignore has uncommitted edits from another session)
