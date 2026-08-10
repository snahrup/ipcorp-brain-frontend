import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  Navigation,
  PanelRight,
  PanelRightClose,
  PlugZap,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ViewKey } from "../../lib/search";
import { resolveDestination, serializeDestinations, WORKBENCH_DESTINATIONS } from "./destinations";
import { getPendingReviewCards } from "./reviewQueue";
import { waitForSectionTarget } from "./sectionTargeting";
import { createSemanticActionInventory } from "./semanticActions";
import {
  confirmWorkbenchAgentAction,
  getWorkbenchAgentStatus,
  streamWorkbenchAgent,
} from "./stream";
import type {
  AgentActivityItem,
  AgentMessage,
  AgentReceipt,
  AgentReviewCard,
  ConnectorReadiness,
  SemanticActionItem,
  WorkbenchAgentCommand,
  WorkbenchAgentStatus,
  WorkbenchAgentStreamEvent,
} from "./types";
import "./workbench-agent.css";

type WorkbenchAgentProps = {
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
};

/** Floating card in the corner, or a full-height rail down the right edge. */
type AgentDock = "float" | "rail";

const DOCK_STORAGE_KEY = "workbench-agent-dock";
/** How close to the bottom still counts as "following along". */
const PINNED_SLACK_PX = 48;

function readStoredDock(): AgentDock {
  try {
    return window.localStorage.getItem(DOCK_STORAGE_KEY) === "rail" ? "rail" : "float";
  } catch {
    return "float";
  }
}

const emptyConnectorState: ConnectorReadiness[] = [
  {
    id: "workbench",
    label: "Workbench",
    status: "checking",
    detail: "Local context ready when the service responds.",
  },
  { id: "jira", label: "Jira", status: "checking", detail: "Waiting for a live read." },
  {
    id: "microsoft365",
    label: "Microsoft 365",
    status: "checking",
    detail: "Waiting for a live read.",
  },
  {
    id: "team-library",
    label: "Team Library",
    status: "checking",
    detail: "Waiting for a live read.",
  },
  {
    id: "notebooklm",
    label: "NotebookLM",
    status: "checking",
    detail: "Status and listing are read-only.",
  },
  {
    id: "devspace",
    label: "DevSpace",
    status: "checking",
    detail: "Maintenance access is limited to this Workbench checkout.",
  },
  {
    id: "sql",
    label: "SQL",
    status: "checking",
    detail: "Read-only data sources are checked on request.",
  },
  {
    id: "powerbi",
    label: "Power BI",
    status: "checking",
    detail: "Model access is checked on request.",
  },
  {
    id: "fabric",
    label: "Fabric",
    status: "checking",
    detail: "Workspace access is checked on request.",
  },
];

