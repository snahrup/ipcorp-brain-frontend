import { Clock3, Focus, Users } from "lucide-react";
import type { MeetingEntry } from "../../types/brain";
import { meetingDay } from "./MeetingsCalendar";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Steve Nahrup, Patrick Stiller" -> [{ name: "Steve Nahrup", code: "SN" }, ...] */
export function attendeeInitials(attendees?: string) {
  if (!attendees) return [];
  return attendees
    .split(/,| and /)
    .map((name) => name.replace(/\(.*?\)/g, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((name) => {
      const parts = name.split(/\s+/).filter(Boolean);
      const code =
        parts.length === 0
          ? ""
          : parts.length === 1
            ? parts[0].slice(0, 2).toUpperCase()
            : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      return { name, code };
    })
    .filter((person) => person.code);
}

function attendeeCount(attendees?: string) {
  if (!attendees) return 0;
  return attendees.split(/,| and /).filter((p) => p.trim()).length;
}

export function MeetingCard({
  meeting,
  onOpen,
  onFocusInGraph,
}: {
  meeting: MeetingEntry;
  onOpen: () => void;
  onFocusInGraph?: () => void;
}) {
  const day = meetingDay(meeting);
  const dayNumber = day ? day.slice(-2) : "--";
  const monthLabel = day ? MONTHS_SHORT[Number(day.slice(5, 7)) - 1] : "";
  const year = day ? day.slice(0, 4) : "";
  const initials = attendeeInitials(meeting.attendees);
  const total = attendeeCount(meeting.attendees);

  return (
    <article className="wb-meeting-card">
      <button type="button" className="wb-meeting-card-main" onClick={onOpen}>
        <span className="wb-meeting-date" aria-hidden="true">
          <span className="wb-meeting-date-month">{monthLabel}</span>
          <span className="wb-meeting-date-day">{dayNumber}</span>
          <span className="wb-meeting-date-year">{year}</span>
        </span>
        <span className="wb-meeting-card-body">
          <strong className="wb-meeting-card-title">{meeting.title}</strong>
          {meeting.summary && <span className="wb-meeting-card-summary">{meeting.summary}</span>}
          <span className="wb-meeting-card-meta">
            {meeting.duration && (
              <span className="wb-meeting-chip">
                <Clock3 size={13} aria-hidden="true" />
                {meeting.duration}
              </span>
            )}
            {total > 0 && (
              <span className="wb-meeting-chip">
                <Users size={13} aria-hidden="true" />
                {total}
              </span>
            )}
          </span>
        </span>
        {initials.length > 0 && (
          <span className="wb-meeting-avatars" role="img" aria-label={meeting.attendees}>
            {initials.map((person, index) => (
              <span className="wb-meeting-avatar" data-index={index} key={person.name}>
                {person.code}
              </span>
            ))}
            {total > initials.length && (
              <span className="wb-meeting-avatar wb-meeting-avatar-more">
                +{total - initials.length}
              </span>
            )}
          </span>
        )}
      </button>
      {onFocusInGraph && meeting.id && (
        <button type="button" className="wb-meeting-card-focus" onClick={onFocusInGraph}>
          <Focus size={13} aria-hidden="true" />
          Focus in graph
        </button>
      )}
    </article>
  );
}
