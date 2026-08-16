# Self-Driving Workbench Remaining Work

> Superseded by `docs/architecture/SELF-DRIVING-WORKBENCH-REMAINING-BUILD.md`.
> The visual counts and dry-run results below were captured before the full source review,
> blocked-meeting classification, creative replacements, and stray-generator recovery.
> Keep this file as time-stamped scout evidence, not as current status.

Captured: 2026-08-14 14:45 ET

This note is a scout refresh from live files, live gateway reads, current docs, and focused checks. It does not claim the Workbench is finished. It separates working proof from designed intent and orders the remaining build by dependency.

## Live State Checked

- Repo: `C:\Users\snahrup\CascadeProjects\ipcorp-brain-frontend`
- Branch: `main`, ahead of `origin/main` by 1 commit during this scout pass
- Gateway health: `http://127.0.0.1:8817/healthz` returned ok
- Today snapshot: `/api/today/snapshot` returned one versioned snapshot
- Agent Board: `/api/agent-board?cache=1` returned all sources readable
- Meeting index: `data/meeting-index.json` updated at `2026-08-14T18:36:07.230Z`
- Visual dry run: `node scripts/regenerate-meeting-infographics.mjs --dry-run`
- Focused checks: 37 Node tests passed
- TypeScript: `npm run typecheck` passed
- Build: `npm run build` passed with a large chunk warning

## Current Facts

### Today and Agent Board

Working and verified:

- `server/today-snapshot.mjs` builds one snapshot with one `snapshotId`, `capturedAt`, per-source observations, partial notes, and source payloads.
- `server/today-snapshot.test.mjs` proves missing, partial, unavailable, and failed source behavior without wiping good source data.
- Live `/api/today/snapshot` returned `partial=false`, source statuses `jira:ok`, `agentBoard:ok`, `reconciliation:ok`, `loop:ok`.
- Live Agent Board returned sources ok for calendar, packages, activity, ticket agents, and verified meeting infographics.
- Live Agent Board lane counts at this pass: watching 0, working 0, waiting 49, delivered 1.

Incomplete or still risky:

- Today still has a trust problem because it is truthful but crowded: 49 waiting cards and many old recommendations make the page feel unresolved even though it is current.
- Loop mode is `off` in the live snapshot while `shadowRuns` is 98. That is honest, but Today needs clearer plain-English distinction between loop health, shadow-only history, and work actually running now.
- Full browser proof was not rerun in this scout pass, only prior evidence and server reads were inspected.

### Meeting Visuals

Working and verified:

- `scripts/brain-sources.mjs` now refuses legacy local renderer visuals and selects the provider-receipted output named by `status.json`.
- `scripts/brain-sources.test.mjs` proves the reviewed image is selected instead of the first PNG and legacy local visuals are hidden.
- `scripts/regenerate-meeting-infographics.mjs` compares all matching transcript files, supplies Teams first, keeps gap-fill sources secondary, and ignores pre-ingestion, no-transcript, run-report, retired, and underscored noise files.
- Dry run found 51 legacy report-style visuals ready for replacement, 0 blocked, 7 multiple-transcript cases, and 0 no-transcript cases.
- `data/meeting-index.json` now has 131 meetings, 52 displayable visuals, and 79 meetings without a displayed visual.
- The 2026-06-17 Purview pilot now has a Codex-generated creative replacement:
  `C:\Users\snahrup\OneDrive - IP-Corporation\ipcorp-architecture-brain\natively\meeting-infographics\2026-06-17-interplastic-purview-advisory-working-session\Interplastic - Purview Advisory - Working Session [2026-06-17] - creative.png`
- That pilot status is `GENERATED`, provider `codex`, output 1536 by 1024, with source hashes, attempt history, superseded legacy receipt, visual review note, and no known render issues.

Incomplete or still risky:

- The remaining 51 legacy visuals are not all regenerated and reviewed.
- The nested Codex task path failed at first because the spawned runtime could not read local files with `CryptUnprotectData failed: 2148073483`. Later work produced the pilot, but the server-side nested CLI path is still a risk until replaced with the built-in image flow or a proven local worker path.
- Creative image quality still needs human-visible review per asset. The pilot is the right asset class, but it uses generic Company A through Company D labels after correcting invented subsidiary names, so review remains required.
- No browser pass in this scout verified every meeting modal after the latest sync.

### Transcript Consolidation

