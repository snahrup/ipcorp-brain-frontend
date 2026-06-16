import fs from "node:fs";
import path from "node:path";

/**
 * Portable sync script for the IP Corp Brain frontend.
 *
 * Usage:
 *   BRAIN_PATH=/path/to/ipcorp-architecture-brain npm run sync:data
 *
 * Falls back to common local locations if env var is not set.
 */
const brain =
  process.env.BRAIN_PATH || "C:/Users/snahrup/CascadeProjects/ipcorp-architecture-brain";

const repo =
  process.env.REPO_PATH || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

if (!fs.existsSync(brain)) {
  console.error(`\n❌ Source brain not found at: ${brain}`);
  console.error(
    "   Set BRAIN_PATH environment variable to the ipcorp-architecture-brain directory.\n"
  );
  process.exit(1);
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (name, data) => {
  fs.writeFileSync(path.join(repo, "data", name), `${JSON.stringify(data, null, 2)}\n`);
};

console.log(`Syncing from: ${brain}`);
console.log(`Writing to:   ${repo}\n`);
const readDirJson = (dir, filter = (name) => name.endsWith(".json")) =>
  fs
    .readdirSync(dir)
    .filter(filter)
    .sort()
    .map((name) => readJson(path.join(dir, name)));

const status = readJson(path.join(brain, "natively/status.json"));
const meetingIndex = readJson(path.join(brain, "natively/meeting-index.json"));
const prepPackets = readDirJson(path.join(brain, "natively/prep-packets"), (name) =>
  name.endsWith(".packet.json")
);
const cortexInsights = readDirJson(path.join(brain, "natively/cortex/insights"));
const actionProposals = readDirJson(path.join(brain, "natively/action-proposals"));
const openQuestions = readJson(path.join(repo, "data/open-questions.json"));
const risks = readJson(path.join(repo, "data/risks.json"));
const adrs = readJson(path.join(repo, "data/adrs.json"));

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceBrain: brain,
  sourceHighWater: {
    brainStatusUpdatedAt: status.updatedAt,
    meetingIndexUpdatedAt: meetingIndex.updatedAt,
    latestNativelyRun: status.updatedAt,
  },
  classification: "internal-stakeholder-safe-draft",
  redactionPolicy:
    "Raw captures, authentication material, internal agent rules, live-capture snippets, and workflow receipts are excluded.",
  counts: {
    prepPackets: prepPackets.length,
    cortexInsights: cortexInsights.length,
    actionProposals: actionProposals.length,
    openQuestions: openQuestions.length,
    risks: risks.length,
    adrs: adrs.adrs.length,
    adrCandidates: adrs.candidates.length,
  },
  stitchEntryPoints: [
    "../STITCH_FRONTEND_BRIEF.md",
    "../.stitch/DESIGN.md",
    "STITCH_UNABYSS_MOTION_PROMPT.md",
    "frontend-seed.json",
  ],
};

const seed = {
  manifest,
  status,
  meetingIndex,
  prepPackets,
  cortexInsights,
  actionProposals,
  openQuestions,
  risks,
  adrs,
};

writeJson("status.json", status);
writeJson("meeting-index.json", meetingIndex);
writeJson("prep-packets.json", prepPackets);
writeJson("cortex-insights.json", cortexInsights);
writeJson("action-proposals.json", actionProposals);
writeJson("export-manifest.json", manifest);
writeJson("frontend-seed.json", seed);

console.log(JSON.stringify(manifest.counts, null, 2));
