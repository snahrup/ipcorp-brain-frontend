import { useMemo, useState } from "react";
import { statusTone, TONE_COLOR, TONE_LABEL } from "./jiraStatus";
import type { JiraIssue } from "./types";

type Node = {
  issue: JiraIssue;
  depth: number;
  row: number;
  blocks: string[];
  blockedBy: string[];
};

// Sized so the issue title always fits. The old 54px box could not hold the key row,
// three lines of title and the "waits on" line, so titles were clipped to nothing.
const COL_W = 310;
const ROW_H = 122;
const NODE_W = 258;
const NODE_H = 96;

/**
 * Node canvas of the blocking relationships. Issues are laid out in dependency order:
 * column 0 is work nothing is waiting on, and each column to the right can only start
 * once something in the column before it is finished.
 *
 * Only issues that actually participate in a blocking relationship are drawn, so this
 * stays a picture of the critical path rather than a wall of every ticket.
 */
export function JiraDependencyMap({
  issues,
  onOpenIssue,
}: {
  issues: JiraIssue[];
  onOpenIssue: (key: string) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);

  const { nodes, edges, width, height, orphanCount } = useMemo(() => {
    const byKey = new Map(issues.map((issue) => [issue.key, issue]));
    const blocks = new Map<string, string[]>();
    const blockedBy = new Map<string, string[]>();

    for (const issue of issues) {
      for (const link of issue.links) {
        if (!/blocks/i.test(link.type)) continue;
        if (!byKey.has(link.key)) continue;
        // Record each edge once, always as blocker -> blocked.
        const [from, to] =
          link.direction === "outward" ? [issue.key, link.key] : [link.key, issue.key];
        if (!blocks.get(from)?.includes(to)) {
          blocks.set(from, [...(blocks.get(from) ?? []), to]);
        }
        if (!blockedBy.get(to)?.includes(from)) {
          blockedBy.set(to, [...(blockedBy.get(to) ?? []), from]);
        }
      }
    }

    const involved = new Set<string>([...blocks.keys(), ...blockedBy.keys()]);

    // Longest-path depth so an issue always sits to the right of everything blocking it.
    const depth = new Map<string, number>();
    const visiting = new Set<string>();
    const resolve = (key: string): number => {
      if (depth.has(key)) return depth.get(key) as number;
      if (visiting.has(key)) return 0; // cycle guard
      visiting.add(key);
      const parents = blockedBy.get(key) ?? [];
      const value = parents.length === 0 ? 0 : Math.max(...parents.map(resolve)) + 1;
      visiting.delete(key);
      depth.set(key, value);
      return value;
    };
    for (const key of involved) resolve(key);

    const byDepth = new Map<number, string[]>();
    for (const key of involved) {
      const d = depth.get(key) ?? 0;
      byDepth.set(d, [...(byDepth.get(d) ?? []), key]);
    }

    const built: Node[] = [];
    for (const [d, keys] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
      keys
        .sort((a, b) => a.localeCompare(b))
        .forEach((key, row) => {
          const issue = byKey.get(key);
          if (!issue) return;
          built.push({
            issue,
            depth: d,
            row,
            blocks: blocks.get(key) ?? [],
            blockedBy: blockedBy.get(key) ?? [],
          });
        });
    }

    const pos = new Map(built.map((n) => [n.issue.key, n]));
    const drawn: Array<{ from: Node; to: Node }> = [];
    for (const node of built) {
      for (const target of node.blocks) {
        const to = pos.get(target);
        if (to) drawn.push({ from: node, to });
      }
    }

    const maxDepth = Math.max(0, ...built.map((n) => n.depth));
    const maxRow = Math.max(0, ...built.map((n) => n.row));
    return {
      nodes: built,
      edges: drawn,
      width: (maxDepth + 1) * COL_W + 40,
      height: (maxRow + 1) * ROW_H + 40,
      orphanCount: issues.length - involved.size,
    };
  }, [issues]);

  if (nodes.length === 0) {
    return (
      <section className="wb-safe-empty">
        <div>
          <strong>No dependencies are recorded yet</strong>
          <p>
            This map draws the blocking links between issues. Add a Blocks link on an issue and the
            sequence appears here.
          </p>
        </div>
      </section>
    );
  }

  const x = (n: Node) => n.depth * COL_W + 20;
  const y = (n: Node) => n.row * ROW_H + 20;

  const related = new Set<string>();
  if (focus) {
    related.add(focus);
    for (const node of nodes) {
      if (node.issue.key !== focus) continue;
      for (const k of node.blocks) related.add(k);
      for (const k of node.blockedBy) related.add(k);
    }
  }

  return (
    <section className="wb-depmap" aria-label="Jira dependency map">
      <div className="wb-depmap-legend">
        <span>
          {nodes.length} issues with dependencies · {edges.length} links
        </span>
        {orphanCount > 0 && <span>{orphanCount} issues have no blocking links</span>}
        <span className="wb-depmap-hint">
          Left to right is order: anything in a column can only start once the column before it is
          finished.
        </span>
      </div>

      <div className="wb-depmap-scroll">
        <div className="wb-depmap-canvas" style={{ width, height }}>
          <svg width={width} height={height} className="wb-depmap-edges">
            <title>Blocking relationships</title>
            <defs>
              <marker
                id="wb-dep-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L0,7 L7,3.5 z" fill="#9FB0C2" />
              </marker>
            </defs>
            {edges.map(({ from, to }) => {
              const x1 = x(from) + NODE_W;
              const y1 = y(from) + NODE_H / 2;
              const x2 = x(to);
              const y2 = y(to) + NODE_H / 2;
              const mid = x1 + (x2 - x1) / 2;
              const dim = focus && !(related.has(from.issue.key) && related.has(to.issue.key));
              return (
                <path
                  key={`${from.issue.key}-${to.issue.key}`}
                  d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={dim ? "#E1E4E8" : "#9FB0C2"}
                  strokeWidth={dim ? 1 : 1.6}
                  markerEnd="url(#wb-dep-arrow)"
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const tone = statusTone(node.issue.status.name, node.issue.status.category);
            const dim = focus ? !related.has(node.issue.key) : false;
            return (
              <button
                type="button"
                key={node.issue.key}
                className={`wb-depnode${dim ? " is-dim" : ""}${
                  focus === node.issue.key ? " is-focus" : ""
                }`}
                style={{
                  left: x(node),
                  top: y(node),
                  width: NODE_W,
                  height: NODE_H,
                  borderLeftColor: TONE_COLOR[tone],
                }}
                onMouseEnter={() => setFocus(node.issue.key)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(node.issue.key)}
                onBlur={() => setFocus(null)}
                onClick={() => onOpenIssue(node.issue.key)}
                title={`${node.issue.key} · ${node.issue.summary}`}
              >
                <span className="wb-depnode-top">
                  <span className="wb-depnode-key">{node.issue.key}</span>
                  <span
                    className="wb-depnode-status"
                    style={{ background: TONE_COLOR[tone] }}
                    title={TONE_LABEL[tone]}
                  />
                </span>
                <span className="wb-depnode-name">{node.issue.summary}</span>
                {node.blockedBy.length > 0 && (
                  <span className="wb-depnode-meta">waits on {node.blockedBy.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
