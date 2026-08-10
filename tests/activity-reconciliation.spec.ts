import { expect, type Page, type Route, test } from "@playwright/test";
import { jiraInitiative, mockJira } from "./helpers/mock-jira";

const startedAt = "2026-08-06T14:00:00.000Z";
const sourceIds = [
  ["outlook_received", "Outlook received"],
  ["outlook_replied", "Outlook replied"],
  ["outlook_sent", "Outlook sent"],
  ["teams_channel_messages", "Teams channels"],
  ["teams_group_messages", "Teams group chats"],
  ["teams_direct_messages", "Teams direct messages"],
  ["teams_meeting_transcripts", "Ready meeting transcripts"],
  ["brain_updates", "Brain updates"],
] as const;

function sources(state: "loading" | "empty" = "loading") {
  return Object.fromEntries(
    sourceIds.map(([id, label]) => [
      id,
      {
        id,
        label,
        state,
        itemCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        detail: state === "loading" ? "Waiting to read this source." : "No new items found.",
        startedAt,
        finishedAt: state === "empty" ? startedAt : null,
        confirmedThrough: state === "empty" ? startedAt : null,
      },
    ])
  );
}

function runFixture(status: string) {
  const running = status === "running" || status === "stopping";
  const runSources = sources(running ? "loading" : "empty");
  if (!running) {
    runSources.outlook_received = {
      ...runSources.outlook_received,
      state: "current",
      itemCount: 2,
      changedCount: 1,
      unchangedCount: 1,
      detail: "Two received messages read.",
    };
    runSources.teams_meeting_transcripts = {
      ...runSources.teams_meeting_transcripts,
      state: "current",
      itemCount: 1,
      changedCount: 1,
      detail: "One ready meeting transcript read.",
    };
    runSources.teams_direct_messages = {
      ...runSources.teams_direct_messages,
      state: "timed_out",
      detail: "The direct-message read timed out. No replay was sent.",
    };
  }
  return {
    id: "activity-20260806140000-fixture",
    status,
    baseline: true,
    startedAt,
    finishedAt: running ? null : "2026-08-06T14:02:30.000Z",
    lastActivityAt: running ? startedAt : "2026-08-06T14:02:30.000Z",
    resumedAt: null,
    resumeCount: 0,
    cancelRequested: status === "stopping",
    resumable: status === "canceled" || status === "interrupted",
    phase: running
      ? {
          id: "reading_sources",
          label: "Reading source activity",
          index: 2,
          total: 8,
          startedAt,
        }
      : {
          id: "finalizing",
          label: "Saving the recap",
          index: 8,
          total: 8,
          startedAt,
        },
    activity: running
      ? "Microsoft 365 is reading the requested Outlook and Teams streams."
      : "Activity reconciliation completed with source or meeting failures.",
    windows: Object.fromEntries(
      sourceIds.map(([id]) => [
        id,
        {
          from: "2026-01-01T00:00:00.000Z",
          to: startedAt,
          lateSweepFrom: "2026-01-01T00:00:00.000Z",
          overlapMinutes: 0,
          previousPosition: null,
        },
      ])
    ),
    sources: runSources,
    counts: running
      ? {
          observed: 1,
          new: 1,
          changed: 0,
          unchanged: 0,
          jiraProposals: 0,
          emailDrafts: 0,
          meetingsProcessed: 0,
          meetingsPending: 0,
          failures: 0,
        }
      : {
          observed: 3,
          new: 2,
          changed: 0,
          unchanged: 1,
          jiraProposals: 1,
          emailDrafts: 1,
          meetingsProcessed: 1,
          meetingsPending: 0,
          failures: 1,
        },
    jiraProposals: running
      ? []
      : [
          {
            id: "jira-proposal-one",
            destination: "jira",
            issueKey: "MT-42",
            title: "MT-42: Define governed customer domain",
            actionLabel: "comment",
            reason: "The source names MT-42.",
            confidence: "exact",
            requiresTargetReview: false,
            evidenceIds: ["outlook_received:message-one"],
            sourceId: "outlook_received",
            expectedUpdated: jiraInitiative.issues[0].updatedAt,
            before: {
              summary: jiraInitiative.issues[0].summary,
              status: "In Progress",
              updatedAt: jiraInitiative.issues[0].updatedAt,
            },
            changes: [{ kind: "comment", body: "Patrick confirmed the governed customer scope." }],
            selectedByDefault: false,
          },
        ],
    emailDrafts: running
      ? []
      : [
          {
            id: "email-draft-one",
            destination: "email_draft",
            sourceId: "outlook_received",
            to: "Patrick Stiller",
            subject: "Customer domain follow-up",
            body: "Patrick,\n\nI have the customer domain update.\n\nSteve",
            status: "draft_only",
          },
        ],
    meetings: running
      ? []
      : [
          {
            id: "meeting-one",
            evidenceId: "teams_meeting_transcripts:meeting-one",
            title: "Fabric delivery review",
            status: "completed",
            detail: "Meeting package saved.",
            receipt: { packageId: "meeting-one" },
            links: [
              {
                label: "Open meeting infographic",
                href: "/api/meetings/infographic?id=meeting-one&file=meeting-one.png",
              },
            ],
          },
        ],
    actualChanges: [],
    recap: running
      ? null
      : {
          generatedAt: "2026-08-06T14:02:30.000Z",
          changedItemCount: 2,
          proposalCount: 2,
          groups: [
            {
              sourceId: "outlook_received",
              sourceLabel: "Outlook received",
              destinations: [
                {
                  id: "jira",
                  label: "Jira",
                  items: [
                    {
                      id: "jira-proposal-one",
                      kind: "proposal",
                      title: "MT-42: Define governed customer domain",
                      detail: "comment",
                      receipt: null,
                      links: [],
                    },
                  ],
                },
              ],
            },
            {
              sourceId: "teams_meeting_transcripts",
              sourceLabel: "Ready meeting transcripts",
              destinations: [
                {
                  id: "brain",
                  label: "Brain and Workbench",
                  items: [
                    {
                      id: "meeting-one",
                      kind: "meeting",
                      title: "Fabric delivery review",
                      detail: "Meeting package saved.",
                      receipt: { packageId: "meeting-one" },
                      links: [
                        {
                          label: "Meeting visual",
                          href: "/api/meetings/infographic?id=meeting-one&file=meeting-one.png",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              sourceId: "teams_direct_messages",
              sourceLabel: "Teams direct messages",
              destinations: [
                {
                  id: "source_status",
                  label: "Source limitations",
                  items: [
                    {
                      id: "source-timeout",
                      kind: "failure",
                      title: "Teams direct messages: timed out",
                      detail: "The direct-message read timed out. No replay was sent.",
                      receipt: null,
                      links: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
    events: [],
  };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ok: status < 400, data }),
  });
}

async function openWork(page: Page) {
  await mockJira(page);
  await page.goto("/");
  if ((page.viewportSize()?.width || 1_280) <= 680) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Work", exact: true })
      .click();
  } else {
    await page.getByTestId("nav-work").click();
  }
  await expect(page.getByTestId("work-view")).toBeVisible();
}

test("runs the visible Work activity path and keeps Jira review approval-only", async ({
  page,
}, testInfo) => {
  let current: ReturnType<typeof runFixture> | null = null;
  let statusReads = 0;
  let starts = 0;
  let applies = 0;
  await page.route("http://127.0.0.1:8817/api/work/activity-reconciliation/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname.endsWith("/status")) {
      if (current?.status === "running") {
        statusReads += 1;
        if (statusReads >= 2) current = runFixture("partial_success");
      }
      await fulfill(route, current);
      return;
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/start")) {
      starts += 1;
      current = runFixture("running");
      await fulfill(route, { run: current, attached: false, resumed: false }, 202);
      return;
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/jira/apply")) {
      applies += 1;
      await fulfill(route, {
        id: "saved-fixture-receipt",
        runId: current?.id,
        proposalIds: ["jira-proposal-one"],
        status: "complete",
        startedAt,
        completedAt: "2026-08-06T14:03:00.000Z",
        results: [{ proposalId: "jira-proposal-one", status: "applied" }],
      });
      return;
    }
    await fulfill(route, null, 404);
  });

  await openWork(page);
  await expect(page.getByRole("button", { name: "Reconcile activity" })).toBeVisible();
  expect(starts).toBe(0);
  await page.getByRole("button", { name: "Reconcile activity" }).click();
  await expect.poll(() => starts).toBe(1);
  await expect(page.getByText("Reading source activity", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(page.getByTestId("activity-source-outlook_received")).toHaveAttribute(
    "data-state",
    "loading"
  );

  await expect(page.getByRole("heading", { name: "Run recap" })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Fabric delivery review", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Teams direct messages: timed out", { exact: true })).toBeVisible();
  await expect(page.getByText(/unchanged/i)).toHaveCount(0);

  const proposal = page.locator(".ar-proposal", {
    hasText: "MT-42: Define governed customer domain",
  });
  await proposal.getByRole("checkbox").check();
  const apply = page.getByRole("button", { name: "Apply selected Jira proposals" });
  await expect(apply).toBeDisabled();
  await page.getByLabel("Type APPLY 1 JIRA PROPOSAL").fill("APPLY 1 JIRA PROPOSAL");
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByText(/applied with saved readback receipts/i)).toBeVisible();
  expect(applies).toBe(1);

  await page.getByText("Customer domain follow-up", { exact: true }).click();
  await expect(page.getByText(/I have the customer domain update/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("activity-reconciliation-complete.png"),
    fullPage: true,
  });
});

test("stop records a canceled run and resume continues the same run", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let current: ReturnType<typeof runFixture> | null = null;
  let resumed = false;
  await page.route("http://127.0.0.1:8817/api/work/activity-reconciliation/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname.endsWith("/status")) {
      if (resumed && current?.status === "running") current = runFixture("completed");
      if (current?.status === "stopping") current = runFixture("canceled");
      await fulfill(route, current);
      return;
    }
    if (url.pathname.endsWith("/start")) {
      current = runFixture("running");
      await fulfill(route, { run: current, attached: false, resumed: false }, 202);
      return;
    }
    if (url.pathname.endsWith("/stop")) {
      current = runFixture("stopping");
      await fulfill(route, current, 202);
      return;
    }
    if (url.pathname.endsWith("/resume")) {
      resumed = true;
      current = { ...runFixture("running"), resumeCount: 1, resumedAt: "2026-08-06T14:03:00.000Z" };
      await fulfill(route, current, 202);
      return;
    }
    await fulfill(route, null, 404);
  });

  await openWork(page);
  await page.getByRole("button", { name: "Reconcile activity" }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".ar-spin")
        .first()
        .evaluate((element) => getComputedStyle(element).animationName)
    )
    .toBe("none");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume saved run" })).toBeVisible({
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Resume saved run" }).click();
  await expect(page.getByRole("heading", { name: "Run recap" })).toBeVisible({ timeout: 5_000 });
  expect(current?.id).toBe("activity-20260806140000-fixture");
});

test("phone layout keeps the activity panel inside the Work viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let current: ReturnType<typeof runFixture> | null = null;
  await page.route("http://127.0.0.1:8817/api/work/activity-reconciliation/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path.endsWith("/start")) {
      current = runFixture("running");
      return fulfill(route, { run: current, attached: false, resumed: false }, 202);
    }
    return fulfill(route, current);
  });
  await openWork(page);
  await page.getByRole("button", { name: "Reconcile activity" }).click();
  const panel = page.getByTestId("activity-reconciliation-panel");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  if (!box) throw new Error("The activity panel has no layout box.");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const viewportFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  expect(viewportFits).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("activity-reconciliation-phone.png"),
    fullPage: true,
  });
});

