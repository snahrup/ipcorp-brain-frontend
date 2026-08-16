# Self-Driving Workbench: Remaining Build

Reviewed: 2026-08-14

This is the current dependency-ordered build plan for the self-driving Workbench. It
combines the Workbench specs, the TrendOperator package, the LoopX review, the useful
parts of earlier apps, the live code, the meeting source audit, and the current test
evidence.

It is deliberately stricter than a feature list. A capability is not finished because a
screen exists or a worker reported success. It is finished only when the real user path
survives interruption, records useful evidence, exposes partial results honestly, and
proves any external effect by reading it back.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| Verified | The real behavior has a check that can fail, and that check passed. |
| Partial | A useful part works, but named behavior or proof is missing. |
| Planned | The behavior is described and ordered, but implementation has not started. |
| Blocked | Work must stop until missing evidence, access, or a source conflict is resolved. |
| Retired | The idea or implementation must not be used for current Workbench behavior. |

## Product Definition

The Workbench is one product with five primary surfaces:

1. Today explains what changed, what is running, what needs Steve, and what is stale.
2. Agent Board shows work, source health, evidence, approvals, failures, and recovery.
3. Work owns Jira execution, live work status, and the exceptions that need Steve.
4. Meetings owns prep, capture, source comparison, closeout, follow-up, visual review, and
   the bridge from a promise to tracked or active work.
5. Brain Explorer owns deeper knowledge synthesis and evidence-backed exploration.

The browser reads server-built page models. It does not decide external actions, assemble
private source material, or start Microsoft 365 collection merely because a page opened.

## Definition of Finished

The self-driving Workbench is finished only when all of these are true:

- Today is current, concise, and built from one timestamped server snapshot.
- Every source reports observed time, health, coverage, and an understandable stale or
  unavailable reason.
- Long work resumes from the last saved step after a process, machine, or network failure.
- The same evidence does not create repeat recommendations, tickets, drafts, or Brain
  artifacts.
- Every meeting source set is compared, deduplicated, reconciled, and recorded before
  synthesis.
- A meeting is not called complete until its package, creative visual, association, and
  displayed bytes are verified.
- Any missing or conflicting meeting evidence is shown as blocked or partial. Nothing is
  invented to make the row look complete.
- Clear Jira and Brain actions proceed automatically after duplicate protection, five
  independent review lanes, convergence, and destination checks pass. Only exceptions
  wait for Steve.
- Email, Teams, and meeting invitations begin in a reviewed learning stage. Each workflow
  class can later earn autonomous execution from enough clean repetitions, low edit
  distance, zero factual corrections, and explicit enablement for that class.
- Every approved external effect is claimed once, performed once, read back, and recorded.
- A workflow that still needs Steve's signoff completes every internal production and review
  step first. Signoff releases the exact frozen payload and files; it does not rerun
  generation.
- A failed or uncertain effect is reconciled before any retry.
- Only the verifier can mark a self-driving run complete.
- Every run begins with the relevant ticket, meeting, Brain history, earlier evidence,
  operating rules, and Steve voice rules.
- Agent Board can explain what ran, why it ran, what changed, what failed, and what it will
  do next.
- Production, development, fixtures, and tests cannot share runtime state.
- No raw transcript, credential, hidden reasoning, or private source body reaches browser
  storage, repo state, logs, or a committed file.
- Every work class advances separately through observe, draft, reviewed execution, and
  autonomous execution. Advancement depends on enough clean repetitions and published
  quality measures, not a single global autonomy setting.

### Automatic phase infographic closeout

Every phase below has one required final step after its completion proof passes: Steve and the
builder confirm together that the phase is finished, then the builder automatically runs
`$phase-infographic <phase title>`. The approved versioned PNG and source receipt are stored under
`docs/architecture/assets/phase-infographics/<phase-id>/` and linked from that phase's evidence or
closeout record.

Steve does not have to request this. The shortcut is only a fallback for a rerun, replacement, or
an explicitly requested partial or blocked status artwork. The image never supplies missing proof
and never changes a partial or blocked phase to complete.

## Current Scorecard

