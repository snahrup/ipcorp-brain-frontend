# Workbench Activity Reconciliation

## Copy-ready implementation instruction

Implement the Workbench Activity Reconciliation feature described below. Treat this document as the complete implementation instruction. Inspect the current repository before editing, follow its local instructions and established patterns, preserve unrelated changes, and finish with evidence from the real user path.

Do not send email, change Jira, process a real meeting, or write a real Brain record during development or verification. Microsoft 365 and Jira reads may be used only through the existing read paths. Any Jira or email change must remain a reviewable proposal until Steve explicitly approves that individual action through the existing approval experience.

## 1. Objective

Add one user-triggered reconciliation workflow to the Work screen. A run reviews new work activity since the last successful run, connects that evidence to genuinely related Jira work, processes newly completed meetings when their Teams transcript is ready, and returns a concise recap of actual changes and reviewable proposals.

The workflow must remove the need to restate the same request after every block of work while staying conservative about Jira, email, Brain writes, and evidence association.

The experience is for Steve. It must be direct, inspectable, and safe to rerun.

## 2. Required outcome

When Steve opens Work and selects "Reconcile activity":

1. The page creates or resumes one reconciliation run.
2. The run scans each authorized source from its last successful position through the new run start time.
3. The page remains visibly active for the full run and names the current phase.
4. New evidence is normalized, fingerprinted, and checked against earlier runs.
5. Evidence is connected only to Jira work that it clearly concerns.
6. New Jira work and changes to existing work are prepared for review, not applied silently.
7. Completed meetings with a ready, unprocessed Teams transcript are processed into Brain and Workbench meeting artifacts, including the meeting infographic.
8. The completed view lists only what changed or needs review.
9. Repeating the run without new evidence produces no duplicate work and no unnecessary Jira comments.

## 3. Current repository evidence

Build on the existing product instead of replacing it.

| Area | Current evidence | Direction |
| --- | --- | --- |
| Work screen | src/views/workbench/WorkView.tsx renders Jira and prepared Brain tabs. | Keep reconciliation inside the current Work experience. |
| Jira work surface | src/features/jira/JiraWorkSurface.tsx already provides Refresh and Reconcile MDM actions. | Add "Reconcile activity" beside the existing actions without merging the two workflows. |
| Review and apply | src/features/jira/MdmReconciliationModal.tsx previews proposals, exposes source availability, permits review-only dismissal, and requires a typed phrase before selected Jira changes are applied. | Reuse its selection, review, confirmation, and readback approach. |
| Prepared action review | src/components/workbench/ApprovalDock.tsx shows the target, before and after values, supporting sources, and a clear review notice. | Preserve that evidence-first presentation for reconciliation proposals. |
| Live activity | src/features/jira/AgentActivity.tsx keeps a pulse, plain-language current activity, step count, and elapsed clock visible throughout a run. | Reuse this behavior so a slow reconciliation never looks frozen. |
| Jira client | src/features/jira/api.ts calls the existing /api/jira/reconcile route family. | Extend the existing API style. Do not create a separate browser-to-Jira path. |
| Server routing | server/jira-gateway.mjs owns the Jira routes, restricts expected Jira targets, keeps Microsoft 365 collection single-flight, and enforces the long collection limit. | Keep routing, source collection, and Jira access in the current server layer. |
| Scan history | server/mdm-reconciliation/scan-ledger.mjs fingerprints evidence, hashes content, suppresses previously handled evidence, writes atomically, and records scan windows. | Reuse these concepts while adding per-source positions, interruption recovery, overlap, cancellation, and active-run checkpoints. |
| Microsoft 365 collection | server/m365-reconcile.py currently gathers broad Outlook and Teams evidence from 2026-01-01 forward. | Split coverage and reporting into the required Outlook and Teams streams. |
| Meeting reads | server/meeting-closeout-adapter.py reads Outlook meetings and exact Teams meeting transcripts. | Reuse this read path and its meeting identity rules. |
| Meeting processing | server/meeting-closeout.mjs already builds review packages, stores meeting artifacts, creates an HTML infographic, records processed work, and produces a run report without sending email or changing Jira. | Reuse this package and its idempotent write behavior. |
| Brain write procedure | The Brain AGENTS.md, INGESTION_PLAYBOOK.md, and CHANGELOG.md MANIFEST define the required checks and records for every Brain write. The current meeting writer appends CHANGELOG.md but does not maintain the open MANIFEST. | Read and obey those files immediately before implementing any Brain write, and bring the reused writer into compliance before it can process a real meeting. |
| Meeting display | src/components/drawer/MeetingDetail.tsx displays a saved meeting infographic. | A reconciled meeting is not complete until the saved artifact is associated and renders here. |
| Infographic coverage | scripts/meeting-infographic-audit.mjs and src/views/workbench/MeetingInfographicAudit.tsx distinguish missing artifact, missing association, and missing display. | Use the same definitions when checking reconciliation output. |

