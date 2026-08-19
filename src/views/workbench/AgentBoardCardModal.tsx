import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { interceptTicketClick } from "../../features/jira/openTicket";
import { useBodyScrollLock } from "../../lib/useBodyScrollLock";
import {
  type BoardCard,
  type BoardLane,
  referenceOf,
  referenceSummary,
  resolveHref,
} from "./agent-board-model";

/**
 * The detail behind a card that has no page of its own: a promise made in a
 * meeting, a run, an email draft. It is read only on purpose. Editing the board
 * is the agent's job, so there is no field, no status control and no way to
 * move a card from here. It shows what the agent already knows and why the card
 * is sitting in the lane it is in.
 *
 * It reuses the sheet the Jira editor uses (.wb-modal-backdrop + .wb-jira-modal)
 * rather than introducing a second dialog: same portal, same scroll lock, same
 * full-height presentation on the phone.
 */
export function AgentBoardCardModal({
  card,
  lane,
  onClose,
}: {
  card: BoardCard;
  lane: BoardLane;
  onClose: () => void;
}) {
  useBodyScrollLock();

  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // True only when the press STARTED on the backdrop, so a text-selection drag
  // that begins inside and ends outside does not close the sheet.
  const backdropPressRef = useRef(false);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => titleRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusable.length === 0) {
        event.preventDefault();
        titleRef.current?.focus();
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

  const reference = referenceOf(card);
  const href = resolveHref(reference.href);

  return createPortal(
    // Portalled to the body: rendered inline it would sit inside the animated
    // .view-frame, whose settled framer-motion filter creates a containing block
    // and turns position: fixed into absolute against that section.
    // biome-ignore lint/a11y/noStaticElementInteractions: light-dismiss scrim; Escape and the Close button are the accessible paths
    <div
      className="wb-modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const startedHere = backdropPressRef.current;
        backdropPressRef.current = false;
        if (startedHere && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="wb-jira-modal wb-board-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-card-title"
        data-testid="board-card-modal"
        data-kind={card.kind}
        data-reference={reference.type}
      >
        <header className="wb-jira-modal-header">
          <div>
            <span className="wb-board-modal-kind">{card.kind.replace(/-/g, " ")}</span>
            <h2 id="board-card-title" ref={titleRef} tabIndex={-1}>
              {card.title}
            </h2>
            <p>Read only. The agent is the only thing that writes this board.</p>
          </div>
          <div className="wb-modal-header-actions">
            <button
              type="button"
              className="wb-icon-button"
              onClick={onClose}
              aria-label="Close card detail"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="wb-jira-modal-body">
          {card.detail && <p className="wb-board-modal-detail">{card.detail}</p>}

          {href && (
            <a
              className="wb-board-modal-link"
              href={href}
              target="_blank"
              rel="noreferrer"
              data-testid="board-card-modal-link"
              onClick={(event) => interceptTicketClick(event, href)}
            >
              {reference.label}
              <ArrowUpRight size={15} />
            </a>
          )}

          <section className="wb-board-modal-block">
            <h3>Why it is in {lane.label}</h3>
            <p>{card.why || lane.helper}</p>
          </section>

          <section className="wb-board-modal-block" data-testid="board-card-evidence">
            <h3>Evidence</h3>
            {card.evidence.length > 0 ? (
              <ul>
                {card.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="wb-muted">The agent recorded nothing beyond what is above.</p>
            )}
          </section>

          <section className="wb-board-modal-block">
            <h3>Points at</h3>
            <p>{referenceSummary(reference)}</p>
          </section>

          {card.meta.length > 0 && (
            <div className="wb-board-meta">
              {card.meta.map((entry) => (
                <span className="wb-pill" key={entry}>
                  {entry}
                </span>
              ))}
            </div>
          )}
        </div>

        <footer className="wb-jira-modal-footer">
          <span>
            {card.age ? `Last change ${card.age}. ` : ""}
            {card.at ? `Timestamp ${new Date(card.at).toLocaleString()}.` : ""}
          </span>
          <div>
            <button type="button" className="wb-secondary-button" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