| Area | Status | Current evidence | What is still missing |
| --- | --- | --- | --- |
| Current plan and architecture index | Partial | August architecture index and roadmap exist. | Several May-era docs still describe an old shell, palette, graph, and processing maturity. |
| Shared saved state | Verified foundation | Versioned local state, events, claims, leases, dependencies, resume triggers, approvals, verification evidence, page snapshots, and turn receipt validation have focused checks. | Older stores and activity reconciliation are not all migrated. |
| Today snapshot | Verified foundation | One server snapshot carries one ID, capture time, source observations, Jira, Agent Board, reconciliation, and loop state. | The page is still noisy and does not summarize waiting work well enough. |
| Agent Board | Partial | Four lanes, cached source polling, saved ticket runs, meeting promises, and receipts are visible. | The future dispatcher, verifier, shared approvals, retro, and memory are not feeding it yet. |
| Meeting source reconciliation | Verified foundation | Teams-first comparison, secondary gap filling, source cleanup, consolidation, and saved source evidence exist. | Older ambiguous and incomplete source sets require explicit blocked states and later source recovery. |
| Meeting closeout job | Verified foundation | Eight saved steps, stop, resume, recovery, redacted progress, artifact checks, and failed-step retry have focused checks. | The production image provider path is not reliable inside the server job. |
| Meeting visual selection | Verified | The exact receipt-selected file wins. Plain local renderer files and unreviewed results do not display. Duplicate meeting aliases and a proved non-meeting record are collapsed or excluded. The rebuilt index has 123 real meetings, 109 selected visuals, and 14 evidence-blocked meetings with no selected visual. Fresh desktop and phone checks passed in Chromium and Firefox. | Production provider reliability remains. |
| Creative visual production | Verified for the evidence-ready set | All 109 evidence-ready meetings have reviewed information art with saved receipts. Defective and pending images were replaced. | Recover missing or conflicting evidence for the remaining 14 meetings before any image is generated for them. |
| Activity reconciliation | Partial | Manual start, fixed scan end, overlap suppression, review-first Jira proposals, review-only email content, visible progress, stop, resume, and meeting repair pieces exist. | 14 of the 25 acceptance items remain partial. Activity is not yet one saved-step job. |
| Meeting-to-execution bridge | Planned | Meeting closeout already extracts evidence-backed Jira work, commitments, document requests, reminders, and email drafts. | Action identity, Jira auto-create or link, autonomous suitability, live run linkage, five-lane convergence, modal status, and exception handling. |
| Staged action and exception path | Planned | Several features have their own review flows. | One claim-once action service, expiry, exact effect, readback, two-view safety, maturity policy, and reusable exception cards. |
| Loop policy | Verified foundation | Work classes, permanent ask-first cases, shadow classification, and focused checks exist. | It is not yet connected to a dispatcher and verifier. |
| Receipts ledger | Verified foundation | Append-only structured receipts exist and shadow runs write to them. | Health must become a required precheck for every acting pass, and growth needs operational care. |
| Shadow scheduler | Verified foundation | It senses and classifies without acting. | No dispatcher, verifier, or live execution mode. |
| Cluely fetch | Verified narrow skill | A saved CDP fetch path exists for missing meeting capture. | It must be scheduled through the shared job and verification path. |
| Morning standup | Partial | A receipt-based briefing and readable board summary exist. | It must consume the final shared run, approval, source, failure, and verification records. |
| Prompt assembly and role roster | Planned | Donor research and prompt patterns are documented. | No shared module, frozen brief, context size policy, or approved model selection rules. |
| Dispatcher | Planned | Lifecycle and retry patterns are documented. | Queue, claim, heartbeat, timeout, bounded retry, worktree isolation, restart reconciliation, and Agent Board events. |
| Verifier | Planned | Jira readback and meeting image checks are useful starting pieces. | Shared mechanical, content, consequence, and uncertain-effect checks. |
| Evening retro and trust metrics | Planned | Shadow receipts contain useful counts. | Daily totals, failures, token use, verification rates, approval rates, and work-class recommendation rules. |
| Memory spine | Planned | Brain history, run history, and session journals exist separately. | One retrieval and contradiction-checking path for each run. |
| Outlook proof and send | Planned | The narrow skill is specified. | Red-first field checks, implementation, screenshot proof, exact approval, send, and readback. |
| Brain ingestion and synthesis | Partial | Safe export and graph generation exist. Current graph no longer crashes on dangling links. | Staged source processing, stable IDs, rich relationship evidence, community summaries, validation, and a measured run record. |
| Runtime and UI shape | Partial | The product works and builds. | Large gateway, closeout, App, CSS, and browser chunks must be split after behavior is locked. |
| Accessibility and mobile | Partial | Focus, status announcements, reduced motion, and phone coverage exist for activity work. | Equivalent proof for every critical page, modal, approval, and recovery state. |
| Operations | Partial | Launcher, healer, health route, focused checks, typecheck, and build exist. | Full daily smoke, corrupt-state recovery, disconnected-drive proof, backup, rollback, and measured shadow progression. |

## The Work That Remains, in Dependency Order

### Phase 0: Finish the current source and visual recovery

Why now: Meetings cannot be trusted while plain files, defective creative images, duplicate
records, and incomplete source sets are mixed together.

Already present:

- Exact receipt-selected visual lookup.
- Refusal to display plain local renderer output.
- Multiple-source discovery and Teams-first ordering.
- Saved visual receipts with source hashes, output hash, dimensions, attempts, and review.
- Duplicate meeting alias consolidation.

Completed result:

1. Replaced every evidence-ready legacy visual and reviewed the full set at full size.
2. Replaced the seven creative images with recorded factual or rendering problems and the
   two images that were still waiting for review.
3. Added a write-scope check so a broad or stale generator cannot change meeting folders.
4. Rebuilt the meeting index after the selected outputs were stable.
5. Excluded one record that the source identifies as interview preparation rather than a
   meeting.
6. Final index result: 123 real meetings, 109 selected visuals, 14 without a selected
   visual, zero missing selected files, and zero selected blocked or pending receipts.

The 14 meetings without a selected visual are intentional:

- `2025-12-09-mdm-systems-lite-discussion`
- `2025-12-11-mdm-discussion`
- `2025-12-12-mdm-discussion-inline-facilitator`
- `2025-12-22-sql-data-discovery-review`
- `2026-01-12-meeting-with-patrick-stiller`
- `2026-01-21-mdm-on-site-initial-discussions-meeting`
- `2026-01-29-in-person-demonstration-of-citrine-ai-software`
- `2026-02-10-all-employee-town-hall`
- `2026-02-24-mdm-pre-meeting`
- `2026-03-05-data-classification-cdw-sync`
- `2026-03-20-finalize-mdm-slide-deck`
- `2026-03-23-finalize-mdm-slide-deck`
- `2026-04-08-mdm-touch-base`
- `2026-04-30-historian-data-extraction-cont`

Remaining recovery work:

1. Hydrate and transcribe both January 21 recording files, then compare them with the
   partial Teams recap.
2. Retrieve the missing January 29 second recording and February 10 second recording.
3. Retrieve the March 23 VTT or DOCX from Patrick's shared OneDrive.
4. Resolve the December 9 PlantPAx conflict and the January 12 source identity conflict.
5. Replace calendar-only stubs only when real meeting evidence is found.

Completed verification and recording:

- Desktop and phone image routes passed in Chromium and Firefox with no horizontal overflow.
- The full 109-image contact sheet and the final 16-image recovery sheet were inspected.
- The consolidated Brain changelog row was added without changing unrelated Brain material.

Completion proof:

- Zero displayed plain report visuals.
- Zero displayed images with a failed or pending review.
- Zero blocked meetings with a selected image.
- Every displayed file hash matches its receipt.
- Every duplicate meeting pair presents one modal.
- Browser checks prove representative desktop, phone, keyboard, direct image, and full-size
  paths.

Automatic final step: after Steve and the builder agree Phase 0 is finished, create and link its
infographic and receipt.

### Phase 1: Make the production visual provider reliable

Why now: Direct built-in image generation works, but the nested server process failed to
read local files and later wrote into blocked folders after the parent command was assumed
finished.

Remaining work:

1. Retire the current nested CLI path from production execution.
2. Add a durable provider job interface with explicit queued, running, review pending,
   approved, failed, and blocked states.
