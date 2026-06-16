import { FileCheck2 } from "lucide-react";
import { formatDate } from "../../lib/utils";
import type { PrepPacket } from "../../types/brain";
import { DrawerHeader, InfoBlock, ListBlock, MetaPill } from "../ui";

interface PacketDetailProps {
  packet: PrepPacket;
}

export function PacketDetail({ packet }: PacketDetailProps) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={FileCheck2} eyebrow="Prep packet" title={packet.title} />
      <div className="drawer-hero-strip">
        <MetaPill label="Meeting date" value={formatDate(packet.startsAt)} />
        <MetaPill label="Attendees" value={String(packet.attendees?.length ?? 0)} />
        <MetaPill label="Evidence" value={String(packet.evidenceRefs?.length ?? 0)} />
      </div>
      <p className="lead-copy">{packet.summary}</p>
      <InfoBlock title="Why it matters" body={packet.whyItMatters} />
      <ListBlock title="Current state" items={packet.currentState} />
      <ListBlock title="Open questions" items={packet.openQuestions} />
      <ListBlock title="Open commitments" items={packet.openCommitments} />
      <ListBlock title="Talking points" items={packet.talkingPoints} />
      <ListBlock title="Risks" items={packet.risks} />
      <InfoBlock title="Suggested posture" body={packet.suggestedPosture} />
      <ListBlock title="Evidence refs" items={packet.evidenceRefs} humanize />
    </div>
  );
}
