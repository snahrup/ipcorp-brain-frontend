import { Search } from "lucide-react";

interface FilterSummaryProps {
  query: string;
  count: number;
  total: number;
  noun: string;
}

export function FilterSummary({ query, count, total, noun }: FilterSummaryProps) {
  if (!query.trim()) return null;

  return (
    <div className="filter-summary">
      <Search size={16} />
      <span>
        Showing {count} of {total} {noun} matching “{query.trim()}”.
      </span>
    </div>
  );
}
