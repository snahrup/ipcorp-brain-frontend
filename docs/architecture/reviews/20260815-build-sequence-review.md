# Build sequence review, 2026-08-15

Three independent reviews of the previous build order. Verdict: no go on the sequence,
continue the project. This is the source the current build plan was written from.

Preserved verbatim below.

---

[crimson-compass-669]

## Verdict

**Do not continue from this build plan as currently ordered.**

That is a **NO GO on the sequence**, not a rejection of the Workbench. The product direction is strong, and the current foundation is real. The next step should be a surgical rewrite of the plan plus one small state-safety block before activity migration or Jira execution continues.

I did not change any files.

### The three opinions

| Reviewer                     | Verdict                              | Main conclusion                                                                                                                                                           |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **My review**                | Conditional go after rewrite         | Phase 3A combines several later systems and cannot be completed where it sits.                                                                                            |
| **Codex engineering review** | **No go**                            | The current state and saved-step engine handle normal recovery well, but are not yet safe for external effects under process loss, stale workers, or uncertain responses. |
| **Claude product review**    | Conditional go after major scope cut | The plan defines how the system proves itself, but not whether it materially saves you time or mental effort.                                                             |

**Consensus:** Do not start Blocks A, B, or C exactly as written.

The good news is important: all **28 focused state, saved-step, meeting-job, and activity lifecycle tests passed**. This is not a teardown. You have a credible spine. It needs a few specific protections before you hang autonomous Jira and communication work from it.

---

# What is genuinely strong

Several parts should remain central:

1. **One Workbench with five surfaces.** Today, Agent Board, Work, Meetings, and Brain Explorer form a coherent product instead of five disconnected utilities.

2. **Server-built page snapshots.** The current `TodayView.tsx` now makes one request to `/today/snapshot`. The target document is correct here; the older roadmap statement about four requests is stale.

3. **Honest partial and blocked states.** Refusing to invent meeting content or visuals when evidence is missing is one of the strongest trust decisions in the product.

4. **The saved-step model.** Inputs are saved, completed outputs are validated, interrupted work resumes, and previous valid steps are skipped. The eight-step meeting closeout is a strong first consumer.

5. **Frozen release packages.** Preparing the exact final payload and files before asking for approval is excellent. Approval should release those exact bytes rather than regenerate anything.

6. **Verify before retry.** This is the right posture whenever Jira, Outlook, Teams, Brain, or a provider returns an uncertain result.

7. **Separate maturity by work class.** Keep the concept, but do not build the full promotion engine until real usage gives you enough evidence to define it sensibly.

---

# The critical problems

## 1. Phase 3A depends on systems that do not exist until Phases 6 through 9

Phase 3A currently promises:

* Automatic Jira creation at lines 299–311.
* Five-reviewer convergence at lines 313–339.
* Graduated autonomous execution at lines 341–357.
* Frozen release execution at lines 359–377.
* Shared live state across four views at lines 379–391.
* Autonomous runs surviving restart at lines 393–407.

But the machinery required for those promises appears later:

* Shared staged actions: lines 457–481.
* Prompt assembly: lines 483–505.
* Dispatcher: lines 507–527.
* Verifier: lines 529 onward.

The same inversion appears in the implementation blocks:

* Block B says to auto-create Jira at line 890.
* Block C does not build the shared staged-action service until line 900.

**Phase 3A is actually three separate phases compressed into one:**

1. Action identity and read-only projection.
2. Reviewed Jira release with readback.
3. Autonomous dispatch and wider execution.

Split them. The first is ready to design. The second requires state-engine repairs. The third should wait for measured usage.

---

## 2. `actionId` is not stable as currently defined

The activity requirements say changed evidence must return under the same stable identity:

* `SELF-DRIVING-WORKBENCH-REMAINING-BUILD.md:255`

The proposed identity then includes the evidence hash:

* `SELF-DRIVING-WORKBENCH-REMAINING-BUILD.md:286`

Those cannot both be true. A changed evidence hash creates a new `actionId`, producing a second action instead of a new revision of the existing action.

The current meeting job has the same lineage issue:

* `server/meeting-closeout-job.mjs:66-67`

`meetingCloseoutJobId()` hashes the entire payload. A corrected transcript or expanded source set therefore creates a new work-item ID.

You need distinct identities:

| Record             | Changes when evidence changes? | Purpose                                             |
| ------------------ | -----------------------------: | --------------------------------------------------- |
| `actionId`         |                             No | Permanent lineage for the follow-up                 |
| `actionRevisionId` |                            Yes | Exact evidence and proposed payload version         |
| `effectId`         |                            Yes | One approved destination operation for one revision |
| `effectAttemptId`  |                            Yes | Individual attempt and reconciliation history       |
| Readback receipt   |                            Yes | What the destination actually contains              |

