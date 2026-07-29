import { expect, test } from "@playwright/test";

const capabilities = [
  { id: "explore", label: "Explore data", icon: "/fabric-icons/sql-database.png" },
  { id: "compare", label: "Compare sources", icon: "/fabric-icons/dataflow-gen2.png" },
  { id: "review", label: "Review SQL", icon: "/fabric-icons/notebook.png" },
  { id: "lineage", label: "Trace fields", icon: "/fabric-icons/links.png" },
  { id: "translate", label: "Convert SQL", icon: "/fabric-icons/schema-model.png" },
  { id: "models", label: "Models & tests", icon: "/fabric-icons/data-warehouse.png" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-data-work").click();
  await expect(page.getByTestId("data-work-view")).toBeVisible();
});

test("every capability opens grounded review details without calling a runner", async ({
  page,
}) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "fetch" || request.resourceType() === "xhr") {
      dataRequests.push(request.url());
    }
  });

  await expect(page.locator(".wb-data-card")).toHaveCount(capabilities.length);

  for (const capability of capabilities) {
    const opener = page.getByTestId(`data-work-open-${capability.id}`);
    await expect(opener).toBeEnabled();
    await opener.click();

    const dialog = page.getByRole("dialog", { name: capability.label });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("No active runner")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Availability" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Required connection" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Grounded inputs" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Reviewable output" })).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "What can be prepared or reviewed" })
    ).toBeVisible();
    await expect(dialog.getByText("Nothing ran.")).toBeVisible();
    await expect(dialog.locator(".wb-fabric-icon img")).toHaveAttribute("src", capability.icon);

    await dialog.getByRole("button", { name: "Close details" }).click();
    await expect(dialog).not.toBeVisible();
  }

  expect(dataRequests).toEqual([]);
});

test("keyboard users stay in the dialog, can press Escape, and return to the opener", async ({
  page,
}) => {
  const opener = page.getByTestId("data-work-open-review");
  await opener.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Review SQL" });
  const headerClose = dialog.getByRole("button", { name: "Close Review SQL details" });
  const footerClose = dialog.getByRole("button", { name: "Close details" });

  await expect(dialog).toBeVisible();
  await expect(headerClose).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(footerClose).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(headerClose).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("the unavailable model capability remains inspectable and does not imply execution", async ({
  page,
}) => {
  const card = page
    .locator('.wb-data-card[data-capability-state="unavailable"]')
    .filter({ hasText: "Models & tests" });
  const opener = card.getByRole("button", { name: "View requirements" });

  await expect(card.getByText("Connection required", { exact: true })).toBeVisible();
  await expect(opener).toBeEnabled();
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Models & tests" });
  await expect(dialog.getByText("Unavailable until an approved project")).toBeVisible();
  await expect(dialog.getByText("No model or test result is loaded")).toBeVisible();
  await expect(dialog.getByText("Tests cannot be run")).toBeVisible();
  await expect(dialog.getByText("Nothing ran.")).toBeVisible();
});
