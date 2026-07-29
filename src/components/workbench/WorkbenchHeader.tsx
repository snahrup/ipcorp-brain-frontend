import { RefreshCw, Search, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { SearchResult } from "../../lib/search";

export function WorkbenchHeader({
  label,
  query,
  results,
  selectedIndex,
  generatedAt,
  onQueryChange,
  onSearchKeyDown,
  onOpenResult,
  onClear,
}: {
  label: string;
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  generatedAt: string;
  onQueryChange: (value: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onOpenResult: (result: SearchResult) => void;
  onClear: () => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const generatedDate = new Date(generatedAt);
  const snapshotAgeMs = Date.now() - generatedDate.getTime();
  const isStale = Number.isFinite(snapshotAgeMs) && snapshotAgeMs > 7 * 24 * 60 * 60 * 1000;
  const preparedLabel = Number.isNaN(generatedDate.getTime())
    ? "Prepared date unavailable"
    : `Prepared ${generatedDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <header className="wb-header">
      <span className="wb-sr-only">IP Corporation Workbench · {label}</span>

      <div className="wb-search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={searchInputRef}
          data-testid="global-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search the Team Library"
          aria-label="Search the Team Library"
          role="combobox"
          aria-expanded={Boolean(query.trim() && results.length)}
          aria-controls="wb-search-results"
        />
        {query && (
          <button type="button" onClick={onClear} aria-label="Clear search">
            <X size={17} />
          </button>
        )}
        {!query && <kbd>Ctrl K</kbd>}

        {query.trim() && results.length > 0 && (
          <div
            id="wb-search-results"
            className="search-results-panel wb-search-results"
            role="listbox"
          >
            {results.slice(0, 8).map((result, index) => {
              const Icon = result.icon;
              return (
                <button
                  className={`search-result ${selectedIndex === index ? "is-selected" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === index}
                  key={result.id}
                  onClick={() => onOpenResult(result)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>
                    <strong>{result.title}</strong>
                    <small>
                      {result.kind} · {result.meta}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="wb-header-status">
        <span className={`wb-status ${isStale ? "wb-status-attention" : "wb-status-success"}`}>
          {isStale ? "Stale snapshot" : "Prepared"}
        </span>
        <small>{isStale ? `${preparedLabel} · refresh needed` : "Team-safe snapshot"}</small>
        <span
          className="wb-snapshot-refresh-hint"
          role="img"
          aria-label="Snapshot refresh is handled by the publication process"
          title="Snapshot refresh is handled by the publication process"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </span>
      </div>
    </header>
  );
}
