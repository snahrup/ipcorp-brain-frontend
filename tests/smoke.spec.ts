import { expect, type Page, test } from "@playwright/test";

const statusBacklog = { id: "1", name: "Backlog", category: "new" };
const statusInProgress = { id: "2", name: "In Progress", category: "indeterminate" };
const steve = { accountId: "steve", displayName: "Steve Nahrup" };

const jiraIssue = {
  key: "MT-42",
  summary: "Define governed customer domain",
  description:
    "Document the customer-domain scope, ownership, source precedence, and rollout decision.",
  status: statusInProgress,
  priority: { id: "2", name: "High" },
  assignee: steve,
  issueType: "Task",
  parentKey: "MT-10",
  labels: ["mdm", "customer-domain"],
  dueDate: "2026-08-07",
  startDate: "2026-07-27",
  updatedAt: "2026-07-29T12:00:00.000Z",
  createdAt: "2026-07-27T12:00:00.000Z",
  timeTracking: {
    originalEstimate: "8h",
    remainingEstimate: "3h",
    timeSpent: "5h",
    originalEstimateSeconds: 28_800,
    remainingEstimateSeconds: 10_800,
    timeSpentSeconds: 18_000,
  },
  attachments: [],
  subtasks: [{ key: "MT-43", summary: "Confirm source precedence", status: "In Progress" }],
  links: [
    {
      id: "link-1",
      type: "blocks",
      direction: "outward" as const,
      key: "MT-44",
      summary: "Publish customer-domain ownership",
    },
  ],
  comments: [
    {
      id: "comment-1",
      author: "Steve Nahrup",
      body: "I tightened the scope so the rollout decision is obvious to the next person.",
      createdAt: "2026-07-29T11:00:00.000Z",
      updatedAt: "2026-07-29T11:00:00.000Z",
    },
  ],
  worklogs: [],
  lastActivityAt: "2026-07-29T12:00:00.000Z",
  lastActivitySummary: "Updated, no comment or worklog logged",
};

const jiraInitiative = {
  projectKey: "MT" as const,
  name: "MDM Team",
  issues: [jiraIssue],
  statuses: [statusBacklog, statusInProgress],
  assignees: [steve],
  priorities: [
    { id: "2", name: "High" },
    { id: "3", name: "Medium" },
  ],
  fetchedAt: "2026-07-29T12:00:00.000Z",
};

const todayBoard = {
  generatedAt: "2026-08-13T23:45:00.000Z",
  date: "2026-08-13",
  sources: [
    { id: "calendar", label: "Calendar", ok: true, detail: "" },
    { id: "packages", label: "Meeting packages", ok: true, detail: "" },
    { id: "activity", label: "Activity state", ok: true, detail: "" },
    { id: "agent-runs", label: "Ticket runs", ok: true, detail: "" },
  ],
  lanes: [
    { id: "watching", label: "Watching", helper: "", cards: [] },
    { id: "working", label: "Working now", helper: "", cards: [] },
    {
      id: "waiting",
      label: "Waiting on Steve",
      helper: "",
      cards: [
        {
          id: "meeting-missing",
          kind: "meeting-capture",
          title: "Programs meeting needs a pasted capture",
          detail: "Ended with no capture stored.",
          why: "No capture is available yet.",
          evidence: ["Calendar id: meeting-missing"],
          reference: { type: "meeting", id: "meeting-missing", label: "Meeting", href: null },
          at: "2026-08-13T20:00:00.000Z",
          age: "2h ago",
          tone: "red",
          meta: [],
        },
      ],
    },
    {
      id: "delivered",
      label: "Delivered today",
      helper: "",
      cards: [
        {
          id: "package-1",
          kind: "meeting-package",
          title: "MDM Projects",
          detail: "Package stored, infographic rendered.",
          why: "Files were written today.",
          evidence: ["Package: 2026-08-13-mdm-projects"],
          reference: {
            type: "deliverable",
            id: "2026-08-13-mdm-projects",
            label: "Open package",
            href: "/api/meetings/infographic?id=2026-08-13-mdm-projects&file=summary.png",
          },
          at: "2026-08-13T21:30:00.000Z",
          age: "30m ago",
          tone: "ok",
          meta: ["1 commitment"],
        },
      ],
    },
  ],
};

