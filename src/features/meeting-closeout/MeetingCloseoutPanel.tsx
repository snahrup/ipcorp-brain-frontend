import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Database,
  FileQuestion,
  FileText,
  Link2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Sparkles,
  TicketCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GATEWAY } from "../../lib/gateway";
import "./meeting-closeout.css";

type Meeting = {
  id: string;
  title: string;
  start: string;
  end?: string;
  organizer?: string;
  attendees: string[];
  webUrl?: string;
};

type ReviewItem = {
  text?: string;
  title?: string;
  evidence?: string;
  status?: string;
  timing?: string | null;
  operation?: string;
  jiraKey?: string | null;
  label?: string;
  reference?: string;
  kind?: string;
  owner?: string | null;
  to?: string | null;
  subject?: string;
  body?: string;
};

type MeetingPackage = {
  id: string;
  meeting: Meeting;
  createdAt: string;
  source: string;
  summary: string;
  contextNotes?: string;
  commitments: ReviewItem[];
  jiraProposals: ReviewItem[];
  supportingMaterial: ReviewItem[];
  documentRequests: ReviewItem[];
  reminderCandidates: ReviewItem[];
  emailDrafts: ReviewItem[];
  infographic: {
    headline: string;
    subhead: string;
    metrics: Array<{ label: string; value: number }>;
    themes: string[];
    nextMoves: string[];
  };
  files?: Record<string, string>;
  externalActions: {
    emailSent: false;
    jiraChanged: false;
  };
};

type CalendarAvailability = "loading" | "current" | "fallback" | "empty" | "unavailable" | "error";

type TodayResponse = {
  meetings: Meeting[];
  source: string;
  availability: CalendarAvailability;
  detail?: string;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  package?: MeetingPackage;
  code?: string;
  error?: string;
};

type MeetingCloseoutPanelProps = {
  preparedMeetings?: unknown[];
};

const localDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAttendees(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item : text((item as Record<string, unknown>)?.name)
      )
      .filter(Boolean);
  }
  return text(value)
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePreparedMeetings(values: unknown[]) {
  const today = localDay();
  return values
    .map((value, index): Meeting | null => {
      if (!value || typeof value !== "object") return null;
      const raw = value as Record<string, unknown>;
      const title = text(raw.title ?? raw.subject);
      const start = text(raw.start ?? raw.startDate ?? raw.startsAt ?? raw.date ?? raw.datetime);
      if (!title || !start) return null;
      if (!start.startsWith(today)) return null;
      return {
        id: text(raw.id) || `prepared-${today}-${index}`,
        title,
        start,
        end: text(raw.end ?? raw.endDate ?? raw.endsAt) || undefined,
        organizer: text(raw.organizer) || undefined,
        attendees: normalizeAttendees(raw.attendees),
        webUrl: text(raw.webUrl ?? raw.joinUrl) || undefined,
      };
    })
    .filter((meeting): meeting is Meeting => meeting !== null);
}

function sourceLabel(source: string) {
  if (source === "loading") return "Calendar";
  if (source === "microsoft_365") return "Microsoft 365";
  if (source === "brain_snapshot") return "Brain snapshot";
  if (source === "previous_calendar_result") return "Last calendar result";
  return source;
}

function meetingCountLabel(count: number) {
  return `${count} meeting${count === 1 ? "" : "s"}`;
}

function calendarStatus(value: TodayResponse) {
  const count = value.meetings.length;
  if (value.availability === "loading") return "Loading today's calendar…";
  if (value.availability === "empty") return "No meetings today.";
  if (value.availability === "fallback") {
    return `No current Outlook meetings. ${meetingCountLabel(count)} ${count === 1 ? "remains" : "remain"} available.`;
  }
  if (value.availability === "unavailable") {
    return count
      ? `Microsoft 365 is unavailable or not connected. ${meetingCountLabel(count)} ${count === 1 ? "remains" : "remain"} available.`
      : "Microsoft 365 is unavailable or not connected.";
  }
  if (value.availability === "error") {
    return count
      ? `Calendar query failed. ${meetingCountLabel(count)} ${count === 1 ? "remains" : "remain"} available.`
      : "Calendar query failed.";
  }
  return `${meetingCountLabel(count)} ready`;
}

function calendarWarning(value: TodayResponse) {
  if (value.availability !== "unavailable" && value.availability !== "error") return "";
  const detail =
    value.detail ||
    (value.availability === "unavailable"
      ? "Microsoft 365 is unavailable or not connected."
      : "The calendar query could not be completed.");
  return value.meetings.length ? `${detail} Listed meetings remain available to process.` : detail;
}

