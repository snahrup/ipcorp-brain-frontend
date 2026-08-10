import { useEffect } from "react";

/**
 * Freezes the page behind a full-screen overlay for as long as the caller is mounted.
 *
 * On the phone layout the document itself is the scroller, and iOS keeps feeding
 * touch scrolls to it behind a fixed overlay: every drag moves the page underneath,
 * so the overlay's own scroller never gets the gesture and the sheet reads as
 * unscrollable. Pinning the body hands the gesture to the overlay. The pin uses
 * position: fixed rather than overflow: hidden because iOS ignores the latter for
 * touch-driven document scrolling.
 *
 * On desktop the document does not scroll (the workspace panes do), so the pin is
 * invisible there. Scroll position is restored on unmount so the page never jumps.
 */
export function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";
    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.left = previous.left;
      style.right = previous.right;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
