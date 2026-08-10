// Ported from evilrabbit/lifeline (MIT), re-skinned to the Workbench palette.
//
// One column = one day on the rail. The two header rows (`tag`, `label`) must
// keep the exact heights and bottom margins used by LifelineStickyLabels or the
// pinned header column drifts out of line with the columns it labels.

import { type CSSProperties, forwardRef } from "react";

import type { Detail } from "../../types/brain";
import {
  getLifelineEventDetail,
  getLifelineEventKey,
  getLifelineEventLane,
  getLifelineEventNote,
  LANE_META,
  LifelineEventText,
} from "./lifeline-event";
import { aggregateLifelinePeople, LifelinePeople } from "./lifeline-people";
import { cx } from "./lifeline-utils";
import type { LifelineEvent, LifelineMarker } from "./types";

function LifelineEventRow({
  event,
  onOpenDetail,
}: {
  event: LifelineEvent;
  onOpenDetail?: (detail: Detail) => void;
}) {
  const lane = getLifelineEventLane(event);
  const note = getLifelineEventNote(event);
  const detail = getLifelineEventDetail(event);
  const accent = lane ? LANE_META[lane].bar : "bg-ipc-line-strong";

  const body = (
    <>
      <span
        className={cx("mt-[3px] h-[15px] w-[2px] shrink-0 rounded-full", accent)}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <LifelineEventText
          event={event}
          className="block text-left text-[13.5px] leading-[1.5] tracking-[-0.01em] text-ipc-text-soft transition-colors duration-300 group-hover:text-ipc-text"
        />
        {note && (
          <span className="mt-1 line-clamp-2 block text-left text-[11.5px] leading-[1.45] text-ipc-muted">
            {note}
          </span>
        )}
      </span>
    </>
  );

  if (detail && onOpenDetail) {
    return (
      <button
        type="button"
        // Pointer capture during a rail drag retargets clicks to the section,
        // so anything clickable has to opt out of drag-start explicitly.
        data-lifeline-interactive=""
        onClick={() => onOpenDetail(detail)}
        className="tw-button -mx-2 flex w-full max-w-[19rem] cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-ipc-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action"
      >
        {body}
      </button>
    );
  }

  return (
    <div className="-mx-2 flex w-full max-w-[19rem] items-start gap-2.5 px-2 py-1.5">{body}</div>
  );
}

interface LifelineMarkerColumnProps {
  marker: LifelineMarker;
  baseline: number;
  minWidth: number;
  animateIntro?: boolean;
  introDelay?: number;
  introDuration?: number;
  onOpenDetail?: (detail: Detail) => void;
}

export const LifelineMarkerColumn = forwardRef<HTMLDivElement, LifelineMarkerColumnProps>(
  function LifelineMarkerColumn(
    {
      marker,
      baseline,
      minWidth,
      animateIntro = false,
      introDelay = 0,
      introDuration = 420,
      onOpenDetail,
    },
    ref
  ) {
    const tag = marker.tag ?? marker.unit - baseline;
    const people = aggregateLifelinePeople(marker);

    // A day column is a labelled group of records. role="group" is what makes
    // aria-label valid on a div; the elements Biome would swap in (fieldset,
    // optgroup, address) are all semantically wrong here, and the scroll hook's
    // marker refs are typed HTMLDivElement.
    return (
      // biome-ignore lint/a11y/useSemanticElements: role="group" on a div is the right fit (see above)
      <div
        ref={ref}
        role="group"
        className="group relative shrink-0 pr-8 transition-opacity duration-300 ease-out"
        style={{ width: minWidth }}
        aria-label={marker.label ?? String(marker.unit)}
      >
        <div
          className={cx("relative", animateIntro && "lifeline-marker-intro")}
          style={{
            animationDelay: animateIntro ? `${introDelay}ms` : undefined,
            ...(animateIntro
              ? ({ "--lifeline-marker-fade-ms": `${introDuration}ms` } as CSSProperties)
              : {}),
          }}
        >
          <span
            className="absolute left-0 top-[var(--lifeline-rail)] z-10 h-[10px] w-px -translate-y-1/2 bg-ipc-line-strong transition-colors duration-300 group-hover:bg-ipc-action"
            aria-hidden="true"
          />

          <div className="flex w-full flex-col items-start text-left">
            <p className="mb-5 h-4 text-[11px] font-medium leading-4 tabular-nums text-ipc-muted transition-colors duration-300 group-hover:text-ipc-support">
              {tag}
            </p>

            <p className="mb-6 h-5 whitespace-nowrap text-[15px] font-semibold leading-5 tabular-nums text-ipc-text-soft transition-colors duration-300 group-hover:text-ipc-navy">
              {marker.label ?? marker.unit}
            </p>

            <div className="relative w-full pb-10">
              {/* When this column carries people, the content block reserves the
                  band's height as a floor: short and average columns put their
                  attendees on the same line as every other column, and a column
                  whose events run past the floor pushes its own attendees below
                  them instead of under them. */}
              <div
                className={cx(
                  "flex w-full flex-col items-start gap-1 pt-6",
                  people.length > 0 && "min-h-[var(--lifeline-people-top)] pb-6"
                )}
              >
                {marker.events.map((event, index) => (
                  <LifelineEventRow
                    key={getLifelineEventKey(event, index)}
                    event={event}
                    onOpenDetail={onOpenDetail}
                  />
                ))}
              </div>

              {people.length > 0 && (
                <div className="w-full border-t border-ipc-line pt-4">
                  <LifelinePeople people={people} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