test("shows loading and a clear status error without starting a source read", async ({ page }) => {
  let releaseStatus: () => void = () => undefined;
  const statusWait = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  let starts = 0;
  await page.route("http://127.0.0.1:8817/api/work/activity-reconciliation/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET") {
      await statusWait;
      await route.fulfill({
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ok: false,
          code: "activity_status_unavailable",
          error: "Saved activity status is unavailable.",
        }),
      });
      return;
    }
    if (path.endsWith("/start")) starts += 1;
    await fulfill(route, null);
  });

  await openWork(page);
  const action = page.getByRole("button", { name: "Reconcile activity" });
  await action.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Loading saved run history")).toBeVisible();
  expect(starts).toBe(0);
  releaseStatus();
  await expect(page.getByRole("alert")).toContainText("Saved activity status is unavailable.");
});

test("shows a completed empty result without unchanged recap rows", async ({ page }) => {
  const completed = runFixture("completed");
  completed.sources = sources("empty");
  completed.counts = {
    observed: 0,
    new: 0,
    changed: 0,
    unchanged: 0,
    jiraProposals: 0,
    emailDrafts: 0,
    meetingsProcessed: 0,
    meetingsPending: 0,
    failures: 0,
  };
  completed.jiraProposals = [];
  completed.emailDrafts = [];
  completed.meetings = [];
  completed.recap = {
    generatedAt: "2026-08-06T14:02:30.000Z",
    changedItemCount: 0,
    proposalCount: 0,
    groups: [],
  };
  completed.activity = "Activity reconciliation completed.";

  let current: ReturnType<typeof runFixture> | null = null;
  await page.route("http://127.0.0.1:8817/api/work/activity-reconciliation/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path.endsWith("/start")) {
      current = runFixture("running");
      return fulfill(route, { run: current, attached: false, resumed: false }, 202);
    }
    if (current?.status === "running") current = completed;
    return fulfill(route, current);
  });
  await openWork(page);
  await page.getByRole("button", { name: "Reconcile activity" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("No new activity required changes")).toBeVisible();
  await expect(page.getByText("No Jira change is proposed for this run.")).toBeVisible();
  await expect(page.getByText(/unchanged/i)).toHaveCount(0);
});