Working and verified:

- `server/meeting-closeout.mjs` includes transcript discovery, source classification, Teams-priority selection, consolidation prompt, source writing, and context writing.
- `server/meeting-closeout.test.mjs` and the saved job tests cover cleanup, comparison, stop and resume, source handling, and no raw transcript leakage in job status.
- `scripts/regenerate-meeting-infographics.test.mjs` proves multiple transcript references are retained and Teams sorts first.

Incomplete or still risky:

- Consolidation quality is only as good as the source matching. The dry run still shows duplicate Teams files for several older meetings. That is expected, but each batch should keep a review receipt showing which files were merged or treated as equivalent.
- The Brain and frontend both have meeting package state; the next phase should make the saved-step job the shared path for all closeout and activity-driven meeting repair.

### Meeting Closeout Job

Working and verified:

- `server/workbench-state/index.mjs` provides versioned state, append-only events, leases, work items, source observations, approvals, snapshots, verification evidence, and turn receipts.
- `server/workbench-state/step-runner.mjs` provides ordered saved jobs with redacted progress, per-step artifacts, stop requests, lease claims, input hashing, rerun-on-missing-artifact, exact failed-step retry, and recoverable job listing.
- `server/meeting-closeout-job.mjs` wraps closeout as a saved job with eight steps: discover, reconcile sources, synthesize, store, generate visual, associate, verify display, finalize.
- `server/meeting-closeout-job.test.mjs` proves start-before-finish, stop and resume, visual failure retry at only that step, startup recovery, live lease preservation, and interruption after each closeout step.

Incomplete or still risky:

- Activity reconciliation is not fully moved onto the same saved-step model.
- The visual provider call still needs a stable path that does not depend on a spawned Codex runtime that can lose file access.
- Real-source proof for killing and restarting the gateway mid-closeout was not rerun in this scout pass.

### Activity Reconciliation

Working and verified:

- `server/activity-reconciliation/activity-reconciliation.mjs` has durable run state, source windows, collection, source result saving, meeting processing, review prep, recap grouping, stop, resume, history, and selected apply.
- `server/activity-reconciliation/activity-lifecycle.mjs` adds lifecycle projection, leases, phase events, run completion, stop, interruption, and receipt references.
- The saved activity run `activity-20260814011850-0e48fb03` completed with source or meeting failures and produced review items, meeting results, MDM check output, and no automatic external writes.
- Live Today and Agent Board both surface the saved activity run output.

Incomplete or still risky:

- The full activity spec has 25 acceptance items. Current focused tests do not prove every item, especially two-tab apply, phone plus keyboard plus reduced-motion pass, late evidence behavior, all source states, and no raw-source leakage across every state file.
- Several recommendations are duplicated in the live waiting lane by subject, such as repeated due-work digest and MT-475 items. The review path needs stronger same-run and cross-run suppression.
- Brain update reads report partial with a very high observed count. The source summary needs clearer "what was useful" versus "what was scanned" wording so the user can trust it.

### Jira, Email, and Approval

Working and verified:

- Jira changes remain review-only until selected and confirmed.
- Email output from activity reconciliation appears as draft work, not sent mail.
- Agent Board waiting cards explain pending Jira changes and drafts with receipts.
- Existing Jira gateway keeps stale reads, review, and readback patterns.

Incomplete or still risky:

- The shared approval channel is still spread across activity reconciliation, MDM reconciliation, Workbench agent review records, and future loop work.
- Outlook proof-and-send is a spec only. It has no red test, no implementation, and no live proof.
- Sends and meeting invites must stay ask-first as code and should not be made configurable.

### Self-Driving Loop

Working and verified:

- `server/loop/policy.mjs`, `server/loop/policy.json`, and tests are implemented.
- `server/loop/ledger.mjs` and tests are implemented as JSON state because SQLite native dependency crashed on this machine.
- `server/loop/shadow.mjs` and tests are implemented.
- `server/loop/briefing.mjs` and tests exist for standup prompt, parsing, item normalization, and assembled briefing.
- `docs/loop/ports/policy-engine.md`, `receipts-ledger.md`, and `shadow-scheduler.md` have completed port notes with real shadow evidence.
- Cluely fetch is implemented as `server/loop/skills/cluely-fetch.mjs`; the port note records a live capture fetch through CDP.

Incomplete or still risky:

- Dispatcher is not built.
- Prompt assembler is not built as a shared module.
- Verifier is not built as a shared module.
- Shared approval cards are not the loop's release path yet.
- Evening retro is not built.
- Memory spine is not built.
- Outlook proof-and-send is not built.
- Loop mode is off in the live snapshot. Shadow history exists, but there is no live execution mode.
- Ledger health is not yet a startup and per-pass prerequisite for every acting module.
- Brief freezing and reconcile-before-resume are documented from TrendOperator but not enforced by dispatcher code because dispatcher code does not exist yet.

### Brain Ingestion and Knowledge Work

Working and verified:

- `scripts/sync-data.mjs` safely refreshes sanitized frontend data from the Brain.
- Current docs label the May cockpit docs as historical when they conflict with August Workbench reality.
- Current graph data is structurally valid enough for the app, and the 2D semantic map is the active UI direction.

Incomplete or still risky:

- The Brain processing pipeline still does not match its stated ambition. Current roadmap says the graph is thinner than May claims, and high-value links need source evidence and richer synthesis before more graph polish.
- `scripts/generate-brain-graph.ts` still needs staged source-specific processing, source receipt checks, validation, community summaries, and a run manifest.
- Static data files and runtime snapshots are still separate shapes. They need a written alignment pass before more page fields are added.

### Code Shape and Operations

Working and verified:

- Focused tests passed.
- TypeScript passed.
- Production build passed.
- Gateway health passed.

Incomplete or still risky:

- `server/jira-gateway.mjs`, `server/meeting-closeout.mjs`, `src/App.tsx`, and `src/App.css` remain very large.
- Build warns about large chunks. The current main browser bundle is about 1.52 MB before gzip.
- Full `npm run ci` was not run in this scout pass.
- Playwright browser proof was not rerun in this scout pass.
- The checkout is dirty and shared. Preserve unrelated work.

## Ordered Remaining Work

### 1. Finish the visual replacement lane before calling Meetings trustworthy

1. Replace the server-side nested Codex image path with a proven built-in image generation workflow or a local worker that can read sources without credential-service failures.
2. Batch the 51 remaining legacy visuals in small groups.
3. For each asset, write provider, task ID, source hashes, output hash, dimensions, attempt notes, and review result.
4. Run `npm run sync:data` after each accepted group.
5. Open representative meeting modals and the direct `/api/meetings/infographic` route for each accepted group.
6. Leave any failed visual out of display and mark the meeting partial.

Dependency: existing selector and regenerator scripts.

### 2. Turn activity reconciliation onto the shared saved-step model

1. Move activity collection, classification, meeting processing, proposal prep, MDM check, recap, and finalization into saved steps.
2. Use the same work-item, lease, stop, resume, artifact, and turn receipt model as meeting closeout.
3. Add explicit step artifacts for source positions, source results, classified evidence, meeting jobs, proposals, drafts, MDM check, and recap.
4. Make duplicate suppression work across old runs and within the same run.

Dependency: `server/workbench-state` and meeting closeout job.

### 3. Close the 25-item activity spec with evidence

1. Build an acceptance matrix mapping every item in `docs/specs/workbench-activity-reconciliation.md` to a test or live read-only check.
2. Add missing checks for two-tab apply, late evidence, source-state spread, restart/resume, no-op suppression, raw-source leak search, keyboard, reduced motion, and phone width.
3. Record real read-only request IDs and redacted counts.
4. Do not apply Jira changes, create external drafts, send mail, or write real Brain content during verification.

Dependency: activity saved-step migration.

### 4. Simplify Today into a decision-quality daily surface

1. Keep the one snapshot path.
2. Add a higher-level summary above the noisy waiting list: what changed today, what is blocked on Steve, what is stale, and what is just shadow history.
3. Group duplicate pending recommendations by target and reason.
4. Add per-source observed time, age, and stale reason in the UI.
5. Make loop mode plain: off, shadow only, or acting.

Dependency: activity spec evidence and improved duplicate suppression.

### 5. Build the shared approval channel

1. One server module for staged actions, claim-once approval, decline, expiry, exact effect, receipt, and readback.
2. Use it for Jira review, MDM reconciliation, activity reconciliation, Workbench agent actions, meeting visuals, and future Outlook proof/send.
3. Keep sends and meeting invites ask-first in code.
4. Add two-tab tests for every action class that can reach an external system.

Dependency: saved state engine and existing review flows.

