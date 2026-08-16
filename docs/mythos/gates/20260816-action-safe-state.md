# Acceptance checks: Phase 1, Action-Safe State

Frozen 2026-08-16, before implementation. Phase 1 is not finished until every check below has
been written as a check that can fail and has passed.

Source: the architecture review of 2026-08-15, `docs/architecture/reviews/20260815-build-sequence-review.md`.
Plan: `docs/architecture/SELF-DRIVING-WORKBENCH-BUILD-PLAN.md`.

## Allowed effects during this phase

None. No live Jira, Brain, Outlook, Teams, email, or provider effect at any point. No new page.
No new autonomous behavior. If a check appears to require a live effect, the check is wrong.

## The nine required checks

### AS-01 One work-item id cannot be redefined
Two different create events for the same work-item id do not produce two definitions. The
second is rejected or recorded as a conflict. It never silently replaces the first.

### AS-02 Changed evidence creates a revision, not a second action
Given an existing action lineage, changed evidence produces a new `actionRevisionId` under the
same `actionId`. It does not produce a second `actionId`. Includes the `meetingCloseoutJobId()`
case: a corrected transcript revises the existing work item.

### AS-03 Unsafe ids cannot collide on one state path
Two different ids that differ only by characters the filesystem folds or strips must not map to
the same saved state path.

### AS-04 An expired lease admits a new owner, and the old owner cannot write
A lease that expires during a long step allows a second owner to claim the work. Any durable
write attempted afterward by the original owner is rejected on its lease generation. Process
start identity is used, not pid alone.

### AS-05 Resume cannot displace a live owner
`resumeWorkItem()` refuses to take over work whose owner is still alive and heartbeating.
Takeover requires an approved recovery condition. A genuinely dead owner is detected and its
unfinished work resumes with completed steps preserved.

### AS-06 Process loss after an external response creates an uncertain effect
A process that dies after the destination responded, but before success was recorded locally,
leaves the effect in `uncertain`. Resume reconciles against the destination first. It never
issues an automatic second request.

### AS-07 A stop reaches the provider or invalidates its output
A stop signal propagates to an active provider. Any output returned after cancellation is
quarantined and cannot be selected as a result. Stopped work is not picked up again later.

### AS-08 Completion without a verification receipt is rejected
The state layer rejects completion of externally acting work unless a saved verification receipt
carries the current action revision, the effect receipt, destination readback, the current lease
generation, and the required checks for the work class. Unresolved uncertainty rejects
completion. An ordinary caller cannot append a completion event for externally acting work.

### AS-09 Public page models refuse unapproved fields
A page or event model built for the browser rejects any field not on its explicit allowlist.
Saved state and page payloads pass a secret scan. A corrupt saved record is quarantined rather
than served.

## Failure exercises

Each is exercised and each has a recorded result.

| # | Exercise | Expected |
| --- | --- | --- |
| 1 | Process loss before the request | No effect record beyond `claimed`; clean resume |
| 2 | Process loss after the external response | `uncertain`, then reconcile |
| 3 | Lease expiry during long work | New owner admitted, old owner's write rejected |
| 4 | Stale worker returns late | Output rejected on lease generation |
| 5 | Resume during active ownership | Refused |
| 6 | Duplicate request attempt | Suppressed or reconciled, never a second effect |
| 7 | Corrupt saved record | Quarantined, not served |
| 8 | Stop during provider execution | Provider stops, late output quarantined |

## Phase proof

- Every check above written as an automated check, failing before the change and passing after.
- Restart exercises run and recorded.
- No live external effect performed at any point, stated explicitly in the evidence record.
- Independent review in fresh context against this file.
- Automatic Phase 1 infographic after Steve and the builder agree it is finished.

## Stop conditions

- The external-effect lifecycle cannot be implemented once and reused across Jira, Brain,
  Outlook, Teams, and providers. Stop rather than special-casing Jira.
- Any check here would require a live external effect to prove. Stop and re-specify.
- Enforcement of AS-08 in the state layer proves impossible without a broad rewrite of
  `workbench-state`. Stop and bring the tradeoff to Steve rather than falling back to trusting
  callers.
