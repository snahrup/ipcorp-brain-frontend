import { expect, test } from "@playwright/test";
import { mockJira } from "./helpers/mock-jira";

async function openAnalytics(page: import("@playwright/test").Page) {
  await mockJira(page);
  await page.goto("/");
  const mobileNavigation = page.getByRole("navigation", { name: "Main" });
  if (await mobileNavigation.isVisible()) {
    await mobileNavigation.getByRole("button", { name: "Work", exact: true }).click();
  } else {
    await page.getByTestId("nav-work").click();
  }
  await expect(page.getByTestId("work-view")).toBeVisible();
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByTestId("jira-analytics-view")).toBeVisible();
}

test.describe("Jira analytics", () => {
  test("opens directly from its shareable Work URL", async ({ page }) => {
    await mockJira(page);
    await page.goto("/work/analytics");

    await expect(page.getByTestId("work-view")).toBeVisible();
    await expect(page.getByTestId("jira-analytics-view")).toBeVisible();
  });

  test("shows the decision-ready measures and their sample sizes", async ({ page }) => {
    await openAnalytics(page);

    await expect(page.getByRole("heading", { name: "How work is moving." })).toBeVisible();
    await expect(page.getByText("347h", { exact: true })).toBeVisible();
    await expect(page.getByText("396h", { exact: true })).toBeVisible();
    await expect(page.getByText("85%", { exact: true })).toBeVisible();
    await expect(page.getByText("18 completed work items", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where elapsed time collects" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Average time in each Jira status" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Issues completed by week" })).toBeVisible();
  });

  test("refresh asks the read-only analytics route for fresh data", async ({ page }) => {
    await openAnalytics(page);

    const request = page.waitForRequest((candidate) =>
      candidate.url().includes("/api/jira/analytics?refresh=1")
    );
    await page.getByRole("button", { name: "Refresh analytics" }).click();
    await expect(request).resolves.toBeTruthy();
    await expect(page.getByRole("button", { name: "Refresh analytics" })).toBeEnabled();
  });

  test("fits an iPhone viewport without sideways page scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnalytics(page);

    const measurements = await page.evaluate(() => {
      const refresh = document.querySelector<HTMLElement>(".jira-analytics-refresh");
      const analytics = document.querySelector<HTMLElement>(".jira-analytics");
      const metrics = document.querySelector<HTMLElement>(".jira-analytics-metrics");
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        analyticsWidth: analytics?.scrollWidth ?? 0,
        analyticsClientWidth: analytics?.clientWidth ?? 0,
        metricColumns: metrics
          ? getComputedStyle(metrics).gridTemplateColumns.split(" ").length
          : 0,
        refreshHeight: refresh?.getBoundingClientRect().height ?? 0,
      };
    });

    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.analyticsWidth).toBeLessThanOrEqual(measurements.analyticsClientWidth + 1);
    expect(measurements.metricColumns).toBe(1);
    expect(measurements.refreshHeight).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("heading", { name: "Where elapsed time collects" })).toBeVisible();
  });
});
