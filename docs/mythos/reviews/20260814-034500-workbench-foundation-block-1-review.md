# Workbench Foundation Block 1 Review

Verdict: needs-changes

Reviewer: foundation_block_reviewer

Reviewed against: `docs/mythos/gates/20260814-024852-workbench-foundation-block-1.md`

## Findings

1. High: lease state can diverge from replayed work-item state when the follow-up event is rejected or the process stops between the lease write and event append.

   Evidence: `server/workbench-state/index.mjs:401` claims the lease first, then `server/workbench-state/index.mjs:404` records the event. `server/workbench-state/index.mjs:440` removes the lease first, then `server/workbench-state/index.mjs:442` records the release event. If `appendEvent` returns `conflict`, or the process dies before the event is written, the physical lease file and projected work item disagree.

   I reproduced both cases with the current module in a temp test root:

   - claim with a reused event ID returned `status: "claimed"`, left a live lease file, and projected the item as `pending`.
   - release with a reused event ID returned `status: "released"`, removed the lease file, and projected the item as `claimed`.

   This breaks the restart-safe work engine promised by required outcomes 3 and 4. The fix needs an atomic state transition pattern: either validate and reserve the event ID before mutating the lease, or record an append-only intent/outcome pair that recovery can reconcile. Add tests for append conflict and simulated append failure on claim, renew, and release.

2. Low: exported test cleanup helper throws if it is ever called.

   Evidence: `server/workbench-state/index.mjs:673` calls `access(...)`, but `access` is not imported from `node:fs/promises` at `server/workbench-state/index.mjs:3`. None of the current tests exercise `resetWorkbenchStateRootForTests`, so this slipped through. Either import `access` or remove the helper if it is unused.

## Acceptance Check

- Outcome 1: mostly satisfied. Versioned source observations, work items, events, turn receipts, evidence, approvals, and page snapshots exist.
- Outcome 2: satisfied by tests. Test mode requires an explicit temp root and refuses the production root.
- Outcome 3: not satisfied yet because lease mutation and event replay can disagree after conflict or interruption.
- Outcome 4: append conflict handling itself works, but the lease wrappers do not respect that result.
- Outcome 5: satisfied for validation and recording of complete turn receipts.
- Outcome 6: satisfied. The gateway assembles one Today snapshot with Jira, Agent Board, reconciliation, and loop state.
- Outcome 7: satisfied in unit and browser checks for a failed Agent Board source.
- Outcome 8: satisfied at the browser level and supported by `cachedOnly: true` in the gateway.
- Outcome 9: satisfied. The new architecture index and donor matrix name current references and mark older plans as history.
- Outcome 10: satisfied. LoopX is documented as a reference and is not imported.
- Outcome 11: no external write path was changed in this block based on the reviewed diff.

## Checks Run

- `node --test server/workbench-state/state-engine.test.mjs server/today-snapshot.test.mjs server/today-snapshot-gateway.test.mjs`: 15 passed.
- `npx biome check server/workbench-state/index.mjs server/workbench-state/state-engine.test.mjs server/today-snapshot.mjs server/today-snapshot.test.mjs server/today-snapshot-gateway.test.mjs server/jira-gateway.mjs src/views/workbench/TodayView.tsx tests/smoke.spec.ts docs/architecture/INDEX.md docs/architecture/FEATURE-DONOR-MATRIX.md`: passed.
- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npx playwright test tests/smoke.spec.ts -g "Today|Board read|loop is off|phone" --project=chromium`: 6 passed.
- `npm run build`: passed, with the existing large bundle warning.
- Two ad hoc temp-root repro commands for claim and release event conflicts: both exposed lease/projection divergence.

## Recommendation

Fix finding 1 before calling this block complete. Finding 2 is quick and should be fixed in the same pass because it is in the new exported state module.
