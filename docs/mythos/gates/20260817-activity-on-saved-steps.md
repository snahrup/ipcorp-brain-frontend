# Acceptance checks: Phase 2, activity on saved steps

Frozen 2026-08-17, before implementation.

Source: `docs/architecture/SELF-DRIVING-WORKBENCH-BUILD-PLAN.md`, Phase 2.
Foundation: the Phase 1 engine in `server/workbench-state/`.

## Allowed effects during this phase

None live. Recommendation and review paths only. No Jira, Outlook, Teams, Brain, or email
effect anywhere in these checks.

## The checks

### AJ-01 Each source is its own saved step
A collection run over the selected activity sources executes one saved step per source, and
each step saves its own validated artifact under the run's work item.

### AJ-02 A completed source is not read again after interruption
Kill the run after some sources finished. Resume with the same run id. The finished sources
are skipped on their validated saved artifacts, their readers are not called again, and only
unfinished sources run.

### AJ-03 The same run id survives stop and process loss
A stop request, or a simulated process death, leaves a run that resumes under the same work
item id. No second work item is created for the same run.

### AJ-04 One source failure does not erase other results
A reader that throws produces a failed-source artifact for that source only. Every other
source completes and keeps its result. The run reports partial, not failed, and the failed
source names its error.

### AJ-05 An unchanged repeat run produces no new review item
Run twice with identical windows, positions, and reader output. The second run's source steps
skip on their saved artifacts, and no source reader is called.

### AJ-06 A changed item returns exactly once, under the same identity
When a source's window or saved position moves, that source's step reruns. An item whose
content hash changed returns as changed under its same stable id, once, and an unchanged item
does not return at all.

### AJ-07 Stop reaches a running source reader
A stop requested while a source reader is in flight aborts it through the step signal, per
the Phase 1 amendment: a reader that honours the signal throws and its work is quarantined; a
reader that returns a validated result keeps it, and the run stops before the next source.

### AJ-08 The clock option is real or it is gone
`activity-lifecycle.mjs` no longer assigns an unused `clock`. Either the option is honored
where the module stamps time, or the option does not exist.

## Completion proof

- Every check above written as a check that can fail, and passing.
- The existing activity reconciliation and lifecycle suites stay green.
- Full suite at or above the Phase 1 count, typecheck clean.
- Independent review in fresh context against this file.
- The automatic phase infographic after Steve and the builder agree it is finished.

## Stop conditions

- Per-source steps would require breaking the `collectSources` reader interface for existing
  callers. Stop and bring the tradeoff to Steve instead of forking the reader contract.
- The engine cannot express per-source isolation without swallowing genuine step failures.
  Stop rather than blur the difference between a failed source and a failed run.
