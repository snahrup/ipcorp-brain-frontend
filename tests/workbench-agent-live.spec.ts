import { expect, test } from "@playwright/test";

test.skip(
  process.env.WORKBENCH_AGENT_LIVE !== "1",
  "Set WORKBENCH_AGENT_LIVE=1 to exercise the running model and local services."
);

test("real agent streams an answer and navigates to Team Library", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Open Workbench Agent" }).click();

  const input = page.getByRole("textbox", { name: "Ask the Workbench Agent" });
  await input.fill("What page am I on? Answer in one short sentence and do not use tools.");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Reasoning" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".workbench-agent-message.agent").last()).toContainText("Today", {
    timeout: 90_000,
  });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });

  await input.fill("Take me to Team Library and focus its Collections section.");
  await input.press("Enter");
  await expect(page.getByTestId("team-library")).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText("Opened Team Library: Choose the work you need to review.", { exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".workbench-agent-notice.is-error")).toHaveCount(0);
});
