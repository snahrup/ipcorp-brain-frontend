# Graph Data Standards for the IP Corp Architecture Brain

**Purpose**: This document defines the required conventions so that every piece of content written into the brain (by humans or automated agents) is born "graph-ready." The 3D/2D knowledge graphs in the frontend are not a nice-to-have visualization — they are the primary way value is derived from the brain. Dirty or inconsistent data destroys their usefulness.

These standards are **mandatory** for any agent or script that writes to this repository.

## 1. Core Philosophy

Every node in a knowledge graph must have:
- A stable, unique, machine-readable ID
- A clear type (Insight, Decision, Meeting, System, Entity, Person, etc.)
- Explicit, typed relationships to other nodes
- Strong provenance (where it came from + when)

Every edge must have:
- A clear relationship type (e.g., "derived_from", "drives", "references", "implemented_in", "contradicts")
- Optional strength / confidence

## 2. Required Metadata for All Major Content Types

### For every new Insight / Cortex output
- Must be written with a stable ID: `insight-YYYY-MM-DD-<short-kebab-slug>`
- Must explicitly list `source_node_ids` (the meetings, ADRs, systems, etc. that contributed)
- Must declare `relationship_types` used in its reasoning (e.g., "triggered_by", "builds_on", "contradicts")
- Must include confidence + justification factors in structured form (not just prose)

Example expected structure (add to Cortex output schema):
```json
{
  "id": "insight-2026-05-27-brain-frontend-motion",
  "type": "synthesis_opportunity",
  "source_node_ids": ["meeting-2026-05-27-...", "adr-0007-...", "system-fabric"],
  "explicit_relationships": [
    { "target_id": "adr-0007", "type": "builds_on" },
    { "target_id": "meeting-...", "type": "triggered_by" }
  ]
}
```

### For every new ADR / Decision
- File name must be `ADR-NNNN-<kebab-slug>.md`
- Must contain a machine-readable frontmatter or section with:
  - `status`
  - `decided_on`
  - `affects_node_ids` (list of systems, entities, processes it impacts)
  - `derived_from_node_ids` (meetings, insights, risks that drove it)

### For every Meeting Summary
- Must link to its raw transcript node(s) using stable IDs.
- Must extract explicit `decision_ids`, `open_question_ids`, `insight_trigger_ids`, and `system_mentions` in a structured block (not just prose).
- Must follow the existing Cockpit format + add a "Graph Metadata" section.

### For Systems / Entities
- All systems must have stable IDs in `project-memory/entities/systems.json`.
- When mentioning a system in any document, prefer the stable ID over free text.

## 3. Naming & ID Rules (Strict)

- All node IDs must be globally unique and stable across time.
- Preferred pattern: `<type>-<YYYY-MM-DD>-<short-kebab-description>` or the existing ADR/DQ patterns.
- Never use auto-generated UUIDs or timestamps as primary IDs unless you also maintain a human-readable slug.
- Slugs must be kebab-case, lowercase, no special characters.

## 4. Relationship Vocabulary (Start Here — Expand Deliberately)

Use these canonical relationship types when possible:

- `triggered_by`
- `derived_from`
- `builds_on`
- `implements`
- `enforces`
- `references`
- `contradicts`
- `supersedes`
- `informs`
- `operates_on`
- `governs`

When you need a new relationship type, add it to this document in the same change (self-extension rule).

## 5. Provenance Requirements

Every new piece of content must answer:
- What is the immediate source? (specific meeting file, specific Cortex run, specific external document)
- When was it captured/derived?
- Who (or which agent) created it?

This must be machine-readable, not just in prose.

## 6. What Agents Must Do Differently Going Forward

1. **Before writing**, run a mental (or literal) check: "Will this content be useful as nodes or edges in the knowledge graphs?"
2. **Add explicit graph metadata** in the formats above.
3. **Use stable IDs** for every entity, system, meeting, decision, or insight you reference.
4. **When creating new categories or patterns**, update this document + the INGESTION_PLAYBOOK.md in the same commit.
5. **Never create "vague" summaries** that would produce low-value or duplicate nodes in the graph. If the content doesn't have clear connections or provenance, mark it as thin + open questions instead.

## 7. Enforcement

- Cortex runs should eventually validate new content against these standards and flag violations.
- Steve (or the admin view) can hide sections/nodes that violate these rules until cleaned.
- Over time, the ingestion agents will be updated to emit graph-friendly output by default.

---

**This document takes precedence for any agent whose output will feed the knowledge graphs.**

Additions or changes to this document must be made deliberately and documented in the same change that introduces the new pattern.