3. Use built-in Codex image generation through a proven local worker path.
4. Keep NotebookLM available for future artifact types and as an explicitly chosen
   alternative, not as an automatic substitute.
5. Require an immutable source receipt before generation starts.
6. Require output discovery by task ID and exact file hash, never newest-file selection.
7. Require source and visual review before association.
8. Make stop cancel or quarantine every child process so it cannot keep writing later.
9. Make a stale or late provider result unable to replace a newer approved receipt.
10. Add restart, duplicate task, late result, blocked source, and conflicting writer checks.

Completion proof:

- A real meeting generation survives server restart.
- A stopped job leaves no writer alive.
- A blocked meeting cannot become review pending or approved.
- A late provider result is stored as history but never selected.
- The final displayed file is the exact approved artifact.

Automatic final step: after Steve and the builder agree Phase 1 is finished, create and link its
infographic and receipt.

### Phase 2: Move activity reconciliation onto the shared saved-step engine

Why now: Activity reconciliation is the biggest daily trust feature still using a partly
separate lifecycle.

Target saved steps:

1. Create run and freeze scan end.
2. Collect Jira.
3. Collect Microsoft 365 evidence.
4. Collect Brain updates.
5. Collect Team Library changes.
6. Collect Workbench and visible task history.
7. Normalize and fingerprint evidence.
8. Associate evidence to existing Jira work.
9. Start or attach meeting closeout jobs.
10. Prepare Jira proposals.
11. Prepare internal email review items.
12. Run the MDM consistency check.
13. Build the changes-only recap.
14. Finalize source positions and receipts.

Remaining work:

- Save each completed source unit separately and skip it after interruption.
- Reuse the same run ID after stop or process loss.
- Isolate source failures and continue with valid sources.
- Suppress duplicates inside the run and across earlier runs.
- Keep a changed item with the same identity eligible when its content hash changes.
- Use the meeting job as the only activity meeting processing path.
- Keep browser state a projection of saved server state.

Completion proof:

- Kill and resume after every step.
- Completed sources are not called again.
- One source failure does not erase other results.
- A repeat run with unchanged evidence produces no new review item.
- A changed item returns exactly once.

Automatic final step: after Steve and the builder agree Phase 2 is finished, create and link its
infographic and receipt.

### Phase 3: Close all 25 activity acceptance items

Current result: 11 satisfied and 14 partial.

The exact remaining items are:

- AC-02: two independent service instances attach to one collector call.
- AC-04: saved per-source continuation skips completed units.
- AC-07: changed evidence returns once under the same stable identity.
- AC-08: all source states and provider request or job references are covered.
- AC-10: field-edit no-op suppression is proven when field edits exist.
- AC-12: exactly two of three selected proposals are applied and read back.
- AC-13: stale Jira revision and new-item identity preflight are proven.
- AC-15: a ready meeting completes through the activity job and serves the reviewed image.
- AC-16: a meeting without a ready capture becomes ready later and resumes once.
- AC-17: activity success requires the full meeting result, association, and served bytes.
- AC-20: stop and resume skip all completed source units.
- AC-21: recap groups by destination first, then source.
- AC-22: broad secret scan and explicit public-field allowlist.
- AC-25: cross-process claim and verify-first recovery after an uncertain create response.

Completion proof:

- The matrix has no partial row.
- Focused server checks pass.
- Chromium and Firefox pass at laptop and phone sizes.
- Keyboard, focus, status announcement, and reduced-motion checks pass.
- Live mutation proof uses an isolated test item or a work class already enabled for
  autonomous execution.

Automatic final step: after Steve and the builder agree Phase 3 is finished, create and link its
infographic and receipt.

### Phase 3A: Build the meeting-to-execution bridge

Why now: Meeting processing already finds Jira work, Steve commitments, document requests,
reminders, and communication follow-ups. Today those records stop at extraction. The useful
future state is an execution ledger where every follow-up is either linked, active, finished,
waiting on someone else, or stopped for a specific reason.

One action record per follow-up:

1. Stable `actionId` from meeting ID, normalized intent, evidence hash, and work class.
2. Source meeting, exact evidence, source receipt hashes, and contradiction status.
3. Disposition: existing Jira issue, new Jira issue, autonomous work, human-owned work,
   communication, reminder, reference only, or exception.
4. Jira project, issue type, issue key, owner, dates, estimate, labels, and issue link.
5. Autonomous suitability, required tools, allowed effects, expected evidence, and stop
   conditions.
6. Review round count, reviewer receipts, unresolved findings, repair history, and final
   convergence result.
7. Work run ID, current step, heartbeat, output references, verification result, and next
   action.
8. External effect receipt and readback for Jira, Brain, Outlook, Teams, or another system.

Automatic Jira behavior:

1. Search Jira before creating anything, using direct issue references, meeting context,
   normalized intent, owner, dates, and semantic similarity.
2. Attach the follow-up to an existing issue when the match is strong and current.
3. Create the issue automatically when the work is real, the MT project is known, required
   fields can be resolved, the duplicate search is clean, and the review loop converges.
4. Populate the complete issue, including description, assignee, dates, estimate, priority,
   labels, source link, related work, and dependency links where evidence supports them.
5. Read the issue back and save its key, URL, revision, and selected fields on the action
   record and meeting package.
6. Route only ambiguous project, issue identity, owner, scope, or conflicting evidence to
   Steve. Clear Jira work must not wait for routine approval.

MRI-style convergence loop:

1. Evidence reviewer checks source coverage, direct support, names, ownership, dates,
   contradictions, existing work, and missing context.
2. Adversarial reviewer tries to prove the action is wrong, duplicated, unsafe, incomplete,
   mis-scoped, or inconsistent with current Brain and Jira evidence.
3. Execution reviewer checks the exact payload, destination, permissions, expected effects,
   recovery plan, and success checks.
4. Initiative Value reviewer checks why the task exists, which MDM or Governance objective
   it advances, what it unlocks, who benefits, what risk it reduces, and how value will be
   proved. If no evidence-backed why exists, it challenges whether the task should proceed.
5. Impact and Dependency reviewer traverses related decisions, Jira work, meetings, Brain
   facts, documents, systems, and planned work. It identifies prerequisites, downstream
   effects, newly unblocked work, invalidated assumptions, and required plan updates.
