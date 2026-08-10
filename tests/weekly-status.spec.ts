import { expect, test } from "@playwright/test";

const fields = {
  overallStatus: "At Risk",
  budget: "On Budget",
  schedule: "On Schedule",
  scope: "No Issues",
  bottomLine: "Two answers are still sitting with leadership.",
  highlights: ["Settled the resource group naming (MT-410).", "Purview upgrade down to one item."],
  needsFromBusiness: ["The named stewards, confirmed by Patrick."],
  risks: [
    {
      title: "Purview upgrade holds the scans",
      severity: "High",
      detail: "The scans cannot run on the free account.",
    },
  ],
};

const draft = {
  reportDate: "2026-08-06",
  period: { start: "2026-07-31", end: "2026-08-06" },
  counts: { completed: 1, inProgress: 17, blocked: 1, touched: 19 },
  evidence: {
    completed: ["MT-410: Resource group naming [Done]"],
    inProgress: ["MT-408: Purview upgrade [In Progress]"],
    blocked: ["MT-464: Catalog role groups [Blocked]"],
  },
  historyWeeks: 0,
  fields,
  subject: "MDM / Data Governance Weekly Status, 8/6/2026",
  html: "<div><b>Project Status Report</b><p>Two answers are still sitting with leadership.</p></div>",
};

async function stubGateway(page: import("@playwright/test").Page) {
  await page.route("**/api/weekly-status/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: draft }),
    });
  });
  await page.route("**/api/weekly-status/render", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          reportDate: body.reportDate,
          subject: draft.subject,
          html: `<div><b>Project Status Report</b><p>${body.fields.bottomLine}</p></div>`,
        },
      }),
    });
  });
}

test("generating puts the week's update on screen with the email beside it", async ({ page }) => {
  await stubGateway(page);
  await page.goto("/");
  await page.getByTestId("nav-weekly-status").click();

  await expect(page.getByRole("heading", { name: "Weekly status update" })).toBeVisible();
  await expect(page.getByText("No update written yet")).toBeVisible();

  await page.getByRole("button", { name: /Generate this week's status update/ }).click();

  await expect(page.getByText("2026-07-31 to 2026-08-06")).toBeVisible();
  await expect(page.getByText(draft.subject)).toBeVisible();
  await expect(page.locator("iframe")).toBeVisible();
});

test("an edit reaches the preview, and a deleted bullet is the one that was deleted", async ({
  page,
}) => {
  await stubGateway(page);
  await page.goto("/");
  await page.getByTestId("nav-weekly-status").click();
  await page.getByRole("button", { name: /Generate this week's status update/ }).click();
  await expect(page.getByText(draft.subject)).toBeVisible();

  await page.getByLabel("Bottom line").fill("Only the steward names are left.");
  await expect(
    page.frameLocator("iframe").getByText("Only the steward names are left.")
  ).toBeVisible();

  const highlight = (index: number) =>
    page.getByRole("textbox", { name: `Highlights item ${index}` });
  await expect(highlight(2)).toHaveValue("Purview upgrade down to one item.");
  await page.getByRole("button", { name: "Remove Highlights item 2" }).click();
  await expect(highlight(1)).toHaveValue("Settled the resource group naming (MT-410).");
  await expect(highlight(2)).toHaveCount(0);
});

test("the draft is refused until a real recipient address is present", async ({ page }) => {
  await stubGateway(page);
  let draftRequested = false;
  await page.route("**/api/weekly-status/outlook-draft", async (route) => {
    draftRequested = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { to: ["someone@example.com"], detail: "created" } }),
    });
  });

  await page.goto("/");
  await page.getByTestId("nav-weekly-status").click();
  await page.getByRole("button", { name: /Generate this week's status update/ }).click();
  await expect(page.getByText(draft.subject)).toBeVisible();

  await page.getByRole("button", { name: /Create the Outlook draft/ }).click();
  await expect(page.getByRole("alert")).toContainText("Add at least one recipient email address");
  expect(draftRequested).toBe(false);
});
