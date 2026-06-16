import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarDays, FileCheck2, Focus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import brainGraph from "../../data/brain-graph.json";
import { brain } from "../data";

interface MeetingsViewProps {
  openDetail: (detail: any) => void;
  onFocusInGraph?: (meetingId: string) => void;
}

export function MeetingsView({ openDetail, onFocusInGraph }: MeetingsViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "recent">("all");

  const allMeetings = useMemo(() => {
    const idx = brain.meetingIndex || {};
    const upcoming = idx.upcoming || [];
    const active = idx.active || [];
    const recent = idx.recent || [];
    return [...upcoming, ...active, ...recent];
  }, []);

  // Compute real graph connection counts for each meeting (now meaningful because generator pulls real dataflows, ADRs, books, etc.)
  const meetingConnectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const links = (brainGraph as any).links || [];
    const nodes = (brainGraph as any).nodes || [];

    nodes
      .filter((n: any) => n.layer === "meeting")
      .forEach((m: any) => {
        const direct = links.filter((l: any) => l.source === m.id || l.target === m.id).length;
        counts[m.id] = direct;
      });
    return counts;
  }, []);

  const filtered = useMemo(() => {
    let result = allMeetings;

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (m: any) =>
          (m.title || "").toLowerCase().includes(q) || (m.whyNow || "").toLowerCase().includes(q)
      );
    }

    if (filter === "upcoming") {
      result = result.filter(
        (m: any) =>
          (m.readinessStatus || "").includes("ready") || (m.readinessStatus || "").includes("needs")
      );
    }
    if (filter === "recent") {
      result = result.filter(
        (m: any) =>
          (m.readinessStatus || "").includes("executed") ||
          (m.readinessStatus || "").includes("done")
      );
    }

    return [...result].sort((a: any, b: any) => {
      const ad = a.startsAt || a.date || "";
      const bd = b.startsAt || b.date || "";
      return bd.localeCompare(ad);
    });
  }, [allMeetings, query, filter]);

  const focusGraph = (m: any) => {
    if (onFocusInGraph) onFocusInGraph(m.id);
    else {
      window.dispatchEvent(
        new CustomEvent("focus-meeting-in-graph", {
          detail: {
            meetingId: m.id,
            alsoSelect: true, // hint for the graph to also open the detail panel
          },
        })
      );
    }
  };

  const open = (m: any) => openDetail({ type: "meeting", data: m });

  return (
    <div style={{ padding: "32px 40px 60px" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <CalendarDays size={28} />
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Meetings</h1>
        </div>
        <p style={{ maxWidth: 620, opacity: 0.8, fontSize: 15 }}>
          The complete signal layer. Every conversation that created insights, decisions, and
          movement in the brain. Click any meeting to open details or focus its exact provenance in
          the 3D graph.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <Search size={15} style={{ position: "absolute", left: 13, top: 11, opacity: 0.5 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or context..."
            style={{
              width: "100%",
              padding: "9px 14px 9px 36px",
              borderRadius: "var(--radius-pill)",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          />
        </div>
        {(["all", "upcoming", "recent"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius-pill)",
              border: filter === f ? "1px solid var(--white)" : "1px solid var(--line-strong)",
              background: filter === f ? "var(--white)" : "transparent",
              color: filter === f ? "var(--on-white)" : "var(--text-soft)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", opacity: 0.6 }}>
          No meetings match the current filters.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <AnimatePresence>
            {filtered.map((m: any, i: number) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.01 }}
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-lg)",
                  padding: 18,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.55,
                      fontFamily: "monospace",
                      marginBottom: 4,
                    }}
                  >
                    {m.startsAt || m.date || "—"}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{m.title}</div>
                  {m.whyNow && (
                    <div style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.4 }}>{m.whyNow}</div>
                  )}

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 9px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--panel-strong)",
                        color: "var(--text-soft)",
                      }}
                    >
                      {m.readinessStatus}
                    </span>
                    {m.packet && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 9px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--accent-dim)",
                          color: "var(--accent)",
                        }}
                      >
                        Linked packet
                      </span>
                    )}
                    {meetingConnectionCounts[m.id] > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--accent-dim)",
                          color: "var(--accent)",
                        }}
                      >
                        {meetingConnectionCounts[m.id]} graph connections
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 148 }}>
                  <button
                    onClick={() => open(m)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "var(--radius-pill)",
                      background: "transparent",
                      border: "1px solid var(--line-strong)",
                      color: "var(--text-soft)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Details <ArrowRight size={14} style={{ verticalAlign: "middle" }} />
                  </button>
                  <button
                    onClick={() => focusGraph(m)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--white)",
                      color: "var(--on-white)",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      border: "1px solid var(--white)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      justifyContent: "center",
                    }}
                  >
                    <Focus size={15} /> Focus in Graph
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
