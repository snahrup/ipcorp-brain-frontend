# Activity reconciliation server lane

## Purpose

Build the saved run engine, source orchestration, proposal preparation, reviewed
apply claims, and meeting repair path.

## In scope

- `server/activity-reconciliation/`
- Narrow integration in `server/jira-gateway.mjs`
- Window input in `server/m365-reconcile.py`
- Per-artifact recovery in `server/meeting-closeout.mjs`

## Out of scope

- Work screen component and CSS
- Existing MDM modal redesign
- Real Jira, email, meeting, or Brain changes during tests

## Dependencies

- Existing scan-ledger identity and content hash ideas
- Existing single-flight Microsoft 365 reader
- Existing Jira read and reviewed apply helpers
- Existing meeting closeout package and temporary Brain tests

## Verification expectations

- Focused Node tests use injected source, Jira, clock, and filesystem fixtures.
- Interruption and simultaneous apply tests can fail before the fix.
- Saved state remains outside the repository.

## Owner

Builder, followed by verifier and reviewer.

## Status

Complete. The saved run engine, eight source readers, proposal preparation, reviewed
Jira apply claims, and per-piece meeting repair are implemented and covered by focused
server tests.
