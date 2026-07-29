import { ArrowRight, Clock3, Columns3, LibraryBig, List } from "lucide-react";
import { useMemo, useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { brain, formatDate } from "../../data";
import { JiraWorkSurface } from "../../features/jira/JiraWorkSurface";
import type { Detail } from "../../types/brain";
import type { ApprovalPreview, TeamWorkItem, WorkLane, WorkState } from "../../types/workbench";
import { getPreparedDisplayState, getSnapshotFreshness, preparedStateLabel } from "./truthState";

const statusLabel: Record<WorkState, string> = {
  "needs-you": "Needs you",
  "in-progress": "In progress",
  waiting: "Waiting",
  done: "Done",
};

function BrainCard({
  item,
  snapshotAsOf,
  historical,
  onOpenDetail,
}: {
  item: TeamWorkItem;
  snapshotAsOf: string;
  historical: boolean;
  onOpenDetail: (detail: Detail) => void;
}) {
  return (
    <article className="wb-board-card">
      <div className="wb-card-topline">
        <span className="wb-source-chip">Team knowledge</span>
        <span className={`wb-urgency-label wb-urgency-${item.urgency}`}>{item.urgency}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <div className="wb-card-meta">
        <span>{item.owner || "Owner not set"}</span>
        <span>{preparedStateLabel(item.state, historical)}</span>
        <span>As of {formatDate(item.updatedAt ?? snapshotAsOf)}</span>
      </div>
      {item.detail && (
        <div className="wb-card-actions">
          <button
            type="button"
            className="wb-link-button"
            onClick={() => onOpenDetail(item.detail as Detail)}
          >
            Review source context
          </button>
        </div>
      )}
    </article>
  );
}

function BrainFollowUps({
  items,
  lanes,
  snapshotAsOf,
  onOpenDetail,
}: {
  items: TeamWorkItem[];
  lanes: WorkLane[];
  snapshotAsOf: string;
  onOpenDetail: (detail: Detail) => void;
}) {
  const freshness = getSnapshotFreshness(snapshotAsOf);
  const historical = freshness.state !== "current";
  const preparedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        state: getPreparedDisplayState(item),
      })),
    [items]
  );
  const preparedLanes = useMemo(
    () =>
      lanes.map((lane) => ({
        ...lane,
        items: preparedItems.filter((item) => item.state === lane.id),
      })),
    [lanes, preparedItems]
  );
  const [mode, setMode] = useState<"list" | "board">("list");
  const [filter, setFilter] = useState<"all" | WorkState>(historical ? "all" : "needs-you");
  const filteredItems = useMemo(
    () => preparedItems.filter((item) => filter === "all" || item.state === filter),
    [filter, preparedItems]
  );

  return (
    <div className="wb-brain-followups">
      <div className="wb-brain-separation">
        <LibraryBig size={20} />
        <div>
          <strong>{historical ? "Prepared work" : "Prepared follow-ups"}</strong>
          <p>
            These records come from the Workbench snapshot dated {formatDate(snapshotAsOf)}. They
            are not Jira issues and cannot update Jira until a verified MT issue key is attached.
          </p>
        </div>
        <span>{historical ? "Historical snapshot" : "Not synchronized"}</span>
      </div>

      {freshness.state === "stale" && (
        <div className="wb-inline-notice wb-stale-notice" role="status">
          <Clock3 size={18} aria-hidden="true" />
          <span>
            This prepared snapshot is {freshness.ageDays} days old. Labels below describe how
            records were classified then; they do not prove current activity, ownership, or Jira
            status.
          </span>
        </div>
      )}

      {freshness.state === "unavailable" && (
        <div className="wb-inline-notice wb-stale-notice" role="alert">
          <Clock3 size={18} aria-hidden="true" />
          <span>
            The publication has no usable as-of time. These records remain historical prepared
            context until the source can be dated and reconciled.
          </span>
        </div>
      )}

      <div className="wb-work-toolbar">
        <fieldset className="wb-segmented">
          <legend className="wb-sr-only">Follow-up layout</legend>
          <button
            type="button"
            aria-pressed={mode === "list"}
            className={mode === "list" ? "is-active" : ""}
            onClick={() => {
              setMode("list");
              setFilter(historical ? "all" : "needs-you");
            }}
          >
            <List size={17} /> List
          </button>
          <button
            type="button"
            aria-pressed={mode === "board"}
            className={mode === "board" ? "is-active" : ""}
            onClick={() => {
              setMode("board");
              setFilter("all");
            }}
          >
            <Columns3 size={17} /> Board
          </button>
        </fieldset>
        <label className="wb-filter-control">
          <span>Show</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | WorkState)}
          >
            <option value="all">All prepared follow-ups</option>
            {(Object.keys(statusLabel) as WorkState[]).map((state) => (
              <option value={state} key={state}>
                {preparedStateLabel(state, historical)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {preparedItems.length === 0 ? (
        <section className="wb-safe-empty">
          <LibraryBig size={24} aria-hidden="true" />
          <div>
            <strong>No prepared follow-ups are in this view</strong>
            <p>No placeholder work is substituted for an empty prepared source.</p>
          </div>
        </section>
      ) : mode === "list" && filteredItems.length === 0 ? (
        <section className="wb-safe-empty">
          <List size={24} aria-hidden="true" />
          <div>
            <strong>No prepared records match this filter</strong>
            <p>Choose another snapshot classification. No filler work is shown.</p>
          </div>
        </section>
      ) : mode === "list" ? (
        <section className="wb-work-table" aria-label="Prepared follow-up list">
          <div className="wb-work-table-head wb-brain-table-head">
            <span>Follow-up</span>
            <span>State</span>
            <span>Owner</span>
            <span>Source</span>
          </div>
          {filteredItems.map((item) => (
            <div className="wb-work-table-row wb-brain-table-row" key={item.id}>
              <button
                type="button"
                className="wb-work-title-button"
                disabled={!item.detail}
                onClick={() => item.detail && onOpenDetail(item.detail)}
              >
                <strong>{item.title}</strong>
                <small>{item.summary}</small>
              </button>
              <span className="wb-status wb-status-neutral">
                {preparedStateLabel(item.state, historical)}
              </span>
              <span>{item.owner || "Not set"}</span>
              <span>
                <span className="wb-source-chip">Team knowledge</span>
                <small>As of {formatDate(item.updatedAt ?? snapshotAsOf)}</small>
              </span>
            </div>
          ))}
        </section>
      ) : (
        <section className="wb-board" aria-label="Prepared follow-up board">
          {preparedLanes.map((lane) => (
            <div className="wb-board-lane" key={lane.id}>
              <header>
                <div>
                  <h2>{preparedStateLabel(lane.id, historical)}</h2>
                  <p>
                    {historical
                      ? `Snapshot classification · ${formatDate(snapshotAsOf)}`
                      : lane.helper}
                  </p>
                </div>
                <span>{lane.items.length}</span>
              </header>
              <div className="wb-board-stack">
                {lane.items.length ? (
                  lane.items.map((item) => (
                    <BrainCard
                      item={item}
                      snapshotAsOf={snapshotAsOf}
                      historical={historical}
                      key={item.id}
                      onOpenDetail={onOpenDetail}
                    />
                  ))
                ) : (
                  <div className="wb-empty-state">No prepared follow-ups in this lane.</div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="wb-inline-notice">
        <ArrowRight size={18} aria-hidden="true" />
        <span>
          Reconciliation can suggest a Jira crosswalk, but ambiguous Brain records stay read-only.
        </span>
      </div>
    </div>
  );
}

export function WorkView({
  items,
  lanes,
  onOpenDetail,
  onPreview,
}: {
  items: TeamWorkItem[];
  lanes: WorkLane[];
  onOpenDetail: (detail: Detail) => void;
  onPreview: (preview: ApprovalPreview) => void;
}) {
  const [source, setSource] = useState<"jira" | "brain">("jira");
  void onPreview;

  const laneCount = (state: WorkState) =>
    lanes.find((lane) => lane.id === state)?.items.length ?? 0;

  return (
    <div className="wb-page" data-testid="work-view">
      <WorkspaceHero
        kicker="Work · MDM initiative"
        title="Keep the next move visible."
        stats={[
          { label: "Needs you", value: laneCount("needs-you"), tone: "attention" },
          { label: "In progress", value: laneCount("in-progress") },
          { label: "Waiting", value: laneCount("waiting") },
          { label: "Done", value: laneCount("done"), tone: "good" },
        ]}
      />

      <nav className="wb-work-source-tabs" aria-label="Work source">
        <button
          type="button"
          aria-current={source === "jira" ? "page" : undefined}
          className={source === "jira" ? "is-active" : ""}
          onClick={() => setSource("jira")}
        >
          Live Jira issues
          <small>One-to-one MT records</small>
        </button>
        <button
          type="button"
          aria-current={source === "brain" ? "page" : undefined}
          className={source === "brain" ? "is-active" : ""}
          onClick={() => setSource("brain")}
        >
          Prepared follow-ups
          <small>Supporting evidence, not Jira</small>
        </button>
      </nav>

      {source === "jira" ? (
        <JiraWorkSurface />
      ) : (
        <BrainFollowUps
          items={items}
          lanes={lanes}
          snapshotAsOf={brain.manifest.generatedAt}
          onOpenDetail={onOpenDetail}
        />
      )}
    </div>
  );
}