Before editing, recheck these paths because the shared checkout may have changed.

## 4. Product rules

### 4.1 User initiation

- Opening Work must never start Microsoft 365 collection.
- Refresh must keep its current meaning.
- Reconcile MDM must remain available as its current focused workflow.
- "Reconcile activity" starts or resumes the broader workflow defined here.
- Only one activity reconciliation run may be active at a time.
- A second selection while a run is active must attach the page to that run, not start another source request.

### 4.2 External changes

- Microsoft 365 and Jira collection are read-only.
- Jira creates, comments, worklogs, field edits, status changes, and closure are proposals until explicitly approved.
- Each Jira proposal must be independently selectable.
- The existing typed confirmation pattern applies only to the proposals currently selected.
- Jira state must be read again immediately before apply. A stale proposal must return to review.
- Email output from this workflow is draft-only. The workflow must not send email.
- Do not copy raw Microsoft 365 content into a frontend seed, browser storage, Git-tracked data, or the scan ledger.

### 4.3 No unrelated activity

- Do not touch a Jira item merely because its text resembles a message.
- Do not add a comment that says no work occurred.
- Do not create a worklog without defensible evidence for both the work and its duration.
- Do not close work from vague completion language.
- Do not list unchanged items in the final recap.

## 5. User journey

1. Steve opens Work and sees the current Jira view with Refresh, Reconcile MDM, and Reconcile activity.
2. He selects Reconcile activity.
3. A run panel opens immediately and shows the run start time, scan period, named phase, source states, elapsed time, live counts, and Stop.
4. The workflow reads each source once, classifies new evidence, prepares Jira and email proposals, and processes eligible meetings.
5. If a source fails, the other independent sources continue and the page explains the partial result.
6. The completed panel shows only new or changed Brain and Workbench artifacts, processed meetings, saved infographics, and reviewable Jira or email proposals.
7. Steve reviews selected Jira proposals through the existing approval experience. Nothing external changes before that review.

## 6. Design language

- Visual tone: calm, precise, evidence-centered, and consistent with the current IP Corporation Workbench.
- Typography: Figtree for headings and branded labels, system sans for interface copy, restrained monospace only for source references and run identifiers.
- Color: white and cool-gray surfaces, structural navy, corporate blue for primary actions, and green, amber, or red only for state.
- Density: compact enough to scan while preserving generous spacing around the run summary and review groups.
- Motion: short state transitions and a persistent activity pulse or spinner. Respect reduced-motion settings.
- Progress: show named phases and real counts. Never show a guessed percentage.
- Responsive behavior: no horizontal overflow on laptop, tablet, or phone widths.

## 7. Ordered feature list

Implement in this order. Each item must be runnable and testable before the next item depends on it.

### Feature 1: Entry point and idle state

Description: Add "Reconcile activity" to the current Work Jira surface beside the existing actions.

Verification steps:

1. Open Work.
2. Confirm Refresh, Reconcile MDM, and Reconcile activity are distinct.
3. Confirm no Microsoft 365 request starts until Reconcile activity is selected.

### Feature 2: Durable run record and single active run

Description: Create a persistent run record outside the repository under the existing %LOCALAPPDATA%\IPCorpBrain\ area. Record a run ID, startedAt, source positions, phase checkpoints, status, cancellation request, finishedAt, and a compact result summary.

Verification steps:

1. Start a run.
2. Reload the browser and confirm the active run returns.
3. Select Reconcile activity again and confirm no second run or duplicate source call appears.

### Feature 3: Incremental scan positions

Description: For each source stream, read from that stream's most recent successful position minus a 15-minute overlap through the new run's startedAt.

Verification steps:

1. Complete a run with fixed test timestamps.
2. Add evidence inside the next period and evidence inside the overlap.
3. Run again and confirm the new item appears once while the overlap item is suppressed.

### Feature 4: Source coverage and truthful source states

Description: Read and report these streams separately:

- Outlook received activity
- Outlook replied activity
- Outlook sent activity
- Teams channel messages
- Teams group messages
- Teams direct messages
- Teams meeting transcripts that are ready
- relevant Brain updates

Every stream must report one of these states: loading, current, empty, partial, unavailable, not authorized, timed out, malformed, failed, or canceled. "Current" means the read succeeded and returned one or more items. "Empty" means the read succeeded and returned no items for the requested period.

Relevant Brain updates are Work-related records created or materially changed during the scan period. Read them from the configured Brain root through a server-owned local reader called by the activity reconciliation coordinator. The browser must never read the private Brain filesystem directly. Include:

- dated entries in CHANGELOG.md
- entries added to _intake/processed.log
- meeting summaries and run reports
- task specifications and work artifacts
- structured decisions, actions, risks, open questions, and associations used by Work or Meetings

