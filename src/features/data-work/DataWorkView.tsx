import { ArrowRight, CircleAlert, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { dataWorkCapabilities } from "../../data/workbench";
import type { CapabilityManifest } from "../../types/workbench";
import { capabilityStatePresentation, getCapabilityDetail } from "./capabilityDetails";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function DataWorkView() {
  const [activeCapability, setActiveCapability] = useState<CapabilityManifest | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();

  const closeCapability = useCallback(() => {
    const opener = openerRef.current;
    setActiveCapability(null);
    window.requestAnimationFrame(() => opener?.focus());
  }, []);

  useEffect(() => {
    if (!activeCapability) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCapability();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeCapability, closeCapability]);

  const activeDetail = activeCapability ? getCapabilityDetail(activeCapability.id) : null;
  const activeState = activeCapability ? capabilityStatePresentation[activeCapability.state] : null;

  const openCapability = (capability: CapabilityManifest, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setActiveCapability(capability);
  };

  return (
    <div className="wb-page" data-testid="data-work-view">
      <div className="wb-data-work-content" aria-hidden={activeCapability ? "true" : undefined}>
        <section className="wb-data-hero">
          <div className="wb-data-hero-copy">
            <span className="wb-kicker">Data work · optional capability pack</span>
            <h1>
              Open specialist tools only when the work <em>needs them.</em>
            </h1>
            <p>
              These grounded Fabric and Altimate capabilities stay outside the daily startup path.
              No data process, polling, or heavy graph runs while this area is closed.
            </p>
          </div>

          <div
            className="wb-data-hero-visual"
            role="img"
            aria-label="Microsoft Fabric capability network"
          >
            <svg
              className="wb-fabric-network-lines"
              viewBox="0 0 720 260"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M40 168 132 104 232 104 322 48 436 101 553 101 683 164" />
              <path d="M128 208 246 236 360 216 487 234 598 206" />
              <path d="M92 74 206 18 346 77 477 20 622 83" />
              <path d="M206 18 232 104 246 236" />
              <path d="M346 77 360 216" />
              <path d="M477 20 436 101 487 234" />
              <path d="M622 83 553 101 598 206" />
            </svg>

            <span className="wb-fabric-network-node wb-fabric-node-a" aria-hidden="true" />
            <span className="wb-fabric-network-node wb-fabric-node-b" aria-hidden="true" />
            <span className="wb-fabric-network-node wb-fabric-node-c" aria-hidden="true" />
            <span className="wb-fabric-network-node wb-fabric-node-d" aria-hidden="true" />
            <span className="wb-fabric-network-node wb-fabric-node-e" aria-hidden="true" />

            <span className="wb-fabric-satellite wb-fabric-satellite-sql" aria-hidden="true">
              <img src="/fabric-icons/sql-database.png" alt="" />
            </span>
            <span className="wb-fabric-satellite wb-fabric-satellite-flow" aria-hidden="true">
              <img src="/fabric-icons/dataflow-gen2.png" alt="" />
            </span>
            <span className="wb-fabric-satellite wb-fabric-satellite-link" aria-hidden="true">
              <img src="/fabric-icons/links.png" alt="" />
            </span>

            <span className="wb-fabric-core" aria-hidden="true">
              <span className="wb-fabric-core-layer wb-fabric-layer-one" />
              <span className="wb-fabric-core-layer wb-fabric-layer-two" />
              <span className="wb-fabric-core-card">
                <img src="/fabric-icons/fabric.png" alt="" />
              </span>
            </span>

            <div className="wb-fabric-product-lockup">
              <img src="/fabric-icons/fabric.png" alt="" aria-hidden="true" />
              <span>
                <strong>Microsoft Fabric</strong>
                <small>Loaded on demand</small>
              </span>
            </div>
          </div>
        </section>

        <div className="wb-inline-notice">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            This team workspace does not currently have a live Data work gateway. Capability details
            explain what can be prepared or reviewed, but opening them never sends data, runs a
            tool, or changes Fabric or a source system.
          </span>
        </div>

        <section className="wb-data-grid" aria-label="Data work capabilities">
          {dataWorkCapabilities.map((capability) => {
            const detail = getCapabilityDetail(capability.id);
            const state = capabilityStatePresentation[capability.state];
            const isOpen = activeCapability?.id === capability.id;

            return (
              <article
                className="wb-data-card"
                data-capability-state={capability.state}
                key={capability.id}
              >
                <header className="wb-data-card-header">
                  <span className="wb-fabric-icon">
                    <img src={detail.icon} alt="" aria-hidden="true" />
                  </span>
                  <h2>{capability.label}</h2>
                  <span className={`wb-status ${state.toneClass}`}>{state.label}</span>
                </header>
                <p>{capability.plainSummary}</p>
                <footer className="wb-data-card-footer">
                  <div className="wb-technical-label">{capability.technicalName}</div>
                  <button
                    aria-controls={isOpen ? dialogId : undefined}
                    aria-expanded={isOpen}
                    aria-haspopup="dialog"
                    aria-label={
                      capability.state === "unavailable"
                        ? `View requirements for ${capability.label}`
                        : `Review ${capability.label} capability`
                    }
                    className="wb-data-card-action"
                    data-testid={`data-work-open-${capability.id}`}
                    type="button"
                    onClick={(event) => openCapability(capability, event.currentTarget)}
                  >
                    <span className="wb-sr-only">
                      {capability.state === "unavailable"
                        ? "View requirements"
                        : "Review capability"}
                    </span>
                    <ArrowRight size={22} aria-hidden="true" />
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      </div>

      {activeCapability && activeDetail && activeState && (
        <div className="wb-data-dialog-backdrop" data-testid="data-work-dialog-backdrop">
          <section
            aria-describedby={dialogDescriptionId}
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="wb-data-dialog"
            id={dialogId}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="wb-data-dialog-header">
              <div className="wb-data-dialog-title">
                <span className="wb-fabric-icon">
                  <img src={activeDetail.icon} alt="" aria-hidden="true" />
                </span>
                <div>
                  <span className="wb-kicker">Capability detail</span>
                  <h2 id={dialogTitleId}>{activeCapability.label}</h2>
                </div>
              </div>
              <button
                aria-label={`Close ${activeCapability.label} details`}
                className="wb-data-dialog-close"
                onClick={closeCapability}
                ref={closeButtonRef}
                type="button"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <p className="wb-data-dialog-summary" id={dialogDescriptionId}>
              {activeCapability.plainSummary}
            </p>

            <div className="wb-data-dialog-truth">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <strong>No active runner</strong>
                <span>
                  Opening this panel does not send a request, upload source material, or execute
                  {` ${activeCapability.technicalName}`}.
                </span>
              </div>
            </div>

            <section className="wb-data-detail-section">
              <div className="wb-data-detail-heading">
                <h3>Availability</h3>
                <span className={`wb-status ${activeState.toneClass}`}>{activeState.label}</span>
              </div>
              <p>{activeDetail.availability}</p>
            </section>

            <section className="wb-data-detail-section">
              <h3>Required connection</h3>
              <p>{activeDetail.requiredConnection}</p>
            </section>

            <div className="wb-data-detail-columns">
              <section className="wb-data-detail-section">
                <h3>Grounded inputs</h3>
                <ul>
                  {activeDetail.inputs.map((input) => (
                    <li key={input}>{input}</li>
                  ))}
                </ul>
              </section>

              <section className="wb-data-detail-section">
                <h3>Reviewable output</h3>
                <ul>
                  {activeDetail.outputs.map((output) => (
                    <li key={output}>{output}</li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="wb-data-detail-section wb-data-review-scope">
              <h3>What can be prepared or reviewed</h3>
              <p>{activeDetail.reviewScope}</p>
            </section>

            <footer className="wb-data-dialog-footer">
              <p>
                <strong>Nothing ran.</strong> These details describe a limited capability review,
                not a completed analysis.
              </p>
              <button className="wb-button-secondary" onClick={closeCapability} type="button">
                Close details
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
