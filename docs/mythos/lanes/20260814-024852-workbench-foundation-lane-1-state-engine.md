# Lane 1: Restart-safe state engine

Owner: foundation_state_engine

Status: complete

Files: `server/workbench-state/**` and focused tests in that directory only.

Build the versioned shapes, state-root resolver, Windows-safe lease, append-only event
journal, work-item projector, and turn-receipt validation defined in the acceptance
record. Do not edit the gateway, Today UI, existing stores, or Mythos files.

## Result

- Added versioned state records, explicit production/development/test roots, append-only
  events, replayed work items, Windows file-lock retries, lease claim/renew/release, and
  ordered turn receipts.
- Lease state now comes from event replay while a per-item lock and the event writer lock
  are both held. Exact event retries are no-ops. Changed retries are recorded as conflicts
  and leave replay unchanged.
- Added checks for root isolation, parallel writers, exact retries, changed retries,
  cleanup, lease lifecycle, and turn receipt phases.

Evidence: 12 consecutive Windows stress runs passed, followed by all 17 combined state
and Today server checks.