Exclude temporary files, build output, duplicate raw captures, personal project material, and frontend-prepared copies. Prefer the timestamp stored in a change entry or structured record. When a record has no internal timestamp, use the file's last-write time. Identify a Brain update by relative path plus its stable record ID when present. Otherwise use the relative path plus a stable structural locator such as the dated entry key, heading, or structured item key. If no stable locator exists, use the relative path as identity. Keep the content hash separate so an edit returns as a changed version of the same record. Return a sanitized summary and source reference, not the private file body.

Verification steps:

1. Stub a different outcome for each stream.
2. Confirm the UI names each stream and its truthful state.
3. Confirm one failed stream does not erase successful results from another.

### Feature 5: Evidence normalization and duplicate prevention

Description: Prefer a stable provider ID for evidence identity. When none exists, derive a fingerprint from source type, normalized title or subject, event time, participants, and source reference. Keep a separate content hash so changed evidence can be reconsidered.

Verification steps:

1. Return the same item in two runs.
2. Confirm it creates one classification and one proposal at most.
3. Change the item's meaningful content while retaining its identity.
4. Confirm the changed version returns for review without duplicating the underlying record.

### Feature 6: Evidence-based Jira association

Description: Match evidence to Jira in this order:

1. Exact Jira key plus at least one supporting context signal, such as the same project, customer, meeting, named activity, participant, stored link, or surrounding work description.
2. Existing stored link between the source item and Jira.
3. Exact project, customer, meeting, artifact, or work identity already linked in Brain.
4. Strong multi-signal match using title, people, dates, work description, and project context.

An exact key with supporting context or an existing stored link for the same source identity may select a target. A key found only inside quoted, forwarded, copied, or attached material is a review candidate. A similarity match may only produce a candidate for user review.

Verification steps:

1. Test an exact key with context, a quoted unrelated key, an existing link, a strong similarity case, an ambiguous case, and an unrelated case.
2. Confirm only the exact key with context and the existing stored link may select a Jira target automatically.
3. Confirm the quoted unrelated key, similarity case, and ambiguous case remain unselected.
4. Confirm the unrelated case produces no proposal and no Jira read beyond what the current view already requires.

### Feature 7: Jira proposal generation

Description: Prepare only evidence-supported proposals for:

- creating new Jira work
- adding a useful comment
- adding a defensible worklog
- changing a relevant field
- moving status
- proposing closure

Every proposal must show its exact effect, target, supporting receipts, confidence or uncertainty, expected current Jira revision, and why it is useful. Suppress any proposal whose requested Jira state already matches.

Verification steps:

1. Feed evidence that supports each proposal type.
2. Confirm every proposal shows a before and proposed-after view.
3. Confirm a no-op update disappears.
4. Confirm an ambiguous target remains unselected.

### Feature 8: Jira review and approval

Description: Reuse the current proposal selection, typed confirmation, apply, readback, and failure-reporting behavior. Confirmation applies only the selected proposals.

Verification steps:

1. Select two of three proposals.
2. Enter an incorrect phrase and confirm Apply stays disabled.
3. Enter the required phrase and confirm only the two selected proposals are submitted.
4. Simulate a Jira revision change and confirm the stale proposal returns to review without applying.
5. Submit the same approved proposal from two attached tabs and confirm one external operation and one shared receipt.

### Feature 9: Email follow-up drafts

Description: When meeting decisions or commitments clearly require an email follow-up, prepare a draft with recipients, subject, body, supporting meeting reference, and unresolved recipient uncertainty. Do not send from this workflow.

Verification steps:

1. Process meeting evidence containing an explicit email commitment.
2. Confirm a draft appears in the recap.
3. Confirm no send action or external write occurs.

### Feature 10: Eligible meeting discovery

Description: Identify a meeting for processing only when all of these are true:

- the meeting has ended
- its identity matches the Outlook event and Teams meeting
- a non-empty Teams transcript is ready
- the transcript and meeting have not already been fully processed

A completed meeting without a ready transcript remains pending and is checked in later runs even if its meeting time falls before the normal overlap period.

Verification steps:

1. Provide completed meetings with ready, missing, empty, and already processed transcripts.
2. Confirm only the ready and unprocessed meeting advances.
3. Confirm the missing transcript meeting remains pending for a later run.

### Feature 11: Complete meeting processing

Description: Reuse the existing meeting closeout package to create:

- verbatim transcript storage in Brain
- a structured meeting summary
- decisions
- actions and ownership
- risks
- open questions
- facts and implications
- supporting source references
- Jira proposals
- email follow-up drafts when supported
- the Workbench meeting entity, its related components, and its associations
- the saved meeting infographic
- the meeting-to-infographic association
- a displayable infographic route
- the processed log, run report, and change history required by the Brain repository

