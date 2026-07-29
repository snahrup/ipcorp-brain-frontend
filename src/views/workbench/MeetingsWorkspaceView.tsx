import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { brain, formatDate } from "../../data";
import type { Detail, MeetingEntry } from "../../types/brain";
import "./meetings.css";
import { MeetingCard } from "./MeetingCard";
import { MeetingsCalendar, meetingDay } from "./MeetingsCalendar";
import { getMicrosoft365CoverageState, getSnapshotFreshness } from "./truthState";

const MICROSOFT_365_COVERAGE_URL = "http://127.0.0.1:8817/api/m365/reconcile-evidence";

type Microsoft365EvidenceItem = {
  source: string;
  date: string;
  title: string;
  summary: string;
  owner?: string | null;
  status: string;
  jiraKey?: string | null;
  sourceReference: string;
};

type Microsoft365Coverage = {
  available: boolean;
  cached: boolean;
  code?: string | null;
  detail: string;
  retryable: boolean;
  authRequired: boolean;
  asOf?: string | null;
  items: Microsoft365EvidenceItem[];
  limitations: string[];
};

type Microsoft365GatewayEnvelope = {
  ok: boolean;
  data?: Microsoft365Coverage;
  error?: string;
};

const MONTH_LABEL = [
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

function prettyDay(day: string) {
  if (!day) return "";
  const [year, month, date] = day.split("-");
  return `${MONTH_LABEL[Number(month) - 1]} ${Number(date)}, ${year}`;
}

export function MeetingsWorkspaceView({
  openDetail,
  onFocusInGraph,
}: {
  openDetail: (detail: Detail) => void;
  onFocusInGraph: (meetingId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [visible, setVisible] = useState(18);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [coverage, setCoverage] = useState<Microsoft365Coverage | null>(null);
  const meetingFreshness = getSnapshotFreshness(brain.meetingIndex.updatedAt);

  const archive = useMemo<MeetingEntry[]>(() => {
    const source =
      brain.meetingIndex.meetings && brain.meetingIndex.meetings.length > 0
        ? brain.meetingIndex.meetings
        : [
            ...brain.meetingIndex.upcoming,
            ...brain.meetingIndex.active,
            ...brain.meetingIndex.recent,
          ];
    return [...source].sort((a, b) => meetingDay(b).localeCompare(meetingDay(a)));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archive.filter((meeting) => {
      if (selectedDay && meetingDay(meeting) !== selectedDay) return false;
      if (!q) return true;
      return [meeting.title, meeting.summary, meeting.attendees, meeting.whyNow]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [archive, query, selectedDay]);

  const stats = useMemo(() => {
    const days = archive.map(meetingDay).filter(Boolean).sort();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const last30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    return {
      total: archive.length,
      thisMonth: days.filter((d) => d.startsWith(thisMonth)).length,
      last30: days.filter((d) => d >= last30).length,
      newest: days[days.length - 1] ?? "",
      span: days.length ? `${prettyDay(days[0])} to ${prettyDay(days[days.length - 1])}` : "",
    };
  }, [archive]);

  const coverageState = coverage ? getMicrosoft365CoverageState(coverage) : null;

  const checkCurrentCoverage = async (force: boolean) => {
    setCheckingCoverage(true);
    try {
      const response = await fetch(`${MICROSOFT_365_COVERAGE_URL}${force ? "?force=true" : ""}`, {
        headers: { Accept: "application/json" },
      });
      const envelope = (await response.json()) as Microsoft365GatewayEnvelope;
      if (!response.ok || !envelope.ok || !envelope.data) {
        throw new Error(envelope.error || "Microsoft 365 coverage could not be checked.");
      }
      setCoverage(envelope.data);
    } catch {
      setCoverage({
        available: false,
        cached: false,
        code: "gateway_unavailable",
        detail:
          "The local Workbench connection could not be reached. The meeting history below is unaffected.",
        retryable: true,
        authRequired: false,
        items: [],
        limitations: [],
      });
    } finally {
      setCheckingCoverage(false);
    }
  };

  return (
    <div className="wb-page wb-meetings-page" data-testid="meetings-workspace">
      <section className="wb-meetings-hero">
        <div className="wb-meetings-hero-copy">
          <span className="wb-kicker">Meetings</span>
          <h1>Walk in knowing what changed.</h1>
        </div>
        <div className="wb-meetings-stats">
          <div className="wb-stat">
            <strong>{stats.total}</strong>
            <span>Captured</span>
          </div>
          <div className="wb-stat">
            <strong>{stats.thisMonth}</strong>
            <span>This month</span>
          </div>
          <div className="wb-stat">
            <strong>{stats.last30}</strong>
            <span>Last 30 days</span>
          </div>
          <div className="wb-stat wb-stat-wide">
            <strong>{stats.newest ? prettyDay(stats.newest) : "None"}</strong>
            <span>Most recent</span>
          </div>
        </div>
      </section>

      <div className="wb-meetings-layout">
        <div className="wb-meetings-side">
          <MeetingsCalendar
            meetings={archive}
            selectedDay={selectedDay}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setVisible(18);
            }}
          />

          <details className="wb-meetings-coverage">
            <summary>
              <ShieldCheck size={15} aria-hidden="true" />
              <span>Where this comes from</span>
            </summary>
            <p>
              These records are the prepared records, spanning {stats.span || "no dates"}. They are
              not a live Outlook or Teams sync.
              {meetingFreshness.state === "stale"
                ? ` The index was last rebuilt ${meetingFreshness.ageDays} days ago.`
                : ""}
            </p>
            {checkingCoverage ? (
              <span className="wb-coverage-line">
                <LoaderCircle className="wb-spin" size={15} aria-hidden="true" />
                Checking current coverage
              </span>
            ) : coverageState === "available-partial" ? (
              <span className="wb-coverage-line">
                <CheckCircle2 size={15} aria-hidden="true" />
                {coverage?.items.length} current items read
                {coverage?.asOf ? ` as of ${formatDate(coverage.asOf)}` : ""}
              </span>
            ) : coverage ? (
              <span className="wb-coverage-line wb-coverage-line-warn">
                <AlertCircle size={15} aria-hidden="true" />
                {coverage.detail}
              </span>
            ) : null}
            <button
              className="wb-secondary-button"
              type="button"
              disabled={checkingCoverage}
              onClick={() => void checkCurrentCoverage(Boolean(coverage))}
            >
              <RefreshCw size={15} />
              {coverage ? "Check again" : "Check current coverage"}
            </button>
          </details>
        </div>

        <div className="wb-meetings-main">
          <div className="wb-meetings-toolbar">
            <label className="wb-jira-search">
              <Search size={16} aria-hidden="true" />
              <span className="wb-sr-only">Search meetings</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisible(18);
                }}
                placeholder="Search meetings, people, or topics"
              />
            </label>
            {selectedDay && (
              <button type="button" className="wb-filter-pill" onClick={() => setSelectedDay(null)}>
                <CalendarDays size={14} aria-hidden="true" />
                {prettyDay(selectedDay)}
                <X size={13} aria-hidden="true" />
              </button>
            )}
            <span className="wb-meetings-count">
              {filtered.length} {filtered.length === 1 ? "meeting" : "meetings"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <section className="wb-safe-empty">
              <Users size={24} aria-hidden="true" />
              <div>
                <strong>Nothing matches this view</strong>
                <p>Clear the search or pick a different day on the calendar.</p>
              </div>
            </section>
          ) : (
            <>
              <div className="wb-meeting-grid">
                {filtered.slice(0, visible).map((meeting) => (
                  <MeetingCard
                    key={meeting.id || `${meetingDay(meeting)}-${meeting.title}`}
                    meeting={meeting}
                    onOpen={() => openDetail({ kind: "meeting", value: meeting })}
                    onFocusInGraph={
                      meeting.id ? () => onFocusInGraph(meeting.id as string) : undefined
                    }
                  />
                ))}
              </div>
              {filtered.length > visible && (
                <button
                  type="button"
                  className="wb-secondary-button wb-meetings-more"
                  onClick={() => setVisible((n) => n + 24)}
                >
                  <Clock3 size={15} />
                  Show {Math.min(24, filtered.length - visible)} more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
