# Self-Driving Workbench: Build Plan

Authoritative as of 2026-08-16. This document decides the build order.

It replaces the ordering in `SELF-DRIVING-WORKBENCH-REMAINING-BUILD.md`, which is now history.
That document is still worth reading for its scorecard, its source audit, and its per-area
proof matrix. Its Block A, Block B, and Block C ordering was rejected and must not be followed.

## Why the previous order was stopped

Three independent reviews read the previous plan on 2026-08-15. All three said do not start
Blocks A, B, or C as written. The consensus was not a rejection of the product. All 28 focused
state, saved-step, meeting-job, and activity lifecycle checks passed. The spine is real.

The problem was inversion. Block B created Jira issues automatically at its line 890, while
Block C did not build the shared staged-action service until its line 900. The plan promised
autonomous external effects before building the protections that make an external effect safe
to retry.

Five specific defects sat behind that:

1. **Action identity was self-contradicting.** The plan required changed evidence to return
   under a stable identity, and also derived that identity from the evidence hash. Both cannot
   be true. Changed evidence produced a second action instead of a new revision.
2. **The saved-step runner is not safe for an external effect.** It records started, runs the
   step, saves output, then records success. A process that dies after Jira accepts a request
   but before success is recorded will run the step again on resume.
3. **A stale worker can still write.** The runner claims a lease at the start, never renews it
   during a long step, and never rechecks ownership before saving output. `resumeWorkItem()`
   appends a resume event without proving the caller may replace the current owner.
4. **"Only the verifier can mark complete" was not enforced.** Any caller with state access can
   append a completion event.
5. **Five mandatory reviewer passes per action** would add latency and five chances to time out
   without adding independence, because the same model on the same evidence returns correlated
   opinions.

The full review is preserved at `docs/architecture/reviews/20260815-build-sequence-review.md`.

## Corrections to the Definition of Finished

The previous Definition of Finished is kept except for the lines below, which promised more
than the system can honestly deliver.

**Replaced.** The old line 61 said every approved external effect is "claimed once, performed
once, read back, and recorded." Performed once cannot be promised across process loss. The
honest promise is:

> Each release is claimed once locally. The external system uses a repeat-suppression key where
> it supports one. Any uncertain result is reconciled against the destination before another
> attempt, and every confirmed result is read back.

**Replaced.** The old line 66 said only the verifier can mark a self-driving run complete. The
state layer must enforce that rather than trusting callers. Completion of externally acting
work requires a saved verification receipt carrying the exact action revision, the effect
receipt, destination readback, the current lease generation, the required checks for that work
class, and no unresolved uncertainty. The state layer rejects completion without it.

**Replaced.** Five independent review lanes on every action become review levels selected by
consequence and uncertainty. See the review levels below.

**Added.** A Product Success section, because the old definition could be satisfied in full
while still leaving Steve spending the same time on meetings and Jira.

## Product Success

Technical proof is not the point. These are the measures that decide whether the Workbench is
worth running, measured from the first real meeting rather than at the end of the build.

| Measure | First target |
| --- | --- |
| Steve's minutes of effort per processed meeting | Under 5 |
| Jira recommendations accepted with no factual correction | At least 70% |
| Follow-ups Steve believes existed that the system found | At least 80% |
| Duplicate external effects | Zero |
| Uncertain effects shown as uncertain rather than silently successful | All |
| Follow-ups the system missed | Logged every time, not just recommendations logged |
| Time from meeting end to tracked follow-up | Recorded from the first meeting |
| Runs requiring manual repair | Recorded from the first meeting |

These numbers are a starting position, refined after the first week of real use.

## Action identity

One follow-up has one permanent lineage. Evidence and payload hashes belong on revisions, never
on the lineage.

| Record | Changes when evidence changes | Purpose |
| --- | --- | --- |
| `actionId` | No | Permanent lineage for the follow-up |
| `actionRevisionId` | Yes | Exact evidence and proposed payload version |
| `effectId` | Yes | One approved destination operation for one revision |
| `effectAttemptId` | Yes | Individual attempt and reconciliation history |
| Readback receipt | Yes | What the destination actually contains |

The matching rule: assign or match one persistent lineage using the meeting, work class, owner,
intent, and existing history.

This also applies to `meetingCloseoutJobId()` in `server/meeting-closeout-job.mjs`, which hashes
the whole payload today, so a corrected transcript creates a new work-item id instead of a new
revision of the same one.