The meeting is fully processed only when the package is valid, the saved infographic exists, its meeting association exists, and the image or visual loads in Workbench.

Verification steps:

1. Process a synthetic meeting fixture through the server path.
2. Verify every artifact and association.
3. Open the meeting detail UI and confirm the infographic renders.
4. Run the same fixture again and confirm no duplicate package or visual is created.

### Feature 12: Persistent running experience

Description: While a run is active, always show:

- run start time and scan period
- current named phase
- each source state
- live item counts
- evidence classified
- meetings processed or pending
- proposal counts
- elapsed time
- latest meaningful activity
- a visible Stop control

Named phases should include preparing, reading sources, classifying evidence, matching Jira work, processing meetings, generating visuals, preparing proposals, and finalizing recap.

Verification steps:

1. Run a delayed fixture.
2. Observe the page for the full delay.
3. Confirm the activity indicator remains visible and the phase or latest activity changes.
4. Confirm no guessed percentage appears.

### Feature 13: Cancellation and recovery

Description: Stop must request cooperative cancellation. It stops new work after the current safe unit, records completed work and receipts, leaves unfinished source positions unchanged, and leaves the run resumable.

Verification steps:

1. Stop during source collection.
2. Confirm completed source results remain available.
3. Restart the app.
4. Resume and confirm finished work is not repeated and unfinished work continues.

### Feature 14: Changes-only recap

Description: The completed view lists only:

- Brain artifacts created or changed
- Workbench meeting records created or changed
- meetings processed
- infographics saved, associated, and displayed
- Jira proposals
- email drafts
- source failures that limited the result

Group results by destination, then by source within each destination, and link to receipts or records where available. Exclude unchanged evidence, unchanged Jira work, and no-op status messages.

Verification steps:

1. Run a mixed fixture containing changed, unchanged, and failed-source cases.
2. Confirm changed work and the source failure appear.
3. Confirm unchanged items do not appear.

## 8. Scan and persistence rules

### 8.1 Time capture

- Capture startedAt before any source read begins.
- Use startedAt as the upper limit for every source in that run.
- Record finishedAt only after the recap and durable checkpoints are saved.
- Keep source success separate from overall run status.

### 8.2 First run

- Label the first run as a baseline.
- Use 2026-01-01 through startedAt because the existing Microsoft 365 collection already uses that starting point.
- Present the wider first-run period before collection begins.
- Apply the same duplicate checks used on later runs.

### 8.3 Later runs

- Start each successful source at its own last successful position minus 15 minutes.
- A source that failed keeps its earlier successful position.
- A partial source result must not advance beyond the confirmed portion.
- Track both event time and first-observed time when the source provides them.
- Prefer a provider continuation token, delta token, modified time, or received time when the existing connector exposes one. This allows an item created earlier but delivered or changed later to be found without reopening all history.
- When a source exposes no such marker, perform a bounded seven-day late-arrival sweep for that source on each run. Stable IDs, fingerprints, and content hashes must suppress previously handled items.
- Evidence first observed now is eligible even when its event time is earlier than the normal 15-minute overlap.
- Pending completed meetings without a ready transcript remain in a separate retry list and are checked on later runs.

### 8.4 Interrupted runs

- Persist a checkpoint after each completed source and each completed meeting.
- On process restart, find a run with running, stopping, or interrupted status.
- Resume from the last safe checkpoint.
- Do not start a replacement run merely because the browser lost its connection.

### 8.5 Evidence records

The durable ledger may contain:

- source type
- provider item ID or derived fingerprint
- content hash
- source timestamp
- source reference
- classification
- disposition
- related local artifact IDs
- related Jira key when approved
- processing timestamps

Do not store raw message bodies, full Teams transcript text, credentials, tokens, or email content in the ledger.

### 8.6 Permissions and audit history

- Use the current authenticated local server and its existing Microsoft 365, Jira, and Brain access scopes. Do not add a more privileged credential or move credentials into browser code.
- Record append-only run events for start, each source result, each durable checkpoint, cancellation, resume, proposal review, approved apply receipts, and completion.
- Each event records its timestamp, run ID, source or destination, redacted counts, result state, and related receipt IDs. It does not record raw source content.
- Keep prepared proposals, dismissed proposals, approved external changes, and local artifact writes visibly distinct in both saved history and the recap.

## 9. Jira proposal rules

### 9.1 New work

Propose a new Jira item only when the evidence describes a distinct responsibility, outcome, or follow-up that is not already represented. The proposal must explain why existing work does not cover it.

### 9.2 Comments

Propose a comment only when it adds a decision, result, blocker, dependency, requirement, or material progress update. Do not comment merely to record the scan.

### 9.3 Worklogs

Propose a worklog only when the source provides defensible timing. Prefer explicit meeting duration, work session time, or a dated activity period. If duration cannot be supported, omit the worklog instead of inventing time.

