import type { ReactNode } from "react";

interface StatusChipProps {
  label: string;
  tone?: string;
  icon?: ReactNode;
  compact?: boolean;
}

export function StatusChip({ label, tone = "neutral", icon, compact = false }: StatusChipProps) {
  return (
    <span className={`status-chip tone-${tone} ${compact ? "is-compact" : ""}`} title={label}>
      {icon ?? <span className="chip-dot" />}
      {!compact && label}
    </span>
  );
}