test("select-all covers every proposal and the chained MDM check opens its review", async ({
  page,
}) => {
  const base = runFixture("completed");
  const completed = {
    ...base,
    jiraProposals: [
      ...base.jiraProposals,
      {
        ...base.jiraProposals[0],
        id: "jira-proposal-two",
        issueKey: "MT-50",
        title: "MT-50: Fabric policy review",
        changes: [{ kind: "comment", body: "Policy review confirmed in the delivery meeting." }],
      },
      {
        ...base.jiraProposals[0],
        id: "jira-proposal-stale",
        issueKey: "MT-77",
        title: "MT-77: Forgotten intake cleanup",
        actionLabel: "close stale item",
        reason:
          "No Jira activity for 129 days and no mention in any reviewed source. Proposing closure.",
        confidence: "stale",
        sourceId: "stale_sweep",
        evidenceIds: [],
        changes: [
          { kind: "comment", body: "Closing this out: no activity since 2026-04-02." },
          { kind: "transition", toStatus: "Done" },
        ],
      },
    ],
    emailDrafts: base.emailDrafts.map((draft) => ({
      ...draft,
      outlook: { status: "created", draftId: "outlook-draft-fixture", detail: null },
    })),
    mdmCheck: {
      status: "completed",
      generatedAt: "2026-08-06T14:02:31.000Z",
      previewId: "mdm-preview-fixture",
      proposalCount: 2,
    },
  };

  let current: ReturnType<typeof runFixture> | null = null;
  await page.route("http://127.0.0.1:8817/api/work/activity-reconciliation/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path.endsWith("/start")) {
      current = runFixture("running");
      return fulfill(route, { run: current, attached: false, resumed: false }, 202);
    }
    if (current?.status === "running") current = completed;
    return fulfill(route, current);
  });
  await page.route("http://127.0.0.1:8817/api/jira/reconcile/preview", (route) =>
    fulfill(route, { error: "Preview unavailable in this test." }, 500)
  );

  await openWork(page);
  await page.getByRole("button", { name: "Reconcile activity" }).click();
  await expect(page.getByTestId("activity-reconciliation-panel")).toHaveAttribute(
    "data-status",
    "completed"
  );

  await expect(page.getByText("close stale item · Stale match")).toBeVisible();

  await page.getByTestId("activity-select-all").click();
  await expect(page.getByTestId("activity-jira-approval")).toContainText("APPLY 3 JIRA PROPOSALS");
  await page.getByTestId("activity-select-all").click();
  await expect(page.getByTestId("activity-jira-approval")).toHaveCount(0);

  await expect(page.getByText("In your Outlook Drafts")).toBeVisible();

  const mdmSection = page.getByTestId("activity-mdm-check");
  await expect(mdmSection).toBeVisible();
  await expect(mdmSection).toContainText("2 corrections");
  await page.getByTestId("activity-open-mdm-review").click();
  await expect(page.getByRole("heading", { name: "Refresh and reconcile MDM" })).toBeVisible();
});
