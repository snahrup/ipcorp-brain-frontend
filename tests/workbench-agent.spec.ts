import { expect, type Page, test } from "@playwright/test";
import { WORKBENCH_DESTINATIONS } from "../src/features/workbench-agent/destinations";
import type { ViewKey } from "../src/lib/search";

const statusPayload = {
  ok: true,
  data: {
    checkedAt: "2026-08-06T12:00:00.000Z",
    connectors: [
      { id: "workbench", state: "ready", detail: "Local API ready." },
      { id: "jira", state: "ready", detail: "Jira reads ready." },
      {
        id: "microsoft365",
        state: "limited",
        detail: "Live reads run when requested.",
      },
      { id: "team-library", state: "ready", detail: "Library ready." },
      { id: "notebooklm", state: "ready", detail: "NotebookLM ready." },
      {
        id: "devspace",
        state: "limited",
        detail: "Owner check runs before workspace actions.",
      },
      { id: "sql", state: "limited", detail: "Five read-only sources configured." },
      { id: "powerbi", state: "limited", detail: "Model connection checked on request." },
      { id: "fabric", state: "limited", detail: "Workspace access checked on request." },
    ],
  },
};

async function mockSessionAndStatus(page: Page) {
  await page.route("**/api/workbench-agent/session", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { requestToken: "browser-test-token", expiresAt: "2026-08-06T13:00:00.000Z" },
      }),
    })
  );
  await page.route("**/api/workbench-agent/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(statusPayload),
    })
  );
}

