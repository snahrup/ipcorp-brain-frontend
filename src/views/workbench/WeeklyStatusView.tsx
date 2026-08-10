import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GATEWAY } from "../../lib/gateway";
import "./weekly-status.css";

type StatusRisk = { title: string; severity: "High" | "Medium" | "Low"; detail: string };

type StatusFields = {
  overallStatus: string;
  budget: string;
  schedule: string;
  scope: string;
  bottomLine: string;
  highlights: string[];
  needsFromBusiness: string[];
  risks: StatusRisk[];
};

type StatusDraft = {
  reportDate: string;
  period: { start: string; end: string };
  counts: { completed: number; inProgress: number; blocked: number; touched: number };
  evidence: { completed: string[]; inProgress: string[]; blocked: string[] };
  historyWeeks: number;
  fields: StatusFields;
  subject: string;
  html: string;
};

/**
 * Editable rows carry their own id. Keying these lists by array index makes React
 * reuse the wrong textarea when a bullet in the middle is deleted, which moves the
 * caret and the text the writer was in the middle of.
 */
type Row<T> = { id: string; value: T };

const toRows = <T,>(values: T[]): Row<T>[] =>
  values.map((value) => ({ id: crypto.randomUUID(), value }));

type EditableStatus = Omit<StatusFields, "highlights" | "needsFromBusiness" | "risks"> & {
  highlights: Row<string>[];
  needsFromBusiness: Row<string>[];
  risks: Row<StatusRisk>[];
};

const toEditable = (fields: StatusFields): EditableStatus => ({
  ...fields,
  highlights: toRows(fields.highlights),
  needsFromBusiness: toRows(fields.needsFromBusiness),
  risks: toRows(fields.risks),
});

const toWire = (editable: EditableStatus): StatusFields => ({
  ...editable,
  highlights: editable.highlights.map((row) => row.value),
  needsFromBusiness: editable.needsFromBusiness.map((row) => row.value),
  risks: editable.risks.map((row) => row.value),
});

const RECIPIENTS_KEY = "weekly-status-recipients";
const OVERALL_OPTIONS = ["On Track", "At Risk", "Off Track"];
const BUDGET_OPTIONS = ["On Budget", "Over Budget", "Under Budget"];
const SCHEDULE_OPTIONS = ["On Schedule", "Behind Schedule", "Ahead of Schedule"];
const SCOPE_OPTIONS = ["No Issues", "Scope Change", "Scope Risk"];
const SEVERITIES: StatusRisk["severity"][] = ["High", "Medium", "Low"];

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `The request failed with status ${response.status}.`);
  }
  return payload.data as T;
}

function todayIso() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function readStoredRecipients(): { to: string; cc: string } {
  try {
    const raw = window.localStorage.getItem(RECIPIENTS_KEY);
    if (!raw) return { to: "", cc: "" };
    const parsed = JSON.parse(raw);
    return { to: String(parsed.to || ""), cc: String(parsed.cc || "") };
  } catch {
    return { to: "", cc: "" };
  }
}

const splitAddresses = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));

