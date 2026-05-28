import {
  Activity,
  Archive,
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  DatabaseZap,
  FileCheck2,
  FileText,
  Gauge,
  GitBranch,
  Layers3,
  ListChecks,
  LockKeyhole,
  MessageSquareText,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Search,
  ShieldCheck,
  Sparkles,
  Split,
  TriangleAlert,
  Workflow,
  Zap
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ReactNode, useMemo, useState } from "react";
import contextEngine from "./assets/context-engine.png";
import {
  ActionProposal,
  Adr,
  AdrCandidate,
  CortexInsight,
  MeetingEntry,
  OpenQuestion,
  PrepPacket,
  Risk,
  brain,
  clampText,
  compactNumber,
  formatDate,
  labelize,
  nextBestPacket,
  openProposals,
  packetById,
  sortedInsights
} from "./data";

type ViewKey =
  | "readiness"
  | "meetings"
  | "packets"
  | "insights"
  | "actions"
  | "questions"
  | "risks"
  | "decisions"
  | "sources";

type Detail =
  | { kind: "packet"; value: PrepPacket }
  | { kind: "insight"; value: CortexInsight }
  | { kind: "proposal"; value: ActionProposal }
  | { kind: "question"; value: OpenQuestion }
  | { kind: "risk"; value: Risk }
  | { kind: "adr"; value: Adr | AdrCandidate; label: string }
  | { kind: "meeting"; value: MeetingEntry };

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Brain }> = [
  { key: "readiness", label: "Readiness", icon: Brain },
  { key: "meetings", label: "Meetings", icon: CalendarDays },
  { key: "packets", label: "Prep Packets", icon: FileCheck2 },
  { key: "insights", label: "Cortex Insights", icon: Sparkles },
  { key: "actions", label: "Actions", icon: ListChecks },
  { key: "questions", label: "Open Questions", icon: MessageSquareText },
  { key: "risks", label: "Risks", icon: TriangleAlert },
  { key: "decisions", label: "Decisions", icon: GitBranch },
  { key: "sources", label: "Source Health", icon: RadioTower }
];

const countCards = [
  { label: "Prep Packets", value: brain.manifest.counts.prepPackets, tone: "amber", icon: FileCheck2 },
  { label: "Cortex Insights", value: brain.manifest.counts.cortexInsights, tone: "sky", icon: Sparkles },
  { label: "Action Proposals", value: brain.manifest.counts.actionProposals, tone: "mint", icon: ListChecks },
  { label: "Open Questions", value: brain.manifest.counts.openQuestions, tone: "violet", icon: MessageSquareText },
  { label: "Active Risks", value: brain.manifest.counts.risks, tone: "orange", icon: TriangleAlert },
  { label: "Proposed ADRs", value: brain.manifest.counts.adrs, tone: "indigo", icon: GitBranch }
];

