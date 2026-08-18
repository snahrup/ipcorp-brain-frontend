# Claude Design prompt: the autonomous work review surface

Copy everything below the line into Claude Design, with the repository attached.

---

## What this repository is

The IP Corporation Workbench: an internal tool one person uses to run a Microsoft
Fabric and MDM consulting engagement. It reads Jira, Outlook, Teams and a private
knowledge base, and it dispatches autonomous coding agents (Claude Code and Codex)
to complete real Jira work items. Those agents write real comments, worklogs and
status changes onto live client tickets.

Work with the design system already in this repository. Match the existing
components, tokens and conventions exactly. Do not introduce a new visual
language, and do not restyle anything that already exists.

## The problem to solve

Autonomous agents are doing real work in the background and there is currently no
way to watch them. The only visibility is a status word on a ticket after the fact.
When an agent misbehaves, produces a poor deliverable, or silently fails, there is
no surface that shows what it was asked, what it decided to do, how far it got, or
where it went wrong. Recent failures went undetected for days for exactly this
reason.

The person using this is a senior architect who does not extend blind trust to
agents. He needs to supervise work in flight and audit work already done, the way
a lead reviews a junior's output. This is a supervision surface, not a log viewer.
"MT-254 completed" is precisely what it must not be.

## What to build

A new top-level screen dedicated to monitoring autonomous work. It must not be
folded into an existing page.

The screen has a view switcher, in the same manner as the Work screen, which
switches between list, board, activity, analytics, timeline, gantt and deps modes
with both buttons and URL paths. Different kinds of background process will get
different views over time, each with its own shape, but they all live on this one
screen behind that switcher.

**Build only the first view now: agent runs on Jira work items.** Design the shell
so more views can be added later without rework. Name and stub the switcher, but
implement one view.

## The data that exists today

A run record carries these fields, and the interface should be built against them
rather than invented ones:

- `issueKey` (for example MT-257) and the issue summary
- `agent` (`claude` or `codex`) and `agentLabel` (Claude Code, Codex)
- `state` (`running`, `finished`), `verdict` (`DONE`, `REVIEW`, `BLOCKED`), `note`
- `startedAt`, `finishedAt`, `lastEventAt`
- `steps` (count of tool actions taken) and `lastAction` (the most recent tool name)
- `messages`: the agent's own prose during the run, in order, each with a timestamp
- `exitCode`, `error`
- `attachments`: files the run delivered to the ticket, each with a path and whether
  the upload succeeded
- the pinned model for that agent, and the agent's assigned session name

Runs are polled while live. A finished run is read from disk and never changes.

## The run list

Every run, newest first, live-updating while any run is in flight. From a single
row the reader must be able to tell, without clicking:

- when it started, and how long it ran or has been running
- which agent did it, by its assigned name
- which provider (Claude Code or Codex)
- which model, and this must be hideable, because most of the time he does not
  want to see it and occasionally he does
- what it was working on: the ticket key and what that ticket is
- its status, and whether it is currently running
- how much it actually did: the step count, plus what it is doing right now if live
- whether it produced deliverables
- whether it needs him. A run that finished REVIEW or BLOCKED is waiting on a
  person and must not be visually indistinguishable from one that finished cleanly

A way to filter or narrow the list is needed once there are many runs: at minimum
by status and by whether it needs attention.

## The plan modal

Opening a run shows what it was asked to do and how it approached it. This is the
core of the surface. It contains, in this order:

1. **The request it received.** The exact instruction sent to the agent, presented
   as what Steve asked it to do, because from the agent's side that is what it was.
2. **The approach it decided on.** The agent's own statement of how it intends to
   tackle the work, before doing it.
3. **The plan itself**: an ordered list of phases or steps, each carrying its own
   status: complete, in progress, skipped, or failed. A skipped step must show why
   it was skipped, since mid-flight scope changes are exactly what he needs to see.
4. **What it actually said while working**, in order and timestamped, so the
   reasoning can be followed.
5. **What it delivered**: files attached to the ticket, and the comment it posted.

While a run is live this updates as it progresses. The step currently in progress
should be apparent.

Note for implementation: the plan and per-step status are not yet produced by the
agents. Design the interface as if they are, and define the shape the data must
take, so the agent prompt can be changed to emit it. Where a run predates that
change and has no plan, the modal must say so plainly rather than fabricating one.

## Asking the agent questions

From within a run, the reader can ask questions about the work: why a choice was
made, what a file contains, whether something was considered.

This never interrupts a running agent. Every question starts a separate companion
session that has the original run's context and answers on its behalf. The reader
should not have to think about this distinction, but the interface must be honest
that answers come from a session reviewing the work, not from the worker itself.

The conversation is threaded within the run, is kept with it, and can be returned
to later. A question asked of a run that finished days ago behaves identically to
one asked of a run in flight.

## Requesting changes

From a run, the reader can request changes to the work that was done. A change
request is not a note: it starts a new run on the same ticket, carrying the request
and the previous run's context as its instruction. The new run appears in the list
linked to the one it followed, so a chain of attempts on one ticket is legible as a
chain rather than as unrelated rows.

## Behavior that matters

- Live runs update without a manual refresh. Polling stops when nothing is running.
- Nothing in this interface may invent data. If a field is missing for an older run,
  say it is missing. An honest gap is required; a plausible placeholder is not.
- Loading, empty and error states all need to exist and be specific. "No runs yet"
  and "the gateway is not answering" are different situations and must not look the
  same.
- The reader is often on a phone. This has to work at that width.
- Nothing on this screen may start, stop or alter a run except the two explicit
  actions described above.

## Views to come, for shell design only

Later views on this same screen will cover meeting closeout jobs, activity
reconciliation runs, the morning briefing generation, and the scheduled loop. Each
has a different shape. Do not build them. Only make sure the switcher and page
structure will hold them.

## Deliverable

Produce the prototype as real code files that map one to one onto this repository's
structure, so the files can be applied directly to it. Not a single static HTML
page, and not a mockup. Use the repository's existing components, routing approach,
data-fetching patterns and file organization. Where a new API endpoint is needed,
define its shape and show how the interface consumes it.
