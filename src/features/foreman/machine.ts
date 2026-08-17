// Foreman Briefing chapter state machine. Track FB-1.
// Spec: docs/brainstorm/2026-08-17-foreman-briefing-spec.md section 3.
// Pure transitions only; navigation may move the stage, but nothing in here
// executes an action. Resumability = serialize/restore round-trips.

export type BriefingStage =
  | { kind: "arrival" }
  | { kind: "orientation" }
  | { kind: "changes" }
  | { kind: "item"; index: number }
  | { kind: "day-plan" }
  | { kind: "clear" }
  | { kind: "quick-brief" };

const SIMPLE_KINDS = [
  "arrival",
  "orientation",
  "changes",
  "day-plan",
  "clear",
  "quick-brief",
] as const;
type SimpleKind = (typeof SIMPLE_KINDS)[number];

function isSimpleKind(value: string): value is SimpleKind {
  return (SIMPLE_KINDS as readonly string[]).includes(value);
}

export function nextStage(stage: BriefingStage, itemCount: number): BriefingStage {
  switch (stage.kind) {
    case "arrival":
      return { kind: "orientation" };
    case "orientation":
      return { kind: "changes" };
    case "changes":
      return itemCount > 0 ? { kind: "item", index: 0 } : { kind: "day-plan" };
    case "item":
      return stage.index + 1 < itemCount
        ? { kind: "item", index: stage.index + 1 }
        : { kind: "day-plan" };
    case "day-plan":
      return { kind: "clear" };
    case "clear":
      return { kind: "clear" };
    case "quick-brief":
      return { kind: "quick-brief" };
  }
}

export function toQuickBrief(): BriefingStage {
  return { kind: "quick-brief" };
}

export function serializeStage(stage: BriefingStage): string {
  return stage.kind === "item" ? `item:${stage.index}` : stage.kind;
}

export function restoreStage(raw: string | null, itemCount: number): BriefingStage {
  if (!raw) return { kind: "arrival" };
  if (raw.startsWith("item:")) {
    const index = Number.parseInt(raw.slice("item:".length), 10);
    if (!Number.isFinite(index) || index < 0 || itemCount === 0) return { kind: "arrival" };
    return { kind: "item", index: Math.min(index, itemCount - 1) };
  }
  if (isSimpleKind(raw)) return { kind: raw };
  return { kind: "arrival" };
}