### 9.4 Status

Propose a status change only when the evidence supports the new state. Follow the Jira workflow sequence already used by the project. Do not jump directly to Done when intermediate state history is required.

### 9.5 Closure

Propose closure only when the intended outcome is complete and the reviewed evidence does not leave open required work. Closure always requires explicit selection and confirmation.

### 9.6 Apply safety

- Read the target again before apply.
- Compare the expected revision and relevant fields.
- Stop that proposal if Jira changed since review.
- Before any external call, atomically claim the durable pair of run ID and proposal ID.
- If another request already owns that claim, join the active apply or return its saved result instead of starting a second external operation.
- Apply independent selected proposals separately so one failure does not hide the others.
- Read each successful change back from Jira.
- Persist the Jira receipt and final state in the local run result before releasing the claim.
- A retry after a saved success returns the existing receipt.
- If a create request returns an indeterminate result, verify whether the Jira item exists using the proposal identity and current Jira reads before deciding whether another create is safe. Never replay an indeterminate create automatically.

## 10. Meeting processing rules

### 10.1 Source priority

Use the exact Teams meeting transcript returned by the current Microsoft 365 read path. Do not replace it with recap text. The manual Cluely paste option remains on Meeting Wrap-up and is not an automatic reconciliation source.

### 10.2 Processed check

Before writing, compare:

- Outlook and Teams meeting identity
- transcript identity and content hash
- existing Brain meeting summary
- existing Workbench meeting record
- meeting closeout package
- _intake/processed.log
- saved infographic artifact
- meeting-to-infographic association
- Workbench display result

Classify the meeting as:

- unprocessed
- partially processed
- fully processed
- pending transcript
- blocked by invalid evidence

### 10.3 Repair behavior

If a meeting is partially processed, create only missing or stale pieces. For example:

- saved and associated visual that fails to render: repair display
- saved visual without association: add the association
- meeting record without saved visual: generate the visual
- complete package with an old content hash: prepare a reviewed update

Do not recreate correct artifacts.

The current persistMeetingPackage path writes its summary marker before the task specification, infographic, run report, processed log, and change history, then returns early when that marker already exists. Do not use the summary marker alone as proof of completion. Change this behavior so a rerun validates each required artifact and record, repairs only missing or stale pieces, and reaches full completion only after the complete list passes.

### 10.4 Completion

Record full completion only after:

1. Brain storage succeeds.
2. The structured summary validates.
3. Workbench can find the meeting.
4. The infographic is saved.
5. The infographic is associated to the meeting.
6. The Workbench route loads the visual.
7. The processed log and run report are written.

### 10.5 Brain write procedure

Before any implementation or runtime path writes to the Brain repository:

1. Read the Brain AGENTS.md, INGESTION_PLAYBOOK.md, the latest CHANGELOG.md rows, and every open MANIFEST item.
2. Follow the current ingestion, placement, source, change-history, and MANIFEST rules for every artifact the meeting path creates or repairs.
3. Update CHANGELOG.md in the same completed write set and keep the MANIFEST accurate for files that are staged but not yet written.
4. If the implementation introduces a new Brain convention, update INGESTION_PLAYBOOK.md in the same reviewed change.
5. Keep test and browser verification on temporary Brain fixtures. Do not point verification at the real Brain write path.

## 11. UI states

| State | Required display | Required action |
| --- | --- | --- |
| Idle | Last successful run, next scan start, source readiness, and Reconcile activity. | Start. |
| Preparing | Run ID, scan period, spinner, and current setup step. | Stop. |
| Running | Named phase, source states, live counts, elapsed time, latest activity. | Stop and inspect available receipts. |
| Active elsewhere | The existing run and its current state. | Attach to it. |
| Approval required | Selected and unselected Jira proposals, exact effects, receipts, uncertainty, and current Jira state. | Review, edit selection, dismiss, or enter confirmation. |
| Empty | "No new activity required changes" plus the period and source coverage. | Close or run later. |
| Partial success | Completed work, failed sources, skipped work, retry effect, and unchanged source positions. | Retry failed work or close. |
| Source unavailable | The exact source, reason, and whether earlier saved evidence was used. | Retry or continue with available sources. |
| Not authorized | The exact connector scope that is missing. | Open the existing connection path. |
| Error | Plain failure reason, saved progress, safe retry behavior, and receipt ID. | Resume or close. |
| Stopping | Spinner, current safe unit, and what has already been saved. | Wait for stopped state. |
| Canceled | Completed work, unfinished work, and resumable state. | Resume or close. |
| Completed | Changes-only recap, source coverage, duration, and proposal review. | Open records or review proposals. |

Use an ARIA live region for phase changes and final state. The Stop control must be keyboard reachable. Focus must move to the run panel when a run starts and to the recap heading when it ends.

