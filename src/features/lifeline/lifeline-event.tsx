// Ported from evilrabbit/lifeline (MIT), re-skinned to the IP Corporation
// Workbench palette. Upstream's hover-image and fireworks affordances are gone;
// an event's optional payload here opens the shared detail drawer instead.

import type { LifelineEvent, LifelineEventSegment, LifelineLane } from "./types";

/** Lane accent + legend copy. Colors come from the @theme block in tailwind.css. */
export const LANE_META: Record<LifelineLane, { label: string; dot: string; bar: string }> = {
  meeting: {
    label: "Meetings",
    dot: "bg-lane-meeting",
    bar: "bg-lane-meeting",
  },
  decision: {
    label: "Decisions",
    dot: "bg-lane-decision",
    bar: "bg-lane-decision",
  },
  candidate: {
    label: "Flagged for decision",
    dot: "bg-lane-candidate",
    bar: "bg-lane-candidate",
  },
  insight: {
    label: "Insights",
    dot: "bg-lane-insight",
    bar: "bg-lane-insight",
  },
  risk: {
    label: "Risks reviewed",
    dot: "bg-lane-risk",
    bar: "bg-lane-risk",
  },
};

export const LANE_ORDER: LifelineLane[] = ["meeting", "decision", "candidate", "insight", "risk"];

function isEventObject(event: LifelineEvent): event is Extract<LifelineEvent, { text: unknown }> {
  return typeof event === "object" && !Array.isArray(event) && "text" in event;
}

function getEventContent(event: LifelineEvent): string | LifelineEventSegment[] {
  return isEventObject(event) ? event.text : event;
}

export function getLifelineEventLane(event: LifelineEvent): LifelineLane | undefined {
  return isEventObject(event) ? event.lane : undefined;
}

export function getLifelineEventNote(event: LifelineEvent): string | undefined {
  return isEventObject(event) ? event.note : undefined;
}

export function getLifelineEventDetail(event: LifelineEvent) {
  return isEventObject(event) ? event.detail : undefined;
}

export function LifelineEventText({
  event,
  className,
}: {
  event: LifelineEvent;
  className?: string;
}) {
  const content = getEventContent(event);

  if (typeof content === "string") {
    return <span className={className}>{content}</span>;
  }

  return (
    <span className={className}>
      {/* Index keys are correct here: a segment list is a fixed, ordered
          decomposition of one string — never inserted into, removed from, or
          reordered — and two segments may carry identical text, so position is
          the only distinguishing property. */}
      {content.map((segment, index) =>
        segment.type === "link" ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: positional segments of one immutable string (see above)
            key={`${index}-${segment.value}`}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-ipc-line-strong underline-offset-2 transition-colors duration-300 group-hover:text-ipc-action group-hover:decoration-ipc-action"
          >
            {segment.value}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional segments of one immutable string (see above)
          <span key={`${index}-${segment.value}`}>{segment.value}</span>
        )
      )}
    </span>
  );
}

export function getLifelineEventKey(event: LifelineEvent, index: number) {
  const content = getEventContent(event);

  if (typeof content === "string") return `${index}-${content}`;

  return `${index}-${content.map((segment) => segment.value).join("")}`;
}
