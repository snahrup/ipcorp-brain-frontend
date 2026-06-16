import type { LucideIcon } from "lucide-react";

interface DrawerHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
}

export function DrawerHeader({ icon: Icon, eyebrow, title }: DrawerHeaderProps) {
  return (
    <div className="drawer-header">
      <div className="drawer-icon">
        <Icon size={24} />
      </div>
      <div>
        <span className="mono-kicker">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}
