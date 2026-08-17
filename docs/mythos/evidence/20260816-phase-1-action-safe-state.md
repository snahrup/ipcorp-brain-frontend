# Phase 1 evidence: Action-Safe State

Date: 2026-08-16
Branch: `phase-1/action-safe-state`
Checks: `docs/mythos/gates/20260816-action-safe-state.md`
Status: **complete after an independent review returned NEEDS CHANGES and its findings were fixed**

This file was rewritten after the review. The first version overclaimed, and the corrections
are recorded below rather than quietly edited out.

## What was wrong before Phase 1

The state engine trusted its callers. Five defects, all confirmed by reading the code:

| Defect | Where it was |
| --- | --- |
| A second create silently redefined an existing work item | the projector rebuilt the item from whichever create came last |
| Action identity contained the evidence hash | so a corrected transcript produced a second action, not a revision |
| Unsafe ids folded onto one saved-state path | `a/b` and `a_b` became the same directory |
| A lease had no generation, and nothing rechecked ownership before a durable write | a worker whose lease expired could still save output and mark the step successful |
| `resumeWorkItem` appended its event unconditionally | the projector then cleared a live owner's lease |
| Any caller could append `work_item.completed` | "only the verifier can mark complete" was documentation, not enforcement |
| No external-effect lifecycle existed at all | process loss after a destination accepted meant the request ran again on resume |

## What the checks prove

24 checks across two files, all passing:

- `server/workbench-state/action-safe-state.test.mjs`, 17 checks, AS-01 through AS-10.
- `server/workbench-state/action-safe-state-review.test.mjs`, 7 checks added after the review.

## Fail then pass

The first version of this file claimed fail-then-pass on the strength of a single import
error, which is not per-check evidence. The reviewer was right to reject that. Real mutation
evidence was then produced: each protection was disabled in turn and the suite re-run.

| Protection disabled | Check that failed |
| --- | --- |
| the stop watcher | AS-07b |
| the legacy-path collision guard | AS-03c |
| the activity lifecycle presenting its own lease | AS-08d |
| the completion ownership check | AS-08c and AS-08d |
| the whole-payload secret scan | AS-09e |
| the secret scan walking keys, Map, Set, and Buffer | AS-09f |

Every mutation was caught by exactly the check written for it, and reverting restored 7 of 7.
The reviewer's own mutation run covered the original 17 and found AS-01, AS-02, AS-03, AS-03b,
AS-04, AS-04b, AS-05, AS-06, AS-08, AS-09, AS-09c, AS-09d and AS-10 to be real checks that fail
when their protection is removed.

## What the independent review found, and what was done

Verdict: **NEEDS CHANGES**, four findings blocking. All four are fixed.

1. **The stop signal could never reach a running provider.** `controller.abort()` fired only
   after `step.run` had already resolved, so the signal handed to the step was decoration. A
   watcher now polls the event log for the whole time a step is pending and aborts the moment a
   stop appears. Fixed, covered by AS-07b.
2. **The activity lifecycle's ownership recheck was a tautology.** It read the current lease out
   of state and passed it straight back to be compared against itself, so it always matched.
   This was worse than a loosened test: the production code was made vacuous. It now presents
   the lease it actually claimed. Fixed, covered by AS-08d.
3. **The compatibility fallback reintroduced the AS-03 collision.** An id containing unsafe
   characters could resolve to a legacy directory belonging to a different id that folded to the
   same name. The fallback is now offered only to an id whose own characters are already
   filesystem safe, which is the only id that can own that name. Fixed, covered by AS-03c.
4. **The completion lease check was untested.** Fixed, covered by AS-08c.

Non-blocking findings also fixed: the Today scan covered only each source's data and missed
error strings and status details, which is exactly where a token lands when a call fails to
authenticate (AS-09e); the secret scan missed object keys, Map, Set, and Buffer (AS-09f);
`validateSavedOutput` was called with the output where the new fourth argument is the work item
id; and the liveness probe read a pid out of the owner's name only.

