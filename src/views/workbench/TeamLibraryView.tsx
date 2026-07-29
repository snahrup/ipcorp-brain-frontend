import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Clock3,
  File,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Presentation,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { teamLibraryGateway } from "../../features/team-library/api";
import { LibraryPreviewDrawer } from "../../features/team-library/LibraryPreviewDrawer";
import {
  filterLibraryFiles,
  formatDate,
  normalizeLibraryGuides,
  normalizeLibrarySections,
  presentLibraryItem,
} from "../../features/team-library/presentation";
import type { TeamLibraryFile, TeamLibraryManifest } from "../../features/team-library/types";

const PAGE_SIZE = 40;

function fileIcon(file: TeamLibraryFile) {
  if (file.group === "Excel") return FileSpreadsheet;
  if (file.group === "PowerPoint") return Presentation;
  if (file.group === "Diagram") return FileCode2;
  if (file.group === "PDF" || file.group === "Word") return FileText;
  return File;
}

function LibraryFileRow({
  file,
  onPreview,
}: {
  file: TeamLibraryFile;
  onPreview: (file: TeamLibraryFile) => void;
}) {
  const Icon = fileIcon(file);
  const item = presentLibraryItem(file);
  return (
    <article className="wb-library-file-row">
      <span className="wb-library-file-icon">
        <Icon size={19} aria-hidden="true" />
      </span>
      <div className="wb-library-file-copy">
        <strong>{item.title}</strong>
        <span>{item.collectionTitle}</span>
      </div>
      <div className="wb-library-file-meta">
        <span>{item.contentType}</span>
        <span>{item.updatedLabel}</span>
      </div>
      <button
        type="button"
        className="wb-button wb-button-secondary"
        onClick={() => onPreview(file)}
      >
        Preview
      </button>
    </article>
  );
}

