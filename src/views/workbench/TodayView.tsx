import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Inbox,
  PauseCircle,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { formatDate } from "../../data";
import type { Detail } from "../../types/brain";
import type { TeamWorkItem, WorkState } from "../../types/workbench";
import { getPreparedDisplayState, getSnapshotFreshness } from "./truthState";

const sectionMeta: Record<WorkState, { label: string; helper: string; icon: typeof Sparkles }> = {
  "needs-you": {
    label: "Needs you",
    helper: "Waiting on your review.",
    icon: Inbox,
  },
  "in-progress": {
    label: "In progress",
    helper: "Already has an owner.",
    icon: Sparkles,
  },
  waiting: {
    label: "Waiting",
    helper: "Blocked on an answer or a source.",
    icon: PauseCircle,
  },
  done: {
    label: "Done",
    helper: "Recently resolved.",
    icon: CheckCircle2,
  },
};

const kindIcon = {
  question: HelpCircle,
  risk: TriangleAlert,
  proposal: Sparkles,
  decision: CheckCircle2,
} as const;

const urgencyTone = {
  overdue: "blocked",
  soon: "attention",
  normal: "default",
} as const;

function WorkTile({
  item,
  onOpenDetail,
}: {
  item: TeamWorkItem;
  onOpenDetail: (detail: Detail) => void;
}) {
  const Icon = kindIcon[item.kind] ?? Sparkles;
  const tone = urgencyTone[item.urgency];
  return (
    <button
      type="button"
      className="wb-tile"
      onClick={() => item.detail && onOpenDetail(item.detail)}
      disabled={!item.detail}
    >
      <span className="wb-tile-top">
        <span className="wb-tile-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        {item.urgency !== "normal" && (
          <span className="wb-pill" data-tone={tone}>
            {item.urgency === "overdue" ? "Needs attention" : "Soon"}
          </span>
        )}
      </span>
      <strong className="wb-tile-title">{item.title}</strong>
      {item.summary && <span className="wb-tile-summary">{item.summary}</span>}
      <span className="wb-tile-meta">
        {item.owner && <span className="wb-pill">{item.owner}</span>}
        {item.dueLabel && <span className="wb-pill">{item.dueLabel}</span>}
        {item.updatedAt && <span className="wb-pill">{formatDate(item.updatedAt)}</span>}
      </span>
    </button>
  );
}

