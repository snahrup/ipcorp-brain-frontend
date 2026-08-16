# Workbench Foundation Block 1 Acceptance Record

Status: frozen before implementation

Started: 2026-08-14 02:48 ET

## Objective

Build the first ordered foundation block for the complete Workbench program. This block
creates one restart-safe work engine, one server-produced Today snapshot, and one current
architecture index. It does not enable automatic execution.

## Required outcomes

1. A versioned server module defines source observations, work items, events, turn
   receipts, verification evidence, approvals, and page snapshots.
2. Workbench state roots have explicit production, development, and test modes. Tests
   must use an explicit temporary root and must refuse the live production root.
3. Work items can be created, claimed with a Windows-safe exclusive lease, renewed,
   released, resumed, and projected from append-only events.
4. Reusing an event ID with the same content is a no-op. Reusing it with different
   content is a recorded conflict and must not change state.
5. A turn receipt records these ordered phases: host execute, typed result, validation,
   durable writeback, quota spend, and scheduler acknowledgement. A turn cannot be
   reported complete when a required phase is missing or failed.
6. The server provides one Today snapshot response with one snapshot ID, one capture
   time, named source observations, partial-result notes, Jira work, Agent Board lanes,
   saved reconciliation state, and loop state.
7. Today renders from that one response. One failed source leaves the remaining current
   data visible and names the failure.
8. Opening or polling Today starts no Microsoft 365 request. Calendar data is cache-only.
9. A current architecture index names the active product, runtime, data, meeting, loop,
   and design documents. Older plans are clearly marked as history when they disagree.
10. The new engine is native Node and TypeScript-oriented Workbench code. LoopX remains a
    design reference and is not installed or run beside the Workbench.
11. Existing Jira, email, Teams, Outlook, and Brain write behavior remains unchanged.
    No live external change is made during this block.

## Required evidence

- Red-first and passing focused Node tests for state roots, leases, event replay, event
  conflicts, turn receipt validation, and Today snapshot partial results.
- Focused browser proof that Today makes one snapshot request and no Microsoft 365 call.
- TypeScript, focused Biome, production build, and `git diff --check`.
- A fresh reviewer compares the implementation and evidence with this record.

## Ownership

- Lane 1: `server/workbench-state/**` and its focused tests.
- Lane 2: the new Today snapshot assembler and its focused tests.
- Lane 3: architecture index and active-plan alignment only.
- Coordinator: gateway route, Today client cutover, integration tests, Mythos records,
  final verification, and review arbitration.

## Stop conditions

- Stop before any live Jira, email, Teams, Outlook, or Brain change.
- Stop if another session owns an integration file and a clean split cannot be made.
- Stop automatic execution if any receipt, lease, or partial-source check is ambiguous.

