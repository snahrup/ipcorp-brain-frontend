import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  ArrowRight,
  Brain,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  GitBranch,
  ListChecks,
  LockKeyhole,
  type LucideIcon,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Search,
  ShieldCheck,
  Sparkles,
  Split,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import contextEngine from "./assets/context-engine.png";
import { AdminSettings } from "./components/AdminSettings";
import { DetailDrawer } from "./components/drawer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  ConfidenceBar,
  DrawerHeader,
  EmptyState,
  FilterSummary,
  InfoBlock,
  ListBlock,
  MetaGrid,
  MetaPill,
  ReasoningPreview,
  SectionHeader,
  StatusChip,
} from "./components/ui";
import { ViewHero } from "./components/ui/ViewHero";
import { ApprovalDock, WorkbenchHeader, WorkbenchSidebar } from "./components/workbench";
import { MobileTabBar } from "./components/workbench/MobileTabBar";
import {
  type ActionProposal,
  type Adr,
  type AdrCandidate,
  brain,
  type CortexInsight,
  type MeetingEntry,
  nextBestPacket,
  type OpenQuestion,
  openProposals,
  type PrepPacket,
  packetById,
  type Risk,
  type SourceHealthItem,
  sortedInsights,
} from "./data";
import { workbenchSnapshot } from "./data/workbench";
import { getAdminSettings } from "./lib/adminSettings";
import {
  createSearchIndex,
  filterByQuery,
  filterSearchResults,
  type SearchResult,
  type ViewKey,
} from "./lib/search";
import {
  clampText,
  compactNumber,
  formatDate,
  formatPriority,
  formatStatus,
  labelize,
  stripMarkdown,
  toneForStatus,
} from "./lib/utils";
import { viewCopy } from "./lib/viewConfig";
import type { Detail } from "./types/brain";
import type { ApprovalPreview } from "./types/workbench";
import { InsightsGraph } from "./views/InsightsGraph";
import { MeetingsView } from "./views/MeetingsView";
import { QuestionsView } from "./views/QuestionsView";
import { RisksView } from "./views/RisksView";
import { SourceHealthView } from "./views/SourceHealthView";
import {
  ConnectionsView,
  MeetingsWorkspaceView,
  TeamLibraryView,
  TodayView,
  WorkView,
} from "./views/workbench";

type NavItem = {
  key: ViewKey;
  label: string;
  helper: string;
  icon: LucideIcon;
  count?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const allMeetings = uniqueMeetings([
  ...brain.meetingIndex.upcoming,
  ...brain.meetingIndex.active,
  ...brain.meetingIndex.recent,
]);

const sourceHealthEntries = Object.entries(brain.status.sourceHealth ?? {}) as Array<
  [string, SourceHealthItem]
>;

const rawNavSections: NavSection[] = [
  {
    label: "Orient",
    items: [
      {
        key: "readiness",
        label: "Start Here",
        helper: "What needs attention now",
        icon: Brain,
      },
      {
        key: "meetings",
        label: "Meetings",
        helper: "Upcoming, active, recent signals",
        icon: CalendarDays,
        count: allMeetings.length,
      },
    ],
  },
  {
    label: "Prepare",
    items: [
      {
        key: "packets",
        label: "Prep Packets",
        helper: "Briefs ready to use in meetings",
        icon: FileCheck2,
        count: brain.prepPackets.length,
      },
      {
        key: "insights",
        label: "Insights",
        helper: "Synthesized patterns and reasoning",
        icon: Sparkles,
        count: brain.cortexInsights.length,
      },
    ],
  },
  {
    label: "Resolve",
    items: [
      {
        key: "actions",
        label: "Actions",
        helper: "Gated proposals and next moves",
        icon: ListChecks,
        count: brain.actionProposals.length,
      },
      {
        key: "questions",
        label: "Questions",
        helper: "Open asks, owners, and targets",
        icon: MessageSquareText,
        count: brain.openQuestions.length,
      },
      {
        key: "risks",
        label: "Risks",
        helper: "Exposure, severity, mitigation",
        icon: TriangleAlert,
        count: brain.risks.length,
      },
      {
        key: "decisions",
        label: "Decisions",
        helper: "ADRs and candidates",
        icon: GitBranch,
        count: brain.adrs.adrs.length + brain.adrs.candidates.length,
      },
    ],
  },
  {
    label: "Trust",
    items: [
      {
        key: "sources",
        label: "Source Health",
        helper: "Freshness, boundaries, redaction",
        icon: RadioTower,
        count: sourceHealthEntries.length,
      },
    ],
  },
];

// Apply admin visibility settings
const adminSettings = getAdminSettings();
const navSections = rawNavSections
  .filter((section) => !adminSettings.hiddenNavSections.includes(section.label))
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => !adminSettings.hiddenNavItems.includes(item.key)),
  }));