export function TodayView({
  items,
  generatedAt,
  onOpenDetail,
  onOpenWork,
}: {
  items: TeamWorkItem[];
  generatedAt: string;
  onOpenDetail: (detail: Detail) => void;
  onOpenWork: () => void;
}) {
  const freshness = getSnapshotFreshness(generatedAt);
  const isCurrent = freshness.state === "current";
  const preparedItems = items.map((item) => ({
    ...item,
    state: getPreparedDisplayState(item),
  }));

  // Items whose own source lane has stopped producing are prepared history. Promoting a
  // months-old proposal to "First up" would misrepresent it as today's priority.
  const currentItems = preparedItems.filter((item) => !item.isHistorical);
  const historicalItems = preparedItems.filter((item) => item.isHistorical);
  const historicalAgeDays = historicalItems.find((item) => item.sourceAgeDays)?.sourceAgeDays;

  const firstUp =
    (isCurrent &&
      (currentItems.find((item) => item.state === "needs-you") ??
        currentItems.find((item) => item.state === "in-progress") ??
        currentItems.find((item) => item.state === "waiting"))) ||
    undefined;

  const count = (state: WorkState) => currentItems.filter((item) => item.state === state).length;

  return (
    <div className="wb-page" data-testid="today-view">
      <WorkspaceHero
        kicker="Today"
        title="Start with what needs attention."
        stats={[
          { label: "Needs you", value: count("needs-you"), tone: "attention" },
          { label: "In progress", value: count("in-progress") },
          { label: "Waiting", value: count("waiting") },
          { label: "Open items", value: currentItems.length },
        ]}
        action={
          <button className="wb-hero-button" type="button" onClick={onOpenWork}>
            Open all work
            <ArrowRight size={16} />
          </button>
        }
      />

      {freshness.state === "unavailable" && (
        <div className="wb-inline-notice wb-stale-notice" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>
            The prepared source did not provide a usable as-of time, so current priorities are
            unavailable.
          </span>
        </div>
      )}

      {!isCurrent ? (
        <section className="wb-safe-empty" aria-label="Current priorities unavailable">
          <Clock3 size={24} aria-hidden="true" />
          <div>
            <strong>Nothing current to start with</strong>
            <p>Open Work to review everything that is prepared.</p>
            <button className="wb-button-secondary" type="button" onClick={onOpenWork}>
              Open Work
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
      ) : currentItems.length === 0 ? (
        <section className="wb-safe-empty" aria-label="Today is empty">
          <CheckCircle2 size={24} aria-hidden="true" />
          <div>
            <strong>Nothing is waiting on you right now</strong>
            <p>Jira, Outlook, and Teams are checked separately.</p>
          </div>
        </section>
      ) : (
        <>
          {firstUp && (
            <section className="wb-firstup-card">
              <div className="wb-firstup-badge">
                <Sparkles size={15} aria-hidden="true" />
                First up
              </div>
              <h2>{firstUp.title}</h2>
              <p>{firstUp.summary}</p>
              <div className="wb-firstup-meta">
                {firstUp.owner && <span className="wb-pill">{firstUp.owner}</span>}
                {firstUp.dueLabel && <span className="wb-pill">{firstUp.dueLabel}</span>}
                <span className="wb-pill">Nothing sends from this card</span>
              </div>
              {firstUp.detail && (
                <button
                  className="wb-button-primary"
                  type="button"
                  onClick={() => onOpenDetail(firstUp.detail as Detail)}
                >
                  Review the context
                  <ArrowRight size={17} />
                </button>
              )}
            </section>
          )}

          {(Object.keys(sectionMeta) as WorkState[]).map((state) => {
            const meta = sectionMeta[state];
            const Icon = meta.icon;
            const sectionItems = currentItems.filter(
              (item) => item.state === state && item.id !== firstUp?.id
            );
            if (sectionItems.length === 0) return null;
            return (
              <section key={state}>
                <div className="wb-band">
                  <span className="wb-tile-icon">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <h2>{meta.label}</h2>
                  <span className="wb-band-count">{sectionItems.length}</span>
                  <span className="wb-band-helper">{meta.helper}</span>
                </div>
                <div className="wb-card-grid">
                  {sectionItems.slice(0, 9).map((item) => (
                    <WorkTile item={item} key={item.id} onOpenDetail={onOpenDetail} />
                  ))}
                </div>
              </section>
            );
          })}

          <details className="wb-quiet-note">
            <summary>
              <ShieldAlert size={15} aria-hidden="true" />
              <span>What this view covers</span>
            </summary>
            <p>
              This is prepared team context, not a live Jira, Outlook, or Teams sync. Those are
              checked separately and never substituted here.
            </p>
          </details>

          {historicalItems.length > 0 && (
            <details className="wb-quiet-note">
              <summary>
                <Clock3 size={15} aria-hidden="true" />
                <span>
                  {historicalItems.length} earlier prepared{" "}
                  {historicalItems.length === 1 ? "item" : "items"}
                  {historicalAgeDays ? ` from ${historicalAgeDays} days ago` : ""}
                </span>
              </summary>
              <p>
                These came from a lane that has not produced since, so they are kept as context and
                never treated as current priorities.
              </p>
              <div className="wb-card-grid" style={{ marginTop: 12 }}>
                {historicalItems.slice(0, 6).map((item) => (
                  <WorkTile item={item} key={item.id} onOpenDetail={onOpenDetail} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
