// Ported from evilrabbit/lifeline (MIT), re-skinned. The two header rows must
// line up exactly with the `tag` and `label` rows in every marker column, so the
// heights and bottom margins here are load-bearing: change one, change both.

import { LIFELINE_LABEL_COLUMN_WIDTH } from "./lifeline-metrics";

export function LifelineStickyLabels({
  tagLabel = "Week",
  unitLabel = "Day",
}: {
  tagLabel?: string;
  unitLabel?: string;
}) {
  return (
    <div className="relative" style={{ width: LIFELINE_LABEL_COLUMN_WIDTH }} aria-hidden="true">
      <div className="flex flex-col items-start text-left">
        <p className="mb-5 h-4 text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-ipc-muted">
          {tagLabel}
        </p>
        <p className="mb-6 h-5 text-[11px] font-medium uppercase leading-5 tracking-[0.08em] text-ipc-muted">
          {unitLabel}
        </p>
      </div>
    </div>
  );
}
