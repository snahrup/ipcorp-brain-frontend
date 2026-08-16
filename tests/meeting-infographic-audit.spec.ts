import { expect, test } from "@playwright/test";

test.describe("Meetings infographic audit", () => {
  test("shows only missing meetings across the four audit categories", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-meetings").click();

    const audit = page.getByTestId("meeting-infographic-audit");
    await expect(audit).toBeVisible();
    await expect(audit).toContainText("14 meetings need infographic attention");
    await audit.locator(":scope > summary").click();

    await expect(page.getByTestId("meeting-infographic-audit-findings")).toBeVisible();
    await expect(audit).toContainText("Only meetings with missing coverage are listed below.");
    const categoryCounts = audit.locator(".wb-infographic-audit-counts");
    await expect(categoryCounts.locator('[data-category="missing-display-only"]')).toContainText(
      "Missing display only"
    );
    await expect(
      categoryCounts.locator('[data-category="missing-saved-artifact-only"]')
    ).toContainText("Missing saved artifact only");
    await expect(
      categoryCounts.locator('[data-category="missing-association-only"]')
    ).toContainText("Missing association only");
    await expect(categoryCounts.locator('[data-category="fully-missing"]')).toContainText(
      "Fully missing"
    );
    await expect(audit.getByRole("button", { name: /^Open meeting:/ })).toHaveCount(14);
    await audit
      .locator('.wb-infographic-audit-group[data-category="fully-missing"] > summary')
      .click();

    await audit
      .getByRole("button", {
        name: "Open meeting: Historian Data Extraction (Continuation)",
        exact: true,
      })
      .click();
    await expect(page.getByText("See how this meeting connects", { exact: true })).toBeVisible();
  });

  test("loads a linked visual summary through the real Workbench image path", async ({ page }) => {
    test.skip(
      process.env.LIVE_MEETING_INFOGRAPHICS !== "1",
      "Set LIVE_MEETING_INFOGRAPHICS=1 when the local Workbench gateway is running."
    );

    let imageStatus = 0;
    page.on("response", (response) => {
      if (response.url().includes("/api/meetings/infographic")) imageStatus = response.status();
    });

    await page.goto("/");
    await page.getByTestId("nav-meetings").click();
    await page.getByPlaceholder("Search meetings, people, or topics").fill("Purview Subscription");
    await page
      .getByRole("button", {
        name: /Purview Subscription Decision and Owner\/Steward Confirmation/,
      })
      .first()
      .click();

    const image = page.getByRole("img", {
      name: "Visual summary of Purview Subscription Decision and Owner/Steward Confirmation",
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)
      )
      .toBe(true);
    expect(imageStatus).toBe(200);
  });
});