export function WorkbenchAgent({ activeView, onNavigate }: WorkbenchAgentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<WorkbenchAgentStatus>("idle");
  const [statusDetail, setStatusDetail] = useState("");
  const [thinking, setThinking] = useState("");
  const [draft, setDraft] = useState("");
  const [actions, setActions] = useState<SemanticActionItem[]>([]);
  const [connectors, setConnectors] = useState(emptyConnectorState);
  const [activities, setActivities] = useState<AgentActivityItem[]>([]);
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [attemptedReviewIds, setAttemptedReviewIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dock, setDock] = useState<AgentDock>(readStoredDock);
  const [isFollowing, setIsFollowing] = useState(true);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  // Reading the conversation must survive a re-render, so the scroll decision lives
  // in a ref the effect can consult without re-running on every state change.
  const isFollowingRef = useRef(true);
  const inventoryRef = useRef<ReturnType<typeof createSemanticActionInventory> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftRef = useRef("");
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const localReviewInventoriesRef = useRef(
    new Map<string, ReturnType<typeof createSemanticActionInventory>>()
  );
  const confirmedReviewIdsRef = useRef(new Set<string>());
  const destinations = useMemo(serializeDestinations, []);
  const currentDestination = WORKBENCH_DESTINATIONS[activeView];

  const refreshActions = useCallback(() => {
    const inventory = createSemanticActionInventory(activeView);
    inventoryRef.current = inventory;
    setActions(inventory.actions);
  }, [activeView]);

  const closeAgent = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => lastFocusRef.current?.focus());
  }, []);

  const refreshConnectorStatus = useCallback(async () => {
    setIsStatusLoading(true);
    try {
      const snapshot = await getWorkbenchAgentStatus();
      setConnectors(snapshot.connectors);
    } catch (err) {
      const checkedAt = new Date().toISOString();
      setConnectors((current) =>
        current.map((connector) => ({
          ...connector,
          status: "unavailable",
          detail: err instanceof Error ? err.message : "Connector status could not be checked.",
          checkedAt,
        }))
      );
      setError(err instanceof Error ? err.message : "Connector status could not be checked.");
    } finally {
      setIsStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    refreshActions();
  }, [isOpen, refreshActions]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshConnectorStatus();
  }, [isOpen, refreshConnectorStatus]);

  const scrollToLatest = useCallback((behavior?: ScrollBehavior) => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: behavior ?? scrollBehavior() });
    isFollowingRef.current = true;
    setIsFollowing(true);
    setHasUnreadBelow(false);
  }, []);

  const onLogScroll = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    const following = log.scrollHeight - log.scrollTop - log.clientHeight <= PINNED_SLACK_PX;
    isFollowingRef.current = following;
    setIsFollowing(following);
    if (following) setHasUnreadBelow(false);
  }, []);

  // "The conversation grew" in one comparable value, so reopening or un-minimizing
  // the panel cannot be mistaken for a new reply arriving.
  const conversationSignal = `${messages.length}:${draft.length}:${thinking.length}`;
  const lastSignalRef = useRef(conversationSignal);

  // Follow the newest text only while the reader is already at the bottom. This
  // effect used to run on every render with no dependencies, so scrolling up to read
  // an earlier answer was undone by the next unrelated state change - a connector
  // refresh, a status tick - and the earlier conversation was effectively unreachable.
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const grew = conversationSignal !== lastSignalRef.current;
    lastSignalRef.current = conversationSignal;
    if (isFollowingRef.current) {
      scrollToLatest("auto");
      return;
    }
    if (grew) setHasUnreadBelow(true);
  }, [conversationSignal, isMinimized, isOpen, scrollToLatest]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_STORAGE_KEY, dock);
    } catch {
      // A blocked storage write only costs the preference, never the panel.
    }
  }, [dock]);

  // The shell reserves the rail's width so the workspace is narrowed rather than
  // covered. Set on the body because the panel is fixed-positioned and the shell is
  // rendered by App; no layout transition, deliberately - the knowledge map's render
  // loop starves main-thread width animations (see CLAUDE.md, 2026-05-30).
  useEffect(() => {
    const docked = isOpen && !isMinimized && dock === "rail";
    if (docked) document.body.dataset.workbenchAgentDock = "rail";
    else delete document.body.dataset.workbenchAgentDock;
    return () => {
      delete document.body.dataset.workbenchAgentDock;
    };
  }, [dock, isMinimized, isOpen]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    inputRef.current?.focus();
  }, [isMinimized, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAgent();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAgent, isOpen]);

  const openAgent = () => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsOpen(true);
    setIsMinimized(false);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("stopped");
    setStatusDetail("Stopped.");
    const partial = draftRef.current.trim();
    draftRef.current = "";
    if (partial) commitAgentMessage(partial);
    setDraft("");
  };

  const sendMessage = async () => {
    const message = input.trim();
    if (!message || status === "thinking" || status === "writing" || status === "using-tools") {
      return;
    }

    refreshActions();
    setInput("");
    setError("");
    setThinking("");
    draftRef.current = "";
    setDraft("");
    setStatus("thinking");
    setStatusDetail("Thinking");
    // Asking a question is a request to see the answer, wherever the reader was.
    isFollowingRef.current = true;
    const nextMessages = [
      ...messages,
      { id: crypto.randomUUID(), role: "user" as const, content: message, createdAt: Date.now() },
    ];
    setMessages(nextMessages);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamWorkbenchAgent(
        {
          message,
          activeView,
          actions: inventoryRef.current?.actions ?? [],
          destinations,
          conversation: nextMessages
            .filter((item) => item.role === "user" || item.role === "agent")
            .slice(-10)
            .map((item) => ({ role: item.role as "user" | "agent", content: item.content })),
        },
        controller.signal,
        {
          onEvent: handleStreamEvent,
          onError: (messageText) => {
            setError(messageText);
            setStatus("error");
          },
        }
      );
      setStatus((current) => (current === "stopped" || current === "error" ? current : "idle"));
      setStatusDetail("");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Agent request failed.");
      setStatus("error");
    } finally {
      abortRef.current = null;
      setThinking("");
      const completedDraft = draftRef.current.trim();
      draftRef.current = "";
      if (completedDraft) commitAgentMessage(completedDraft);
      setDraft("");
    }
  };

  const commitAgentMessage = useCallback((content: string) => {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "agent", content, createdAt: Date.now() },
    ]);
  }, []);

  const attachReceipt = useCallback((receipt: AgentReceipt) => {
    setMessages((current) => attachToLastAgentMessage(current, { receipts: [receipt] }));
  }, []);

  const attachReview = useCallback((review: AgentReviewCard) => {
    setMessages((current) => attachToLastAgentMessage(current, { reviewCards: [review] }));
  }, []);

  const handleStreamEvent = (event: WorkbenchAgentStreamEvent) => {
    switch (event.type) {
      case "status":
        setStatus(event.status);
        setStatusDetail(event.detail ?? statusLabel(event.status));
        break;
      case "thinking":
      case "reasoning":
        setThinking((current) => `${current}${event.text}`);
        setStatus("thinking");
        break;
      case "delta":
      case "text":
        draftRef.current = `${draftRef.current}${event.text}`;
        setDraft(draftRef.current);
        setStatus("writing");
        break;
      case "message":
        commitAgentMessage(event.text);
        draftRef.current = "";
        setDraft("");
        break;
      case "connector":
        setConnectors((current) =>
          current.map((connector) =>
            connector.id === event.connector.id ? event.connector : connector
          )
        );
        break;
      case "activity":
        setActivities((current) => upsertActivity(current, event.activity));
        break;
      case "receipt":
        attachReceipt(event.receipt);
        break;
      case "review":
        attachReview(event.review);
        break;
      case "navigate":
        void navigateTo(event.destination.view, event.destination.section);
        break;
      case "action":
        runAction(event.actionKey, event.value);
        break;
      case "error":
        setError(event.message);
        setStatus("error");
        break;
      case "done":
        setStatus("idle");
        setStatusDetail("");
        break;
    }
  };

  const navigateTo = async (view: ViewKey, sectionKey?: string) => {
    const resolved = resolveDestination({ view, section: sectionKey });
    if (!resolved) {
      setNotice("I could not find that Workbench location.");
      return;
    }
    onNavigate(resolved.view);
    await waitForRender();
    const target = resolved.section
      ? await waitForSectionTarget(resolved.section.key, resolved.section.label)
      : null;
    const moved = target ? focusTarget(target) : false;
    setNotice(openedNotice(moved ? resolved.label : WORKBENCH_DESTINATIONS[view].label));
  };

  const runAction = (actionKey: string, value?: string) => {
    const result = inventoryRef.current?.execute(actionKey, value) ?? {
      ok: false as const,
      reason: "missing" as const,
      message: "No current page actions are registered.",
    };
    if (result.ok && result.needsReview) {
      if (result.review.id.startsWith("local:") && inventoryRef.current) {
        localReviewInventoriesRef.current.set(result.review.id, inventoryRef.current);
      }
      attachReview(result.review);
    }
    setNotice(result.message);
    refreshActions();
  };

  const confirmReview = async (review: AgentReviewCard) => {
    setStatus("using-tools");
    setStatusDetail("Confirming");
    try {
      if (confirmedReviewIdsRef.current.has(review.id)) {
        throw new Error("That review has already been confirmed.");
      }
      confirmedReviewIdsRef.current.add(review.id);
      setAttemptedReviewIds((current) => new Set(current).add(review.id));
      if (review.id.startsWith("local:")) {
        const inventory = localReviewInventoriesRef.current.get(review.id);
        const actionKey = review.id.slice("local:".length);
        const result = inventory?.confirm(actionKey) ?? {
          ok: false as const,
          reason: "stale" as const,
          message: "That page action is no longer current.",
        };
        if (!result.ok) throw new Error(result.message);
        attachReceipt({
          id: crypto.randomUUID(),
          title: "Page action confirmed",
          detail: result.message,
          source: "Current Workbench page",
          createdAt: new Date().toISOString(),
        });
        localReviewInventoriesRef.current.delete(review.id);
        setNotice(result.message);
        refreshActions();
        return;
      }
      const payload = await confirmWorkbenchAgentAction(review.id);
      const commandReceipt = runConfirmedCommand(payload.data.command);
      if (commandReceipt) {
        attachReceipt(commandReceipt);
        setNotice(commandReceipt.detail);
        return;
      }
      const receipt = payload.data.receipt;
      if (receipt) attachReceipt(receipt);
      setNotice("Confirmed and recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
      setStatus("error");
    } finally {
      setStatus("idle");
      setStatusDetail("");
    }
  };

  const visibleReviews = getPendingReviewCards(messages, attemptedReviewIds);

  const runConfirmedCommand = (command?: WorkbenchAgentCommand): AgentReceipt | null => {
    if (!command || !isWorkbenchPageActionCommand(command)) return null;
    const actionKey = command.args?.actionKey;
    if (!actionKey) throw new Error("Confirmed page action did not include an action key.");
    const result = inventoryRef.current?.confirm(actionKey) ?? {
      ok: false as const,
      reason: "stale" as const,
      message: "That page action is no longer current.",
    };
    if (!result.ok) throw new Error(result.message);
    refreshActions();
    return {
      id: crypto.randomUUID(),
      title: "Page action confirmed",
      detail: result.message,
      source: "Current Workbench page",
      createdAt: new Date().toISOString(),
      data: { mode: "ui-command", actionKey },
    };
  };

  return (
    <aside
      className={`workbench-agent ${isOpen ? "is-open" : ""} ${isMinimized ? "is-minimized" : ""} ${
        dock === "rail" ? "is-docked" : ""
      }`}
      aria-label="Workbench Agent"
    >
      <button
        className="workbench-agent-launcher"
        type="button"
        onClick={openAgent}
        aria-label="Open Workbench Agent"
      >
        <Bot size={20} />
        <span>Agent</span>
      </button>

      {isOpen && (
        <section className="workbench-agent-panel" aria-label="Workbench Agent panel">
          <header className="workbench-agent-header">
            <div>
              <span className="workbench-agent-kicker">Workbench Agent</span>
              <strong>{currentDestination.label}</strong>
            </div>
            <div className="workbench-agent-header-actions">
              <button
                type="button"
                aria-label={
                  dock === "rail"
                    ? "Float the Workbench Agent over the page"
                    : "Dock the Workbench Agent to the right edge"
                }
                aria-pressed={dock === "rail"}
                title={dock === "rail" ? "Float this panel" : "Dock as a right rail"}
                onClick={() => setDock((value) => (value === "rail" ? "float" : "rail"))}
              >
                {dock === "rail" ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
              </button>
              <button
                type="button"
                aria-label={isMinimized ? "Expand Workbench Agent" : "Minimize Workbench Agent"}
                onClick={() => setIsMinimized((value) => !value)}
              >
                {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
              <button type="button" aria-label="Close Workbench Agent" onClick={closeAgent}>
                <X size={16} />
              </button>
            </div>
          </header>

          {!isMinimized && (
            <>
              <ConnectorStrip
                connectors={connectors}
                isLoading={isStatusLoading}
                onRetry={refreshConnectorStatus}
              />
              <div className="workbench-agent-status" role="status" aria-live="polite">
                {status === "thinking" || status === "using-tools" || status === "writing" ? (
                  <Loader2 size={15} className="workbench-agent-spin" />
                ) : (
                  <ShieldCheck size={15} />
                )}
                <span>{statusDetail || statusLabel(status)}</span>
              </div>

              {activities.length > 0 ? (
                <ActivityTrail activities={activities} />
              ) : (
                <div className="workbench-agent-activity-spacer" aria-hidden="true" />
              )}

              <div className="workbench-agent-log-region">
                <div
                  className="workbench-agent-log"
                  ref={logRef}
                  onScroll={onLogScroll}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                  aria-label="Workbench Agent conversation"
                >
                  {messages.length === 0 && (
                    <div className="workbench-agent-empty">
                      <Navigation size={22} />
                      <strong>Ask where to go or what needs checking.</strong>
                      <p>
                        I can explain the current page, move to a section, use visible controls, and
                        prepare review cards for anything that changes data.
                      </p>
                    </div>
                  )}
                  {messages.length > 0 && (
                    <span className="workbench-agent-trail-label">Action trail</span>
                  )}
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  {thinking && <ReasoningBlock text={thinking} isOpen={draft.length === 0} />}
                  {draft && (
                    <div className="workbench-agent-message agent">
                      <span>Writing</span>
                      <p>{draft}</p>
                    </div>
                  )}
                </div>
                {!isFollowing && messages.length > 0 && (
                  <button
                    type="button"
                    className="workbench-agent-jump"
                    onClick={() => scrollToLatest()}
                  >
                    <ChevronDown size={14} />
                    {hasUnreadBelow ? "New reply below" : "Jump to latest"}
                  </button>
                )}
              </div>

              {visibleReviews.length > 0 && (
                <section className="workbench-agent-review-tray" aria-label="Pending review cards">
                  {visibleReviews.map((review) => (
                    <ReviewCard key={review.id} review={review} onConfirm={confirmReview} />
                  ))}
                </section>
              )}

              {(notice || error) && (
                <div
                  className={`workbench-agent-notice ${error ? "is-error" : ""}`}
                  role={error ? "alert" : "status"}
                >
                  {error ? <AlertCircle size={15} /> : <Check size={15} />}
                  <span>{error || notice}</span>
                </div>
              )}

              <form
                className="workbench-agent-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={2}
                  aria-label="Ask the Workbench Agent"
                  placeholder="Ask for help, navigation, or a safe action"
                />
                <div className="workbench-agent-compose-actions">
                  <small>{actions.length} visible controls shared</small>
                  {status === "thinking" || status === "writing" || status === "using-tools" ? (
                    <button type="button" className="workbench-agent-stop" onClick={stop}>
                      <Square size={15} />
                      Stop
                    </button>
                  ) : (
                    <button type="submit" disabled={!input.trim()}>
                      <Send size={15} />
                      Send
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      )}
    </aside>
  );
}

function ConnectorStrip({
  connectors,
  isLoading,
  onRetry,
}: {
  connectors: ConnectorReadiness[];
  isLoading: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="workbench-agent-connectors" aria-label="Connection readiness">
      <div className="workbench-agent-connector-list">
        {connectors.map((connector) => (
          <span
            className={`connector-chip ${connector.status}`}
            key={connector.id}
            title={`${connector.detail}${connector.checkedAt ? ` Checked ${formatCheckedAt(connector.checkedAt)}.` : ""}`}
          >
            <PlugZap size={13} />
            <span>
              {connector.label}
              <small>
                {connector.checkedAt ? formatCheckedAt(connector.checkedAt) : connector.detail}
              </small>
            </span>
          </span>
        ))}
      </div>
      <button
        type="button"
        className="workbench-agent-status-retry"
        onClick={onRetry}
        disabled={isLoading}
        aria-label="Refresh connector status"
      >
        <RefreshCw size={13} className={isLoading ? "workbench-agent-spin" : undefined} />
        Retry
      </button>
    </section>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const [copied, setCopied] = useState(false);
  const copyMessage = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className={`workbench-agent-message ${message.role}`}>
      <div className="workbench-agent-message-heading">
        <span>
          {message.role === "user" ? "You" : message.role === "agent" ? "Agent" : "Notice"}
        </span>
        {message.role === "agent" && (
          <button type="button" onClick={() => void copyMessage()} aria-label="Copy agent response">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className="workbench-agent-rich-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {message.receipts?.map((receipt) => (
        <ReceiptCard key={receipt.id} receipt={receipt} />
      ))}
    </div>
  );
}

function ActivityTrail({ activities }: { activities: AgentActivityItem[] }) {
  const hasRunning = activities.some((activity) => activity.status === "running");
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (hasRunning) setOpen(true);
  }, [hasRunning]);
  return (
    <details
      className="workbench-agent-activity"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Sources and activity</span>
        <small>{activities.length} recorded</small>
      </summary>
      <ol>
        {activities.map((activity) => (
          <li key={activity.id} className={`is-${activity.status}`}>
            {activity.status === "running" ? (
              <Loader2 size={13} className="workbench-agent-spin" />
            ) : activity.status === "completed" ? (
              <Check size={13} />
            ) : (
              <AlertCircle size={13} />
            )}
            <span>
              <strong>{activity.label}</strong>
              <small>
                {activity.source}
                {activity.durationMs !== undefined
                  ? ` · ${formatDuration(activity.durationMs)}`
                  : ""}
              </small>
              {activity.detail && <em>{activity.detail}</em>}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function ReasoningBlock({ text, isOpen }: { text: string; isOpen: boolean }) {
  const [open, setOpen] = useState(isOpen);
  useEffect(() => setOpen(isOpen), [isOpen]);
  return (
    <div className="workbench-agent-reasoning">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Reasoning
      </button>
      {open && <p>{text}</p>}
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: AgentReceipt }) {
  return (
    <div className="workbench-agent-receipt">
      <ClipboardCheck size={15} />
      <div>
        <strong>{receipt.title}</strong>
        <p>{receipt.detail}</p>
        {receipt.source && <small>{receipt.source}</small>}
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  onConfirm,
}: {
  review: AgentReviewCard;
  onConfirm: (review: AgentReviewCard) => Promise<void>;
}) {
  return (
    <article className={`workbench-agent-review risk-${review.risk}`}>
      <div>
        <strong>{review.title}</strong>
        <p>{review.summary}</p>
      </div>
      {review.preview?.length ? (
        <ul>
          {previewItems(review.preview).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {review.target && <small>Target: {targetLabel(review.target)}</small>}
      <button type="button" onClick={() => void onConfirm(review)}>
        <Check size={15} />
        Confirm
      </button>
    </article>
  );
}

function statusLabel(status: WorkbenchAgentStatus) {
  if (status === "thinking") return "Thinking";
  if (status === "using-tools") return "Using approved tools";
  if (status === "writing") return "Writing response";
  if (status === "stopped") return "Stopped";
  if (status === "error") return "Needs attention";
  return "Ready";
}

function isWorkbenchPageActionCommand(command?: WorkbenchAgentCommand) {
  return command?.name === "workbench.page-action" || command?.mode === "ui-command";
}

function attachToLastAgentMessage(
  messages: AgentMessage[],
  patch: { receipts?: AgentReceipt[]; reviewCards?: AgentReviewCard[] }
): AgentMessage[] {
  let lastAgentIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "agent") {
      lastAgentIndex = index;
      break;
    }
  }
  if (lastAgentIndex === -1) {
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "agent",
        content: "I prepared a follow-up item.",
        createdAt: Date.now(),
        ...patch,
      },
    ];
  }
  return messages.map((message, index) =>
    index === lastAgentIndex
      ? {
          ...message,
          receipts: [...(message.receipts ?? []), ...(patch.receipts ?? [])],
          reviewCards: [...(message.reviewCards ?? []), ...(patch.reviewCards ?? [])],
        }
      : message
  );
}

function waitForRender() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function focusTarget(target: HTMLElement) {
  target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  return true;
}

function previewItems(preview: AgentReviewCard["preview"]) {
  if (!preview) return [];
  return Array.isArray(preview) ? preview : preview.split(/\r?\n/).filter(Boolean);
}

function targetLabel(target: NonNullable<AgentReviewCard["target"]>) {
  if (typeof target === "string") return target;
  return Object.entries(target)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

function scrollBehavior(): ScrollBehavior {
  // A hidden tab does not run the animation frames a smooth scroll needs, so the
  // scroll would silently never arrive. Jump straight there instead.
  if (document.hidden) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function openedNotice(label: string) {
  return `Opened ${label.replace(/[.!?]+$/, "")}.`;
}

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function upsertActivity(current: AgentActivityItem[], next: AgentActivityItem) {
  const index = current.findIndex((activity) => activity.id === next.id);
  if (index === -1) return [...current, next].slice(-24);
  return current.map((activity, activityIndex) =>
    activityIndex === index ? { ...activity, ...next } : activity
  );
}
