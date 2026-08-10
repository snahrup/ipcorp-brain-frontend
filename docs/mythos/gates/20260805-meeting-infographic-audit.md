# Meeting infographic audit acceptance checks

Frozen: 2026-08-05

## Scope

Audit every meeting that the Meetings overview reads from the prepared Workbench index.
Read the matching Brain meeting summary and infographic package records without changing
them. Add the smallest useful review surface to the Meetings overview.

## Required evidence

1. The audit universe equals the full meeting array used by the Meetings overview.
2. Every audited meeting receives separate display, saved-file, and recorded-association
   states.
3. A read failure is shown as unavailable and is never silently counted as missing.
4. The review surface lists only meetings that need attention.
5. Results use four mutually exclusive root-cause groups:
   - Missing display only: the file and recorded association both exist, but the Workbench
     image path did not display it.
   - Missing saved artifact only: a recorded association points to a file that is absent.
   - Missing association only: a corresponding saved file exists, but the meeting record
     does not point to it.
   - Fully missing: neither a corresponding saved file nor a recorded association exists.
6. Each listed meeting includes its date, title, group, and concise evidence.
7. Workbench can distinguish a successful audit from an unavailable source.
8. No infographic, Brain meeting summary, package status, or attachment is created,
   changed, removed, or linked by this work.

## Verification

- Scanner tests cover all four groups plus unavailable source states.
- The current snapshot reconciles to the displayed meeting count.
- TypeScript and the production build pass.
- A browser check opens Meetings, reviews the audit surface, opens a linked meeting, and
  confirms its visual summary loads through the same image path used by the app.
- A fresh review compares the diff and command evidence with these checks.
