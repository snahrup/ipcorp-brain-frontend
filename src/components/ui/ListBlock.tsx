import { humanizeEvidenceRef } from "../../lib/utils";

interface ListBlockProps {
  title: string;
  items?: string[];
  monospace?: boolean;
  humanize?: boolean; // when true, shows clean human-friendly labels instead of raw technical names
}

export function ListBlock({ title, items, monospace = false, humanize = false }: ListBlockProps) {
  if (!items?.length) return null;

  return (
    <section className={`list-block ${monospace ? "is-mono" : ""}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => {
          const display = humanize ? humanizeEvidenceRef(item) : item;
          // Intentionally do NOT put the raw technical name in title.
          // End users should not need to see backend source names.

          return <li key={`${title}-${index}-${item.slice(0, 24)}`}>{display}</li>;
        })}
      </ul>
    </section>
  );
}
