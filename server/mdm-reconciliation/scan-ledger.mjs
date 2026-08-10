/**
 * The reconciliation scan ledger: durable memory for the Refresh and Reconcile MDM
 * workflow. Every preview is a scan; every scan is logged with its activity window;
 * every evidence record is fingerprinted so a candidate that was already reviewed,
 * applied, or dismissed never comes back unless its substance actually changes.
 *
 * Without this file the preview re-proposed every evidence record ever exported on
 * every click, which made the feature unusable. See the frozen conditions in
 * docs/mythos/gates/20260805-183000-reconciliation-scan-ledger.md.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SCAN_HISTORY_CAP = 60;
const EVENT_HISTORY_CAP = 200;

const sha1 = (value) => createHash("sha1").update(value).digest("hex");

/**
 * Identity, not content. Built from kind + title + reference because those hold
 * still across runs; ids cannot be trusted (Microsoft 365 evidence ids embed an
 * array index, so the same email would churn to a new id on every collection).
 */
export function evidenceFingerprint(record) {
  const kind = String(record.kind || "evidence");
  return `${kind.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}::${sha1(
    [kind, record.title || "", record.reference || ""].join("|")
  )}`;
}

/** Content, not identity. When this moves, the record deserves another look. */
export function evidenceHash(record) {
  return sha1(
    [record.title || "", record.text || "", record.status || "", record.updatedAt || ""].join("|")
  );
}

export function emptyLedger() {
  return {
    version: 1,
    lastScanAt: null,
    scans: [],
    evidence: {},
    events: [],
  };
}

export async function loadLedger(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return emptyLedger();
    return {
      ...emptyLedger(),
      ...parsed,
      scans: Array.isArray(parsed.scans) ? parsed.scans : [],
      evidence: parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {},
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    // A missing or corrupt ledger must never break the modal; it only means the
    // next scan starts from scratch.
    return emptyLedger();
  }
}

export async function saveLedger(path, ledger) {
  await mkdir(dirname(path), { recursive: true });
  // Unique per call so concurrent writers (StrictMode's double-invoked mount
  // effect, or genuine concurrent tabs) never race to rename the same tmp path.
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

/**
 * Sort the collected evidence into what deserves attention this scan.
 *
 * - "new": never seen by any scan.
 * - "changed": seen before (resolved or not) but its substance moved since.
 * - "carried": seen, unchanged, and still unresolved; shown quietly, not re-shouted.
 * - resolved (dismissed or applied, unchanged): excluded from the returned records
 *   entirely and only counted.
 */
export function classifyEvidence(records, ledger) {
  const counts = { newCount: 0, changedCount: 0, carriedCount: 0, resolvedCount: 0 };
  const out = [];
  for (const record of records) {
    const fingerprint = evidenceFingerprint(record);
    const hash = evidenceHash(record);
    const entry = ledger.evidence[fingerprint];
    if (!entry) {
      counts.newCount += 1;
      out.push({ ...record, fingerprint, hash, freshness: "new" });
      continue;
    }
    const resolved = entry.disposition === "dismissed" || entry.disposition === "applied";
    if (resolved && entry.resolvedHash === hash) {
      counts.resolvedCount += 1;
      continue;
    }
    if (entry.hash !== hash || (resolved && entry.resolvedHash !== hash)) {
      counts.changedCount += 1;
      out.push({ ...record, fingerprint, hash, freshness: "changed" });
      continue;
    }
    counts.carriedCount += 1;
    out.push({ ...record, fingerprint, hash, freshness: "carried" });
  }
  return { records: out, counts };
}

/**
 * Log one scan and mark every classified record as seen. A record that changed
 * after being resolved goes back to pending: new activity reopens it.
 */
export function recordScan(ledger, scanMeta, classifiedRecords) {
  const finishedAt = scanMeta.finishedAt || new Date().toISOString();
  const evidence = { ...ledger.evidence };
  for (const record of classifiedRecords) {
    const existing = evidence[record.fingerprint];
    evidence[record.fingerprint] = {
      hash: record.hash,
      firstSeenAt: existing?.firstSeenAt || finishedAt,
      lastSeenAt: finishedAt,
      disposition: existing && record.freshness !== "changed" ? existing.disposition : "pending",
      resolvedAt: record.freshness === "changed" ? null : (existing?.resolvedAt ?? null),
      resolvedHash: record.freshness === "changed" ? null : (existing?.resolvedHash ?? null),
      kind: record.kind || existing?.kind || "evidence",
      title: record.title || existing?.title || "",
    };
  }
  const scan = {
    id: `scan-${finishedAt}`,
    startedAt: scanMeta.startedAt || finishedAt,
    finishedAt,
    window: scanMeta.window || { from: ledger.lastScanAt, to: finishedAt },
    sources: scanMeta.sources || [],
    counts: scanMeta.counts || null,
    proposalCount: scanMeta.proposalCount ?? null,
  };
  return {
    ...ledger,
    lastScanAt: finishedAt,
    scans: [...ledger.scans, scan].slice(-SCAN_HISTORY_CAP),
    evidence,
  };
}

/**
 * Resolve fingerprints as dismissed ("reviewed, no Jira change") or applied.
 * The current hash is pinned so only genuine later change can resurface them.
 */
export function applyDispositions(ledger, fingerprints, disposition, at, note) {
  const resolvedAt = at || new Date().toISOString();
  const evidence = { ...ledger.evidence };
  const events = [...ledger.events];
  let touched = 0;
  for (const fingerprint of fingerprints) {
    const entry = evidence[fingerprint];
    if (!entry) continue;
    evidence[fingerprint] = {
      ...entry,
      disposition,
      resolvedAt,
      resolvedHash: entry.hash,
    };
    events.push({ type: disposition, at: resolvedAt, fingerprint, note: note || null });
    touched += 1;
  }
  return {
    ...ledger,
    evidence,
    events: events.slice(-EVENT_HISTORY_CAP),
    lastDispositionAt: touched ? resolvedAt : (ledger.lastDispositionAt ?? null),
  };
}
