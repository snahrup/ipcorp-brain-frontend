# Workbench activity reconciliation acceptance matrix

Date: 2026-08-14

Source specification: `docs/specs/workbench-activity-reconciliation.md`

Current completion record: `docs/mythos/gates/20260814-043457-workbench-activity-completion.md`

## How to read this matrix

- **Satisfied** means the observable behavior has a named check that can fail.
- **Partial** means a named check covers part of the criterion and the exact remaining
  limitation is stated.
- Browser results in this file were run in this lane. Server check names identify the
  current automated coverage and must be included in the coordinator's final server run.
- Every browser request for activity reconciliation and Jira was fulfilled by test
  fixtures. No live source collection or external change was attempted.

## AC-01 through AC-25

| Item | Status | Named current checks | Remaining limitation |
| --- | --- | --- | --- |
| AC-01 Manual start only | Satisfied | Browser: `the picker opens without a source read and a failed start shows a clear error`; browser: `runs the visible Work activity path and keeps Jira review approval-only` | None in the fixture path. Both checks assert that opening Work and opening the picker leave the start count at zero. |
| AC-02 One active run | Partial | Browser: `a second Work view attaches to the active run without starting another run`; server: `start, status, and recap routes share one saved activity run`; lifecycle: `a live owner is refused without changing its lease` | The browser check uses two views against one mocked gateway. A focused check with two independent service instances and one collector call is still missing. |
| AC-03 Stable scan end | Satisfied | Server: `baseline run keeps one fixed upper time and produces review-only results`; `a source position cannot advance past the run start`; `evidence after the fixed run start is deferred until the next run` | None in the automated fixture path. |
| AC-04 Per-source progress | Partial | Server: `a failed source keeps its earlier successful position`; lifecycle: `phase history contains only the approved summary fields` | Source results are saved independently, but a stopped activity run still restarts collection rather than skipping every already completed source unit. |
| AC-05 First-run baseline | Satisfied | Server: `baseline run keeps one fixed upper time and produces review-only results`; browser: `runs the visible Work activity path and keeps Jira review approval-only` now checks the visible Baseline label and scan period | None in the fixture path. |
| AC-06 Overlap without duplicates | Satisfied | Server: `later runs overlap by fifteen minutes and suppress repeated evidence` | The check is server-side. The browser recap does not repeat the overlap scenario. |
| AC-07 Changed evidence returns | Partial | The activity store keeps a stable evidence identity and separate content hash, exercised indirectly by the overlap checks | No focused check changes the body of one stable source item and proves that it returns as one changed item rather than a second record. |
| AC-08 Truthful source coverage | Partial | Browser: `runs the visible Work activity path and keeps Jira review approval-only`; server: `a failed source keeps its earlier successful position`; source: `the Brain reader returns dated records and metadata without private file bodies` | No one fixture exercises all allowed source states across all eight streams. Provider request or job references are not covered in the public source receipts. |
| AC-09 Jira association safety | Satisfied | Server: `direct and stored Jira references are exact while quoted keys need target review`; `similarity remains review-only, unrelated evidence is skipped, and no-op comments disappear` | None for the currently implemented proposal types. |
| AC-10 No-op suppression | Partial | Server: `similarity remains review-only, unrelated evidence is skipped, and no-op comments disappear` | Field-edit proposals are not implemented, so field-level no-op behavior has no check. |
| AC-11 Review before Jira changes | Satisfied | Browser: `runs the visible Work activity path and keeps Jira review approval-only`; browser: `select-all covers every proposal and the chained MDM check opens its review` | None in the fixture path. The Apply control stays disabled until a proposal is selected and the exact phrase is entered. |
| AC-12 Selected apply only | Partial | Browser: `runs the visible Work activity path and keeps Jira review approval-only`; browser: `select-all covers every proposal and the chained MDM check opens its review` | The current apply check covers one selected proposal, while the three-proposal check covers selection only. A server check applying exactly two of three and reading both back is still missing. |
| AC-13 Stale Jira protection | Partial | The activity apply path carries `expectedUpdated` and performs an immediate revision comparison | No focused activity check changes the Jira revision between proposal and apply and proves that the proposal returns to review. New-item creation also lacks an equivalent identity preflight check. |
| AC-14 Email stays review-only | Satisfied | Server: `email follow-up content stays in Workbench review without creating an Outlook draft`; browser: `runs the visible Work activity path and keeps Jira review approval-only`; browser: `select-all covers every proposal and the chained MDM check opens its review` | The browser shows `Draft only`, recipient, subject, and body, with no Outlook-created marker. This workflow has no email send action. |
| AC-15 Ready meeting processing | Partial | Server: `meeting Jira and email follow-ups reach the activity review`; meeting job: `start returns before work finishes and exposes redacted durable progress`; gateway: `gateway serves the complete pasted-transcript path against a temporary Brain` | No single activity integration check sends a ready meeting through the saved meeting job and verifies the served image bytes in the same scenario. |
| AC-16 Pending transcript retry | Partial | Server: `an unchanged ready meeting retries after a partial save without persisting its transcript` | A meeting with no ready transcript is not covered by a saved retry list outside the normal scan window. The later-ready scenario still needs one focused check. |
| AC-17 Full meeting completion | Partial | Meeting: `visual generation and association can resume after the package is stored`; gateway: `gateway serves the complete pasted-transcript path against a temporary Brain` | The saved meeting job verifies the image route, decode, association, and hash, but activity-level success is not yet checked against that full result in one test. |
| AC-18 Partial meeting repair | Satisfied | Meeting: `a failed Codex generation stays pending without an HTML or PNG placeholder`; `visual generation and association can resume after the package is stored`; `a summary-marker stop resumes and repairs every later meeting piece once`; meeting job: `an interruption after each closeout stage resumes without repeating saved work` | None for the saved meeting job. Activity-level display linkage remains part of AC-17. |
| AC-19 Visible progress | Satisfied | Browser: `runs the visible Work activity path and keeps Jira review approval-only`; browser: `phone layout keeps the activity panel inside the Work viewport`; browser: `a run stays visible as a dock pill on any page and toasts when it finishes` | Fixture timing is short, but the active state, named phase, live announcement, source state, spinner, Stop control, and global pill remain asserted until completion. |
| AC-20 Safe cancellation | Partial | Browser: `stop records a canceled run and resume continues the same run`; server: `stop waits for the current source read and resume keeps the same run id`; source: `a stop request aborts the active Microsoft 365 read`; lifecycle: `stopped and interrupted runs release their lease and remain resumable` | Resume keeps the run ID and saved state, but activity collection does not yet prove that every completed source unit is skipped after restart. |
| AC-21 Changes-only recap | Partial | Browser: `runs the visible Work activity path and keeps Jira review approval-only`; browser: `shows a completed empty result without unchanged recap rows`; server: `a stale open item gets a close proposal in its own recap group` | Unchanged rows are suppressed and source failures remain visible. The current recap is grouped by source first, then destination, while the specification calls for destination first, then source. |
| AC-22 No sensitive state leakage | Partial | Lifecycle: `phase history contains only the approved summary fields`; meeting job: `start returns before work finishes and exposes redacted durable progress`; source: `the Brain reader returns dated records and metadata without private file bodies`; browser: `runs the visible Work activity path and keeps Jira review approval-only` scans local and session storage for the fixture email body | A broad fixture-secret scan across activity events, snapshots, migrated legacy state, and browser storage is still missing. Saved source summaries can still originate from provider preview text and need an explicit allowlist check. |
| AC-23 Responsive and accessible controls | Satisfied | Browser: `runs the visible Work activity path and keeps Jira review approval-only` checks active-panel focus, polite phase announcement, and recap focus; `stop records a canceled run and resume continues the same run` checks reduced motion; `the picker opens without a source read and a failed start shows a clear error` uses keyboard activation; `phone layout keeps the activity panel inside the Work viewport` checks 390 by 844 and document overflow | These checks passed in both Chromium and Firefox. A full keyboard-only proposal apply remains a useful later expansion, but the required start, status, stop or resume, focus, reduced-motion, and phone behaviors have direct checks. |
| AC-24 Summary marker interruption recovery | Satisfied | Meeting: `a summary-marker stop resumes and repairs every later meeting piece once`; meeting job: `an interruption after each closeout stage resumes without repeating saved work` | None in the saved meeting fixture. |
| AC-25 Duplicate apply prevention | Partial | Server: `two attached callers receive one saved Jira apply receipt`; gateway: `the mounted activity routes complete a fixture run and reuse one apply receipt` | Current coverage shares one process. Two independent processes, an existing-item update, a new-item create, one external call each, and verify-first recovery after an uncertain create response remain unproven. |

