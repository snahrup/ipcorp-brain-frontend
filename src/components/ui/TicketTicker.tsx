// Ported from moumen-soliman/lab `ticket-number-ticker` (MIT), re-skinned to the
// IP Corporation Workbench palette and adapted for Jira issue keys.
//
// The pill hugs its value and grows with it up to a max-width; past the cap it
// MIDDLE-TRUNCATES to `start…end` — the commit-SHA idiom — keeping the two ends
// that identify and disambiguate. How much survives is measured against the
// cap's budget: a hidden clone is binary-searched to the last fit.
//
// Each digit is an odometer reel — a 1em window over a 0-9 strip — snapped to 0
// then released to `10 + digit`, so it scrolls a full turn and lands on target,
// cascading left→right. Bump `runKey` to play it. tabular-nums keeps every
// column exactly 1ch so nothing shifts as it rolls or truncates.
//
// Changed from upstream for this product:
//   - `prefix` prop (default "#"). Jira keys pass "" so the copy button writes
//     exactly `MDM-42` — the whole point is paste-anywhere fidelity.
//   - Mixed-segment reels: upstream only rolls PURE numbers and renders
//     "OPS-2451" as static text. Jira keys are the primary value here, so every
//     digit rolls and every non-digit stays static, with one cascade across the
//     whole visible value.
//   - Dropped the GitHub PR status badge and the demo-only `inspect` overlays.
//   - `framer-motion` imports (the app's motion library; same API surface).

