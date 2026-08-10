# Activity reconciliation verification lane

## Purpose

Prove the full fixture path, safe read-only checks, and unchanged external state.

## In scope

- Focused Node and Playwright tests
- TypeScript, Biome, and production build
- Direct local launcher and health checks
- Read-only Microsoft 365 and Jira probes only when fixture checks pass

## Out of scope

- Applying a real Jira proposal
- Sending email
- Processing a real meeting
- Writing a real Brain record

## Dependencies

- Completed server and interface lanes
- Temporary state and Brain fixtures
- Fake Jira adapter with call receipts

## Verification expectations

- Record exact commands, pass counts, browsers, viewports, and request receipts.
- A fresh reviewer compares the final diff and evidence with the frozen checks.

## Owner

Verifier, then reviewer.

## Status

Complete. Fixture checks, production build, live idle-path browser inspection, and
real read-only source probes passed. No real reconciliation run or external change was
made during verification.
