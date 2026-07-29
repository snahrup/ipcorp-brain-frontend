import { CalendarDays, Clock3, FileCheck2, Users } from "lucide-react";
import { packetById } from "../../data";
import { formatDate, getLinkedPacket } from "../../lib/utils";
import type { MeetingEntry } from "../../types/brain";
import { DrawerHeader, InfoBlock, StatusChip } from "../ui";

interface MeetingDetailProps {
  meeting: MeetingEntry;
}

function attendeeList(attendees?: string) {
  if (!attendees) return [];
  return attendees
    .split(/,| and /)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function MeetingDetail({ meeting }: MeetingDetailProps) {
  const linkedPacket = getLinkedPacket(meeting, packetById);
  const people = attendeeList(meeting.attendees);
  const when = meeting.day ?? meeting.startsAt ?? meeting.date;

  return (
    <div className="drawer-stack">
      <DrawerHeader icon={CalendarDays} eyebrow={formatDate(when)} title={meeting.title} />

      <div className="drawer-hero-strip">
        {meeting.duration && (
          <StatusChip label={meeting.duration} tone="blue" icon={<Clock3 size={13} />} />
        )}
        {people.length > 0 && (
          <StatusChip
            label={`${people.length} ${people.length === 1 ? "person" : "people"}`}
            tone="blue"
            icon={<Users size={13} />}
          />
        )}
        {linkedPacket && (
          <StatusChip label="Has prep notes" tone="green" icon={<FileCheck2 size={13} />} />
        )}
      </div>

      {meeting.summary && <InfoBlock title="What happened" body={meeting.summary} />}
      {meeting.whyNow && <InfoBlock title="Why it mattered" body={meeting.whyNow} />}

      {people.length > 0 && (
        <div className="meeting-detail-people">
          <span className="mono-kicker">Who was there</span>
          <div className="meeting-detail-people-list">
            {people.map((person) => (
              <span className="meeting-detail-person" key={person}>
                {person}
              </span>
            ))}
          </div>
        </div>
      )}

      {linkedPacket && (
        <div className="nested-card">
          <span className="mono-kicker">Prep notes</span>
          <h3>{linkedPacket.title}</h3>
          <p>{linkedPacket.summary}</p>
        </div>
      )}

      <div className="meeting-detail-graph">
        <button
          type="button"
          className="meeting-detail-action"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("focus-meeting-in-graph", {
                detail: {
                  meetingId: meeting.id,
                  alsoSelect: true,
                },
              })
            );
          }}
        >
          <span>See how this meeting connects</span>
        </button>
        <div className="meeting-detail-action-note">
          Shows the dataflows, decisions, systems, and insights this conversation actually touched
        </div>
      </div>
    </div>
  );
}
