# Brain Ingestion & Synthesis Pipeline (Canonical Ongoing Process)

**Owner**: Steve + agents operating on the IP Corp Architecture Brain  
**Goal**: Every single piece of information that enters the brain — regardless of size, shape, or source (transcript, book, architecture doc, PBI, dataflow definition, ADR, meeting note, system description, diagram, run report, etc.) — is processed to a consistent, high-fidelity, provenance-rich state before it contributes to the graphs and insights.

**Current status, 2026-08-14**: This remains the active intent for Brain processing, but
some examples below are May history. The running Workbench uses the current 2D semantic
map, and deeper community synthesis is still planned work. Follow
`docs/architecture/INDEX.md` and `docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`
for the current build order.

This is the foundation. The 3D Knowledge Graph + Orbital experience is only as valuable as the depth and correctness of what feeds it.

## Core Principles

1. **Redaction is absolute** — Nothing raw or sensitive ever leaves the private brain. All processing starts from sanitized `natively/` exports or explicitly approved structured artifacts.
2. **Graph-native at birth** — Content should be born (or quickly transformed into) stable-ID nodes with explicit §24-typed relationships and machine-readable provenance.
3. **Depth before breadth** — We prefer fewer, higher-signal, well-provenanced connections over noisy keyword matches.
4. **Hierarchical synthesis** (GraphRAG-inspired) — Raw entities and relationships are only the first layer. We must also produce community summaries, higher-level claims, influence scores, contradictions, and temporal views.
5. **Repeatable & auditable** — Any agent or human must be able to run the process on new material and understand exactly why every node and edge exists.
6. **Frontend contract respect** — All output must ultimately feed the stable shapes in `DATA_CONTRACT.md` and `src/data.ts` (plus the rich `brain-graph.json` for the 3D layer).

## Source Type Taxonomy

We classify incoming material so we can apply the right extraction depth:

| Category              | Examples                                      | Primary Extraction Approach                  | Expected Richness |
|-----------------------|-----------------------------------------------|----------------------------------------------|-------------------|
| Unstructured Narrative | Meeting transcripts, run reports, notes, books, long architecture write-ups | GraphRAG-style (entity + claim + relationship + community summarization) | Very High |
| Structured Decisions  | ADRs (with frontmatter), formal decisions     | Frontmatter + body parsing + explicit Related/Supersedes | High |
| Structured Systems    | systems.json, dataflows.json, integration maps | Explicit relationship mining + dataflow edges | High |
| Meeting Signals       | Meeting index, prep packets, summaries        | Structured fields + free-text mining for triggers | Medium-High |
| Code/Architecture Artifacts | Architecture docs, data models, PBI semantic models, scripts | Tree-sitter / stakgraph / Joern-style CPG + LLM enrichment for higher semantics | High (for code) |
| Open Items            | Risks, Open Questions, Action Proposals       | Direct structured extraction + linkage       | Medium |

## Recommended Tooling for Deep Processing (2026)