import { MotionConfig, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";

const MEASURE_SAFETY = 2; // px of slack so the value never kisses the clip edge

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_ICON = [0.2, 0, 0, 1] as const;

// The contextual icon swap states (copy ⇄ check).
const ICON_SHOWN = { opacity: 1, scale: 1, filter: "blur(0px)" };
const ICON_HIDDEN = { opacity: 0, scale: 0.25, filter: "blur(4px)" };

// The value's typography, shared verbatim by the visible value and the hidden
// measuring clone so the fit is pixel-accurate.
const VALUE_TYPE = "text-lg font-semibold tracking-[-0.01em] tabular-nums whitespace-nowrap";

export function TicketTicker({
  value = "0",
  prefix = "#",
  runKey = 0,
  width = "max",
  maxWidth = "14rem",
  copyable = true,
  onCopied,
}: {
  /** The ticket id — "1042", "MDM-42", or "ticket name here" (spaces become dashes). */
  value?: string;
  /** Rendered dimmed before the value and included in the copied text. "" for Jira keys. */
  prefix?: string;
  /** Increment to play the odometer run-up. */
  runKey?: number;
  /** "max" hugs the value up to the cap; "fixed" always takes the full cap width. */
  width?: "max" | "fixed";
  /** The cap the pill grows to before middle-truncating. */
  maxWidth?: string;
  copyable?: boolean;
  onCopied?: (copied: string) => void;
}) {
  // Normalise: drop a leading "#", collapse whitespace to "-" (a ticket "name
  // here" is really a slug), trim stray edge dashes.
  const body = String(value)
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fullId = `${prefix}${body}`;

  const pillRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  const [display, setDisplay] = useState({ head: body, tail: "", truncated: false });
  const [copied, setCopied] = useState(false);

  // The value's budget = the pill AT ITS CAP, minus chrome (padding + gap +
  // actions). All of that is constant regardless of the current hug width, so we
  // can compute the cap budget without ever forcing the pill wide.
  function budgetPx() {
    const pill = pillRef.current;
    if (!pill) return 0;
    const cs = getComputedStyle(pill);
    const padX = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight);
    const gap = Number.parseFloat(cs.columnGap || cs.gap) || 0;
    // offsetWidth (layout px) rather than getBoundingClientRect, so an ancestor
    // CSS `scale` never skews the budget.
    const actionsW = actionsRef.current ? actionsRef.current.offsetWidth : 0;
    const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const capPx = (Number.parseFloat(cs.getPropertyValue("--ticket-max")) || 14) * rootPx;
    let parentAvail = Number.POSITIVE_INFINITY;
    const parent = pill.parentElement;
    if (parent) {
      const pcs = getComputedStyle(parent);
      parentAvail =
        parent.clientWidth -
        Number.parseFloat(pcs.paddingLeft) -
        Number.parseFloat(pcs.paddingRight);
    }
    return Math.min(parentAvail, capPx) - padX - gap - actionsW - MEASURE_SAFETY;
  }

  // Measure the longest `start…end` that fits the cap budget and commit it.
  // Runs before paint and on resize / font load — the clone it reads is never
  // the animated value, so there is no measure→render→measure loop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: budgetPx reads refs only; deps list the inputs that change the fit
  useLayoutEffect(() => {
    const cloneEl = measureRef.current;
    if (!pillRef.current || !cloneEl) return undefined;

    const widthOf = (text: string) => {
      cloneEl.textContent = text;
      return cloneEl.scrollWidth;
    };

    const measure = () => {
      const avail = budgetPx();
      if (avail <= 0) return;

      let next: { head: string; tail: string; truncated: boolean };
      if (body.length <= 2 || widthOf(fullId) <= avail) {
        next = { head: body, tail: "", truncated: false };
      } else {
        // Binary-search how many characters (split head-heavy) fit around a "…".
        let lo = 2;
        let hi = body.length - 1;
        let keep = 2;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const head = Math.ceil(mid / 2);
          const tail = mid - head;
          if (
            widthOf(`${prefix}${body.slice(0, head)}…${body.slice(body.length - tail)}`) <= avail
          ) {
            keep = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        const head = Math.ceil(keep / 2);
        const tail = keep - head;
        next = {
          head: body.slice(0, head),
          tail: body.slice(body.length - tail),
          truncated: true,
        };
      }

      setDisplay((prev) =>
        prev.head === next.head && prev.tail === next.tail && prev.truncated === next.truncated
          ? prev
          : next
      );
    };

    measure();
    // Observe the parent (the width source) so a viewport change re-truncates.
    const target = pillRef.current.parentElement || pillRef.current;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(target);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => observer?.disconnect();
  }, [fullId, body, prefix, copyable, maxWidth]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullId);
      setCopied(true);
      onCopied?.(fullId);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked (insecure context / denied) — no-op */
    }
  }

  // Reel indices count digits continuously across head + tail so the run-up
  // cascade flows through the whole visible value, not restarting after the "…".
  let reelIndex = 0;
  const renderChars = (chars: string, side: "h" | "t") =>
    chars.split("").map((char, i) => {
      if (/\d/.test(char)) {
        const index = reelIndex++;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional chars of one immutable string; index+char remounts a changed digit (snap) while a same-digit replay reuses the element (roll via runKey)
          <Reel key={`${side}${i}-${char}`} digit={Number(char)} index={index} runKey={runKey} />
        );
      }
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional chars of one immutable string
        <span key={`${side}${i}-${char}`} className="whitespace-pre">
          {char}
        </span>
      );
    });

  return (
    <MotionConfig reducedMotion="user">
      {/* layout="position": as the hugging pill changes width it glides to its
          new spot instead of snapping — position only, so the width change
          stays instant and a just-changed digit is never clipped. */}
      <motion.div
        ref={pillRef}
        layout="position"
        transition={{ duration: 0.22, ease: EASE }}
        className={[
          "relative inline-flex max-w-[min(100%,var(--ticket-max))] items-center gap-2 rounded-[10px] bg-ipc-panel py-1.5 pl-3 pr-1.5 text-ipc-text transition-shadow duration-200",
          width === "fixed" ? "w-[min(100%,var(--ticket-max))]" : "w-fit",
          "shadow-[inset_0_0_0_1px_#e1e4e8,0_1px_2px_rgba(14,35,56,0.05)] hover:shadow-[inset_0_0_0_1px_#d5d9de,0_2px_6px_rgba(14,35,56,0.09)]",
        ].join(" ")}
        style={{ "--ticket-max": maxWidth } as CSSProperties}
      >
        <div
          className={[
            "relative flex min-w-0 items-center",
            width === "fixed" ? "flex-1" : "flex-[0_1_auto]",
            // The clip is only a safety net; clip-margin leaves slack so
            // sub-pixel flex rounding never shaves the last glyph's right edge.
            "[overflow:clip] [overflow-clip-margin:0.3em]",
          ].join(" ")}
        >
          <span
            className={`inline-flex min-w-0 items-baseline leading-[1.09] ${VALUE_TYPE}`}
            title={fullId}
            aria-hidden="true"
          >
            {prefix && <span className="mr-[0.06em] font-medium text-ipc-muted">{prefix}</span>}
            <span className="inline-flex">
              {renderChars(display.head, "h")}
              {display.truncated && <span className="px-[0.06em] text-ipc-muted">…</span>}
              {renderChars(display.tail, "t")}
            </span>
          </span>

          {/* Hidden clone JS drives to measure candidate widths — same
              typography as the value, so the fit is pixel-accurate. */}
          <span
            className={`pointer-events-none invisible absolute left-0 top-0 ${VALUE_TYPE}`}
            ref={measureRef}
            aria-hidden="true"
          />

          {/* Screen readers get the whole id as text; the visual is aria-hidden. */}
          <span className="sr-only">Ticket {fullId}</span>
        </div>

        {copyable && (
          <div className="inline-flex flex-none items-center" ref={actionsRef}>
            <button
              type="button"
              className="tw-button grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ipc-muted transition-[scale,background-color,color] hover:bg-ipc-bg-2 hover:text-ipc-text active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action"
              onClick={copy}
              aria-label={copied ? "Copied" : `Copy ${fullId}`}
              title={copied ? "Copied" : `Copy ${fullId}`}
            >
              {/* Contextual icon swap: both icons stay in the DOM, stacked in
                  one grid cell, cross-fading on opacity + scale + blur. */}
              <motion.span
                className="inline-flex [grid-area:1/1]"
                initial={false}
                animate={copied ? ICON_HIDDEN : ICON_SHOWN}
                transition={{ duration: 0.3, ease: EASE_ICON }}
              >
                <CopyIcon />
              </motion.span>
              <motion.span
                className="inline-flex text-ipc-green [grid-area:1/1]"
                initial={false}
                animate={copied ? ICON_SHOWN : ICON_HIDDEN}
                transition={{ duration: 0.3, ease: EASE_ICON }}
              >
                <CheckIcon />
              </motion.span>
            </button>
          </div>
        )}
      </motion.div>
    </MotionConfig>
  );
}

