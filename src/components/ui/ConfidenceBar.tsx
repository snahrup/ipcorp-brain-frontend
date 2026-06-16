import { motion } from "framer-motion";

interface ConfidenceBarProps {
  value: number;
}

export function ConfidenceBar({ value }: ConfidenceBarProps) {
  const percent = Math.round(value * 100);
  return (
    <div className="confidence-bar" aria-label={`Confidence ${percent}%`}>
      <div>
        <span>Confidence</span>
        <strong>{percent}%</strong>
      </div>
      <span className="confidence-track">
        <motion.span initial={{ width: 0 }} animate={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