function meetingTime(meeting: Meeting) {
  const date = new Date(meeting.start);
  if (Number.isNaN(date.valueOf())) return meeting.start;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function itemLabel(item: ReviewItem) {
  return item.text || item.title || item.label || item.subject || "Review item";
}

function ReviewSection({
  icon,
  title,
  items,
  empty,
  renderMeta,
}: {
  icon: ReactNode;
  title: string;
  items: ReviewItem[];
  empty: string;
  renderMeta?: (item: ReviewItem) => ReactNode;
}) {
  return (
    <section className="mc-review-section">
      <header>
        <span className="mc-section-icon">{icon}</span>
        <h4>{title}</h4>
        <span className="mc-count">{items.length}</span>
      </header>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.evidence || item.reference || itemLabel(item)}>
              <span>{itemLabel(item)}</span>
              {renderMeta?.(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mc-empty-row">{empty}</p>
      )}
    </section>
  );
}

function MeetingInfographic({ value }: { value: MeetingPackage }) {
  return (
    <section className="mc-infographic" data-testid="meeting-infographic">
      <div className="mc-infographic-heading">
        <span>Meeting snapshot</span>
        <h3>{value.infographic.headline}</h3>
        <p>{value.summary}</p>
      </div>
      <div className="mc-metrics">
        {value.infographic.metrics.map((metric) => (
          <div key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
      {!!value.infographic.themes.length && (
        <div className="mc-themes">
          {value.infographic.themes.map((theme) => (
            <span key={theme}>{theme}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function PackageReview({ value }: { value: MeetingPackage }) {
  return (
    <article className="mc-package-review" data-testid="meeting-closeout-review">
      <header className="mc-package-heading">
        <div>
          <span className="mc-eyebrow">
            <CheckCircle2 size={14} /> Saved to the Brain
          </span>
          <h3>{value.meeting.title}</h3>
          <p>
            {value.source.toLowerCase().includes("cluely")
              ? "Cluely transcript"
              : "Teams meeting capture"}{" "}
            processed for review.
          </p>
        </div>
        <div className="mc-safe-actions">
          <span>No email sent</span>
          <span>No Jira changes</span>
        </div>
      </header>

      <MeetingInfographic value={value} />

      <div className="mc-review-grid">
        <ReviewSection
          icon={<CheckCircle2 size={16} />}
          title="My commitments"
          items={value.commitments}
          empty="No personal commitments were identified."
          renderMeta={(item) => <small>{item.status}</small>}
        />
        <ReviewSection
          icon={<TicketCheck size={16} />}
          title="Jira proposals"
          items={value.jiraProposals}
          empty="No Jira work was proposed."
          renderMeta={(item) => (
            <small>
              {[item.operation, item.jiraKey].filter(Boolean).join(" ") || "Proposal only"}
            </small>
          )}
        />
        <ReviewSection
          icon={<Link2 size={16} />}
          title="Supporting material"
          items={value.supportingMaterial}
          empty="No related material was identified."
          renderMeta={(item) => <small>{item.kind}</small>}
        />
        <ReviewSection
          icon={<FileQuestion size={16} />}
          title="Document requests"
          items={value.documentRequests}
          empty="No document requests were identified."
          renderMeta={(item) => <small>{item.status}</small>}
        />
        <ReviewSection
          icon={<Bell size={16} />}
          title="Reminder candidates"
          items={value.reminderCandidates}
          empty="No reminder candidates were identified."
          renderMeta={(item) => <small>{item.timing || item.status}</small>}
        />
        <ReviewSection
          icon={<Mail size={16} />}
          title="Draft email follow-ups"
          items={value.emailDrafts}
          empty="No email follow-ups were identified."
          renderMeta={(item) => <small>{item.status || "Draft only"}</small>}
        />
      </div>

      {!!value.emailDrafts.length && (
        <details className="mc-email-preview">
          <summary>Review draft email copy</summary>
          {value.emailDrafts.map((draft) => (
            <div key={`${draft.to || "recipient"}-${draft.subject}`}>
              <strong>{draft.subject}</strong>
              <span>{draft.to ? `To: ${draft.to}` : "Recipient not identified"}</span>
              <pre>{draft.body}</pre>
            </div>
          ))}
        </details>
      )}

      {value.files && Object.keys(value.files).length > 0 && (
        <div className="mc-stored-files">
          <Database size={16} />
          <span>{Object.keys(value.files).length} meeting package files stored</span>
        </div>
      )}
    </article>
  );
}

export function MeetingCloseoutPanel({ preparedMeetings = [] }: MeetingCloseoutPanelProps) {
  const preparedFallback = useMemo(
    () => normalizePreparedMeetings(preparedMeetings),
    [preparedMeetings]
  );
  const [today, setToday] = useState<TodayResponse>({
    meetings: [],
    source: "loading",
    availability: "loading",
  });
  const [packages, setPackages] = useState<MeetingPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<MeetingPackage | null>(null);
  const [fallbackMeeting, setFallbackMeeting] = useState<Meeting | null>(null);
  const [transcript, setTranscript] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading today's meetings…");
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const meetingsRef = useRef<Meeting[]>([]);

  const applyTodayResponse = useCallback(
    (next: TodayResponse) => {
      const failed = next.availability === "unavailable" || next.availability === "error";
      const retained = failed && !next.meetings.length ? meetingsRef.current : [];
      const meetings = next.meetings.length
        ? next.meetings
        : retained.length
          ? retained
          : failed
            ? preparedFallback
            : [];
      const resolved: TodayResponse = {
        ...next,
        meetings,
        source:
          failed && !next.meetings.length && retained.length
            ? "previous_calendar_result"
            : next.source,
      };
      meetingsRef.current = meetings;
      setToday(resolved);
      setStatus(calendarStatus(resolved));
      setLoadError(calendarWarning(resolved));
    },
    [preparedFallback]
  );

  const refreshCalendar = useCallback(
    async (initial = false, signal?: AbortSignal) => {
      if (initial) setStatus("Loading today's calendar…");
      else setRefreshing(true);
      try {
        const response = await fetch(`${GATEWAY}/meeting-closeout/today`, { signal });
        const body = (await response.json()) as ApiEnvelope<TodayResponse>;
        if (!response.ok || !body.ok || !body.data) {
          throw new Error(body.error || "The calendar query failed.");
        }
        applyTodayResponse(body.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        applyTodayResponse({
          meetings: [],
          source: meetingsRef.current.length ? "previous_calendar_result" : "brain_snapshot",
          availability: "error",
          detail: "The calendar query could not be completed.",
        });
      } finally {
        if (!initial) setRefreshing(false);
      }
    },
    [applyTodayResponse]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshCalendar(true, controller.signal);
    void fetch(`${GATEWAY}/meeting-closeout/packages`, { signal: controller.signal })
      .then((response) => response.json() as Promise<ApiEnvelope<MeetingPackage[]>>)
      .then((body) => {
        if (body.ok && Array.isArray(body.data)) setPackages(body.data);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setPackages([]);
      });
    return () => {
      controller.abort();
    };
  }, [refreshCalendar]);

  async function processMeeting(meeting: Meeting, pastedTranscript = "", notes = "") {
    setProcessingId(meeting.id);
    setStatus(
      pastedTranscript ? "Building the meeting package…" : "Looking for the Teams capture…"
    );
    try {
      const response = await fetch(`${GATEWAY}/meeting-closeout/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting,
          transcript: pastedTranscript || undefined,
          contextNotes: notes || undefined,
        }),
      });
      const body = (await response.json()) as ApiEnvelope<unknown>;
      if (body.code === "transcript_unavailable") {
        setFallbackMeeting(meeting);
        setStatus("No Teams capture was found. Paste the Cluely transcript below.");
        return;
      }
      if (!response.ok || !body.ok || !body.package) {
        throw new Error(body.error || "The meeting could not be processed.");
      }
      setSelectedPackage(body.package);
      setPackages((current) => [
        body.package as MeetingPackage,
        ...current.filter((item) => item.id !== body.package?.id),
      ]);
      setFallbackMeeting(null);
      setTranscript("");
      setContextNotes("");
      setStatus("Meeting package saved and ready for review.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The meeting could not be processed.");
    } finally {
      setProcessingId(null);
    }
  }

  const meetings = today.meetings;

  return (
    <section className="mc-shell" data-testid="meeting-closeout-panel">
      <header className="mc-shell-heading">
        <div>
          <span className="mc-eyebrow">
            <Sparkles size={14} /> Meeting Wrap-up
          </span>
          <h2>Select a meeting to process</h2>
          <p>
            Select Process. The Workbench identifies the meeting and looks for its Teams capture and
            related material.
          </p>
        </div>
        <div className="mc-source-actions">
          <div className="mc-source">
            <CalendarDays size={16} />
            <span>{sourceLabel(today.source)}</span>
          </div>
          <button
            className="mc-refresh-button"
            data-testid="refresh-meetings"
            disabled={refreshing}
            onClick={() => void refreshCalendar()}
            type="button"
          >
            <RefreshCw className={refreshing ? "mc-spin" : undefined} size={15} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="mc-status" aria-live="polite">
        {processingId ? (
          <LoaderCircle className="mc-spin" size={16} />
        ) : (
          <span className="mc-status-dot" />
        )}
        <span>{status}</span>
      </div>

      {loadError && (
        <p className="mc-notice" role="status">
          {loadError}
        </p>
      )}

      <div className="mc-meeting-list">
        {meetings.map((meeting) => (
          <article className="mc-meeting-card" data-testid="today-meeting-card" key={meeting.id}>
            <div className="mc-time-block">
              <strong>{meetingTime(meeting)}</strong>
              <span>Today</span>
            </div>
            <div className="mc-meeting-copy">
              <h3>{meeting.title}</h3>
              <p>
                {meeting.organizer ? `Organized by ${meeting.organizer}` : "Organizer not listed"}
                {meeting.attendees.length ? ` · ${meeting.attendees.length} attendees` : ""}
              </p>
            </div>
            <button
              className="mc-process-button"
              data-testid={`process-meeting-${meeting.id}`}
              disabled={processingId !== null}
              onClick={() => void processMeeting(meeting)}
              type="button"
            >
              {processingId === meeting.id ? (
                <LoaderCircle className="mc-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {processingId === meeting.id ? "Processing" : "Process"}
            </button>
          </article>
        ))}
        {!meetings.length && today.availability === "empty" && (
          <div className="mc-no-meetings">
            <CalendarDays size={28} />
            <div>
              <strong>No meetings today.</strong>
              <p>Outlook returned no meetings for today.</p>
            </div>
          </div>
        )}
        {!meetings.length && today.availability === "unavailable" && (
          <div className="mc-no-meetings">
            <CalendarDays size={28} />
            <div>
              <strong>Microsoft 365 is unavailable or not connected.</strong>
              <p>{today.detail}</p>
            </div>
          </div>
        )}
        {!meetings.length && today.availability === "error" && (
          <div className="mc-no-meetings">
            <CalendarDays size={28} />
            <div>
              <strong>Calendar query failed.</strong>
              <p>{today.detail}</p>
            </div>
          </div>
        )}
        {today.availability === "loading" && (
          <div className="mc-no-meetings">
            <LoaderCircle className="mc-spin" size={24} />
            <span>Loading today&apos;s calendar…</span>
          </div>
        )}
      </div>

      {fallbackMeeting && (
        <form
          className="mc-fallback"
          data-testid="transcript-fallback"
          onSubmit={(event) => {
            event.preventDefault();
            if (transcript.trim()) void processMeeting(fallbackMeeting, transcript, contextNotes);
          }}
        >
          <div className="mc-fallback-heading">
            <FileText size={20} />
            <div>
              <h3>Paste the Cluely transcript</h3>
              <p>
                No Teams capture is available for {fallbackMeeting.title}. Context notes are
                optional.
              </p>
            </div>
          </div>
          <label>
            Cluely transcript
            <textarea
              data-testid="cluely-transcript"
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Paste the full meeting transcript here"
              required
              rows={8}
              value={transcript}
            />
          </label>
          <label>
            Context notes <span>Optional</span>
            <textarea
              data-testid="context-notes"
              onChange={(event) => setContextNotes(event.target.value)}
              placeholder="Add decisions, links, names, or details that may not be clear in the transcript"
              rows={3}
              value={contextNotes}
            />
          </label>
          <div className="mc-fallback-actions">
            <button
              className="mc-secondary-button"
              onClick={() => {
                setFallbackMeeting(null);
                setTranscript("");
                setContextNotes("");
                setStatus("Transcript entry closed.");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="mc-process-button"
              data-testid="process-pasted-transcript"
              disabled={!transcript.trim() || processingId !== null}
              type="submit"
            >
              {processingId ? (
                <LoaderCircle className="mc-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              Build review package
            </button>
          </div>
        </form>
      )}

      {selectedPackage && <PackageReview value={selectedPackage} />}

      {!!packages.length && (
        <section className="mc-package-history">
          <header>
            <div>
              <span className="mc-eyebrow">
                <Database size={14} /> Brain packages
              </span>
              <h3>Saved meeting wrap-ups</h3>
            </div>
            <span>{packages.length}</span>
          </header>
          <div className="mc-package-list">
            {packages.slice(0, 8).map((item) => (
              <button key={item.id} onClick={() => setSelectedPackage(item)} type="button">
                <div>
                  <strong>{item.meeting.title}</strong>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <span>{item.source.toLowerCase().includes("cluely") ? "Cluely" : "Teams"}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