A practical rule:

> Assign or match one persistent action lineage using the meeting, work class, owner, intent, and existing history. Put evidence and payload hashes on immutable revisions, not on the lineage ID.

---

## 3. The saved-step runner is not safe for an external effect yet

The current runner performs this sequence:

```text
Record step started
        |
        v
Run step, possibly changing Jira or another system
        |
        v
Save output artifact
        |
        v
Record step succeeded
```

Relevant code:

* Claim occurs around `server/workbench-state/step-runner.mjs:385`.
* `step.run()` occurs at line 462.
* Output is saved around line 471.
* Success is recorded around line 499.

A process can die after Jira accepts the request but before local success is recorded. On resume, the step runs again.

That means the plan cannot promise “performed once” at line 61. What the Workbench can honestly promise is:

> Each release is claimed once locally. An external system uses a repeat-suppression key where supported. Any uncertain result is reconciled against the destination before another attempt, and every confirmed result is read back.

External-effect steps need explicit states:

```text
prepared
   |
   v
claimed
   |
   v
attempting
   |----------------------|
   v                      v
confirmed              uncertain
   |                      |
   v                      v
read_back             reconcile
                          |
                   confirmed / failed
```

This should be implemented once and reused by Jira, Brain, Outlook, Teams, and providers.

---

## 4. A stale worker can still write after its lease is no longer valid

The runner claims a lease at the beginning but does not renew it during a long step or recheck ownership before saving output.

There are two additional concerns:

* `resumeWorkItem()` at `server/workbench-state/index.mjs:324` appends a resume event without proving that the caller may replace the current owner.
* The projector clears the lease when it sees that resume event.

A slow worker could continue running while another process resumes and claims the same work. The original worker could then save output and mark the step successful.

Before live effects, add:

* A lease generation or fencing value issued on claim.
* Heartbeat renewal during long steps.
* Ownership recheck before every durable write and before completion.
* Rejection of output from an expired generation.
* Process-start identity rather than PID alone.
* Authorized resume that cannot silently displace a live owner.

This is more important than adding the general dispatcher. The dispatcher would only amplify the current weakness.

---

## 5. “Only the verifier can mark complete” is not currently enforced

The plan says only the verifier may mark a self-driving run complete at line 66.

The current primitives do not enforce that:

* Any caller with state access can append `work_item.completed`.
* `createCompletionPhases()` in `activity-lifecycle.mjs:199` constructs successful phases from the saved summary.
* `runCompleted()` accepts both `completed` and `partial_success` at lines 397–424.

That is acceptable for the current foundation, where automatic execution is off. It is not sufficient once completion could imply that an external change happened correctly.

Completion should require a saved verification receipt with:

* The exact action revision.
* The effect receipt.
* Destination readback.
* The current lease generation.
* Required checks for that work class.
* No unresolved uncertainty.

The state layer should reject completion without that evidence rather than depending on callers to behave.

---

## 6. Five reviewer passes for every action will make the system slower without necessarily making it safer

Lines 313–339 require five reviewers to return no unresolved findings in the same round. A timeout counts as a finding, every repair reruns all five, and downstream actions can recursively enter the same process.

Different role names are not independence by themselves. If the same model receives substantially the same evidence and instructions, you may get five correlated opinions plus five opportunities to time out.

Most safety should come from:

* Stable action identity.
* Duplicate search.
* Field validation.
* Destination revision checks.
* Frozen payloads.
* Execution claims.
* Readback.
* Uncertain-result reconciliation.

Use **review levels** instead:

| Review level | Example                                        | Required review                                                             |
| ------------ | ---------------------------------------------- | --------------------------------------------------------------------------- |
| 0            | Read-only Jira match or obvious no-op          | Mechanical checks only                                                      |
| 1            | Jira proposal awaiting your approval           | Evidence check, destination check, frozen payload                           |
| 2            | Higher-impact Jira or Brain change             | Evidence, adversarial review, execution review                              |
| 3            | Communication or consequential external action | All relevant checks, exact final preview, explicit approval                 |
| 4            | Narrow class that later earns autonomy         | Same checks as Level 3, plus measured history and immediate disable control |

The Initiative Value and Impact/Dependency work should usually be structured data and related-record queries, not separate model calls on every round. Invoke deeper judgment when the action is ambiguous or consequential.

---

## 7. Some Phase 15 work must happen much earlier

Phase 15 contains several items at lines 693–715 that are prerequisites for action execution, not finishing work:

### Move before the first live Jira effect

* Public page and event field allowlists.
* Redaction of saved inputs, outputs, events, and browser models.
* Lease/process identity protections.
* Child-process cancellation.
* Corrupt-state quarantine.
* Uncertain-effect recovery.
* A minimal backup and restore check.
* Secret scanning across page payloads and saved state.

