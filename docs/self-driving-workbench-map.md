# The self-driving Workbench: what we already own

Surveyed 2026-08-12 across D:/CascadeProjects (211 directories, ~34 inspected)
plus the C-drive copies of Multica and Paperclip. The goal: a Workbench that
runs Steve's day as a loop (sense, decide, execute, verify, with memory and
observability underneath), interrupting him only for pastes, approvals, and
genuinely critical judgment.

**The standing rule: everything worth keeping is built INTO the Workbench.**
Patterns, prompts, and modules get lifted; no prior platform runs alongside it.
Three schedulers fighting over one day is how babysitting comes back.

Dates note: most D-drive forks show a single "migration snapshot 2026-06-16"
commit; real activity is judged from file mtimes and Steve-authored commits.

---

## The four stations and where each piece comes from

### Decide (the missing station; smallest to build)

The policy that classifies every card the Agent Board produces into one of
three tiers: auto-run, run-then-show, ask-first.

| Source | Lift |
|---|---|
| ghostwork (`src/main/actionEngine.ts`) | Earned-autonomy tiers: `earnedTier(rule)` and `capTier(..., autonomy_override)` with confidence caps. Autonomy is earned per work class by a track record, not granted globally. Its default posture ("the system acts, it doesn't ask") gets softened to our three tiers; the mechanics already support it. |
| ghostwork (`src/main/approvals.ts`) | The staging queue: outward-facing steps (send, post, submit) stage instead of firing, one approval releases the run's rest. This is run-then-show as code. |
| mission-control (`scripts/daemon/dispatcher.ts`) | `hasPendingDecision` / `isTaskUnblocked` as the ask-first check inside a dispatch loop; decisions live as data, not prompts. |
| m365_agent_gateway (`tools/registry.py`, `utils/errors.py`) | Steve-authored ToolDefinition/ToolRegistry plus the `WriteOperationDisabled` refusal: writes are impossible, not discouraged, below the right tier. The tool-tier primitive. |
| steve-command-center (`api/mcp/*` routes) | Per-client MCP enable/sync registry: which tools an agent may even reach at a given tier. |

Standing constraints the policy hard-codes: outbound email sends and meeting
invitations are ask-first forever; Microsoft actions obey the one-job rule
(one durable job per material action, no replays); trust widens one work
class at a time as the verify station earns it.

### Execute (half-built; the biggest lift value sits here)

Dispatch context-rich agents on real work items through the gateway the
Workbench already trusts.

| Source | Lift |
|---|---|
| Praxis / Auto-Claude (`apps/backend/prompts/`, `agents/`) | The 28-prompt roster: spec gatherer, researcher, writer, critic; planner; coder in an isolated git worktree; the qa_reviewer + qa_fixer pair; complexity_assessor (a ready-made decide input); followup_planner; insight_extractor. All Claude Agent SDK native, same SDK as the Workbench rail agent. Axon inside it is the heartbeat daemon pattern (:8400, agents report liveness over SSE) that the Agent Board's aging tones re-derived. |
| mission-control (`scripts/daemon/`) | The loop skeleton, ~5k lines: `scheduler.ts` (cron plus poll), `dispatcher.ts` (retry queue with backoff, active-run lifecycle), `prompt-builder.ts` (context-rich prompt assembly, the closest analog to dispatching on a Jira ticket), `runner.ts` (output parsing), `security.ts` (credential-scrub regex set). |
| Multica | The task lifecycle standard: enqueue, claim, start, complete/fail, report blockers, progress streaming. Lift the lifecycle contract, not the platform. |
| open-multi-agent (`src/task/`, `src/orchestrator/`, `src/agent/`) | TypeScript, same language as the gateway: task queue, DAG scheduler, agent pool, `loop-detector.ts` (runaway-agent guard), `structured-output.ts` (typed readback). Modules, not the framework. |
| Paperclip (`agents/`) | The org layer: agents as named roles with owned domains and budgets. The roster concept and governance copy; the Workbench stays the single company. |
| wshobson-agents (`plugins/`) | 541 role/skill definitions to harvest selectively; `plugin-eval/.../judge.py` is an LLM-judge layer reusable in verify. |
| ralphy (`cli/src/`) | Reference skeleton only: engines / execution / tasks / notifications split, and an explicit priority ranking usable as decide-policy prose. |

The fix for "agents with little context": every dispatch prompt is assembled
the way the closeout already gathers evidence — the ticket, its links, the
meeting package behind it, Brain history, the operating rules, and the voice
profile. MRI proved the approach (below); prompt-builder.ts is the assembly
point.

### Verify (the pattern exists in the Workbench; MRI generalizes it)

"Done" means the recheck found nothing, never "the agent said so."

