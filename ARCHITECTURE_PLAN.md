# Architecture Plan — IP Corp Brain Frontend (Production Grade)

**Date**: 2026-05-28  
**Owner Mindset**: Build this the way I would if it were my own deliverable to a sophisticated client who expects excellence.

**Current status, 2026-08-14**: This is a historical May plan. It remains useful for
graph ambition, but the active Workbench product, runtime, launcher, palette, graph
engine, and build order now live in `docs/architecture/INDEX.md` and
`docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`.

## Guiding Principles
- The 3D Knowledge Graphs (3d-force-graph) are the soul of the experience.
- Every major section of the brain deserves a distinct, immersive texture.
- Real data from the full brain repo. No more pretending the sanitized seed is the limit.
- Premium but calm. No visual noise. Motion and interaction must earn their place.
- Steve-first admin layer now; proper Entra ID path later.
- Clean, maintainable codebase that can evolve.

## High-Level Information Architecture

### Core Experience
- **Brain Graph (Hero)**: The default/primary immersive view. Multi-layer 3D force graph showing synthesis across the entire brain.
- **Sectional Experiences** (distinct but interconnected):
  - Meetings: Temporal + provenance (calendar/timeline lens that feeds the graph).
  - Insights / Cortex: Emergence and reasoning networks (deep graph focus).
  - Project Memory / Decisions: Lineage and traceability graphs.
  - Systems & Architecture: Structural dependency views.
- **Admin / Preferential Layer**: Password-gated (now) → Entra ID (later). Controls visibility, theme, experimental features.

### Data Strategy
- Primary data source: Full `ipcorp-architecture-brain` repo (granted access).
- Ingestion layer: Scripts that can produce optimized graph + search data (see `scripts/generate-brain-graph.ts` starter).
- For development: Direct access or local server.
- For client delivery: Static export + optional lightweight backend later.

## Current Technical State & Recommended Path

**Current Pain Points (to be addressed ruthlessly)**:
- Monolithic `App.tsx` (~1400+ lines).
- Old "readiness columns" mental model that no longer matches the true mission.
- Data still anchored to the old tiny sanitized seed in many places.
- Graph experience exists but is not yet the unmistakable hero.

**Recommended Rebuild Approach** (I will execute this):
1. **Phase 1 (Now)**: Elevate the 3D Knowledge Graph to be the primary, production-quality experience. Make it feel complete and reviewable on its own.
2. **Phase 2**: Introduce clean feature-based architecture (`features/brain-graph/`, `features/meetings/`, `features/admin/`, etc.).
3. **Phase 3**: Build supporting immersive views for other sections that feed the graphs.
4. **Phase 4**: Full admin controls + data ingestion pipeline + polish for client delivery.

## Success Criteria for "Client Ready"

- The 3D graphs are elegant, performant, and clearly demonstrate synthesis value.
- Navigation and section experiences feel intentional and premium.
- Steve can use the admin layer to shape his personal view.
- The app feels like a finished, thoughtful product — not a prototype that grew.
- Clear documentation of architecture and how to extend the graphs/data.

This plan will be updated as work progresses. No sacred cows.
