import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createActivityReconciliationService } from "./activity-reconciliation.mjs";
import { createActivityStore } from "./activity-store.mjs";

function sourceResults(to, overrides = {}) {
  const ids = [
    "outlook_received",
    "outlook_replied",
    "outlook_sent",
    "teams_channel_messages",
    "teams_group_messages",
    "teams_direct_messages",
    "teams_meeting_transcripts",
    "brain_updates",
  ];
  return ids.map((id) => ({
    id,
    state: "empty",
    items: [],
    confirmedThrough: to,
    detail: "Read succeeded.",
    ...(overrides[id] || {}),
  }));
}

function issue() {
  return {
    key: "MT-42",
    summary: "Fabric source mapping",
    description: "Map the Fabric source data.",
    status: { name: "In Progress" },
    updatedAt: "2026-08-05T12:00:00.000Z",
    comments: [],
    worklogs: [],
  };
}

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "activity-reconciliation-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const current = { value: "2026-08-06T14:00:00.000Z" };
  const service = createActivityReconciliationService({
    store: createActivityStore(join(root, "state.json")),
    clock: () => new Date(current.value),
    loadJiraIssues: async () => [issue()],
    processMeeting: async () => ({
      ok: true,
      id: "2026-08-06-fabric-review",
      receipt: { packageHash: "fixture-package" },
      links: [{ label: "Meeting visual", href: "/fixture.png" }],
    }),
    ...options,
  });
  await service.ready;
  return { service, current, root };
}

test("baseline run keeps one fixed upper time and produces review-only results", async (t) => {
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to, {
        outlook_received: {
          state: "current",
          confirmedThrough: windows.outlook_received.to,
          items: [
            {
              providerItemId: "mail-1",
              eventAt: "2026-08-06T13:30:00.000Z",
              title: "Fabric source mapping",
              summary: "Patrick confirmed the source mapping on MT-42.",
              status: "current",
              jiraKey: "MT-42",
              suggestedEmail: {
                to: "Patrick Stiller",
                subject: "Source mapping follow-up",
                body: "Patrick,\n\nI have the source mapping update.\n\nSteve",
              },
            },
          ],
        },
        teams_meeting_transcripts: {
          state: "current",
          confirmedThrough: windows.teams_meeting_transcripts.to,
          items: [
            {
              providerItemId: "meeting-1",
              eventAt: "2026-08-06T13:00:00.000Z",
              title: "Fabric delivery review",
              summary: "The meeting completed with a ready Teams transcript.",
              transcriptReady: true,
              transcript: "Steve: I will update MT-42 with the source mapping.",
              meeting: {
                id: "meeting-1",
                title: "Fabric delivery review",
                start: "2026-08-06T13:00:00.000Z",
                attendees: ["Steve Nahrup", "Patrick Stiller"],
              },
            },
          ],
        },
      }),
    }),
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.equal(started.run.baseline, true);
  assert.equal(started.run.windows.outlook_received.from, "2026-01-01T00:00:00.000Z");
  assert.equal(started.run.windows.outlook_received.to, started.run.startedAt);
  assert.equal(completed.status, "completed");
  assert.equal(completed.counts.new, 2);
  assert.equal(completed.jiraProposals.length, 2);
  assert.equal(completed.emailDrafts.length, 1);
  assert.equal(completed.meetings[0].status, "completed");
  assert.equal(
    completed.recap.groups.some((group) => group.sourceId === "outlook_received"),
    true
  );
});