| Source | Lift |
|---|---|
| MRI (`server/`) | The convergence loop: scan, build a graph-fed fix prompt (the agent knows where the break sits and what cascades), spawn, verify, rescan, repeat until zero findings across rounds. Causality distinguishes direct fixes from cascade resolutions; an append-only progress memory stops repeated mistakes between rounds. Also `claude_accounts.py` for account rotation under parallel dispatch. |
| Workbench (built) | Readback checks after every Jira write, verbatim-evidence checks on every extracted claim, fail-closed everywhere. The house standard the loop inherits. |
| autoresearch (installed skill) | Commit before verify, revert on failure. Adopt the semantics; nothing to port. |
| canary | The evidence-by-default contract: every run emits a self-contained report plus a replayable script. Philosophy lift; its Playwright scope stays browser work. |
| open-multi-agent | `loop-detector.ts` and structured outputs feed this station too. |

### Sense (built; two additions available)

Calendar watch, transcript capture and cleanup, comms reconciliation, board
state, and the Agent Board already exist and are tested.

| Source | Lift |
|---|---|
| screenpipe (behind ghostwork's `screenpipeDb.ts` adapter) | The local Recall-style sensor Steve asked about: 24/7 screen and mic to a local SQLite store. Optional tier; adopt through ghostwork's adapter if desired, never merged as code. |
| mission-control | Brain-dump inbox triage pattern (unstructured thought in, classified work out). |

---

## The two layers underneath

### Memory

| Source | Lift |
|---|---|
| evolution (Steve's own FastAPI engine) | Fact extraction with provenance, contradiction detection (a readback check for the knowledge base), meeting and query surfaces. The strongest candidate for the loop's long-term memory spine. |
| session-context (938 Steve commits) | The proven journal protocol: session-end writes and commits, session-start reads; already tracking ipcorp-brain-frontend and the Brain. Git as the audit log. |
| Praxis `memory_manager.py` + Graphiti | The per-agent memory pattern inside dispatch. |
| claude-mem | Pattern only: async worker + queue + private-tag stripping at the edge. |

### Observability and the approval surface

| Source | Lift |
|---|---|
| Agent Board (built this week) | The read side: four lanes, aging tones, sources that declare failure. The loop writes to the state this board already renders. |
| claude-code-hooks-multi-agent-observability | Hooks to HTTP to SQLite to WebSocket, including a human-in-the-loop request/response round trip — the ask-first channel, answerable from the Agent Board. |
| agent-flow (`app/src/server.ts`, relay) | The minimal hooks-to-stream event pipeline for run traces. |
| ghostwork (`src/main/receipt.ts`) | The weekly receipts scoreboard: runs, successes, minutes saved, approvals pending. The trust ledger that justifies widening autonomy tiers. |
| switchboard | Run-then-show UX: diff review with accept/reject and partial acceptance, and the waiting-for-input vs blocked-on-approval status model. |
| local-mission-control | Zero-dependency SSE service supervisor plus Windows autostart scripts, for keeping the gateway, vite, and the dispatcher alive as a set. |

---

## Left behind, and why

agor and craft-agents-oss (competing platforms, wrong stack, untouched
clones); orchestrator (its one idea, worktree isolation, is a 20-line git
wrapper Praxis already has); agency-agents (superseded by wshobson);
Dayflow (Mac-only Swift, UX reference at most); headroom, supermemory,
semantica, llm-council-plus (untouched clones, overlapping better options);
hermes-agent (WSL-only, pattern reference for cron delivery only);
FMD_ORCHESTRATOR (keep its dry-run rehearsal idea and portability rules
document; Dagster is heavier than a daily loop needs).

---

## Build order

1. **The dispatcher.** Mission-control's daemon shape plus Multica's
   lifecycle contract, running inside the gateway: walk the Agent Board
   state every few minutes, chase missing captures (ping Steve only for the
   paste), process meetings, run reconciliation, dispatch eligible tickets
   to agents with MRI-style context-rich prompts built by a prompt
   assembler, verify with readback, record receipts. Praxis prompts seed
   the roster.
2. **The policy file.** Three tiers with ghostwork's earned-tier mechanics
   and the m365 write-refusal primitive; sends and invites pinned ask-first;
   every tier decision logged to the receipts ledger.
3. **The approval channel.** The HITL round trip surfaced as answerable
   cards on the Agent Board, with switchboard-style run-then-show diffs for
   anything in the middle tier.
4. **The memory spine.** evolution plus the session-context protocol wired
   into dispatch, so every agent starts with history instead of a bare
   ticket.

Each step lands with the house discipline: red test first, readback proof,
fail closed, and the Agent Board tells on the loop the same way it tells on
everything else.
