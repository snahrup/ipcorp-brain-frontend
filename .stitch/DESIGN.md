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

## Critical Correction

Do **not** design a generic enterprise operations dashboard. This is not a system-monitoring product.

Do not invent:

- Active nodes
- Protocol alerts
- Global throughput
- Network intelligence
- Asset health
- Security protocols
- Server locations
- Sync IDs
- Synthetic chart metrics

Those objects are not in the product. If a screen shows them, the design is solving the wrong problem.

The real product objects are readiness, meetings, prep packets, open questions, risks, ADRs, Cortex insights, action proposals, source health, and evidence references.

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
- A modern dark product surface with crisp contrast, refined glow, and layered depth.
- Motion that makes context feel actively gathered, filtered, and assembled.
- Small animated status moments: freshness, source health, approvals, evidence refs, and readiness.

Do not duplicate Unabyss copy, brand, layout, or visual assets. Translate the spirit into an IP Corp stakeholder workspace.

## Motion And Visual Energy

The interface should feel modern and alive, closer to a premium context operating system than a static admin dashboard.

Preferred motion language:

- Source chips can flow into a readiness surface or packet view.
- Detail panels should slide, expand, or unfold with clear spatial continuity.
- Reasoning chains should reveal step-by-step instead of appearing as a flat wall of text.
- Evidence references should feel attached to claims: hover, focus, or expand can expose source paths and timestamps.
- Stale or missing inputs should use restrained amber/red attention states, not alarmist SOC-console treatment.
- Counts and freshness indicators can animate subtly when the page loads.
- Navigation transitions should preserve context so users feel they are drilling deeper into the same brain, not jumping between unrelated pages.

Avoid motion that feels decorative only. The movement should explain how raw source inputs become stakeholder-safe context.

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

## First Screen Must Show

The first generated screen should be a **Brain Readiness Workspace**, not a generic dashboard.

It should include real objects from `data/frontend-seed.json`, such as:

- Freshness: `fresh-no-new-inputs-after-pryor-promotion`
- Next best packet: `weekly-fabric-post-onsite-synthesis`
- Open action proposals: proactive coaching disable-gate audit, Fabric calendar reset details
- Missing/stale evidence: May 27 plant-tour follow-up post-capture missing
- Open questions count: 48
- Active risks count: 22
- ADRs: 6 proposed, plus candidate queue
- Source health: Teams, Cluely, Notion, project-memory, Natively contract, live captures, outcomes

Use actual data labels. Do not make up placeholder telemetry.

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