test("meeting Jira and email follow-ups reach the activity review", async (t) => {
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.teams_meeting_transcripts.to, {
        teams_meeting_transcripts: {
          state: "current",
          confirmedThrough: windows.teams_meeting_transcripts.to,
          items: [
            {
              providerItemId: "meeting-review-items",
              eventAt: "2026-08-06T13:00:00.000Z",
              title: "Fabric action review",
              summary: "The ready meeting contains Jira and email follow-ups.",
              transcriptReady: true,
              transcript: "Steve: Update MT-42 and email Patrick with the result.",
              meeting: {
                id: "meeting-review-items",
                title: "Fabric action review",
                start: "2026-08-06T13:00:00.000Z",
              },
            },
          ],
        },
      }),
    }),
    processMeeting: async () => ({
      ok: true,
      id: "meeting-review-items",
      reviewComplete: true,
      reviewItems: [
        {
          providerItemId: "meeting-review-items:jira:0",
          eventAt: "2026-08-06T13:00:00.000Z",
          title: "Update the Fabric source mapping",
          summary: "Patrick asked me to update MT-42 with the confirmed source mapping.",
          jiraKey: "MT-42",
          jiraReferenceKind: "direct",
          jiraContextSignals: ["Meeting action from Fabric action review"],
          actionable: true,
        },
        {
          providerItemId: "meeting-review-items:email:0",
          eventAt: "2026-08-06T13:00:00.000Z",
          title: "Fabric action review follow-up",
          summary: "Draft the agreed follow-up.",
          actionable: false,
          suggestedEmail: {
            to: "Patrick Stiller",
            subject: "Fabric action review follow-up",
            body: "Patrick,\n\nI updated the source mapping follow-up.\n\nSteve",
          },
        },
      ],
      receipt: { packageHash: "meeting-review-package" },
      links: [],
    }),
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.jiraProposals.length, 1);
  assert.equal(completed.jiraProposals[0].issueKey, "MT-42");
  assert.equal(completed.emailDrafts.length, 1);
  assert.equal(completed.emailDrafts[0].to, "Patrick Stiller");
  assert.equal(
    completed.recap.groups.some(
      (group) =>
        group.sourceId === "teams_meeting_transcripts" &&
        group.destinations.some((destination) => destination.id === "email_draft")
    ),
    true
  );
});

test("later runs overlap by fifteen minutes and suppress repeated evidence", async (t) => {
  let collection = 0;
  const { service, current } = await fixture(t, {
    collectSources: async ({ windows }) => {
      collection += 1;
      const items = [
        {
          providerItemId: "same-mail",
          eventAt: "2026-08-06T13:55:00.000Z",
          title: "Fabric source mapping",
          summary: "MT-42 source mapping is current.",
          jiraKey: "MT-42",
        },
      ];
      if (collection === 2) {
        items.push({
          providerItemId: "late-mail",
          eventAt: "2026-08-05T09:00:00.000Z",
          updatedAt: "2026-08-07T13:40:00.000Z",
          title: "Late Fabric source note",
          summary: "A late-arriving note also names MT-42.",
          jiraKey: "MT-42",
        });
      }
      return {
        sources: sourceResults(windows.outlook_received.to, {
          outlook_received: {
            state: "current",
            confirmedThrough: windows.outlook_received.to,
            items,
          },
        }),
      };
    },
  });

  const first = await service.start();
  await service.waitForRun(first.run.id);
  current.value = "2026-08-07T14:00:00.000Z";
  const second = await service.start();
  const completed = await service.waitForRun(second.run.id);

  assert.equal(second.run.baseline, false);
  assert.equal(second.run.windows.outlook_received.from, "2026-08-06T13:45:00.000Z");
  assert.equal(completed.counts.new, 1);
  assert.equal(completed.counts.unchanged, 1);
  assert.equal(completed.evidence.length, 1);
  assert.equal(completed.evidence[0].providerItemId, "late-mail");
});

test("stop waits for the current source read and resume keeps the same run id", async (t) => {
  let release;
  let calls = 0;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => {
      calls += 1;
      if (calls === 1) await blocker;
      return { sources: sourceResults(windows.outlook_received.to) };
    },
  });

  const started = await service.start();
  const stopping = await service.stop(started.run.id);
  assert.equal(stopping.status, "stopping");
  release();
  const canceled = await service.waitForRun(started.run.id);
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.resumable, true);

  const resumed = await service.resume(started.run.id);
  assert.equal(resumed.id, started.run.id);
  const completed = await service.waitForRun(started.run.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.resumeCount, 1);
});

