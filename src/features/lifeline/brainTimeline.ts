/**
 * Turns the sanitized Brain seed into a day-by-day chronology for the timeline.
 *
 * Every entry traces to one exported record. Nothing is synthesized, nothing is
 * interpolated, and a day with no record simply has no marker — the rail's own
 * geometry is what shows a quiet stretch, not a placeholder. Five lanes, one per
 * seed collection:
 *
 *   meeting   → meetingIndex.{upcoming,active,recent} + meetingIndex.meetings
 *   decision  → adrs.adrs                              dated by `date`
 *   candidate → adrs.candidates                        dated by `dateFlagged`
 *   insight   → cortexInsights                         dated by `createdAt`
 *   risk      → risks                                  dated by `lastReviewed`
 *
 * Records whose own date field is missing or unparseable are counted as undated
 * and reported, never silently dropped and never guessed onto a day.
 */

import { brain } from "../../data";
import type { Detail, MeetingEntry } from "../../types/brain";
import type { LifelineEvent, LifelineLane, LifelineMarker, LifelinePerson } from "./types";

const MS_PER_DAY = 86_400_000;

export interface BrainTimeline {
  markers: LifelineMarker[];
  baseline: number;
  /** Per-lane totals actually placed on the rail. */
  laneCounts: Record<LifelineLane, number>;
  /** Records skipped because their own date field was missing or unparseable. */
  undated: Record<LifelineLane, number>;
  firstDay?: string;
  lastDay?: string;
  dayCount: number;
}

/**
 * A bare YYYY-MM-DD parses as UTC midnight, which renders as the previous day in
 * any negative offset. A calendar date has no timezone, so build it in local
 * time. Mirrors the same guard in src/data.ts formatDate.
 */
function toLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const iso = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar-day key, local time. */
function dayKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function dayIndex(date: Date, origin: Date) {
  return Math.round((date.getTime() - origin.getTime()) / MS_PER_DAY);
}

/** ISO 8601 week number — the "W31" tag above each day. */
function isoWeek(date: Date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Thursday decides the week's year under ISO 8601.
  const day = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - day + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function clamp(value: string | undefined, length: number) {
  if (!value) return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}...` : flat;
}

/**
 * The seed carries attendees as one free-text string per meeting, e.g.
 * "Joe Wagner (CDW, sole CDW attendee), Patrick Stiller, Steve Nahrup". Split on
 * commas that are not inside parentheses, then drop the parenthetical so the
 * chip shows a name rather than a name plus a note. Anything that does not look
 * like a person's name is left out rather than rendered as a bogus attendee.
 */
function parseAttendees(raw: string | undefined): LifelinePerson[] {
  if (!raw) return [];

  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of raw) {
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  const people: LifelinePerson[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const name = part
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Two-to-four capitalized words. Excludes trailing notes like "and others"
    // or a bare org name that survived the parenthetical strip.
    if (!/^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*){1,3}$/.test(name)) continue;
    if (seen.has(name)) continue;

    seen.add(name);
    people.push({ name });
  }

  return people;
}

/** Every meeting the seed exports, de-duplicated by id then title+day. */
function allMeetings(): MeetingEntry[] {
  const index = brain.meetingIndex;
  const combined = [...(index.meetings ?? []), ...index.upcoming, ...index.active, ...index.recent];

  const seen = new Set<string>();
  const unique: MeetingEntry[] = [];

  for (const meeting of combined) {
    const key = meeting.id ?? `${meeting.title}::${meeting.day ?? meeting.date ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(meeting);
  }

  return unique;
}

interface DatedEvent {
  date: Date;
  lane: LifelineLane;
  event: LifelineEvent;
  people: LifelinePerson[];
}

