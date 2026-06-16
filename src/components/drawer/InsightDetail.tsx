import { Sparkles } from "lucide-react";
import type { CortexInsight } from "../../types/brain";
import { ConfidenceBar, DrawerHeader, InfoBlock, ListBlock, ReasoningPreview } from "../ui";

interface InsightDetailProps {
  insight: CortexInsight;
}

export function InsightDetail({ insight }: InsightDetailProps) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={Sparkles} eyebrow={insight.type} title={insight.title} />
      <ConfidenceBar value={insight.confidence} />
      <p className="lead-copy">{insight.summary}</p>
      <InfoBlock title="Trigger" body={insight.reasoning.trigger} />
      <ListBlock title="Observations" items={insight.reasoning.observations} />
      <ListBlock title="Connections" items={insight.reasoning.connections} />
      <ListBlock title="Reasoning chain" items={insight.reasoning.chain} />
      <ListBlock title="Alternatives considered" items={insight.reasoning.alternativesConsidered} />
      <ListBlock title="Confidence factors" items={insight.reasoning.confidenceFactors} />
      <InfoBlock title="Recommended action" body={insight.recommendedAction} />
      <ListBlock title="Action proposal refs" items={insight.actionProposalRefs} humanize />
    </div>
  );
}
