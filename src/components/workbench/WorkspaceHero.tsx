import type { ReactNode } from "react";
import "./workspace-hero.css";

export type HeroStat = {
  label: string;
  value: ReactNode;
  /** Renders smaller, for dates and other long values. */
  wide?: boolean;
  tone?: "default" | "attention" | "good";
};

/**
 * The shared page banner used across Today, Work, Meetings and Team Library: a single
 * navy gradient band carrying the page name, one line of intent, and the few numbers
 * that actually orient someone. It exists so the pages read as one product instead of
 * four different layouts.
 */
export function WorkspaceHero({
  kicker,
  title,
  stats = [],
  action,
}: {
  kicker: string;
  title: string;
  stats?: HeroStat[];
  action?: ReactNode;
}) {
  return (
    <section className="wb-hero">
      <div className="wb-hero-copy">
        <span className="wb-kicker">{kicker}</span>
        <h1>{title}</h1>
        {action && <div className="wb-hero-action">{action}</div>}
      </div>
      {stats.length > 0 && (
        <div className="wb-hero-stats">
          {stats.map((stat) => (
            <div
              className={`wb-hero-stat${stat.wide ? " wb-hero-stat-wide" : ""}`}
              data-tone={stat.tone ?? "default"}
              key={stat.label}
            >
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