const todayLoop = {
  mode: "shadow",
  policyVersion: 1,
  shadowRuns: 65,
  lastPass: "2026-08-13T23:50:00.000Z",
  todayVerdicts: [
    {
      workItemId: "proposal-1",
      title: "Create a follow-up",
      classId: "jira-create",
      autonomyTier: "show",
      modelTier: "top",
    },
  ],
};

const staleActivityRun = {
  id: "activity-20260810135135-007f2104",
  status: "partial_success",
  baseline: false,
  steps: { sources: null, meetings: true, staleSweep: true, outlookDrafts: false, mdmCheck: true },
  startedAt: "2026-08-10T13:51:35.000Z",
  finishedAt: "2026-08-10T13:59:00.000Z",
  lastActivityAt: "2026-08-10T13:59:00.000Z",
  resumedAt: null,
  resumeCount: 0,
  cancelRequested: false,
  resumable: false,
  phase: {
    id: "complete",
    label: "Complete",
    index: 10,
    total: 10,
    startedAt: "2026-08-10T13:59:00.000Z",
  },
  activity: "Finished with review items.",
  windows: {},
  sources: {},
  counts: {
    observed: 1372,
    new: 4,
    changed: 20,
    unchanged: 1348,
    jiraProposals: 9,
    emailDrafts: 2,
    meetingsProcessed: 1,
    meetingsPending: 1,
    failures: 4,
  },
  jiraProposals: [],
  emailDrafts: [],
  meetings: [],
  actualChanges: [],
  recap: null,
  mdmCheck: null,
  events: [],
};

const librarySections = [
  ["00 - Adoption and Rollout Toolkit", "00", "Adoption and rollout toolkit"],
  ["01 - Engagement Overview", "01", "Engagement overview"],
  ["02 - Architecture Reference", "02", "Architecture reference"],
  ["03 - Engagement Updates", "03", "Engagement updates"],
  ["04 - Power BI Strategy and Analysis", "04", "Power BI strategy and analysis"],
  ["05 - Diagram Sources", "05", "Diagram sources"],
] as const;

const libraryFile = {
  name: "01 - Program brief.md",
  path: "01 - Engagement Overview/01 - Program brief.md",
  sectionId: "01 - Engagement Overview",
  extension: "md",
  group: "Reference",
  bytes: 2048,
  modifiedAt: "2026-07-28T14:30:00.000Z",
  previewable: true,
};

const libraryControlFile = {
  name: "Publication Manifest.csv",
  path: "Publication Manifest.csv",
  sectionId: "library-controls",
  extension: "csv",
  group: "Data",
  bytes: 1024,
  modifiedAt: "2026-07-28T14:30:00.000Z",
  previewable: true,
};

async function mockJira(page: Page, seenInitiativeUrls?: string[]) {
  await page.route("http://127.0.0.1:8817/api/jira/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    if (url.pathname.endsWith("/initiative")) {
      seenInitiativeUrls?.push(route.request().url());
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ ok: true, data: jiraInitiative }),
      });
      return;
    }
    if (url.pathname.endsWith("/issues/MT-42") && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          data: {
            issue: jiraIssue,
            transitions: [{ id: "31", name: "Done", to: "Done" }],
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      headers,
      body: JSON.stringify({
        ok: false,
        code: "test_guard",
        error: "This smoke test does not permit Jira mutations.",
      }),
    });
  });
}

async function mockTeamLibrary(page: Page) {
  await page.route("http://127.0.0.1:8817/api/team-library/manifest", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ok: true,
        data: {
          source: "local-sync",
          state: "local-sync",
          limitation: "SharePoint cloud freshness has not been verified.",
          refreshedAt: "2026-07-29T12:00:00.000Z",
          newestLocalModifiedAt: "2026-07-28T14:30:00.000Z",
          publication: {
            publishedAt: "2026-07-23 01:02 ET",
            sourceRevision: "04226c4",
          },
          sections: librarySections.map(([id, index, title]) => ({
            id,
            index,
            title,
            summary: `${title} source folder.`,
            fileCount: id === libraryFile.sectionId ? 1 : 0,
            available: true,
          })),
          guides: [],
          files: [libraryFile, libraryControlFile],
          missingSections: [],
          totalFiles: 2,
          contentBytes: libraryFile.bytes + libraryControlFile.bytes,
        },
      }),
    });
  });
}

