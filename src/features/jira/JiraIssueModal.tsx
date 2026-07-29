import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  Link2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JiraGatewayError, jiraGateway } from "./api";
import { JiraDescriptionContent } from "./JiraDescriptionContent";
import type { JiraInitiative, JiraIssueDetail } from "./types";

type Draft = {
  summary: string;
  description: string;
  status: string;
  priority: string;
  assigneeAccountId: string;
  labels: string;
  dueDate: string;
  comment: string;
  worklogTime: string;
  worklogComment: string;
};

function makeDraft(detail: JiraIssueDetail): Draft {
  const issue = detail.issue;
  return {
    summary: issue.summary,
    description: issue.description,
    status: issue.status.name,
    priority: issue.priority.name,
    assigneeAccountId: issue.assignee?.accountId || "",
    labels: issue.labels.join(", "),
    dueDate: issue.dueDate || "",
    comment: "",
    worklogTime: "",
    worklogComment: "",
  };
}

export function JiraIssueModal({
  issueKey,
  initiative,
  onClose,
  onIssueUpdated,
}: {
  issueKey: string;
  initiative: JiraInitiative;
  onClose: () => void;
  onIssueUpdated: (issue: JiraIssueDetail["issue"]) => void;
}) {
  const [detail, setDetail] = useState<JiraIssueDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const savingRef = useRef(saving);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const loadIssue = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConflict(false);
    try {
      const next = await jiraGateway.issue(issueKey);
      setDetail(next);
      setDraft(makeDraft(next));
      setEditingDescription(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The Jira issue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [issueKey]);

  useEffect(() => {
    void loadIssue();
  }, [loadIssue]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => titleRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => !element.hasAttribute("hidden"));

      if (focusable.length === 0) {
        event.preventDefault();
        titleRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const availableStatuses = useMemo(() => {
    if (!detail) return [];
    const names = new Set([detail.issue.status.name, ...detail.transitions.map((item) => item.to)]);
    return [...names].filter(Boolean);
  }, [detail]);

  const isDone = draft?.status.toLowerCase() === "done";
  const isDirty = useMemo(() => {
    if (!detail || !draft) return false;
    const issue = detail.issue;
    return (
      draft.summary !== issue.summary ||
      draft.description !== issue.description ||
      draft.status !== issue.status.name ||
      draft.priority !== issue.priority.name ||
      draft.assigneeAccountId !== (issue.assignee?.accountId || "") ||
      draft.labels !== issue.labels.join(", ") ||
      draft.dueDate !== (issue.dueDate || "") ||
      Boolean(draft.comment.trim())
    );
  }, [detail, draft]);

  const canSave =
    Boolean(detail && draft && isDirty && draft.summary.trim()) &&
    (!isDone || Boolean(draft.worklogTime.trim() && draft.worklogComment.trim()));

  const save = async () => {
    if (!detail || !draft || !canSave) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    setSaveMessage(null);
    try {
      const issue = detail.issue;
      const fields: Record<string, unknown> = {
        summary: draft.summary.trim(),
        priority: draft.priority,
        assignee: draft.assigneeAccountId ? { accountId: draft.assigneeAccountId } : null,
        labels: draft.labels
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        duedate: draft.dueDate || null,
      };
      if (draft.description !== issue.description) fields.description = draft.description;
      const result = await jiraGateway.updateIssue(issue.key, {
        expectedUpdated: issue.updatedAt,
        fields,
        transitionTo: draft.status,
        comment: draft.comment.trim() || undefined,
        worklog: isDone
          ? {
              timeSpent: draft.worklogTime.trim(),
              comment: draft.worklogComment.trim(),
            }
          : undefined,
      });
      onIssueUpdated(result.issue);
      const refreshed = await jiraGateway.issue(issue.key);
      setDetail(refreshed);
      setDraft(makeDraft(refreshed));
      setEditingDescription(false);
      setSaveMessage(
        result.partial
          ? `Jira accepted part of the update. ${result.errors.join(" ")}`
          : `Verified in Jira: ${result.effects.join(", ")} updated.`
      );
    } catch (reason) {
      if (reason instanceof JiraGatewayError && reason.status === 409) {
        setConflict(true);
        setError(reason.message);
      } else {
        setError(reason instanceof Error ? reason.message : "Jira did not accept the update.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wb-modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="wb-jira-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jira-issue-title"
      >
        <header className="wb-jira-modal-header">
          <div>
            <span className="wb-jira-key">Live Jira issue · {issueKey}</span>
            <h2 id="jira-issue-title" ref={titleRef} tabIndex={-1}>
              {detail?.issue.summary || "Loading Jira issue"}
            </h2>
            <p>
              Every editable value maps directly to this MT issue. Save performs a Jira read-back.
            </p>
          </div>
          <div className="wb-modal-header-actions">
            <a
              href={`https://ip-corporation.atlassian.net/browse/${issueKey}`}
              target="_blank"
              rel="noreferrer"
              className="wb-secondary-button"
            >
              Open in Jira <ArrowUpRight size={15} />
            </a>
            <button
              type="button"
              className="wb-icon-button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close Jira issue"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="wb-modal-state">
            <LoaderCircle className="wb-spin" size={26} />
            <strong>Loading the live Jira issue…</strong>
            <span>No prepared values are substituted while Jira loads.</span>
          </div>
        ) : error && !detail ? (
          <div className="wb-modal-state wb-modal-state-error">
            <AlertCircle size={27} />
            <strong>Jira issue unavailable</strong>
            <span>{error}</span>
            <button type="button" className="wb-primary-button" onClick={() => void loadIssue()}>
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        ) : detail && draft ? (
          <>
            <div className="wb-jira-modal-body">
              {(error || saveMessage) && (
                <div
                  className={`wb-form-alert ${error ? "is-error" : "is-success"}`}
                  role={error ? "alert" : "status"}
                >
                  {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                  <div>
                    <strong>
                      {conflict
                        ? "Jira conflict"
                        : error
                          ? "Update not completed"
                          : "Jira verified"}
                    </strong>
                    <span>{error || saveMessage}</span>
                  </div>
                  {conflict && (
                    <button type="button" onClick={() => void loadIssue()}>
                      Reload Jira
                    </button>
                  )}
                </div>
              )}

              <div className="wb-jira-form-grid">
                <label className="wb-field wb-field-wide">
                  <span>Summary</span>
                  <input
                    value={draft.summary}
                    onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  />
                </label>

                <label className="wb-field">
                  <span>Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                  >
                    {availableStatuses.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wb-field">
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                  >
                    {initiative.priorities.map((priority) => (
                      <option key={priority.id} value={priority.name}>
                        {priority.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wb-field">
                  <span>Assignee</span>
                  <select
                    value={draft.assigneeAccountId}
                    onChange={(event) =>
                      setDraft({ ...draft, assigneeAccountId: event.target.value })
                    }
                  >
                    <option value="">Unassigned</option>
                    {initiative.assignees.map((person) => (
                      <option key={person.accountId} value={person.accountId}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wb-field">
                  <span>Due date</span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                  />
                </label>

                <label className="wb-field wb-field-wide">
                  <span>Labels</span>
                  <input
                    value={draft.labels}
                    onChange={(event) => setDraft({ ...draft, labels: event.target.value })}
                    placeholder="mdm, fabric, data-governance"
                  />
                  <small>Comma separated. Existing Jira labels are preserved until edited.</small>
                </label>
              </div>

              <section className="wb-jira-description-card">
                <header>
                  <div>
                    <h3>Description</h3>
                    <p>
                      Opens as formatted text. Choose edit when the Jira description needs a change.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="wb-secondary-button"
                    onClick={() => setEditingDescription((value) => !value)}
                  >
                    {editingDescription ? <Eye size={15} /> : <Edit3 size={15} />}
                    {editingDescription ? "Preview formatted" : "Edit description"}
                  </button>
                </header>
                {editingDescription ? (
                  <label className="wb-field wb-field-wide">
                    <span className="sr-only">Edit Jira description</span>
                    <textarea
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                      rows={11}
                    />
                    <small>Saved to Jira as rich text after the update is accepted.</small>
                  </label>
                ) : detail.issue.descriptionAdf || draft.description.trim() ? (
                  <div className="wb-jira-description-reading">
                    <JiraDescriptionContent
                      adf={detail.issue.descriptionAdf}
                      fallback={draft.description}
                    />
                  </div>
                ) : (
                  <div className="wb-jira-description-empty">
                    This Jira issue does not have a description yet.
                  </div>
                )}
              </section>

              <section className="wb-jira-readonly">
                <h3>Jira context</h3>
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{detail.issue.issueType}</dd>
                  </div>
                  <div>
                    <dt>Parent</dt>
                    <dd>{detail.issue.parentKey || "None"}</dd>
                  </div>
                  <div>
                    <dt>Start date</dt>
                    <dd>{detail.issue.startDate || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Original estimate</dt>
                    <dd>{detail.issue.timeTracking.originalEstimate || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{detail.issue.timeTracking.remainingEstimate || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Logged</dt>
                    <dd>{detail.issue.timeTracking.timeSpent || "None"}</dd>
                  </div>
                </dl>
              </section>

              {isDone && detail.issue.status.name.toLowerCase() !== "done" && (
                <section className="wb-done-check">
                  <div>
                    <Clock3 size={20} />
                    <div>
                      <strong>Done closeout requires Jira hygiene</strong>
                      <p>
                        A normalized-effort worklog, narrative comment, self-watcher, and 0h
                        remaining estimate are applied before the Done transition.
                      </p>
                    </div>
                  </div>
                  <div className="wb-done-grid">
                    <label className="wb-field">
                      <span>Normalized effort</span>
                      <input
                        value={draft.worklogTime}
                        onChange={(event) =>
                          setDraft({ ...draft, worklogTime: event.target.value })
                        }
                        placeholder="2h"
                      />
                      <small>Use the approved 3.5x Jira planning convention.</small>
                    </label>
                    <label className="wb-field">
                      <span>Worklog narrative</span>
                      <textarea
                        rows={3}
                        value={draft.worklogComment}
                        onChange={(event) =>
                          setDraft({ ...draft, worklogComment: event.target.value })
                        }
                        placeholder="Describe the work, decisions, and verification."
                      />
                    </label>
                  </div>
                </section>
              )}

              <label className="wb-field wb-field-wide wb-comment-field">
                <span>Jira comment</span>
                <textarea
                  rows={3}
                  value={draft.comment}
                  onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
                  placeholder="Add a conversational update in Steve’s Jira voice."
                />
                <small>
                  Comments are appended in ADF. Existing comments are never overwritten.
                </small>
              </label>

              <div className="wb-jira-relations">
                <section>
                  <h3>
                    <Link2 size={16} /> Dependencies and related items
                  </h3>
                  {detail.issue.links.length ? (
                    <ul>
                      {detail.issue.links.map((link) => (
                        <li key={link.id}>
                          <strong>{link.key}</strong>
                          <span>{link.type}</span>
                          <p>{link.summary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="wb-muted">No Jira issue links are recorded.</p>
                  )}
                </section>
                <section>
                  <h3>Subtasks</h3>
                  {detail.issue.subtasks.length ? (
                    <ul>
                      {detail.issue.subtasks.map((subtask) => (
                        <li key={subtask.key}>
                          <strong>{subtask.key}</strong>
                          <span>{subtask.status}</span>
                          <p>{subtask.summary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="wb-muted">No Jira subtasks are recorded.</p>
                  )}
                </section>
              </div>

              <section className="wb-jira-comments">
                <h3>
                  <MessageSquareText size={17} /> Recent Jira comments
                </h3>
                {detail.issue.comments.length ? (
                  detail.issue.comments
                    .slice()
                    .reverse()
                    .slice(0, 8)
                    .map((comment) => (
                      <article key={comment.id}>
                        <header>
                          <strong>{comment.author}</strong>
                          <time>{new Date(comment.createdAt).toLocaleString()}</time>
                        </header>
                        <p>{comment.body}</p>
                      </article>
                    ))
                ) : (
                  <p className="wb-muted">No Jira comments are available.</p>
                )}
              </section>
            </div>

            <footer className="wb-jira-modal-footer">
              <span>Last read from Jira: {new Date(detail.issue.updatedAt).toLocaleString()}</span>
              <div>
                <button
                  type="button"
                  className="wb-secondary-button"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="wb-primary-button"
                  onClick={() => void save()}
                  disabled={!canSave || saving}
                >
                  {saving ? <LoaderCircle className="wb-spin" size={16} /> : <Save size={16} />}
                  {saving ? "Saving and verifying…" : "Save to Jira"}
                </button>
              </div>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}