test("a failed source keeps its earlier successful position", async (t) => {
  let calls = 0;
  const { service, current } = await fixture(t, {
    collectSources: async ({ windows }) => {
      calls += 1;
      return {
        sources: sourceResults(windows.outlook_received.to, {
          outlook_received:
            calls === 1
              ? { state: "empty", items: [], confirmedThrough: windows.outlook_received.to }
              : {
                  state: "timed_out",
                  items: [],
                  confirmedThrough: null,
                  detail: "Read timed out.",
                },
        }),
      };
    },
  });
  const first = await service.start();
  await service.waitForRun(first.run.id);
  current.value = "2026-08-07T14:00:00.000Z";
  const second = await service.start();
  const completed = await service.waitForRun(second.run.id);
  assert.equal(completed.status, "partial_success");

  current.value = "2026-08-08T14:00:00.000Z";
  const third = await service.start();
  assert.equal(third.run.windows.outlook_received.from, "2026-08-06T13:45:00.000Z");
  await service.waitForRun(third.run.id);
});

test("two attached callers receive one saved Jira apply receipt", async (t) => {
  let mutations = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to, {
        outlook_received: {
          state: "current",
          items: [
            {
              providerItemId: "mail-apply",
              eventAt: "2026-08-06T13:30:00.000Z",
              title: "Fabric source mapping",
              summary: "MT-42 source mapping is ready.",
              jiraKey: "MT-42",
            },
          ],
          confirmedThrough: windows.outlook_received.to,
        },
      }),
    }),
    applyJiraProposal: async ({ proposal }) => {
      mutations += 1;
      await pending;
      return { receipt: { issueKey: proposal.issueKey, readback: true } };
    },
  });
  const started = await service.start();
  const run = await service.waitForRun(started.run.id);
  assert.equal(run.jiraProposals.length, 1);
  const proposalIds = [run.jiraProposals[0].id];
  const confirmation = "APPLY 1 JIRA PROPOSAL";
  const first = service.applySelected(run.id, proposalIds, confirmation);
  const second = service.applySelected(run.id, proposalIds, confirmation);
  release();
  const [left, right] = await Promise.all([first, second]);

  assert.equal(mutations, 1);
  assert.equal(left.id, right.id);
  assert.equal(left.status, "complete");
  const updated = await service.getRun(run.id);
  assert.equal(updated.actualChanges.length, 1);
});

test("an unchanged ready meeting retries after a partial save without persisting its transcript", async (t) => {
  let attempts = 0;
  const { service, current, root } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.teams_meeting_transcripts.to, {
        teams_meeting_transcripts: {
          state: "current",
          confirmedThrough: windows.teams_meeting_transcripts.to,
          items: [
            {
              providerItemId: "meeting-retry",
              eventAt: "2026-08-06T13:00:00.000Z",
              title: "Fabric retry review",
              summary: "The ready meeting package needs completion.",
              transcriptReady: true,
              transcript: "PRIVATE TRANSCRIPT VALUE THAT MUST NOT BE SAVED",
              meeting: {
                id: "meeting-retry",
                title: "Fabric retry review",
                start: "2026-08-06T13:00:00.000Z",
              },
            },
          ],
        },
      }),
    }),
    inspectMeeting: async () => ({ complete: false, missing: ["infographicPng"] }),
    processMeeting: async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, id: "meeting-retry", detail: "The visual is missing." }
        : {
            ok: true,
            id: "meeting-retry",
            receipt: { packageHash: "repaired-package" },
            links: [{ label: "Meeting visual", href: "/meeting-retry.png" }],
          };
    },
  });

  const first = await service.start();
  const partial = await service.waitForRun(first.run.id);
  assert.equal(partial.status, "partial_success");
  assert.equal(partial.meetings[0].status, "partial");

  current.value = "2026-08-07T14:00:00.000Z";
  const second = await service.start();
  const repaired = await service.waitForRun(second.run.id);
  assert.equal(attempts, 2);
  assert.equal(repaired.counts.unchanged, 1);
  assert.equal(repaired.meetings[0].status, "repaired");
  assert.equal(repaired.jiraProposals.length, 0);
  assert.equal(repaired.recap.groups.length, 1);

  const savedState = await readFile(join(root, "state.json"), "utf8");
  assert.equal(savedState.includes("PRIVATE TRANSCRIPT VALUE"), false);
});

