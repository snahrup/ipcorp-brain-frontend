import { CalendarDays, FileCheck2 } from "lucide-react";
import { packetById } from "../../data";
import { formatDate, formatStatus, getLinkedPacket, toneForStatus } from "../../lib/utils";
import type { MeetingEntry } from "../../types/brain";
import { DrawerHeader, InfoBlock, ListBlock, StatusChip } from "../ui";

interface MeetingDetailProps {
  meeting: MeetingEntry;
}

export function MeetingDetail({ meeting }: MeetingDetailProps) {
  const linkedPacket = getLinkedPacket(meeting, packetById);

  return (
    <div className="drawer-stack">
      <DrawerHeader
        icon={CalendarDays}
        eyebrow={formatDate(meeting.startsAt ?? meeting.date)}
        title={meeting.title}
      />
      <div className="drawer-hero-strip">
        <StatusChip
          label={formatStatus(meeting.readinessStatus)}
          tone={toneForStatus(meeting.readinessStatus)}
        />
        {linkedPacket && (
          <StatusChip label="Linked packet" tone="green" icon={<FileCheck2 size={13} />} />
        )}
      </div>
      <InfoBlock title="Why now" body={meeting.whyNow} />
      <ListBlock title="Feeds packets" items={meeting.feedsPackets} monospace />
      <ListBlock title="Feeds insights" items={meeting.feedsInsights} monospace />
      {linkedPacket && (
        <div className="nested-card">
          <span className="mono-kicker">Linked packet</span>
          <h3>{linkedPacket.title}</h3>
          <p>{linkedPacket.summary}</p>
        </div>
      )}
      <ListBlock
        title="Evidence refs"
        items={[meeting.source, meeting.packet].filter(Boolean) as string[]}
        humanize
      />

      {/* Prominent action to jump into the central 3D graph with this meeting's real provenance */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("focus-meeting-in-graph", {
                detail: {
                  meetingId: meeting.id,
                  alsoSelect: true,
                },
              })
            );
            // The parent will usually close the drawer when navigating
          }}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--white)",
            color: "var(--on-white)",
            fontWeight: 600,
            border: "1px solid var(--white)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span>Focus this meeting’s real connections in the 3D graph</span>
        </button>
        <div style={{ fontSize: 10, opacity: 0.6, textAlign: "center", marginTop: 4 }}>
          Shows dataflows, ADRs, systems, books, and insights this conversation actually touched
        </div>
      </div>
    </div>
  );
}