## External-effect lifecycle

Built once, reused by Jira, Brain, Outlook, Teams, and providers.

```text
prepared -> claimed -> attempting -> confirmed -> read_back
                            |
                            +-> uncertain -> reconcile -> confirmed | failed
```

An uncertain result never becomes a second request without reconciliation against the
destination first.

## Review levels

Review depth follows consequence and uncertainty. Most safety comes from mechanical protections
rather than from more opinions: stable identity, duplicate search, field validation, destination
revision checks, frozen payloads, execution claims, readback, and reconciliation.

| Level | Example | Required review |
| --- | --- | --- |
| 0 | Read-only Jira match, or an obvious no-op | Mechanical checks only |
| 1 | Jira recommendation awaiting Steve's approval | Evidence check, destination check, frozen payload |
| 2 | Higher-impact Jira or Brain change | Evidence, adversarial review, execution review |
| 3 | Communication or consequential external action | All relevant checks, exact final preview, explicit approval |
| 4 | A narrow class that later earns autonomy | Level 3 checks plus measured history and an immediate disable control |

Initiative value, impact, and dependency analysis are structured data and related-record queries
by default. Deeper model judgment is invoked when an action is ambiguous or consequential, not
on every round.

## Extract as touched

No broad rewrite of `jira-gateway.mjs`, `App.tsx`, or `App.css` before the action flow is
proven, and no nine more phases of adding to them followed by one enormous extraction.

- New action logic goes into an owned action module.
- New effect logic goes into an owned effect module.
- New review logic goes into an owned review module.
- Route files compose those modules.
- Unrelated existing behavior stays as it is.
- Wider CSS and bundle reduction stays later.

## The build order

```text
0. Preserve and rewrite
   |
   v
1. Action-Safe State          <- first code phase
   |
   v
2. Activity on saved steps
   |
   v
3. Meeting Action Ledger      (recommendation-only)
   |
   v
4. One reviewed Jira path     (approve -> claim -> create -> read back)
   |
   v
5. Real-meeting pilot         (10 to 20 real meetings, measured)
   |
   v
6. Risk-selected review and shadow dispatch
   |
   v
7. One automatic Jira work class
   |
   v
8. Wider autonomy
```

Two lanes run alongside and are never what the rest of the work waits on:

- **Visual reliability.** Provider cancellation and late-result protection, then timeboxed
  recovery of the 14 evidence-limited meetings. Meetings that stay blocked stay blocked, which
  is honest and sufficient.
- **Structural extraction.** New modules extracted as those areas are touched.

### What is buildable and what is time-bound

Phases 0 through 4 are limited by build effort. Phase 5 is limited by the calendar: it requires
10 to 20 real meetings to actually happen and be processed. Phases 6 through 8 are shaped by
what Phase 5 measures, so specifying them in detail before then would be false precision.

Every phase ends with its completion proof, then the automatic phase infographic once Steve and
the builder agree it is finished.

---

# Phase 0: Preserve and rewrite

**Status: in progress, 2026-08-16.**

Outputs, dependencies, allowed effects, and proof.

| Item | State |
| --- | --- |
| 1. Inventory the tracked and untracked changes | Done. `docs/mythos/evidence/20260816-phase-0-checkout-inventory.md` |
| 2. Map each change to complete, partial, paused, or inherited | Done, same file |
| 3. Create recoverable checkpoints | Done. 11 commits on `main`, pushed `34b6684..90e9c64` |
| 4. Rewrite the active plans around the reviewed order | This document, plus history banners on the superseded ones |
| 5. Park the prematurely started meeting-action work | Done, recorded in the inventory |
| 6. Create the phase, task, and subtask register | This document |
| 7. Define Phase 1 completion checks | `docs/mythos/gates/20260816-action-safe-state.md` |
| 8. Confirm the revised plan with Steve | Open |
| 9. Automatic Phase 0 infographic | After item 8 |

**Allowed effects:** documents and git only. No code behavior change.

**Completion proof:** no active plan document disagrees with the reviewed order; the parked
work is named and recorded; Phase 1 has written checks that can fail; Steve has confirmed.

**Stop condition:** if Steve rejects the revised order, stop and re-plan rather than starting
Phase 1.

---

# Phase 1: Action-Safe State

The first code phase. Called Foundation Block 1.5 in the review.

