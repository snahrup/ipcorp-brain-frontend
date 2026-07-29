import { CircleAlert, CircleCheck, CircleHelp, Clock3, CloudOff } from "lucide-react";
import type { SourcePassport } from "../../types/workbench";
import {
  type ConnectionAvailability,
  type ConnectionStatus,
  connectionScopeLabel,
  connectionStatePresentation,
  getPassiveConnectionStatus,
} from "./connectionStatus";
import "./SourcePassportCard.css";

const stateIcon = {
  connected: CircleCheck,
  "not-checked": CircleHelp,
  unavailable: CloudOff,
  "auth-required": CircleAlert,
  stale: Clock3,
} satisfies Record<ConnectionAvailability, typeof CircleCheck>;

export function SourcePassportCard({
  passport,
  status = getPassiveConnectionStatus(passport),
}: {
  passport: SourcePassport;
  status?: ConnectionStatus;
}) {
  const presentation = connectionStatePresentation[status.state];
  const Icon = stateIcon[status.state];
  const scopeLabel = connectionScopeLabel(status.scope);

  return (
    <article
      className="wb-passport"
      data-source={passport.id}
      data-connection-state={status.state}
      data-connection-scope={status.scope}
    >
      <div className="wb-passport-head">
        <div className="wb-passport-title">
          {passport.id === "fabric" && (
            <span className="wb-source-brand-icon">
              <img src="/fabric-icons/fabric.png" alt="" aria-hidden="true" />
            </span>
          )}
          <div>
            <span className="wb-kicker">Source passport</span>
            <h3>{passport.name}</h3>
          </div>
        </div>
        <span
          className={`wb-status wb-status-${presentation.tone}`}
          role="status"
          aria-label={`${passport.name} connection status: ${presentation.label}`}
        >
          <Icon size={15} aria-hidden="true" />
          {presentation.label}
        </span>
      </div>

      <p>{passport.purpose}</p>
      <strong className="wb-passport-summary">{status.detail}</strong>

      <dl className="wb-passport-meta">
        <div>
          <dt>Status evidence</dt>
          <dd>
            {status.observedAt
              ? new Date(status.observedAt).toLocaleString()
              : "Not checked in this view"}
          </dd>
        </div>
        <div>
          <dt>Access scope</dt>
          <dd>{scopeLabel}</dd>
        </div>
      </dl>

      <div className="wb-passport-capabilities">
        <span className="wb-sr-only">
          Configured capabilities for {passport.name}; availability is not implied
        </span>
        {passport.capabilities.map((capability) => (
          <span key={capability}>{capability}</span>
        ))}
      </div>

      {passport.limitations.length > 0 && (
        <div className="wb-limitations">
          <strong>What this means</strong>
          <ul>
            {passport.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