6. Merge all findings into one repair list. A missing or timed-out reviewer becomes an
   unresolved finding and can never count as clean.
7. Repair the proposed action, then rerun all five reviewers against the full repaired
   artifact. Do not merely recheck the changed field.
8. Continue until all five reviewers report zero unresolved findings in the same round.
9. Stop as an exception when progress stalls, the round limit is reached, required evidence
   remains absent, or reviewers disagree after repair.
10. After execution, rerun the Impact and Dependency reviewer against the actual result,
    then perform readback and consequence review. A successful worker
   message is never enough.
11. Convert supported downstream changes into linked action records that enter the same
    process. Deduplicate them and limit recursion depth so speculative task growth cannot
    run forever.

Work-class maturity:

1. `observe`: produce the action and review receipts but perform no external effect.
2. `draft`: prepare the exact effect and compare Steve's edits, rejections, recipient
   corrections, and factual corrections.
3. `reviewed-execution`: execute after Steve accepts the item while continuing to measure
   quality.
4. `autonomous`: execute after convergence and report the result afterward.
5. Jira can reach autonomous execution earlier because it is structured, searchable,
   deduplicated, and correctable.
6. Email, Teams, and invitations begin in draft or reviewed execution. Each recipient and
   workflow class earns promotion from enough clean repetitions, low edit distance, clean
   approval streaks, zero factual corrections, and explicit enablement for that class.
7. Maturity is per work class and recipient class. There is no application-wide autonomy
   switch.
8. Steve can pause, lower, or disable a work class immediately. A quality regression lowers
   the class automatically and preserves the reason.

Full dress rehearsal for signoff-required work:

1. Run discovery, planning, production, compilation, attachment assembly, and all review
   rounds exactly as the autonomous version would run them.
2. Produce the final Jira payload, final document bytes, final attachment set, final email or
   Teams body, final recipients, final subject, and final filenames before asking Steve.
3. Save a frozen release package with hashes for every payload and file, the intended
   destinations, the expected effects, and all reviewer receipts.
4. Do not create or update the Jira issue, upload the attachment, send the communication, or
   publish the Brain change while that work class still requires signoff.
5. Show Steve the final release package, not a partial preview or an unfinished draft.
6. Signoff releases the exact frozen package. It must not call the writer again, revise the
   document, regenerate an attachment, or recalculate recipients.
7. Record Steve's edits as structured training evidence: wording change, factual correction,
   recipient correction, attachment change, destination change, rejection, or no change.
8. Compare released bytes and payloads with the frozen package and stop if anything changed
   after signoff.
9. Store the complete rehearsal even when Steve declines it so future maturity decisions use
   the real finished output rather than a hypothetical result.

Meeting modal behavior:

1. Every follow-up row shows its disposition and current state.
2. Linked or created Jira work shows the issue key, title, status, owner, due date, and direct
   link.
3. Autonomous work shows queued, active, verifying, finished, failed, stopped, or exception,
   plus the active step and most recent useful progress.
4. Review details show round count, five reviewer states, repaired findings, and the exact
   reason a row could not converge.
5. A clear row needs no Steve control. Exception rows expose the smallest useful decision or
   missing input.
6. The same action state appears in the meeting modal, Work, Agent Board, and Today. These
   views do not create separate copies.

Completion proof:

- Reprocessing the same meeting creates no duplicate Jira issue or work run.
- A strong existing Jira match links without creating a new issue.
- A clear new Jira task is created, read back, linked to the meeting, and visible in the
  modal without a routine approval step.
- One reviewer timeout stops convergence and appears as an unresolved finding.
- A repaired finding causes all five reviewers to run again.
- A task with no supported initiative value becomes an exception before execution.
- A post-execution impact change updates or creates the linked downstream action exactly
  once.
- A safe autonomous task starts once, survives restart, and reports live state in all four
  views.
- A communication workflow in draft mode cannot send, while an enabled autonomous class can
  send once, read back the result, and report afterward.
- A stalled loop ends as an exception with the remaining findings and never appears done.

Automatic final step: after Steve and the builder agree Phase 3A is finished, create and link its
infographic and receipt.

### Phase 4: Consolidate all runtime state and page models

Why now: Meeting closeout and Today use the shared engine, but several older features still
own independent stores and projections.

Remaining work:

1. Inventory every file under `%LOCALAPPDATA%\IPCorpBrain` by owner, version, writer, reader,
   retention, and recovery behavior.
2. Migrate activity reconciliation, MDM reconciliation, approval records, agent runs,
   weekly status, loop receipts, source health, and notification state where the shared
   model fits.
3. Preserve migration receipts and safe fallback reads during cutover.
4. Enforce separate production, development, fixture, and test roots.
5. Add atomic migration, startup validation, corruption quarantine, and repair guidance.
6. Make every major page render one server-built snapshot with one capture time.
7. Add snapshot age and partial-source notes to every page model.
8. Keep repository files free of runtime writes while Vite is running.

Completion proof:

- No fixture identifier appears in production state.
- Every store has a version, owner, health summary, and recovery check.
- A corrupt store is isolated without wiping healthy state.
- Opening any page triggers no Microsoft 365 call.

Automatic final step: after Steve and the builder agree Phase 4 is finished, create and link its
infographic and receipt.

### Phase 5: Finish sensing and source health

Remaining work:

1. Create one source observation shape for Jira, Outlook, Teams, Brain, Team Library,
   Workbench tasks, local meeting capture, and optional sensors.
2. Record requested, observed, complete-through, item count, useful-item count, partial
   reason, job reference, and last success.
3. Enforce the one-job rule for every Microsoft 365 collection pass.
4. Continue an existing Microsoft request by job ID. Never replay because it is slow.
5. Add bounded timeouts, stop behavior, and clear recovery for each source.
6. Keep Screenpipe or any always-on capture strictly opt-in and disabled by default.
7. Add source-specific health cards and plain-language stale explanations.

Completion proof:

- Each source can be healthy, partial, unavailable, failed, or stopped without erasing
  other source results.
- A slow Microsoft request is attached to, not duplicated.
- Today explains useful evidence separately from raw scan volume.

Automatic final step: after Steve and the builder agree Phase 5 is finished, create and link its
infographic and receipt.

