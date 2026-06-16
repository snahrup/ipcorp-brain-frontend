/**
 * Pipeline Lineage Derivation
 *
 * Honest, deterministic derivation of processing history from the raw materials
 * that already exist in brain-graph.json edges.
 *
 * No stage/extractor fields are stored in the graph data — they must be derived.
 * This module is the single source of truth for that derivation.
 *
 * Design principles:
 * - Grounded exclusively in what the generator actually emits (sourceFile patterns + label + confidence)
 * - Never fabricate stages that don't exist yet (e.g. Stage 5 hierarchical synthesis)
 * - Clearly mark heuristic / low-confidence edges
 * - Designed to be used by the 3D graph, detail panels, and the Orbital
 */

export type PipelineStage = 1 | 2 | 3 | 4 | 5 | 6;

export type ExtractorOrigin =
  | "transcript-miner"
  | "cortex-extractor"
  | "adr-parser"
  | "dataflow-miner"
  | "book-doctrine-miner"
  | "architecture-miner"
  | "powerbi-miner"
  | "generator-heuristic"
  | "unclassified-source";

export interface DerivedLineage {
  origin: ExtractorOrigin;
  stages: PipelineStage[]; // Ordered stages this edge passed through (truthful — never claims Stage 5 if it didn't)
  confidence: "high" | "medium" | "heuristic";
  sourceFile: string;
  reason: string;
  excerpt?: string;
  isHeuristic: boolean; // Explicit flag for weak edges
}

/** Minimal shape this module needs from a brain-graph edge (provenance lives on edges, not nodes). */
export interface LineageEdgeInput {
  provenance?: {
    sourceFile?: string;
    reason?: string;
    excerpt?: string;
    confidence?: string;
  };
  confidence?: string;
}

/**
 * Authoritative mapping from sourceFile patterns to extractor origin + stages.
 * This is derived directly from the code paths in scripts/generate-brain-graph.ts.
 */
const EXTRACTOR_RULES: Array<{
  pattern: RegExp;
  origin: ExtractorOrigin;
  stages: PipelineStage[];
}> = [
  // Transcripts & meeting summaries (highest volume of high-confidence edges)
  {
    pattern: /meetings\/(summaries|transcripts|notion-export|cluely-export)/,
    origin: "transcript-miner",
    stages: [1, 2, 3, 4],
  },
  // Meeting-derived free-text signals: run reports, prep packets, meeting records
  // (the generator emits these descriptor-form sourceFiles, not file paths — they are
  //  still genuinely meeting-sourced, NOT heuristic).
  {
    pattern: /meeting summaries|run reports?|prep[- ]?packets?|meeting records/i,
    origin: "transcript-miner",
    stages: [1, 2, 3, 4],
  },
  // Cortex insights (free text analysis path)
  {
    pattern: /cortex.*insights|insights.*\(free text analysis\)/i,
    origin: "cortex-extractor",
    stages: [1, 2, 3, 4],
  },
  // ADR frontmatter parsing (Related / Supersedes).
  // Match both real paths (ADR-0004-...) and the descriptor form ("ADR file") — no hyphen required.
  {
    pattern: /decisions\/ADR/i,
    origin: "adr-parser",
    stages: [1, 2, 3, 4],
  },
  // Explicit dataflows
  {
    pattern: /project-memory\/entities\/dataflows\.json|dataflows\.json/,
    origin: "dataflow-miner",
    stages: [1, 2, 3, 4],
  },
  // Book application notes (doctrine)
  {
    pattern: /books\/.*\/ipcorp-application-notes\.md/,
    origin: "book-doctrine-miner",
    stages: [1, 2, 3, 4],
  },
  // Architecture docs
  {
    pattern: /architecture\//,
    origin: "architecture-miner",
    stages: [1, 2, 3, 4],
  },
  // Power BI models
  {
    pattern: /power-bi\//,
    origin: "powerbi-miner",
    stages: [1, 2, 3, 4],
  },
  // Self-flagged weak edges from the generator itself
  {
    pattern: /generator-heuristic/,
    origin: "generator-heuristic",
    stages: [3], // Only the inference step — deliberately minimal
  },
];

/**
 * Derives an honest lineage record from a raw edge's provenance + label + confidence.
 */
