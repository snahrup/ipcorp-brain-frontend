import type { CortexInsight } from "../../types/brain";

interface ReasoningPreviewProps {
  insight: CortexInsight;
}

export function ReasoningPreview({ insight }: ReasoningPreviewProps) {
  const observations = insight.reasoning.observations ?? insight.reasoning.connections ?? [];
  return (
    <div className="reasoning-preview">
      {observations.slice(0, 3).map((item, index) => (
        <div className="reasoning-step" key={`${insight.id}-${index}`}>
          <span>{index + 1}</span>
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}