### Phase 6: Build one staged-action and exception service

Remaining work:

1. One staged-action record with exact target, proposed effect, diff, evidence, revision,
   expiry, requester, work-class maturity, and review requirements.
2. Claim-once proceed, decline, repair, and exception-resolution operations.
3. A separate execution claim so two browser views cannot perform the same effect.
4. Readback evidence and final result.
5. Verify-first recovery for uncertain effects.
6. Reusable cards for Jira exceptions, Brain exceptions, visual acceptance, MDM
   reconciliation, activity reconciliation, agent exceptions, and Outlook or Teams review.
7. Temporary per-instance review while a communication work class is in draft or reviewed
   execution, with a measured promotion path to autonomous execution.
8. Frozen release packages so signoff releases the already-reviewed bytes and payloads
   without regenerating anything.
9. Keyboard, phone, reduced-motion, expiry, stale revision, two-view, and process-loss
   checks.

Completion proof:

- Two views can inspect or resolve one action, but only one execution occurs.
- Expired or stale actions cannot execute.
- Released files and payloads match the signed-off hashes exactly.
- Every external effect has readback or an explicit uncertain state.

Automatic final step: after Steve and the builder agree Phase 6 is finished, create and link its
infographic and receipt.

### Phase 7: Build the prompt assembler, roles, and model rules

Remaining work:

1. Freeze a brief from the work item, linked Jira history, related meetings, Brain history,
   earlier receipts, source health, operating rules, and Steve voice rules.
2. Hash the brief and compare it before resume.
3. Define required evidence, allowed tools, allowed effects, time limit, retry limit, and
   completion checks for every work class.
4. Define the first role set: planner, researcher, writer, coder, evidence reviewer,
   adversarial reviewer, execution reviewer, Initiative Value reviewer, Impact and
   Dependency reviewer, fixer, meeting processor, Jira reconciler, and foreman.
5. Keep code work isolated in a worktree.
6. Define approved model choices per work class.
7. Pause when the required model is unavailable unless an approved smaller model is
   allowed for that exact work class.
8. Never silently lower the model for judgment-heavy work.

Completion proof:

- The same frozen inputs produce the same brief hash.
- A changed source forces reconciliation before resume.
- Every dispatch records role, model, tools, limits, and expected evidence.

Automatic final step: after Steve and the builder agree Phase 7 is finished, create and link its
infographic and receipt.

### Phase 8: Build the dispatcher

Remaining work:

1. Queue eligible work from the shared state.
2. Enforce policy before claim and again before any external effect.
3. Claim work once with a lease and heartbeat.
4. Start the correct role with the frozen brief.
5. Stream redacted progress and artifacts to Agent Board.
6. Enforce timeout, bounded retry, no-progress detection, token limits, and stop.
7. Reconcile saved state, worktree state, provider state, and external state after restart.
8. Route finished work to verification, never directly to done.
9. Quarantine a late child process result if its lease or brief is no longer current.
10. Make receipts health a prerequisite at startup and before every acting pass.

Completion proof:

- Process death resumes without duplicate effects.
- A missing heartbeat releases or escalates safely.
- A late worker cannot overwrite current work.
- Agent Board shows the exact phase, owner, age, and next action.

Automatic final step: after Steve and the builder agree Phase 8 is finished, create and link its
infographic and receipt.

### Phase 9: Build the convergence verifier

Required review lanes in every round:

1. Evidence: claims match evidence, source coverage is sufficient, names, dates, ownership,
   and existing-work references are correct, and contradictions are resolved or surfaced.
2. Adversarial: a fresh reviewer tries to prove the action wrong, duplicated, unsafe,
   incomplete, mis-scoped, out of character, or inconsistent with current knowledge.
3. Execution: the payload, destination, permissions, allowed effects, recovery behavior,
   and exact success checks are valid.
4. Initiative value: the work has an evidence-backed reason, advances a named MDM or
   Governance objective, identifies who benefits, states what it unlocks, and defines an
   observable outcome.
5. Impact and dependency: prerequisites, related decisions, affected work, downstream
   changes, invalidated assumptions, and follow-on actions are identified before execution
   and checked again against the actual result.

Checks that run inside or after those lanes:

- Mechanical: file exists, route responds, schema parses, hash matches, Jira or Microsoft
  readback matches, and no duplicate effect exists.
- Content: banned-word and Steve-voice checks pass, and no private source leaked.
- Consequence: rerun the scoped scan and prove the original finding is gone without a new
  break.
- Recovery: uncertain results are reconciled before retry.

Remaining work:

- Shared reviewer and finding shapes, severity rules, and repair receipts.
- Skill-specific checks for Jira, Brain, meeting closeout, visual, code, document, and
  Outlook work.
- Fresh reviewer context for every lane and every repaired round.
- Merge, dedupe, repair, and rescan until one complete round has zero unresolved findings.
- No-progress detection, maximum rounds, reviewer disagreement, and incomplete-review
  handling.
- Evidence links back to the exact work item and frozen brief.
- Only verified work moves to delivered.

Completion proof:

- A worker success message alone cannot mark work done.
- Failing any required lane returns the work to a named repair step and reruns all five
  lanes after repair.
- A missing reviewer is an unresolved finding, never an implied pass.
- Agent Board explains the failed check, repair round, and evidence.

Automatic final step: after Steve and the builder agree Phase 9 is finished, create and link its
infographic and receipt.

### Phase 10: Finish foreman, standup, retro, trust, and cost reporting

Remaining work:

1. Morning standup from receipts, source health, active work, approvals, failures, and the
   day's schedule.
2. Live foreman cards with failure, location, impact, repair in progress, and help needed.
3. Evening retro with completed, failed, stopped, waiting, and uncertain work.
4. Token use, elapsed time, retry count, verification pass rate, approval rate, and
   estimated time saved.
5. Work-class maturity recommendations based on real verification, Steve's edits,
   rejections, clean repetitions, recipient corrections, and rollback history.
6. No global autonomy level. Each work class and recipient class earns its own level.
7. Post-action summaries for autonomous work, including what ran, external effects,
   verification results, and any automatic maturity reduction.
8. Value reporting that states why the work mattered, which initiative outcome advanced,
   what it unlocked, what risk changed, and the evidence that proves it.
