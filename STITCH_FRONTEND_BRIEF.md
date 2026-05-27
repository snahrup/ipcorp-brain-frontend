# Google Stitch Frontend Brief

Design a polished, work-focused web app for stakeholders to view and interact with the IP Corp Architecture Brain.

This should be a creative blank-canvas design. Do not copy the existing brain dashboard's visual style unless it helps. The source material tells Stitch what the product needs to organize; Stitch should decide the visual direction.

Steve likes the design/product feel of `https://unabyss.com/`. Use that as inspiration for the idea of a context headquarters: many sources, clean segmentation, access controls, current context, and agent-ready retrieval. Do not copy the site; translate the spirit into the IP Corp Brain.

## Audience

- Steve Nahrup: consultant/operator maintaining the brain.
- Patrick Stiller and selected IP Corp stakeholders: readers who need project state, readiness, decisions, risks, and next actions without seeing the raw working repo.
- Future frontend implementers: need stable screens and data contracts.

## Experience Goal

Make the brain feel like a live intelligence workspace for the engagement:

- What changed?
- What needs attention?
- What decisions are pending?
- What meetings are ready?
- What evidence supports the recommendation?
- What is safe to share?

The core narrative is similar in shape to "context chaos into context clarity," but for IP Corp's Fabric/MDM engagement.

The design should feel distinctive, modern, and useful. Avoid a marketing landing page.

## Correction From First Stitch Attempt

The first generated screen misunderstood the product as an operations/network monitoring dashboard. That is wrong.

Do not show active nodes, system health percentages, protocol alerts, global throughput, server locations, or asset management. None of those are IP Corp Brain objects.

This product displays a curated engagement brain:

- Readiness status
- Meeting prep packets
- Missing/stale source evidence
- Open questions
- Risks
- Architecture decisions
- Cortex insights
- Approval-gated action proposals
- Source health
- Evidence references

## Primary Screens

1. **Dashboard**
   - Freshness status
   - Next best packet: `weekly-fabric-post-onsite-synthesis`
   - Open action proposals: proactive coaching disable-gate audit, Fabric calendar reset details
   - Critical stale/missing evidence: May 27 plant-tour post-capture missing, DQ-048 unresolved, Fabric calendar fields missing
   - Top risks and decisions needing attention
   - Counts: 14 prep packets, 20 Cortex insights, 13 proposals, 48 open questions, 22 risks, 6 proposed ADRs

2. **Meetings**
   - Upcoming, active, recent
   - Readiness status
   - Prep packet drawer
   - Evidence references
   - Missing post-meeting capture warning

3. **Cortex Insights**
   - Insight cards grouped by type/tag/confidence
   - Reasoning drawer with trigger, observations, connections, chain, alternatives, confidence factors
   - Linked action proposals

4. **Action Proposals**
   - Proposed / executed / blocked
   - Approval required indicator
   - Suggested action and suggested wording
   - Risk notes

5. **Open Questions**
   - Priority buckets
   - Owner, target, status
   - Linked risks, decisions, and meetings

6. **Risks and Decisions**
   - Active risk register
   - ADR status board
   - Candidate decisions queue

7. **Source Health**
   - Teams / Cluely / Notion / Natively / project-memory freshness
   - Runtime boundary: Natively reads the brain and does not call live context systems

## Visual Direction

Open. Stitch can choose the palette, typography, spatial model, and component style. The only requirement is that the interface remains serious enough for IP Corp stakeholders and clear enough for operational use.

The design can lean more ambitious than a standard internal dashboard. It should make a complex knowledge system feel coherent, current, and alive.

## Interaction Notes

- Every insight, risk, action, and meeting should expose evidence refs.
- Do not show raw private transcript text unless it has been explicitly sanitized into the data contract.
- The approval queue should default to review-only. No action executes from the frontend without explicit approval.
- Make stale/missing evidence visible without making the whole dashboard feel broken.

## Suggested Stitch Prompt

Create a desktop-first intelligence web app for the IP Corp Architecture Brain. Use `data/frontend-seed.json` as the source of truth. Do not invent operations telemetry. This is not a network dashboard, asset dashboard, protocol monitor, or security operations console. It is a stakeholder-safe context workspace for meetings, readiness, prep packets, open questions, risks, ADRs, Cortex insights, source health, and approval-gated action proposals. Take creative ownership of the visual direction and layout, with inspiration from Unabyss's context-headquarters feel, but render the actual brain objects and workflows.
