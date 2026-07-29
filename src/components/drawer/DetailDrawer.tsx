import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { Detail } from "../../types/brain";
import { DetailContent } from "./DetailContent";

interface DetailDrawerProps {
  detail: Detail | null;
  onClose: () => void;
}

function detailTitle(detail: Detail) {
  if (detail.kind === "packet") return detail.value.title;
  if (detail.kind === "insight") return detail.value.title;
  if (detail.kind === "proposal") return detail.value.title;
  if (detail.kind === "question") return detail.value.question;
  if (detail.kind === "risk") return detail.value.risk;
  if (detail.kind === "meeting") return detail.value.title;
  if ("title" in detail.value) return detail.value.title;
  return detail.label;
}

export function DetailDrawer({ detail, onClose }: DetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!detail) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    drawer
      ?.querySelector<HTMLElement>("button, a, input, select, textarea, [tabindex='0']")
      ?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"
        )
      );
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [detail, onClose]);

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          className="drawer-layer"
          data-detail-kind={detail.kind}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="drawer-scrim"
            onClick={onClose}
            aria-label="Close details"
          />
          <motion.aside
            ref={drawerRef}
            className={`detail-drawer detail-drawer-${detail.kind}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-drawer-title"
            tabIndex={-1}
            initial={{ y: 18, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 18, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="drawer-toolbar">
              <span id="detail-drawer-title" className="mono-kicker">
                {detailTitle(detail)}
              </span>
              <button
                type="button"
                data-testid="drawer-close"
                className="drawer-close"
                onClick={onClose}
                aria-label="Close details"
              >
                ×
              </button>
            </div>
            <DetailContent detail={detail} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