9. Today shows the short answer; Agent Board keeps full evidence.

Completion proof:

- Counts reconcile to work items and receipts.
- Every failure names a current response.
- Trust recommendations cite measured history, not intuition.

Automatic final step: after Steve and the builder agree Phase 10 is finished, create and link its
infographic and receipt.

### Phase 11: Build the memory spine

Remaining work:

1. Retrieve relevant Jira, meeting, Brain, run, decision, and prior verification history
   before dispatch.
2. Write a compact next-turn record after every meaningful phase.
3. Detect contradictions between new evidence and earlier records.
4. Require review before changing an important accepted fact.
5. Keep raw/private material server-side.
6. Apply retention and redaction rules to memories and evidence.
7. Expose useful provenance to Steve without exposing hidden reasoning.

Completion proof:

- A resumed run starts with the relevant earlier decisions and failed attempts.
- Contradictions are shown, not silently overwritten.
- Browser payload and repo secret scans stay clean.

Automatic final step: after Steve and the builder agree Phase 11 is finished, create and link its
infographic and receipt.

### Phase 12: Finish Outlook proof and send

This remains last among acting skills because it can communicate as Steve.

Remaining work:

1. Pure field checks first: recipient, subject, body, attachments, account, and intent.
2. Open the exact prepared item in Outlook.
3. Capture proof and compare visible fields with the approved action.
4. When the work class still uses reviewed execution, require Steve's signoff for that exact
   visible instance. When a narrow class has earned autonomy, verify its current maturity,
   recipient class, frozen release package, and convergence receipt immediately before send.
5. Perform send once from the exact frozen package.
6. Verify the sent item through the Microsoft read path.
7. Save screenshot, field check, execution, and readback evidence.
8. Treat any uncertain send as verify-first, never retry-first.

Completion proof:

- No path can send from a broad application setting. Reviewed execution requires exact
  signoff; autonomous execution requires the specifically enabled work and recipient class
  plus current clean evidence.
- Two views or process restart cannot duplicate a send.
- The Microsoft read path confirms the exact sent item.

Automatic final step: after Steve and the builder agree Phase 12 is finished, create and link its
infographic and receipt.

### Phase 13: Repair Brain ingestion and synthesis

Remaining work:

1. Split discovery, source-specific extraction, stable ID resolution, relationship assembly,
   evidence checks, community synthesis, and output validation.
2. Define schemas for every exported model and graph file.
3. Reject dangling links, duplicate stable IDs, unsupported relationship names, and
   important links without evidence.
4. Store excerpts or evidence references for important relationships.
5. Build hierarchical community summaries as a real implemented stage.
6. Record source counts, changed records, rejected records, confidence spread, timing, and
   output hashes for every run.
7. Rebuild from the current Brain and publish measured results.
8. Align static export shapes with runtime page models before adding more fields.

Completion proof:

- A full rerun preserves stable IDs.
- Every important relationship can explain its evidence.
- Rejected records and conflicts remain visible.
- Product docs describe only stages that actually run.

Automatic final step: after Steve and the builder agree Phase 13 is finished, create and link its
infographic and receipt.

### Phase 14: Split the runtime and UI without changing behavior

Remaining work:

1. Make `server/jira-gateway.mjs` a small route composition file.
2. Move Jira, Team Library, Today, Meetings, activity, loop, weekly status, agent runs,
   approvals, and health into owned modules.
3. Split meeting source work, synthesis, Brain storage, visual jobs, package inspection, and
   routes out of `server/meeting-closeout.mjs`.
4. Split feature routes out of `src/App.tsx`.
5. Split feature CSS out of `src/App.css`, leaving shared tokens and primitives together.
6. Create one page registry for navigation, titles, icons, mobile placement, and agent
   destinations.
7. Remove unused 3D dependencies after confirming no active import.
8. Split large browser chunks by route and heavy library.

Completion proof:

- Screenshots and behavior remain unchanged through each extraction.
- Focused checks stay green after each step.
- Main browser bundle size drops materially.

Automatic final step: after Steve and the builder agree Phase 14 is finished, create and link its
infographic and receipt.

### Phase 15: Finish security, reliability, and operations

Remaining work:

1. Secret scans for repo files, LocalAppData state, logs, events, snapshots, browser storage,
   and generated artifacts.
2. Explicit allowlists for every public page model and event field.
3. Windows process ownership, recycled PID, stale lease, child process, and file-lock checks.
4. Append-journal growth, compaction, backup, recovery, and integrity review.
5. Stopped server, corrupt state, disconnected credential drive, partial Microsoft job,
   unavailable Brain, and failed image provider exercises.
6. Full `npm run ci`, or an exact record of inherited failures with owner and date.
7. Fixture daily-path smoke and read-only live smoke.
8. Operator instructions for start, stop, resume, repair, backup, restore, and rollback.
9. Health reporting for code version, store state, source age, active jobs, loop mode, and
   last verified completion without private content.
10. A protected watchdog identity that workers can observe but cannot stop, reconfigure, or
    use to erase incident evidence.
11. Tamper-evident event manifests, before and after screenshots, and exact video for the
    small set of consequential computer-use actions.
12. Measured retention, local capacity forecasts, off-machine archive, and scheduled restore
    drills.
13. Resource budgets for browser, worker, recorder, indexing, archive, and model inference,
    with recording and watchdog health taking priority.
14. Accessibility first, keyboard or visible DOM second, vision-based control third, and raw
    coordinates only as a last resort followed by visible verification.
15. Soak progression at one hour, four hours, eight hours, overnight, 24 hours, and 72 hours,
    with browser, model, network, storage, recorder, dialog, and reboot failures injected.

Completion proof:

- The Workbench recovers from each exercised failure without losing healthy work.
- No credential or private source appears in public output.
- A fresh machine login starts the expected services without duplicate processes.

Automatic final step: after Steve and the builder agree Phase 15 is finished, create and link its
infographic and receipt.

## TrendOperator Specification Package Reconciliation

The two attached archives are byte-identical copies. Each is 4,228,835 bytes with SHA-256
`2C90A673F2A1B0FF4A227C14A1E1202FD5D507B9ACC22BDF4656D016CB84DB07`.
The package contains one editable specification in Markdown, DOCX, and PDF plus six visual
explainers. One copy was reviewed in full; no merge was needed.