const learningCards = [
  {
    icon: FileCheck2,
    label: "Prep Packet",
    body: "A meeting-ready brief: current state, questions, risks, posture, and proof trail.",
  },
  {
    icon: Sparkles,
    label: "Cortex Insight",
    body: "A synthesized pattern with confidence, observations, connections, and a recommended next move.",
  },
  {
    icon: GitBranch,
    label: "ADR",
    body: "Architecture decision record. Use it when an architecture choice needs reviewable memory.",
  },
  {
    icon: ShieldCheck,
    label: "Stakeholder-safe",
    body: "The app shows curated artifacts only; raw captures, credentials, and private notes are excluded.",
  },
];

const LazyBrainExplorer = lazy(() => import("./features/brain-library/BrainExplorerRoute"));
const LazyDataWork = lazy(() => import("./features/data-work/DataWorkView"));

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("today");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(-1);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalPreview | null>(null);
  const reduceMotion = useReducedMotion();

  const searchIndex = useMemo(createSearchIndex, []);
  const searchResults = useMemo(
    () => filterSearchResults(searchIndex, query),
    [query, searchIndex]
  );

  const openDetail = (nextDetail: Detail) => setDetail(nextDetail);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (detail) setDetail(null);
        if (approvalPreview) setApprovalPreview(null);
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setIsAdminOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approvalPreview, detail]);

  const navigate = (view: ViewKey) => {
    setActiveView(view);
    setDetail(null);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ suggestLens?: string }>;
      if (customEvent.detail?.suggestLens) {
        setActiveView("insights");
      }
    };
    window.addEventListener("navigate-to-graph", handler);
    return () => window.removeEventListener("navigate-to-graph", handler);
  }, []);

  const openSearchResult = (result: SearchResult) => {
    setActiveView(result.view);
    setQuery("");
    setSearchSelectedIndex(-1);
    setDetail(result.detail ?? null);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!query.trim() || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchSelectedIndex((prev) => Math.min(prev + 1, Math.min(searchResults.length - 1, 7)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && searchSelectedIndex >= 0) {
      e.preventDefault();
      openSearchResult(searchResults[searchSelectedIndex]);
    } else if (e.key === "Escape") {
      setQuery("");
      setSearchSelectedIndex(-1);
    }
  };

  const focusMeetingInGraph = (meetingId: string) => {
    setActiveView("insights");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("focus-meeting-in-graph", { detail: { meetingId } }));
    }, 420);
  };

  const activeLabel = viewCopy[activeView].label;
  return (
    <div className={`wb-app ${sidebarOpen ? "nav-open" : "nav-collapsed"}`}>
      <WorkbenchSidebar
        activeView={activeView}
        expanded={sidebarOpen}
        onToggle={() => setSidebarOpen((value) => !value)}
        onNavigate={navigate}
      />

      <main className="wb-workspace">
        <WorkbenchHeader
          label={activeLabel}
          generatedAt={workbenchSnapshot.generatedAt}
          query={query}
          results={searchResults}
          selectedIndex={searchSelectedIndex}
          onQueryChange={(value) => {
            setQuery(value);
            setSearchSelectedIndex(-1);
          }}
          onSearchKeyDown={handleSearchKeyDown}
          onOpenResult={openSearchResult}
          onClear={() => {
            setQuery("");
            setSearchSelectedIndex(-1);
          }}
        />

        {/* mode="wait" holds the incoming view until the outgoing one reports its exit
            is complete. When a view owns async work that never settles, that report can
            fail to arrive and navigation deadlocks: the header and rail update but the
            page never changes. The entrance animation is what people actually see, so
            the outgoing view is simply replaced. */}
        <AnimatePresence initial={false}>
          <motion.section
            key={activeView}
            className="view-frame"
            initial={reduceMotion ? false : { opacity: 0, y: 18, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeView === "today" && <TodayView onOpenWork={() => navigate("work")} />}
            {activeView === "work" && (
              <WorkView
                items={workbenchSnapshot.workItems}
                lanes={workbenchSnapshot.lanes}
                onOpenDetail={openDetail}
                onPreview={setApprovalPreview}
              />
            )}
            {activeView === "meetings" && (
              <MeetingsWorkspaceView openDetail={openDetail} onFocusInGraph={focusMeetingInGraph} />
            )}
            {activeView === "library" && <TeamLibraryView />}
            {activeView === "connections" && (
              <ConnectionsView sources={workbenchSnapshot.sources} />
            )}
            {activeView === "data-work" && (
              <Suspense fallback={<LazyViewFallback label="Opening Data work" />}>
                <LazyDataWork />
              </Suspense>
            )}
            {activeView === "readiness" && (
              <ReadinessView openDetail={openDetail} navigate={navigate} />
            )}
            {activeView === "packets" && <PacketsView openDetail={openDetail} query={query} />}
            {activeView === "insights" && (
              <Suspense fallback={<LazyViewFallback label="Opening How things connect" />}>
                <LazyBrainExplorer />
              </Suspense>
            )}
            {activeView === "actions" && <ActionsView openDetail={openDetail} query={query} />}
            {activeView === "questions" && <QuestionsView openDetail={openDetail} query={query} />}
            {activeView === "risks" && <RisksView openDetail={openDetail} query={query} />}
            {activeView === "decisions" && <DecisionsView openDetail={openDetail} query={query} />}
            {activeView === "sources" && <SourceHealthView />}
          </motion.section>
        </AnimatePresence>
      </main>

      <MobileTabBar activeView={activeView} onNavigate={navigate} />

      <DetailDrawer detail={detail} onClose={() => setDetail(null)} />
      <ApprovalDock preview={approvalPreview} onClose={() => setApprovalPreview(null)} />
      <AdminSettings isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
    </div>
  );
}

