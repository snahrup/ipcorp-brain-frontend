import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Printer,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type DailyMeetingPrep,
  type DailyPrepArtifact,
  type DailyPrepPackage,
  fetchDailyMeetingPrep,
  prepFileUrl,
} from "../../features/meeting-prep/dailyMeetingPrep";
import "./daily-meeting-prep.css";

function easternToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readableDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function readableUpdate(value?: string) {
  if (!value) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: DailyPrepPackage["status"] }) {
  const label =
    status === "ready" ? "Prep ready" : status === "partial" ? "Needs attention" : "Missing";
  return (
    <span className={`daily-prep-status daily-prep-status--${status}`}>
      {status === "ready" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {label}
    </span>
  );
}

function findArtifact(item: DailyPrepPackage, role: string) {
  return item.artifacts.find((artifact) => artifact.role === role);
}

function ArtifactActions({
  date,
  item,
  artifact,
}: {
  date: string;
  item: DailyPrepPackage;
  artifact: DailyPrepArtifact;
}) {
  return (
    <div className="daily-prep-file-actions">
      <a
        href={prepFileUrl(date, item.id, artifact.name)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${artifact.role}`}
      >
        <ExternalLink size={15} /> Open
      </a>
      <a
        href={prepFileUrl(date, item.id, artifact.name, { download: true })}
        aria-label={`Download ${artifact.role}`}
      >
        <Download size={15} /> Download
      </a>
    </div>
  );
}

function PackageDetail({ date, item }: { date: string; item: DailyPrepPackage }) {
  const pdf = findArtifact(item, "Print-ready prep pack");
  const browserVersion = findArtifact(item, "Browser version");
  const printable = browserVersion || pdf;
  return (
    <article className="daily-prep-detail" data-testid="daily-prep-package-detail">
      <header className="daily-prep-detail-header">
        <div>
          <StatusBadge status={item.status} />
          <h2>{item.title}</h2>
          <div className="daily-prep-detail-meta">
            <span>
              <Clock3 size={15} /> {item.when || "Meeting time unavailable"}
            </span>
            <span>Updated {readableUpdate(item.updatedAt)}</span>
          </div>
        </div>
        <div className="daily-prep-primary-actions">
          {pdf ? (
            <a
              className="daily-prep-button daily-prep-button--primary"
              href={prepFileUrl(date, item.id, pdf.name)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} /> Open prep pack
            </a>
          ) : null}
          {printable ? (
            <a
              className="daily-prep-button"
              data-testid="daily-prep-print"
              href={prepFileUrl(date, item.id, printable.name, { print: true })}
              target="_blank"
              rel="noreferrer"
            >
              <Printer size={16} /> Print package
            </a>
          ) : null}
          {pdf ? (
            <a
              className="daily-prep-button"
              href={prepFileUrl(date, item.id, pdf.name, { download: true })}
            >
              <Download size={16} /> Download PDF
            </a>
          ) : null}
        </div>
      </header>

      {item.status !== "ready" ? (
        <div className="daily-prep-truth-note" role="status">
          <AlertTriangle size={17} />
          <span>
            {item.status === "missing"
              ? "This package folder is unavailable."
              : `Missing: ${item.missing.join(", ")}.`}
          </span>
        </div>
      ) : null}

      <dl className="daily-prep-facts">
        <div>
          <dt>Organizer</dt>
          <dd>{item.organizer || "Unavailable"}</dd>
        </div>
        <div>
          <dt>Invited</dt>
          <dd>{item.invited || "Unavailable"}</dd>
        </div>
        <div>
          <dt>Prepared</dt>
          <dd>{item.preparedAt || "Unavailable"}</dd>
        </div>
        <div className="daily-prep-facts-wide">
          <dt>Evidence state</dt>
          <dd>{item.evidenceState || "No evidence note was included in the package."}</dd>
        </div>
      </dl>

      {item.sections.length ? (
        <section className="daily-prep-context">
          <div className="daily-prep-section-heading">
            <h3>Preparation context</h3>
            <span>{item.sections.length} sections</span>
          </div>
          {item.sections.map((section) => (
            <details
              key={section.heading}
              open={/orientation|late addition/i.test(section.heading)}
            >
              <summary>{section.heading}</summary>
              <p>{section.content}</p>
            </details>
          ))}
        </section>
      ) : null}

      <section className="daily-prep-files">
        <div className="daily-prep-section-heading">
          <h3>Package files</h3>
          <span>{item.artifacts.length} available</span>
        </div>
        {item.artifacts.length ? (
          item.artifacts.map((artifact) => (
            <div className="daily-prep-file-row" key={artifact.name}>
              <FileText size={18} />
              <div className="daily-prep-file-copy">
                <strong>{artifact.role}</strong>
                <span>
                  {artifact.type} · {fileSize(artifact.size)} · {readableUpdate(artifact.updatedAt)}
                </span>
              </div>
              <ArtifactActions date={date} item={item} artifact={artifact} />
            </div>
          ))
        ) : (
          <p className="daily-prep-muted">No package files are available.</p>
        )}
      </section>
    </article>
  );
}

export function DailyMeetingPrepView() {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date") || easternToday();
  const [data, setData] = useState<DailyMeetingPrep | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(params.get("package") || "");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchDailyMeetingPrep(date, controller.signal)
      .then((next) => {
        setData(next);
        setSelectedId((current) => current || next.packages[0]?.id || "");
      })
      .catch((reason) => {
        if (reason.name !== "AbortError")
          setError(
            reason instanceof Error ? reason.message : "Daily meeting prep could not be loaded."
          );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [date]);

  const selected = useMemo(
    () => data?.packages.find((item) => item.id === selectedId) || data?.packages[0],
    [data, selectedId]
  );

  function selectPackage(id: string) {
    setSelectedId(id);
    const next = new URL(window.location.href);
    next.searchParams.set("package", id);
    window.history.replaceState({}, "", `${next.pathname}${next.search}${next.hash}`);
  }

  return (
    <div className="daily-prep-page" data-testid="daily-meeting-prep-page">
      <header className="daily-prep-page-header">
        <div>
          <div className="daily-prep-eyebrow">
            <CalendarDays size={16} /> Meetings / Daily prep
          </div>
          <h1>Meeting prep for {readableDate(date)}</h1>
          <p>Review the prepared packages for today before the first meeting begins.</p>
        </div>
        {data ? (
          <div className="daily-prep-source">
            <span>Source</span>
            <strong>{data.sourceLabel}</strong>
            <small>Reads prepared local files only</small>
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="daily-prep-state">
          <LoaderCircle className="daily-prep-spin" size={24} />
          <h2>Loading today&apos;s packages</h2>
        </div>
      ) : null}
      {!loading && error ? (
        <div className="daily-prep-state daily-prep-state--warning">
          <AlertTriangle size={24} />
          <h2>Daily prep could not be loaded</h2>
          <p>{error}</p>
        </div>
      ) : null}
      {!loading && data?.state === "unavailable" ? (
        <div className="daily-prep-state daily-prep-state--warning">
          <AlertTriangle size={24} />
          <h2>No prepared source is available for this date</h2>
          <p>{data.reason}</p>
        </div>
      ) : null}
      {!loading && data?.state === "empty" ? (
        <div className="daily-prep-state">
          <CalendarDays size={24} />
          <h2>No packages were generated for this date</h2>
          <p>
            {data.reason || "The dated prep folder is present but contains no meeting packages."}
          </p>
        </div>
      ) : null}

      {!loading && data && data.packages.length ? (
        <>
          <section className="daily-prep-summary" aria-label="Daily prep summary">
            <div>
              <strong>{data.summary.checked}</strong>
              <span>Events checked</span>
            </div>
            <div>
              <strong>{data.summary.built}</strong>
              <span>Packages built</span>
            </div>
            <div>
              <strong>{data.summary.skipped}</strong>
              <span>Skipped</span>
            </div>
            <div>
              <strong>{data.summary.blocked}</strong>
              <span>Blocked</span>
            </div>
            <p>Folder updated {readableUpdate(data.updatedAt)}</p>
          </section>

          {data.reason ? (
            <div className="daily-prep-truth-note" role="status">
              <AlertTriangle size={17} />
              <span>{data.reason}</span>
            </div>
          ) : null}

          <div className="daily-prep-layout">
            <aside className="daily-prep-list" aria-label="Today's prep packages">
              <div className="daily-prep-section-heading">
                <h2>Today&apos;s packages</h2>
                <span>{data.packages.length}</span>
              </div>
              {data.packages.map((item) => (
                <button
                  className={`daily-prep-card ${selected?.id === item.id ? "is-selected" : ""}`}
                  data-testid={`daily-prep-card-${item.id}`}
                  key={item.id}
                  onClick={() => selectPackage(item.id)}
                  type="button"
                  aria-pressed={selected?.id === item.id}
                >
                  <div className="daily-prep-card-top">
                    <StatusBadge status={item.status} />
                    <span>{readableUpdate(item.updatedAt)}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <span className="daily-prep-card-time">
                    <Clock3 size={14} /> {item.when || "Time unavailable"}
                  </span>
                  <small>{item.artifacts.length} files</small>
                </button>
              ))}
              {data.skipped.length ? (
                <section className="daily-prep-skipped">
                  <h3>Skipped meetings</h3>
                  {data.skipped.map((item) => (
                    <div key={`${item.title}-${item.reason}`}>
                      <strong>{item.title}</strong>
                      <span>{item.reason}</span>
                    </div>
                  ))}
                </section>
              ) : null}
            </aside>
            {selected ? <PackageDetail date={date} item={selected} /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