function ndjson(...events: object[]) {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

test("opens globally, reports live-source state, and restores focus on Escape", async ({
  page,
}) => {
  await mockSessionAndStatus(page);
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Open Workbench Agent" });
  await expect(launcher).toBeVisible();
  await launcher.click();

  const panel = page.getByRole("region", { name: "Workbench Agent panel" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask the Workbench Agent" })).toBeFocused();
  await expect(panel.locator(".connector-chip.ready")).toHaveCount(4);
  await expect(panel.locator(".connector-chip.limited")).toHaveCount(5);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();

  await page.goto("/meetings");
  await expect(page.getByRole("button", { name: "Open Workbench Agent" })).toBeVisible();
});

test("streams reasoning and moves to a registered page section", async ({ page }) => {
  await mockSessionAndStatus(page);
  await page.route("**/api/workbench-agent/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson(
        { type: "status", status: "thinking" },
        { type: "thinking", text: "I found the matching Workbench location." },
        { type: "navigate", destination: { view: "library", section: "collections" } },
        { type: "delta", text: "Opened Team Library collections." },
        { type: "done" }
      ),
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();
  const input = page.getByRole("textbox", { name: "Ask the Workbench Agent" });
  await input.fill("Take me to the Team Library collections.");
  await input.press("Enter");

  await expect(page.getByTestId("team-library")).toBeVisible();
  await expect(
    page.getByText("Opened Team Library: Choose the work you need to review.", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Opened Team Library collections.", { exact: true })).toBeVisible();
});

test("shows source activity and rich result formatting", async ({ page }) => {
  await mockSessionAndStatus(page);
  await page.route("**/api/workbench-agent/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson(
        {
          type: "activity",
          activity: {
            id: "sql-read-one",
            source: "IPC PowerData",
            label: "Check dashboard count",
            status: "running",
          },
        },
        {
          type: "activity",
          activity: {
            id: "sql-read-one",
            source: "IPC PowerData",
            label: "Check dashboard count",
            status: "completed",
            detail: "Read completed.",
            durationMs: 1250,
          },
        },
        {
          type: "delta",
          text: "| Source | Rows |\n| --- | ---: |\n| IPC PowerData | 42 |\n\n```sql\nSELECT COUNT(*)\n```",
        },
        { type: "done" }
      ),
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();
  const input = page.getByRole("textbox", { name: "Ask the Workbench Agent" });
  await input.fill("Check the dashboard count.");
  await input.press("Enter");

  await expect(page.getByText("Sources and activity", { exact: true })).toBeVisible();
  await expect(page.getByText("IPC PowerData", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("SELECT COUNT(*)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy agent response" })).toBeVisible();
});

test("every registered page section resolves inside the active view", async ({ page }) => {
  test.setTimeout(240_000);
  await mockSessionAndStatus(page);
  await page.route("**/api/workbench-agent/chat", (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    const [, view, section] = String(body.message ?? "").split("|");
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson({ type: "navigate", destination: { view, section } }, { type: "done" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();
  const input = page.getByRole("textbox", { name: "Ask the Workbench Agent" });

  for (const [rawView, destination] of Object.entries(WORKBENCH_DESTINATIONS)) {
    const view = rawView as ViewKey;
    for (const section of destination.sections) {
      await input.fill(`move|${view}|${section.key}`);
      await input.press("Enter");
      const openedLabel = `${destination.label}: ${section.label}`.replace(/[.!?]+$/, "");
      await expect(page.getByText(`Opened ${openedLabel}.`, { exact: true })).toBeVisible({
        timeout: 5_000,
      });
      await expect
        .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".view-frame"))))
        .toBe(true);
    }
  }
});

test("shows one reviewed action and removes it after its single confirmation", async ({ page }) => {
  await mockSessionAndStatus(page);
  await page.route("**/api/workbench-agent/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson(
        {
          type: "review",
          review: {
            id: "review-one",
            title: "Update MT-101",
            summary: "Change the issue summary after review.",
            risk: "medium",
            target: { issueKey: "MT-101" },
          },
        },
        { type: "delta", text: "I prepared the issue update for review." },
        { type: "done" }
      ),
    })
  );
  let confirmations = 0;
  await page.route("**/api/workbench-agent/confirm", (route) => {
    confirmations += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          receipt: {
            id: "receipt-one",
            title: "Jira update recorded",
            detail: "MT-101 was updated.",
            source: "Jira",
          },
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();
  const input = page.getByRole("textbox", { name: "Ask the Workbench Agent" });
  await input.fill("Prepare the reviewed issue update.");
  await input.press("Enter");

  const pendingTray = page.locator("[aria-label='Pending review cards']");
  const confirm = pendingTray.getByRole("button", { name: "Confirm" });
  await expect(confirm).toHaveCount(1);
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("MT-101 was updated.", { exact: true })).toBeVisible();
  expect(confirmations).toBe(1);
});

test("Stop aborts an in-flight turn", async ({ page }) => {
  await mockSessionAndStatus(page);
  await page.route("**/api/workbench-agent/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (route.request().isNavigationRequest()) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson({ type: "delta", text: "This should not be shown." }, { type: "done" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();
  const input = page.getByRole("textbox", { name: "Ask the Workbench Agent" });
  await input.fill("Start a long lookup.");
  await input.press("Enter");
  const stop = page.getByRole("button", { name: "Stop" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.locator(".workbench-agent-status")).toContainText("Stopped");
  await expect(page.getByText("This should not be shown.", { exact: true })).toHaveCount(0);
});

test("phone panel stays inside the viewport and above the tab bar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSessionAndStatus(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();

  const panel = page.getByRole("region", { name: "Workbench Agent panel" });
  const tabBar = page.getByRole("navigation", { name: "Main" });
  await expect(panel).toBeVisible();
  await expect(tabBar).toBeVisible();
  const panelBox = await panel.boundingBox();
  const tabBox = await tabBar.boundingBox();
  if (!panelBox || !tabBox) throw new Error("Agent panel or phone tab bar has no layout box.");
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(390);
  expect(panelBox.y).toBeGreaterThanOrEqual(0);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(tabBox.y + 1);

  await page.screenshot({ path: testInfo.outputPath("workbench-agent-phone.png") });
});
