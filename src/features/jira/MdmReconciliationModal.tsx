import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../../lib/useBodyScrollLock";
import { jiraGateway } from "./api";
import { interceptTicketClick } from "./openTicket";
import type { ReconciliationPreview } from "./types";

const sourceLabels: Record<string, string> = {
  current: "Current",
  prepared: "Prepared",
  partial: "Partial",
  unavailable: "Unavailable",
  error: "Error",
  loading: "Checking",
};

export function MdmReconciliationModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();

  const modalRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const applyingRef = useRef(false);
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualReviews, setManualReviews] = useState<Set<string>>(new Set());
  const [proposalFilter, setProposalFilter] = useState("all");
  const [showCarried, setShowCarried] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [applying, setApplying] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  // How far back evidence may be and still count as something to act on. This week
  // is the default because anything older has already had its chance to be handled;
  // the wider settings are here for a deliberate catch-up, not for daily use.
  const [windowDays, setWindowDays] = useState<number | "all" | null>(null);
  const windowDaysRef = useRef<number | "all" | null>(null);

  const runPreview = useCallback(async (forceMicrosoft365 = false) => {
    setLoading(true);
    setError(null);
    setApplyMessage(null);
    try {
      const next = await jiraGateway.previewReconciliation(
        forceMicrosoft365,
        windowDaysRef.current
      );
      setPreview(next);
      setManualReviews(new Set());
      setProposalFilter("all");
      setSelected(
        new Set(next.proposals.filter((proposal) => !proposal.uncertainty).map((item) => item.id))
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MDM reconciliation could not run.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runPreview();
  }, [runPreview]);

  useEffect(() => {
    applyingRef.current = applying;
  }, [applying]);

  // The ref carries the choice into runPreview, whose identity has to stay stable
  // for the mount effect; setting it before the call keeps the two in step.
  const changeWindow = (next: number | "all" | null) => {
    windowDaysRef.current = next;
    setWindowDays(next);
    void runPreview();
  };

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    modal
      ?.querySelector<HTMLElement>("button, a, input, select, textarea, [tabindex='0']")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !applyingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modal) return;

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"
        )
      );
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const reviewedProposals = useMemo(
    () =>
      preview?.proposals
        .filter((proposal) => selected.has(proposal.id))
        .map((proposal) =>
          manualReviews.has(proposal.id)
            ? { ...proposal, uncertainty: undefined, reviewedByUser: true }
            : proposal
        ) || [],
    [manualReviews, preview, selected]
  );
  // Carried candidates were already seen by an earlier scan and stay tucked away by
  // default; only new and changed evidence is shouted. Nothing is deleted, just quiet.
  const carriedCount = useMemo(
    () => preview?.proposals.filter((proposal) => proposal.freshness === "carried").length || 0,
    [preview]
  );
  const filteredProposals = useMemo(
    () =>
      preview?.proposals.filter(
        (proposal) =>
          (proposalFilter === "all" || proposal.category === proposalFilter) &&
          (showCarried || proposal.freshness !== "carried")
      ) || [],
    [preview, proposalFilter, showCarried]
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const proposal of preview?.proposals || []) {
      const category = proposal.category || "other";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return counts;
  }, [preview]);
  const canApply =
    reviewedProposals.length > 0 &&
    reviewedProposals.every((proposal) => !proposal.uncertainty) &&
    confirmation === "APPLY REVIEWED MDM CHANGES";

  const apply = async () => {
    if (!canApply) return;
    setApplying(true);
    setError(null);
    try {
      const result = await jiraGateway.applyReconciliation(reviewedProposals, confirmation);
      const succeeded = result.results.filter((item) => item.ok).length;
      const failed = result.results.length - succeeded;
      // Refresh first: runPreview clears the status line, so the recap has to land
      // after the reload or the user never sees it.
      await runPreview();
      setApplyMessage(
        `Jira read-back complete: ${succeeded} applied, ${failed} failed or partial. Applied items are recorded in the scan ledger and stay out of future scans unless their source changes.`
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The reviewed Jira batch was not applied."
      );
    } finally {
      setApplying(false);
    }
  };

  const dismissSelected = async () => {
    const fingerprints = (preview?.proposals || [])
      .filter((proposal) => selected.has(proposal.id) && proposal.fingerprint)
      .map((proposal) => proposal.fingerprint as string);
    if (!fingerprints.length || dismissing) return;
    setDismissing(true);
    setError(null);
    try {
      const result = await jiraGateway.dismissReconciliation(fingerprints);
      await runPreview();
      setApplyMessage(
        `${result.dismissed} evidence records marked reviewed with no Jira change. They stay out of future scans unless their source changes.`
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The selected evidence was not dismissed."
      );
    } finally {
      setDismissing(false);
    }
  };

  return createPortal(
    // Same containing-block fix as JiraIssueModal: portalled to the body so this
    // backdrop's position: fixed is relative to the viewport, not to the animated
    // .view-frame it would otherwise be nested inside.
    <div className="wb-modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        className="wb-reconcile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mdm-reconcile-title"
        tabIndex={-1}
      >
        <header className="wb-jira-modal-header">
          <div>
            <span className="wb-jira-key">MDM initiative only · Jira project MT</span>
            <h2 id="mdm-reconcile-title">Refresh and reconcile MDM</h2>
            <p>
              Compare authorized evidence to Jira, review every proposed effect, then confirm a
              guarded batch.
            </p>
          </div>
          <button
            type="button"
            className="wb-icon-button"
            onClick={onClose}
            disabled={applying}
            aria-label="Close MDM reconciliation"
          >
            <X size={19} />
          </button>
        </header>

        <div className="wb-reconcile-body">
          <div className="wb-scope-guard">
            <ShieldCheck size={20} />
            <div>
              <strong>Scope guard is locked</strong>
              <p>
                This workflow can read or change only MT issues. Non-MDM projects are rejected by
                the gateway.
              </p>
            </div>
            <span>MT only</span>
          </div>

          {loading ? (
            <div className="wb-modal-state">
              <LoaderCircle className="wb-spin" size={26} />
              <strong>Comparing available MDM evidence…</strong>
              <span>
                Jira, the Brain, and the local Team Library are being checked. Microsoft 365 is not
                contacted unless you explicitly start its single coverage request.
              </span>
            </div>
          ) : error && !preview ? (
            <div className="wb-modal-state wb-modal-state-error">
              <AlertTriangle size={26} />
              <strong>Reconciliation unavailable</strong>
              <span>{error}</span>
              <button
                type="button"
                className="wb-primary-button"
                onClick={() => void runPreview(false)}
              >
                <RefreshCw size={16} /> Try again
              </button>
            </div>
          ) : preview ? (
            <>
              {(error || applyMessage) && (
                <div
                  className={`wb-form-alert ${error ? "is-error" : "is-success"}`}
                  role={error ? "alert" : "status"}
                >
                  {error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                  <div>
                    <strong>{error ? "Batch not applied" : "Jira verification"}</strong>
                    <span>{error || applyMessage}</span>
                  </div>
                </div>
              )}

              <section className="wb-reconcile-section">
                <div className="wb-section-title">
                  <div>
                    <span>Evidence coverage</span>
                    <h3>What was actually available</h3>
                  </div>
                  <div className="wb-inline-actions">
                    <button
                      type="button"
                      className="wb-secondary-button"
                      onClick={() => void runPreview(false)}
                    >
                      <RefreshCw size={15} /> Refresh Jira and local sources
                    </button>
                    <button
                      type="button"
                      className="wb-secondary-button"
                      onClick={() => void runPreview(true)}
                    >
                      <RefreshCw size={15} /> Check Microsoft 365 once
                    </button>
                  </div>
                </div>
                <div className="wb-source-grid">
                  {preview.sourceStates.map((source) => (
                    <article key={source.id} data-state={source.state}>
                      <header>
                        <strong>{source.label}</strong>
                        <span>{sourceLabels[source.state] || source.state}</span>
                      </header>
                      <p>{source.detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="wb-reconcile-section">
                <div className="wb-section-title">
                  <div>
                    <span>Portfolio reality check</span>
                    <h3>How much of Jira needs rebuilding</h3>
                  </div>
                </div>
                <div className="wb-reconcile-window-row">
                  <p className="wb-reconcile-window">
                    Candidates are limited to {preview.portfolioSummary.activityWindowLabel}
                    {preview.portfolioSummary.activityWindowFrom
                      ? `, from ${new Date(
                          preview.portfolioSummary.activityWindowFrom
                        ).toLocaleDateString()}`
                      : ""}
                    .{" "}
                    {preview.portfolioSummary.olderThanWindow +
                    preview.portfolioSummary.undatedEvidence ? (
                      <>
                        {preview.portfolioSummary.olderThanWindow} older and{" "}
                        {preview.portfolioSummary.undatedEvidence} undated records were counted and
                        left out.
                      </>
                    ) : (
                      "Nothing older was held back."
                    )}{" "}
                    Scan #{preview.portfolioSummary.scanCount} was logged at{" "}
                    {new Date(preview.generatedAt).toLocaleString()}.
                  </p>
                  <fieldset className="wb-reconcile-filters wb-window-picker">
                    <legend className="sr-only">Activity window</legend>
                    {(
                      [
                        { value: null, label: "This week" },
                        { value: 30, label: "30 days" },
                        { value: "all", label: "Everything" },
                      ] as Array<{ value: number | "all" | null; label: string }>
                    ).map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        className={windowDays === option.value ? "is-active" : ""}
                        onClick={() => changeWindow(option.value)}
                        disabled={loading}
                      >
                        {option.label}
                      </button>
                    ))}
                  </fieldset>
                </div>
                <div className="wb-reconcile-metrics">
                  <article>
                    <strong>{preview.portfolioSummary.totalIssues}</strong>
                    <span>Total MT issues</span>
                  </article>
                  <article>
                    <strong>{preview.portfolioSummary.openIssues}</strong>
                    <span>Open issues</span>
                  </article>
                  <article
                    data-state={preview.portfolioSummary.newEvidence ? "attention" : undefined}
                  >
                    <strong>{preview.portfolioSummary.newEvidence}</strong>
                    <span>New this scan</span>
                  </article>
                  <article
                    data-state={preview.portfolioSummary.changedEvidence ? "attention" : undefined}
                  >
                    <strong>{preview.portfolioSummary.changedEvidence}</strong>
                    <span>Changed since handled</span>
                  </article>
                  <article>
                    <strong>{preview.portfolioSummary.carriedEvidence}</strong>
                    <span>Carried unresolved</span>
                  </article>
                  <article data-state="safe">
                    <strong>{preview.portfolioSummary.resolvedEvidence}</strong>
                    <span>Already handled, left alone</span>
                  </article>
                </div>
                <p className="wb-reconcile-asof">
                  Newest Jira update:{" "}
                  {preview.portfolioSummary.newestJiraUpdate
                    ? new Date(preview.portfolioSummary.newestJiraUpdate).toLocaleString()
                    : "not available"}
                  . Stale open issues (informational, never auto-touched):{" "}
                  {preview.portfolioSummary.staleOpenIssues}. Team Library artifacts:{" "}
                  {preview.portfolioSummary.teamLibraryFiles}. Microsoft 365 evidence items:{" "}
                  {preview.portfolioSummary.microsoft365Items}.
                </p>
              </section>

              {preview.conflicts.length > 0 && (
                <section className="wb-reconcile-section">
                  <div className="wb-section-title">
                    <div>
                      <span>Conflicts and uncertainty</span>
                      <h3>What prevents automatic changes</h3>
                    </div>
                  </div>
                  <div className="wb-conflict-list">
                    {preview.conflicts.map((conflict) => (
                      <article key={conflict.id}>
                        <AlertTriangle size={19} />
                        <div>
                          <strong>{conflict.title}</strong>
                          <p>{conflict.detail}</p>
                        </div>
                        <span>{conflict.blocking ? "Blocking" : "Review"}</span>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="wb-reconcile-section">
                <div className="wb-section-title">
                  <div>
                    <span>Portfolio rebuild candidates</span>
                    <h3>
                      {filteredProposals.length} shown · {preview.proposals.length} total
                    </h3>
                  </div>
                  {filteredProposals.length > 0 && (
                    <div className="wb-inline-actions">
                      <button
                        type="button"
                        className="wb-secondary-button"
                        onClick={() => {
                          const shown = filteredProposals.map((proposal) => proposal.id);
                          const allShownSelected = shown.every((id) => selected.has(id));
                          setSelected(allShownSelected ? new Set() : new Set(shown));
                        }}
                      >
                        {filteredProposals.every((proposal) => selected.has(proposal.id))
                          ? "Clear selection"
                          : "Select all shown"}
                      </button>
                      <button
                        type="button"
                        className="wb-secondary-button"
                        onClick={() => void dismissSelected()}
                        disabled={dismissing || selected.size === 0}
                      >
                        {dismissing ? (
                          <LoaderCircle className="wb-spin" size={15} />
                        ) : (
                          <CheckCircle2 size={15} />
                        )}
                        Mark selected reviewed · no Jira change
                      </button>
                    </div>
                  )}
                </div>
                {carriedCount > 0 && (
                  <button
                    type="button"
                    className="wb-carried-toggle"
                    onClick={() => setShowCarried((current) => !current)}
                  >
                    {showCarried
                      ? `Hide the ${carriedCount} carried candidates from earlier scans`
                      : `${carriedCount} carried candidates from earlier scans are hidden · show them`}
                  </button>
                )}
                {preview.proposals.length ? (
                  <fieldset className="wb-reconcile-filters">
                    <legend className="sr-only">Filter reconciliation candidates</legend>
                    <button
                      type="button"
                      className={proposalFilter === "all" ? "is-active" : ""}
                      onClick={() => setProposalFilter("all")}
                    >
                      All {preview.proposals.length}
                    </button>
                    {Array.from(categoryCounts.entries()).map(([category, count]) => (
                      <button
                        type="button"
                        key={category}
                        className={proposalFilter === category ? "is-active" : ""}
                        onClick={() => setProposalFilter(category)}
                      >
                        {category.split("-").join(" ")} {count}
                      </button>
                    ))}
                  </fieldset>
                ) : null}
                {preview.proposals.length ? (
                  <div className="wb-proposal-list">
                    {filteredProposals.map((proposal) => {
                      const manuallyReviewed = manualReviews.has(proposal.id);
                      const canResolve = proposal.issueKey !== "NEW";
                      return (
                        <article
                          key={proposal.id}
                          className={`wb-reconcile-proposal ${
                            proposal.uncertainty && !manuallyReviewed ? "is-uncertain" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(proposal.id)}
                            aria-label={`Select reconciliation effect for ${proposal.issueKey}`}
                            onChange={(event) => {
                              const next = new Set(selected);
                              if (event.target.checked) next.add(proposal.id);
                              else next.delete(proposal.id);
                              setSelected(next);
                            }}
                          />
                          <div>
                            <header>
                              <strong>{proposal.issueKey}</strong>
                              <span>{proposal.title}</span>
                              {proposal.freshness ? (
                                <em data-freshness={proposal.freshness}>{proposal.freshness}</em>
                              ) : null}
                              {proposal.category ? (
                                <em>{proposal.category.split("-").join(" ")}</em>
                              ) : null}
                            </header>
                            <p>{proposal.exactJiraEffect}</p>
                            <ul>
                              {proposal.sourceReferences.map((reference) => (
                                <li key={`${reference.label}-${reference.reference}`}>
                                  {reference.label}: {reference.reference}
                                </li>
                              ))}
                            </ul>
                            {proposal.uncertainty && !manuallyReviewed ? (
                              <small>{proposal.uncertainty}</small>
                            ) : null}
                            <div className="wb-reconcile-proposal-actions">
                              {proposal.issueKey !== "NEW" ? (
                                <a
                                  href={`https://ip-corporation.atlassian.net/browse/${proposal.issueKey}`}
                                  onClick={(event) =>
                                    interceptTicketClick(event, event.currentTarget.href)
                                  }
                                  title="Open the ticket. Ctrl-click for Jira itself."
                                >
                                  Open {proposal.issueKey}
                                </a>
                              ) : null}
                              {proposal.uncertainty && canResolve ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = new Set(manualReviews);
                                    const selectedNext = new Set(selected);
                                    if (next.has(proposal.id)) {
                                      next.delete(proposal.id);
                                      selectedNext.delete(proposal.id);
                                    } else {
                                      next.add(proposal.id);
                                    }
                                    setManualReviews(next);
                                    setSelected(selectedNext);
                                  }}
                                >
                                  {manuallyReviewed
                                    ? "Undo review"
                                    : "I reviewed this target and exact effect"}
                                </button>
                              ) : null}
                              {proposal.issueKey === "NEW" ? (
                                <span>Needs full task fields before it can be applied</span>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="wb-safe-empty">
                    <DatabaseZap size={24} />
                    <div>
                      <strong>No safe Jira changes were proposed</strong>
                      <p>{preview.summary}</p>
                    </div>
                  </div>
                )}
              </section>

              <section className="wb-batch-confirmation">
                <div>
                  <strong>Deliberate batch confirmation</strong>
                  <p>
                    Type <code>APPLY REVIEWED MDM CHANGES</code> only after reviewing every selected
                    Jira effect and its provenance.
                  </p>
                </div>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={!reviewedProposals.length || applying}
                  aria-label="MDM batch confirmation phrase"
                />
              </section>
            </>
          ) : null}
        </div>

        <footer className="wb-jira-modal-footer">
          <span>
            {preview
              ? `Preview generated ${new Date(preview.generatedAt).toLocaleString()}`
              : "Read-only until a reviewed batch is confirmed"}
          </span>
          <div>
            <button
              type="button"
              className="wb-secondary-button"
              onClick={onClose}
              disabled={applying}
            >
              Close
            </button>
            <button
              type="button"
              className="wb-primary-button"
              onClick={() => void apply()}
              disabled={!canApply || applying}
            >
              {applying ? (
                <LoaderCircle className="wb-spin" size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              {applying ? "Applying and verifying…" : "Apply reviewed batch"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
