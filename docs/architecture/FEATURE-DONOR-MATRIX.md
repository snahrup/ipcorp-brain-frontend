# Workbench Feature Donor Matrix

Reviewed: 2026-08-14

This matrix captures useful work from earlier apps and external references. These are
design donors. Nothing here should run beside the Workbench unless a future acceptance
record explicitly says so.

## Adoption Rule

Every borrowed feature follows the same path:

1. Write the desired Workbench behavior in this repo.
2. Add a focused failing test here.
3. Port the smallest useful piece or rewrite it natively.
4. Prove it against a fixture and then a real read-only path when safe.
5. Keep the result in the Workbench server and Agent Board surface.

## Donor Summary

| Donor | Keep | Do not carry forward | Workbench destination |
| --- | --- | --- | --- |
| Existing Workbench | Review-first writes, readback checks, Agent Board source states, cache-only polling, transcript reconciliation, Codex visual retrieval. | More independent one-off state stores and separately timed Today calls. | Foundation state engine, Today snapshot, meeting job runner, approval cards. |
| Ghostwork | Earned autonomy tiers, staged approvals, receipts scoreboard. | Default posture where the app acts without review. | Policy module, approval channel, weekly trust metrics. |
| Mission Control | Scheduler, dispatcher lifecycle, prompt builder, retry queue, credential scrub patterns. | Large daemon transplant and separate dashboard. | Gateway-owned dispatcher and prompt assembler. |
| Praxis / Auto-Claude | Role roster, isolated worktree coding, QA reviewer/fixer flow, heartbeat daemon idea. | Parallel product shell or full platform import. | Workbench work runner, verifier lane, Agent Board liveness. |
| Multica | Enqueue, claim, start, complete/fail, blocker, progress lifecycle. | Platform UI and unrelated runtime. | Native work item lifecycle. |
| Open Multi Agent | TypeScript queue ideas, loop detection, structured result shape. | DAG machinery and agent framework. | No-progress rules, typed turn receipt validation. |
| MRI | Scan, fix, verify, rescan loop with progress memory. | Project-specific scanner details. | Verifier and evidence convergence. |
| Evolution and session-context | Long-running memory, session journal, contradiction checks. | Standalone memory app beside Workbench. | Workbench memory spine and run history lookup. |
| Observability hooks | Hook events to HTTP, SQLite, WebSocket, human reply round trip. | Separate telemetry product. | Agent Board event stream and approval cards. |
| Switchboard | Diff review, accept/reject, partial acceptance, waiting-on-input states. | Standalone review surface. | Approval cards in Agent Board and Work. |
| Screenpipe | Local Recall-style optional sensor idea. | Always-on capture by default. | Future opt-in sensor adapter only. |
| TrendOperator | Backend-first automation, observe/act/verify/recover loop, mission state, watchdog, recorder, staged human approval. | Trading domain, market UI, or trading execution code. | Workbench job runner, recovery checks, staged action review. |
| LoopX | Durable work items, claims, leases, dependencies, resume triggers, evidence, append-only events, ordered turn phases, notification split, compact next-turn state, quota/no-progress rules. | Python runtime, macOS/Linux installer assumptions, file locking implementation, or a second controller. | Native Node/TypeScript state engine and turn receipt validator. |

## LoopX Pattern Detail

LoopX is a reference, not a dependency. It was inspected at main commit
`920a5eeb49ec68e427fa0bc3bc61cd9770c30d32`. It is not installed, imported, or run by the
Workbench.

Useful pieces to rebuild natively:

- Work items carry an ID, status, claim, lease, dependencies, resume trigger, and evidence.
- Events are append-only. Reusing the same event ID with the same content is a no-op.
  Reusing it with different content records a conflict and leaves state unchanged.
- Turn receipts move through ordered phases: host execute, typed result, validation,
  durable writeback, quota spend, scheduler acknowledgement.
- Notification and execution are separate. A card can notify Steve without starting work.
- Each run writes compact next-turn state so a resumed agent has the exact next action.
- Quota and no-progress checks stop loops that are spending effort without useful change.

Reasons not to import it:

- The runtime is Python while the Workbench server is Node-oriented.
- Its tested file-lock path depends on Unix locking behavior that does not carry over cleanly to Windows.
- Its local coordinator and event-store migration work were still in-progress references.
- Running it beside the Workbench would create another controller instead of one owned daily loop.

## Ordered Lift

| Order | Feature | First Workbench consumer |
| --- | --- | --- |
| 1 | Versioned work item and event journal. | Meeting closeout job runner, then activity reconciliation. |
| 2 | Windows-safe claim and lease manager. | Meeting closeout job runner. |
| 3 | Turn receipt validator. | Agent Board receipts and dispatcher dry run. |
| 4 | Snapshot projector. | Today and Agent Board. |
| 5 | Approval card channel. | Jira review, meeting visuals, Outlook draft review. |
| 6 | Verifier ladder. | Activity reconciliation and coding tasks. |
| 7 | Dispatcher lifecycle. | Low-risk shadow work only. |
| 8 | Memory spine and retro. | Morning standup, evening retro, and future autonomy review. |