### 6. Build the loop dispatcher only after the above is proven

1. Add a prompt assembler that builds frozen briefs from item, Jira links, meeting package, Brain history, receipts, rules, and voice profile.
2. Add dispatcher queue, claim, heartbeat, timeout, bounded retry, restart reconciliation, and isolated worktree for code tasks.
3. Add ledger health as a startup and per-pass prerequisite before any acting step.
4. Enforce frozen brief and reconcile-before-resume.
5. Add degraded-model handling: pause or use an approved smaller model only when allowed by the work class.

Dependency: shared approval channel and activity saved-step migration.

### 7. Build the verifier module

1. Mechanical checks: file, route, Jira readback, shape, saved hash.
2. Content checks: evidence match, banned-word scan, Steve voice, no raw-source leak.
3. Consequence checks: rerun the relevant scan and require no remaining finding for the scoped work.
4. Only verifier can mark a loop run done.

Dependency: dispatcher and shared receipts.

### 8. Finish foreman, standup, and retro

1. Feed foreman only from receipts, escalations, approvals, and source states.
2. Morning standup: overnight ran, waiting on Steve, failures, current schedule.
3. Evening retro: completed work, failed work, token totals, verification rates, work-class tier changes.
4. Every escalation includes what failed, where, impact, and fix in flight.

Dependency: dispatcher, verifier, receipts, approval channel.

### 9. Build the memory spine

1. Each run starts with related ticket history, meeting history, Brain history, earlier receipts, and operating rules.
2. Store compact next-turn state for resumed work.
3. Detect contradictions between new findings and earlier Brain or Jira records.
4. Keep private/raw sources out of browser payloads and repo state.

Dependency: dispatcher and verifier.

### 10. Finish Outlook proof-and-send last

1. Add pure field-check tests first.
2. Implement proofing against a draft with screenshots and checked fields.
3. Require per-instance Steve approval before UI send.
4. Verify the sent item through the Microsoft read path.
5. Store proof and readback receipt.

Dependency: shared approval channel, CUA safety receipts, and verifier.

### 11. Repair the Brain ingestion foundation

1. Split graph generation into source discovery, source-specific extraction, stable-ID resolution, relationship assembly, receipt checks, synthesis summaries, and output validation.
2. Add schemas for every exported read model and graph.
3. Refuse dangling links, duplicate stable IDs, unsupported relationship names, and important links without source evidence.
4. Emit a run manifest with counts, changed records, rejected records, confidence spread, and timing.
5. Rebuild from the current Brain and publish measured results.

Dependency: stable meeting and activity records.

### 12. Split large files without changing behavior

1. Route modules out of `server/jira-gateway.mjs`.
2. Closeout source reconciliation, synthesis, Brain storage, visual jobs, package inspection, and HTTP routing out of `server/meeting-closeout.mjs`.
3. Feature routes out of `src/App.tsx`.
4. Feature CSS out of `src/App.css`, keeping shared tokens together.
5. One page registry for nav, mobile tabs, titles, icons, and agent destinations.
6. Remove unused 3D packages after confirming no current import.
7. Split heavy browser chunks.

Dependency: strong tests around existing behavior.

### 13. Product polish on proven data

1. Today remains the concise daily view.
2. Agent Board remains the full work and receipt view.
3. Work remains the Jira review and execution surface.
4. Meetings remains prep, capture, closeout, follow-up, and visual review.
5. Brain Explorer follows rebuilt knowledge data and source evidence.
6. Every stale or partial value names the observation time and reason.

Dependency: data trust and runtime split.

### 14. Operations proof

1. Run full `npm run ci` or record exact existing failures.
2. Add fixture smoke for the full daily path.
3. Add read-only live smoke with timestamps, response codes, source states, and redacted counts.
4. Test stopped server, stale lease, interrupted job, corrupt state, and disconnected credential drive.
5. Run two weeks of shadow observation before enabling any new automatic class.
6. Publish stop, resume, repair, backup, and rollback instructions.

Dependency: all acting modules and approval paths.

## Immediate Next Block

1. Finish visual replacements in small reviewed batches.
2. Move activity reconciliation onto `server/workbench-state` saved steps.
3. Build the activity acceptance matrix with exact check names.
4. Improve Today grouping so current data reads as trustworthy rather than noisy.
5. Keep the loop in off or shadow mode until dispatcher, verifier, approval channel, and retro exist with evidence.
