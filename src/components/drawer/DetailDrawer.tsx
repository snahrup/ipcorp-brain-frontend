import { AnimatePresence, motion } from "framer-motion";
import type { Detail } from "../../types/brain";
import { DetailContent } from "./DetailContent";

interface DetailDrawerProps {
  detail: Detail | null;
  onClose: () => void;
}

export function DetailDrawer({ detail, onClose }: DetailDrawerProps) {
  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          className="drawer-layer"
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
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            initial={{ x: 520, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 520, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="drawer-toolbar">
              <span className="mono-kicker">Details</span>
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
