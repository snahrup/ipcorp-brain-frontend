import { CircleHelp } from "lucide-react";
import { SourcePassportCard } from "../../components/workbench";
import type { SourcePassport } from "../../types/workbench";

export function ConnectionsView({ sources }: { sources: SourcePassport[] }) {
  return (
    <div className="wb-page" data-testid="connections-view">
      <section className="wb-page-heading">
        <div>
          <span className="wb-kicker">Connections · source and access status</span>
          <h1>Know what the team can safely use.</h1>
          <p>
            This page reads prepared local metadata only. It does not contact Jira or Microsoft 365,
            so those sources remain not checked until a deliberate workflow observes them.
          </p>
        </div>
        <span
          className="wb-status wb-status-neutral"
          role="status"
          aria-label="Connection checks: none run from this page"
        >
          <CircleHelp size={16} aria-hidden="true" />
          No connection checks run
        </span>
      </section>

      <section className="wb-passport-grid" aria-label="Source connection status">
        {sources.map((passport) => (
          <SourcePassportCard key={passport.id} passport={passport} />
        ))}
      </section>
    </div>
  );
}