async function mockTodayStatus(
  page: Page,
  seenSnapshotUrls?: string[],
  options?: {
    board?: typeof todayBoard;
    boardFailure?: string;
    loop?: typeof todayLoop;
    activity?: typeof staleActivityRun | null;
  }
) {
  await page.route("http://127.0.0.1:8817/api/today/snapshot", async (route) => {
    seenSnapshotUrls?.push(route.request().url());
    const boardError = options?.boardFailure || null;
    const capturedAt = "2026-08-14T07:15:00.000Z";
    const snapshot = {
      version: 1,
      snapshotId: "today-20260814T071500000Z-fixture",
      capturedAt,
      partial: Boolean(boardError),
      notes: boardError ? [{ source: "agentBoard", status: "error", message: boardError }] : [],
      sources: {
        jira: {
          id: "jira",
          label: "Jira work",
          status: "ok",
          observedAt: jiraInitiative.fetchedAt,
          error: null,
          detail: "",
        },
        agentBoard: {
          id: "agentBoard",
          label: "Agent Board",
          status: boardError ? "error" : "ok",
          observedAt: capturedAt,
          error: boardError,
          detail: "",
        },
        reconciliation: {
          id: "reconciliation",
          label: "Activity reconciliation",
          status: "ok",
          observedAt: capturedAt,
          error: null,
          detail: "",
        },
        loop: {
          id: "loop",
          label: "Loop state",
          status: "ok",
          observedAt: capturedAt,
          error: null,
          detail: "",
        },
      },
      jira: jiraInitiative,
      agentBoard: boardError ? null : (options?.board ?? todayBoard),
      reconciliation: options && "activity" in options ? options.activity : staleActivityRun,
      loop: options?.loop ?? todayLoop,
    };
    await route.fulfill({
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ok: true, data: snapshot }),
    });
  });
  await page.route("http://127.0.0.1:8817/api/agent-board", async (route) => {
    await route.fulfill({
      status: options?.boardFailure ? 503 : 200,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        options?.boardFailure
          ? { ok: false, error: options.boardFailure }
          : { ok: true, data: options?.board ?? todayBoard }
      ),
    });
  });
}

