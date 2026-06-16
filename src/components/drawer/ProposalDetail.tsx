import { ListChecks } from "lucide-react";
import { formatStatus, toneForStatus } from "../../lib/utils";
import type { ActionProposal } from "../../types/brain";
import { DrawerHeader, InfoBlock, ListBlock, StatusChip } from "../ui";

interface ProposalDetailProps {
  proposal: ActionProposal;
}

export function ProposalDetail({ proposal }: ProposalDetailProps) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={ListChecks} eyebrow={proposal.type} title={proposal.title} />
      <div className="drawer-hero-strip">
        <StatusChip label={formatStatus(proposal.status)} tone={toneForStatus(proposal.status)} />
        <StatusChip
          label={proposal.approval?.required ? "Approval required" : "No approval required"}
          tone={proposal.approval?.required ? "amber" : "green"}
        />
        {proposal.risk?.level && (
          <StatusChip label={`Risk: ${proposal.risk.level}`} tone="orange" />
        )}
      </div>
      <InfoBlock title="Suggested action" body={proposal.proposal?.suggestedAction} />
      <InfoBlock title="Suggested wording" body={proposal.proposal?.suggestedWording} />
      <InfoBlock title="Why now" body={proposal.proposal?.whyNow} />
      <InfoBlock title="Approval boundary" body={proposal.approval?.reason} />
      <InfoBlock title="Risk notes" body={proposal.risk?.notes} />
      <ListBlock title="Evidence refs" items={proposal.evidenceRefs} humanize />
    </div>
  );
}
