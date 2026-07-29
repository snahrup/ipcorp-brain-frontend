import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  connectionScopeLabel,
  connectionStatePresentation,
  getPassiveConnectionStatus,
} from "./connectionStatus.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sourceCard = readFileSync(resolve(here, "SourcePassportCard.tsx"), "utf8");
const connectionsView = readFileSync(
  resolve(here, "../../views/workbench/ConnectionsView.tsx"),
  "utf8"
);
const workbenchData = readFileSync(resolve(here, "../../data/workbench.ts"), "utf8");
const viewConfig = readFileSync(resolve(here, "../../lib/viewConfig.ts"), "utf8");
const sidebar = readFileSync(resolve(here, "WorkbenchSidebar.tsx"), "utf8");

function passport(id, state, overrides = {}) {
  return {
    id,
    name: id,
    purpose: "Configured source",
    state,
    teamLive: false,
    summary: "Baseline metadata",
    limitations: [],
    capabilities: [],
    ...overrides,
  };
}

test("supports every truthful availability state and the local-only scope", () => {
  assert.deepEqual(
    Object.keys(connectionStatePresentation).sort(),
    ["auth-required", "connected", "not-checked", "stale", "unavailable"].sort()
  );
  assert.equal(connectionStatePresentation.connected.label, "Connected");
  assert.equal(connectionStatePresentation["auth-required"].label, "Authentication required");
  assert.equal(connectionScopeLabel("local-only"), "Local only");
});

test("uses passive local evidence without contacting external systems", () => {
  const staleBrain = getPassiveConnectionStatus(
    passport("brain", "stale", { asOf: "2026-05-28T00:53:32.551Z" })
  );
  const microsoft365 = getPassiveConnectionStatus(passport("microsoft365", "local-only"));
  const jira = getPassiveConnectionStatus(passport("jira", "local-only"));
  const fabric = getPassiveConnectionStatus(passport("fabric", "off"));

  assert.equal(staleBrain.state, "stale");
  assert.equal(staleBrain.evidence, "prepared-snapshot");
  assert.deepEqual(
    [microsoft365.state, jira.state, fabric.state],
    ["not-checked", "not-checked", "not-checked"]
  );
  assert.equal(microsoft365.scope, "local-only");
  assert.equal(fabric.scope, "local-only");
  assert.equal(jira.scope, "local-only");
});

test("connections UI is passive, accessible, and free of static verification claims", () => {
  const scopedSource = [sourceCard, connectionsView, workbenchData, viewConfig, sidebar].join("\n");

  assert.doesNotMatch(scopedSource, /verified on this computer|live jira|m365 verified/i);
  assert.doesNotMatch(viewConfig, /Jira is not connected in this team build/);
  assert.doesNotMatch(`${sourceCard}\n${connectionsView}`, /\bfetch\s*\(|setInterval|jiraGateway/);
  assert.match(connectionsView, /aria-label="Source connection status"/);
  assert.match(connectionsView, /aria-label="Connection checks: none run from this page"/);
  assert.match(sourceCard, /data-connection-state=\{status\.state\}/);
  assert.match(sourceCard, /connection status: \$\{presentation\.label\}/);
});
