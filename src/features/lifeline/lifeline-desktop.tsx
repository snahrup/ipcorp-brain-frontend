// Ported from evilrabbit/lifeline (MIT), re-skinned. The horizontal rail: the
// track is one wide flex row moved by transform, with a pinned label column
// shielding its head.

import { type CSSProperties, useMemo } from "react";

import type { Detail } from "../../types/brain";
import { LifelineStickyLabels } from "./lifeline-labels";
import { LifelineMarkerColumn } from "./lifeline-marker";
import { LIFELINE_STICKY_SHIELD_WIDTH } from "./lifeline-metrics";
import { cx, getMarkerWidth } from "./lifeline-utils";
import type { LifelineProps } from "./types";
import { useLifelineIntro } from "./use-lifeline-intro";
import { useLifelineScroll } from "./use-lifeline-scroll";

export function LifelineDesktop({
  markers,
  baseline,
  className,
  title = "Timeline",
  mode = "auto",
  tagLabel,
  unitLabel,
  onOpenDetail,
}: LifelineProps & { onOpenDetail?: (detail: Detail) => void }) {
  const widths = useMemo(
    () => markers.map((marker, index) => getMarkerWidth(marker, markers[index + 1]?.unit)),
    [markers]
  );

  const intro = useLifelineIntro(widths);
  const isIntroAnimating = intro.shouldPlay && intro.isPlaying;

  const { sectionRef, trackRef, labelsRef, setMarkerRef, isLayoutReady, isEmbed, introArmed } =
    useLifelineScroll(markers.length, {
      mode,
      introLocked: isIntroAnimating,
      introAnimating: isIntroAnimating,
      introSkipped: !intro.shouldPlay,
      introRailMs: intro.railDuration,
      introGetTrackProgress: intro.getTrackProgressAtTime,
      onIntroScrollStart: intro.startIntroTimer,
      onIntroSettleComplete: intro.completeIntro,
    });

  // Embedded, the open waits for the module to come into view: the marker fades
  // are CSS animations that start the moment their class lands, so applying it
  // early would spend them below the fold.
  const introWaitingInView = isEmbed && intro.shouldPlay && !introArmed;
  const showIntro = isIntroAnimating && isLayoutReady && !introWaitingInView;

  const trackWidth = LIFELINE_STICKY_SHIELD_WIDTH + widths.reduce((sum, width) => sum + width, 0);

  const introStyle = {
    "--lifeline-labels-ms": `${intro.labelsDuration}ms`,
    "--lifeline-rail-ms": `${intro.railDuration}ms`,
  } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      data-lifeline-mode={isEmbed ? "embed" : "page"}
      // Embedded, the module needs a tab stop to be operable at all.
      tabIndex={isEmbed ? 0 : undefined}
      className={cx(
        "relative h-full min-h-0 select-none overflow-hidden",
        isEmbed &&
          // pan-y lets the browser start a vertical page scroll on the first
          // frame instead of waiting on the JS axis lock; horizontal is ours.
          "touch-pan-y focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action",
        // Hold it blank rather than showing a settled timeline that then resets
        // itself to play the intro.
        (!isLayoutReady || introWaitingInView) && "invisible",
        className
      )}
      aria-label={title}
      style={showIntro ? introStyle : undefined}
    >
      <div
        className="flex h-full items-center overflow-hidden"
        // `safe center` where the browser understands it: a track taller than
        // its box would otherwise overflow equally top and bottom, and since the
        // section clips, the first thing lost is the header row. `safe` falls
        // back to start-alignment exactly in that case.
        style={isEmbed ? { alignItems: "safe center" } : undefined}
      >
        <div
          ref={trackRef}
          className="relative flex w-max items-start will-change-transform [--lifeline-people-top:calc(14.5rem+40px)] [--lifeline-rail:5rem]"
          style={{ width: trackWidth }}
        >
          {/* The shield paints an opaque column at the head of the track:
              once the track scrolls, marker text passes underneath and would
              otherwise read straight through the two headers. */}
          <div
            ref={labelsRef}
            className="lifeline-labels shrink-0 bg-ipc-panel will-change-transform"
            style={{ width: LIFELINE_STICKY_SHIELD_WIDTH }}
          >
            <div className={cx(showIntro && "lifeline-labels-intro")}>
              <LifelineStickyLabels tagLabel={tagLabel} unitLabel={unitLabel} />
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[var(--lifeline-rail)] h-px overflow-hidden"
            >
              <div
                className={cx(
                  "h-px w-full border-t border-dashed border-ipc-line-strong",
                  showIntro && "lifeline-rail-intro"
                )}
              />
            </div>

            <div className="relative flex items-start">
              {markers.map((marker, index) => (
                <LifelineMarkerColumn
                  key={marker.id}
                  ref={(node) => setMarkerRef(index, node)}
                  marker={marker}
                  baseline={baseline}
                  minWidth={widths[index]}
                  animateIntro={showIntro}
                  introDelay={intro.getMarkerDelay(index)}
                  introDuration={intro.getMarkerFadeDuration(index)}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
