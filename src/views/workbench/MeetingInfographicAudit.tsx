import { AlertCircle, CheckCircle2, ImageOff, ScanSearch } from "lucide-react";
import type { MeetingEntry } from "../../types/brain";

export type MeetingInfographicAuditSnapshot = {
  schemaVersion: number;
  checkedAt: string;
  source: {
    seedUpdatedAt: string | null;
    brain: {
      state: "available" | "unavailable";
      meetingSummaryCount: number;
      infographicPackageCount: number;
      unreadablePackageRecords: number;
    };
    displayProbe: {
      state: "available" | "partial" | "unavailable";
      attempted: number;
      displayed: number;
      unavailable: number;
    };
  };
  scope: {
    meetingCount: number;
    meetingIdsSha256: string;
  };
  totals: {
    audited: number;
    complete: number;
    needsAttention: number;
    unavailable: number;
  };
  categories: Record<MeetingInfographicAuditCategory, number>;
  findings: MeetingInfographicAuditFinding[];
  unavailableMeetings: Array<{
    meetingId: string;
    title: string;
    day: string;
    display: string;
    saved: string;
    association: string;
  }>;
};

type MeetingInfographicAuditCategory =
  | "missing-display-only"
  | "missing-saved-artifact-only"
  | "missing-association-only"
  | "fully-missing";

type MeetingInfographicAuditFinding = {
  meetingId: string;
  title: string;
  day: string;
  category: MeetingInfographicAuditCategory;
  display: string;
  saved: string;
  association: string;
  evidence: string;
  artifact: {
    kind: string;
    file: string;
    label: string | null;
  } | null;
};

const CATEGORY_COPY: Array<{
  id: MeetingInfographicAuditCategory;
  label: string;
  description: string;
}> = [
  {
    id: "missing-display-only",
    label: "Missing display only",
    description: "A saved file and meeting association exist, but Workbench does not show it.",
  },
  {
    id: "missing-saved-artifact-only",
    label: "Missing saved artifact only",
    description: "The meeting points to an infographic, but the saved file is absent.",
  },
  {
    id: "missing-association-only",
    label: "Missing association only",
    description: "A matching saved file exists, but this meeting record does not point to it.",
  },
  {
    id: "fully-missing",
    label: "Fully missing",
    description: "No matching saved file or meeting association was found.",
  },
];

function cleanText(value: string) {
  return value.replace(/[\u2013\u2014]/g, " - ");
}

function formatDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} ET`;
}

export function MeetingInfographicAudit({
  audit,
  meetings,
  currentSeedUpdatedAt,
  onOpenMeeting,
}: {
  audit: MeetingInfographicAuditSnapshot;
  meetings: MeetingEntry[];
  currentSeedUpdatedAt: string;
  onOpenMeeting: (meeting: MeetingEntry) => void;
}) {
  const meetingsById = new Map(
    meetings.filter((meeting) => meeting.id).map((meeting) => [meeting.id as string, meeting])
  );
  const matchesCurrentIndex =
    audit.source.seedUpdatedAt === currentSeedUpdatedAt &&
    audit.scope.meetingCount === meetings.length;
  const sourcesAvailable =
    audit.source.brain.state === "available" &&
    audit.source.displayProbe.state === "available" &&
    audit.totals.unavailable === 0;
  const reliable = matchesCurrentIndex && sourcesAvailable;
  const headline =
    audit.totals.needsAttention === 0
      ? "All reviewed meetings have infographic coverage"
      : audit.totals.needsAttention +
        " " +
        (audit.totals.needsAttention === 1 ? "meeting needs" : "meetings need") +
        " infographic attention";

  return (
    <details
      className="wb-infographic-audit"
      data-current={matchesCurrentIndex ? "true" : "false"}
      data-testid="meeting-infographic-audit"
    >
      <summary>
        <span className="wb-infographic-audit-icon" aria-hidden="true">
          <ScanSearch size={18} />
        </span>
        <span className="wb-infographic-audit-title">
          <span>Infographic coverage audit</span>
          <strong>{matchesCurrentIndex ? headline : "Audit snapshot needs a refresh"}</strong>
        </span>
        <span className="wb-infographic-audit-summary-count">{audit.totals.audited} reviewed</span>
      </summary>

      <div className="wb-infographic-audit-body" data-testid="meeting-infographic-audit-findings">
        <div className="wb-infographic-audit-intro">
          <div>
            <strong>Only meetings with missing coverage are listed below.</strong>
            <p>
              Checked {formatCheckedAt(audit.checkedAt)} against all {audit.scope.meetingCount}{" "}
              prepared meetings. {audit.source.displayProbe.displayed} of{" "}
              {audit.source.displayProbe.attempted} existing Workbench image links displayed.
            </p>
          </div>
          <span className={reliable ? "wb-audit-source-ok" : "wb-audit-source-warn"}>
            {reliable ? (
              <>
                <CheckCircle2 size={15} aria-hidden="true" />
                Current sources read
              </>
            ) : (
              <>
                <AlertCircle size={15} aria-hidden="true" />
                Review source status
              </>
            )}
          </span>
        </div>

        {!matchesCurrentIndex && (
          <div className="wb-infographic-audit-warning" role="status">
            <AlertCircle size={16} aria-hidden="true" />
            This snapshot does not match the current meeting index. Re-run the audit before using
            its counts.
          </div>
        )}

        {!sourcesAvailable && (
          <div className="wb-infographic-audit-warning" role="status">
            <AlertCircle size={16} aria-hidden="true" />
            One or more sources could not be read. Unreadable records were not labeled missing.
          </div>
        )}

        <div className="wb-infographic-audit-counts">
          {CATEGORY_COPY.map((category) => (
            <div key={category.id} data-category={category.id}>
              <strong>{audit.categories[category.id] ?? 0}</strong>
              <span>{category.label}</span>
            </div>
          ))}
        </div>

        {audit.totals.needsAttention === 0 ? (
          <div className="wb-infographic-audit-clear">
            <CheckCircle2 size={18} aria-hidden="true" />
            No missing infographic coverage was found.
          </div>
        ) : (
          <div className="wb-infographic-audit-groups">
            {CATEGORY_COPY.map((category) => {
              const findings = audit.findings.filter((finding) => finding.category === category.id);
              if (findings.length === 0) return null;
              return (
                <details
                  className="wb-infographic-audit-group"
                  data-category={category.id}
                  key={category.id}
                  open={category.id !== "fully-missing"}
                >
                  <summary>
                    <span>
                      <strong>{category.label}</strong>
                      <small>{category.description}</small>
                    </span>
                    <b>{findings.length}</b>
                  </summary>
                  <ul>
                    {findings.map((finding) => {
                      const meeting = meetingsById.get(finding.meetingId);
                      const title = cleanText(finding.title);
                      const content = (
                        <>
                          <span className="wb-infographic-audit-meeting-copy">
                            <strong>{title}</strong>
                            <small>{cleanText(finding.evidence)}</small>
                          </span>
                          <time dateTime={finding.day}>{formatDay(finding.day)}</time>
                        </>
                      );
                      return (
                        <li key={finding.meetingId}>
                          {meeting ? (
                            <button
                              type="button"
                              aria-label={`Open meeting: ${title}`}
                              onClick={() => onOpenMeeting(meeting)}
                            >
                              {content}
                            </button>
                          ) : (
                            <div>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
        )}

        {audit.totals.needsAttention > 0 && (
          <p className="wb-infographic-audit-footnote">
            <ImageOff size={14} aria-hidden="true" />
            This is review-only. It did not create, change, remove, or attach any infographic.
          </p>
        )}
      </div>
    </details>
  );
}
