import ForceGraph from "force-graph";
import { useEffect, useRef, useState } from "react";

import { deriveLineage, getOriginColorRgba } from "../../lib/pipelineLineage";
import {
  BRAIN_NODES,
  CLEAN_LINKS,
  DEGREE,
  TOPICS,
  topicAnchorOf,
  topicColorOf,
  topicIdOf,
} from "../../lib/topicClusters";

interface KnowledgeGraphProps {
  onNodeClick?: (node: any) => void;
}

// Nodes at/above this degree always show their label (the true hubs), so it isn't a wall of text.
const HUB_DEGREE = 28;

// Node radius (world units) from significance — area scales with connection count.
function nodeRadius(node: any): number {
  const deg = DEGREE[node.id] || 0;
  return 2.2 + Math.sqrt(deg) * 1.7;
}

// Faint, origin-tinted link color — calm subtle threads. Heuristic edges recede further.
function originLinkColor(link: any): string {
  const lineage = deriveLineage(link);
  if (!lineage) return "rgba(150, 156, 178, 0.10)";
  return getOriginColorRgba(lineage.origin, lineage.isHeuristic ? 0.06 : 0.16);
}

export function KnowledgeGraph({ onNodeClick }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  const [searchTerm, setSearchTerm] = useState("");
  // "Unconnected" (orphaned nodes with no valid edges) is hidden by default — it's noise on a map
  // about relationships. The legend toggle reveals it.
  const [hiddenTopics, setHiddenTopics] = useState<string[]>(["other"]);
  const [strongOnly, setStrongOnly] = useState(false);
  const [isSettling, setIsSettling] = useState(true);

  const onNodeClickRef = useRef<KnowledgeGraphProps["onNodeClick"]>(onNodeClick);
  const getFilteredRef = useRef<(() => { nodes: any[]; links: any[] }) | null>(null);
  const skipFirstDataEffect = useRef(true);
  // Hover highlight state (read every frame by the canvas renderers).
  const hoverNodeRef = useRef<any>(null);
  const hlNodesRef = useRef<Set<string>>(new Set());
  const hlLinksRef = useRef<Set<any>>(new Set());

  // ── Filter the clean graph by search + topic toggles + strong-only ──
  function getFilteredGraph(): { nodes: any[]; links: any[] } {
    let nodes = BRAIN_NODES.map((n: any) => ({ ...n }));
    let links = CLEAN_LINKS.map((l: any) => ({ ...l }));

    if (strongOnly) {
      links = links.filter((l: any) => l.provenance?.confidence === "high");
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matching = new Set<string>(
        nodes
          .filter(
            (n: any) =>
              n.name?.toLowerCase().includes(q) ||
              n.description?.toLowerCase().includes(q) ||
              n.layer?.toLowerCase().includes(q)
          )
          .map((n: any) => n.id as string)
      );
      nodes = nodes.filter((n: any) => matching.has(n.id));
      links = links.filter((l: any) => matching.has(l.source) && matching.has(l.target));
    }

    if (hiddenTopics.length > 0) {
      const visible = new Set<string>(
        nodes
          .filter((n: any) => !hiddenTopics.includes(topicIdOf(n.id) || "other"))
          .map((n: any) => n.id as string)
      );
      nodes = nodes.filter((n: any) => visible.has(n.id));
      links = links.filter((l: any) => visible.has(l.source) && visible.has(l.target));
    }

    return { nodes, links };
  }

  onNodeClickRef.current = onNodeClick;
  getFilteredRef.current = getFilteredGraph;

  // ── Create the 2D force graph ONCE ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time setup; live values via refs
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;
    const el = containerRef.current;

    const compute = getFilteredRef.current;
    const initial = compute ? compute() : { nodes: [], links: [] };

    const graph = (ForceGraph as any)()(el)
      .width(el.clientWidth)
      .height(el.clientHeight)
      .backgroundColor("#0E2338")
      .graphData(initial)
      .nodeId("id")
      .nodeLabel(() => "")
      // COLOR = topic (semantic community), not category.
      .nodeColor((n: any) => topicColorOf(n.id))
      .linkColor((l: any) =>
        hlLinksRef.current.has(l) ? "rgba(255,255,255,0.5)" : originLinkColor(l)
      )
      .linkWidth((l: any) => (hlLinksRef.current.has(l) ? 1.6 : 0.5))
      .linkDirectionalParticles(0)
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const r = nodeRadius(node);
        const deg = DEGREE[node.id] || 0;
        const isHl = hlNodesRef.current.has(node.id);
        const dimmed = hoverNodeRef.current && !isHl;
        const color = topicColorOf(node.id);

        ctx.globalAlpha = dimmed ? 0.16 : 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        if (isHl) {
          ctx.lineWidth = 1.4 / globalScale;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.stroke();
        }

        const showLabel = deg >= HUB_DEGREE || globalScale > 2.4 || isHl;
        if (showLabel) {
          const fontSize = Math.max(3, 11 / globalScale);
          ctx.font = `${fontSize}px Lexend, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label = node.name || node.id;
          const ty = node.y + r + 1.5 / globalScale;
          const tw = ctx.measureText(label).width;
          ctx.globalAlpha = dimmed ? 0.14 : 0.9;
          ctx.fillStyle = "rgba(14, 35, 56, 0.76)";
          ctx.fillRect(
            node.x - tw / 2 - 2 / globalScale,
            ty,
            tw + 4 / globalScale,
            fontSize + 2 / globalScale
          );
          ctx.fillStyle = isHl ? "#ffffff" : "rgba(232, 238, 245, 0.94)";
          ctx.fillText(label, node.x, ty + 1 / globalScale);
        }
        ctx.globalAlpha = 1;
      })
      .nodePointerAreaPaint((node: any, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius(node) + 2, 0, 2 * Math.PI);
        ctx.fill();
      })
      .onNodeHover((node: any) => {
        const hlNodes = new Set<string>();
        const hlLinks = new Set<any>();
        if (node) {
          hlNodes.add(node.id);
          const data = graphRef.current?.graphData();
          (data?.links || []).forEach((l: any) => {
            const s = l.source?.id ?? l.source;
            const t = l.target?.id ?? l.target;
            if (s === node.id || t === node.id) {
              hlLinks.add(l);
              hlNodes.add(s);
              hlNodes.add(t);
            }
          });
        }
        hoverNodeRef.current = node || null;
        hlNodesRef.current = hlNodes;
        hlLinksRef.current = hlLinks;
        if (el) el.style.cursor = node ? "pointer" : "default";
      })
      .onNodeClick((node: any) => {
        onNodeClickRef.current?.(node);
        const g = graphRef.current;
        if (g && typeof node.x === "number") g.centerAt(node.x, node.y, 600);
      })
      .cooldownTicks(240)
      .onEngineStop(() => {
        try {
          graphRef.current?.zoomToFit(600, 70);
        } catch {}
        setIsSettling(false);
      });

    // Forces: weak links (faint bridges) + a strong custom CLUSTER force pulling each node to its
    // TOPIC anchor, so semantic topics resolve into distinct, readable clusters.
    try {
      graph.d3Force("charge")?.strength(-70).distanceMax(360);
      const lf = graph.d3Force("link");
      if (lf) lf.distance(60).strength(0.03);
      const clusterForce = (alpha: number) => {
        const nodes = graph.graphData().nodes || [];
        for (const n of nodes) {
          const anchor = topicAnchorOf(n.id);
          if (!anchor) continue;
          n.vx = (n.vx || 0) + (anchor.x - n.x) * alpha * 0.34;
          n.vy = (n.vy || 0) + (anchor.y - n.y) * alpha * 0.34;
        }
      };
      graph.d3Force("cluster", clusterForce);
    } catch {}

    graphRef.current = graph;

    let resizeObs: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(() => {
        const c = containerRef.current;
        const g = graphRef.current;
        if (c && g && c.clientWidth > 0) g.width(c.clientWidth).height(c.clientHeight);
      });
      resizeObs.observe(el);
    }

    const handleReframe = () => {
      try {
        graphRef.current?.zoomToFit(600, 70);
      } catch {}
    };
    const handleFocus = (e: any) => {
      const id = e.detail?.nodeId || e.detail?.sourceId;
      if (!id) return;
      const g = graphRef.current;
      const live = (g?.graphData().nodes || []).find((n: any) => n.id === id);
      if (g && live && typeof live.x === "number") {
        g.centerAt(live.x, live.y, 700);
        g.zoom(Math.max(2.6, g.zoom()), 700);
      }
    };
    window.addEventListener("reframe-graph", handleReframe);
    window.addEventListener("orbital-focus", handleFocus);

    return () => {
      resizeObs?.disconnect();
      window.removeEventListener("reframe-graph", handleReframe);
      window.removeEventListener("orbital-focus", handleFocus);
      try {
        graphRef.current?._destructor?.();
      } catch {}
      graphRef.current = null;
    };
  }, []);

  // ── Sync data into the live instance on filter change (no teardown) ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps drive recompute via getFilteredRef
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (skipFirstDataEffect.current) {
      skipFirstDataEffect.current = false;
      return;
    }
    setIsSettling(true);
    const compute = getFilteredRef.current;
    if (compute) graph.graphData(compute());
    const t = setTimeout(() => setIsSettling(false), 4000);
    return () => clearTimeout(t);
  }, [searchTerm, hiddenTopics, strongOnly]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Search */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 20,
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "rgba(14, 35, 56, 0.86)",
          padding: "6px 8px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(8px)",
        }}
      >
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search knowledge…"
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            padding: "4px 8px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "#F7F9FC",
            width: 190,
          }}
        />
        <button
          type="button"
          onClick={() => setStrongOnly((s) => !s)}
          style={{
            fontSize: 10,
            padding: "4px 10px",
            borderRadius: 999,
            background: strongOnly ? "#1B5E9E" : "transparent",
            color: strongOnly ? "#FFFFFF" : "#7FC4F2",
            border: "1px solid #1B5E9E",
            cursor: "pointer",
            fontWeight: strongOnly ? 600 : 500,
            whiteSpace: "nowrap",
          }}
          title="Show only strong, source-backed connections"
        >
          Strong links
        </button>
      </div>

      {/* Reset view */}
      <button
        type="button"
        onClick={() => graphRef.current?.zoomToFit(600, 70)}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 20,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          padding: "5px 12px",
          background: "rgba(14, 35, 56, 0.88)",
          color: "rgba(255,255,255,0.75)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 999,
          cursor: "pointer",
        }}
        title="Fit the whole map back into view"
      >
        Reset view
      </button>

      {/* Topic legend — the map is grouped by SEMANTIC TOPIC. Each color is a topic; click to
          isolate/hide it. This is how the map stays legible: color = topic, size = how connected. */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          zIndex: 20,
          background: "rgba(14, 35, 56, 0.9)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "10px 12px",
          backdropFilter: "blur(8px)",
          maxWidth: 340,
          maxHeight: "46%",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.55)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          Grouped by <span style={{ color: "#F7F9FC", fontWeight: 600 }}>topic</span> — related
          meetings, decisions & systems cluster together.{" "}
          <span style={{ color: "#F7F9FC", fontWeight: 600 }}>Bigger</span> = more connected.{" "}
          <span style={{ color: "#7FC4F2" }}>Hover</span> to trace links,{" "}
          <span style={{ color: "#7FC4F2" }}>click</span> to open.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {TOPICS.map((topic) => {
            const isHidden = hiddenTopics.includes(topic.id);
            return (
              <button
                type="button"
                key={topic.id}
                onClick={() =>
                  setHiddenTopics((h) =>
                    h.includes(topic.id) ? h.filter((t) => t !== topic.id) : [...h, topic.id]
                  )
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 11,
                  padding: "3px 6px",
                  borderRadius: 7,
                  background: "transparent",
                  color: isHidden ? "rgba(255,255,255,0.35)" : "#E8EEF5",
                  border: "1px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  textDecoration: isHidden ? "line-through" : "none",
                  width: "100%",
                }}
                title={`${topic.label} — ${topic.size} items`}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: topic.color,
                    flexShrink: 0,
                    opacity: isHidden ? 0.4 : 1,
                  }}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {topic.label}
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, flexShrink: 0 }}>
                  {topic.size}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "620px",
          borderRadius: "20px",
          overflow: "hidden",
          background: "#0E2338",
        }}
      />

      {isSettling && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "3px 9px",
            background: "rgba(14, 35, 56, 0.84)",
            color: "rgba(255,255,255,0.5)",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            pointerEvents: "none",
          }}
        >
          Arranging the map…
        </div>
      )}
    </div>
  );
}
