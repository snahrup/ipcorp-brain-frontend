import { useMemo, useState } from "react";

import { WorkspaceHero } from "../components/workbench/WorkspaceHero";
import { LANE_META, LANE_ORDER, Lifeline, type LifelineLane } from "../features/lifeline";
import { buildBrainTimeline, filterTimelineByLanes } from "../features/lifeline/brainTimeline";
import type { Detail } from "../types/brain";

interface TimelineViewProps {
  openDetail: (detail: Detail) => void;
}

// The seed is a static import, so the chronology is built once per session
// rather than on every render.
const timeline = buildBrainTimeline();

export function TimelineView({ openDetail }: TimelineViewProps) {
  const [activeLanes, setActiveLanes] = useState<Set<LifelineLane>>(() => new Set(LANE_ORDER));

  const markers = useMemo(
    () => filterTimelineByLanes(timeline.markers, activeLanes),
    [activeLanes]
  );

  const toggleLane = (lane: LifelineLane) => {
    setActiveLanes((current) => {
      const next = new Set(current);
      // Never leave every lane off — an empty rail reads as broken rather than
      // as filtered, so the last active lane cannot be switched off.
      if (next.has(lane)) {
        if (next.size === 1) return current;
        next.delete(lane);
      } else {
        next.add(lane);
      }
      return next;
    });
  };

  const shownEvents = markers.reduce((sum, marker) => sum + marker.events.length, 0);
  const totalEvents = Object.values(timeline.laneCounts).reduce((sum, n) => sum + n, 0);
  const undatedTotal = Object.values(timeline.undated).reduce((sum, n) => sum + n, 0);

  return (
    <div className="wb-page" data-testid="timeline-view">
      <WorkspaceHero
        kicker="Timeline"
        title="See the order things actually happened in."
        stats={[
          { label: "Days on the rail", value: timeline.dayCount },
          { label: "Records placed", value: totalEvents },
          { label: "Meetings", value: timeline.laneCounts.meeting },
          { label: "Decisions", value: timeline.laneCounts.decision },
          ...(timeline.firstDay && timeline.lastDay
            ? [
                {
                  label: "Span",
                  value: `${timeline.firstDay} to ${timeline.lastDay}`,
                  wide: true,
                } as const,
              ]
            : []),
        ]}
      />

      <section className="overflow-hidden rounded-[14px] border border-ipc-line bg-ipc-panel shadow-[0_1px_2px_rgba(14,35,56,0.06)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ipc-line bg-ipc-panel-soft px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {LANE_ORDER.map((lane) => {
              const meta = LANE_META[lane];
              const count = timeline.laneCounts[lane];
              const isOn = activeLanes.has(lane);

              return (
                <button
                  key={lane}
                  type="button"
                  onClick={() => toggleLane(lane)}
                  aria-pressed={isOn}
                  disabled={count === 0}
                  className={[
                    // No .tw-button here: the chip declares its own border and
                    // background, and the reset's `border: 0` would remove the
                    // pill outline it depends on.
                    "inline-flex appearance-none items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action",
                    count === 0
                      ? "cursor-not-allowed border-ipc-line text-ipc-muted opacity-60"
                      : isOn
                        ? "cursor-pointer border-ipc-navy bg-ipc-navy text-white"
                        : "cursor-pointer border-ipc-line bg-ipc-panel text-ipc-text-soft hover:border-ipc-line-strong hover:bg-ipc-bg-2",
                  ].join(" ")}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${meta.dot} ${
                      isOn ? "ring-1 ring-white/70" : ""
                    }`}
                    aria-hidden="true"
                  />
                  {meta.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <p className="ml-auto text-[11.5px] leading-snug text-ipc-muted">
            Showing {shownEvents} of {totalEvents} records across {markers.length} of{" "}
            {timeline.dayCount} days
          </p>
        </div>

        {markers.length === 0 ? (
          <div className="px-5 py-16 text-center text-[13px] text-ipc-muted">
            No dated records in the current selection.
          </div>
        ) : (
          <div
            // The horizontal rail needs a bounded stage: it measures its own box
            // to decide how far the track can travel and where markers fade.
            className="relative w-full"
            style={{ height: "min(62vh, 640px)" }}
          >
            <Lifeline
              markers={markers}
              baseline={timeline.baseline}
              // Embedded: the wheel scrubs the rail while there is rail left,
              // then hands scrolling back to the workspace at either end.
              mode="embed"
              title="Brain chronology"
              tagLabel="Week"
              unitLabel="Day"
              onOpenDetail={openDetail}
            />
          </div>
        )}
      </section>

      <p className="max-w-[900px] text-[11.5px] leading-relaxed text-ipc-muted">
        Every entry is one exported Brain record, placed on the day its own date field gives. Days
        with no record have no marker, so the spacing between columns is real elapsed time. Drag the
        rail, scroll over it, or use the arrow keys once it has focus. Selecting an entry opens its
        full record.
        {undatedTotal > 0 && (
          <>
            {" "}
            {undatedTotal} record{undatedTotal === 1 ? "" : "s"} carry no usable date and are not
            shown:{" "}
            {LANE_ORDER.filter((lane) => timeline.undated[lane] > 0)
              .map((lane) => `${timeline.undated[lane]} ${LANE_META[lane].label.toLowerCase()}`)
              .join(", ")}
            .
          </>
        )}
      </p>
    </div>
  );
}