test.describe("IP Corp Workbench - team-safe smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockTodayStatus(page);
  });

  test("starts on the focused Today workspace", async ({ page }) => {
    // Today reads one server-produced snapshot rather than assembling sources in the browser.
    await mockJira(page);
    await page.goto("/");

    await expect(page.getByTestId("today-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with what is current." })).toBeVisible();
    await expect(page.getByRole("img", { name: "IP Corporation" })).toBeVisible();
    await expect(page.locator(".wb-header-status .wb-status")).toHaveText("Current");
    await expect(page.locator(".wb-header-status")).toContainText(
      "Jira, Agent Board and local status"
    );
    await expect(
      page.locator(".wb-hero").getByText("Delivered today", { exact: true })
    ).toBeVisible();
    await expect(
      page.locator(".wb-hero").getByText("Waiting on Steve", { exact: true })
    ).toBeVisible();
    await expect(page.locator(".wb-hero").getByText("Open issues", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-today")).toHaveAttribute("aria-current", "page");
  });

  test("shows current work status without starting a Microsoft refresh", async ({ page }) => {
    const snapshotUrls: string[] = [];
    const browserRequests: string[] = [];
    page.on("request", (request) => browserRequests.push(request.url()));
    await page.unroute("http://127.0.0.1:8817/api/today/snapshot");
    await mockTodayStatus(page, snapshotUrls);
    await mockJira(page);
    await page.goto("/");

    const current = page.getByTestId("today-current-work");
    await expect(current).toContainText("MDM Projects");
    await expect(current).toContainText("Programs meeting needs a pasted capture");
    await expect(current).toContainText("No MT issue activity found for today.");
    await expect(current).toContainText("Old run: partial success");
    await expect(current).toContainText("Shadow mode: observed 1 item today and executed nothing.");
    expect(snapshotUrls).toHaveLength(1);
    expect(browserRequests.some((url) => /\/api\/(m365|meetings\/today)/.test(url))).toBe(false);
  });

  test("opens Agent Board when Today has more delivered work than it can preview", async ({
    page,
  }) => {
    const expandedBoard = structuredClone(todayBoard);
    const delivered = expandedBoard.lanes.find((entry) => entry.id === "delivered");
    if (!delivered) throw new Error("Delivered lane is missing from the test board.");
    delivered.cards.push(
      { ...delivered.cards[0], id: "package-2", title: "Programs, Projects and Tasks" },
      { ...delivered.cards[0], id: "package-3", title: "Plant Tour" }
    );
    await page.unroute("http://127.0.0.1:8817/api/today/snapshot");
    await mockTodayStatus(page, undefined, { board: expandedBoard });
    await mockJira(page);
    await page.goto("/");

    await page.getByRole("button", { name: "See all 3 in Agent Board" }).click();
    await expect(page.getByTestId("agent-board-view")).toBeVisible();
    await expect(page.getByTestId("nav-agent-board")).toHaveAttribute("aria-current", "page");
  });

  test("Refresh Today rereads one coherent snapshot", async ({ page }) => {
    const seen: string[] = [];
    await page.unroute("http://127.0.0.1:8817/api/today/snapshot");
    await mockTodayStatus(page, seen);
    await mockJira(page);
    await page.goto("/");
    await expect(page.getByTestId("today-current-work")).toContainText("MDM Projects");

    seen.length = 0;
    await page.locator(".wb-hero").getByRole("button", { name: "Refresh Today" }).click();

    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatch(/\/api\/today\/snapshot$/);
  });

  test("a failed Board read clears Board counts and reports the problem", async ({ page }) => {
    await page.unroute("http://127.0.0.1:8817/api/today/snapshot");
    await mockTodayStatus(page, [], { boardFailure: "The Board cache is unreadable." });
    await mockJira(page);
    await page.goto("/");

    const current = page.getByTestId("today-current-work");
    await expect(current.getByRole("alert")).toContainText(
      "Agent Board: The Board cache is unreadable."
    );
    await expect(current).not.toContainText("MDM Projects");
    await expect(current).not.toContainText("Programs meeting needs a pasted capture");
    await expect(
      current
        .locator(".wb-today-status-card")
        .filter({ hasText: "Delivered today" })
        .locator("strong")
    ).toHaveText("0");
    await expect(
      current
        .locator(".wb-today-status-card")
        .filter({ hasText: "Waiting on Steve" })
        .locator("strong")
    ).toHaveText("0");
  });

  test("states plainly when the loop is off", async ({ page }) => {
    await page.unroute("http://127.0.0.1:8817/api/today/snapshot");
    await mockTodayStatus(page, [], {
      loop: { ...todayLoop, mode: "off", todayVerdicts: [] },
    });
    await mockJira(page);
    await page.goto("/");

    const loopCard = page
      .getByTestId("today-current-work")
      .locator(".wb-today-status-card")
      .filter({ hasText: "Loop" });
    await expect(loopCard.locator("strong")).toHaveText("off");
    await expect(loopCard).toContainText("Loop is off.");
  });

  test("keeps Today usable at phone width without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockJira(page);
    await page.goto("/");

    await expect(page.getByTestId("today-current-work")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const widest = Math.max(root.scrollWidth, document.body.scrollWidth);
      return widest - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("reviews MT work as a live-shaped list and board without contacting Jira", async ({
    page,
  }) => {
    await mockJira(page);
    await page.goto("/");
    await page.getByTestId("nav-work").click();

    await expect(page.getByTestId("work-view")).toBeVisible();
    await expect(page.getByText("Live Jira · MT initiative")).toBeVisible();
    await expect(page.getByRole("region", { name: "Live MDM Jira issue list" })).toBeVisible();

    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByRole("region", { name: "Live MDM Jira board" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Backlog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "In Progress" })).toBeVisible();
  });

  test("opens a mapped Jira issue modal and returns focus without saving", async ({ page }) => {
    await mockJira(page);
    await page.goto("/");
    await page.getByTestId("nav-work").click();

    const opener = page
      .getByTestId("work-view")
      .getByRole("button", {
        name: /MT-42 Define governed customer domain/,
      })
      .first();
    await opener.click();

    const dialog = page.getByRole("dialog", { name: "Define governed customer domain" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Summary")).toHaveValue("Define governed customer domain");
    await expect(dialog.getByRole("heading", { name: "Description" })).toBeVisible();
    await expect(dialog.getByText("customer-domain scope")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit description" })).toBeVisible();
    await expect(dialog.getByText("MT-44")).toBeVisible();
    await expect(dialog.getByText("MT-43")).toBeVisible();
    await expect(dialog.getByText(/I tightened the scope/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save to Jira" })).toBeDisabled();

    await expect(dialog.getByRole("link", { name: /Open in Jira/ })).toHaveAttribute(
      "href",
      /MT-42/
    );

    await dialog.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("link", { name: /Open in Jira/ })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });

  test("keeps Meetings explicit and makes no Microsoft 365 request on open", async ({ page }) => {
    let microsoft365Requests = 0;
    await page.route("http://127.0.0.1:8817/api/m365/**", async (route) => {
      microsoft365Requests += 1;
      await route.abort("blockedbyclient");
    });
    await page.goto("/");
    await page.getByTestId("nav-meetings").click();

    await expect(page.getByTestId("meetings-workspace")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Walk in knowing what changed." })
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Meeting calendar" })).toBeVisible();
    await expect(page.getByText("Captured", { exact: true })).toBeVisible();
    // The coverage check now lives behind a disclosure and still must not auto-fire.
    await expect(page.getByText("Where this comes from")).toBeVisible();
    expect(microsoft365Requests).toBe(0);
  });

  test("opens six Team Library collections without exposing storage details", async ({ page }) => {
    await mockTeamLibrary(page);
    await page.goto("/");
    await page.getByTestId("nav-library").click();

    await expect(page.getByTestId("team-library")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Open the context behind the work." })
    ).toBeVisible();
    await expect(page.getByText("How current this is")).toBeVisible();
    await expect(page.getByText("SharePoint cloud freshness has not been verified.")).toHaveCount(
      0
    );
    await expect(page.getByText("Publication Manifest", { exact: true })).toHaveCount(0);
    await expect(page.getByText(libraryFile.path, { exact: true })).toHaveCount(0);
    await expect(page.getByText(libraryFile.name, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Team Library collections" }).getByRole("button")
    ).toHaveCount(6);
    await page.getByRole("button", { name: "Open Engagement overview", exact: true }).click();
    const collectionHeading = page.getByRole("heading", { name: "Engagement overview" });
    await expect(collectionHeading).toBeVisible();
    await expect(collectionHeading).toBeFocused();
    await expect(page.getByText("Program brief", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to all collections" }).click();
    await expect(page.getByRole("heading", { name: "Search every available item" })).toBeVisible();
  });

  test("shows independent connection states without false live claims", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-connections").click();

    await expect(page.getByTestId("connections-view")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Connection checks: none run from this page" })
    ).toBeVisible();

    const m365Passport = page.locator('[data-source="microsoft365"]');
    await expect(m365Passport).toHaveAttribute("data-connection-state", "not-checked");
    await expect(m365Passport).toHaveAttribute("data-connection-scope", "local-only");
    await expect(
      m365Passport.getByRole("status", { name: /connection status: Not checked/ })
    ).toBeVisible();
    await expect(m365Passport.getByText(/No Microsoft 365 request was made/)).toBeVisible();

    const jiraPassport = page.locator('[data-source="jira"]');
    await expect(jiraPassport.getByRole("heading", { name: "Jira" })).toBeVisible();
    await expect(jiraPassport).toHaveAttribute("data-connection-state", "not-checked");
    await expect(jiraPassport).toHaveAttribute("data-connection-scope", "local-only");
    await expect(jiraPassport.getByText(/No Jira request was made/)).toBeVisible();

    await expect(page.getByText(/verified on this computer|Live Jira/i)).toHaveCount(0);
  });

  test("loads specialist Data work only after it is opened", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-data-work").click();

    await expect(page.getByTestId("data-work-view")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Open specialist tools only when the work needs them." })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review SQL" })).toBeVisible();
    await expect(page.getByText("sql_analyze")).toBeVisible();
    await expect(page.getByText("dbt tools")).toBeVisible();
  });

  test("searches the prepared Brain snapshot and opens a result", async ({ page }) => {
    await page.goto("/");

    const search = page.getByTestId("global-search");
    await search.fill("risk");

    const firstResult = page.locator(".search-results-panel .search-result").first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();
    await expect(page.locator(".detail-drawer")).toBeVisible();
    await page.getByTestId("drawer-close").click();
    await expect(page.locator(".detail-drawer")).not.toBeVisible();
  });
});