For **narrative / meeting / book / long-form sources** (the highest volume and highest value for synthesis):
- **Microsoft GraphRAG** (https://github.com/microsoft/graphrag) as the primary inspiration and, when feasible, direct tool.
  - Produces hierarchical community summaries — this is the key missing piece for "global" understanding in the 3D graph.
  - Strong claim extraction and provenance tracking.

For **code, data models, architecture, and integration artifacts**:
- **stakgraph** (Tree-sitter + LSP → rich graphs, agent/MCP friendly)
- **Joern** (deepest Code Property Graphs for data/control flow)
- **ENRE** suite for clean entity-relationship extraction

For practical one-off or batch conversion of documents:
- **Neo4j LLM Graph Builder** (https://github.com/neo4j-labs/llm-graph-builder) — excellent for turning folders of sanitized exports into graphs quickly.

**Our strategy**: Keep a custom TypeScript orchestration layer (`scripts/`) as the single, auditable, redaction-respecting entry point. Use the above tools (or their ideas) inside specific extractors when running from the private brain machine. Never commit raw GraphRAG outputs that contain sensitive material.

---

## Visual Pipeline Observatory (What You Asked For)

Yes — a visual view of the data flowing through the pipeline is not only possible, it is **highly valuable** and aligns perfectly with the project's philosophy (graphs as the primary way to understand complex systems).

### Current Options (as of now)

1. **Static + Interactive Diagram** (immediate)
   - The flowchart below (Mermaid) gives you a clear, zoomable, clickable visual of the entire end-to-end process.
   - Open this file in any Markdown viewer that supports Mermaid (VS Code, GitHub, Obsidian, etc.).

2. **In-App Pipeline Lineage Explorer** (high priority to build next)
   - Inside the Synthesis Cockpit / 3D Knowledge Graph, we can add a mode where:
     - Every node and edge in the main brain graph shows its full "processing history" (which stage created it, which source file + excerpt, which extractor logic).
     - A dedicated "Pipeline View" renders the ingestion process itself as its own explorable graph (stages as nodes, data transformations and provenance as edges).
     - The Orbital Assistant can be commanded: "Show me how the policy enforcement gap insight was synthesized" → it flies the view to the relevant pipeline subgraph and highlights the actual transcript → insight → ADR chain with real excerpts.
   - This turns the pipeline from invisible black box into a first-class, queryable, visual part of the brain.

3. **Future**: Live/replayable run visualizations (after a sync + generate run, load a "run manifest" that shows timing, file counts per stage, confidence distribution, new nodes created, etc.).

Below is the first version of the visual you can look at right now.

## End-to-End Pipeline Flow (Mermaid Diagram)

```mermaid
flowchart TD
    classDef stage fill:#1a1f26,stroke:#f4a261,stroke-width:2px,color:#f8f5ef
    classDef artifact fill:#0f1318,stroke:#77c7ff,stroke-width:1px,color:#dad3c8
    classDef source fill:#11161c,stroke:#ff8a5b,stroke-width:1px,color:#dad3c8

    subgraph Private["Private Brain (ipcorp-architecture-brain) - Never Commits Raw Data"]
        direction TB
        Raw["Unstructured Sources<br/>(transcripts, notes, books, architecture write-ups)"]:::source
        StructuredSrc["Structured Sources<br/>(systems.json, dataflows.json, ADRs, project-memory)"]:::source
        Natively["natively/ Layer<br/>(mandatory redaction gate)"]:::artifact
    end

    subgraph Export["Export (scripts/sync-data.mjs)"]
        Sync["One-way sanitized export<br/>→ data/ folder in this repo"]:::artifact
    end

    subgraph Pipeline["Ingestion & Synthesis Pipeline (BRAIN_INGESTION_PIPELINE.md)"]
        direction TB
        S1["Stage 1: Discovery & Classification<br/>Identify new/changed artifacts + classify by type"]:::stage
        S2["Stage 2: Entity + Claim Extraction<br/>(GraphRAG-style + custom parsers)"]:::stage
        S3["Stage 3: §24 Relationship Typing + Provenance<br/>triggered_by, builds_on, supersedes, contradicts... + real excerpts"]:::stage
        S4["Stage 4: Hierarchical Synthesis<br/>Community detection, summaries, influence scoring (GraphRAG leap)"]:::stage
        S5["Stage 5: Quality Gates + Assembly<br/>Confidence scoring, validation, manifest update"]:::stage
        Generator["scripts/generate-brain-graph.ts<br/>(current executable embodiment of S1-S5)"]:::stage
    end

    subgraph Output["Committed Safe Artifacts"]
        BrainGraph["data/brain-graph.json<br/>103 nodes • 1360+ edges with full provenance"]:::artifact
        ReadModels["cortex-insights.json, adrs.json, risks.json, etc."]:::artifact
        Manifest["export-manifest.json + run logs"]:::artifact
    end

    subgraph Cockpit["Synthesis Cockpit (this app)"]
        direction TB
        KG["KnowledgeGraph (3D) + BrainExplorer<br/>The primary interface"]:::artifact
        Orb["OrbitalAssistant<br/>Drives exploration + can query pipeline lineage"]:::artifact
        Obs["Pipeline Observatory / Lineage Explorer<br/>(visual of exactly this diagram + live traces)"]:::stage
    end

    Raw --> Natively
    StructuredSrc --> Natively
    Natively --> Sync
    Sync --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> Generator

    Generator --> BrainGraph
    Generator --> ReadModels
    Generator --> Manifest

    BrainGraph --> KG
    ReadModels --> KG
    KG <--> Orb
    Orb -->| "Show how this was synthesized" | Obs
    Obs -.->| "Traces any node/edge back through exact stages + source files + excerpts" | Generator
```

This diagram (and future interactive versions) is exactly the "visual view of how data is being processed and analyzed through the pipeline" you described.

---

Would you like me to:

A) Immediately build the **in-app Pipeline Lineage Explorer** (using the existing 3D graph tech + orb commands) so when you open the app you can literally fly through the processing stages and see real provenance for how specific insights/edges were created?

B) Keep iterating on richer static + animated diagrams first (add timing, confidence heatmaps, actual run manifests, etc.)?

