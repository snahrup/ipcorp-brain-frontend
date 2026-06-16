import { GitBranch } from "lucide-react";
import { formatDate, formatStatus, stripMarkdown } from "../../lib/utils";
import type { Adr, AdrCandidate } from "../../types/brain";
import { DrawerHeader, MetaGrid } from "../ui";

interface AdrDetailProps {
  adr: Adr | AdrCandidate;
  label: string;
}

export function AdrDetail({ adr, label }: AdrDetailProps) {
  const isAdr = "number" in adr;

  return (
    <div className="drawer-stack">
      <DrawerHeader
        icon={GitBranch}
        eyebrow={label}
        title={isAdr ? adr.title : stripMarkdown(adr.topic)}
      />
      {isAdr ? (
        <MetaGrid
          items={[
            ["Status", formatStatus(adr.status)],
            ["Date", formatDate(adr.date)],
            ["Decider", adr.decider],
            ["Supersedes", adr.supersedes ?? "None"],
          ]}
        />
      ) : (
        <MetaGrid
          items={[
            ["Status", formatStatus(adr.status)],
            ["Date flagged", formatDate(adr.dateFlagged)],
            ["Source", adr.source],
          ]}
        />
      )}
    </div>
  );
}
