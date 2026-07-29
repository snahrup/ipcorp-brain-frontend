// Topic (community) detection over the real brain graph.
//
// Steve's model of the brain is by SEMANTIC TOPIC, not by category. A topic is a densely
// interconnected community of nodes that cut across categories — a meeting, the decision it drove,
// and the systems it touched all land in the same topic. We find these with Louvain modularity
// community detection over the real typed edges, then give each community a human label (its most
// connected members), a distinct color, and a layout anchor so it reads as its own cluster.
//
// This module also owns the one-time normalization of the (structurally messy) brain-graph.json so
// every consumer shares the same clean links + degree data.

import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import brainGraphRaw from "../../data/brain-graph.json";

const RAW = brainGraphRaw as any;
export const BRAIN_NODES: any[] = RAW.nodes;
export const NODE_BY_ID = new Map<string, any>(BRAIN_NODES.map((n) => [n.id, n]));
const VALID_IDS = new Set<string>(BRAIN_NODES.map((n) => n.id));

// Resolve a raw edge endpoint to a real node id (salvage bare system ids → their `sys-` node).
function resolveId(id: any): string {
  const s = typeof id === "object" && id ? id.id : id;
  if (VALID_IDS.has(s)) return s;
  if (VALID_IDS.has(`sys-${s}`)) return `sys-${s}`;
  return s;
}

// Clean links: normalized endpoints, dangling edges dropped (a single bad id blanks the render).
export const CLEAN_LINKS: any[] = RAW.links
  .map((l: any) => ({ ...l, source: resolveId(l.source), target: resolveId(l.target) }))
  .filter((l: any) => VALID_IDS.has(l.source) && VALID_IDS.has(l.target));

// Degree = global significance (how connected a node is). Used to size nodes + pick topic labels.
export const DEGREE: Record<string, number> = {};
for (const l of CLEAN_LINKS) {
  DEGREE[l.source] = (DEGREE[l.source] || 0) + 1;
  DEGREE[l.target] = (DEGREE[l.target] || 0) + 1;
}

export interface Topic {
  id: string;
  label: string;
  color: string;
  anchor: { x: number; y: number };
  size: number;
}

// Distinct, dark-bg-friendly palette for topics.
/**
 * Cluster colours, drawn from the IP Corporation system rather than a generic rainbow.
 *
 * The old palette reached for pink, lime, fuchsia and amber, which read as a different
 * product from the rest of the Workbench. This is a blue-led ramp: clusters separate by
 * lightness and by a small amount of hue drift across steel, teal and slate, all of which
 * sit next to the navy canvas without fighting it. The semantic red, amber and green stay
 * out of it entirely so they keep meaning status everywhere else.
 */
const TOPIC_PALETTE = [
  "#1B5E9E", // action blue
  "#7FC4F2", // light sky
  "#446084", // brand blue 2
  "#2E8FC8", // mid azure
  "#9FB0C2", // supporting pale blue
  "#1D4570", // deep corporate blue
  "#5FA8D3", // soft steel blue
  "#334862", // brand blue
  "#4FB3AE", // muted teal
  "#B7C6D6", // pale slate
  "#2A4A6B", // supporting blue
  "#86A8CC", // dusty blue
  "#3C7A99", // slate teal
  "#6E8CAE", // mid slate
  "#14314F", // navy 2
  "#A8C6DE", // ice blue
];

const TOPIC_OF: Record<string, string> = {};
export const TOPICS: Topic[] = [];
const TOPIC_BY_ID = new Map<string, Topic>();

// Seeded RNG so community detection (and therefore colors + layout) is stable across reloads.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

