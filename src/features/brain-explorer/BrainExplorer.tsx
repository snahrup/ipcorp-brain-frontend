import { useEffect, useRef, useState } from "react";
import brainGraphRaw from "../../../data/brain-graph.json";
import { LiquidGlass } from "../../components/LiquidGlass";
import {
  type GraphEdgeLike,
  getLineageDisplay,
  getNodeLineageSummary,
  getPipelineStats,
  PIPELINE_STAGES,
} from "../../lib/pipelineLineage";
import { KnowledgeGraph } from "../knowledge-graph/KnowledgeGraph";

// Edges carry provenance (nodes do not), so node-level lineage is derived from incident edges.
const BRAIN_NODES = (brainGraphRaw as unknown as { nodes: BrainNode[] }).nodes;
const BRAIN_LINKS = (brainGraphRaw as unknown as { links: GraphEdgeLike[] }).links;
const BRAIN_NODE_COUNT = BRAIN_NODES.length;
const NODE_BY_ID = new Map<string, BrainNode>(BRAIN_NODES.map((n) => [n.id, n]));
// Graph-wide pipeline output, derived once from real edge provenance (powers the live Observatory).
const PIPELINE_STATS = getPipelineStats(BRAIN_LINKS);

interface BrainNode {
  id: string;
  name: string;
  layer?: string;
  group?: string;
  description?: string;
  confidence?: number;
  sourceRefs?: string[];
}

interface SelectedNode {
  id: string;
  name: string;
  layer?: string;
  group?: string;
  description?: string;
  whyNow?: string;
  confidence?: number;
  sourceRefs?: string[];
}

// Plain-language category names + colors (matched to the graph layers). No jargon — a stranger
// should understand every label.
const CATEGORY_LABEL: Record<string, string> = {
  insight: "Insight",
  decision: "Decision",
  meeting: "Meeting",
  system: "System",
  entity: "Entity",
  risk: "Risk",
  open_question: "Open question",
  reference: "Reference material",
};
const CATEGORY_COLOR: Record<string, string> = {
  insight: "#22c55e",
  decision: "#fdcf5a",
  meeting: "#77c7ff",
  system: "#9f8cff",
  entity: "#9f8cff",
  risk: "#ff8a5b",
  open_question: "#c084fc",
  reference: "#5fa8d3",
};
const catLabel = (layer?: string) => (layer && CATEGORY_LABEL[layer]) || "Concept";
const catColor = (layer?: string) => (layer && CATEGORY_COLOR[layer]) || "#9aa3b2";

interface Connection {
  otherId: string;
  otherName: string;
  otherLayer?: string;
  label?: string;
  excerpt?: string;
  confidence?: string;
}

// Real connections for a node, drawn straight from the typed edges. High-confidence first.
function getConnections(nodeId: string): Connection[] {
  const out: Connection[] = [];
  for (const l of BRAIN_LINKS) {
    const link = l as unknown as {
      source: string | { id: string };
      target: string | { id: string };
      label?: string;
      provenance?: { excerpt?: string; confidence?: string };
    };
    const s = typeof link.source === "object" ? link.source.id : link.source;
    const t = typeof link.target === "object" ? link.target.id : link.target;
    if (s !== nodeId && t !== nodeId) continue;
    const otherId = s === nodeId ? t : s;
    const other = NODE_BY_ID.get(otherId);
    out.push({
      otherId,
      otherName: other?.name || otherId,
      otherLayer: other?.layer,
      label: link.label,
      excerpt: link.provenance?.excerpt,
      confidence: link.provenance?.confidence,
    });
  }
  out.sort((a, b) => (b.confidence === "high" ? 1 : 0) - (a.confidence === "high" ? 1 : 0));
  return out;
}