export function deriveLineage(edge: LineageEdgeInput | null | undefined): DerivedLineage | null {
  const prov = edge?.provenance;
  if (!prov?.sourceFile) return null;

  const sourceFile: string = prov.sourceFile;
  const reason: string = prov.reason || "";
  const excerpt: string | undefined = prov.excerpt;
  const confidence: DerivedLineage["confidence"] =
    (prov.confidence as DerivedLineage["confidence"]) ||
    (edge?.confidence as DerivedLineage["confidence"]) ||
    "medium";

  // Find matching extractor rule
  let matched = EXTRACTOR_RULES.find((rule) => rule.pattern.test(sourceFile));

  // Fallback for sourceFiles we can't map to a known extractor.
  if (!matched) {
    if (confidence === "heuristic" || sourceFile.includes("heuristic")) {
      matched = {
        pattern: /heuristic/,
        origin: "generator-heuristic",
        stages: [3],
      };
    } else {
      // Honest fallback: it carries real provenance + confidence, so it came through
      // the pipeline, but we can't place the exact extractor. Say exactly that — and do
      // NOT downgrade a real, confidently-sourced edge to "heuristic / keyword overlap".
      return {
        origin: "unclassified-source",
        stages: [],
        confidence,
        sourceFile,
        reason,
        excerpt,
        isHeuristic: false,
      };
    }
  }

  const isHeuristic = confidence === "heuristic" || matched.origin === "generator-heuristic";

  return {
    origin: matched.origin,
    stages: matched.stages,
    confidence,
    sourceFile,
    reason,
    excerpt,
    isHeuristic,
  };
}

/**
 * Human-readable label for an origin (used in UI).
 */
export function getOriginLabel(origin: ExtractorOrigin): string {
  switch (origin) {
    case "transcript-miner":
      return "Meeting / Transcript Miner";
    case "cortex-extractor":
      return "Cortex Insight Extractor";
    case "adr-parser":
      return "ADR Frontmatter Parser";
    case "dataflow-miner":
      return "Dataflow Definition Miner";
    case "book-doctrine-miner":
      return "Book / Doctrine Application Notes";
    case "architecture-miner":
      return "Architecture Documentation Miner";
    case "powerbi-miner":
      return "Power BI Model Miner";
    case "generator-heuristic":
      return "Generator Heuristic (keyword overlap)";
    case "unclassified-source":
      return "Unclassified source (provenance present, extractor unknown)";
    default:
      return origin;
  }
}

/**
 * Returns a short description of the stage path for display.
 */
export function getStagePathLabel(stages: PipelineStage[]): string {
  if (stages.length === 0) return "Unknown";

  const labels = stages.map((s) => {
    if (s === 5) return "5 (not yet implemented)";
    return String(s);
  });

  return labels.join(" → ");
}

/**
 * Convenience: returns a rich display object for UI consumption.
 */
