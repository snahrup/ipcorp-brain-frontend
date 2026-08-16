# IP Corp Brain Frontend — Full Completion Execution Plan

**Status**: Plan created. Awaiting explicit "start" command from Steve.

**Current status, 2026-08-14**: This is a historical May execution plan. The active
ordered Workbench program now lives in `docs/architecture/INDEX.md` and
`docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`.

**Goal**: Take the current state of the ipcorp-brain-frontend to a complete, premium, production-grade, client-ready application — with sophisticated real-data 3D knowledge graphs as the unmistakable centerpiece — and finish it without further prompting once execution begins.

**Execution Philosophy (once started)**:
- Minimal text output between steps.
- Strict sequential execution of this plan.
- Only surface for genuine blockers or major verifiable milestones.
- Use the todo list below as the single source of truth and progress tracker.

---

## High-Level Phases

**Phase 0** — Plan Finalization (done)
**Phase 1** — Data & Graph Foundation Hardening
**Phase 2** — Immersive Experiences Completion (especially Meetings + Graph symbiosis)
**Phase 3** — Admin / Preferential View (Steve Mode)
**Phase 4** — Production Quality, Resilience & Accessibility
**Phase 5** — Polish & Consistency Across All Views
**Phase 6** — Testing, CI & Quality Gates
**Phase 7** — Documentation & Long-term Handoff
**Phase 8** — Final Verification, Dogfood & Release Readiness

---

## Detailed Execution Queue (Todos)

See the live todo list in the project (managed via the agent's todo system). The list below is the authoritative ordered breakdown.

### Phase 1: Data & Graph Foundation Hardening
- P1-01: Audit current brain-graph.json quality and completeness against real brain data sources
- P1-02: Improve generate-brain-graph.ts (better meeting signal extraction, entity linking, provenance scoring)
- P1-03: Regenerate rich brain-graph.json + validate node/edge quality + §24 compliance
- P1-04: Wire live admin graphPreset into KnowledgeGraph (node filtering, force strength, particles, LOD)
- P1-05: Add proper loading skeleton + progressive render for the 3D graph

### Phase 2: Immersive Experiences Completion
- P2-01: Deepen MeetingsView (proper calendar grid + month grouping + powerful timeline)
- P2-02: Full "Focus in Graph" experience (lens switch + path highlight + camera + subgraph emphasis)
- P2-03: Open graph from meeting detail + persist selected meeting context
- P2-04: Create at least one additional high-value dedicated graph lens with its own camera behavior

### Phase 3: Admin / Preferential View (Steve Mode)
- P3-01: Fully harden AdminSettings (password gate + granular nav hiding + graph perf + density + experimental toggles)
- P3-02: Persist and apply all admin preferences on load with minimal reloads
- P3-03: Add "Steve Mode" one-click preset (max detail + experimental features)

### Phase 4: Production Quality & Resilience
- P4-01: Global error boundary + graceful degradation for graph failures
- P4-02: Proper empty/loading/error states across all major views
- P4-03: Keyboard navigation for the 3D graph (arrows, focus, escape)
- P4-04: Reduced-motion respect + performance safeguards for very large graphs

### Phase 5: Polish & Consistency
- P5-01: Audit + polish all remaining views (Packets, Actions, Questions, Risks, Decisions, Source Health) to new quality bar
- P5-02: Ensure every view has excellent empty states and clear paths into the graph where relevant

### Phase 6: Testing, CI & Quality Gates
- P6-01: Expand Playwright E2E (Meetings + graph focus flows, Admin flows, all major lenses)
- P6-02: Run full `npm run ci` and drive it to green

### Phase 7: Documentation & Handoff
- P7-01: Update CLAUDE.md, BRAIN_EXPLORER_VISION.md, GRAPH_DATA_STANDARDS.md, README with final state
- P7-02: Write clear "How to keep data fresh" instructions for all automated agents (Cortex, meeting intelligence, etc.) tied to §24
- P7-03: Update launcher .bat instructions + any Billboard manifest items if needed

### Phase 8: Final Verification & Release Readiness
- P8-01: Full manual + automated dogfood pass on port 5217 (all major flows, lenses, admin, different viewports)
- P8-02: Final visual + interaction polish pass
- P8-03: Prepare final deliverable / commit ready for review or deployment

---

## Rules Once Execution Begins

- I will advance the todo list item by item.
- I will only output text when:
  - A true blocker is hit that requires your input.
  - A major gate is passed (e.g. full CI green, Phase complete and verifiable).
  - The entire plan is finished and ready for your final review.
- Between steps I will primarily use tool calls and code edits.
- The todo list itself will be kept up to date in real time.

---

**This plan is now created and ready.**

When you are satisfied with it, reply with something like:

"Start the plan" or "Begin execution" or "Go".

From that moment I will treat it as a standing order and drive until the list is complete.

---

## Major Verifiable Milestone — 2026-05-28 (addressing explicit user concern)

**"Most thorough extraction + visible proof we looked at everything from every angle (real relevance, not name matches)"**

- Generator now performs full-depth multi-pass over:
  - 69+ actual meeting transcripts + summaries (cluely-export, notion-export, recurring, _source-sweeps, etc.)
  - All architecture/*.md (component relationships, Fabric/MES/M3/Purview discussions)
  - power-bi/ model + semantic discussion files (gold domain, drift evidence, etc.)
  - Every books/*/ipcorp-application-notes.md (beyond just Fabric)
  - ADR Markdown frontmatter (Related / Supersedes with verbatim excerpts)
  - project-memory/entities/dataflows.json (explicit company/DB/table syncs)
  - Authoritative systems.json (companies, DB names, integration notes for accurate mention detection)

- Result (rich generation with BRAIN_PATH): 103 nodes / 1360 typed §24 links
  - 1290 high-confidence (95%+)
  - 1281 carrying verbatim sourceFile + excerpt (real quotes from the actual docs/transcripts)
  - Only 5 remaining heuristic (name-only fallback, hidden by default in Strict Mode)

- UI now surfaces the proof trail directly:
  - Click any node in the 3D graph → floating "Why these connections exist" card lists incident links with exact reason, verbatim excerpt in quotes, and the precise brain source path (e.g. meetings/transcripts/cluely-export/2026-05-19-....md or architecture/fabric-governance.md or books/enterprise-architecture-as-strategy/ipcorp-application-notes.md)
  - Live stats bar always shows "X high-conf • Y with source excerpts"
  - "Full Brain Depth" badge + Strict Mode button have detailed tooltips enumerating every source category scanned
  - Meeting Provenance lens + emphasis + "Focus this meeting’s real connections" from drawer continue to work on the richer data

This closes the loop on the user's verbatim request. The end user can now immediately see and verify that connections are defensible because the generator actually read the source material from every angle and attached the evidence.

Next items in queue remain production polish, E2E for the new provenance card, density handling for 1360-link graphs (performance presets already mitigate), and final agent update instructions for §24.
