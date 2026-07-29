import { ArrowRight, CheckCircle2, ShieldCheck, X } from "lucide-react";
import type { ApprovalPreview } from "../../types/workbench";

export function ApprovalDock({
  preview,
  onClose,
}: {
  preview: ApprovalPreview | null;
  onClose: () => void;
}) {
  if (!preview) return null;

  return (
    <aside className="wb-approval-dock" aria-live="polite" aria-label="Prepared action review">
      <header>
        <div className="wb-approval-title">
          <span className="wb-icon-tile">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div>
            <span className="wb-kicker">Review before anything changes</span>
            <h2>{preview.itemTitle}</h2>
          </div>
        </div>
        <button
          className="wb-icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close review"
        >
          <X size={19} />
        </button>
      </header>

      <div className="wb-approval-summary">
        <div>
          <span>System</span>
          <strong>{preview.system === "jira" ? "Jira" : "Microsoft 365"}</strong>
        </div>
        <div>
          <span>Prepared action</span>
          <strong>{preview.action}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{preview.target}</strong>
        </div>
      </div>

      <div className="wb-change-preview">
        <span className="wb-change-before">{preview.before}</span>
        <ArrowRight size={18} aria-label="changes to" />
        <span className="wb-change-after">{preview.after}</span>
      </div>

      <div className="wb-evidence-row">
        <span>Based on</span>
        {preview.basedOn.map((source) => (
          <strong key={`${source.source}-${source.reference}`}>{source.label}</strong>
        ))}
      </div>

      <div className="wb-prepared-notice">
        <CheckCircle2 size={18} aria-hidden="true" />
        <span>{preview.disclosure}</span>
      </div>

      <div className="wb-approval-actions">
        <button className="wb-button-secondary" type="button" onClick={onClose}>
          Keep as prepared
        </button>
        <button
          className="wb-button-primary"
          type="button"
          disabled
          title="A verified team connection is required before execution."
        >
          Approve and queue
        </button>
      </div>
    </aside>
  );
}