## 12. Failure and recovery behavior

- Treat each source as an independent read result.
- Continue independent work after a single source failure.
- Do not infer "not connected" from a timeout.
- Distinguish loading, empty, unavailable, not authorized, timed out, malformed, and failed.
- Preserve the exact request or job identifier when the existing Microsoft 365 collector returns one.
- Never replay a slow Microsoft 365 request. Continue waiting on that same request.
- Keep the existing long collection ceiling and show truthful activity during the wait.
- A Jira apply failure must not roll back already verified independent Jira changes.
- Duplicate apply requests from attached tabs must join or return the saved result. They must never issue the same Jira change twice.
- A meeting package failure must not advance that meeting to fully processed.
- A failed infographic must leave the meeting in partially processed state and make the missing step visible.

## 13. Acceptance criteria

Each criterion includes observable behavior and a human check.

### AC-01: Manual start only

Given Work is opened, when no action is selected, then no activity reconciliation or Microsoft 365 collection starts.

Human check: open Work with network logging visible and confirm no reconciliation request occurs until Reconcile activity is selected.

### AC-02: One active run

Given a run is active, when Reconcile activity is selected again or Work is opened in a second tab, then both views attach to the same run.

Human check: start a delayed run in one tab, open another tab, select the action, and confirm one run ID and one source request.

### AC-03: Stable scan end

Given a new run starts at time T, when source activity arrives after T, then it is excluded from the current run and included in the next run.

Human check: use fixed-clock fixtures around T and compare the two recaps.

### AC-04: Per-source progress

Given one source succeeded and another failed, when the run ends, then the successful source advances and the failed source keeps its earlier position.

Human check: inspect the saved run state before and after a mixed-result fixture.

### AC-05: First-run baseline

Given no successful run exists, when reconciliation starts, then the UI labels the baseline period from 2026-01-01 through startedAt.

Human check: use an empty temporary state folder and inspect the run panel before collection.

### AC-06: Overlap without duplicates

Given evidence appears inside the 15-minute overlap, when a later run reads it again, then its stable identity and content hash prevent duplicate work.

Human check: replay the fixture in consecutive runs and confirm one proposal or artifact.

### AC-07: Changed evidence returns

Given a known source item changes meaningfully, when its content hash changes, then it may return for classification while keeping the same identity.

Human check: modify the fixture body and confirm it produces an update candidate, not a second source record.

### AC-08: Truthful source coverage

Given the required source streams return different states, when the run panel updates, then each stream shows its own loading, current, empty, partial, unavailable, not authorized, timed out, malformed, failed, or canceled state.

Human check: run the source-state fixture and compare all eight streams.

### AC-09: Jira association safety

Given an exact Jira key with supporting context, a key found only in quoted material, an ambiguous match, and an unrelated match, when evidence is classified, then only the exact key with supporting context may select a target. The quoted and ambiguous cases remain unselected review candidates, and the unrelated item receives no proposal.

Human check: inspect proposal targets and confirm no unrelated Jira mutation request is produced.

### AC-10: No-op suppression

Given a related Jira item already contains the proposed state, when proposals are prepared, then no comment or field change is proposed.

Human check: run an already-current Jira fixture and confirm the recap omits it.

### AC-11: Review before Jira changes

Given Jira proposals exist, when none are selected and confirmed, then no Jira write occurs.

Human check: inspect server calls while opening, selecting, dismissing, and closing the review.

### AC-12: Selected apply only

Given three proposals and two selected, when the typed confirmation succeeds, then only the two selected proposals are submitted and read back.

Human check: verify submitted operations and returned receipts.

### AC-13: Stale Jira protection

Given Jira changes after proposal creation, when apply begins, then the stale proposal is stopped and returned for review.

Human check: change the fixture revision between preview and apply.

### AC-14: Email stays draft-only

Given evidence supports an email follow-up, when reconciliation completes, then a draft appears without any send request.

Human check: inspect the recap and outbound call log.

### AC-15: Ready meeting processing

Given a completed meeting with a non-empty ready Teams transcript and no complete package, when reconciliation runs, then the meeting package and visual are created once.

Human check: run the synthetic meeting fixture and inspect Brain, Workbench, and run-report outputs.

### AC-16: Pending transcript retry

Given a completed meeting has no ready transcript, when reconciliation runs, then it remains pending and is checked on a later run.

Human check: run once without a transcript, add the transcript, run again, and confirm one package.

### AC-17: Full meeting completion

Given meeting processing reports success, when its detail view opens, then the saved infographic exists, is associated to the meeting, and renders.

Human check: open the real browser route for the synthetic fixture and verify the visual response.

### AC-18: Partial meeting repair

Given a meeting has only some required artifacts, when reconciliation runs, then it repairs only missing or stale pieces.

