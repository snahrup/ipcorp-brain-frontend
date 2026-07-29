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
  },
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

async function mockJira(page: Page) {
  await page.route("http://127.0.0.1:8817/api/jira/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    if (url.pathname.endsWith("/initiative")) {
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

test.describe("IP Corp Workbench - team-safe smoke", () => {
  test("starts on the focused Today workspace", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("today-view")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Start with what needs attention." })
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "IP Corporation" })).toBeVisible();
    // The hero now carries the orienting counts instead of a wall of freshness copy.
    await expect(page.getByText("Needs you", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Open items", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-today")).toHaveAttribute("aria-current", "page");
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

    const opener = page.getByRole("button", {
      name: /MT-42 Define governed customer domain/,
    });
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