const latestInsight = sortedInsights[0];

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("readiness");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const reduceMotion = useReducedMotion();

  const filteredPackets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return brain.prepPackets;
    return brain.prepPackets.filter((packet) =>
      [packet.title, packet.summary, packet.suggestedPosture, ...(packet.relatedWork ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  const filteredInsights = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sortedInsights;
    return sortedInsights.filter((insight) =>
      [insight.title, insight.summary, insight.type, ...(insight.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  const showDetail = (nextDetail: Detail) => setDetail(nextDetail);

  return (
    <div className="app-shell">
      <AmbientCanvas reduceMotion={Boolean(reduceMotion)} />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-closed"}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((value) => !value)}
          aria-label={sidebarOpen ? "Collapse navigation" : "Expand navigation"}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Brain size={22} />
          </div>
          {sidebarOpen && (
            <div>
              <strong>Context OS</strong>
              <span>IP Corp Architecture</span>
            </div>
          )}
        </div>
        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activeView === item.key ? "is-active" : ""}`}
              key={item.key}
              onClick={() => setActiveView(item.key)}
              title={item.label}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <StatusDot label="Stakeholder-safe draft" tone="mint" compact={!sidebarOpen} />
          {sidebarOpen && (
            <p>
              Curated surface only. Raw captures, credentials, and internal agent rules stay out of
              this app.
            </p>
          )}
        </div>
      </aside>

      <main className="workspace">
        <Topbar query={query} setQuery={setQuery} />
        <AnimatePresence mode="wait">
          <motion.section
            key={activeView}
            initial={reduceMotion ? false : { opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: "blur(8px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="view-frame"
          >
            {activeView === "readiness" && <ReadinessView showDetail={showDetail} />}
            {activeView === "meetings" && <MeetingsView showDetail={showDetail} />}
            {activeView === "packets" && (
              <PacketsView packets={filteredPackets} showDetail={showDetail} />
            )}
            {activeView === "insights" && (
              <InsightsView insights={filteredInsights} showDetail={showDetail} />
            )}
            {activeView === "actions" && <ActionsView showDetail={showDetail} />}
            {activeView === "questions" && <QuestionsView showDetail={showDetail} />}
            {activeView === "risks" && <RisksView showDetail={showDetail} />}
            {activeView === "decisions" && <DecisionsView showDetail={showDetail} />}
            {activeView === "sources" && <SourceHealthView />}
          </motion.section>
        </AnimatePresence>
      </main>

      <DetailDrawer detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function Topbar({
  query,
  setQuery
}: {
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="mono-kicker">Architecture Brain</span>
        <strong>IP Corp Brain</strong>
      </div>
      <div className="search-box">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search packets, insights, risks..."
        />
      </div>
      <div className="topbar-chips">
        <StatusDot label={brain.status.freshnessLabel} tone="amber" />
        <StatusDot label="Stakeholder-safe draft" tone="mint" icon={<LockKeyhole size={13} />} />
      </div>
    </header>
  );
}

function ReadinessView({ showDetail }: { showDetail: (detail: Detail) => void }) {
  const missing = brain.meetingIndex.missingOrStalePackets ?? [];
  const latestMeetings = brain.meetingIndex.recent.slice(0, 4);

  return (
    <div className="view-stack">
      <section className="hero-grid">
        <div className="hero-panel">
          <div className="hero-text">
            <div className="hero-chips">
              <StatusDot label={brain.status.freshnessLabel} tone="amber" />
              <StatusDot label="Stakeholder-safe draft" tone="mint" icon={<ShieldCheck size={13} />} />
            </div>
            <h1>Brain Readiness Workspace</h1>
            <p>
              A calm operating surface for the IP Corp engagement: what is current, what needs
              review, what evidence supports it, and which packet is ready next.
            </p>
          </div>
          <ContextSignalMap />
        </div>
        <div className="next-panel">
          <span className="mono-kicker">Next Best Packet</span>
          <h2>{nextBestPacket.title}</h2>
          <p>{nextBestPacket.summary}</p>
          <button
            className="primary-action"
            onClick={() => showDetail({ kind: "packet", value: nextBestPacket })}
          >
            Open prep packet <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <section className="count-ribbon" aria-label="Brain snapshot">
        {countCards.map((card) => (
          <motion.button
            className={`count-pill tone-${card.tone}`}
            key={card.label}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            <card.icon size={22} />
            <strong>{compactNumber(card.value)}</strong>
            <span>{card.label}</span>
          </motion.button>
        ))}
      </section>

      <section className="content-grid">
        <PacketAssemblyCard packet={nextBestPacket} showDetail={showDetail} />
        <AttentionColumn missing={missing} showDetail={showDetail} />
      </section>

      <section className="content-grid lower-grid">
        <InsightPreview insight={latestInsight} showDetail={showDetail} />
        <TimelinePanel meetings={latestMeetings} showDetail={showDetail} />
      </section>
    </div>
  );
}

function ContextSignalMap() {
  const sources = ["Teams", "Cluely", "Notion", "Project Memory", "Natively", "Outcomes"];
  return (
    <div className="signal-map" aria-label="Context source flow">
      <div className="signal-image" style={{ backgroundImage: `url(${contextEngine})` }} />
      <div className="signal-core">
        <Sparkles size={24} />
        <span>Synthesis</span>
      </div>
      {sources.map((source, index) => (
        <motion.div
          className={`source-orb source-${index}`}
          key={source}
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.08, duration: 0.5 }}
        >
          {source}
        </motion.div>
      ))}
      <div className="flow-line line-a" />
      <div className="flow-line line-b" />
      <div className="flow-line line-c" />
    </div>
  );
}

function PacketAssemblyCard({
  packet,
  showDetail
}: {
  packet: PrepPacket;
  showDetail: (detail: Detail) => void;
}) {
  const strands = [
    { label: "Meetings", value: `${packet.relatedPriorMeetings?.length ?? 3} refs`, icon: CalendarDays },
    { label: "Risks", value: `${packet.risks?.length ?? 0} active`, icon: TriangleAlert },
    { label: "Questions", value: `${packet.openQuestions?.length ?? 0} open`, icon: MessageSquareText },
    { label: "Evidence", value: `${packet.evidenceRefs?.length ?? 0} refs`, icon: FileText }
  ];

  return (
    <article className="glass-card assembly-card">
      <div className="section-heading">
        <div>
          <span className="mono-kicker">Assembled Packet</span>
          <h2>{packet.title}</h2>
        </div>
        <button className="icon-button" onClick={() => showDetail({ kind: "packet", value: packet })}>
          <ChevronRight size={19} />
        </button>
      </div>
      <div className="assembly-flow">
        <div className="strand-list">
          {strands.map((strand, index) => (
            <motion.div
              className="strand"
              key={strand.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.07 }}
            >
              <strand.icon size={17} />
              <span>{strand.label}</span>
              <strong>{strand.value}</strong>
            </motion.div>
          ))}
        </div>
        <div className="synthesis-node">
          <Workflow size={28} />
          <span>Context synthesis</span>
        </div>
        <div className="packet-node">
          <FileCheck2 size={22} />
          <span>Live-ready packet</span>
        </div>
      </div>
      <div className="proof-list">
        {(packet.currentState ?? []).slice(0, 3).map((state) => (
          <div className="proof-row" key={state}>
            <CheckCircle2 size={18} />
            <span>{state}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function AttentionColumn({
  missing,
  showDetail
}: {
  missing: NonNullable<typeof brain.meetingIndex.missingOrStalePackets>;
  showDetail: (detail: Detail) => void;
}) {
  return (
    <aside className="attention-column">
      <article className="glass-card attention-card">
        <span className="mono-kicker amber-dot">Needs Attention</span>
        <h3>{missing[0]?.id === "plant-tour-follow-up-2026-05-27" ? "Plant-tour evidence gap" : "Open evidence gap"}</h3>
        <p>{missing[0]?.note ?? "No stale packet notes were found."}</p>
        <div className="mini-proof">{missing[0]?.source}</div>
      </article>
      <article className="glass-card governance-card">
        <div className="section-heading compact">
          <div>
            <span className="mono-kicker">Decisions Needing Review</span>
            <h3>{brain.manifest.counts.adrs} proposed ADRs</h3>
          </div>
          <GitBranch size={25} />
        </div>
        {brain.adrs.adrs.slice(-3).map((adr) => (
          <button
            className="decision-row"
            key={adr.number}
            onClick={() => showDetail({ kind: "adr", value: adr, label: `ADR-${adr.number.slice(-4)}` })}
          >
            <span>ADR-{adr.number.slice(-4)}</span>
            <strong>{adr.title}</strong>
            <small>{adr.status}</small>
          </button>
        ))}
      </article>
      <article className="glass-card proposal-card">
        <span className="mono-kicker">Approval Queue</span>
        {openProposals.map((proposal) => (
          <button
            key={proposal.id}
            className="proposal-link"
            onClick={() => showDetail({ kind: "proposal", value: proposal })}
          >
            <Zap size={16} />
            <span>{proposal.title}</span>
          </button>
        ))}
      </article>
    </aside>
  );
}

function InsightPreview({
  insight,
  showDetail
}: {
  insight: CortexInsight;
  showDetail: (detail: Detail) => void;
}) {
  return (
    <article className="glass-card insight-preview">
      <div className="section-heading">
        <div>
          <span className="mono-kicker">Featured Cortex Insight</span>
          <h2>{insight.title}</h2>
        </div>
        <ConfidenceDial value={insight.confidence} />
      </div>
      <p>{insight.summary}</p>
      <ReasoningSteps insight={insight} compact />
      <button className="ghost-action" onClick={() => showDetail({ kind: "insight", value: insight })}>
        Open reasoning trail <ArrowRight size={16} />
      </button>
    </article>
  );
}

function TimelinePanel({
  meetings,
  showDetail
}: {
  meetings: MeetingEntry[];
  showDetail: (detail: Detail) => void;
}) {
  return (
    <article className="glass-card timeline-panel">
      <div className="section-heading compact">
        <div>
          <span className="mono-kicker">Recent Evidence Stream</span>
          <h3>Meeting signals</h3>
        </div>
        <Clock3 size={20} />
      </div>
      <div className="timeline-list">
        {meetings.map((meeting) => (
          <button
            className="timeline-item"
            key={`${meeting.title}-${meeting.date ?? meeting.startsAt}`}
            onClick={() => showDetail({ kind: "meeting", value: meeting })}
          >
            <span>{formatDate(meeting.date ?? meeting.startsAt)}</span>
            <strong>{meeting.title}</strong>
            <small>{meeting.readinessStatus}</small>
          </button>
        ))}
      </div>
    </article>
  );
}

function MeetingsView({ showDetail }: { showDetail: (detail: Detail) => void }) {
  return (
    <ViewScaffold
      eyebrow="Meetings"
      title="Readiness by meeting"
      summary="Upcoming, active, and recent meeting signals with packet links and missing post-capture evidence."
    >
      <div className="three-column">
        <MeetingColumn title="Upcoming" meetings={brain.meetingIndex.upcoming} showDetail={showDetail} />
        <MeetingColumn title="Active" meetings={brain.meetingIndex.active} showDetail={showDetail} empty="No active meeting is currently indexed." />
        <MeetingColumn title="Recent" meetings={brain.meetingIndex.recent} showDetail={showDetail} />
      </div>
    </ViewScaffold>
  );
}

function MeetingColumn({
  title,
  meetings,
  showDetail,
  empty = "No meetings found."
}: {
  title: string;
  meetings: MeetingEntry[];
  showDetail: (detail: Detail) => void;
  empty?: string;
}) {
  return (
    <section className="glass-card column-card">
      <div className="section-heading compact">
        <h3>{title}</h3>
        <span className="count-badge">{meetings.length}</span>
      </div>
      {meetings.length === 0 ? (
        <p className="muted-copy">{empty}</p>
      ) : (
        meetings.map((meeting) => (
          <button
            className="stacked-row"
            key={`${title}-${meeting.title}-${meeting.date ?? meeting.startsAt}`}
            onClick={() => showDetail({ kind: "meeting", value: meeting })}
          >
            <span>{formatDate(meeting.startsAt ?? meeting.date)}</span>
            <strong>{meeting.title}</strong>
            <small>{meeting.readinessStatus}</small>
            {meeting.packet && <em>{meeting.packet}</em>}
          </button>
        ))
      )}
    </section>
  );
}

function PacketsView({
  packets,
  showDetail
}: {
  packets: PrepPacket[];
  showDetail: (detail: Detail) => void;
}) {
  return (
    <ViewScaffold
      eyebrow="Prep Packets"
      title="Meeting packets assembled from context"
      summary="Each packet keeps posture, talking points, open commitments, risks, and evidence refs in one reviewable surface."
    >
      <div className="packet-grid">
        {packets.map((packet) => (
          <motion.button
            className="packet-card glass-card"
            key={packet.id}
            onClick={() => showDetail({ kind: "packet", value: packet })}
            whileHover={{ y: -4 }}
          >
            <span className="mono-kicker">{formatDate(packet.startsAt)}</span>
            <h3>{packet.title}</h3>
            <p>{clampText(packet.summary, 190)}</p>
            <div className="chip-row">
              <SmallChip>{packet.openQuestions?.length ?? 0} questions</SmallChip>
              <SmallChip>{packet.risks?.length ?? 0} risks</SmallChip>
              <SmallChip>{packet.evidenceRefs?.length ?? 0} refs</SmallChip>
            </div>
          </motion.button>
        ))}
      </div>
    </ViewScaffold>
  );
}

function InsightsView({
  insights,
  showDetail
}: {
  insights: CortexInsight[];
  showDetail: (detail: Detail) => void;
}) {
  return (
    <ViewScaffold
      eyebrow="Cortex Insights"
      title="Reasoning trails"
      summary="Non-obvious observations with trigger, chain, alternatives, confidence factors, and action links."
    >
      <div className="insight-grid">
        {insights.map((insight) => (
          <motion.button
            className="insight-card glass-card"
            key={insight.id}
            onClick={() => showDetail({ kind: "insight", value: insight })}
            whileHover={{ y: -3 }}
          >
            <div className="section-heading compact">
              <span className="mono-kicker">{labelize(insight.type)}</span>
              <ConfidenceDial value={insight.confidence} compact />
            </div>
            <h3>{insight.title}</h3>
            <p>{clampText(insight.summary, 210)}</p>
            <div className="tag-strip">
              {(insight.tags ?? []).slice(0, 4).map((tag) => (
                <SmallChip key={tag}>{tag}</SmallChip>
              ))}
            </div>
          </motion.button>
        ))}
      </div>
    </ViewScaffold>
  );
}

function ActionsView({ showDetail }: { showDetail: (detail: Detail) => void }) {
  const groups = ["proposed", "executed", "blocked"];
  return (
    <ViewScaffold
      eyebrow="Action Proposals"
      title="Approval-gated next actions"
      summary="Every proposal defaults to review. The interface explains action text, why now, approval requirement, risk, and evidence refs."
    >
      <div className="three-column">
        {groups.map((status) => {
          const proposals = brain.actionProposals.filter((proposal) => proposal.status === status);
          return (
            <section className="glass-card column-card" key={status}>
              <div className="section-heading compact">
                <h3>{labelize(status)}</h3>
                <span className="count-badge">{proposals.length}</span>
              </div>
              {proposals.map((proposal) => (
                <button
                  className="stacked-row"
                  key={proposal.id}
                  onClick={() => showDetail({ kind: "proposal", value: proposal })}
                >
                  <span>{labelize(proposal.type)}</span>
                  <strong>{proposal.title}</strong>
                  <small>{proposal.proposal?.whyNow ?? proposal.approval?.reason}</small>
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </ViewScaffold>
  );
}

function QuestionsView({ showDetail }: { showDetail: (detail: Detail) => void }) {
  const critical = brain.openQuestions.filter((question) =>
    question.priority.toLowerCase().includes("critical")
  );
  const others = brain.openQuestions.filter((question) => !critical.includes(question));
  return (
    <ViewScaffold
      eyebrow="Open Questions"
      title="Decision questions still shaping the engagement"
      summary="Questions remain open until a cited source answers them. This view makes ownership and next targets visible."
    >
      <div className="split-grid">
        <QuestionList title="Critical" questions={critical} showDetail={showDetail} />
        <QuestionList title="All Other Open Questions" questions={others} showDetail={showDetail} />
      </div>
    </ViewScaffold>
  );
}

function QuestionList({
  title,
  questions,
  showDetail
}: {
  title: string;
  questions: OpenQuestion[];
  showDetail: (detail: Detail) => void;
}) {
  return (
    <section className="glass-card list-card">
      <div className="section-heading compact">
        <h3>{title}</h3>
        <span className="count-badge">{questions.length}</span>
      </div>
      {questions.map((question) => (
        <button
          className="stacked-row"
          key={question.id}
          onClick={() => showDetail({ kind: "question", value: question })}
        >
          <span>{question.id}</span>
          <strong>{question.question}</strong>
          <small>{question.answerOwner} | {question.target}</small>
        </button>
      ))}
    </section>
  );
}

function RisksView({ showDetail }: { showDetail: (detail: Detail) => void }) {
  return (
    <ViewScaffold
      eyebrow="Risks"
      title="Risk register"
      summary="A quiet view of what is exposed, who owns mitigation, and where the brain still needs source-backed closure."
    >
      <div className="risk-grid">
        {brain.risks.map((risk) => (
          <motion.button
            className={`risk-card glass-card severity-${risk.severity.toLowerCase()}`}
            key={risk.id}
            onClick={() => showDetail({ kind: "risk", value: risk })}
            whileHover={{ y: -3 }}
          >
            <div className="section-heading compact">
              <span className="mono-kicker">{risk.id}</span>
              <SmallChip>{risk.severity}</SmallChip>
            </div>
            <h3>{risk.risk}</h3>
            <p>{risk.exposed}</p>
            <small>{risk.owner}</small>
          </motion.button>
        ))}
      </div>
    </ViewScaffold>
  );
}

function DecisionsView({ showDetail }: { showDetail: (detail: Detail) => void }) {
  return (
    <ViewScaffold
      eyebrow="Decisions"
      title="ADR review lane"
      summary="Proposed ADRs and candidates stay visible without treating governance work like an outage."
    >
      <div className="split-grid">
        <section className="glass-card list-card">
          <div className="section-heading compact">
            <h3>Proposed ADRs</h3>
            <span className="count-badge">{brain.adrs.adrs.length}</span>
          </div>
          {brain.adrs.adrs.map((adr) => (
            <button
              className="stacked-row"
              key={adr.number}
              onClick={() => showDetail({ kind: "adr", value: adr, label: `ADR-${adr.number.slice(-4)}` })}
            >
              <span>ADR-{adr.number.slice(-4)}</span>
              <strong>{adr.title}</strong>
              <small>{adr.decider}</small>
            </button>
          ))}
        </section>
        <section className="glass-card list-card">
          <div className="section-heading compact">
            <h3>Candidate Queue</h3>
            <span className="count-badge">{brain.adrs.candidates.length}</span>
          </div>
          {brain.adrs.candidates.map((candidate, index) => (
            <button
              className="stacked-row"
              key={`${candidate.dateFlagged}-${index}`}
              onClick={() => showDetail({ kind: "adr", value: candidate, label: "Candidate ADR" })}
            >
              <span>{candidate.dateFlagged}</span>
              <strong>{stripMarkdown(candidate.topic)}</strong>
              <small>{candidate.status}</small>
            </button>
          ))}
        </section>
      </div>
    </ViewScaffold>
  );
}

function SourceHealthView() {
  const entries = Object.entries(brain.status.sourceHealth);
  return (
    <ViewScaffold
      eyebrow="Source Health"
      title="Context freshness and runtime boundary"
      summary="Natively reads prepared brain artifacts. It does not gather Teams, Outlook, Notion, Cluely, Semantica, or source database context live."
    >
      <div className="source-grid">
        {entries.map(([key, item]) => (
          <article className="glass-card source-card" key={key}>
            <div className="section-heading compact">
              <span className="mono-kicker">{labelize(key)}</span>
              <ShieldCheck size={19} />
            </div>
            <h3>{labelize(item.status ?? "Unknown")}</h3>
            <p>{item.note}</p>
            <div className="mini-proof">{item.latestInput}</div>
          </article>
        ))}
      </div>
      <article className="glass-card boundary-card">
        <div className="section-heading">
          <div>
            <span className="mono-kicker">Runtime Boundary</span>
            <h2>Natively is a live touchpoint only</h2>
          </div>
          <Split size={26} />
        </div>
        <p>{brain.status.runtimeBoundary?.boundaryStatement}</p>
        <div className="boundary-grid">
          <BoundaryList title="Reads Prepared Artifacts" items={brain.status.runtimeBoundary?.nativelyReadsFrom ?? []} />
          <BoundaryList title="Does Not Call Live" items={brain.status.runtimeBoundary?.nativelyShouldNotCallLive ?? []} />
        </div>
      </article>
    </ViewScaffold>
  );
}

function DetailDrawer({ detail, onClose }: { detail: Detail | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {detail && (
        <>
          <motion.button
            className="drawer-scrim"
            aria-label="Close details"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="detail-drawer"
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <button className="drawer-close" onClick={onClose}>
              Close
            </button>
            <DetailContent detail={detail} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DetailContent({ detail }: { detail: Detail }) {
  if (detail.kind === "packet") return <PacketDetail packet={detail.value} />;
  if (detail.kind === "insight") return <InsightDetail insight={detail.value} />;
  if (detail.kind === "proposal") return <ProposalDetail proposal={detail.value} />;
  if (detail.kind === "question") return <QuestionDetail question={detail.value} />;
  if (detail.kind === "risk") return <RiskDetail risk={detail.value} />;
  if (detail.kind === "meeting") return <MeetingDetail meeting={detail.value} />;
  return <AdrDetail adr={detail.value} label={detail.label} />;
}

function PacketDetail({ packet }: { packet: PrepPacket }) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={<FileCheck2 />} kicker="Prep Packet" title={packet.title} />
      <p className="lead-copy">{packet.summary}</p>
      <InfoBlock title="Why It Matters" body={packet.whyItMatters} />
      <ListBlock title="Current State" items={packet.currentState} />
      <ListBlock title="Open Questions" items={packet.openQuestions} />
      <ListBlock title="Open Commitments" items={packet.openCommitments} />
      <ListBlock title="Talking Points" items={packet.talkingPoints} />
      <ListBlock title="Risks" items={packet.risks} />
      <InfoBlock title="Suggested Posture" body={packet.suggestedPosture} />
      <EvidenceRefs refs={packet.evidenceRefs} />
    </div>
  );
}

function InsightDetail({ insight }: { insight: CortexInsight }) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={<Sparkles />} kicker={labelize(insight.type)} title={insight.title} />
      <ConfidenceDial value={insight.confidence} />
      <p className="lead-copy">{insight.summary}</p>
      <ReasoningSteps insight={insight} />
      <InfoBlock title="Recommended Action" body={insight.recommendedAction} />
      <EvidenceRefs refs={insight.actionProposalRefs} title="Action Proposal Links" />
    </div>
  );
}

function ProposalDetail({ proposal }: { proposal: ActionProposal }) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={<ListChecks />} kicker={labelize(proposal.type)} title={proposal.title} />
      <div className="chip-row">
        <SmallChip>{proposal.status}</SmallChip>
        <SmallChip>{proposal.approval?.required ? "Approval required" : "No approval required"}</SmallChip>
        {proposal.risk?.level && <SmallChip>Risk: {proposal.risk.level}</SmallChip>}
      </div>
      <InfoBlock title="Suggested Action" body={proposal.proposal?.suggestedAction} />
      <InfoBlock title="Suggested Wording" body={proposal.proposal?.suggestedWording} />
      <InfoBlock title="Why Now" body={proposal.proposal?.whyNow} />
      <InfoBlock title="Approval Boundary" body={proposal.approval?.reason} />
      <InfoBlock title="Risk Notes" body={proposal.risk?.notes} />
      <EvidenceRefs refs={proposal.evidenceRefs} />
    </div>
  );
}

function QuestionDetail({ question }: { question: OpenQuestion }) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={<MessageSquareText />} kicker={question.id} title={question.question} />
      <MetaGrid
        items={[
          ["Priority", question.priority],
          ["Owner", question.answerOwner],
          ["Target", question.target],
          ["Status", question.status]
        ]}
      />
    </div>
  );
}

function RiskDetail({ risk }: { risk: Risk }) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={<TriangleAlert />} kicker={risk.id} title={risk.risk} />
      <MetaGrid
        items={[
          ["Severity", risk.severity],
          ["Likelihood", risk.likelihood],
          ["Owner", risk.owner],
          ["Last reviewed", risk.lastReviewed ?? "Unknown"]
        ]}
      />
      <InfoBlock title="Exposed" body={risk.exposed} />
      <InfoBlock title="Mitigation" body={risk.mitigation} />
    </div>
  );
}

function MeetingDetail({ meeting }: { meeting: MeetingEntry }) {
  const linkedPacket = meeting.packet
    ? packetById.get(meeting.packet.replace("prep-packets/", "").replace(".packet.json", ""))
    : undefined;
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={<CalendarDays />} kicker={formatDate(meeting.startsAt ?? meeting.date)} title={meeting.title} />
      <InfoBlock title="Readiness" body={meeting.readinessStatus} />
      <InfoBlock title="Why Now" body={meeting.whyNow} />
      <EvidenceRefs refs={[meeting.source, meeting.packet].filter(Boolean) as string[]} />
      {linkedPacket && (
        <div className="nested-callout">
          <span className="mono-kicker">Linked Packet</span>
          <h3>{linkedPacket.title}</h3>
          <p>{clampText(linkedPacket.summary, 220)}</p>
        </div>
      )}
    </div>
  );
}

function AdrDetail({ adr, label }: { adr: Adr | AdrCandidate; label: string }) {
  const isProposed = "number" in adr;
  return (
    <div className="drawer-stack">
      <DrawerHeader
        icon={<GitBranch />}
        kicker={label}
        title={isProposed ? adr.title : stripMarkdown(adr.topic)}
      />
      {isProposed ? (
        <MetaGrid
          items={[
            ["Status", adr.status],
            ["Date", adr.date],
            ["Decider", adr.decider],
            ["Supersedes", adr.supersedes ?? "None"]
          ]}
        />
      ) : (
        <MetaGrid
          items={[
            ["Status", adr.status],
            ["Flagged", adr.dateFlagged],
            ["Source", adr.source]
          ]}
        />
      )}
    </div>
  );
}

function ReasoningSteps({ insight, compact = false }: { insight: CortexInsight; compact?: boolean }) {
  const sections = [
    ["Trigger", insight.reasoning.trigger ? [insight.reasoning.trigger] : []],
    ["Observations", insight.reasoning.observations ?? []],
    ["Connections", insight.reasoning.connections ?? []],
    ["Chain", insight.reasoning.chain ?? []],
    ["Alternatives", insight.reasoning.alternativesConsidered ?? []],
    ["Confidence Factors", insight.reasoning.confidenceFactors ?? []]
  ].filter(([, items]) => items.length > 0);

  return (
    <div className={`reasoning-rail ${compact ? "is-compact" : ""}`}>
      {sections.slice(0, compact ? 3 : sections.length).map(([title, items], sectionIndex) => (
        <motion.div
          className="reasoning-step"
          key={title as string}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: sectionIndex * 0.04 }}
        >
          <span>{title as string}</span>
          {(items as string[]).slice(0, compact ? 1 : 6).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

function ViewScaffold({
  eyebrow,
  title,
  summary,
  children
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="view-stack">
      <div className="view-header">
        <span className="mono-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{summary}</p>
      </div>
      {children}
    </div>
  );
}

function DrawerHeader({
  icon,
  kicker,
  title
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="drawer-header">
      <div className="drawer-icon">{icon}</div>
      <span className="mono-kicker">{kicker}</span>
      <h2>{title}</h2>
    </div>
  );
}

function StatusDot({
  label,
  tone,
  icon,
  compact = false
}: {
  label: string;
  tone: "amber" | "mint" | "sky" | "violet";
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <span className={`status-dot tone-${tone}`} title={label}>
      {icon ?? <span className="pulse-dot" />}
      {!compact && label}
    </span>
  );
}

function SmallChip({ children }: { children: ReactNode }) {
  return <span className="small-chip">{children}</span>;
}

function ConfidenceDial({ value, compact = false }: { value: number; compact?: boolean }) {
  const percent = Math.round(value * 100);
  return (
    <div className={`confidence-dial ${compact ? "is-compact" : ""}`} style={{ "--score": percent } as React.CSSProperties}>
      <Gauge size={compact ? 15 : 20} />
      <strong>{percent}%</strong>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <section className="info-block">
      <span className="mono-kicker">{title}</span>
      <p>{body}</p>
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="info-block">
      <span className="mono-kicker">{title}</span>
      <ul className="detail-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceRefs({
  refs,
  title = "Evidence References"
}: {
  refs?: string[];
  title?: string;
}) {
  if (!refs?.length) return null;
  return (
    <section className="info-block">
      <span className="mono-kicker">{title}</span>
      <div className="evidence-list">
        {refs.map((ref) => (
          <div className="evidence-ref" key={ref}>
            <Archive size={15} />
            <span>{ref}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetaGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="meta-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function BoundaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="boundary-list">
      <span className="mono-kicker">{title}</span>
      {items.map((item) => (
        <div className="proof-row" key={item}>
          <DatabaseZap size={16} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function AmbientCanvas({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="ambient-canvas" aria-hidden="true">
      <div className="grain" />
      <div className="ambient-gradient one" />
      <div className="ambient-gradient two" />
      {!reduceMotion &&
        Array.from({ length: 8 }).map((_, index) => (
          <span className={`ambient-thread thread-${index}`} key={index} />
        ))}
      <Network className="ambient-icon" size={420} />
    </div>
  );
}

function stripMarkdown(value: string) {
  return value.replace(/\*\*/g, "").replace(/`/g, "");
}