Human check: exercise display-only, association-only, artifact-only, and fully missing fixtures.

### AC-19: Visible progress

Given a source read takes several minutes, when the run is active, then the page always shows a spinner or pulse, named phase, elapsed time, source states, and current activity.

Human check: use a delayed source fixture and watch the full run on laptop and phone widths.

### AC-20: Safe cancellation

Given a run is active, when Stop is selected, then new work stops after the current safe unit, completed checkpoints remain, unfinished positions do not advance, and Resume continues safely.

Human check: stop during collection and meeting processing, restart, and resume.

### AC-21: Changes-only recap

Given a run contains new, changed, unchanged, and failed-source items, when it ends, then the recap lists new and changed work plus the failure, groups them by destination and source, and excludes unchanged items.

Human check: compare fixture input to visible recap rows.

### AC-22: No sensitive state leakage

Given a completed run, when local state and browser storage are inspected, then no raw email body, Teams message body, full meeting transcript, credential, or token appears.

Human check: search the test state files and browser storage for fixture secrets.

### AC-23: Responsive and accessible controls

Given keyboard navigation, reduced motion, and phone width, when a run is started, stopped, and reviewed, then all controls remain reachable, status changes are announced, and no horizontal overflow appears.

Human check: run keyboard, reduced-motion, and phone viewport checks.

### AC-24: Summary marker interruption recovery

Given meeting processing stops immediately after the summary marker is written but before later artifacts and records exist, when the same meeting resumes, then the marker does not cause an early successful return and every missing piece is created exactly once.

Human check: inject a failure immediately after the summary marker, inspect the partial fixture package, resume, and verify the task specification, visual, run report, processed record, change-history record, meeting association, and display result.

### AC-25: Duplicate apply prevention

Given two attached Work tabs hold the same selected and confirmed proposal, when both submit it at nearly the same time, then the server atomically claims that proposal once, performs at most one external Jira operation, and returns the same saved receipt to both callers.

Human check: run the two-tab fixture for an existing-item update and a new-item create, inspect the fake Jira call log, and confirm one call and one final item for each proposal.

## 14. Smoke path

Use this single path to prove the feature exists. Run it entirely with synthetic Microsoft 365, Jira, Brain, meeting, and infographic fixtures. The Jira approval and readback steps below must use the fake Jira adapter, never a real Jira project.

1. Open Work and select Reconcile activity.
2. Observe a delayed read across Outlook, Teams, meeting transcript, and Brain fixtures with continuous visible progress.
3. Complete one new meeting package with a rendered infographic while also producing one exact-match Jira update proposal and one email draft.
4. Finish with a recap that shows those changes only.
5. Review and approve the fixture Jira proposal, verify the fake readback receipt, then rerun and confirm there are no duplicates or no-op comments.

## 15. Verification plan

### 15.1 Unit checks

Cover:

- scan period calculation
- first-run baseline
- per-source positions
- overlap behavior
- late Outlook, Teams, and Brain evidence older than the overlap
- stable fingerprint and content hash
- changed-content reclassification
- no-op suppression
- Jira association ranking
- pending meeting retry
- processed meeting checks
- cancellation checkpoints
- recap filtering
- ledger redaction

### 15.2 Server integration checks

Cover:

- one active run
- attach and resume
- Microsoft 365 single-flight behavior
- per-source partial failure
- Jira preview without apply
- stale Jira read before apply
- selected apply and readback
- simultaneous two-tab apply for an existing-item update and a new-item create
- retry after saved success and verify-first handling after an indeterminate create response
- meeting package idempotency
- interruption immediately after the summary marker and per-artifact repair on resume
- infographic saved, associated, and displayable
- atomic state writes

### 15.3 Browser checks

Run the real Work route in Chromium and Firefox. Cover:

- idle state
- start
- long-running progress
- second-tab attach
- source state changes
- Stop and Resume
- partial success
- empty completion
- proposal selection and confirmation
- changes-only recap
- keyboard navigation
- reduced motion
- laptop and phone widths
- no horizontal overflow

### 15.4 Real read-only checks

Use the configured Microsoft 365 and Jira read paths only after fixture checks pass.

Prove:

- the Work screen starts one read request only after user initiation
- returned source states match the live responses
- a listed meeting remains inspectable during a later refresh failure
- the scan period is visible
- no Jira write route, email send path, real meeting-processing write, or real Brain write runs during verification

Record request IDs, timestamps, status codes, and redacted counts. Do not record raw content.

### 15.5 Required commands

Use the current repository commands as the base:

- `node --test server/mdm-reconciliation/scan-ledger.test.mjs server/meeting-closeout.test.mjs` for the existing focused server areas, plus any new focused server test file added for this workflow
- `npm run typecheck`
- `npx biome check <changed files>` for the focused style check, followed by `npm run lint` for the full repository check
- `npm run build`
- `npm run test` for the Playwright suite, with the new Work reconciliation path run directly first

