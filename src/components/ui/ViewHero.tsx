import type { ReactNode } from "react";
import type { ViewKey } from "../../lib/search";
import { viewCopy } from "../../lib/viewConfig";

interface ViewHeroProps {
  view: ViewKey;
  children?: ReactNode;
}

export function ViewHero({ view, children }: ViewHeroProps) {
  const meta = viewCopy[view];
  return (
    <section className="view-hero">
      {!children && (
        <div className="view-hero-copy">
          <span className="mono-kicker">{meta.eyebrow}</span>
          <h1>{meta.title}</h1>
          <p>{meta.summary}</p>
        </div>
      )}
      {children}
    </section>
  );
}
