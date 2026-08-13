import {
  CalendarDays,
  Clock3,
  FileCheck2,
  Image as ImageIcon,
  Maximize2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { packetById } from "../../data";
import { formatDate, getLinkedPacket } from "../../lib/utils";
import type { MeetingEntry } from "../../types/brain";
import { DrawerHeader, InfoBlock, StatusChip } from "../ui";
import "./meeting-infographic.css";
import { GATEWAY } from "../../lib/gateway";

const INFOGRAPHIC_URL = `${GATEWAY}/meetings/infographic`;

interface MeetingDetailProps {
  meeting: MeetingEntry;
}

/**
 * The one-page visual summary produced for this meeting. It is the artifact people
 * actually look at, so it sits in the record rather than in a separate folder nobody
 * opens. Click to view it full size.
 */
function MeetingInfographic({ meeting }: { meeting: MeetingEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const art = meeting.infographic;
  if (!art || failed) return null;

  const src = `${INFOGRAPHIC_URL}?id=${encodeURIComponent(art.id)}&file=${encodeURIComponent(
    art.file
  )}`;

  return (
    <div className="meeting-infographic">
      <span className="mono-kicker">
        <ImageIcon size={13} aria-hidden="true" /> Visual summary
      </span>
      <button
        type="button"
        className="meeting-infographic-frame"
        onClick={() => setExpanded(true)}
        aria-label="Open the visual summary full size"
      >
        <img src={src} alt={`Visual summary of ${meeting.title}`} onError={() => setFailed(true)} />
        <span className="meeting-infographic-zoom">
          <Maximize2 size={14} aria-hidden="true" />
          View full size
        </span>
      </button>

      {expanded && (
        <div
          className="meeting-infographic-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Visual summary of ${meeting.title}`}
          onClick={() => setExpanded(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setExpanded(false);
          }}
        >
          <button
            type="button"
            className="meeting-infographic-close"
            onClick={() => setExpanded(false)}
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
          <img src={src} alt={`Visual summary of ${meeting.title}`} />
        </div>
      )}
    </div>
  );
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

      <MeetingInfographic meeting={meeting} />

      {meeting.summary && <InfoBlock title="What happened" body={meeting.summary} />}
      {meeting.whyNow && <InfoBlock title="Why it mattered" body={meeting.whyNow} />}

      {(meeting.followUps?.length ?? 0) > 0 && (
        <div className="nested-card" data-testid="meeting-followups">
          <span className="mono-kicker">Promised out of this meeting</span>
          <ul className="meeting-followup-list">
            {meeting.followUps?.map((item) => (
              // Keyed by what the item says, not its position: the extractor
              // reorders as a package gains commitments, and an index key would
              // carry one row's state onto another.
              <li className="meeting-followup" key={`${item.kind}-${item.text}`}>
                <span className={`meeting-followup-kind meeting-followup-${item.kind}`}>
                  {item.kind === "commitment" && "Owed"}
                  {item.kind === "document-request" && "Doc requested"}
                  {item.kind === "reminder" && "Reminder"}
                  {item.kind === "jira-change" && "Jira change"}
                </span>
                <span className="meeting-followup-text">
                  {item.text}
                  {item.owner ? ` (for ${item.owner})` : ""}
                  {item.when ? ` by ${item.when}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
