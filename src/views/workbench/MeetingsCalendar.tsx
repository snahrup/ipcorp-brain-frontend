import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingEntry } from "../../types/brain";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function meetingDay(meeting: MeetingEntry) {
  return meeting.day || (meeting.startsAt || meeting.date || "").slice(0, 10);
}

type Cell = { key: string; day: string | null; inMonth: boolean; meetings: MeetingEntry[] };

/**
 * Month grid over the meeting history. Each day shows how many records landed on it, so
 * the shape of the engagement is readable at a glance instead of only as a list.
 */
export function MeetingsCalendar({
  meetings,
  selectedDay,
  onSelectDay,
}: {
  meetings: MeetingEntry[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingEntry[]>();
    for (const meeting of meetings) {
      const day = meetingDay(meeting);
      if (!day) continue;
      const list = map.get(day);
      if (list) list.push(meeting);
      else map.set(day, [meeting]);
    }
    return map;
  }, [meetings]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const day of byDay.keys()) set.add(day.slice(0, 7));
    return [...set].sort();
  }, [byDay]);

  const [monthIndex, setMonthIndex] = useState(() => Math.max(0, months.length - 1));
  const month = months[Math.min(monthIndex, months.length - 1)];

  const cells = useMemo<Cell[]>(() => {
    if (!month) return [];
    const [year, mon] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, mon - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    // Monday-first offset
    const lead = (first.getUTCDay() + 6) % 7;

    const out: Cell[] = [];
    for (let i = 0; i < lead; i += 1) {
      out.push({ key: `lead-${i}`, day: null, inMonth: false, meetings: [] });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const day = `${month}-${String(d).padStart(2, "0")}`;
      out.push({ key: day, day, inMonth: true, meetings: byDay.get(day) ?? [] });
    }
    while (out.length % 7 !== 0) {
      out.push({ key: `tail-${out.length}`, day: null, inMonth: false, meetings: [] });
    }
    return out;
  }, [month, byDay]);

  if (!month) return null;

  const [year, mon] = month.split("-").map(Number);
  const monthTotal = cells.reduce((n, cell) => n + cell.meetings.length, 0);
  const busiest = cells.reduce((max, cell) => Math.max(max, cell.meetings.length), 0);

  return (
    <section className="wb-cal" aria-label="Meeting calendar">
      <header className="wb-cal-head">
        <div className="wb-cal-title">
          <strong>
            {MONTHS[mon - 1]} {year}
          </strong>
          <span>
            {monthTotal} {monthTotal === 1 ? "meeting" : "meetings"}
          </span>
        </div>
        <div className="wb-cal-nav">
          <button
            type="button"
            aria-label="Previous month"
            disabled={monthIndex <= 0}
            onClick={() => {
              setMonthIndex((i) => Math.max(0, i - 1));
              onSelectDay(null);
            }}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={monthIndex >= months.length - 1}
            onClick={() => {
              setMonthIndex((i) => Math.min(months.length - 1, i + 1));
              onSelectDay(null);
            }}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="wb-cal-grid">
        {WEEKDAYS.map((label) => (
          <span className="wb-cal-weekday" key={label} aria-hidden="true">
            {label}
          </span>
        ))}
        {cells.map((cell) => {
          if (!cell.day) return <span className="wb-cal-day wb-cal-day-empty" key={cell.key} />;
          const count = cell.meetings.length;
          const level =
            count === 0 ? 0 : busiest <= 1 ? 3 : Math.min(3, Math.ceil((count / busiest) * 3));
          const isSelected = selectedDay === cell.day;
          const dayNumber = Number(cell.day.slice(-2));
          return (
            <button
              type="button"
              key={cell.key}
              className="wb-cal-day"
              data-level={level}
              data-selected={isSelected ? "true" : undefined}
              disabled={count === 0}
              aria-label={`${dayNumber} ${MONTHS[mon - 1]}, ${count} ${
                count === 1 ? "meeting" : "meetings"
              }`}
              onClick={() => onSelectDay(isSelected ? null : cell.day)}
            >
              <span className="wb-cal-daynum">{dayNumber}</span>
              {count > 0 && <span className="wb-cal-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