export function BrainExplorer() {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  // dossierNode lags selectedNode on close so the panel content stays visible while the
  // column animates shut (no content flashing out before the reflow completes).
  const [dossierNode, setDossierNode] = useState<SelectedNode | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [showPipeline, setShowPipeline] = useState(false);
  const [activeEdge, setActiveEdge] = useState<GraphEdgeLike | null>(null);

  const openNode = (n: SelectedNode | null) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
    setSelectedNode(n);
    if (n) setDossierNode(n);
  };
  const closeDossier = () => {
    setSelectedNode(null);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setDossierNode(null), 500);
  };
  // Jump from a connection in the dossier to that node's own dossier. No camera-fly: a long graph
  // animation would compete with the panel update. (Task #4 will reveal the node in the canvas by
  // expanding its category.)
  const jumpToNode = (id: string) => {
    const n = NODE_BY_ID.get(id);
    if (!n) return;
    openNode({
      id: n.id,
      name: n.name,
      layer: n.layer,
      description: n.description,
      confidence: n.confidence,
      sourceRefs: n.sourceRefs,
    });
  };

  // Stable ref so once-bound listeners (search results, the orb, external "select-node" events)
  // always reach the latest selection logic without re-binding.
  const jumpRef = useRef(jumpToNode);
  jumpRef.current = jumpToNode;

  // Any surface can open a node's dossier by id via a "select-node" event (search uses this).
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.nodeId as string | undefined;
      if (id) jumpRef.current(id);
    };
    window.addEventListener("select-node", handler);
    return () => {
      window.removeEventListener("select-node", handler);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Re-frame the graph when the dossier opens or closes (the canvas region resizes). A node→node
  // jump keeps the column width, so it does NOT reframe — that preserves the user's current view.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const isOpen = !!selectedNode;
    if (isOpen === wasOpenRef.current) return;
    wasOpenRef.current = isOpen;
    const t = window.setTimeout(() => window.dispatchEvent(new CustomEvent("reframe-graph")), 520);
    return () => clearTimeout(t);
  }, [selectedNode]);

  // Listen for orb or header requests to open the pipeline visual
  useEffect(() => {
    const openHandler = () => {
      setActiveEdge(null);
      setShowPipeline(true);
    };
    const lineageHandler = (e: Event) => {
      // Orb: "show me how this connection was synthesized" → trace a specific edge.
      const edge = (e as CustomEvent).detail?.edge as GraphEdgeLike | undefined;
      setActiveEdge(edge ?? null);
      setShowPipeline(true);
    };
    window.addEventListener("open-pipeline-observatory", openHandler);
    window.addEventListener("show-edge-lineage", lineageHandler);
    return () => {
      window.removeEventListener("open-pipeline-observatory", openHandler);
      window.removeEventListener("show-edge-lineage", lineageHandler);
    };
  }, []);

  return (
    <div className="brain-explorer graph-cockpit-root">
      <div className={`explorer-stage ${selectedNode ? "is-detail-open" : ""}`}>
        {/* ── Graph region (canvas + its overlays) — shrinks left when a node is open ── */}
        <div className="graph-region">
          {/* Header — plain language. The map below is the star. */}
          <div className="cockpit-header">
            <div className="cockpit-title">
              <div className="title-main">The IP Corp Brain</div>
              <div className="title-sub">
                Every meeting, decision, system & insight — grouped by topic, connected by what
                relates
              </div>
            </div>
            <div className="cockpit-status">
              <button
                type="button"
                className="pipeline-btn"
                onClick={() => window.dispatchEvent(new CustomEvent("open-pipeline-observatory"))}
              >
                How it's built
              </button>
            </div>
          </div>

          <div className="graph-container">
            <KnowledgeGraph onNodeClick={openNode} />

            {/* Premium production loading state for the central graph (initial force settle) */}
            <div
              id="graph-loading-overlay"
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(5,7,10,0.65)",
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
                zIndex: 5,
                pointerEvents: "none",
              }}
            >
              <div style={{ textAlign: "center", color: "#aaa" }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Synthesizing full brain depth…</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {BRAIN_NODE_COUNT} nodes • {BRAIN_LINKS.length} typed connections from the
                  complete repository
                </div>
              </div>
            </div>
          </div>

          {/* Action-oriented orientation hint when nothing is open yet */}
          {!selectedNode && (
            <div
              style={{
                position: "absolute",
                bottom: 80,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 12,
                color: "#9aa3b2",
                textAlign: "center",
                pointerEvents: "none",
                opacity: 0.85,
                maxWidth: 460,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#cfd4dd" }}>Hover</strong> a node to trace its links ·{" "}
              <strong style={{ color: "#cfd4dd" }}>click</strong> any node to see what it is and how
              it connects
            </div>
          )}
        </div>

        {/* ── Dossier (right) — the rich detail for the selected node ── */}
        <aside className="dossier-panel" aria-hidden={!selectedNode}>
          {dossierNode &&
            (() => {
              const node = dossierNode;
              const summary = getNodeLineageSummary(node.id, BRAIN_LINKS);
              const connections = getConnections(node.id);
              const visibleConns = connections.slice(0, 14);
              const sourceFiles = Array.from(
                new Set(
                  summary.samples
                    .map((s) => s.lineage.sourceFile)
                    .filter((f): f is string => Boolean(f))
                )
              ).slice(0, 6);
              const categoryCount = summary.origins.length;

              return (
                <LiquidGlass cornerRadius={20}>
                  <div className="dossier-inner">
                    <div className="dossier-head">
                      <div className="dossier-head-text">
                        <div className="dossier-eyebrow">
                          <span className="cat-dot" style={{ background: catColor(node.layer) }} />
                          {catLabel(node.layer)}
                          {typeof node.confidence === "number" && (
                            <span style={{ color: "var(--muted)" }}>
                              · {Math.round(node.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                        <h2 className="dossier-title">{node.name}</h2>
                      </div>
                      <button
                        type="button"
                        className="dossier-close"
                        onClick={closeDossier}
                        title="Close"
                        aria-label="Close detail"
                      >
                        ×
                      </button>
                    </div>

                    {/* What this is */}
                    <div className="dossier-section">
                      <div className="dossier-section-label">What this is</div>
                      <div className="dossier-body-text">
                        {node.description ||
                          node.whyNow ||
                          `A ${catLabel(node.layer).toLowerCase()} synthesized from the brain. Its connections below show how it relates to meetings, decisions, systems, and reference material.`}
                      </div>
                    </div>

                    {/* Why it matters — computed honestly from this node's real connections */}
                    {summary.edgeCount > 0 && (
                      <div className="dossier-section">
                        <div className="dossier-section-label">Why it matters</div>
                        <div className="dossier-why">
                          Connected to <strong>{summary.edgeCount}</strong> other{" "}
                          {summary.edgeCount === 1 ? "thing" : "things"}
                          {categoryCount > 0 && (
                            <>
                              {" "}
                              across <strong>{categoryCount}</strong>{" "}
                              {categoryCount === 1 ? "part" : "parts"} of the brain
                            </>
                          )}
                          .{" "}
                          {summary.quality.high > 0 ? (
                            <>
                              <strong>{summary.quality.high}</strong> of those{" "}
                              {summary.quality.high === 1 ? "connection is" : "connections are"}{" "}
                              high-confidence, backed by a real source excerpt.
                            </>
                          ) : (
                            <>These connections are inferred — open one to see its basis.</>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Connections — each one jumps to that node */}
                    {visibleConns.length > 0 && (
                      <div className="dossier-section">
                        <div className="dossier-section-label">
                          Connections ({connections.length})
                        </div>
                        {visibleConns.map((c) => (
                          <button
                            type="button"
                            key={`${c.otherId}-${c.label}`}
                            className="dossier-conn"
                            onClick={() => jumpToNode(c.otherId)}
                            title={`Open ${c.otherName}`}
                          >
                            <div className="dossier-conn-top">
                              <span className="dossier-conn-name">{c.otherName}</span>
                              <span className="conn-cat" style={{ color: catColor(c.otherLayer) }}>
                                {catLabel(c.otherLayer)}
                              </span>
                            </div>
                            {c.label && (
                              <div className="dossier-conn-rel">
                                <span className="arrow">→</span> {c.label}
                              </div>
                            )}
                            {c.excerpt && (
                              <div className="dossier-conn-excerpt">
                                “{c.excerpt.slice(0, 160)}”
                              </div>
                            )}
                            <div className="dossier-jumphint">click to open →</div>
                          </button>
                        ))}
                        {connections.length > visibleConns.length && (
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                            + {connections.length - visibleConns.length} more connections
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source material — the real files behind this node */}
                    {(sourceFiles.length > 0 ||
                      (node.sourceRefs && node.sourceRefs.length > 0)) && (
                      <div className="dossier-section">
                        <div className="dossier-section-label">Source material</div>
                        {sourceFiles.map((f) => (
                          <div className="dossier-source" key={f}>
                            {f}
                          </div>
                        ))}
                        {node.sourceRefs
                          ?.filter((r) => !sourceFiles.includes(r))
                          .slice(0, 4)
                          .map((r) => (
                            <div className="dossier-source" key={r}>
                              {r}
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="dossier-derived-note">
                      Connections and sources are real, drawn from the brain's typed edges
                      (provenance.sourceFile + §24 label + confidence). “Why it matters” is computed
                      from those connections, not authored.
                    </div>
                  </div>
                </LiquidGlass>
              );
            })()}
        </aside>
      </div>

      {/* Pipeline Observatory — visual view of how data is processed through the ingestion pipeline */}
      {showPipeline && (
        <div className="pipeline-observatory">
          <button type="button" className="pipeline-close" onClick={() => setShowPipeline(false)}>
            ×
          </button>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--amber)" }}>
            Pipeline Observatory
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14, lineHeight: 1.35 }}>
            Visual trace of how raw material becomes the 3D graph you are looking at.
          </div>

          {/* Active edge journey — fired by the orb's "how was this synthesized" */}
          {activeEdge &&
            (() => {
              const disp = getLineageDisplay(activeEdge);
              if (!disp) return null;
              return (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 10,
                    borderRadius: 10,
                    background: "var(--accent-dim)",
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                    fontSize: 11,
                  }}
                >
                  <div className="eyebrow" style={{ marginBottom: 4 }}>
                    This connection's journey
                  </div>
                  <div>
                    <strong>Origin:</strong> {disp.originLabel}
                  </div>
                  <div>
                    <strong>Stages:</strong> {disp.stagePath}
                  </div>
                  <div>
                    <strong>Quality:</strong> {disp.qualityBadge}
                    {disp.isHeuristic && (
                      <span style={{ color: "var(--orange)" }}> — heuristic</span>
                    )}
                  </div>
                  {disp.excerpt && (
                    <div style={{ marginTop: 6, fontStyle: "italic", color: "var(--text-soft)" }}>
                      “{disp.excerpt.slice(0, 200)}”
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 9, color: "var(--muted)" }}>
                    {disp.sourceFile}
                  </div>
                </div>
              );
            })()}

          {/* Live pipeline output — real aggregate derived from every edge's provenance */}
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Live output · {PIPELINE_STATS.classified} of {PIPELINE_STATS.totalEdges} edges
              classified
            </div>
            {PIPELINE_STATS.byOrigin.map((o) => {
              const pct = PIPELINE_STATS.classified
                ? Math.round((o.count / PIPELINE_STATS.classified) * 100)
                : 0;
              return (
                <div key={o.origin} style={{ marginBottom: 5 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10,
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: "var(--text-soft)" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: o.color,
                          marginRight: 5,
                        }}
                      />
                      {o.label}
                    </span>
                    <span style={{ color: "var(--muted)" }}>{o.count}</span>
                  </div>
                  <div
                    style={{
                      height: 3,
                      borderRadius: 999,
                      background: "rgba(255, 255, 255, 0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: o.color,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
              <strong style={{ color: "var(--accent)" }}>{PIPELINE_STATS.quality.high}</strong> high
              ·{" "}
              <strong style={{ color: "var(--text-soft)" }}>{PIPELINE_STATS.quality.medium}</strong>{" "}
              medium ·{" "}
              <strong style={{ color: "var(--orange)" }}>{PIPELINE_STATS.quality.heuristic}</strong>{" "}
              heuristic
            </div>
          </div>

          {/* Visual timeline — single honest source of truth (planned stages clearly marked) */}
          <div style={{ position: "relative", paddingLeft: 22 }}>
            {PIPELINE_STAGES.map((stage) => (
              <div
                key={stage.num}
                className="pipeline-stage"
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 8,
                  opacity: stage.implemented ? 1 : 0.5,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: stage.implemented ? "var(--amber)" : "transparent",
                    border: stage.implemented ? "none" : "1px dashed var(--muted)",
                    color: stage.implemented ? "#080a0c" : "var(--muted)",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {stage.num}
                </div>
                <div>
                  <div className="stage-name" style={{ marginBottom: 2 }}>
                    {stage.title}
                    {!stage.implemented && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          color: "var(--muted)",
                          border: "1px solid var(--line)",
                          borderRadius: 3,
                          padding: "0 4px",
                        }}
                      >
                        Planned
                      </span>
                    )}
                  </div>
                  <div className="stage-desc" style={{ fontSize: 11 }}>
                    {stage.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              fontSize: 11,
              color: "var(--muted)",
              borderTop: "1px solid var(--line)",
              paddingTop: 10,
            }}
          >
            Lineage is <strong>derived</strong> at runtime from real{" "}
            <code>provenance.sourceFile</code> patterns + §24 label + confidence (see{" "}
            <code>src/lib/pipelineLineage.ts</code>).
            <br />
            Full spec: <strong>BRAIN_INGESTION_PIPELINE.md</strong>
          </div>
        </div>
      )}
    </div>
  );
}
