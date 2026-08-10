import { useEffect, useState } from "react";
import type { AgentRun } from "./AgentDispatchButton";

/** Plain-language names, because Read/Bash/Grep mean nothing to most of the team. */
const ACTION_LABEL: Record<string, string> = {
  Read: "Reading a file",
  Write: "Writing a file",
  Edit: "Editing a file",
  Bash: "Running a command",
  PowerShell: "Running a command",
  Shell: "Running a command",
  Glob: "Looking for files",
  Grep: "Searching the files",
  Search: "Searching",
  WebFetch: "Reading a page",
  WebSearch: "Searching the web",
  Task: "Working a sub-task",
  TodoWrite: "Planning the work",
};

/** Shared with AgentTranscript so the activity line and the conversation panel never disagree. */
export function describeAction(tool?: string | null) {
  if (!tool) return null;
  return ACTION_LABEL[tool] ?? tool;
}

function elapsed(fromIso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
}

/**
 * Proof that a live run is actually moving.
 *
 * A headless agent can work silently through dozens of tool calls before it says
 * anything, so the conversation alone can sit empty for minutes on a perfectly healthy
 * run. Without this the only signal is a spinner, and a spinner that never changes is
 * indistinguishable from a hang. The step count and the running clock always advance,
 * so there is never a moment where a working run looks broken.
 */
export function AgentActivity({ run }: { run: AgentRun | null }) {
  // Local tick so the clock keeps moving between polls rather than jumping.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!run) return null;

  const steps = run.steps ?? 0;
  // Before the first tool call there is still the clock, so something always moves.
  const doing = describeAction(run.lastAction) ?? "Getting started";

  return (
    <p className="wb-agent-activity">
      <span className="wb-agent-pulse" aria-hidden="true" />
      <span className="wb-agent-doing">{doing}</span>
      <span className="wb-agent-sep" aria-hidden="true">
        ·
      </span>
      <span>
        {steps} {steps === 1 ? "step" : "steps"}
      </span>
      <span className="wb-agent-sep" aria-hidden="true">
        ·
      </span>
      <time dateTime={run.startedAt}>{elapsed(run.startedAt, now)}</time>
    </p>
  );
}
