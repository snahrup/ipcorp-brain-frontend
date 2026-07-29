import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildWeeklyOperationLedger, SETTLEMENT_HOURS } from "./build-weekly-operation-ledger.mjs";
import { auditWeeklyEffort, FIRST_SETTLED_WEEK, LAST_SETTLED_WEEK } from "./policy.mjs";

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weeklyActivity(weekOf) {
  return {
    weekOf,
    activities: [
      {
        stableId: `activity-${weekOf}`,
        title: `Fabric rollout evidence package ${weekOf}`,
        summary:
          "Reviewed the MDM rollout evidence, reconciled the Fabric delivery path, and captured the work item for source, modeling, governance, and rollout continuity.",
        startDate: weekOf,
        endDate: addDays(weekOf, 5),
        disposition: "completed",
        activeNow: false,
        stillDue: false,
        solo: true,
        participants: [],
        collaborationEvidenceRefs: [],
        evidenceRefs: [`brain:${weekOf}:mdm-rollout`],
        candidateJiraKeys: ["MT-12"],
        deliverables: ["MDM rollout package"],
        validation: ["Evidence was reconciled against the Fabric rollout path"],
        technicalDetails: ["Source, modeling, governance, and rollout evidence were represented"],
        baselineEffortHours: 0,
        effortBasis: "normalized-settlement",
        microsoftAlignment: [
          {
            practice: "Evidence-first rollout governance",
            reference: "team-library:fabric-rollout",
          },
        ],
        subtasks: [],
        relationships: [],
        confidence: "high",
      },
    ],
    unresolved: [],
    excluded: [],
    coverage: {
      sourceRecords: 1,
      condensedGroups: 1,
      ineligibleGroupsWithheld: 0,
      includedGroups: 1,
      omittedGroups: 0,
      bounded: false,
    },
  };
}

test("buildWeeklyOperationLedger turns all full weeks into a valid MT-scoped 63h ledger", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "mdm-weekly-ledger-"));
  const weeklyDir = join(runDir, "weekly-activities");
  await mkdir(weeklyDir, { recursive: true });

  for (let week = FIRST_SETTLED_WEEK; week <= LAST_SETTLED_WEEK; week = addDays(week, 7)) {
    await writeFile(join(weeklyDir, `${week}.json`), JSON.stringify(weeklyActivity(week), null, 2));
  }

  const ledger = await buildWeeklyOperationLedger({
    runDir,
    generatedAt: "2026-07-28T00:00:00.000Z",
    parentExpectedJiraVersion: 7,
  });

  assert.equal(ledger.scope.projectKey, "MT");
  assert.equal(ledger.weeklySettlements.length, 12);
  assert.ok(ledger.operations.length > 0);
  for (const settlement of ledger.weeklySettlements) {
    assert.equal(settlement.expectedTotalHours, SETTLEMENT_HOURS);
    assert.equal(auditWeeklyEffort(settlement.worklogs)[0].targetMet, true);
  }
  assert.equal(
    ledger.operations.every(
      (operation) =>
        operation.sourceScope === "engagement" &&
        operation.evidenceRefs.length > 0 &&
        JSON.stringify(operation).includes("Prism") === false
    ),
    true
  );
});
