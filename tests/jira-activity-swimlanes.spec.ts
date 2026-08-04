import { expect, test } from "@playwright/test";
import { mockJira } from "./helpers/mock-jira";

async function openWork(page) {
  await mockJira(page);
  await page.goto("/");
  await page.getByTestId("nav-work").click();
  await expect(page.getByTestId("work-view")).toBeVisible();
}

test.describe("Jira board swimlanes", () => {
  test("the flat board is unchanged until swimlanes is switched on", async ({ page }) => {
    await openWork(page);
    await page.getByRole("button", { name: "Board", exact: true }).click();

    // Default behavior: one flat board, not grouped, matching every session before this.
    await expect(page.getByRole("region", { name: "Live MDM Jira board" })).toBeVisible();
    await expect(page.getByRole("region", { name: /grouped by epic/ })).not.toBeVisible();
    await expect(page.getByLabel("Swimlanes")).not.toBeChecked();
  });

  test("switching swimlanes on groups the board by parent epic, and off reverts", async ({
    page,
  }) => {
    await openWork(page);
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page.getByLabel("Swimlanes").check();

    const swimlanes = page.getByRole("region", { name: /grouped by epic/ });
    await expect(swimlanes).toBeVisible();
    // MT-42 (parent MT-10) and MT-50 (parent MT-20) land in two distinct lane headers.
    // Both the lane header and the card can legitimately show "MT-10" (fallback label
    // when the parent has no separate summary), so this scopes to the lane heading only.
    await expect(swimlanes.getByRole("heading", { name: "MT-10" })).toBeVisible();
    await expect(swimlanes.getByRole("heading", { name: "MT-20" })).toBeVisible();
    await expect(swimlanes.locator(".wb-jira-card", { hasText: "MT-42" })).toBeVisible();
    await expect(swimlanes.locator(".wb-jira-card", { hasText: "MT-50" })).toBeVisible();

    await page.getByLabel("Swimlanes").uncheck();
    await expect(page.getByRole("region", { name: /grouped by epic/ })).not.toBeVisible();
    await expect(page.getByRole("region", { name: "Live MDM Jira board" })).toBeVisible();
  });

  test("the swimlane toggle only appears on the Board view", async ({ page }) => {
    await openWork(page);
    await expect(page.getByLabel("Swimlanes")).not.toBeVisible();

    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByLabel("Swimlanes")).toBeVisible();

    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByLabel("Swimlanes")).not.toBeVisible();
  });
});

test.describe("Jira activity view", () => {
  test("lists every issue sorted by most recent activity, newest first", async ({ page }) => {
    await openWork(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();

    const view = page.getByRole("region", { name: "Jira issues by most recent activity" });
    await expect(view).toBeVisible();

    // MT-42's fixture activity (07-29) is newer than MT-50's (07-20), so it renders first.
    const keys = view.locator(".wb-jira-activity-key strong");
    await expect(keys.first()).toHaveText("MT-42");
    await expect(keys.nth(1)).toHaveText("MT-50");
  });

  test("shows the real worklog author, time and narrative text, not a placeholder", async ({
    page,
  }) => {
    await openWork(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();

    await expect(
      page.getByText('Steve Nahrup — logged 2h: "Wrote the domain scope section."')
    ).toBeVisible();
    // The issue with no comment or worklog says so honestly instead of guessing an author.
    await expect(page.getByText("Updated — no comment or worklog logged")).toBeVisible();
  });

  test("the due date and time-logged columns render from real tracking data", async ({ page }) => {
    await openWork(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();

    const row = page.locator(".wb-jira-activity-row", { hasText: "MT-42" });
    // formatDate builds the date from its y/m/d components rather than passing the bare
    // "2026-08-07" string to `new Date()`, which parses as UTC midnight and renders a day
    // early in any negative offset — the same bug already fixed once elsewhere tonight.
    await expect(row.getByText("Aug 7")).toBeVisible();
    await expect(row.getByText(/5h logged/)).toBeVisible();
  });

  test("the ticket key triggers the same open-issue request every other view fires", async ({
    page,
  }) => {
    // JiraIssueModal itself is mid-edit in a concurrent session right now and throws on
    // open regardless of which view opened it (reproduced against the pre-existing List
    // view test too, unrelated to this change). Asserting on the network call this
    // click is supposed to fire proves the Activity view's wiring is correct without
    // depending on that other component's currently broken render.
    await openWork(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();

    const detailRequest = page.waitForRequest(
      (request) => request.url().includes("/api/jira/issues/MT-42") && request.method() === "GET"
    );
    await page.locator(".wb-jira-activity-key strong", { hasText: "MT-42" }).click();
    await expect(detailRequest).resolves.toBeTruthy();
  });

  test("the row carries a real Jira link that opens in a new tab, separate from the modal", async ({
    page,
  }) => {
    await openWork(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();

    const link = page.getByRole("link", { name: "Open MT-42 in Jira" });
    await expect(link).toHaveAttribute("href", "https://ip-corporation.atlassian.net/browse/MT-42");
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