export function getLineageDisplay(edge: LineageEdgeInput | null | undefined) {
  const lineage = deriveLineage(edge);
  if (!lineage) return null;

  return {
    ...lineage,
    originLabel: getOriginLabel(lineage.origin),
    stagePath: getStagePathLabel(lineage.stages),
    qualityBadge: lineage.isHeuristic ? "Heuristic" : lineage.confidence.toUpperCase(),
    qualityTone: lineage.isHeuristic
      ? "warning"
      : lineage.confidence === "high"
        ? "success"
        : "medium",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives for downstream surfaces (3D graph edge styling, orb
// narration, Pipeline Observatory). One source of truth so each feature builds
// on the same honest derivation instead of reinventing it.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical, palette-aligned color per extractor origin (matches the graph layer colors). */
const ORIGIN_COLORS: Record<ExtractorOrigin, string> = {
  "transcript-miner": "#77c7ff", // meeting blue
  "cortex-extractor": "#22c55e", // insight green (Unabyss primary)
  "adr-parser": "#fdcf5a", // decision gold (Unabyss secondary)
  "dataflow-miner": "#9f8cff", // system violet
  "book-doctrine-miner": "#5fa8d3", // reference sky
  "architecture-miner": "#2bd6a3", // architecture teal
  "powerbi-miner": "#c084fc", // model purple
  "generator-heuristic": "#ff8a5b", // weak-edge orange (signals caution)
  "unclassified-source": "#8a93a3", // honest muted gray
};

export function getOriginColor(origin: ExtractorOrigin): string {
  return ORIGIN_COLORS[origin] ?? "#8a93a3";
}

/** Origin color as an rgba() string with explicit alpha (three.js ignores hex alpha on links). */
export function getOriginColorRgba(origin: ExtractorOrigin, alpha: number): string {
  const hex = getOriginColor(origin).replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Canonical pipeline stage metadata — the SINGLE source of truth for any stage UI.
 * `implemented: false` marks spec stages the generator does NOT yet perform, so no
 * surface can honestly imply a node passed through them (e.g. Stage 5).
 */
export interface PipelineStageInfo {
  num: PipelineStage;
  title: string;
  desc: string;
  implemented: boolean;
}

export const PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    num: 1,
    title: "Discovery & Classification",
    desc: "New artifacts detected + typed (transcript, ADR, dataflow, book…).",
    implemented: true,
  },
  {
    num: 2,
    title: "Sanitization Gate",
    desc: "Mandatory redaction through the natively/ layer. Nothing raw escapes.",
    implemented: true,
  },
  {
    num: 3,
    title: "Entity + Claim Extraction",
    desc: "Custom parsers + free-text mining extract stable entities & claims.",
    implemented: true,
  },
  {
    num: 4,
    title: "§24 Relationship + Provenance",
    desc: "Typed edges with real excerpts, reasons, and confidence attached.",
    implemented: true,
  },
  {
    num: 5,
    title: "Hierarchical Synthesis",
    desc: "Communities, summaries, influence scoring (GraphRAG). Planned — not yet performed by the generator.",
    implemented: false,
  },
  {
    num: 6,
    title: "Assembly + Validation",
    desc: "Quality gates → brain-graph.json + read models for this cockpit.",
    implemented: true,
  },
];

/** Minimal edge shape needed to walk the graph for node-level lineage. */
export interface GraphEdgeLike extends LineageEdgeInput {
  source: string | { id: string };
  target: string | { id: string };
  label?: string;
}

export interface NodeLineageSummary {
  nodeId: string;
  edgeCount: number; // incident edges that produced a derivation
  origins: Array<{ origin: ExtractorOrigin; label: string; color: string; count: number }>;
  quality: { high: number; medium: number; heuristic: number };
  samples: Array<{ otherId: string; label: string; lineage: DerivedLineage }>; // representative, excerpt-bearing
}

const endpointId = (e: string | { id: string }): string => (typeof e === "string" ? e : e?.id);

/**
 * Honest node-level lineage: a node carries no provenance of its own, so its lineage
 * is the aggregate of the incident edges that connect it. Powers the node detail
 * panel and (later) orb narration of "how was this synthesized".
 */
export function getNodeLineageSummary(nodeId: string, links: GraphEdgeLike[]): NodeLineageSummary {
  const originCounts = new Map<ExtractorOrigin, number>();
  const quality = { high: 0, medium: 0, heuristic: 0 };
  const samples: NodeLineageSummary["samples"] = [];
  let edgeCount = 0;

  for (const link of links) {
    const s = endpointId(link.source);
    const t = endpointId(link.target);
    if (s !== nodeId && t !== nodeId) continue;

    const lineage = deriveLineage(link);
    if (!lineage) continue;
    edgeCount++;

    originCounts.set(lineage.origin, (originCounts.get(lineage.origin) ?? 0) + 1);
    if (lineage.isHeuristic) quality.heuristic++;
    else if (lineage.confidence === "high") quality.high++;
    else quality.medium++;

    if (lineage.excerpt && samples.length < 3) {
      samples.push({ otherId: s === nodeId ? t : s, label: link.label ?? "", lineage });
    }
  }

  const origins = [...originCounts.entries()]
    .map(([origin, count]) => ({
      origin,
      label: getOriginLabel(origin),
      color: getOriginColor(origin),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { nodeId, edgeCount, origins, quality, samples };
}

export interface PipelineStats {
  totalEdges: number;
  classified: number; // edges that produced a lineage derivation
  byOrigin: Array<{ origin: ExtractorOrigin; label: string; color: string; count: number }>;
  quality: { high: number; medium: number; heuristic: number };
}

/**
 * Graph-wide pipeline output, derived honestly from every edge's provenance.
 * Powers the live Pipeline Observatory ("what did the pipeline actually produce").
 */
export function getPipelineStats(links: GraphEdgeLike[]): PipelineStats {
  const originCounts = new Map<ExtractorOrigin, number>();
  const quality = { high: 0, medium: 0, heuristic: 0 };
  let classified = 0;

  for (const link of links) {
    const lineage = deriveLineage(link);
    if (!lineage) continue;
    classified++;
    originCounts.set(lineage.origin, (originCounts.get(lineage.origin) ?? 0) + 1);
    if (lineage.isHeuristic) quality.heuristic++;
    else if (lineage.confidence === "high") quality.high++;
    else quality.medium++;
  }

  const byOrigin = [...originCounts.entries()]
    .map(([origin, count]) => ({
      origin,
      label: getOriginLabel(origin),
      color: getOriginColor(origin),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalEdges: links.length, classified, byOrigin, quality };
}
