// Ported from evilrabbit/lifeline (MIT), re-skinned and simplified. The
// narrow-viewport layout: the same chronology as a vertical list, where the rail
// is a scroll position rather than a transform. Upstream's tap-to-open lightbox
// and photo cards are gone with the rest of the media affordances.

import { type CSSProperties, forwardRef, useEffect, useMemo } from "react";

import {
  getLifelineEventDetail,
  getLifelineEventKey,
  getLifelineEventLane,
  getLifelineEventNote,
  LANE_META,
  LifelineEventText,
} from "./lifeline-event";
import { aggregateLifelinePeople, LifelinePeople } from "./lifeline-people";
import { cx, getMarkerHeight, hasMarkerContent } from "./lifeline-utils";
import type { LifelineEvent, LifelineMarker, LifelineProps } from "./types";
import { useLifelineIntro } from "./use-lifeline-intro";
import { useLifelineVerticalScroll } from "./use-lifeline-vertical-scroll";

const GRID_CLASS = "grid grid-cols-[2.5rem_1rem_1fr] gap-x-3";
const RAIL_LEFT = "calc(2.5rem + 0.75rem + 0.5rem)";

/**
 * Above this many entries the delay-armed intro fades would promote every entry
 * to a compositor layer at once and crash mobile Safari's compositor. Long
 * timelines fade entries in as they enter the viewport during the auto-scroll
 * instead — same look, but only a handful of live animations at any moment.
 */
const MAX_ARMED_ENTRIES = 80;

function RailTick() {
  return (
    <span
      aria-hidden="true"
      className="block h-px w-[10px] bg-ipc-line-strong transition-colors duration-300"
    />
  );
}

