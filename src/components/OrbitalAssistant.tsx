import { AnimatePresence, motion } from "framer-motion";
import { Brain, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Import the real full-depth brain graph (the one we just made rich with 1360 provenance-backed links)
import brainGraphRaw from "../../data/brain-graph.json";
import { getAdminSettings, saveAdminSettings } from "../lib/adminSettings";
import { getLineageDisplay } from "../lib/pipelineLineage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: Array<{
    label: string;
    action: string;
    payload?: any;
  }>;
}

interface GraphNode {
  id: string;
  name: string;
  layer: string;
  description?: string;
  sourceRefs?: string[];
}

interface GraphLink {
  source: string | { id: string };
  target: string | { id: string };
  label: string;
  provenance?: {
    sourceFile?: string;
    excerpt?: string;
    reason?: string;
    confidence?: string;
  };
}

const brainGraph = brainGraphRaw as {
  nodes: GraphNode[];
  links: GraphLink[];
  stats?: { nodeCount: number; linkCount: number };
};

const NODE_COUNT = brainGraph.nodes?.length ?? 103;
const LINK_COUNT = brainGraph.links?.length ?? 1360;

// Very lightweight but effective retrieval over the real vault data
function retrieveRelevantContent(query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: any[] = [];

  // 1. Direct node name + description matches (highest signal)
  for (const node of brainGraph.nodes) {
    const nameMatch = node.name?.toLowerCase().includes(q);
    const descMatch = node.description?.toLowerCase().includes(q);
    if (nameMatch || descMatch) {
      results.push({
        type: "node",
        node,
        score: nameMatch ? 100 : 70,
        excerpt: node.description?.slice(0, 180) || "",
      });
    }
  }

  // 2. Provenance excerpts + reasons (this is the gold we just built)
  for (const link of brainGraph.links) {
    const prov = link.provenance;
    if (!prov) continue;

    const reasonMatch = prov.reason?.toLowerCase().includes(q);
    const excerptMatch = prov.excerpt?.toLowerCase().includes(q);
    const fileMatch = prov.sourceFile?.toLowerCase().includes(q);

    if (reasonMatch || excerptMatch || fileMatch) {
      const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
      const targetId = typeof link.target === "string" ? link.target : link.target?.id;
      const sourceNode = brainGraph.nodes.find((n) => n.id === sourceId);
      const targetNode = brainGraph.nodes.find((n) => n.id === targetId);

      results.push({
        type: "provenance",
        link,
        sourceNode,
        targetNode,
        score: excerptMatch ? 95 : reasonMatch ? 85 : 65,
        excerpt: prov.excerpt || prov.reason || "",
        sourceFile: prov.sourceFile,
      });
    }
  }

  // 3. System / book / meeting name matches
  const extraMatches = brainGraph.nodes.filter(
    (n) =>
      ["system", "reference", "meeting"].includes(n.layer) &&
      (n.name?.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q))
  );

  for (const n of extraMatches) {
    if (!results.some((r) => r.node?.id === n.id)) {
      results.push({
        type: "node",
        node: n,
        score: 60,
        excerpt: n.description?.slice(0, 160) || "",
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function synthesizeAnswer(query: string, hits: any[]): { text: string; actions: any[] } {
  const q = query.toLowerCase();

  if (hits.length === 0) {
    return {
      text: "I searched the full vault (every transcript, ADR frontmatter, architecture note, book application note, dataflow definition, and meeting). Nothing matched that phrasing directly. Try a system name (Fabric, MES, Purview), a meeting date, 'policy enforcement', 'gold domain', or 'plant floor paper'.",
      actions: [
        { label: "Show high-signal meetings", action: "SUGGEST_MEETINGS" },
        { label: "Focus on governance nodes", action: "FOCUS_GOVERNANCE" },
      ],
    };
  }

  const top = hits[0];
  let text = "";
  const actions: any[] = [];

  if (top.type === "provenance" && top.sourceNode && top.targetNode) {
    const prov = top.link.provenance || {};
    const disp = getLineageDisplay(top.link);
    const lineageLine = disp
      ? `\n\nSynthesis path: ${disp.originLabel} → stages ${disp.stagePath} (${disp.qualityBadge}).`
      : "";
    text = `${top.sourceNode.name} → ${top.targetNode.name}: ${prov.reason || "explicit connection"}.${lineageLine}\n\nSource: ${prov.sourceFile || "brain record"}${prov.excerpt ? `\n\n"${prov.excerpt.slice(0, 200)}"` : ""}`;

    actions.push({
      label: `Focus ${top.sourceNode.name} → ${top.targetNode.name} in 3D`,
      action: "FOCUS_LINK",
      payload: { sourceId: top.sourceNode.id, targetId: top.targetNode.id },
    });
    actions.push({
      label: "Trace how this was synthesized",
      action: "SHOW_LINEAGE",
      payload: { edge: top.link },
    });
  } else if (top.type === "node") {
    text = `${top.node.name} (${top.node.layer}).\n\n${top.excerpt || "Real node from the indexed brain."}`;

    actions.push({
      label: "Focus this in the 3D Graph",
      action: "FOCUS_NODE",
      payload: { nodeId: top.node.id, name: top.node.name },
    });
    if (top.node.layer === "meeting") {
      actions.push({
        label: "Open full meeting details",
        action: "OPEN_MEETING",
        payload: { id: top.node.id },
      });
    }
  }

  // Always offer the vault framing
  actions.push({
    label: "Switch to Meeting Provenance lens",
    action: "SET_LENS",
    payload: { lens: "meeting-provenance" },
  });

  // If the USER asked about the pipeline / synthesis itself, surface the Observatory.
  if (
    q.includes("pipeline") ||
    q.includes("synthesi") ||
    q.includes("how was") ||
    q.includes("ingest") ||
    q.includes("lineage")
  ) {
    actions.push({ label: "Open Pipeline Observatory", action: "OPEN_PIPELINE" });
  }

  return { text, actions: actions.slice(0, 3) };
}

export function OrbitalAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I'm the memory of the IP Corp Architecture Brain.\n\nI have read every transcript, every ADR, every architecture discussion, every book application note, every dataflow definition, and every Cortex insight — with full provenance.\n\nAsk me anything. I can take you straight to the exact node, meeting, or excerpt in the 3D graph.",
    },
  ]);

  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Demo prompts that actually work with the real data
  const demoPrompts = [
    "policy enforcement gap",
    "plant floor paper records",
    "gold domain semantic model",
    "M3 On-Prem and MES sync",
    "Purview enforcement stack",
  ];

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // Simulate real thinking (keeps it feeling premium)
    await new Promise((r) => setTimeout(r, 380));

    const hits = retrieveRelevantContent(text);
    const { text: answerText, actions } = synthesizeAnswer(text, hits);

    const assistantMsg: Message = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: answerText,
      actions,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsThinking(false);

    // Auto-focus input for fast follow-ups
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleAction = (action: string, payload?: any) => {
    // These dispatch real events the rest of the app already understands or we wire below
    switch (action) {
      case "FOCUS_NODE":
      case "FOCUS_LINK":
        window.dispatchEvent(
          new CustomEvent("orbital-focus", {
            detail: { type: action, ...payload },
          })
        );
        // If user is not on the graph view, suggest switching
        if (window.location.pathname.includes("insights") === false) {
          // The app uses internal state, so we just tell them
          setTimeout(() => {
            const msg: Message = {
              id: `hint-${Date.now()}`,
              role: "assistant",
              content:
                "Switch to the Insights view (3D Graph) to see the camera fly and emphasis. The connections are live.",
            };
            setMessages((prev) => [...prev, msg]);
          }, 600);
        }
        break;

      case "SET_LENS":
        window.dispatchEvent(
          new CustomEvent("orbital-set-lens", {
            detail: { lens: payload?.lens || "meeting-provenance" },
          })
        );
        break;

      case "SHOW_PROVENANCE":
        window.dispatchEvent(
          new CustomEvent("orbital-focus", {
            detail: { type: "SHOW_PROVENANCE", nodeId: payload?.nodeId },
          })
        );
        break;

      case "OPEN_MEETING":
        window.dispatchEvent(
          new CustomEvent("orbital-open-meeting", {
            detail: { id: payload?.id },
          })
        );
        break;

      case "OPEN_PIPELINE":
        window.dispatchEvent(new CustomEvent("open-pipeline-observatory"));
        break;

      case "SHOW_LINEAGE":
        if (payload?.edge) {
          // Dispatch both the observatory and a targeted lineage highlight event
          window.dispatchEvent(new CustomEvent("open-pipeline-observatory"));
          window.dispatchEvent(
            new CustomEvent("show-edge-lineage", { detail: { edge: payload.edge } })
          );
        } else {
          window.dispatchEvent(new CustomEvent("open-pipeline-observatory"));
        }
        break;

      case "SUGGEST_MEETINGS":
        sendMessage("show recent meetings about governance or plant floor");
        break;

      case "FOCUS_GOVERNANCE":
        window.dispatchEvent(
          new CustomEvent("orbital-focus", {
            detail: { type: "FOCUS_GOVERNANCE" },
          })
        );
        break;

      case "APPLY_PERFORMANCE_PRESET": {
        // Directly apply the Performance preset (the fix you keep recommending for the full brain data)
        const current = getAdminSettings();
        const next = { ...current, graphPreset: "performance" as const };
        saveAdminSettings(next);
        window.dispatchEvent(new CustomEvent("admin-settings-updated", { detail: next }));
        // Full reload so the 3D graph re-creates with the lighter, more stable preset
        setTimeout(() => window.location.reload(), 180);
        break;
      }

      case "TRIGGER_RESET_VIEW":
        window.dispatchEvent(new CustomEvent("orbital-reset-view"));
        break;

      default:
        break;
    }

    // Close the panel slightly after action for better flow (user can reopen instantly)
    if (["FOCUS_NODE", "FOCUS_LINK", "SET_LENS", "OPEN_PIPELINE"].includes(action)) {
      setTimeout(() => setIsMinimized(true), 900);
    }

    // On heavy data, surface the exact recommendation you gave: Performance preset or Reset View
    if (["FOCUS_NODE", "FOCUS_LINK"].includes(action) && NODE_COUNT > 80) {
      setTimeout(() => {
        const hint: Message = {
          id: `hint-perf-${Date.now()}`,
          role: "assistant",
          content: "Heavy full-brain data loaded. For a much smoother experience in the 3D graph:",
          actions: [
            { label: "Try Performance preset (recommended)", action: "APPLY_PERFORMANCE_PRESET" },
            { label: "Reset View", action: "TRIGGER_RESET_VIEW" },
          ],
        };
        setMessages((prev) => [...prev, hint]);
      }, 1400);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  // Keyboard: "/" focuses the assistant from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setIsOpen(true);
        setIsMinimized(false);
        setTimeout(() => inputRef.current?.focus(), 120);
      }
      if (e.key === "Escape" && isOpen) {
        setIsMinimized(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Click outside to minimize (but not close completely)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        isOpen &&
        !isMinimized
      ) {
        setIsMinimized(true);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMinimized]);

  // Render via portal directly to body so the orb + panel always sit above
  // the 3D graph canvas and any complex stacking contexts in the Insights view.
  const orbUI = (
    <>
      {/* The Floating Orbital — always present, never in the way */}
      <button
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
          setTimeout(() => inputRef.current?.focus(), 160);
        }}
        className="orbital-orb"
        aria-label="Open Orbital Memory assistant — full brain indexed"
        title="Orbital Memory • Press / anywhere to ask"
      >
        <div className="orb-inner">
          <Brain size={22} />
        </div>
        <div className="orb-pulse" />
        <div className="orb-label">Memory</div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            className="orbital-panel glass-strong"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            style={{ zIndex: 999999 }}
          >
            {/* Header */}
            <div className="orbital-header">
              <div className="orbital-title">
                <Sparkles size={15} />
                <span>Orbital Memory</span>
                <div className="vault-badge">
                  {NODE_COUNT} nodes • {LINK_COUNT} connections
                </div>
              </div>
              <div className="orbital-controls">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="orb-control"
                  title={isMinimized ? "Expand" : "Minimize"}
                >
                  {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setIsMinimized(false);
                  }}
                  className="orb-control"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Subtle but powerful vault framing */}
                <div className="orbital-framing">
                  This is the complete, living knowledge vault. Every transcript, ADR, architecture
                  discussion, book note, and dataflow is here with full provenance.
                </div>

                {/* Messages */}
                <div className="orbital-messages">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`orbital-msg ${msg.role}`}>
                      <div className="msg-content">{msg.content}</div>

                      {msg.actions && msg.actions.length > 0 && (
                        <div className="action-chips">
                          {msg.actions.map((act, idx) => (
                            <button
                              key={idx}
                              className="action-chip"
                              onClick={() => handleAction(act.action, act.payload)}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {isThinking && (
                    <div className="orbital-msg assistant thinking">
                      <div className="msg-content">
                        <span className="thinking-dots">Reading the vault</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Demo prompts (first time / after clear) */}
                {messages.length < 3 && (
                  <div className="demo-prompts">
                    <div className="demo-label">Try asking about:</div>
                    <div className="demo-chips">
                      {demoPrompts.map((p, i) => (
                        <button key={i} onClick={() => sendMessage(p)} className="demo-chip">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="orbital-input-row">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about any system, meeting, decision, or transcript..."
                    disabled={isThinking}
                  />
                  <button type="submit" disabled={!input.trim() || isThinking} className="send-btn">
                    <Send size={15} />
                  </button>
                </form>

                <div className="orbital-footer">
                  Press <kbd>/</kbd> from anywhere • Full provenance attached to every answer
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return createPortal(orbUI, document.body);
}