function LazyViewFallback({ label }: { label: string }) {
  return (
    <div className="wb-page" role="status" aria-live="polite">
      <section className="wb-loading-card">
        <span className="wb-loading-dot" aria-hidden="true" />
        <div>
          <strong>{label}…</strong>
          <p>This optional area is loading without interrupting the daily Workbench.</p>
        </div>
      </section>
    </div>
  );
}

function Sidebar({
  activeView,
  isOpen,
  onToggle,
  onNavigate,
}: {
  activeView: ViewKey;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: (view: ViewKey) => void;
}) {
  const activeLabel = viewCopy[activeView].label;

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <button
        data-testid="sidebar-toggle"
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={isOpen ? "Collapse navigation" : "Expand navigation"}
      >
        {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>

      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <Brain size={22} />
        </div>
        {isOpen && (
          <div className="brand-copy">
            <strong>Context OS</strong>
            <span>IP Corporation Workbench</span>
          </div>
        )}
      </div>

      <div className="nav-position-card" aria-live="polite">
        <span className="mono-kicker">You are here</span>
        {isOpen ? <strong>{activeLabel}</strong> : <strong>{activeLabel.slice(0, 1)}</strong>}
      </div>

      <nav className="nav-list">
        {navSections.map((section) => (
          <div className="nav-section" key={section.label}>
            {isOpen && <span className="nav-section-label">{section.label}</span>}
            {section.items.map((item) => (
              <button
                className={`nav-item ${activeView === item.key ? "is-active" : ""}`}
                key={item.key}
                onClick={() => onNavigate(item.key)}
                title={`${item.label}: ${item.helper}`}
                data-testid={`nav-${item.key}`}
              >
                {activeView === item.key && (
                  <motion.span className="nav-active-bg" layoutId="nav-active-bg" />
                )}
                <item.icon size={20} />
                {isOpen && (
                  <span className="nav-item-copy">
                    <strong>{item.label}</strong>
                    <small>{item.helper}</small>
                  </span>
                )}
                {item.count !== undefined && (
                  <span className="nav-count">{compactNumber(item.count)}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <StatusChip
          label="Stakeholder-safe"
          tone="green"
          icon={<LockKeyhole size={13} />}
          compact={!isOpen}
        />
        {isOpen && <p>{brain.manifest.redactionPolicy}</p>}
      </div>
    </aside>
  );
}

function Topbar({
  activeView,
  query,
  results,
  onQueryChange,
  onOpenResult,
  onClear,
  searchSelectedIndex,
  onSearchKeyDown,
}: {
  activeView: ViewKey;
  query: string;
  results: SearchResult[];
  onQueryChange: (value: string) => void;
  onOpenResult: (result: SearchResult) => void;
  onClear: () => void;
  searchSelectedIndex: number;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const meta = viewCopy[activeView];

  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="mono-kicker">{meta.eyebrow}</span>
        <strong>{meta.label}</strong>
        <small>{meta.summary}</small>
      </div>

      <div className="global-search-wrap">
        <label className="search-box">
          <Search size={17} />
          <input
            data-testid="global-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onSearchKeyDown}
            aria-label="Search the entire architecture brain"
            placeholder="Search everything: packets, meetings, risks, ADRs..."
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={onClear}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </label>

        <AnimatePresence>
          {query.trim() && (
            <motion.div
              className="search-results-panel"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16 }}
            >
              <div className="search-results-head">
                <strong>{results.length ? `${results.length} results` : "No matches yet"}</strong>
                <span>Global search</span>
              </div>
              {results.length ? (
                <div className="search-result-list">
                  {results.slice(0, 8).map((result, index) => (
                    <button
                      key={result.id}
                      className={`search-result ${index === searchSelectedIndex ? "is-selected" : ""}`}
                      onClick={() => onOpenResult(result)}
                    >
                      <result.icon size={18} />
                      <span>
                        <strong>{result.title}</strong>
                        <small>
                          {result.kind} · {result.meta}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">
                  Try an owner, meeting title, system name, risk term, or ADR topic.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="topbar-chips">
        <StatusChip label={formatStatus(brain.status.freshnessLabel)} tone="amber" />
        <StatusChip label="Curated only" tone="green" icon={<ShieldCheck size={13} />} />
        <span
          className="last-updated"
          title={`Last synced: ${formatDate(brain.manifest.generatedAt)}`}
        >
          Updated {formatDate(brain.manifest.generatedAt)}
        </span>
      </div>
    </header>
  );
}

function ReadinessView({
  openDetail,
  navigate,
}: {
  openDetail: (detail: Detail) => void;
  navigate: (view: ViewKey) => void;
}) {
  const missing = brain.meetingIndex.missingOrStalePackets ?? [];
  const readinessItems = [
    {
      icon: CircleAlert,
      label: "Review evidence gap",
      body: missing[0]?.note ?? "No stale packet notes are currently flagged.",
      action: "Go to source health",
      onClick: () => navigate("sources"),
      tone: "warning",
    },
    {
      icon: FileCheck2,
      label: "Open next packet",
      body: nextBestPacket.summary,
      action: "Open packet",
      onClick: () => openDetail({ kind: "packet", value: nextBestPacket }),
      tone: "primary",
    },
    {
      icon: ListChecks,
      label: "Clear gated actions",
      body: `${openProposals.length} proposal${openProposals.length === 1 ? "" : "s"} require review before execution.`,
      action: "Review actions",
      onClick: () => navigate("actions"),
      tone: "success",
    },
  ];

  return (
    <div className="view-stack">
      <ViewHero view="readiness">
        <div className="readiness-hero-grid">
          <div className="hero-copy-card">
            <span className="mono-kicker">Start here</span>
            <h1>{viewCopy.readiness.title}</h1>
            <p>{viewCopy.readiness.summary}</p>
            <div className="hero-actions">
              <button
                data-testid="open-next-packet"
                className="primary-action"
                onClick={() => openDetail({ kind: "packet", value: nextBestPacket })}
              >
                Open next packet <ArrowRight size={17} />
              </button>
              <button className="ghost-action" onClick={() => navigate("meetings")}>
                View meeting signals
              </button>
            </div>
          </div>
          <ContextFlowCard />
        </div>
      </ViewHero>

      <section className="guided-strip" aria-label="Recommended next steps">
        {readinessItems.map((item, index) => (
          <motion.button
            className={`guided-card tone-${item.tone}`}
            key={item.label}
            onClick={item.onClick}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ y: -4 }}
          >
            <span className="step-index">0{index + 1}</span>
            <item.icon size={22} />
            <strong>{item.label}</strong>
            <p>{clampText(item.body, 150)}</p>
            <span className="card-cta">
              {item.action} <ArrowRight size={15} />
            </span>
          </motion.button>
        ))}
      </section>

      <section className="metric-grid" aria-label="Brain inventory">
        <MetricCard
          icon={FileCheck2}
          label="Prep packets"
          value={brain.prepPackets.length}
          helper="Meeting-ready briefs"
          tone="amber"
        />
        <MetricCard
          icon={Sparkles}
          label="Insights"
          value={brain.cortexInsights.length}
          helper="Reasoning trails"
          tone="sky"
        />
        <MetricCard
          icon={ListChecks}
          label="Open proposals"
          value={openProposals.length}
          helper="Need review"
          tone="green"
        />
        <MetricCard
          icon={MessageSquareText}
          label="Questions"
          value={brain.openQuestions.length}
          helper="Owner-tracked asks"
          tone="violet"
        />
        <MetricCard
          icon={TriangleAlert}
          label="Risks"
          value={brain.risks.length}
          helper="Active exposure"
          tone="orange"
        />
        <MetricCard
          icon={RadioTower}
          label="Sources"
          value={sourceHealthEntries.length}
          helper="Health lanes"
          tone="blue"
        />
      </section>

      <section className="two-column-grid">
        <article className="glass-card next-packet-card">
          <SectionHeader
            eyebrow="Next best packet"
            title={nextBestPacket.title}
            icon={FileCheck2}
          />
          <p>{nextBestPacket.summary}</p>
          <div className="packet-health-row">
            <MetaPill label="Questions" value={String(nextBestPacket.openQuestions?.length ?? 0)} />
            <MetaPill label="Risks" value={String(nextBestPacket.risks?.length ?? 0)} />
            <MetaPill
              label="Evidence refs"
              value={String(nextBestPacket.evidenceRefs?.length ?? 0)}
            />
          </div>
          <button
            className="primary-action small"
            onClick={() => openDetail({ kind: "packet", value: nextBestPacket })}
          >
            Open the brief <ArrowRight size={16} />
          </button>
        </article>

        <article className="glass-card explain-card">
          <SectionHeader eyebrow="What means what" title="Plain-English guide" icon={Brain} />
          <div className="definition-grid">
            {learningCards.map((card) => (
              <DefinitionCard key={card.label} {...card} />
            ))}
          </div>
        </article>
      </section>

      <section className="two-column-grid align-start">
        <LatestInsightCard openDetail={openDetail} />
        <MeetingSignalsCard openDetail={openDetail} />
      </section>
    </div>
  );
}

function ContextFlowCard() {
  const flow = [
    { label: "Capture", icon: RadioTower, text: "Teams, Natively, Cluely, memory" },
    { label: "Synthesize", icon: Workflow, text: "Connections, gaps, reasoning" },
    { label: "Prepare", icon: FileCheck2, text: "Packets, posture, talking points" },
    { label: "Decide", icon: GitBranch, text: "ADRs, actions, follow-up" },
  ];

  return (
    <article className="context-flow-card" aria-label="How this app flows">
      <div className="context-image" style={{ backgroundImage: `url(${contextEngine})` }} />
      <div className="flow-card-header">
        <StatusChip label={formatStatus(brain.status.freshnessLabel)} tone="amber" />
        <StatusChip label="No raw transcript text" tone="green" icon={<ShieldCheck size={13} />} />
      </div>
      <div className="flow-steps">
        {flow.map((step, index) => (
          <motion.div
            className="flow-step"
            key={step.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <span>{index + 1}</span>
            <step.icon size={18} />
            <strong>{step.label}</strong>
            <small>{step.text}</small>
          </motion.div>
        ))}
      </div>
    </article>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  helper: string;
  tone: string;
}) {
  return (
    <motion.article className={`metric-card tone-${tone}`} whileHover={{ y: -3 }}>
      <Icon size={21} />
      <div>
        <strong>{compactNumber(value)}</strong>
        <span>{label}</span>
      </div>
      <small>{helper}</small>
    </motion.article>
  );
}

function DefinitionCard({
  icon: Icon,
  label,
  body,
}: {
  icon: LucideIcon;
  label: string;
  body: string;
}) {
  return (
    <div className="definition-card">
      <Icon size={18} />
      <strong>{label}</strong>
      <p>{body}</p>
    </div>
  );
}

function LatestInsightCard({ openDetail }: { openDetail: (detail: Detail) => void }) {
  const insight = sortedInsights[0];
  if (!insight) return null;

  return (
    <article className="glass-card insight-feature-card">
      <SectionHeader eyebrow="Latest insight" title={insight.title} icon={Sparkles} />
      <ConfidenceBar value={insight.confidence} />
      <p>{insight.summary}</p>
      <ReasoningPreview insight={insight} />
      <button
        className="ghost-action"
        onClick={() => openDetail({ kind: "insight", value: insight })}
      >
        Open reasoning trail <ArrowRight size={16} />
      </button>
    </article>
  );
}

function MeetingSignalsCard({ openDetail }: { openDetail: (detail: Detail) => void }) {
  const meetings = brain.meetingIndex.recent.slice(0, 4);

  return (
    <article className="glass-card signal-card">
      <SectionHeader eyebrow="Recent evidence stream" title="Meeting signals" icon={Clock3} />
      <div className="signal-list">
        {meetings.map((meeting) => (
          <button
            className="signal-row"
            key={`${meeting.id ?? meeting.title}-${meeting.date ?? meeting.startsAt ?? "no-date"}`}
            onClick={() => openDetail({ kind: "meeting", value: meeting })}
          >
            <span className="signal-dot" />
            <span>
              <strong>{meeting.title}</strong>
              <small>
                {formatDate(meeting.startsAt ?? meeting.date)} ·{" "}
                {formatStatus(meeting.readinessStatus)}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </article>
  );
}

// Old monolithic Meetings/MeetingColumn code fully removed (moved to src/views/MeetingsView.tsx).

function PacketsView({
  openDetail,
  query,
}: {
  openDetail: (detail: Detail) => void;
  query: string;
}) {
  const packets = useMemo(
    () =>
      filterByQuery(brain.prepPackets, query, (packet) => [
        packet.title,
        packet.summary,
        packet.suggestedPosture,
        ...(packet.relatedWork ?? []),
        ...(packet.openQuestions ?? []),
      ]),
    [query]
  );

  return (
    <div className="view-stack">
      <ViewHero view="packets" />
      <FilterSummary
        query={query}
        count={packets.length}
        total={brain.prepPackets.length}
        noun="packets"
      />
      <section className="packet-grid">
        {packets.map((packet, index) => (
          <motion.article
            className="glass-card packet-card"
            key={packet.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
          >
            <div className="packet-card-header">
              <StatusChip
                label={packet.startsAt ? formatDate(packet.startsAt) : "Date not set"}
                tone="neutral"
                icon={<CalendarDays size={13} />}
              />
              <button
                className="icon-button"
                onClick={() => openDetail({ kind: "packet", value: packet })}
                aria-label={`Open ${packet.title}`}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <h2>{packet.title}</h2>
            <p>{clampText(packet.summary, 210)}</p>
            <div className="packet-health-row">
              <MetaPill label="Questions" value={String(packet.openQuestions?.length ?? 0)} />
              <MetaPill label="Risks" value={String(packet.risks?.length ?? 0)} />
              <MetaPill label="Evidence" value={String(packet.evidenceRefs?.length ?? 0)} />
            </div>
            {packet.suggestedPosture && (
              <div className="posture-box">
                <span className="mono-kicker">Suggested posture</span>
                <p>{clampText(packet.suggestedPosture, 160)}</p>
              </div>
            )}
          </motion.article>
        ))}
      </section>
    </div>
  );
}

function InsightsView({
  openDetail,
  query,
}: {
  openDetail: (detail: Detail) => void;
  query: string;
}) {
  const [mode, setMode] = useState<"list" | "graph">("graph");

  const insights = useMemo(
    () =>
      filterByQuery(sortedInsights, query, (insight) => [
        insight.title,
        insight.summary,
        insight.type,
        ...(insight.tags ?? []),
        insight.recommendedAction,
      ]),
    [query]
  );

  return (
    <div className="view-stack">
      <ViewHero view="insights" />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <FilterSummary
          query={query}
          count={insights.length}
          total={sortedInsights.length}
          noun="insights"
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-pill)",
            padding: 3,
          }}
        >
          <button
            onClick={() => setMode("graph")}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: mode === "graph" ? "var(--accent-dim)" : "transparent",
              color: mode === "graph" ? "var(--accent)" : "var(--muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Knowledge Graph
          </button>
          <button
            onClick={() => setMode("list")}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: mode === "list" ? "var(--accent-dim)" : "transparent",
              color: mode === "list" ? "var(--accent)" : "var(--muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            List
          </button>
        </div>
      </div>

      {mode === "graph" ? (
        <InsightsGraph
          onSelectInsight={(insight) => openDetail({ kind: "insight", value: insight })}
        />
      ) : (
        <section className="insight-layout">
          {insights[0] && (
            <article className="glass-card insight-lead">
              <SectionHeader eyebrow="Highest recency" title={insights[0].title} icon={Sparkles} />
              <ConfidenceBar value={insights[0].confidence} />
              <p>{insights[0].summary}</p>
              <ReasoningPreview insight={insights[0]} />
              <button
                className="primary-action small"
                onClick={() => openDetail({ kind: "insight", value: insights[0] })}
              >
                Inspect insight <ArrowRight size={16} />
              </button>
            </article>
          )}
          <div className="insight-list">
            {insights.map((insight, index) => (
              <motion.button
                className="insight-row"
                key={insight.id}
                onClick={() => openDetail({ kind: "insight", value: insight })}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.025 }}
              >
                <span className="insight-type">
                  <Sparkles size={16} /> {labelize(insight.type)}
                </span>
                <span className="insight-copy">
                  <strong>{insight.title}</strong>
                  <small>
                    {formatDate(insight.createdAt)} · {Math.round(insight.confidence * 100)}%
                    confidence
                  </small>
                </span>
                <ChevronRight size={17} />
              </motion.button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ActionsView({
  openDetail,
  query,
}: {
  openDetail: (detail: Detail) => void;
  query: string;
}) {
  const proposals = useMemo(
    () =>
      filterByQuery(brain.actionProposals, query, (proposal) => [
        proposal.title,
        proposal.status,
        proposal.type,
        proposal.proposal?.suggestedAction,
        proposal.proposal?.whyNow,
        proposal.risk?.notes,
        ...(proposal.tags ?? []),
      ]),
    [query]
  );
  const gated = proposals.filter(
    (proposal) => proposal.approval?.required || proposal.status === "proposed"
  );
  const remaining = proposals.filter((proposal) => !gated.includes(proposal));

  return (
    <div className="view-stack">
      <ViewHero view="actions" />
      <FilterSummary
        query={query}
        count={proposals.length}
        total={brain.actionProposals.length}
        noun="actions"
      />
      <section className="action-layout">
        <ActionLane
          title="Review before execution"
          helper="These items need a human yes/no or wording review."
          proposals={gated}
          openDetail={openDetail}
          tone="amber"
        />
        <ActionLane
          title="Other proposals"
          helper="Useful context, lower urgency, or already handled."
          proposals={remaining}
          openDetail={openDetail}
          tone="green"
        />
      </section>
    </div>
  );
}

function ActionLane({
  title,
  helper,
  proposals,
  openDetail,
  tone,
}: {
  title: string;
  helper: string;
  proposals: ActionProposal[];
  openDetail: (detail: Detail) => void;
  tone: string;
}) {
  return (
    <article className={`glass-card action-lane tone-${tone}`}>
      <div className="column-heading">
        <span className="mono-kicker">{proposals.length} items</span>
        <h2>{title}</h2>
        <p>{helper}</p>
      </div>
      <div className="action-list">
        {proposals.length ? (
          proposals.map((proposal, index) => (
            <motion.button
              className="action-card"
              key={proposal.id}
              onClick={() => openDetail({ kind: "proposal", value: proposal })}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035 }}
            >
              <div className="card-topline">
                <StatusChip
                  label={formatStatus(proposal.status)}
                  tone={toneForStatus(proposal.status)}
                />
                {proposal.risk?.level && (
                  <StatusChip label={`Risk: ${proposal.risk.level}`} tone="orange" />
                )}
              </div>
              <strong>{proposal.title}</strong>
              <p>
                {clampText(proposal.proposal?.suggestedAction ?? proposal.proposal?.whyNow, 150)}
              </p>
              {proposal.approval?.required && (
                <small>
                  Approval required: {proposal.approval.reason ?? "Reason not captured"}
                </small>
              )}
            </motion.button>
          ))
        ) : (
          <EmptyState message="No actions in this lane." />
        )}
      </div>
    </article>
  );
}

function DecisionsView({
  openDetail,
  query,
}: {
  openDetail: (detail: Detail) => void;
  query: string;
}) {
  const adrs = useMemo(
    () =>
      filterByQuery(brain.adrs.adrs, query, (adr) => [
        adr.title,
        adr.status,
        adr.decider,
        adr.date,
        adr.supersedes,
      ]),
    [query]
  );
  const candidates = useMemo(
    () =>
      filterByQuery(brain.adrs.candidates, query, (candidate) => [
        candidate.topic,
        candidate.status,
        candidate.source,
        candidate.dateFlagged,
      ]),
    [query]
  );

  return (
    <div className="view-stack">
      <ViewHero view="decisions" />
      <FilterSummary
        query={query}
        count={adrs.length + candidates.length}
        total={brain.adrs.adrs.length + brain.adrs.candidates.length}
        noun="decisions"
      />
      <section className="decision-layout">
        <article className="glass-card decision-register">
          <SectionHeader
            eyebrow="Architecture decision records"
            title="Proposed ADRs"
            icon={GitBranch}
          />
          <div className="decision-list">
            {adrs.map((adr) => (
              <button
                className="decision-card"
                key={adr.number}
                onClick={() =>
                  openDetail({ kind: "adr", value: adr, label: `ADR-${adr.number.slice(-4)}` })
                }
              >
                <span className="decision-number">ADR-{adr.number.slice(-4)}</span>
                <strong>{adr.title}</strong>
                <small>
                  {formatStatus(adr.status)} · {adr.decider} · {formatDate(adr.date)}
                </small>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </article>
        <article className="glass-card decision-register">
          <SectionHeader eyebrow="Possible future decisions" title="ADR candidates" icon={Split} />
          <div className="decision-list">
            {candidates.map((candidate) => (
              <button
                className="decision-card"
                key={`${candidate.dateFlagged}-${candidate.topic}`}
                onClick={() =>
                  openDetail({ kind: "adr", value: candidate, label: "ADR candidate" })
                }
              >
                <span className="decision-number">Candidate</span>
                <strong>{stripMarkdown(candidate.topic)}</strong>
                <small>
                  {formatStatus(candidate.status)} · {formatDate(candidate.dateFlagged)}
                </small>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function MeetingDetail({ meeting }: { meeting: MeetingEntry }) {
  const linkedPacket = getLinkedPacket(meeting);

  return (
    <div className="drawer-stack">
      <DrawerHeader
        icon={CalendarDays}
        eyebrow={formatDate(meeting.startsAt ?? meeting.date)}
        title={meeting.title}
      />
      <div className="drawer-hero-strip">
        <StatusChip
          label={formatStatus(meeting.readinessStatus)}
          tone={toneForStatus(meeting.readinessStatus)}
        />
        {linkedPacket && (
          <StatusChip label="Linked packet" tone="green" icon={<FileCheck2 size={13} />} />
        )}
      </div>
      <InfoBlock title="Why now" body={meeting.whyNow} />
      <ListBlock title="Feeds packets" items={meeting.feedsPackets} monospace />
      <ListBlock title="Feeds insights" items={meeting.feedsInsights} monospace />
      {linkedPacket && (
        <div className="nested-card">
          <span className="mono-kicker">Linked packet</span>
          <h3>{linkedPacket.title}</h3>
          <p>{clampText(linkedPacket.summary, 220)}</p>
        </div>
      )}
      <ListBlock
        title="Evidence refs"
        items={[meeting.source, meeting.packet].filter(Boolean) as string[]}
        monospace
      />
    </div>
  );
}

function AdrDetail({ adr, label }: { adr: Adr | AdrCandidate; label: string }) {
  const isAdr = "number" in adr;

  return (
    <div className="drawer-stack">
      <DrawerHeader
        icon={GitBranch}
        eyebrow={label}
        title={isAdr ? adr.title : stripMarkdown(adr.topic)}
      />
      {isAdr ? (
        <MetaGrid
          items={[
            ["Status", formatStatus(adr.status)],
            ["Date", formatDate(adr.date)],
            ["Decider", adr.decider],
            ["Supersedes", adr.supersedes ?? "None"],
          ]}
        />
      ) : (
        <MetaGrid
          items={[
            ["Status", formatStatus(adr.status)],
            ["Date flagged", formatDate(adr.dateFlagged)],
            ["Source", adr.source],
          ]}
        />
      )}
    </div>
  );
}

function uniqueMeetings(meetings: MeetingEntry[]) {
  const seen = new Set<string>();
  return meetings.filter((meeting) => {
    const key = meeting.id ?? `${meeting.title}-${meeting.startsAt ?? meeting.date ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getLinkedPacket(meeting: MeetingEntry) {
  if (!meeting.packet) return undefined;
  const id = meeting.packet.replace("prep-packets/", "").replace(".packet.json", "");
  return packetById.get(id);
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});
}
