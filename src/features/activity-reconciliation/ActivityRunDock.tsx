import { CheckCircle2, ListChecks, LoaderCircle, Play, ScanSearch, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MdmReconciliationModal } from "../jira/MdmReconciliationModal";
import { ActivityReconciliationPanel } from "./ActivityReconciliationPanel";
import { activityReconciliationApi } from "./api";
import type { ActivityRun, ActivityRunSteps } from "./types";

const ACTIVE = new Set(["running", "stopping"]);
const COMPLETE = new Set(["completed", "partial_success"]);

/**
 * The picker works in plain-language groups; each maps to the exact source
 * stream ids the server reads. Leaving every group on sends no source filter
 * at all, so a full run stays byte-identical to the pre-picker behavior.
 */
const SOURCE_GROUPS = [
  {
    id: "outlook",
    label: "Outlook mail",
    streams: ["outlook_received", "outlook_replied", "outlook_sent"],
  },
  {
    id: "teams",
    label: "Teams messages",
    streams: ["teams_channel_messages", "teams_group_messages", "teams_direct_messages"],
  },
  { id: "transcripts", label: "Meeting transcripts", streams: ["teams_meeting_transcripts"] },
  { id: "brain", label: "Brain updates", streams: ["brain_updates"] },
] as const;

interface PickerState {
  sourceGroups: Record<string, boolean>;
  meetings: boolean;
  staleSweep: boolean;
  outlookDrafts: boolean;
  mdmCheck: boolean;
}

const EVERYTHING: PickerState = {
  sourceGroups: { outlook: true, teams: true, transcripts: true, brain: true },
  meetings: true,
  staleSweep: true,
  outlookDrafts: true,
  mdmCheck: true,
};

const QUICK_JIRA: PickerState = {
  sourceGroups: { outlook: true, teams: true, transcripts: false, brain: true },
  meetings: false,
  staleSweep: false,
  outlookDrafts: false,
  mdmCheck: false,
};

function stepsFromPicker(picker: PickerState): ActivityRunSteps | undefined {
  const allSources = SOURCE_GROUPS.every((group) => picker.sourceGroups[group.id]);
  const everythingElse =
    picker.meetings && picker.staleSweep && picker.outlookDrafts && picker.mdmCheck;
  if (allSources && everythingElse) return undefined;
  return {
    sources: allSources
      ? null
      : SOURCE_GROUPS.filter((group) => picker.sourceGroups[group.id]).flatMap((group) => [
          ...group.streams,
        ]),
    meetings: picker.meetings,
    staleSweep: picker.staleSweep,
    outlookDrafts: picker.outlookDrafts,
    mdmCheck: picker.mdmCheck,
  };
}

interface DockContextValue {
  openPicker: () => void;
  openPanel: () => void;
}

const DockContext = createContext<DockContextValue | null>(null);

export function useActivityRunDock() {
  const value = useContext(DockContext);
  if (!value) {
    throw new Error("useActivityRunDock requires an ActivityRunDockProvider above it.");
  }
  return value;
}

interface Toast {
  kind: "completed" | "attention";
  title: string;
  detail: string;
}