**Primary files:** `server/workbench-state/index.mjs`, `server/workbench-state/step-runner.mjs`,
their focused tests, and a separate external-effect record module if that is cleaner.

**Allowed effects:** none. No new page, no new autonomous behavior, no live Jira, Brain,
Outlook, Teams, or email effect at any point in this phase.

**Recommended isolation:** a branch or worktree, per the review, so a later reviewer can tell a
new regression from the work already in `main`.

## 1.1 Action identity

- Permanent `actionId` with no evidence hash in it.
- `actionRevisionId` carrying the evidence and payload hashes.
- `effectId` per approved destination operation.
- `effectAttemptId` per attempt.
- Readback receipt record.
- Lineage matching on meeting, work class, owner, intent, and history.
- Repair `meetingCloseoutJobId()` so a corrected transcript revises rather than duplicates.

## 1.2 Lease safety

- A lease generation value issued on claim.
- Heartbeat renewal during long steps.
- Ownership recheck before every durable write and before completion.
- Rejection of output from an expired generation.
- Process-start identity rather than pid alone, because Windows recycles pids.

## 1.3 Resume safety

- Resume cannot displace a live owner without an approved recovery condition.
- Genuinely dead owners are detected.
- Completed steps are preserved.
- Only unfinished work resumes.

## 1.4 External-effect lifecycle

- The state machine above, implemented once.
- Reconcile before retry on any uncertain result.
- Readback on every confirmed result.
- Repeat-suppression key used where the destination supports one.

## 1.5 Completion authority

- Completion of externally acting work requires a verification receipt.
- The receipt must carry the current action revision, the effect receipt, destination readback,
  the current lease generation, and the required checks for the work class.
- Unresolved uncertainty rejects completion.
- An ordinary caller cannot mark externally acting work complete.

## 1.6 Stop and cancellation

- A stop signal reaches the active provider.
- Output returned after cancellation is quarantined.
- Stopped work is not selected again later.
- `AbortSignal` or equivalent enters the saved-step interface rather than a second scheduler.

## 1.7 Safe stored and browser data

Moved forward from the old Phase 15 because these are prerequisites for a live effect, not
finishing work.

- Explicit public-field allowlists for page and event models.
- Redaction of saved inputs, outputs, events, and browser models.
- Secret scan across saved state.
- Secret scan across page payloads.
- Corrupt-state quarantine.
- A minimal backup and restore check.

Left for later, before unattended operation: journal compaction at scale, off-machine archive
schedules, long soak runs, resource forecasting, and full machine-reboot exercises.

## 1.8 Failure exercises

Each one is a check that can fail.

1. Process loss before the request.
2. Process loss after the external response.
3. Lease expiry during long work.
4. A stale worker returning late.
5. Resume attempted during active ownership.
6. A duplicate request attempt.
7. A corrupt saved record.
8. Stop during provider execution.

## Phase 1 completion proof

The nine required checks are written in `docs/mythos/gates/20260816-action-safe-state.md`.
Summarized: two create events cannot redefine one work-item id; changed evidence creates a
revision under the same lineage; different unsafe ids cannot map to one state path; an expired
lease admits a new owner and the old owner cannot write afterward; resume cannot displace a live
owner; process loss after an external response produces an uncertain effect rather than a second
request; a stop reaches the provider or marks later output unusable; completion without a
verification receipt is rejected; and public page models refuse unapproved fields.

Plus: restart exercises, no live external effect, independent review, and the automatic
infographic.

**Stop condition:** if the effect lifecycle cannot be implemented once and reused, stop before
Phase 2 rather than special-casing Jira.

---

# Phase 2: Activity on saved steps

**Depends on:** Phase 1.

**Allowed effects:** none live. Recommendation and review paths only.

- Move activity reconciliation onto the shared resumable engine.
- Save each completed source unit separately and skip it after interruption.
- Reuse the same run id after stop or process loss.
- Isolate source failures and continue with valid sources.
- Suppress duplicates inside a run and across earlier runs.
- Keep a changed item eligible under the same identity when its content hash changes.
- Use the meeting job as the only activity meeting processing path.
- Keep browser state a projection of saved server state.
- Resolve the unused `clock` in `activity-lifecycle.mjs:237` while in this file.

**Completion proof:** stop and resume after every step; completed sources are not called again;
one source failure does not erase other results; an unchanged repeat run produces no new review
item; a changed item returns exactly once.