function LifelineVerticalEvent({
  event,
  onOpenDetail,
}: {
  event: LifelineEvent;
  onOpenDetail?: LifelineProps["onOpenDetail"];
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
          className="block text-left text-[13.5px] leading-[1.5] tracking-[-0.01em] text-ipc-text-soft"
        />
        {note && (
          <span className="mt-1 line-clamp-3 block text-left text-[11.5px] leading-[1.45] text-ipc-muted">
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
        data-lifeline-interactive=""
        onClick={() => onOpenDetail(detail)}
        className="tw-button -mx-2 flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-200 active:bg-ipc-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action"
      >
        {body}
      </button>
    );
  }

  return <div className="-mx-2 flex w-full items-start gap-2.5 px-2 py-1.5">{body}</div>;
}

const LifelineVerticalEntry = forwardRef<
  HTMLLIElement,
  {
    marker: LifelineMarker;
    baseline: number;
    animateIntro?: boolean;
    introDelay?: number;
    introDuration?: number;
    revealPending?: boolean;
    onOpenDetail?: LifelineProps["onOpenDetail"];
  }
>(function LifelineVerticalEntry(
  {
    marker,
    baseline,
    animateIntro = false,
    introDelay = 0,
    introDuration = 420,
    revealPending = false,
    onOpenDetail,
  },
  ref
) {
  const tag = marker.tag ?? marker.unit - baseline;
  const people = aggregateLifelinePeople(marker);
  const hasContent = hasMarkerContent(marker);

  return (
    <li
      ref={ref}
      className={hasContent ? "pb-10" : "pb-3"}
      aria-label={marker.label ?? String(marker.unit)}
    >
      <div
        className={cx(animateIntro && "lifeline-marker-intro", revealPending && "opacity-0")}
        style={{
          animationDelay: animateIntro ? `${introDelay}ms` : undefined,
          ...(animateIntro
            ? ({ "--lifeline-marker-fade-ms": `${introDuration}ms` } as CSSProperties)
            : {}),
        }}
      >
        <div className={`${GRID_CLASS} items-center`}>
          <p className="text-right text-[11px] font-medium leading-4 tabular-nums text-ipc-muted">
            {tag}
          </p>

          <div className="flex items-center justify-center">
            <RailTick />
          </div>

          <p className="whitespace-nowrap text-[15px] font-semibold leading-5 tabular-nums text-ipc-text-soft">
            {marker.label ?? marker.unit}
          </p>
        </div>

        {hasContent && (
          <div className={`${GRID_CLASS} mt-5`}>
            <div aria-hidden="true" />
            <div aria-hidden="true" />
            <div className="min-w-0">
              {marker.events.length > 0 && (
                <div className="space-y-1">
                  {marker.events.map((event, index) => (
                    <LifelineVerticalEvent
                      key={getLifelineEventKey(event, index)}
                      event={event}
                      onOpenDetail={onOpenDetail}
                    />
                  ))}
                </div>
              )}

              {people.length > 0 && (
                <div className="mt-5 border-t border-ipc-line pt-4">
                  <LifelinePeople people={people} allowWrap />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
});

export function LifelineVertical({
  markers,
  baseline,
  title = "Timeline",
  mode = "auto",
  tagLabel = "Week",
  unitLabel = "Day",
  onOpenDetail,
}: LifelineProps) {
  // Only an explicit `mode` embeds the vertical layout. `"auto"` measures
  // scrollability on desktop, but the mobile layout *is* a vertical scroller
  // inside a scrolling stage, so that test would read every full-page timeline
  // as embedded and drop its intro.
  const isEmbed = mode === "embed";
  const heights = useMemo(
    () => markers.map((marker, index) => getMarkerHeight(marker, markers[index + 1]?.unit)),
    [markers]
  );

  const intro = useLifelineIntro(heights);
  const isIntroAnimating = intro.shouldPlay && intro.isPlaying;

  const { sectionRef, setEntryRef, isLayoutReady } = useLifelineVerticalScroll(markers.length, {
    isEmbed,
    introLocked: isIntroAnimating,
    introAnimating: isIntroAnimating,
    // Embedded, the sweep would play out unseen below the fold — and lock the
    // module's own scroller while doing it.
    introSkipped: !intro.shouldPlay || isEmbed,
    introRailMs: intro.railDuration,
    introGetTrackProgress: intro.getTrackProgressAtTime,
    onIntroScrollStart: intro.startIntroTimer,
    onIntroSettleComplete: intro.completeIntro,
  });

  const showIntro = isIntroAnimating && isLayoutReady && !isEmbed;
  const revealOnScroll = markers.length > MAX_ARMED_ENTRIES;
  const animateEntries = showIntro && !revealOnScroll;

  // Rail-synced fades for long timelines: entries render hidden and each one
  // fades in the moment the rail tip (--lifeline-intro-progress, written every
  // frame by the intro scroll) crosses its position — desktop's choreography,
  // but each entry drops its animation (and compositor layer) as soon as its
  // fade finishes.
  useEffect(() => {
    if (!showIntro || !revealOnScroll) return;
    const section = sectionRef.current;
    const list = section?.querySelector("ol");
    if (!section || !list) return;

    const entries = Array.from(list.children) as HTMLElement[];
    const targets = entries.map((li) => li.firstElementChild as HTMLElement | null);

    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName !== "lifeline-marker-in") return;
      (event.target as HTMLElement).classList.remove("lifeline-marker-intro");
    };
    section.addEventListener("animationend", onAnimationEnd);

    let next = 0;
    let frame = 0;
    const tick = () => {
      const progress = Number.parseFloat(
        section.style.getPropertyValue("--lifeline-intro-progress") || "0"
      );
      const tip = progress * list.offsetHeight;

      while (next < entries.length && entries[next].offsetTop <= tip) {
        const el = targets[next];
        if (el) {
          el.classList.remove("opacity-0");
          el.classList.add("lifeline-marker-intro");
        }
        next++;
      }

      if (next < entries.length) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      section.removeEventListener("animationend", onAnimationEnd);
      targets.forEach((el) => {
        el?.classList.remove("opacity-0", "lifeline-marker-intro");
      });
    };
  }, [showIntro, revealOnScroll, sectionRef]);

  const introStyle = {
    "--lifeline-labels-ms": `${intro.labelsDuration}ms`,
    "--lifeline-rail-ms": `${intro.railDuration}ms`,
  } as CSSProperties;

  return (
    <article
      ref={sectionRef}
      aria-label={title}
      className={cx("relative select-none px-5 pb-10 pt-4", !isLayoutReady && "invisible")}
      style={showIntro ? introStyle : undefined}
    >
      <div className={cx(`${GRID_CLASS} mb-6 items-end`, showIntro && "lifeline-labels-intro")}>
        <p className="text-right text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-ipc-muted">
          {tagLabel}
        </p>
        <div aria-hidden="true" />
        <p className="text-[11px] font-medium uppercase leading-5 tracking-[0.08em] text-ipc-muted">
          {unitLabel}
        </p>
      </div>

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 top-0 -translate-x-1/2 overflow-hidden"
          style={{ left: RAIL_LEFT, width: 1 }}
        >
          <div
            className={cx(
              "h-full w-px border-l border-dashed border-ipc-line-strong",
              showIntro && "lifeline-rail-intro-vertical"
            )}
          />
        </div>

        <ol className="relative">
          {markers.map((marker, index) => (
            <LifelineVerticalEntry
              key={marker.id}
              ref={(node) => setEntryRef(index, node)}
              marker={marker}
              baseline={baseline}
              animateIntro={animateEntries}
              revealPending={showIntro && revealOnScroll}
              introDelay={intro.getMarkerDelay(index)}
              introDuration={intro.getMarkerFadeDuration(index)}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </ol>
      </div>
    </article>
  );
}