export function TeamLibraryView() {
  const [manifest, setManifest] = useState<TeamLibraryManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const [group, setGroup] = useState("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedFile, setSelectedFile] = useState<TeamLibraryFile | null>(null);
  const collectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const closePreview = useCallback(() => setSelectedFile(null), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setManifest(await teamLibraryGateway.manifest());
    } catch {
      setError("The current Team Library publication could not be opened. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const displaySections = useMemo(
    () => (manifest ? normalizeLibrarySections(manifest.sections) : []),
    [manifest]
  );
  const libraryItems = useMemo(() => {
    if (!manifest) return [];
    const collectionIds = new Set<string>(displaySections.map((item) => item.id));
    return manifest.files.filter((file) => collectionIds.has(file.sectionId));
  }, [displaySections, manifest]);
  const groups = useMemo(
    () => ["All", ...Array.from(new Set(libraryItems.map((file) => file.group))).sort()],
    [libraryItems]
  );
  const filteredFiles = useMemo(
    () => filterLibraryFiles(libraryItems, section, group, query),
    [group, libraryItems, query, section]
  );
  const selectedSection = useMemo(
    () => displaySections.find((item) => item.id === section) || null,
    [displaySections, section]
  );
  const displayGuides = useMemo(
    () => (manifest ? normalizeLibraryGuides(manifest.guides) : []),
    [manifest]
  );

  useEffect(() => {
    if (!selectedSection) return;
    const focusTimer = window.setTimeout(() => collectionHeadingRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [selectedSection]);

  if (loading && !manifest) {
    return (
      <div className="wb-page" data-testid="team-library">
        <section className="wb-page-heading">
          <div>
            <span className="wb-kicker">Team Library | checking content</span>
            <h1>Loading the Team Library.</h1>
            <p>Preparing the library for review.</p>
          </div>
          <span className="wb-status wb-status-attention">Checking</span>
        </section>
        <div className="wb-library-loading-grid" role="status" aria-label="Loading Team Library">
          {["00", "01", "02", "03", "04", "05"].map((id) => (
            <span key={id} />
          ))}
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="wb-page" data-testid="team-library">
        <section className="wb-page-heading">
          <div>
            <span className="wb-kicker">Team Library | unavailable</span>
            <h1>The Team Library cannot be opened right now.</h1>
            <p>{error}</p>
          </div>
          <button type="button" className="wb-button wb-button-primary" onClick={refresh}>
            <RefreshCw size={17} aria-hidden="true" />
            Try again
          </button>
        </section>
      </div>
    );
  }

  const availableSections = displaySections.filter((item) => item.available).length;
  const selectedSectionFiles = selectedSection ? filteredFiles : [];
  const visibleFiles = filteredFiles.slice(0, visibleCount);
  const freshnessMessage =
    availableSections === displaySections.length
      ? "This view has not yet been checked against the live shared Team Library."
      : "Some collections are unavailable. This page shows only the content that could be opened.";

  return (
    <div className="wb-page" data-testid="team-library">
      <WorkspaceHero
        kicker="Team Library"
        title="Open the context behind the work."
        stats={[
          { label: "Items", value: libraryItems.length },
          { label: "Collections", value: `${availableSections} of ${displaySections.length}` },
          {
            label: "Updated",
            value: manifest.publication.publishedAt || formatDate(manifest.refreshedAt),
            wide: true,
          },
        ]}
        action={
          <button type="button" className="wb-hero-button" onClick={refresh} disabled={loading}>
            <RefreshCw
              className={loading ? "is-spinning" : undefined}
              size={16}
              aria-hidden="true"
            />
            Refresh
          </button>
        }
      />

      <details className="wb-quiet-note">
        <summary>
          <ShieldCheck size={15} aria-hidden="true" />
          <span>How current this is</span>
        </summary>
        <p>{freshnessMessage}</p>
      </details>

      {error ? (
        <div className="wb-inline-notice is-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {selectedSection ? (
        <section
          className="wb-library-collection-focus"
          aria-labelledby="team-library-collection-title"
        >
          <div className="wb-library-collection-focus-header">
            <button
              type="button"
              className="wb-button wb-button-secondary"
              onClick={() => {
                setSection("all");
                setQuery("");
                setGroup("All");
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to all collections
            </button>
            <div>
              <span className="wb-kicker">Selected collection</span>
              <h2 id="team-library-collection-title" ref={collectionHeadingRef} tabIndex={-1}>
                {selectedSection.title}
              </h2>
              <p>{selectedSection.summary}</p>
            </div>
            <span>
              {selectedSectionFiles.length} {selectedSectionFiles.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="wb-library-controls wb-library-collection-controls">
            <label className="wb-library-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search this collection</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="Search this collection"
              />
            </label>
            <fieldset className="wb-library-group-filters">
              <legend className="sr-only">Filter by content type</legend>
              {groups.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={group === item ? "is-active" : ""}
                  onClick={() => {
                    setGroup(item);
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  {item === "All" ? "All types" : item}
                </button>
              ))}
            </fieldset>
          </div>

          {selectedSectionFiles.length ? (
            <div className="wb-library-collection-files wb-library-folder-files">
              {selectedSectionFiles.slice(0, visibleCount).map((file) => (
                <LibraryFileRow
                  key={`collection-${file.path}`}
                  file={file}
                  onPreview={setSelectedFile}
                />
              ))}
              {visibleCount < selectedSectionFiles.length ? (
                <button
                  type="button"
                  className="wb-library-show-more"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Show more from this collection
                </button>
              ) : null}
            </div>
          ) : (
            <div className="wb-library-empty">
              <BookOpen size={24} aria-hidden="true" />
              <strong>No items match this view.</strong>
              <span>Clear the search or choose another type.</span>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="wb-library-section-block">
            <div className="wb-library-section-heading">
              <div>
                <span className="wb-kicker">Team Library collections</span>
                <h2>Choose the work you need to review</h2>
              </div>
              <span>{libraryItems.length} items</span>
            </div>
            <fieldset className="wb-library-folder-grid">
              <legend className="sr-only">Team Library collections</legend>
              {displaySections.map((item) => (
                <button
                  type="button"
                  className="wb-library-folder-card"
                  onClick={() => {
                    setSection(item.id);
                    setGroup("All");
                    setQuery("");
                    setVisibleCount(PAGE_SIZE);
                  }}
                  key={item.id}
                  aria-label={`Open ${item.title}`}
                >
                  <span className="wb-library-folder-number">
                    <BookOpen size={17} aria-hidden="true" />
                  </span>
                  <span className="wb-library-folder-copy">
                    <strong>{item.title}</strong>
                    <small>{item.summary}</small>
                  </span>
                  <span className="wb-library-folder-count">
                    {item.available
                      ? `${item.fileCount} ${item.fileCount === 1 ? "item" : "items"}`
                      : "Unavailable"}
                  </span>
                  <span className="wb-library-folder-open">Open collection</span>
                </button>
              ))}
            </fieldset>
          </section>

          <section className="wb-library-section-block">
            <div className="wb-library-section-heading">
              <div>
                <span className="wb-kicker">Useful starting points</span>
                <h2>Start with the job in front of you</h2>
              </div>
            </div>
            <div className="wb-library-guide-grid">
              {displayGuides.map((guide) => (
                <article className="wb-library-guide-card" key={guide.id}>
                  <BookOpen size={20} aria-hidden="true" />
                  <div>
                    <strong>{guide.title}</strong>
                    <p>{guide.summary}</p>
                    <div className="wb-library-guide-links">
                      {guide.files.map((file) => {
                        const item = presentLibraryItem(file);
                        return (
                          <button
                            type="button"
                            key={file.path}
                            onClick={() => setSelectedFile(file)}
                          >
                            Preview {item.contentType}
                          </button>
                        );
                      })}
                      {!guide.files.length ? <span>Content unavailable</span> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {!selectedSection ? (
        <section className="wb-library-inventory">
          <div className="wb-library-section-heading">
            <div>
              <span className="wb-kicker">Library search</span>
              <h2>Search every available item</h2>
            </div>
            <span>
              {filteredFiles.length} {filteredFiles.length === 1 ? "result" : "results"}
            </span>
          </div>

          <div className="wb-library-controls">
            <label className="wb-library-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search Team Library</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="Search guidance, diagrams, or topics"
              />
            </label>
            <select
              value={section}
              onChange={(event) => {
                setSection(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              aria-label="Filter Team Library by collection"
            >
              <option value="all">All collections</option>
              {displaySections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <fieldset className="wb-library-group-filters">
              <legend className="sr-only">Filter by content type</legend>
              {groups.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={group === item ? "is-active" : ""}
                  onClick={() => {
                    setGroup(item);
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  {item === "All" ? "All types" : item}
                </button>
              ))}
            </fieldset>
          </div>

          {filteredFiles.length ? (
            <div className="wb-library-file-list">
              {visibleFiles.map((file) => {
                return <LibraryFileRow key={file.path} file={file} onPreview={setSelectedFile} />;
              })}
              {visibleCount < filteredFiles.length ? (
                <button
                  type="button"
                  className="wb-library-show-more"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, filteredFiles.length - visibleCount)} more
                </button>
              ) : null}
            </div>
          ) : (
            <div className="wb-library-empty">
              <BookOpen size={24} aria-hidden="true" />
              <strong>No library items match this view.</strong>
              <span>Clear the search or choose another collection or type.</span>
            </div>
          )}
        </section>
      ) : null}

      <footer className="wb-library-publication-note">
        <Clock3 size={18} aria-hidden="true" />
        <span>This view is read-only. Refresh after the shared Team Library is updated.</span>
      </footer>

      {selectedFile ? <LibraryPreviewDrawer file={selectedFile} onClose={closePreview} /> : null}
    </div>
  );
}
