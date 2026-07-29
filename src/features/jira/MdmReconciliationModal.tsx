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
import { jiraGateway } from "./api";
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
  const modalRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const applyingRef = useRef(false);
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualReviews, setManualReviews] = useState<Set<string>>(new Set());
  const [proposalFilter, setProposalFilter] = useState("all");
  const [confirmation, setConfirmation] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const runPreview = useCallback(async (forceMicrosoft365 = false) => {
    setLoading(true);
    setError(null);
    setApplyMessage(null);
    try {
      const next = await jiraGateway.previewReconciliation(forceMicrosoft365);
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
  const filteredProposals = useMemo(
    () =>
      preview?.proposals.filter(
        (proposal) => proposalFilter === "all" || proposal.category === proposalFilter
      ) || [],
    [preview, proposalFilter]
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
      setApplyMessage(
        `Jira read-back complete: ${succeeded} applied, ${failed} failed or partial.`
      );
      await runPreview();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The reviewed Jira batch was not applied."
      );
    } finally {
      setApplying(false);
    }
  };

  return (
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
                <div className="wb-reconcile-metrics">
                  <article>
                    <strong>{preview.portfolioSummary.totalIssues}</strong>
                    <span>Total MT issues</span>
                  </article>
                  <article>
                    <strong>{preview.portfolioSummary.openIssues}</strong>
                    <span>Open issues</span>
                  </article>
                  <article data-state="attention">
                    <strong>{preview.portfolioSummary.staleOpenIssues}</strong>
                    <span>Stale open issues</span>
                  </article>
                  <article>
                    <strong>{preview.portfolioSummary.evidenceRecords}</strong>
                    <span>Evidence records compared</span>
                  </article>
                  <article>
                    <strong>{preview.portfolioSummary.candidateChanges}</strong>
                    <span>Review candidates</span>
                  </article>
                  <article data-state="safe">
                    <strong>{preview.portfolioSummary.safeToAutoApply}</strong>
                    <span>Safe without review</span>
                  </article>
                </div>
                <p className="wb-reconcile-asof">
                  Newest Jira update:{" "}
                  {preview.portfolioSummary.newestJiraUpdate
                    ? new Date(preview.portfolioSummary.newestJiraUpdate).toLocaleString()
                    : "not available"}
                  . Team Library artifacts: {preview.portfolioSummary.teamLibraryFiles}. Microsoft
                  365 evidence items: {preview.portfolioSummary.microsoft365Items}.
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
                </div>
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
                            disabled={Boolean(proposal.uncertainty) && !manuallyReviewed}
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
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open in Jira
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
    </div>
  );
}
