# Stitch Repair Prompt

Use this prompt in Stitch when the generated screen looks like a generic operations dashboard.

```text
The previous design misunderstood the product. Discard the operations/network dashboard direction.

This is NOT:
- an enterprise operations dashboard
- a protocol monitor
- an asset management system
- a security operations console
- a network intelligence dashboard
- a server/node/throughput monitoring tool

Do not show active nodes, system health percentages, protocol alerts, global throughput, server locations, asset IDs, latency spikes, or synthetic charts. Those objects are invented and are not in the data.

This product is the IP Corp Architecture Brain: a stakeholder-safe context workspace for a Microsoft Fabric / MDM / Power BI / Purview engagement.

Use the attached data files as the source of truth, especially:
- data/frontend-seed.json
- data/status.json
- data/meeting-index.json
- data/prep-packets.json
- data/cortex-insights.json
- data/action-proposals.json
- data/open-questions.json
- data/risks.json
- data/adrs.json

Design the first screen as a Brain Readiness Workspace.

It must display these real things:
- Freshness label: fresh-no-new-inputs-after-pryor-promotion
- Next best packet: weekly-fabric-post-onsite-synthesis
- Open action proposals: proactive coaching disable-gate audit and Fabric calendar reset details
- Missing/stale evidence: May 27 plant-tour follow-up has no post-meeting capture yet
- Counts: 14 prep packets, 20 Cortex insights, 13 action proposals, 48 open questions, 22 risks, 6 proposed ADRs
- Source health: Teams, Cluely, Notion, project-memory, Natively contract, live captures, outcomes, Natively auto-export, context capsules
- Critical decisions/questions: DQ-048 Pryor reporting path, ADR-0006 plant-floor evidence stream contract, brain stakeholder access boundary

Primary navigation should be:
- Readiness
- Meetings
- Prep Packets
- Cortex Insights
- Actions
- Open Questions
- Risks
- Decisions
- Source Health

Core interactions:
- Click next best packet to open a prep packet detail view.
- Click a Cortex insight to open its reasoning: trigger, observations, connections, chain, alternatives considered, confidence factors.
- Click an action proposal to review suggested action, suggested wording, approval requirement, risk, and evidence refs.
- Click an open question/risk/ADR to see owner, status, related evidence refs, and why it matters.

Creative direction is open. Use Unabyss only as inspiration for the feeling of a context headquarters with many sources organized into current, safe, agent-ready context. Do not copy Unabyss. Do not create a marketing page. This is a real product workspace.
```