## Browser evidence from this lane

Focused formatting:

```text
npx biome check --write tests/activity-reconciliation.spec.ts
Checked 1 file. No fixes applied.
```

Chromium:

```text
npx playwright test tests/activity-reconciliation.spec.ts --project=chromium --reporter=line
8 passed (14.4s)
```

Firefox:

```text
npx playwright test tests/activity-reconciliation.spec.ts --project=firefox --reporter=line
8 passed (22.8s)
```

The browser scenarios use the configured desktop device profiles plus an explicit 390 by
844 phone viewport. They cover idle, picker, start, active progress, second-view attach,
partial result, Stop, Resume, empty result, proposal review, exact confirmation, changes-only
recap, focus movement, polite status updates, reduced motion, global run visibility, and
horizontal overflow.

## Explicit remaining work

The following items prevent the full 25-item specification from being reported as finished:

1. AC-25 needs cross-process claim and verify-first create recovery checks.
2. AC-16 and AC-17 need one activity-level meeting scenario from pending or ready evidence
   through the saved meeting job and served PNG.
3. AC-04 and AC-20 need saved source-unit continuation that skips completed reads after an
   interruption.
4. AC-07, AC-08, AC-10, AC-12, AC-13, AC-21, and AC-22 need the focused checks or behavior
   named in the table.

