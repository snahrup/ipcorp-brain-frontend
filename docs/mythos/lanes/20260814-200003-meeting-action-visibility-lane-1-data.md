# Lane 1: Stable meeting action data

- Owner role: main, acting as builder
- Status: completed
- Purpose: retain explicit Jira identity and create stable action IDs during the Brain export
- In scope: `scripts/brain-sources.mjs`, its focused checks, and `src/types/brain.ts`
- Out of scope: Jira writes, agent dispatch, Microsoft 365 reads
- Dependency: the closeout marker remains the evidence source
- Verification: unchanged rebuild identity, malformed input failure, direct Jira key retention
- Evidence: 10 focused exporter checks passed; synchronized output now carries stable action IDs
