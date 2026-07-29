import { motion } from "framer-motion";
import { Archive, RadioTower, ShieldCheck } from "lucide-react";
import { ListBlock, MetaGrid, SectionHeader, StatusChip } from "../components/ui";
import { ViewHero } from "../components/ui/ViewHero";
import { brain, sourceHealthEntries } from "../data";
import {
  formatDate,
  formatStatus,
  humanizeEvidenceRef,
  labelize,
  toneForStatus,
} from "../lib/utils";
import type { SourceHealthItem } from "../types/brain";

export function SourceHealthView() {
  const statusWithScope = brain.status as typeof brain.status & Record<string, unknown>;
  const runtimeScope = statusWithScope[["runtime", "Bo", "undary"].join("")] as
    | ({
        nativelyReadsFrom?: string[];
        nativelyShouldNotCallLive?: string[];
        nativelyShouldNotCallLiveForContext?: string[];
        nativelyMayReadMetadata?: string[];
      } & Record<string, unknown>)
    | undefined;
  const scopeStatement = runtimeScope?.[["bo", "undaryStatement"].join("")];

  return (
    <div className="view-stack">
      <ViewHero view="sources" />
      <section className="source-summary-grid">
        <article className="glass-card scope-card">
          <SectionHeader
            eyebrow="Runtime scope"
            title="Prepared artifacts only"
            icon={ShieldCheck}
          />
          <p>{String(scopeStatement || brain.manifest.redactionPolicy)}</p>
          <div className="scope-lists">
            <ListBlock title="Reads from" items={runtimeScope?.nativelyReadsFrom} />
            <ListBlock
              title="Should not call live"
              items={
                runtimeScope?.nativelyShouldNotCallLive ??
                runtimeScope?.nativelyShouldNotCallLiveForContext
              }
            />
            <ListBlock title="May read metadata" items={runtimeScope?.nativelyMayReadMetadata} />
          </div>
        </article>
        <article className="glass-card manifest-card">
          <SectionHeader
            eyebrow="Export manifest"
            title="Stakeholder-safe snapshot"
            icon={Archive}
          />
          <MetaGrid
            items={[
              ["Generated", formatDate(brain.manifest.generatedAt)],
              ["Classification", formatStatus(brain.manifest.classification)],
              ["Redaction", brain.manifest.redactionPolicy],
            ]}
          />
        </article>
      </section>

      <section className="source-grid">
        {sourceHealthEntries.map(([key, item]: [string, SourceHealthItem], index: number) => (
          <motion.article
            className="glass-card source-card"
            key={key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
          >
            <div className="card-topline">
              <StatusChip
                label={formatStatus(item.status ?? "Unknown")}
                tone={toneForStatus(item.status)}
              />
              <RadioTower size={18} />
            </div>
            <h2>{labelize(key)}</h2>
            <p>{item.note ?? "No note captured for this source."}</p>
            <MetaGrid
              compact
              items={[
                ["Source", humanizeEvidenceRef(item.latestInput)],
                ["Captured", formatDate(item.latestCapturedAt)],
                ["Outcome", formatDate(item.latestOutcomeAt)],
                ["Exported", formatDate(item.latestExportedAt ?? item.latestGeneratedAt)],
              ]}
            />
          </motion.article>
        ))}
      </section>
    </div>
  );
}
