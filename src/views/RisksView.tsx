import { motion } from "framer-motion";
import { useMemo } from "react";
import { FilterSummary, StatusChip } from "../components/ui";
import { ViewHero } from "../components/ui/ViewHero";
import { brain } from "../data";
import { filterByQuery } from "../lib/search";
import { formatStatus, groupBy, labelize } from "../lib/utils";
import type { Detail, Risk } from "../types/brain";

interface RisksViewProps {
  openDetail: (detail: Detail) => void;
  query: string;
}

export function RisksView({ openDetail, query }: RisksViewProps) {
  const risks = useMemo(
    () =>
      filterByQuery(brain.risks, query, (risk: Risk) => [
        risk.risk,
        risk.severity,
        risk.likelihood,
        risk.owner,
        risk.exposed,
        risk.mitigation,
      ]),
    [query]
  );

  const severityGroups = groupBy(risks, (risk: Risk) => risk.severity || "Unrated");

  return (
    <div className="view-stack">
      <ViewHero view="risks" />
      <FilterSummary query={query} count={risks.length} total={brain.risks.length} noun="risks" />
      <section className="risk-board">
        {Object.entries(severityGroups).map(([severity, items]) => (
          <article className="glass-card risk-column" key={severity}>
            <div className="column-heading compact">
              <span className="mono-kicker">{items.length} risks</span>
              <h2>{labelize(severity)}</h2>
            </div>
            <div className="risk-list">
              {items.length === 0 ? (
                <div
                  style={{
                    padding: "20px 12px",
                    fontSize: 12,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  No risks in this severity band.
                  <br />
                  Explore the 3D graph to see how risks connect to decisions, systems, and
                  mitigation signals across the full knowledge map.
                </div>
              ) : (
                items.map((risk: Risk, index: number) => (
                  <motion.button
                    className="risk-card"
                    key={risk.id}
                    onClick={() => openDetail({ kind: "risk", value: risk })}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.025 }}
                  >
                    <StatusChip label={formatStatus(risk.likelihood)} tone="orange" />
                    <strong>{risk.risk}</strong>
                    <p>{risk.mitigation}</p>
                    <small>Owner: {risk.owner}</small>
                  </motion.button>
                ))
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