export function buildBrainTimeline(): BrainTimeline {
  const laneCounts: Record<LifelineLane, number> = {
    meeting: 0,
    decision: 0,
    candidate: 0,
    insight: 0,
    risk: 0,
  };
  const undated: Record<LifelineLane, number> = {
    meeting: 0,
    decision: 0,
    candidate: 0,
    insight: 0,
    risk: 0,
  };

  const dated: DatedEvent[] = [];

  const push = (
    lane: LifelineLane,
    rawDate: string | null | undefined,
    event: LifelineEvent,
    people: LifelinePerson[] = []
  ) => {
    const date = toLocalDate(rawDate);
    if (!date) {
      undated[lane]++;
      return;
    }
    laneCounts[lane]++;
    dated.push({ date, lane, event, people });
  };

  for (const meeting of allMeetings()) {
    push(
      "meeting",
      meeting.day ?? meeting.date ?? meeting.startsAt,
      {
        text: meeting.title,
        lane: "meeting",
        note: clamp(meeting.summary, 190),
        detail: { kind: "meeting", value: meeting } satisfies Detail,
      },
      parseAttendees(meeting.attendees)
    );
  }

  for (const adr of brain.adrs.adrs) {
    // ADR numbers in the seed are zero-padded run ids; the readable reference is
    // the last four digits, matching the slug (ADR-0001).
    const reference = `ADR-${adr.number.slice(-4)}`;
    push("decision", adr.date, {
      text: adr.title,
      lane: "decision",
      note: clamp(`${reference} - ${adr.status} - decided by ${adr.decider}`, 120),
      detail: { kind: "adr", value: adr, label: reference } satisfies Detail,
    });
  }

  for (const candidate of brain.adrs.candidates) {
    push("candidate", candidate.dateFlagged, {
      text: candidate.topic,
      lane: "candidate",
      note: clamp(`Flagged from ${candidate.source} - ${candidate.status}`, 120),
      detail: {
        kind: "adr",
        value: candidate,
        label: "Decision candidate",
      } satisfies Detail,
    });
  }

  for (const insight of brain.cortexInsights) {
    push("insight", insight.createdAt, {
      text: insight.title,
      lane: "insight",
      note: clamp(insight.summary, 190),
      detail: { kind: "insight", value: insight } satisfies Detail,
    });
  }

  for (const risk of brain.risks) {
    push("risk", risk.lastReviewed, {
      text: risk.risk,
      lane: "risk",
      note: clamp(`${risk.severity} severity - ${risk.likelihood} likelihood - ${risk.owner}`, 120),
      detail: { kind: "risk", value: risk } satisfies Detail,
    });
  }

  if (dated.length === 0) {
    return {
      markers: [],
      baseline: 0,
      laneCounts,
      undated,
      dayCount: 0,
    };
  }

  dated.sort((a, b) => a.date.getTime() - b.date.getTime());

  const origin = dated[0].date;

  const byDay = new Map<string, { date: Date; entries: DatedEvent[] }>();
  for (const entry of dated) {
    const key = dayKey(entry.date);
    const bucket = byDay.get(key);
    if (bucket) bucket.entries.push(entry);
    else byDay.set(key, { date: entry.date, entries: [entry] });
  }

  // Meetings first, then decisions, candidates, insights, risks: within a day
  // the meeting is usually what produced the rest.
  const laneRank: Record<LifelineLane, number> = {
    meeting: 0,
    decision: 1,
    candidate: 2,
    insight: 3,
    risk: 4,
  };

  const markers: LifelineMarker[] = [...byDay.entries()]
    .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
    .map(([key, { date, entries }]) => {
      entries.sort((a, b) => laneRank[a.lane] - laneRank[b.lane]);

      const people: LifelinePerson[] = [];
      const seen = new Set<string>();
      for (const entry of entries) {
        for (const person of entry.people) {
          if (seen.has(person.name)) continue;
          seen.add(person.name);
          people.push(person);
        }
      }

      return {
        id: key,
        unit: dayIndex(date, origin),
        tag: `W${isoWeek(date)}`,
        label: `${DAY_LABEL.format(date)}`,
        events: entries.map((entry) => entry.event),
        people,
      } satisfies LifelineMarker;
    });

  const last = dated[dated.length - 1].date;

  return {
    markers,
    baseline: 0,
    laneCounts,
    undated,
    firstDay: `${WEEKDAY.format(origin)}, ${DAY_LABEL.format(origin)} ${origin.getFullYear()}`,
    lastDay: `${WEEKDAY.format(last)}, ${DAY_LABEL.format(last)} ${last.getFullYear()}`,
    dayCount: markers.length,
  };
}

/** Drops events whose lane is switched off, then any day left with nothing. */
export function filterTimelineByLanes(
  markers: LifelineMarker[],
  active: ReadonlySet<LifelineLane>
): LifelineMarker[] {
  const kept: LifelineMarker[] = [];

  for (const marker of markers) {
    const events = marker.events.filter((event) => {
      const lane =
        typeof event === "object" && !Array.isArray(event) && "lane" in event
          ? event.lane
          : undefined;
      return lane ? active.has(lane) : true;
    });

    if (events.length === 0) continue;

    // Attendees belong to meetings, so they go when that lane does.
    const people = active.has("meeting") ? marker.people : [];

    kept.push({ ...marker, events, people });
  }

  return kept;
}