### Keep later, before unattended operation

* Journal compaction at scale.
* Off-machine archive schedules.
* Long soak runs.
* Broader resource forecasting.
* Extensive recorder evidence.
* Full machine-reboot exercises.

Codex wanted nearly all operational work moved forward. I would not go that far. The narrow proposal-only slice does not require a 72-hour soak or a complete archive program. The effect-safety subset does need to move forward.

---

## 8. The document has no measurable human-success definition

The current Definition of Finished is almost entirely system behavior. It could satisfy every bullet and still leave you spending the same amount of time managing meetings and Jira.

Add a separate **Product Success** section with measures such as:

* Your minutes spent per processed meeting.
* Time from meeting end to tracked follow-up.
* Percentage of follow-ups accepted without factual edits.
* Percentage accepted after edits.
* False or unnecessary actions per meeting.
* Follow-ups the system missed and you entered yourself.
* Duplicate Jira issues created.
* External results successfully read back.
* Runs requiring manual repair.

A sensible first proving period is 10 to 20 real meetings. Initial targets could be:

* Under five minutes of your effort per meeting.
* At least 70% of Jira proposals accepted without factual correction.
* At least 80% of the follow-ups you believe existed are found.
* No duplicate external effect.
* Every uncertain effect becomes visibly uncertain, never silently successful.
* Every miss is logged, not merely every proposal.

Those numbers can be refined after the first week. The key is measuring value from the first real meeting, not in Phase 10.

---

## 9. Phase 14 is too late for all structural extraction

You do not need a broad rewrite of `jira-gateway.mjs`, `App.tsx`, or `App.css` before proving the action flow.

You also should not spend nine more phases adding logic to them and then attempt one huge extraction.

Use an **extract-as-touched rule**:

* New action logic goes into an owned action module.
* New effect logic goes into an owned effect module.
* New review logic goes into an owned review module.
* Route files compose these modules.
* Existing unrelated behavior stays unchanged.
* Broader CSS and bundle work remains later.

This preserves the minimal-change approach without feeding already oversized files.

---

## 10. The current checkout needs a recovery point before another block begins

Current state:

* Branch: `main`
* 51 tracked files modified.
* 40 untracked paths.
* Approximately 6,430 insertions and 1,847 deletions.

The handoff already says the next block should migrate activity without starting a live Jira or email action. That is a sound instruction.

Before another implementation pass:

1. Inventory which completed blocks own each current change.
2. Create durable checkpoint commits or equivalent recoverable snapshots.
3. Record any inherited failures.
4. Update the stale roadmap statement about Today.
5. Start the next block in a clean branch or worktree.

Otherwise a later reviewer cannot reliably distinguish a new regression from the substantial work already sitting in `main`.

---

# Revised build sequence

```text
0. Preserve the current checkout
   |
   v
1. Foundation Block 1.5
   State identity, lease fencing, effect records,
   authorized completion, cancellation, public-field rules
   |
   v
2. Move activity onto shared saved steps
   No live Jira or communication effect
   |
   v
3. Meeting Action Ledger v1
   Stable action lineage, revisions, Jira matches,
   proposal-only interface
   |
   v
4. Reviewed Jira vertical slice
   Frozen payload -> your approval -> claim ->
   create/link -> readback -> meeting association
   |
   v
5. Run 10-20 real meetings and measure outcomes
   |
   v
6. Add risk-selected reviews and shadow dispatch
   based on observed failure patterns
   |
   v
7. Enable one narrow, reversible Jira work class
   |
   v
8. Consider wider Jira, Brain, Outlook, Teams,
   and recipient-group autonomy
```

Two lanes can run alongside that sequence:

```text
VISUAL LANE
Provider cancellation and late-result protection
-> timeboxed historical source recovery
-> leave genuinely blocked meetings blocked

STRUCTURE LANE
Extract new modules as touched
-> later bundle and CSS reduction
```

The 14 historical source-blocked meetings should not prevent the state and action work from proceeding. Recover commercially relevant evidence when available; otherwise the existing blocked state is honest and sufficient.

---

# Decision on the current three implementation blocks

## Block A: Modify, do not execute as written

### Keep

* Provider work on top of the shared saved-step engine.
* Exact task-result association.
* Cancellation and late-result quarantine.
* Source revision protection.
* NotebookLM as an explicitly selected alternative.

### Change

* Do not create a second provider scheduler.
* Add `AbortSignal` or equivalent cancellation into the saved-step interface.
* Make the provider worker present its current lease generation before its result is accepted.
* Treat historical source recovery as parallel, timeboxed work.
* Do not make all 14 meetings a prerequisite for the action ledger.

## Block B: Partially proceed after Foundation Block 1.5

### Proceed

