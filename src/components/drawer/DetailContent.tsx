import type { Detail } from "../../types/brain";
import { AdrDetail } from "./AdrDetail";
import { InsightDetail } from "./InsightDetail";
import { MeetingDetail } from "./MeetingDetail";
import { PacketDetail } from "./PacketDetail";
import { ProposalDetail } from "./ProposalDetail";
import { QuestionDetail } from "./QuestionDetail";
import { RiskDetail } from "./RiskDetail";

interface DetailContentProps {
  detail: Detail;
}

export function DetailContent({ detail }: DetailContentProps) {
  switch (detail.kind) {
    case "packet":
      return <PacketDetail packet={detail.value} />;
    case "insight":
      return <InsightDetail insight={detail.value} />;
    case "proposal":
      return <ProposalDetail proposal={detail.value} />;
    case "question":
      return <QuestionDetail question={detail.value} />;
    case "risk":
      return <RiskDetail risk={detail.value} />;
    case "meeting":
      return <MeetingDetail meeting={detail.value} />;
    case "adr":
      return <AdrDetail adr={detail.value} label={detail.label} />;
    default:
      return null;
  }
}
