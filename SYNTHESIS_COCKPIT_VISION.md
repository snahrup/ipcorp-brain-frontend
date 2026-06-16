# Synthesis Cockpit — IP Corp Architecture Brain

**The primary, living interface to the full ipcorp-architecture-brain knowledge base.**

**Status**: Active vision document (as of 2026-05-29). This is the single source of truth for what we are building, why, and how we judge success. It supersedes earlier briefs when they conflict.

---

## 1. North Star

We are building a **Synthesis Cockpit** — not a dashboard, not a viewer, not a knowledge base browser.

The 3D knowledge graph (powered by the richest possible provenance-backed data) and the persistent Orbital Assistant are the **primary, dominant, always-central** elements of the entire experience. Everything else (prep packets, risks, ADRs, meetings, source health, decisions) exists to feed, contextualize, or be explored *from within* this synthesis surface.

The goal is to make the act of understanding how disparate signals across the entire brain come together feel tangible, elegant, intellectually powerful, and defensible.

When someone uses this tool, they should feel like they are standing inside a living, connected intelligence — not clicking around an application that happens to contain graphs.

---

## 2. Mission & Why This Exists

The ipcorp-architecture-brain contains extraordinary depth: transcripts, architecture documents, Power BI models, dataflows, ADRs, meeting records, books, system definitions, and Cortex-level synthesis. 

Most of that value is currently trapped because humans (and agents) cannot easily see the *connections*, the *provenance*, the *emergence*, and the *trade-offs* at scale.

This frontend exists to unlock that value through sophisticated, interactive, provenance-visible 3D synthesis as the primary interface.

It must feel production-grade and calm — never marketing, never generic ops tooling.

---

## 3. Core Philosophy & Intangibles (What "Good" Actually Feels Like)

These are the non-codifiable but critical qualities we optimize for:

- **Calm power**: Dark, refined, layered, sophisticated. The interface never shouts. It reveals depth on demand.
- **Motion explains reasoning**: Framer Motion is not decoration. Camera moves, emphasis, settling, and transitions should make the *process* of synthesis legible.
- **Provenance as first-class citizen**: Every important connection should be able to answer "why does this edge exist?" with source + verbatim excerpt. No black-box graphs.
- **Graph as the product, not a feature**: The 3D graph is not one view among many. The entire information architecture is rethought around it. Traditional sidebar navigation is demoted or contextual.
- **Depth over polish theater**: We would rather have fewer, extremely high-signal, well-provenanced connections than beautiful but shallow visualizations.
- **Agent-usable + human-usable**: The same surface that feels powerful to Steve should also be explorable by Claude Code, Codex, Grok, or future agents (via the trope-viewer pattern or direct integration).
- **Performance as respect**: Heavy real data (1360+ links) must remain usable. Smart presets, smart reduction, and clear feedback when things are settling or filtered are mandatory.

---

## 4. Non-Negotiables (Hard Rules)

These are never compromised:

- **Redaction hygiene** — Never commit raw transcripts, credentials, internal agent instructions, live capture, or anything that should stay in the private brain. All data enters through sanitized `natively/` exports.
- **Port & environment discipline** — Dev server is strictly `127.0.0.1:5217` with `strictPort: true`. The canonical launcher lives in `~/Desktop/Apps/`. Portless alias is `ipcorp-brain`.
- **Design system fidelity** — No Tailwind. Palette is near-black + warm amber primary (#f4a261 / #f7b955), mint/sky/violet secondary, deliberate orange for risk/attention. Heavy intentional use of framer-motion.
- **Provenance on edges** — High-value connections in `brain-graph.json` must carry `sourceFile + excerpt + reason + confidence`.
- **§24 vocabulary** — Relationship types follow the defined set (triggered_by, builds_on, supersedes, contradicts, informs, operates_on, enforces, implements, references, derived_from, etc.).
- **Biome as source of truth** — Lint + format + import sorting. `npm run lint:fix` before commits.
- **Graph as synthesis, not illustration** — We ingest from the actual brain. The graphs are the living model, not pretty pictures.

---

## 5. Design Objectives & Language

### Visual Language
- Near-black backgrounds (`#080a0c`, `#0d1014`)
- Warm amber as primary accent
- Layer colors: insight (#f7b955), decision (#2bd6a3), meeting (#77c7ff), system/entity (#9f8cff), risk (#ff8a5b), open_question (#c084fc), reference (#f4a261)
- Glassmorphic panels with subtle borders
- Motion that feels precise and intentional

### Interaction Language
- The Orbital Assistant is the persistent intelligent conductor (hotkey `/`).
- Direct manipulation of the 3D graph (select, emphasize, camera control) is primary.
- Contextual panels and lenses appear from the graph or orb, not from permanent navigation.
- Performance presets are first-class controls.

### Terminology We Use Internally
- **Synthesis Cockpit** — the overall experience
- **KnowledgeGraph** — the core 3D component
- **BrainExplorer** — the wrapper/cockpit container
- **Orbital / Orb** — the floating assistant
- **Pipeline Observatory / Lineage Explorer** — the visual of how data was processed
- **Lenses** — Full Synthesis, Decision Lineage, Meeting Provenance, Cortex Emergence, etc.
- **Provenance** — source + excerpt on connections

---

## 6. The Central Thesis: Graph + Orb as Primary Interface

The old model (sidebar navigation + separate views for Readiness, Meetings, Packets, Insights, etc.) is being deliberately dismantled.

**New model**:
- The rich 3D KnowledgeGraph (with real 1360+ provenance-backed links) is the persistent, dominant canvas.
- The Orbital Assistant is always present and is the primary way to issue high-level commands ("focus on policy enforcement", "show decision lineage for Fabric", "open the pipeline observatory").
- Other content surfaces as:
  - Contextual side panels triggered from the graph
  - Lens filters that reshape the 3D view
  - Provenance trails and synthesis cards docked around the graph
  - Orb action chips that mutate the graph state

Traditional navigation becomes a thin, optional contextual rail that is minimized when the user is deep in synthesis work.

---

## 7. Data & Synthesis Principles (The Ingestion Pipeline)

The quality of the graphs is entirely downstream of the ingestion process.

See the full living spec in `BRAIN_INGESTION_PIPELINE.md`.

Core commitments:
- Every source type has a documented extraction path.
- Provenance (source + verbatim excerpt) is attached at creation time whenever possible.
- We are moving toward GraphRAG-inspired hierarchical synthesis (community detection, claims, global summaries) on top of our §24 foundation.
- The pipeline itself must be visually observable (this is why the Pipeline Observatory exists).

Non-negotiable: We do not ship "illustrative" graphs. The data must be real, deeply processed, and traceable.

---

## 8. Key Experiences & Capabilities

- **Performance Presets** — Balanced / Heavy / Lightweight that intelligently reduce visual complexity while protecting high-signal nodes and provenance-rich edges.
- **Lenses** — Different semantic projections over the same underlying rich graph.
- **Orbital Command Surface** — Natural language + action chips that actually drive camera, emphasis, lenses, filters, and contextual panels.
- **Pipeline Lineage** — The ability to trace any node or edge back through the exact processing stages that created it.
- **Provenance Cards** — On-demand display of source + excerpt for any connection.
- **Settling & Loading States** — Honest feedback when the force layout or heavy synthesis is still working.

---

## 9. Technical Standards & Constraints

- 3d-force-graph + three-spritetext + Three.js as the primary 3D engine.
- Framer Motion for all meaningful motion.
- Strict TypeScript + Biome.
- Playwright for critical flows (currently under-developed — this is known debt).
- Data contract lives in `DATA_CONTRACT.md` + `src/data.ts`.
- Graph data standards in `GRAPH_DATA_STANDARDS.md`.
- All launchers follow the OneDrive `Desktop/Apps/` pattern with only-bun / only-node port hygiene where relevant.

---

## 10. History of Work & Major Decisions (What We've Actually Done)

### Data & Synthesis Layer
- Built `scripts/generate-brain-graph.ts` with deep multi-pass extraction over transcripts, ADRs, books, dataflows, systems, and Cortex outputs.
- Created rich `data/brain-graph.json` (103 nodes, 1360 links) with explicit §24 relationships and machine-readable provenance on the majority of high-value edges.
- Defined and enforced the §24 vocabulary.
- Established the `BRAIN_INGESTION_PIPELINE.md` as the canonical ongoing process (including GraphRAG inspiration for future depth).

### Interface & Experience
- Moved the real heavy `KnowledgeGraph` component into `src/features/knowledge-graph/`.
- Created `BrainExplorer` as the cockpit wrapper.
- Began the aggressive shift to graph-centric layout (defaulting to the 3D view, cockpit header language, full-bleed intentions, demoted sidebar in graph mode).
- Built the initial **Pipeline Observatory** (visual timeline of the 6 ingestion stages) with a "View Pipeline" button in the cockpit.
- Added basic pipeline lineage mapping inside node detail panels.
- Wired basic Orbital support for opening the pipeline view ("show pipeline", "how was this synthesized").
- Maintained and evolved the `OrbitalAssistant` as a real retrieval surface over the rich graph data with action chips.

### Standards & Hygiene
- Created `GRAPH_DATA_STANDARDS.md` (graph-ready content expectations).
- Maintained strict redaction boundaries and the `natively/` export pattern.
- Enforced port 5217 + strictPort discipline.

### Earlier Foundations
- Strong custom design system (no Tailwind).
- Early multi-pass deep extraction work that produced the first rich provenance-backed graph.
- Multiple rounds of 3D graph stabilization (force damping, camera behavior, emphasis, performance presets).

---

## 11. Current State (Late May 2026)

**Strengths**:
- Real, deeply processed data with excellent provenance.
- The core 3D engine and orb are already quite capable.
- Clear philosophical north star (graph + orb as center, pipeline as foundation).
- The Pipeline Observatory concept has been born in both docs and UI.

**Active Frontiers** (what we are actively building):
- Making the Pipeline Observatory and lineage tracing first-class, beautiful, and deeply integrated with the 3D graph + orb.
- Continuing the architectural inversion so the entire app feels like a cockpit around synthesis rather than a collection of views.
- Evolving the ingestion pipeline toward more GraphRAG-style hierarchical synthesis while staying inside our redaction and control boundaries.
- Raising the quality bar on performance, loading states, and "this feels production" details.

**Known Debt**:
- Still too much traditional navigation chrome in places.
- Test coverage is thin.
- The full "every node/edge has rich clickable lineage" experience is only partially built.
- Some legacy small graph components still exist alongside the real one.

---

## 12. Open Questions & Next Frontiers

- How deep do we go on hierarchical/community layers in the next major data pass?
- What is the exact balance between "always-visible graph" and "summonable contextual panels"?
- How much of the pipeline observability should be 3D vs. 2D flow vs. timeline?
- How do we make the orb's pipeline awareness feel magical rather than bolted on?
- When (and how) do we introduce multi-user / role-based experiences without losing the current calm power?

---

**This document should be updated whenever major direction, philosophy, or hard constraints change.**

It exists so that future work (by Steve or by agents) stays aligned with what we're actually trying to build — not just incremental feature addition on top of the previous version.