test("a source position cannot advance past the run start", async (t) => {
  let calls = 0;
  const { service, current } = await fixture(t, {
    collectSources: async () => {
      calls += 1;
      return {
        sources: sourceResults("2027-01-01T00:00:00.000Z", {
          outlook_received: {
            state: "empty",
            items: [],
            confirmedThrough: "2027-01-01T00:00:00.000Z",
          },
        }),
      };
    },
  });
  const first = await service.start();
  await service.waitForRun(first.run.id);
  current.value = "2026-08-07T14:00:00.000Z";
  const second = await service.start();
  assert.equal(second.run.windows.outlook_received.from, "2026-08-06T13:45:00.000Z");
  await service.waitForRun(second.run.id);
  assert.equal(calls, 2);
});

test("evidence after the fixed run start is deferred until the next run", async (t) => {
  const { service, current } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to, {
        outlook_received: {
          state: "current",
          confirmedThrough: windows.outlook_received.to,
          items: [
            {
              providerItemId: "before-start",
              eventAt: "2026-08-06T13:59:00.000Z",
              title: "Fabric item before the run",
              summary: "This item is inside the fixed period.",
            },
            {
              providerItemId: "after-start",
              eventAt: "2026-08-06T14:01:00.000Z",
              title: "Fabric item after the run",
              summary: "This item belongs in the next run.",
            },
          ],
        },
      }),
    }),
  });

  const first = await service.start();
  const firstRun = await service.waitForRun(first.run.id);
  assert.deepEqual(
    firstRun.evidence.map((item) => item.providerItemId),
    ["before-start"]
  );
  assert.match(firstRun.sources.outlook_received.detail, /1 item outside this run's fixed period/);

  current.value = "2026-08-06T14:02:00.000Z";
  const second = await service.start();
  const secondRun = await service.waitForRun(second.run.id);
  assert.equal(
    secondRun.evidence.some((item) => item.providerItemId === "after-start"),
    true
  );
});

test("a stale open item gets a close proposal in its own recap group", async (t) => {
  const { service } = await fixture(t, {
    loadJiraIssues: async () => [
      issue(),
      {
        key: "MT-77",
        summary: "Forgotten intake cleanup",
        description: "Old intake work nobody has touched.",
        status: { name: "In Progress" },
        updatedAt: "2026-04-01T09:00:00.000Z",
        comments: [],
        worklogs: [],
      },
    ],
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to),
    }),
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  const stale = completed.jiraProposals.filter((item) => item.confidence === "stale");
  assert.equal(stale.length, 1);
  assert.equal(stale[0].issueKey, "MT-77");
  assert.equal(stale[0].sourceId, "stale_sweep");
  const staleGroup = completed.recap.groups.find((group) => group.sourceId === "stale_sweep");
  assert.ok(staleGroup);
  assert.equal(staleGroup.sourceLabel, "Stale Jira work");
});

