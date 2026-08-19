# Workbench Autonomy Monitor — spec

Status: implemented for agent runs on Jira work items (first view). 2026-08-18.

## What this is

A top-level screen, **Autonomy** (`/autonomy`), for supervising autonomous work in
flight and auditing it afterward. It is a supervision surface, not a log viewer:
"MT-254 completed" is exactly what it must not be. One screen, one view switcher,
several kinds of background process over time. Only agent runs are built; the
switcher names and routes the rest (`/autonomy/closeouts`, `/autonomy/reconciliation`,
`/autonomy/briefings`, `/autonomy/loop`) and each renders an honest stub until built.

## Hard rules

- Nothing on this screen invents data. A field an older run never recorded renders
  as "not recorded", never as a plausible value.
- Live runs update without a manual refresh; polling stops when nothing is running.
- Loading, empty, and error states are specific. "No runs yet" and "the gateway is
  not answering" are different situations and never look the same.
- Works at phone width (rows stack, modal goes full-bleed under 900px).
- Exactly two actions can affect the world from this screen: asking a question
  (companion session) and requesting changes (a new linked run). Nothing else
  starts, stops, or alters a run.

## The run record

`GET /api/agents/runs` returns `AgentRunSummary[]` (newest first). Fields beyond the
pre-existing summary (`src/features/agent-runs/types.ts` is the authority):

| field | meaning | old runs |
| --- | --- | --- |
| `runId` | `${issueKey}@${startedAt}`, minted by the gateway | always present |
| `issueSummary` | issue summary at dispatch time | `null` |
| `sessionName` | the agent's assigned session name | `null` |
| `model` | model pinned for the run (`opus`, `gpt-5.6-sol`) | `null` |
| `attachments` | `{path, ok, error}` per delivered file | `null` (= not recorded) |
| `followsRun` | runId of the run this one revises | `null` |

`attachments: null` means the record has no field; `[]` means the run delivered
nothing. The interface words the two differently.

## Run detail

`GET /api/agents/runs/detail?id=<runId>` returns `RunDetail = AgentRunSummary &
{ review: RunReview }`. Resolution order in `server/agent-runs.mjs#getRunDetail`:

1. the dispatcher's in-memory run for that issue, when its `startedAt` matches
   (live runs, and finished runs not yet evicted) — full record;
2. the full archive `<ISSUE>.<startedMs>.json` written at close — full record;
3. the outcome summary `*.summary.json` — `recordLevel: "summary"`, in which case
   request/approach/plan/messages are absent and the modal says so plainly.

`RunReview` carries, in the modal's display order: `request` (the exact instruction,
message seq 0), `approach`, `plan`, `messages` (agent prose, marker blocks stripped),
`postedComment` (parsed from the COMMENT block), `recordLevel`.

## Plan reporting contract (the data shape agents must emit)

The plan and per-step status are **derived from the run's own messages** at read
time — no dispatcher state, works identically live and archived. The dispatch prompt
(`server/agent-dispatch.mjs#buildPrompt`) instructs the agent to print, before its
first tool call:

```
APPROACH:
<one short paragraph: how it intends to tackle the work>
END APPROACH
PLAN:
1. <first phase, a few words>
2. <next phase>
END PLAN
```

and one line, alone on its own line, at each transition while working:

```
STEP 2 START
STEP 2 DONE
STEP 2 SKIP <why it is no longer needed>
STEP 2 FAIL <what stopped it>
```

Derivation (`derivePlan`): steps start `pending`; START makes a step `active`;
DONE/SKIP/FAIL are terminal and keep the stated reason. A step left `active` on a
finished run renders as "Started, never reported done". A run with no PLAN block has
`plan: null` and the modal states "This run predates plan reporting and recorded no
plan." Marker blocks and STEP lines are stripped from the working-notes feed.

## Questions (companion sessions)

- `GET /api/agents/runs/questions?id=<runId>` → `RunQuestion[]`
- `POST /api/agents/runs/questions` `{id, question}` → `202`, thread including the
  new entry in state `answering`; the client polls the GET until it settles.

A question **never** touches the worker process. `askQuestion` spawns a separate
session (claude, sonnet, text output, prompt on stdin, 5-minute cap) holding the
run's record, under a contract that forbids invention and any write. The thread is a
sidecar file (`<runs dir>/questions/<runId>.questions.json`), so it is kept with the
run and a question asked days later behaves identically. The interface labels
answers as coming from a review session, not the worker.

## Change requests

`POST /api/agents/runs/changes` `{id, instruction}` → `202`, the new run's summary.
The route loads the prior run's record, builds `buildFollowUpContext(prior,
instruction)` (verdict, posted comment, successfully delivered files, then the
instruction, with "revise rather than start over"), and dispatches through the
normal `dispatch()` path with `followsRun: <runId>` — same transition-first
behavior, same outcome writing. The new run appears in the list linked to the one it
followed (`followsRun` renders as a follow-up marker), so a chain of attempts on one
ticket reads as a chain.

## Frontend

- `src/views/workbench/AutonomyView.tsx` — screen shell: hero, switcher (buttons +
  URL paths, `history.replaceState` like the Work screen), stubs, first view.
- `src/features/agent-runs/` — `AgentRunsSurface.tsx` (list: 3s poll only while a
  run is live, visibility revalidate, 1s duration tick, filters All / Needs you /
  Running / Finished, text filter, "Show model" toggle persisted in localStorage),
  `RunReviewModal.tsx` (1.5s poll while live; sections in order: request, approach,
  plan, working notes, delivered, questions, request changes), `api.ts`, `types.ts`,
  `format.ts`, `agent-runs.css`.
- A run that finished REVIEW or BLOCKED is "needs you": amber/red chip plus a row
  tint, never visually interchangeable with a clean finish.

## Views to come (shell only)

Meeting closeout jobs, activity reconciliation runs, morning briefing generation,
the scheduled loop. Each will be its own surface behind the same switcher; the
switcher entries and URLs are already reserved. Do not fold them into the runs view.
