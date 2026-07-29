import {
  AlertCircle,
  CheckCircle2,
  Columns3,
  List,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jiraGateway } from "./api";
import { JiraIssueModal } from "./JiraIssueModal";
import { MdmReconciliationModal } from "./MdmReconciliationModal";
import type { JiraInitiative, JiraIssue, JiraStatus } from "./types";

function categoryLabel(status: JiraStatus) {
  if (status.category === "new") return "To do";
  if (status.category === "indeterminate") return "In progress";
  if (status.category === "done") return "Done";
  return status.name;
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Unknown";
  const days = Math.floor((Date.now() - time) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function JiraWorkSurface() {
  const [initiative, setInitiative] = useState<JiraInitiative | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "board">("list");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setInitiative(await jiraGateway.initiative());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The MDM Jira board could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleIssues = useMemo(() => {
    if (!initiative) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return initiative.issues.filter((issue) => {
      if (!showDone && issue.status.category === "done") return false;
      if (!normalizedQuery) return true;
      return [
        issue.key,
        issue.summary,
        issue.status.name,
        issue.assignee?.displayName,
        ...issue.labels,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [initiative, query, showDone]);

  const visibleStatuses = useMemo(() => {
    if (!initiative) return [];
    return initiative.statuses.filter((status) => showDone || status.category !== "done");
  }, [initiative, showDone]);

  const replaceIssue = (updated: JiraIssue) => {
    setInitiative((current) =>
      current
        ? {
            ...current,
            fetchedAt: new Date().toISOString(),
            issues: current.issues.map((issue) => (issue.key === updated.key ? updated : issue)),
          }
        : current
    );
  };

  if (loading) {
    return (
      <section className="wb-jira-state" aria-live="polite">
        <LoaderCircle className="wb-spin" size={28} />
        <h2>Loading the live MDM Jira board…</h2>
        <p>Cards stay empty until Jira returns real MT issues.</p>
      </section>
    );
  }

  if (error && !initiative) {
    return (
      <section className="wb-jira-state wb-jira-state-error" role="alert">
        <AlertCircle size={30} />
        <h2>Jira is unavailable</h2>
        <p>{error}</p>
        <div className="wb-jira-state-actions">
          <button type="button" className="wb-primary-button" onClick={() => void load()}>
            <RefreshCw size={16} /> Try again
          </button>
          <span>Nothing is substituted for missing Jira issues.</span>
        </div>
      </section>
    );
  }

  if (!initiative) return null;

  return (
    <div className="wb-jira-surface">
      <div className="wb-jira-truthbar">
        <div>
          <CheckCircle2 size={18} />
          <div>
            <strong>Live Jira · MT initiative</strong>
            <span>
              {initiative.issues.length} issues · read{" "}
              {new Date(initiative.fetchedAt).toLocaleString()}
            </span>
          </div>
        </div>
        {error && (
          <span className="wb-refresh-error">{error} Showing the last successful read.</span>
        )}
      </div>

      <div className="wb-jira-toolbar">
        <fieldset className="wb-segmented">
          <legend className="wb-sr-only">Jira layout</legend>
          <button
            type="button"
            aria-pressed={mode === "list"}
            className={mode === "list" ? "is-active" : ""}
            onClick={() => setMode("list")}
          >
            <List size={17} /> List
          </button>
          <button
            type="button"
            aria-pressed={mode === "board"}
            className={mode === "board" ? "is-active" : ""}
            onClick={() => setMode("board")}
          >
            <Columns3 size={17} /> Board
          </button>
        </fieldset>

        <label className="wb-jira-search">
          <Search size={16} aria-hidden="true" />
          <span className="wb-sr-only">Filter Jira issues</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter MT issues"
          />
        </label>

        <label className="wb-compact-check">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(event) => setShowDone(event.target.checked)}
          />
          Show Done
        </label>

        <div className="wb-jira-toolbar-actions">
          <button
            type="button"
            className="wb-secondary-button"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "wb-spin" : ""} size={16} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="wb-primary-button"
            onClick={() => setShowReconciliation(true)}
          >
            <ShieldCheck size={16} /> Reconcile MDM
          </button>
        </div>
      </div>

      <div className="wb-jira-count">
        <strong>{visibleIssues.length}</strong>
        <span>{showDone ? "matching MT issues" : "active MT issues"}</span>
      </div>

      {visibleIssues.length === 0 ? (
        <section className="wb-safe-empty">
          <Search size={24} />
          <div>
            <strong>No live Jira issues match this view</strong>
            <p>Clear the filter or include Done issues. No placeholder cards are shown.</p>
          </div>
        </section>
      ) : mode === "list" ? (
        <section className="wb-jira-list" aria-label="Live MDM Jira issue list">
          <div className="wb-jira-list-head">
            <span>Issue</span>
            <span>Status</span>
            <span>Assignee</span>
            <span>Priority</span>
            <span>Updated</span>
          </div>
          {visibleIssues.map((issue) => (
            <button
              type="button"
              className="wb-jira-list-row"
              key={issue.key}
              onClick={() => setSelectedIssueKey(issue.key)}
            >
              <span className="wb-jira-list-summary">
                <strong>{issue.key}</strong>
                <span>{issue.summary}</span>
                {issue.labels.length > 0 && <small>{issue.labels.slice(0, 3).join(" · ")}</small>}
              </span>
              <span className="wb-status wb-status-neutral">{issue.status.name}</span>
              <span>{issue.assignee?.displayName || "Unassigned"}</span>
              <span>{issue.priority.name}</span>
              <time>{relativeTime(issue.updatedAt)}</time>
            </button>
          ))}
        </section>
      ) : (
        <section
          className="wb-jira-board"
          aria-label="Live MDM Jira board"
          style={{ "--jira-columns": Math.max(visibleStatuses.length, 1) } as React.CSSProperties}
        >
          {visibleStatuses.map((status) => {
            const issues = visibleIssues.filter((issue) => issue.status.id === status.id);
            return (
              <section className="wb-jira-lane" key={status.id} data-category={status.category}>
                <header>
                  <div>
                    <span>{categoryLabel(status)}</span>
                    <h2>{status.name}</h2>
                  </div>
                  <strong>{issues.length}</strong>
                </header>
                <div>
                  {issues.length ? (
                    issues.map((issue) => (
                      <button
                        type="button"
                        className="wb-jira-card"
                        key={issue.key}
                        onClick={() => setSelectedIssueKey(issue.key)}
                      >
                        <span className="wb-jira-key">{issue.key}</span>
                        <strong>{issue.summary}</strong>
                        <div>
                          <span>
                            <UserRound size={13} />
                            {issue.assignee?.displayName || "Unassigned"}
                          </span>
                          <time>{relativeTime(issue.updatedAt)}</time>
                        </div>
                        {issue.labels.length > 0 && (
                          <small>{issue.labels.slice(0, 3).join(" · ")}</small>
                        )}
                      </button>
                    ))
                  ) : (
                    <p className="wb-muted">No live issues</p>
                  )}
                </div>
              </section>
            );
          })}
        </section>
      )}

      {selectedIssueKey && (
        <JiraIssueModal
          issueKey={selectedIssueKey}
          initiative={initiative}
          onClose={() => setSelectedIssueKey(null)}
          onIssueUpdated={replaceIssue}
        />
      )}
      {showReconciliation && (
        <MdmReconciliationModal onClose={() => setShowReconciliation(false)} />
      )}
    </div>
  );
}