## An amendment to AS-07, stated rather than assumed

The frozen wording is "any output returned after cancellation is quarantined." The first
implementation of this quarantined a step's output whenever the abort had fired before the step
returned. That made stop behaviour depend on scheduling: two closeout checks passed or failed
run to run, and a step that had genuinely finished lost its work.

The rule now turns on what the step **did**, not on when the abort happened:

- A step that honours cancellation throws. Its work is quarantined and the job reports stopped.
- A step that returns an output which then validates has finished. Its output is kept, and the
  job stops before the next step.

A step that ignores its signal and returns a validated output cannot be distinguished from one
that finished normally, and its own `validate` passed. Discarding it would make stop lose a
step's worth of progress unpredictably. This is a narrowing of the frozen wording and it is
recorded as an amendment in the acceptance checks file.

## Known limits, recorded rather than papered over

- **The verification receipt is checked for shape, not against a real effect.** It requires an
  action revision, an effect receipt, a destination readback, a non-empty check list, and no
  unresolved uncertainty. It does not yet cross-reference the effect lifecycle or require the
  effect be in `read_back`. Phase 4 is the first phase with a live effect and is where that
  binding belongs.
- **A corrupt line in `events.ndjson` still takes down every read of that state root.** This is
  deliberate. Skipping a damaged line would let a projection be silently wrong, and failing
  closed is the stated rule. The recovery path is the restore added in this phase.
- **The stale-lock breaker can delete a lock another process just created.** It removes any lock
  older than 30 seconds and the `finally` deletes unconditionally. Pre-existing, not introduced
  here, and named because the completion serialization rests on that lock.
- **`COMPLETION_TOKEN` stops an ordinary caller, not a determined one.** It is a module-private
  `Symbol()` that never escapes, so no other module can obtain it. Appending straight to
  `events.ndjson`, or restoring a crafted backup, still bypasses it. That matches the wording of
  the check; it is not a security control.

## Verification

Command: `node --test` over every `*.test.mjs` under `server/` and `scripts/`.

| Check | Result |
| --- | --- |
| Phase 1 checks | 24 pass, 0 fail |
| Full suite, this branch | 384 tests, **384 pass** on a clean run |
| Full suite, clean `main` baseline | 360 tests |
| `tsc --noEmit` | clean |
| `biome check` | 4 warnings, all pre-existing in files this work never touched |

Three load-sensitive checks exist, not one. Each passes in isolation and each has failed at
least one full-suite run under parallel load, so a full run is red roughly one time in three
on one of them:

- `the child runner enforces an overall timeout` in
  `server/mdm-reconciliation/run-weekly-synthesis-queue.test.mjs`. Verified against clean
  `main` rather than assumed: it fails there on two of three full-suite runs and passes on the
  third. Pre-existing, not caused by this work.
- `the mounted activity routes complete a fixture run and reuse one apply receipt` in
  `server/activity-reconciliation/activity-gateway.test.mjs`, seen red once by the independent
  reviewer under load, green in isolation and on two subsequent full runs.
- `gateway serves the complete pasted-transcript path against a temporary Brain` in
  `server/meeting-closeout-gateway.test.mjs`, same pattern, same run.

Saying "384 pass on a clean run" without this list would understate what the suite actually
does, and this phase's whole point is evidence that can be trusted.

## Safety

No live Jira, Brain, Outlook, Teams, email, or provider effect is performed anywhere in this
branch. Traced, not assumed: there is no `fetch`, `node:http`, `node:https`, `child_process`,
`spawn`, or `exec` under `server/workbench-state/`; `effect-lifecycle.mjs` appends events and
holds no destination client; `resolveWorkbenchStateRoot` refuses the production root in test
mode and requires a root under the operating system temp folder. The runner executes
caller-supplied steps, and every step in these checks is inert.