export function ActivityRunDockProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<ActivityRun | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mdmOpen, setMdmOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState>(EVERYTHING);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  const priorStatus = useRef<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const next = await activityReconciliationApi.status();
      setRun(next);
    } catch {
      // The pill quietly keeps its last known state through a blip; the panel
      // itself reports errors loudly when it is open.
    }
  }, []);

  const runActive = run ? ACTIVE.has(run.status) : false;

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    const timer = window.setInterval(() => void poll(), runActive ? 2_500 : 15_000);
    return () => window.clearInterval(timer);
  }, [poll, runActive]);

  // The completion toast fires only on a watched transition from running to
  // finished, never for a run that was already finished when the app loaded.
  useEffect(() => {
    const previous = priorStatus.current;
    priorStatus.current = run?.status || null;
    if (!run || !previous || !ACTIVE.has(previous)) return;
    if (COMPLETE.has(run.status)) {
      const proposals = run.counts.jiraProposals;
      const drafts = run.counts.emailDrafts;
      const meetings = run.counts.meetingsProcessed;
      setToast({
        kind: "completed",
        title: "Activity reconciliation finished",
        detail: `${proposals} Jira proposal${proposals === 1 ? "" : "s"}, ${drafts} email draft${drafts === 1 ? "" : "s"}, ${meetings} meeting${meetings === 1 ? "" : "s"} processed.`,
      });
    } else if (run.status === "interrupted") {
      setToast({
        kind: "attention",
        title: "Activity reconciliation stopped early",
        detail: "The run was interrupted and can resume from its last checkpoint.",
      });
    }
  }, [run]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openPicker = useCallback(() => {
    // An active run has nothing to pick: attach straight to it.
    if (run && ACTIVE.has(run.status)) {
      setPanelOpen(true);
      return;
    }
    setStartError(null);
    setPickerOpen(true);
  }, [run]);

  const openPanel = useCallback(() => setPanelOpen(true), []);

  const startRun = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await activityReconciliationApi.start(false, stepsFromPicker(picker));
      setPickerOpen(false);
      setPanelOpen(true);
      await poll();
    } catch (reason) {
      setStartError(reason instanceof Error ? reason.message : "The activity run could not start.");
    } finally {
      setStarting(false);
    }
  };

  const contextValue = useMemo(() => ({ openPicker, openPanel }), [openPicker, openPanel]);

  const reviewCount = run && COMPLETE.has(run.status) ? run.counts.jiraProposals : 0;
  const pillVisible =
    !panelOpen &&
    !!run &&
    (runActive || (COMPLETE.has(run.status) && reviewCount > 0 && run.id !== dismissedRunId));

  const anyGroupSelected = SOURCE_GROUPS.some((group) => picker.sourceGroups[group.id]);

  return (
    <DockContext.Provider value={contextValue}>
      {children}

      {pillVisible &&
        createPortal(
          <div
            className="ar-dock-pill"
            data-state={runActive ? "active" : "review"}
            data-testid="activity-dock-pill"
          >
            <button type="button" className="ar-dock-pill-main" onClick={() => setPanelOpen(true)}>
              {runActive ? (
                <>
                  <LoaderCircle className="ar-spin" size={14} />
                  <span className="ar-dock-pill-label">{run?.phase.label}</span>
                  <small>
                    Step {run?.phase.index} of {run?.phase.total}
                  </small>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span className="ar-dock-pill-label">Review ready</span>
                  <small>
                    {reviewCount} proposal{reviewCount === 1 ? "" : "s"}
                  </small>
                </>
              )}
            </button>
            {!runActive && (
              <button
                type="button"
                className="ar-dock-pill-dismiss"
                aria-label="Dismiss the review reminder"
                onClick={() => setDismissedRunId(run?.id || null)}
              >
                <X size={12} />
              </button>
            )}
          </div>,
          document.body
        )}

      {panelOpen &&
        createPortal(
          <div className="ar-dock-backdrop" data-testid="activity-dock-overlay">
            <div className="ar-dock-overlay">
              <ActivityReconciliationPanel
                onClose={() => setPanelOpen(false)}
                onOpenMdmReview={() => setMdmOpen(true)}
              />
            </div>
          </div>,
          document.body
        )}

      {mdmOpen && <MdmReconciliationModal onClose={() => setMdmOpen(false)} />}

      {pickerOpen &&
        createPortal(
          <div className="ar-dock-backdrop" data-testid="activity-picker">
            <div className="ar-picker">
              <header>
                <div>
                  <span className="ar-kicker">Reconcile activity</span>
                  <h2>Pick what this run covers</h2>
                </div>
                <button
                  type="button"
                  className="ar-icon-button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close the run picker"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="ar-picker-presets">
                <button
                  type="button"
                  onClick={() => setPicker(EVERYTHING)}
                  data-testid="picker-preset-everything"
                >
                  <ListChecks size={14} /> Everything
                </button>
                <button
                  type="button"
                  onClick={() => setPicker(QUICK_JIRA)}
                  data-testid="picker-preset-quick"
                >
                  <ScanSearch size={14} /> Quick Jira check
                </button>
              </div>

              <fieldset className="ar-picker-group">
                <legend>Sources to read</legend>
                {SOURCE_GROUPS.map((group) => (
                  <label key={group.id}>
                    <input
                      type="checkbox"
                      checked={picker.sourceGroups[group.id]}
                      onChange={(event) =>
                        setPicker((current) => ({
                          ...current,
                          sourceGroups: {
                            ...current.sourceGroups,
                            [group.id]: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>{group.label}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="ar-picker-group">
                <legend>Steps to run</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={picker.meetings}
                    onChange={(event) =>
                      setPicker((current) => ({ ...current, meetings: event.target.checked }))
                    }
                  />
                  <span>Process meetings and generate infographics</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={picker.staleSweep}
                    onChange={(event) =>
                      setPicker((current) => ({ ...current, staleSweep: event.target.checked }))
                    }
                  />
                  <span>Sweep stale tickets (60+ days idle, unmentioned)</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={picker.outlookDrafts}
                    onChange={(event) =>
                      setPicker((current) => ({ ...current, outlookDrafts: event.target.checked }))
                    }
                  />
                  <span>Create Outlook drafts for follow-up emails</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={picker.mdmCheck}
                    onChange={(event) =>
                      setPicker((current) => ({ ...current, mdmCheck: event.target.checked }))
                    }
                  />
                  <span>Run the MDM check (Jira vs. Brain) afterward</span>
                </label>
              </fieldset>

              <p className="ar-picker-hint">
                Anything you leave out keeps its saved position and shows in the recap as not run,
                so the next full run still picks it up with nothing missed.
              </p>

              {startError && (
                <p className="ar-picker-error" role="alert">
                  {startError}
                </p>
              )}

              <footer>
                <button type="button" className="ar-secondary" onClick={() => setPickerOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ar-primary"
                  disabled={starting || !anyGroupSelected}
                  onClick={() => void startRun()}
                  data-testid="picker-start"
                >
                  {starting ? <LoaderCircle className="ar-spin" size={16} /> : <Play size={16} />}
                  Start this run
                </button>
              </footer>
            </div>
          </div>,
          document.body
        )}

      {toast &&
        createPortal(
          <output className="ar-toast" data-kind={toast.kind} data-testid="activity-toast">
            {toast.kind === "completed" ? <CheckCircle2 size={17} /> : <LoaderCircle size={17} />}
            <div>
              <strong>{toast.title}</strong>
              <span>{toast.detail}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setToast(null);
                setPanelOpen(true);
              }}
            >
              Open review
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </output>,
          document.body
        )}
    </DockContext.Provider>
  );
}
