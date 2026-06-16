import type { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  icon: LucideIcon;
}

export function SectionHeader({ eyebrow, title, icon: Icon }: SectionHeaderProps) {
  return (
    <div className="section-heading">
      <div>
        <span className="mono-kicker">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <Icon size={22} />
    </div>
  );
}
