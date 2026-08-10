import { expect, test } from "@playwright/test";

const dailyPrep = {
  date: "2026-08-04",
  state: "ready",
  reason: "",
  sourceLabel: "Prepared / Next Day / 2026-08-04",
  updatedAt: "2026-08-04T12:45:00.000Z",
  summary: { checked: 4, built: 3, skipped: 1, blocked: 0 },
  skipped: [
    {
      title: "Reminder: Weekly Status Update",
      reason: "Five-minute reminder entry. Not a meeting.",
    },
  ],
  packages: [
    {
      id: "Biweekly-Demand-Management",
      title: "Bi-Weekly Demand Management Meeting",
      when: "Tuesday 2026-08-04, 10:00 to 11:00 AM ET",
      organizer: "Dominique Mathers",
      invited: "Steve Nahrup and the demand team",
      preparedAt: "2026-08-03",
      evidenceState: "Current Microsoft evidence was unavailable. CONFIRM-LIVE before use.",
      status: "ready",
      missing: [],
      updatedAt: "2026-08-04T12:45:00.000Z",
      sections: [
        {
          heading: "30-second orientation",
          content: "Confirm the demand plan and open decisions.",
        },
      ],
      artifacts: [
        {
          name: "Prep_Pack.pdf",
          role: "Print-ready prep pack",
          type: "PDF",
          size: 42000,
          updatedAt: "2026-08-04T12:45:00.000Z",
        },
        {
          name: "Prep_Pack.html",
          role: "Browser version",
          type: "HTML",
          size: 19000,
          updatedAt: "2026-08-04T12:45:00.000Z",
        },
      ],
    },
  ],
};

test("daily prep opens as a Meetings child page and exposes package actions", async ({ page }) => {
  await page.route("**/api/meeting-prep/daily?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: dailyPrep }),
    });
  });

  await page.goto("/meetings/daily-prep?date=2026-08-04");

  await expect(page).toHaveURL(/\/meetings\/daily-prep/);
  await expect(page.getByTestId("daily-meeting-prep-page")).toBeVisible();
  await expect(page.getByTestId("nav-meetings")).toHaveClass(/is-active/);
  await expect(page.getByTestId("nav-daily-prep")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("daily-prep-card-Biweekly-Demand-Management")).toBeVisible();
  await expect(page.getByTestId("daily-prep-card-Biweekly-Demand-Management")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByTestId("daily-prep-package-detail")).toContainText(
    "Bi-Weekly Demand Management Meeting"
  );
  await expect(page.getByText("CONFIRM-LIVE before use.")).toBeVisible();

  const printLink = page.getByTestId("daily-prep-print");
  await expect(printLink).toHaveAttribute("href", /\/api\/meeting-prep\/file\?/);
  await expect(printLink).toHaveAttribute("href", /print=true/);
  await expect(page.getByRole("link", { name: "Open prep pack" })).toHaveAttribute(
    "target",
    "_blank"
  );

  await page.getByTestId("nav-today").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/meetings\/daily-prep/);
  await expect(page.getByTestId("daily-meeting-prep-page")).toBeVisible();
});

test("daily prep states when the dated source is unavailable", async ({ page }) => {
  await page.route("**/api/meeting-prep/daily?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          date: "2026-08-05",
          state: "unavailable",
          reason: "No dated prep output is available.",
          sourceLabel: "Prepared / Next Day / 2026-08-05",
          summary: { checked: 0, built: 0, skipped: 0, blocked: 0 },
          packages: [],
          skipped: [],
        },
      }),
    });
  });

  await page.goto("/meetings/daily-prep?date=2026-08-05");
  await expect(
    page.getByRole("heading", { name: "No prepared source is available for this date" })
  ).toBeVisible();
  await expect(page.getByText("No dated prep output is available.")).toBeVisible();
});
