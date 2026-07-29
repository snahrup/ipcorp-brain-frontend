import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { sortedInsights } from "../data";
import type { CortexInsight } from "../types/brain";

interface Node {
  id: string;
  label: string;
  type: "insight" | "source";
  x: number;
  y: number;
  confidence?: number;
  data?: CortexInsight;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
}

export function InsightsGraph({
  onSelectInsight,
}: {
  onSelectInsight: (insight: CortexInsight) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build a simple graph from the real insight data
  const { nodes, edges } = useMemo(() => {
    const insightNodes: Node[] = sortedInsights.slice(0, 8).map((insight, i) => ({
      id: insight.id,
      label: insight.title.length > 60 ? insight.title.slice(0, 57) + "..." : insight.title,
      type: "insight" as const,
      x: 120 + (i % 4) * 180 + (Math.random() - 0.5) * 40,
      y: 140 + Math.floor(i / 4) * 160 + (Math.random() - 0.5) * 40,
      confidence: insight.confidence,
      data: insight,
    }));

    const sourceNodes: Node[] = [
      { id: "src-meetings", label: "Meeting Signals", type: "source", x: 80, y: 220 },
      { id: "src-packets", label: "Prep Packets", type: "source", x: 80, y: 380 },
      { id: "src-doctrine", label: "Architecture Doctrine", type: "source", x: 620, y: 220 },
    ];

    const allNodes = [...insightNodes, ...sourceNodes];

    const graphEdges: Edge[] = [];

    // Connect insights to sources based on their reasoning
    insightNodes.forEach((node) => {
      const insight = node.data!;
      if (insight.reasoning?.connections?.some((c) => /meeting|summary/i.test(c))) {
        graphEdges.push({ from: "src-meetings", to: node.id });
      }
      if (insight.reasoning?.connections?.some((c) => /doctrine|boundary|financial/i.test(c))) {
        graphEdges.push({ from: "src-doctrine", to: node.id });
      }
      if (insight.reasoning?.chain?.length) {
        graphEdges.push({ from: "src-packets", to: node.id });
      }
    });

    // Connect some insights to each other via chain/reasoning
    for (let i = 0; i < insightNodes.length - 1; i++) {
      if (Math.random() > 0.6) {
        graphEdges.push({
          from: insightNodes[i].id,
          to: insightNodes[i + 1].id,
          label: "builds on",
        });
      }
    }

    return { nodes: allNodes, edges: graphEdges };
  }, []);

  const handleNodeClick = (node: Node) => {
    if (node.type === "insight" && node.data) {
      setSelectedId(node.id);
      onSelectInsight(node.data);
    }
  };

  return (
    <div
      className="insights-graph-container"
      style={{
        position: "relative",
        height: "560px",
        background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        <title>Insight relationships</title>
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodes.find((n) => n.id === edge.from);
          const to = nodes.find((n) => n.id === edge.to);
          if (!from || !to) return null;

          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(119, 199, 255, 0.25)"
                strokeWidth={1.5}
                strokeDasharray={edge.label ? "4 2" : "0"}
              />
              {edge.label && (
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  fill="rgba(255, 255, 255, 0.45)"
                  fontSize="10"
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isSelected = node.id === selectedId;
          const isInsight = node.type === "insight";

          return (
            <g
              key={node.id}
              // Only insight nodes are actionable, so only they carry the button role
              // and its handlers. Attaching a click to a plain group would leave a
              // control that a keyboard cannot reach.
              {...(isInsight
                ? {
                    role: "button" as const,
                    "aria-label": node.label,
                    tabIndex: 0,
                    onClick: () => handleNodeClick(node),
                    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleNodeClick(node);
                      }
                    },
                  }
                : {})}
              style={{ cursor: isInsight ? "pointer" : "default" }}
            >
              {/* Glow / Depth */}
              {isInsight && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 42 : 36}
                  fill="rgba(27, 94, 158, 0.08)"
                  style={{ transition: "all 0.2s ease" }}
                />
              )}

              {/* Main node */}
              <circle
                cx={node.x}
                cy={node.y}
                r={isInsight ? (isSelected ? 28 : 22) : 14}
                fill={isInsight ? (isSelected ? "#1B5E9E" : "#2A4A6B") : "#446084"}
                stroke={isInsight ? "rgba(26, 130, 197, 0.6)" : "rgba(119, 199, 255, 0.4)"}
                strokeWidth={isSelected ? 3 : 1.5}
                style={{ transition: "all 0.2s cubic-bezier(0.23, 1, 0.32, 1)" }}
              />

              {/* Label */}
              <text
                x={node.x}
                y={node.y + (isInsight ? 38 : 28)}
                textAnchor="middle"
                fill={isInsight ? "#fafafa" : "rgba(255, 255, 255, 0.5)"}
                fontSize={isInsight ? "11" : "9"}
                fontWeight={isInsight ? 500 : 400}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {node.label}
              </text>

              {/* Confidence ring for insights */}
              {isInsight && node.confidence && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={26}
                  fill="none"
                  stroke="rgba(26, 130, 197, 0.5)"
                  strokeWidth={2}
                  strokeDasharray={`${node.confidence * 160} 160`}
                  transform={`rotate(-90 ${node.x} ${node.y})`}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          fontSize: 11,
          color: "var(--muted)",
          display: "flex",
          gap: 16,
        }}
      >
        <div style={{ color: "var(--accent)" }}>● Insight</div>
        <div style={{ color: "var(--blue)" }}>● Source Signal</div>
        <div style={{ opacity: 0.6 }}>Drag nodes coming soon</div>
      </div>
    </div>
  );
}