Most of its useful architecture is already in the Workbench plan: backend first, one small
orchestrator, bounded work units, observe then act then verify then recover, saved mission
state, approvals, watchdogs, audit evidence, resource limits, shadow progression, fault
injection, and UI after reliability.

The package adds or sharpens these Workbench requirements:

| Package requirement | Workbench destination | Current state |
| --- | --- | --- |
| Recorder and evidence health must pause work before the next action. | Dispatcher prechecks and Phase 15 operations. | Planned. |
| Worker cannot stop the watchdog, weaken pause rules, or delete incident evidence. | Protected service identity and emergency stop. | Planned. |
| Each computer-use skill declares preconditions, allowed actions, expected result, verification, timeout, retry, recovery, evidence, and next states. | Skill registry used by prompt assembler, dispatcher, and verifier. | Partially described, not implemented as one registry. |
| Control methods have a reliability order: accessibility, keyboard or visible DOM, vision, then coordinates. | Computer-use adapter selection and verifier. | Planned as a shared rule. |
| Consequential actions get before and after screenshots plus exact video. | Approval execution evidence and Outlook proof. | Planned. |
| Event history is tamper-evident and an independent protected process owns audit health. | Receipts ledger and operations. | Hash-chained manifests and protected ownership are not built. |
| Storage has working, protected-state, archive, retention, forecast, and restore responsibilities. | LocalAppData state, Brain artifacts, archive, operations. | Local state exists; full forecast and restore proof do not. |
| Hardware and service resource use is measured before model or recorder choices are fixed. | Model rules, provider workers, operations. | Planned. |
| Application UI changes force skill revalidation before unattended resume. | Source health and computer-use skill versions. | Planned. |
| Alerts are reserved for approval, anomaly, capacity, failed recovery, or completion. | Foreman and notification rules. | Planned. |
| Soak duration increases gradually and includes injected failure classes. | Phase 17 shadow rollout and Phase 15 operations. | Planned. |
| A degraded model may monitor or pause, but judgment-heavy work does not silently continue. | Model selection rules in Phase 7. | Included, not implemented. |

TrendOperator does not change the Workbench's product shape or require a separate runtime.
Its trading-specific tools, dedicated-machine rebuild, market workflows, and future live
trading stages are intentionally excluded. The useful reliability rules are applied inside
the existing Workbench server and Agent Board.

### Phase 16: Finish product, accessibility, and mobile polish

Remaining work:

1. Today leads with changed today, blocked on Steve, actively running, stale, and shadow
   history.
2. Group repeated recommendations by target and reason.
3. Every card opens the exact record or evidence it summarizes.
4. Every stale or partial value names its observed time and reason.
5. Every modal has focus entry, focus return, Escape, keyboard actions, readable full-size
   content, phone containment, and reduced-motion behavior.
6. Every AI interaction streams status, shows collapsible reasoning state, and has Stop.
7. Humanize raw IDs, filenames, labels, and status strings.
8. Keep creative visuals as artwork, not dashboard screenshots or presentation pages.
9. Keep loading, empty, partial, unavailable, failed, stopped, waiting, approval, and
   recovery states visually distinct.

Completion proof:

- Critical desktop and phone paths pass Chromium and Firefox.
- Keyboard-only use completes every review path.
- No horizontal overflow or hidden primary action exists.
- Visual comparison confirms the current Workbench design, not an older prototype.

Automatic final step: after Steve and the builder agree Phase 16 is finished, create and link its
infographic and receipt.

### Phase 17: Shadow rollout and limited activation

Remaining work:

1. Run the complete sense, decide, dispatch simulation, convergence simulation, staged
   release, and reporting loop in shadow until each target work class has enough clean
   repetitions to satisfy its published measures.
2. Compare recommendations with Steve's actual decisions.
3. Record false positives, missed work, duplicate proposals, verification failures,
   recoveries, and time saved.
4. Fix any recurring class before activation.
5. Enable one lowest-risk work class at a time.
6. Begin sends and meeting invitations in reviewed execution. Permit later autonomy only for
   the narrow work and recipient classes that meet the published evidence measures and have
   been explicitly enabled.
7. Publish stop criteria and an immediate disable control.

Completion proof:

- Each activated class meets its published clean-repetition, edit-distance, factual-accuracy,
  recipient-accuracy, readback, and recovery measures.
- Spot checks match receipts.
- First activation is limited to one reversible, low-risk work class.
- A single control stops new execution while preserving evidence and resumable state.

Automatic final step: after Steve and the builder agree Phase 17 is finished, create and link its
infographic and receipt.

## Donor Features and Their Workbench Destinations

| Donor | Useful feature | Destination | Do not bring over |
| --- | --- | --- | --- |
| Existing Workbench | Review-first Jira, readback, source health, meeting source comparison, saved closeout | Shared services and current pages | More independent stores or page-owned source calls |
| Ghostwork | Earned autonomy per work class, approval staging, receipt scoreboard | Policy, approval, retro, trust reporting | Default acting posture |
| Mission Control | Scheduler shape, dispatcher lifecycle, prompt builder, retry queue, credential scrub patterns | Prompt assembler and dispatcher | Separate daemon product and dashboard |
| Praxis | Roles, worktree coding, planner, reviewer, fixer, heartbeat | Role roster, code work, verifier, liveness | Parallel product shell |
| Multica | Enqueue, claim, start, progress, complete, fail, blocked lifecycle | Shared work item lifecycle | Unrelated runtime and UI |
| Open Multi Agent | Typed result, no-progress detection, queue ideas | Turn receipt validation and dispatcher limits | Large orchestration framework |
| MRI | Scan, fix, verify, rescan, progress memory | Verifier and consequence checks | Project-specific scanner code |
| Evolution and session-context | History retrieval, contradiction checks, compact journals | Memory spine | Separate memory product |
| Observability hooks | Event stream and human response loop | Agent Board events and shared approvals | Separate telemetry application |
| Switchboard | Diff review, partial acceptance, waiting states | Work and Agent Board approval cards | Standalone review UI |
| Screenpipe | Optional local recall sensor | Future opt-in source adapter | Always-on capture by default |
| TrendOperator | Observe, act, verify, recover, watchdog, recorder, staged approval, frozen mission state | Saved jobs, provider safety, dispatcher, verifier, recovery | Trading domain and execution code |
| LoopX | Work items, events, claims, leases, dependencies, resume triggers, evidence, ordered turns, next-turn state, no-progress limits | Shared Node state engine and turn receipts | Python runtime, installer, file locking, second controller |