**Closes:** the non-effect acceptance items from the 25-item activity matrix. The items that
require a live mutation stay open until Phase 4.

---

# Phase 3: Meeting Action Ledger, recommendation only

**Depends on:** Phases 1 and 2.

**Allowed effects:** none. Nothing in this phase creates a Jira issue.

- One saved action record per meeting follow-up, on the Phase 1 lineage.
- Revision history as evidence changes.
- Search for and suggest existing Jira matches.
- Build recommendation-only Jira payloads.
- Assess autonomous suitability and store it.
- Value, impact, and dependency analysis as structured data and related-record queries.
- Show the recommendation, any existing Jira key, and truthful run state in the meeting modal.
- Rebuild the paused `src/features/meeting-actions/` work on the corrected identity.

**Language rule:** product copy and generated documents say "recommended Jira change(s)". The
typed apply phrase is APPLY N JIRA CHANGE(S). Never the word Steve reserves for an RFP
submission.

**Completion proof:** a follow-up keeps one identity across changed evidence; a duplicate
recommendation cannot appear for the same follow-up; the modal states plainly when no Jira work
and no run exist.

---

# Phase 4: One reviewed Jira path

**Depends on:** Phase 3. This is the first live external effect in the whole plan.

Freeze one exact Jira payload, Steve approves that exact instance, claim it once, create or
link it, read it back, associate it with the meeting, and show the result everywhere.

- Frozen release package with hashes, prepared before approval.
- Approval releases the frozen bytes and does not regenerate anything.
- Claim once, with a repeat-suppression key.
- Readback of the created or linked issue.
- Uncertain result reconciled against Jira before any retry.
- Meeting association recorded.
- Result visible on Today, Agent Board, Work, and the meeting modal from one saved state.

**Jira mechanics that already apply:** priority values are `Priority 1` through `Priority 5`;
create minimal then set each field group separately, refetching `expectedUpdated` before each
call; estimates use the 3.5x normalized effort multiplier; text never says "brain" and never
carries a storage path.

**Completion proof:** process loss after the create response produces an uncertain effect and a
reconciliation, never a duplicate issue; the released bytes match the approved hashes exactly;
readback matches what was approved.

**Stop condition:** any duplicate issue created during this phase stops the phase.

---

# Phase 5: Real-meeting pilot

**Depends on:** Phase 4. **Limited by the calendar, not by build effort.**

Process 10 to 20 real meetings and measure the Product Success table above. Record Steve's
effort, factual edits, missed follow-ups, unnecessary follow-ups, duplicate work, readback
success, and recovery failures.

Misses are logged, not just recommendations. A follow-up Steve entered himself because the
system did not find it is the most valuable measurement in this phase.

**Completion proof:** 10 to 20 meetings processed with the measures recorded, and a written
read of what the numbers say.

---

# Phase 6: Risk-selected review and shadow dispatch

**Depends on:** Phase 5 evidence.

Select review depth from consequence and uncertainty using the review levels. Run dispatch in
shadow without releasing effects, and repair the failure patterns Phase 5 actually showed.
Specified in detail one phase before it starts.

---

# Phase 7: One automatic Jira work class

**Depends on:** Phase 6 and Phase 5 measures supporting it.

Enable exactly one narrow, reversible Jira work class to proceed without Steve. Exceptions still
come to him. Immediate disable control required. Specified one phase before it starts.

---

# Phase 8: Wider autonomy

**Depends on:** each class having its own clean evidence.

Expand gradually to more Jira work, Brain updates, Outlook, Teams, and recipient groups. Keep
work class and recipient group as the units, with explicit allowlists, rolling performance
windows, and immediate demotion after any material factual or recipient error. There is no
global autonomy switch.

Deferred to here: the general dispatcher, the full role roster, the work-class maturity engine,
recipient-level maturity, and foreman, retro, and cost reporting beyond what Phase 5 needed.

---

## Standing rules that outrank this plan

- No prose presented as Steve is generated from templates, keyword matching, or string
  interpolation. A model writes every word from real evidence, or the item is withheld.
- Fail closed. A missing answer beats a fabricated one. Empty is a valid answer.
- Every extracted claim quotes its source verbatim, and drops are recorded.
- Functional logic changes need fail-then-pass evidence.
- No background poller starts a Microsoft read.
- One job per material action, ever. Terminal indeterminate means it very likely succeeded.