(function computeTopics() {
  const g = new Graph({ type: "undirected" });
  for (const n of BRAIN_NODES) g.addNode(n.id);
  for (const l of CLEAN_LINKS) {
    if (l.source === l.target) continue;
    if (!g.hasEdge(l.source, l.target)) {
      // High-confidence edges count more — real, sourced relationships shape the topics most.
      g.addEdge(l.source, l.target, { weight: l.provenance?.confidence === "high" ? 3 : 1 });
    }
  }

  let communities: Record<string, number> = {};
  try {
    communities = louvain(g, {
      resolution: 1.5,
      getEdgeWeight: "weight",
      rng: makeRng(20260530),
    }) as Record<string, number>;
  } catch {
    // Degrade gracefully: everything in one topic rather than crashing the map.
    for (const n of BRAIN_NODES) communities[n.id] = 0;
  }

  // Group node ids by community; the substantial ones become topics.
  const byComm = new Map<number, string[]>();
  for (const [id, c] of Object.entries(communities)) {
    const arr = byComm.get(c) || [];
    arr.push(id);
    byComm.set(c, arr);
  }
  const MIN_TOPIC_SIZE = 4;
  const bigComms = [...byComm.values()]
    .filter((m) => m.length >= MIN_TOPIC_SIZE)
    .sort((a, b) => b.length - a.length);

  // Seed assignment with the big communities, then PROPAGATE every other node into the topic it is
  // most strongly connected to (seeded label propagation). This pulls the ~80 weakly-connected
  // nodes into the real topic they belong to instead of a meaningless "Other" blob.
  const assign: Record<string, string> = {};
  bigComms.forEach((members, idx) => {
    for (const id of members) assign[id] = `t${idx}`;
  });

  const adj = new Map<string, { other: string; w: number }[]>();
  for (const l of CLEAN_LINKS) {
    if (l.source === l.target) continue;
    const w = l.provenance?.confidence === "high" ? 3 : 1;
    (adj.get(l.source) || adj.set(l.source, []).get(l.source))?.push({ other: l.target, w });
    (adj.get(l.target) || adj.set(l.target, []).get(l.target))?.push({ other: l.source, w });
  }

  const allIds = BRAIN_NODES.map((n) => n.id);
  for (let pass = 0; pass < 6; pass++) {
    let changed = 0;
    for (const id of allIds) {
      if (assign[id]) continue;
      const score: Record<string, number> = {};
      for (const { other, w } of adj.get(id) || []) {
        const t = assign[other];
        if (t) score[t] = (score[t] || 0) + w;
      }
      const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
      if (best) {
        assign[id] = best[0];
        changed++;
      }
    }
    if (!changed) break;
  }

  // Final membership per topic (after propagation).
  const membersByTid = new Map<string, string[]>();
  for (const id of allIds) {
    const t = assign[id] || "other";
    (membersByTid.get(t) || membersByTid.set(t, []).get(t))?.push(id);
  }

  const hasOther = (membersByTid.get("other")?.length || 0) > 0;
  const ringCount = bigComms.length + (hasOther ? 1 : 0);
  const RING = 470;
  const anchorAt = (idx: number) => {
    const a = (idx / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * RING, y: Math.sin(a) * RING };
  };

  bigComms.forEach((_seed, idx) => {
    const tid = `t${idx}`;
    const members = membersByTid.get(tid) || [];
    const topNames = members
      .slice()
      .sort((x, y) => (DEGREE[y] || 0) - (DEGREE[x] || 0))
      .slice(0, 2)
      .map((id) => NODE_BY_ID.get(id)?.name || id);
    const topic: Topic = {
      id: tid,
      label: topNames.join(" · ") || `Topic ${idx + 1}`,
      color: TOPIC_PALETTE[idx % TOPIC_PALETTE.length],
      anchor: anchorAt(idx),
      size: members.length,
    };
    for (const id of members) TOPIC_OF[id] = tid;
    TOPICS.push(topic);
    TOPIC_BY_ID.set(tid, topic);
  });

  if (hasOther) {
    const members = membersByTid.get("other") || [];
    const topic: Topic = {
      id: "other",
      label: "Unconnected",
      color: "#9FB0C2",
      anchor: anchorAt(bigComms.length),
      size: members.length,
    };
    for (const id of members) TOPIC_OF[id] = "other";
    TOPICS.push(topic);
    TOPIC_BY_ID.set("other", topic);
  }
})();

export function topicIdOf(nodeId: string): string | undefined {
  return TOPIC_OF[nodeId];
}
export function topicColorOf(nodeId: string): string {
  const t = TOPIC_OF[nodeId];
  return (t ? TOPIC_BY_ID.get(t)?.color : undefined) || "#9FB0C2";
}
export function topicAnchorOf(nodeId: string): { x: number; y: number } | null {
  const t = TOPIC_OF[nodeId];
  return (t ? TOPIC_BY_ID.get(t)?.anchor : undefined) || null;
}
export function topicLabelOf(nodeId: string): string | undefined {
  const t = TOPIC_OF[nodeId];
  return t ? TOPIC_BY_ID.get(t)?.label : undefined;
}