export function WeeklyStatusView() {
  const [reportDate, setReportDate] = useState(todayIso);
  const [guidance, setGuidance] = useState("");
  const [draft, setDraft] = useState<StatusDraft | null>(null);
  const [fields, setFields] = useState<EditableStatus | null>(null);
  const [html, setHtml] = useState("");
  const [generating, setGenerating] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [recipients, setRecipients] = useState(readStoredRecipients);

  useEffect(() => {
    try {
      window.localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(recipients));
    } catch {
      // A blocked storage write only costs the remembered addresses.
    }
  }, [recipients]);

  // Every edit re-renders the same Outlook-safe HTML the draft will carry, so the
  // preview is the email rather than an approximation of it.
  const rerender = useCallback(async (nextFields: StatusFields, date: string) => {
    try {
      const rendered = await post<{ html: string }>("/weekly-status/render", {
        reportDate: date,
        fields: nextFields,
      });
      setHtml(rendered.html);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The preview could not be rebuilt.");
    }
  }, []);

  const patchFields = (patch: Partial<EditableStatus>) => {
    setFields((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      void rerender(toWire(next), reportDate);
      return next;
    });
    setResult("");
  };

  const generate = async () => {
    setGenerating(true);
    setError("");
    setResult("");
    try {
      const next = await post<StatusDraft>("/weekly-status/generate", { reportDate, guidance });
      setDraft(next);
      setFields(toEditable(next.fields));
      setHtml(next.html);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "This week's status update could not be written."
      );
    } finally {
      setGenerating(false);
    }
  };

  const sendToOutlook = async () => {
    if (!fields || !html) return;
    const to = splitAddresses(recipients.to);
    if (!to.length) {
      setError("Add at least one recipient email address before creating the draft.");
      return;
    }
    setDrafting(true);
    setError("");
    setResult("");
    try {
      const payload = await post<{ subject: string; to: string[]; detail: string }>(
        "/weekly-status/outlook-draft",
        {
          to,
          cc: splitAddresses(recipients.cc),
          subject: draft?.subject || "MDM / Data Governance Weekly Status",
          html,
          reportDate,
          fields: toWire(fields),
        }
      );
      setResult(
        `Draft created in Outlook for ${payload.to.join(", ")}. Nothing was sent. Open Outlook, read it once more, and send it yourself.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The Outlook draft was not created.");
    } finally {
      setDrafting(false);
    }
  };

  const evidenceTotal = useMemo(
    () => (draft ? draft.counts.completed + draft.counts.inProgress + draft.counts.blocked : 0),
    [draft]
  );

  return (
    <div className="wb-page wb-weekly-status" data-workbench-section="weekly-status-page">
      <header className="wb-ws-header">
        <div>
          <span className="wb-kicker">Weekly deliverable</span>
          <h1>Weekly status update</h1>
          <p>
            Pull the week's real Jira movement, read the draft, change anything you want, then
            create the Outlook draft. Sending stays in your hands.
          </p>
        </div>
        <div className="wb-ws-controls">
          <label>
            <span>Report date</span>
            <input
              type="date"
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="wb-button-primary"
            onClick={() => void generate()}
            disabled={generating}
          >
            {generating ? <LoaderCircle className="wb-spin" size={16} /> : <RefreshCw size={16} />}
            {generating ? "Writing this week's update" : "Generate this week's status update"}
          </button>
        </div>
      </header>

      <label className="wb-ws-guidance">
        <span>Anything this week's update has to lead with (optional)</span>
        <input
          type="text"
          value={guidance}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="For example: lead with the Purview upgrade block and the steward names"
        />
      </label>

      {error && (
        <div className="wb-ws-banner is-error" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="wb-ws-banner is-done" role="status">
          <CheckCircle2 size={17} />
          <span>{result}</span>
        </div>
      )}

      {!draft && !generating && (
        <div className="wb-ws-empty">
          <Mail size={26} />
          <strong>No update written yet</strong>
          <p>
            Generating reads the MT initiative for the seven days ending on the report date, checks
            the last few weeks so nothing repeats, and drafts the sections in your voice.
          </p>
        </div>
      )}

      {draft && fields && (
        <div className="wb-ws-body">
          <section className="wb-ws-editor" aria-label="Status update content">
            <div className="wb-ws-evidence">
              <strong>
                {draft.period.start} to {draft.period.end}
              </strong>
              <span>
                {draft.counts.completed} completed · {draft.counts.inProgress} in progress ·{" "}
                {draft.counts.blocked} blocked · {evidenceTotal} issues moved
                {draft.historyWeeks
                  ? ` · checked against ${draft.historyWeeks} earlier week${
                      draft.historyWeeks === 1 ? "" : "s"
                    }`
                  : " · no earlier weeks on record"}
              </span>
            </div>

            <div className="wb-ws-chips">
              <ChipSelect
                label="Overall"
                value={fields.overallStatus}
                options={OVERALL_OPTIONS}
                onChange={(value) => patchFields({ overallStatus: value })}
              />
              <ChipSelect
                label="Budget"
                value={fields.budget}
                options={BUDGET_OPTIONS}
                onChange={(value) => patchFields({ budget: value })}
              />
              <ChipSelect
                label="Schedule"
                value={fields.schedule}
                options={SCHEDULE_OPTIONS}
                onChange={(value) => patchFields({ schedule: value })}
              />
              <ChipSelect
                label="Scope"
                value={fields.scope}
                options={SCOPE_OPTIONS}
                onChange={(value) => patchFields({ scope: value })}
              />
            </div>

            <label className="wb-ws-field">
              <span>Bottom line</span>
              <textarea
                value={fields.bottomLine}
                rows={4}
                onChange={(event) => patchFields({ bottomLine: event.target.value })}
              />
            </label>

            <ListEditor
              label="Highlights"
              items={fields.highlights}
              onChange={(highlights) => patchFields({ highlights })}
            />
            <ListEditor
              label="What we need from the business"
              items={fields.needsFromBusiness}
              onChange={(needsFromBusiness) => patchFields({ needsFromBusiness })}
            />

            <div className="wb-ws-field">
              <span>Risks and issues</span>
              {fields.risks.map((row, index) => {
                const patchRisk = (patch: Partial<StatusRisk>) =>
                  patchFields({
                    risks: fields.risks.map((item) =>
                      item.id === row.id ? { ...item, value: { ...item.value, ...patch } } : item
                    ),
                  });
                return (
                  <div className="wb-ws-risk" key={row.id}>
                    <div>
                      <input
                        type="text"
                        value={row.value.title}
                        aria-label={`Risk ${index + 1} title`}
                        onChange={(event) => patchRisk({ title: event.target.value })}
                      />
                      <select
                        value={row.value.severity}
                        aria-label={`Risk ${index + 1} severity`}
                        onChange={(event) =>
                          patchRisk({ severity: event.target.value as StatusRisk["severity"] })
                        }
                      >
                        {SEVERITIES.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="wb-ws-remove"
                        aria-label={`Remove risk ${index + 1}`}
                        onClick={() =>
                          patchFields({
                            risks: fields.risks.filter((item) => item.id !== row.id),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      value={row.value.detail}
                      rows={2}
                      aria-label={`Risk ${index + 1} detail`}
                      onChange={(event) => patchRisk({ detail: event.target.value })}
                    />
                  </div>
                );
              })}
              <button
                type="button"
                className="wb-ws-add"
                onClick={() =>
                  patchFields({
                    risks: [
                      ...fields.risks,
                      {
                        id: crypto.randomUUID(),
                        value: { title: "", severity: "Medium", detail: "" },
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Add a risk
              </button>
            </div>

            <details className="wb-ws-source">
              <summary>What this was written from</summary>
              <ol>
                {[
                  ...draft.evidence.completed,
                  ...draft.evidence.inProgress,
                  ...draft.evidence.blocked,
                ].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </details>
          </section>

          <section
            className="wb-ws-preview"
            aria-label="Email preview"
            data-workbench-section="weekly-status-preview"
          >
            <header>
              <div>
                <span className="wb-kicker">Preview</span>
                <strong>{draft.subject}</strong>
              </div>
            </header>
            {/* The same HTML the draft carries, shown in an isolated document so the
                email's inline styles cannot leak into the Workbench. */}
            <iframe title="Weekly status email preview" srcDoc={html} />
            <div className="wb-ws-send">
              <label>
                <span>To</span>
                <input
                  type="text"
                  value={recipients.to}
                  placeholder="name@ip-corp.com"
                  onChange={(event) =>
                    setRecipients((current) => ({ ...current, to: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Cc</span>
                <input
                  type="text"
                  value={recipients.cc}
                  placeholder="optional"
                  onChange={(event) =>
                    setRecipients((current) => ({ ...current, cc: event.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className="wb-button-primary"
                onClick={() => void sendToOutlook()}
                disabled={drafting}
              >
                {drafting ? <LoaderCircle className="wb-spin" size={16} /> : <Mail size={16} />}
                {drafting ? "Creating the Outlook draft" : "Create the Outlook draft"}
              </button>
              <small>
                This only puts the email in your Outlook drafts. It is never sent from here.
              </small>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="wb-ws-chip">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {(options.includes(value) ? options : [value, ...options]).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: Row<string>[];
  onChange: (items: Row<string>[]) => void;
}) {
  return (
    <div className="wb-ws-field">
      <span>{label}</span>
      {items.map((row, index) => (
        <div className="wb-ws-list-row" key={row.id}>
          <textarea
            value={row.value}
            rows={2}
            aria-label={`${label} item ${index + 1}`}
            onChange={(event) =>
              onChange(
                items.map((item) =>
                  item.id === row.id ? { ...item, value: event.target.value } : item
                )
              )
            }
          />
          <button
            type="button"
            className="wb-ws-remove"
            aria-label={`Remove ${label} item ${index + 1}`}
            onClick={() => onChange(items.filter((item) => item.id !== row.id))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="wb-ws-add"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), value: "" }])}
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