The new browser coverage must exercise Work, Jira review, meeting processing, infographic display, responsive layout, and accessibility through the real local application path.

If a full-project check fails because of an unrelated existing issue, report the exact unrelated failure separately and still provide focused evidence for this work.

## 16. Work not included

- Automatic email sending
- Automatic Jira changes without selected review and typed confirmation
- Rewriting the existing MDM reconciliation workflow
- Replacing the current Microsoft 365 connector
- Using Cluely as an automatic reconciliation source
- Processing meetings whose Teams transcript is not ready
- Copying raw Microsoft 365 material into frontend data or Git history
- Adding unrelated Jira comments for visibility
- Fabricating worklog duration
- Redesigning Work, Meetings, or Jira beyond what this workflow requires
- Scheduled or background reconciliation without a user action

## 17. One unresolved implementation question

Repository inspection found meeting package generation, HTML infographic output, saved visual display, and infographic auditing. It did not find a verified Workbench-callable production entry point that creates the final saved PNG used by every meeting display and audit path.

Resolve this during implementation by tracing the current successful PNG creation path. Reuse it if it exists. If it does not exist, add the smallest local server-owned generation step that produces the artifact format already expected by MeetingDetail and the audit. Do not substitute a placeholder image, mark the meeting complete early, or change the display to hide the missing artifact.

## 18. Recommended implementation sequence

1. Add types for run state, source state, evidence identity, proposals, meeting results, and recap rows.
2. Extend the scan-ledger behavior with per-source positions, overlap, active-run state, checkpoints, cancellation, and redacted result storage.
3. Split Microsoft 365 collection into the required streams and preserve single-flight request handling.
4. Add server routes for start, status, stop, resume, recap, Jira preview, and approved apply using the existing Jira server style.
5. Add evidence classification, exact-first Jira association, no-op suppression, and proposal preparation.
6. Connect eligible meeting discovery to the existing meeting-closeout processing path.
7. Complete the saved infographic generation, association, and display check.
8. Add the Work screen entry point, persistent run panel, source states, progress, Stop, recap, and review groups.
9. Add focused unit and integration checks.
10. Verify the full browser path and the real read-only connectors.
11. Run a fresh requirements review and a practical code-quality review.

## 19. Likely repository touchpoints

Inspect before editing. Change only what the final design needs.

- src/views/workbench/WorkView.tsx
- src/features/jira/JiraWorkSurface.tsx
- src/features/jira/MdmReconciliationModal.tsx
- src/features/jira/AgentActivity.tsx
- src/features/jira/api.ts
- src/features/jira/types.ts
- src/components/workbench/ApprovalDock.tsx
- src/types/workbench.ts
- server/jira-gateway.mjs
- server/mdm-reconciliation/scan-ledger.mjs
- server/mdm-reconciliation/scan-ledger.test.mjs
- server/m365-reconcile.py
- a server-owned Brain activity reader invoked by the activity reconciliation coordinator
- server/meeting-closeout-adapter.py
- server/meeting-closeout.mjs
- server/meeting-closeout.test.mjs
- Brain AGENTS.md, INGESTION_PLAYBOOK.md, CHANGELOG.md, and its MANIFEST as required pre-write instructions and runtime records
- src/features/meeting-closeout/MeetingCloseoutPanel.tsx
- src/views/workbench/MeetingWrapUpView.tsx
- src/views/workbench/MeetingsWorkspaceView.tsx
- src/components/drawer/MeetingDetail.tsx
- scripts/meeting-infographic-audit.mjs
- src/views/workbench/MeetingInfographicAudit.tsx
- focused Playwright reconciliation, meeting, infographic, responsive, and accessibility checks

## 20. Required completion evidence

Do not report completion with only source review or a successful build.

Return:

1. A concise description of the user-visible result.
2. Every changed file with its purpose.
3. The final scan and persistence behavior.
4. The exact Jira and email approval behavior.
5. The meeting and infographic completion rules.
6. Evidence that Brain writes follow the current ingestion, CHANGELOG.md, and MANIFEST rules.
7. Evidence that two-tab proposal apply and retry behavior cannot create a duplicate Jira change.
8. Unit and integration check commands with pass counts.
9. Browser scenarios, browsers, and viewport sizes used.
10. Real read-only request evidence with sensitive content removed.
11. Proof that no unapproved Jira change, email send, real meeting package, or real Brain record was created during verification.
12. Any remaining limitation, including the exact affected user path.

The implementation is complete only when the smoke path passes, the acceptance criteria have evidence, the Work screen stays visibly active throughout a delayed run, repeat runs do not duplicate work, unrelated Jira items remain untouched, and an eligible processed meeting has a saved, associated, displayable infographic.