test("the MDM check runs after the activity run and lands in the recap", async (t) => {
  let checked = 0;
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to),
    }),
    runMdmCheck: async () => {
      checked += 1;
      return { previewId: "mdm-preview-1", proposalCount: 3 };
    },
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.equal(checked, 1);
  assert.equal(completed.status, "completed");
  assert.equal(completed.mdmCheck.status, "completed");
  assert.equal(completed.mdmCheck.proposalCount, 3);
  assert.equal(completed.mdmCheck.previewId, "mdm-preview-1");
  const group = completed.recap.groups.find((item) => item.sourceId === "mdm_check");
  assert.ok(group);
  assert.equal(group.sourceLabel, "MDM check (Jira vs. Brain)");
});

test("an MDM check failure is reported without failing the activity run", async (t) => {
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to),
    }),
    runMdmCheck: async () => {
      throw new Error("The MDM preview is unavailable.");
    },
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.mdmCheck.status, "failed");
  assert.match(completed.mdmCheck.detail, /unavailable/);
});

test("email drafts are created in Outlook and their status lands on the run", async (t) => {
  const delivered = [];
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to, {
        outlook_received: {
          state: "current",
          confirmedThrough: windows.outlook_received.to,
          items: [
            {
              providerItemId: "mail-draft",
              eventAt: "2026-08-06T13:30:00.000Z",
              title: "Fabric source mapping",
              summary: "Patrick asked for a follow-up email.",
              status: "current",
              jiraKey: "MT-42",
              suggestedEmail: {
                to: "Patrick Stiller",
                subject: "Source mapping follow-up",
                body: "Patrick,\n\nHere is the follow-up.\n\nSteve",
              },
            },
          ],
        },
      }),
    }),
    deliverEmailDrafts: async ({ draft }) => {
      delivered.push(draft.subject);
      return { draftId: "outlook-draft-1" };
    },
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.deepEqual(delivered, ["Source mapping follow-up"]);
  assert.equal(completed.emailDrafts.length, 1);
  assert.equal(completed.emailDrafts[0].outlook.status, "created");
  assert.equal(completed.emailDrafts[0].outlook.draftId, "outlook-draft-1");
});

test("a failed Outlook draft is reported on the draft without failing the run", async (t) => {
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to, {
        outlook_received: {
          state: "current",
          confirmedThrough: windows.outlook_received.to,
          items: [
            {
              providerItemId: "mail-draft",
              eventAt: "2026-08-06T13:30:00.000Z",
              title: "Fabric source mapping",
              summary: "Patrick asked for a follow-up email.",
              status: "current",
              jiraKey: "MT-42",
              suggestedEmail: {
                to: "Patrick Stiller",
                subject: "Source mapping follow-up",
                body: "Patrick,\n\nHere is the follow-up.\n\nSteve",
              },
            },
          ],
        },
      }),
    }),
    deliverEmailDrafts: async () => {
      throw new Error("Outlook is unavailable.");
    },
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.emailDrafts[0].outlook.status, "failed");
  assert.match(completed.emailDrafts[0].outlook.detail, /unavailable/);
});

test("a draft without a recipient stays in the panel instead of reaching Outlook", async (t) => {
  const delivered = [];
  const { service } = await fixture(t, {
    collectSources: async ({ windows }) => ({
      sources: sourceResults(windows.outlook_received.to, {
        outlook_received: {
          state: "current",
          confirmedThrough: windows.outlook_received.to,
          items: [
            {
              providerItemId: "mail-draft",
              eventAt: "2026-08-06T13:30:00.000Z",
              title: "Fabric source mapping",
              summary: "A follow-up with no clear recipient.",
              status: "current",
              jiraKey: "MT-42",
              suggestedEmail: {
                to: null,
                subject: "Source mapping follow-up",
                body: "Here is the follow-up.",
              },
            },
          ],
        },
      }),
    }),
    deliverEmailDrafts: async ({ draft }) => {
      delivered.push(draft.subject);
      return { draftId: "should-not-happen" };
    },
  });

  const started = await service.start();
  const completed = await service.waitForRun(started.run.id);

  assert.deepEqual(delivered, []);
  assert.equal(completed.emailDrafts[0].outlook.status, "recipient_review");
});