// One odometer column. Two 0-9 cycles stacked (20 figures); the strip rests on
// `10 + digit`. A runKey bump snaps it to 0 (no animation) and releases it to
// the target, so it scrolls a full turn before landing — the "run up". The
// per-column delay cascades the settle left→right. Soft-in on remount: a
// changed digit fades + unblurs in instead of hard-cutting.
function Reel({ digit, index, runKey }: { digit: number; index: number; runKey: number }) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const target = `${-(10 + digit)}em`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: replay is keyed to runKey alone — digit/index changes remount the reel instead
  useEffect(() => {
    if (runKey <= 0 || reduced) return;
    controls.set({ y: "0em" });
    controls.start({ y: target, transition: { duration: 0.64, ease: EASE, delay: index * 0.055 } });
  }, [runKey]);

  return (
    <motion.span
      className="relative h-[1em] w-[1ch] overflow-hidden text-center"
      aria-hidden="true"
      initial={{ opacity: 0, filter: "blur(2px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.17, ease: EASE }}
    >
      <motion.span className="flex flex-col" style={{ y: target }} animate={controls}>
        {REEL_FIGURES.map((figure, position) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed 20-entry digit strip that never reorders
          <span className="h-[1em] leading-[1em]" key={position}>
            {figure}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

const REEL_FIGURES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function CopyIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
