# Workbench activity reconciliation completion record

Status: frozen before implementation

Started: 2026-08-14 04:34 ET

Source specification: `docs/specs/workbench-activity-reconciliation.md`

## Objective

Finish the activity reconciliation feature against its complete 25-item acceptance list,
move its run lifecycle onto the common Workbench state and receipt model, and remove the
remaining automatic mailbox change. Keep the current detailed activity read model during
the migration so the Work screen and existing saved history remain compatible.

## Required outcomes

1. Each activity run has one common Workbench work item linked to its existing activity
   run ID. The common item owns the lifecycle lease, append-style progress history, and
   final ordered receipt.
2. Creating, attaching, stopping, resuming, interrupting, and completing a run updates the
   common work item without duplicating the detailed activity state.
3. A second local process cannot execute the same activity run while another live process
   owns its lease. A dead or expired owner may be continued safely.
4. Run phase events expose only run IDs, phase names, timestamps, counts, source states,
   meeting job references, and saved receipt references. Raw email, Teams, transcript,
   credential, token, and private file content never enters common events or browser
   storage.
5. A completed or partial-success run records the required ordered receipt and then marks
   the common work item complete. A canceled or interrupted run releases its lease and
   stays resumable.
6. The existing activity JSON file remains the detailed compatibility read model for this
   block. Common state owns lifecycle and completion history. Migration code must not erase
   or rewrite old activity runs.
7. Meeting evidence attaches to the saved meeting job already implemented. Activity state
   records the meeting job ID, status, and current saved stage when incomplete.
8. Email follow-up content remains in Workbench review. Reconciliation must not create an
   Outlook draft automatically and must never send mail. Any future mailbox draft action
   needs its own explicit individual approval.
9. Jira proposals remain individually selectable. The selected typed confirmation,
   immediate Jira revision check, claim-once execution, readback, and shared receipt rules
   remain intact.
10. Every AC-01 through AC-25 item in the source specification has a named automated check,
    a recorded safe browser check, or an explicit remaining limitation. No criterion may
    be called complete based only on code inspection.
11. Browser evidence covers the real Work route in Chromium and Firefox, laptop and phone
    widths, keyboard use, reduced motion, start, attach, stop, resume, partial result, empty
    result, proposal review, changes-only recap, and no horizontal overflow.
12. Existing source positions, 15-minute overlap, fixed run end, source failure isolation,
    late evidence, changed evidence, pending transcript retry, no-op suppression, and
    two-caller Jira apply behavior remain passing.

## Non-goals

- No scheduled or automatic reconciliation.
- No rewrite of Reconcile MDM.
- No replacement Microsoft 365 connector.
- No live reconciliation run during implementation or fixture verification.
- No live Jira change, Outlook draft, email send, Teams send, meeting package, or Brain
  write.
- No unrelated Work or Meetings redesign.

## Required evidence

- Red-first common lifecycle adapter checks for create, claim, renew, stop, resume, dead
  owner recovery, live owner refusal, completion receipt, exact retry, and redaction.
- Activity service checks proving the common work item follows start, phase, cancel,
  interruption, resume, and completion without changing source-position behavior.
- Checks proving reconciliation creates zero Outlook drafts while still returning reviewable
  email content.
- The full existing activity server suite plus saved meeting job checks.
- Focused Chromium and Firefox browser checks, including phone, keyboard, reduced motion,
  second-view attach, and no overflow.
- TypeScript, focused Biome, Node syntax, production build, and the diff whitespace check.
- A fresh reviewer compares the result and evidence with this record and the 25 source
  criteria.

## Ownership

- Lane 1: common activity lifecycle adapter and its focused tests.
- Lane 2: activity service integration, email-review safety, and server checks.
- Lane 3: 25-item evidence matrix and missing browser checks.
- Coordinator: gateway wiring, integration arbitration, final verification, evidence, and
  fresh review.

## Stop conditions

- Stop before any real Microsoft collection, Jira change, Outlook draft, email send, Teams
  send, meeting package, or Brain write.
- Stop if common state contains fixture secrets or raw source content.
- Stop if a live worker lease can be displaced.
- Stop completion if any of AC-01 through AC-25 lacks evidence or an explicit limitation.
