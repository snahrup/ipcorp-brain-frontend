---
name: IP Corp Brain Frontend
mode: creative-blank-canvas
classification: stakeholder-safe-design-context
generatedAt: 2026-05-27
sourceData:
  seed: data/frontend-seed.json
  contract: DATA_CONTRACT.md
  brief: STITCH_FRONTEND_BRIEF.md
referenceSites:
  - https://unabyss.com/
creativeLatitude:
  visualStyle: open
  layoutStyle: open
  componentStyle: open
  requiredInformationArchitecture: true
---

# IP Corp Brain Frontend Design Context

## Creative Direction

Treat this as a blank-canvas product design exercise. Do not copy the raw brain dashboard as a visual target. The goal is to create a high-quality stakeholder-facing interface that makes the IP Corp Architecture Brain understandable, navigable, and useful.

Stitch should own the creative direction: layout, visual style, component treatments, density, navigation model, and interaction design are open.

The constraints are about **what the product must organize**, not how it must look.

## Creative Reference

Steve likes the product/design feel of `https://unabyss.com/`. Use it as a directional reference, not a template to copy.

Useful concepts to borrow:

- Context chaos becoming an organized command surface.
- Source/integration chips that make many systems feel manageable.
- A clear "how it works" progression.
- Segmented context, confidence, sensitivity, and access-level ideas.
- Permission/scoping controls as a first-class part of the product.
- Strong language around context being current, structured, and usable by agents.
- A product identity that feels sharper than a standard enterprise dashboard.

Do not duplicate Unabyss copy, brand, layout, or visual assets. Translate the spirit into an IP Corp stakeholder workspace.

## What This Product Is

The IP Corp Brain is an intelligence layer for a Microsoft Fabric / MDM / Power BI / Purview engagement. It collects meeting intelligence, project memory, risks, decisions, open questions, prep packets, and Cortex-style observations into a source-backed operating surface.

The frontend should let stakeholders answer:

- What is current?
- What changed recently?
- What needs a decision?
- What evidence supports this?
- What meetings are ready?
- What actions are proposed?
- What is stale, missing, or unsafe to share?

The product can be framed as a context headquarters for the IP Corp engagement: structured once, shared safely, and kept ready for people and agents.

## Core Objects

Use the seed data and contract to organize the UI around these objects:

1. **Readiness Status**
   - Freshness label
   - Source health
   - Counts
   - Runtime boundary

2. **Meetings**
   - Upcoming / active / recent
   - Missing or stale packets
   - Prep packet links
   - Evidence references

3. **Prep Packets**
   - Title
   - Starts at
   - Attendees
   - Summary
   - Why it matters
   - Current state
   - Related work
   - Open questions
   - Open commitments
   - Talking points
   - Risks
   - Suggested posture
   - Evidence references

4. **Cortex Insights**
   - Type
   - Title
   - Summary
   - Confidence
   - Trigger
   - Observations
   - Connections
   - Reasoning chain
   - Alternatives considered
   - Confidence factors
   - Recommended action

5. **Action Proposals**
   - Type
   - Status
   - Suggested action
   - Suggested wording
   - Approval requirement
   - Risk notes

6. **Open Questions**
   - ID
   - Priority
   - Question
   - Answer owner
   - Target
   - Status

7. **Risks**
   - ID
   - Severity
   - Likelihood
   - Exposure
   - Mitigation
   - Owner

8. **Architecture Decisions**
   - ADR status
   - Proposed decisions
   - Candidate decision queue

## Required User Workflows

The interface must support:

- Scan current brain health in under 30 seconds.
- Open the next best meeting packet quickly.
- Review proposed actions without executing them.
- See which questions and risks block progress.
- Drill from insight to evidence references.
- Separate stakeholder-safe content from raw/private source material.
- Understand whether a view is fresh, stale, or pending source evidence.

## Design Freedom

You may choose:

- Light, dark, or adaptive theme.
- Color palette.
- Typography.
- Navigation model.
- Card/table/detail patterns.
- Visualization style.
- Dashboard composition.

Prefer a distinctive, professional product identity over generic enterprise dashboard defaults. The design should feel like a high-quality intelligence workspace, not a document repository.

## Hard Boundaries

Do not design around raw transcript browsing. This frontend is a curated stakeholder-safe surface.

Do not imply actions execute automatically. Proposals are approval-gated by default.

Do not expose credentials, raw live-capture snippets, internal agent instructions, private workflow receipts, or personal/off-topic material.

Do not invent fake meetings, fake metrics, fake stakeholders, or fake decisions. Use the data contract.
