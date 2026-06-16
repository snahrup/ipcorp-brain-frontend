import { TriangleAlert } from "lucide-react";
import { formatDate, formatStatus, labelize } from "../../lib/utils";
import type { Risk } from "../../types/brain";
import { DrawerHeader, InfoBlock, MetaGrid } from "../ui";

interface RiskDetailProps {
  risk: Risk;
}

export function RiskDetail({ risk }: RiskDetailProps) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={TriangleAlert} eyebrow={risk.id} title={risk.risk} />
      <MetaGrid
        items={[
          ["Severity", labelize(risk.severity)],
          ["Likelihood", formatStatus(risk.likelihood)],
          ["Owner", risk.owner],
          ["Last reviewed", formatDate(risk.lastReviewed)],
        ]}
      />
      <InfoBlock title="Exposed" body={risk.exposed} />
      <InfoBlock title="Mitigation" body={risk.mitigation} />
    </div>
  );
}
