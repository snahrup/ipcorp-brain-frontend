/**
 * Repair pass for data/brain-graph.json — node/edge id reconciliation.
 *
 * The generator (generate-brain-graph.ts) currently mints edge endpoint ids in passes
 * that don't always create a matching node: deep extraction uses `meeting-<filename>`
 * ids, and edges reference systems.json ids (e.g. `oates`, `optiva`, `mes`) while only a
 * few `sys-` system nodes are created. A single edge pointing at a missing node id makes
 * 3d-force-graph throw "node not found" and blank the ENTIRE render.
 *
 * This script guarantees consistency on the already-generated data:
 *   1. if a bare endpoint id has a matching `sys-<id>` node, remap the edge to it;
 *   2. otherwise create a node for the endpoint, inferring its layer from the id prefix.
 *
 * Auto-completed nodes are clearly marked. A full regeneration on the brain machine
 * (with systems.json) will give them proper names. Run: node scripts/repair-brain-graph.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../data/brain-graph.json");

const g = JSON.parse(fs.readFileSync(file, "utf8"));
const nodeIds = new Set(g.nodes.map((n) => n.id));

const humanize = (raw) =>
  raw
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

let created = 0;
let remapped = 0;

const ensure = (id) => {
  if (!id || nodeIds.has(id)) return id;
  // 1. reconcile bare system id -> existing sys- node
  if (nodeIds.has(`sys-${id}`)) {
    remapped++;
    return `sys-${id}`;
  }
  // 2. create the missing node, inferring its layer from the id
  let layer = "system";
  let color = "#9f8cff";
  let name = id;
  if (id.startsWith("meeting-")) {
    layer = "meeting";
    color = "#77c7ff";
    name = humanize(id.replace(/^meeting-/, ""));
  } else if (id.startsWith("adr-")) {
    layer = "decision";
    color = "#2bd6a3";
    name = humanize(id);
  } else if (id.startsWith("insight-")) {
    layer = "insight";
    color = "#f7b955";
    name = humanize(id.replace(/^insight-/, ""));
  } else if (id.startsWith("risk-")) {
    layer = "risk";
    color = "#ff8a5b";
    name = humanize(id.replace(/^risk-/, ""));
  } else if (/^(question|dq|oq)-/.test(id)) {
    layer = "open_question";
    color = "#c084fc";
    name = humanize(id.replace(/^(question|dq|oq)-/, ""));
  } else if (id.startsWith("book-")) {
    layer = "reference";
    color = "#f4a261";
    name = humanize(id.replace(/^book-/, ""));
  } else {
    // system / entity — uppercase short codes (MES, ETQ, EAM), title-case the rest
    layer = "system";
    color = "#9f8cff";
    name = id.length <= 4 ? id.toUpperCase() : humanize(id);
  }
  g.nodes.push({
    id,
    name,
    group: layer,
    layer,
    val: 5,
    color,
    description:
      "Auto-completed from edge references (pending full regeneration with systems.json names).",
    sourceRefs: ["generator:node-completion"],
  });
  nodeIds.add(id);
  created++;
  return id;
};

for (const l of g.links) {
  l.source = ensure(l.source);
  l.target = ensure(l.target);
}

const ids2 = new Set(g.nodes.map((n) => n.id));
const danglingRemaining = g.links.filter((l) => !ids2.has(l.source) || !ids2.has(l.target)).length;

g.stats = g.stats || {};
g.stats.nodeCount = g.nodes.length;
g.stats.linkCount = g.links.length;
g.stats.layers = [...new Set(g.nodes.map((n) => n.layer))];

fs.writeFileSync(file, `${JSON.stringify(g, null, 2)}\n`);

console.log(
  `[repair] created ${created} nodes, remapped ${remapped} endpoints -> sys-. ` +
    `nodes=${g.nodes.length} links=${g.links.length} danglingRemaining=${danglingRemaining}`
);
