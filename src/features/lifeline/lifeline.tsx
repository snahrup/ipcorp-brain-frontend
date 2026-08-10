// Ported from evilrabbit/lifeline (MIT). Picks the layout from viewport width
// and nothing else: the horizontal rail needs room to be legible, and below the
// breakpoint the same chronology reads better as a vertical list.

import { useLayoutEffect, useState } from "react";
import { LifelineDesktop } from "./lifeline-desktop";
import { LIFELINE_MOBILE_BREAKPOINT } from "./lifeline-metrics";
import { cx } from "./lifeline-utils";
import { LifelineVertical } from "./lifeline-vertical";
import type { LifelineProps } from "./types";

export function Lifeline(props: LifelineProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const query = window.matchMedia(`(min-width: ${LIFELINE_MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(!query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // One frame of nothing beats one frame of the wrong layout: both branches own
  // a scroll position, and mounting the wrong one first makes it visibly jump.
  if (isMobile === null) {
    return <div className="invisible h-full" aria-hidden="true" />;
  }

  if (isMobile) {
    return (
      // Embedded, the vertical timeline gets its own bounded scroller: the
      // consumer's height lands here, and this element becomes the scroll parent
      // the vertical hook looks for. Native overscroll chaining then releases to
      // the page at either end. Page mode is left alone — the host's own
      // scroller owns it there, and h-full would only fight it.
      <div
        className={
          props.mode === "embed"
            ? cx("lifeline-typeset h-full overflow-y-auto pt-4", props.className)
            : "lifeline-typeset pt-4"
        }
      >
        <LifelineVertical {...props} />
      </div>
    );
  }

  return <LifelineDesktop {...props} className={cx("lifeline-typeset pt-4", props.className)} />;
}