## Explicitly Do Not Build

- A second Workbench, scheduler, controller, dashboard, or agent platform.
- A full port of LoopX, TrendOperator, Praxis, Mission Control, or another donor app.
- A live dispatcher before staged actions, exception handling, and convergence are ready.
- A background Microsoft 365 request started by page load or polling.
- An automatic retry after an uncertain Jira, Brain, email, or meeting action.
- An HTML, PDF, screenshot, or presentation-like placeholder for a missing infographic.
- A made-up summary or visual when transcript evidence is absent or conflicting.
- A default always-on screen or microphone recorder.
- A global autonomy level that applies to unrelated work classes.
- A raw transcript, credential, or private source payload in frontend data or repo state.
- More graph visual effects before the knowledge data and relationship evidence improve.
- More feature code added directly to the oversized gateway, App, closeout, or CSS files.

## Known Blockers and Risks

| Blocker or risk | Impact | Response |
| --- | --- | --- |
| Fourteen incomplete or conflicting meeting source sets | A complete visual would overstate evidence. | Keep blocked with no selected image and pursue source recovery. |
| Six disputed meeting facts | A confident label could be wrong. | Omit or mark unresolved until evidence agrees. |
| Nested visual generator child processes continued after apparent failure | Blocked folders received unreviewed writes. | Retire the path, quarantine late results, and prove child shutdown. |
| Activity has 14 partial acceptance items | Daily reconciliation cannot be called finished. | Migrate to saved steps and close the matrix. |
| Staged-action logic is repeated | Acting work could diverge or duplicate. | Build one shared action and exception service before dispatcher activation. |
| Dispatcher and verifier do not exist | Loop cannot execute safely. | Keep mode off or shadow. |
| Brain synthesis is thinner than older docs claim | Graph polish could present weak knowledge as deep insight. | Rebuild processing and publish measured results. |
| Several major files are oversized | More changes raise regression risk. | Lock behavior, then split by feature. |
| Append-only state grows through full reads | Long-term performance and recovery risk. | Add measured compaction and integrity checks. |
| Windows recycled process IDs | A stale lease may look live. | Add process start time or owner token to lease checks. |
| Credential drive can disconnect | Jira reads and writes can fail mid-run. | Keep mirror, report source state, and prove recovery. |
| Shared dirty checkout | Unrelated work can be overwritten or misreported. | Preserve unrelated edits, use narrow patches, and report exact ownership. |

## Verification Matrix for Final Release

| Area | Fixture proof | Live read-only proof | Approved-effect proof | Recovery proof |
| --- | --- | --- | --- | --- |
| Today | One snapshot, partial source, stale source, no page-triggered M365 | Current timestamps and source states | Not applicable | One source down, gateway restart |
| Meetings | Multi-source compare, duplicate collapse, blocked source, reviewed image | Real package and image bytes | Clear Jira task auto-create plus communication dress rehearsal | Stop after every closeout step |
| Activity | All 25 acceptance items | Real counts and job references | Auto-create a clear Jira task and route one ambiguity as an exception | Cross-process attach, uncertain create |
| Staged action | Two views, expiry, stale revision, frozen hashes | Read-only final release package | One claimed effect and readback | Restart before and after effect |
| Dispatcher | Claim, heartbeat, timeout, retry, no-progress | Shadow only | First low-risk class after its published evidence measures pass | Process loss, stale lease, late child |
| Verifier | Five reviewer lanes, repair, rescan, and no-progress failures | Real source and route checks | Readback of the released effect | Failed check returns to repair |
| Memory | Relevant retrieval, contradiction | Real historical lookup without browser leak | Reviewed fact update | Resume after process loss |
| Outlook | Field matching and duplicate protection | Visible draft proof | Exact approval, send, sent-item readback | Uncertain send verify-first |
| Brain | Schema, IDs, links, evidence, summaries | Full measured rebuild | Reviewed publish | Partial source, rejected record, rerun |
| Operations | Smoke, state roots, corruption, secret scans | Launcher and source health | Limited approved action | Server, machine, drive, provider failure |

## The Next Three Implementation Blocks

### Block A: Finish production reliability and source recovery

1. Replace the nested visual child path with a durable provider worker.
2. Prove stop, restart, late-result quarantine, exact-task output selection, and source
   status protection.
3. Hydrate, retrieve, and reconcile the recoverable evidence for the 14 blocked meetings.
4. Generate a visual only after each recovered source set passes comparison.
5. Keep NotebookLM available for explicitly selected future artifact types.

### Block B: Build the meeting action ledger and finish activity trust

1. Add one saved action record per meeting follow-up with Jira, work-run, review, value,
   and impact state.
2. Move activity onto saved steps.
3. Close AC-02, AC-04, AC-07, AC-08, AC-10, AC-12, AC-13, AC-15, AC-16,
   AC-17, AC-20, AC-21, AC-22, and AC-25.
4. Auto-link or create clear Jira work and read it back.
5. Show Jira and autonomous run state beside each meeting follow-up.
6. Remove duplicate waiting recommendations.
7. Improve the Today summary from the resulting trusted activity state.

### Block C: Build convergence, dress rehearsal, and graduated autonomy

1. Build the five reviewer lanes and MRI-style repair and rescan loop.
2. Build the Initiative Value and Impact and Dependency reviewer outputs into Jira, briefs,
   Agent Board, Today, and completion reporting.
3. Build the shared staged-action and exception service with frozen release packages.
4. Build the full dress rehearsal path for email, Teams, documents, attachments, and Jira.
5. Build the prompt assembler and role definitions.
6. Build the dispatcher in shadow mode, then enable clear Jira work after live proof.
7. Build work-class and recipient-class maturity measurement.
8. Feed foreman, standup, retro, value, impact, and maturity metrics from the same evidence.

No further feature donor should be ported until its destination appears in this ordered
plan with a named check and proof path.