C) Focus on making the next real ingestion run produce structured "pipeline run artifacts" that the visual can consume?

Just tell me which direction (or combination) to execute on right now. This is high-leverage work.

## Pipeline Stages (Canonical)

Every ingestion run should conceptually follow these stages:

1. **Discovery & Classification**
   - Identify new or changed artifacts since last high-water mark (from `export-manifest.json` or similar).
   - Classify by source type above.

2. **Sanitization Gate** (mandatory)
   - All material must already live in the approved sanitized `natively/` structure or equivalent before any synthesis step touches it.

3. **Entity & Claim Extraction**
   - Stable IDs for all significant entities.
   - Explicit claims / observations (not just raw text).

4. **Relationship Typing (using §24 vocabulary)**
   - Use the authoritative list from `GRAPH_DATA_STANDARDS.md` + `generate-brain-graph.ts` (triggered_by, builds_on, supersedes, contradicts, informs, operates_on, enforces, implements, references, derived_from, etc.).
   - Every edge must carry machine-readable provenance (sourceFile + excerpt + reason + confidence).

5. **Hierarchical & Community Synthesis** (the GraphRAG leap)
   - Detect communities / clusters.
   - Generate higher-level "Synthesis" or "Community" nodes with summaries.
   - This is what makes the 3D graph feel like a living intelligence rather than a list of facts.

6. **Quality & Confidence Scoring**
   - Every node and edge gets explicit confidence.
   - Heuristic vs. explicit provenance is clearly marked.

7. **Graph Assembly & Validation**
   - Produce `brain-graph.json` (and any richer layers).
   - Run structural validation (no orphan high-value nodes, stable IDs, required provenance on important edges, etc.).
   - Update `export-manifest.json` with high-water marks.

8. **Frontend Projection**
   - The existing read models (`cortex-insights.json`, `adrs.json`, etc.) + the rich graph are written to `data/`.
   - The frontend (especially the central 3D + Orbital) consumes these.

## Current State (as of this writing)

- `scripts/sync-data.mjs` — solid one-way redaction-safe export from private `natively/` layer.
- `scripts/generate-brain-graph.ts` — already does impressive multi-pass deep extraction when `BRAIN_PATH` is available, with good §24 typing and provenance on many edges. It is the current synthesis engine.
- `GRAPH_DATA_STANDARDS.md` — good "graph-ready at write time" guidance.
- Gaps for true ongoing production use:
  - Not yet fully modular/staged (harder to extend for new source types).
  - Limited hierarchical/community summarization (the GraphRAG strength).
  - No formal runbook or quality gates for continuous operation.
  - Manual effort still required for the deepest passes.

## Next Actions (Prioritized)

1. Formalize this document and keep it as the single source of truth for the ingestion process.
2. Refactor `generate-brain-graph.ts` toward clear stages + pluggable extractors (one per major source type).
3. Add a first-class "hierarchical synthesis" pass (community detection + summary nodes) — start by adopting GraphRAG patterns even if we run the actual indexing privately.
4. Create a simple `run-ingestion.ts` (or enhance the existing scripts) with better logging, dry-run mode, and manifest updating.
5. Define quality thresholds (e.g. "no high-value node may have only heuristic edges").
6. When new material appears, the documented process (not ad-hoc script runs) is followed.

## How to Run (Current Practical Command)

```bash
# From the private brain machine (where the full repo is present)
BRAIN_PATH=/path/to/ipcorp-architecture-brain npm run sync:data
npx tsx scripts/generate-brain-graph.ts
```

The output `data/brain-graph.json` (plus the other read models) is what the frontend (and future agents) consume.

---

This pipeline is now the highest-priority piece of infrastructure for the entire brain. The 3D graph + orb experience will be rebuilt around whatever high-quality, deeply synthesized data this process produces.

Update this document whenever the process evolves. All agents working on ingestion must follow it.
