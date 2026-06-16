import { expect, test } from "@playwright/test";

test.describe("IP Corp Brain Frontend - Smoke", () => {
  test("loads the readiness view and shows core content", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.getByText(/Context OS/i)).toBeVisible();
    await expect(page.getByText(/Start with the right work/i)).toBeVisible();

    // Metric ribbon
    await expect(page.locator(".metric-card").first()).toBeVisible();
  });

  test("can open the detail drawer from next best packet", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("open-next-packet").click();

    await expect(page.locator(".detail-drawer")).toBeVisible({ timeout: 8000 });

    await page.getByTestId("drawer-close").click();
    await expect(page.locator(".detail-drawer")).not.toBeVisible();
  });

  test("global search surfaces results", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.getByPlaceholder(/Search everything/i);
    await searchInput.fill("risk");

    await expect(page.locator(".search-results-panel")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".search-result").first()).toBeVisible();
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("nav-risks").click();
    await expect(page.getByText(/Exposure register/i)).toBeVisible();

    await page.getByTestId("nav-insights").click();
    await expect(page.getByText(/Cortex reasoning/i)).toBeVisible();
  });

  test("central 3D graph view loads with live search and layers", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-insights").click();

    // The main graph container should be visible
    await expect(page.locator(".brain-explorer")).toBeVisible({ timeout: 8000 });

    // Live search input in the graph should be present (new premium feature)
    await expect(page.getByPlaceholder(/Search nodes/i)).toBeVisible();
  });

  test("can focus a meeting into the 3D graph from Meetings view", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-meetings").click();

    // Click the first "Focus in Graph" button (new strong integration)
    const firstFocusBtn = page.locator('button:has-text("Focus in Graph")').first();
    if ((await firstFocusBtn.count()) > 0) {
      await firstFocusBtn.click();
      // Should land on the insights/graph view
      await expect(page.locator(".brain-explorer")).toBeVisible({ timeout: 6000 });
    }
  });

  test("can open different detail types from their views", async ({ page }) => {
    await page.goto("/");

    // Go to Risks and open one
    await page.getByRole("button", { name: /Risks/i }).click();
    await page.locator(".risk-card").first().click();
    await expect(page.locator(".detail-drawer")).toBeVisible();
    await page.getByTestId("drawer-close").click();

    // Go to Actions and open one
    await page.getByRole("button", { name: /Actions/i }).click();
    await page.locator(".action-card").first().click();
    await expect(page.locator(".detail-drawer")).toBeVisible();
  });

  test("global search surfaces results when typing", async ({ page }) => {
    await page.goto("/");

    const search = page.getByTestId("global-search");
    await search.fill("risk");

    // Results panel should appear with at least one result
    const firstResult = page.locator(".search-results-panel .search-result").first();
    await expect(firstResult).toBeVisible({ timeout: 4000 });
  });
});
