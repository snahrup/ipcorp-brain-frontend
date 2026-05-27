# Data Contract

The frontend consumes sanitized read models under `data/`.

## Files

| File | Purpose |
|---|---|
| `data/export-manifest.json` | Export metadata, source high-water marks, redaction policy |
| `data/frontend-seed.json` | Single bundled seed object for design/prototyping |
| `data/status.json` | Readiness counts, source health, runtime boundary |
| `data/meeting-index.json` | Upcoming, active, recent, stale/missing meeting readiness |
| `data/prep-packets.json` | Compact prep packet list |
| `data/cortex-insights.json` | Cortex-style insights with reasoning depth |
| `data/action-proposals.json` | Approval-gated proposed/executed action queue |
| `data/open-questions.json` | Parsed open question queue |
| `data/risks.json` | Parsed active risk register |
| `data/adrs.json` | ADR index and candidate queue |

## Redaction Rules

Never include:

- SQL usernames or passwords
- OAuth tokens, API keys, credentials, or auth files
- Raw Teams, Cluely, Notion, Natively transcript text
- Live-capture snippets
- Internal agent instructions
- Personal/off-topic capture material
- Private workflow receipts beyond sanitized proposal status

Allowed:

- Source paths as evidence references
- Meeting titles, summaries, readiness state, and non-sensitive action/risk/decision text
- Cortex reasoning once it has been generated into the Natively contract layer
- Counts, freshness labels, and source health summaries

## Core Types

```ts
type BrainStatus = {
  updatedAt: string;
  freshnessLabel: string;
  counts: Record<string, number>;
  sourceHealth: Record<string, SourceHealth>;
  runtimeBoundary: RuntimeBoundary;
};

type MeetingIndex = {
  updatedAt: string;
  readinessSummary: {
    status: string;
    nextBestPacket: string;
    note: string;
  };
  upcoming: MeetingPointer[];
  active: MeetingPointer[];
  recent: MeetingPointer[];
  missingOrStalePackets: StaleItem[];
};

type PrepPacket = {
  id: string;
  title: string;
  startsAt: string | null;
  attendees: string[];
  summary: string;
  whyItMatters: string;
  currentState: string[];
  openQuestions: string[];
  openCommitments: string[];
  talkingPoints: string[];
  risks: string[];
  suggestedPosture: string;
  evidenceRefs: string[];
  liveContextMarkdown: string;
};

type CortexInsight = {
  id: string;
  type: string;
  title: string;
  summary: string;
  createdAt: string;
  confidence: string;
  reasoning: {
    trigger: string;
    observations: unknown[];
    connections: unknown[];
    chain: string[];
    alternativesConsidered: string[];
    confidenceFactors: string[];
  };
  recommendedAction: string;
  actionProposalRefs: string[];
  tags: string[];
};

type ActionProposal = {
  id: string;
  type: "email" | "teams_message" | "calendar_event" | "task" | "note" | "follow_up";
  title: string;
  status: "proposed" | "executed" | "rejected" | "snoozed" | "failed";
  proposal: Record<string, unknown>;
  approval: {
    required: boolean;
    reason: string;
  };
  risk: {
    level: string;
    notes: string;
  };
  tags: string[];
};
```