* Move activity onto saved steps.
* Add stable action records and revisions.
* Search and suggest existing Jira matches.
* Build proposal-only Jira payloads.
* Display the proposal in the meeting modal.
* Close the non-effect acceptance items.

### Do not proceed yet

* Automatic Jira creation.
* Autonomous work runs.
* All-four-view live execution state.
* Recursive downstream action creation.
* Promotion to autonomous execution.

## Block C: Break apart

### Move earlier

* Frozen release packages.
* Exact payload approval.
* Readback and uncertain-result handling.

### Replace

* Five universal reviewers with review levels selected by consequence and uncertainty.

### Defer until after the real-meeting pilot

* General dispatcher.
* Full role roster.
* Work-class maturity engine.
* Recipient-level maturity.
* Wider autonomous execution.
* Foreman, retro, and cost reporting beyond the minimum needed to evaluate the pilot.

---

# First implementation block I would approve

Call it **Foundation Block 1.5: Action-Safe State**.

It should touch primarily:

* `server/workbench-state/index.mjs`
* `server/workbench-state/step-runner.mjs`
* Their focused tests
* A small external-effect record module if keeping it separate is cleaner

Required checks:

1. Two different create events cannot redefine one work-item ID.
2. Changed evidence creates a new revision under the same action lineage.
3. Different unsafe IDs cannot map to the same state path.
4. A lease expiring during a long step allows a new owner, but the old owner cannot write afterward.
5. A resume cannot displace a live owner without an approved recovery condition.
6. Process loss after an external response creates an uncertain effect, not an automatic second request.
7. A stop signal reaches the active provider or marks any later output unusable.
8. A caller cannot mark externally acting work complete without the required verification receipt.
9. Public page models refuse fields that are not explicitly approved.

No new page. No new autonomous feature. No live Jira mutation.

Then migrate activity.

---

# Where I disagree with the outside reviewers

## Claude: “Cut the visuals”

I would not cut them. You clearly value the visual meeting artifacts, and they have a real role in communicating and retaining information.

I would **decouple them from the critical path**. Provider reliability can advance separately, and old blocked meetings do not need to stop the execution-ledger work.

## Claude: “Delete graduated autonomy”

Too absolute.

Keep autonomy as a product direction, but do not build its full scoring engine yet. The current per-recipient rule will suffer from tiny sample sizes. Start with:

* Work class.
* Recipient group, such as internal familiar, internal unfamiliar, executive, or external.
* Explicit allowlists.
* Rolling performance windows.
* Immediate demotion after a material factual or recipient error.

Real usage should determine the thresholds.

## Codex: “Move all backup, compaction, and operational work forward”

Only partly.

Identity, lease fencing, uncertain-effect recovery, cancellation, public payload rules, and a minimal restore check must move forward.

Full journal compaction, long soak exercises, archive forecasts, and broader operational work can wait until unattended execution is actually approaching.

## Claude: “Always replace computer use with APIs”

Prefer a stable supported API when it exposes the needed fields, actions, and readback. Do not turn that into an absolute rule.

Some workflows may require visible application proof or may not expose the necessary operation through the currently authenticated path. In those cases, a narrow computer-use skill with exact-field verification is reasonable. The mistake would be using GUI automation broadly before confirming an API path is inadequate.

---

# The document changes I consider mandatory

1. Add a measurable Product Success section next to the technical Definition of Finished.

2. Replace the line 286 identity rule so evidence hashes create revisions rather than new action lineages.

3. Split Phase 3A into:

   * Action ledger and projections.
   * Reviewed Jira execution.
   * Later autonomous execution.

4. Move the shared effect and uncertain-result model ahead of any automatic Jira behavior.

5. Replace “performed once” at line 61 with honest local-claim, repeat-suppression, reconciliation, and readback language.

6. Replace five mandatory reviewer passes with consequence-based review levels.

7. Move the essential security and recovery subset out of Phase 15 and into Foundation Block 1.5.

8. Make Block B proposal-only until the reviewed Jira vertical slice proves process-loss recovery.

9. Move product measurement before the dispatcher and maturity engine.

10. Update or mark the older roadmap historical so two documents dated August 14 no longer disagree about Today and the immediate next block.

## Final recommendation

**Continue the project. Stop the current sequence.**

The Workbench has crossed an important threshold: it is no longer a mockup or a pile of aspirational pages. The shared state engine, coherent Today snapshot, meeting reconciliation, and resumable closeout job are real.

That is precisely why the next move matters. Do not jump directly from “resumable internal work” to “self-driving external effects.” Insert Foundation Block 1.5, migrate activity without live writes, then prove one reviewed meeting-to-Jira path against real meetings and real measurements.

That path preserves the ambition without spending months constructing an autonomous operating system before proving that the simplest version already makes your day better.
