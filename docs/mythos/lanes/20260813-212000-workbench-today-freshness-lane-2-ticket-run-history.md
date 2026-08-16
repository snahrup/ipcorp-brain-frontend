# Lane 2: Durable Ticket-Agent Summaries

## Purpose

Keep completed ticket-agent summaries visible after gateway restarts without exposing
their raw prompts or output.

## In scope

- local summary persistence outside the repository
- legacy archive summary import
- Agent Board and agent-runs API reads
- focused server tests

## Out of scope

- changing how ticket agents execute Jira work
- publishing raw messages, raw output, or hidden reasoning
- moving or deleting existing legacy archive files

## Dependencies

The existing `.agent-runs/*.json` archives and `%LOCALAPPDATA%\IPCorpBrain` state folder.

## Verification expectations

A finished summary survives a fresh module or process read, is deduplicated by issue and
finish time, and contains only allowlisted fields.

## Owner role

builder

## Status

complete

## Implementation notes

- New ticket run prompts, full archives, humanizer ledgers, and summary files now write under `%LOCALAPPDATA%\IPCorpBrain\agent-runs` by default, with `IPCORP_AGENT_RUNS_DIR` available for tests.
- Legacy `.agent-runs/*.json` files are imported read-only and reduced to a small summary shape.
- `listRuns()` now merges live in-memory runs, saved summaries, and legacy archives, then deduplicates by issue key plus finish time.
- `loadArchivedRun(issueKey)` now finds the latest saved or legacy summary by key instead of looking for a file name that was never written.
- `/api/agents/runs` and Agent Board reads now await the durable run list.
- `/api/agents/run` returns the live run when present, or the saved summary after restart.
- API summaries are allowlisted. They do not include prompts, raw stream buffers, or raw message arrays. Live detail reads include only parsed agent prose messages.
- The humanizer skill read now falls back to this repo's `.agents/skills` folder before the older home skill folder.

## Verification evidence

- `node --test server/agent-transcript.test.mjs` passed, 22 of 22.
- `node --test server/agent-board.test.mjs` passed, 14 of 14.
- `npx biome check --write server/agent-dispatch.mjs server/agent-board.mjs server/jira-gateway.mjs server/agent-transcript.test.mjs` passed with no fixes applied on the final run.
