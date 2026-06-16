interface MetaGridProps {
  items: Array<[string, string | undefined]>;
  compact?: boolean;
}

export function MetaGrid({ items, compact = false }: MetaGridProps) {
  const visible = items.filter(([, value]) => value && value !== "Date not set");
  if (!visible.length) return null;

  return (
    <dl className={`meta-grid ${compact ? "compact" : ""}`}>
      {visible.map(([label, value]) => (
        <div key={`${label}-${value}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
