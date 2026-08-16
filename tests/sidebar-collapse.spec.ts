import { expect, test } from "@playwright/test";

const preferenceKey = "ipcorp-workbench.sidebar-collapsed";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, sentinel }) => {
      if (window.sessionStorage.getItem(sentinel)) return;
      window.localStorage.removeItem(key);
      window.sessionStorage.setItem(sentinel, "true");
    },
    { key: preferenceKey, sentinel: "sidebar-collapse-test-ready" }
  );
});

test("lets the user collapse the desktop navigation and remembers the choice", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const app = page.locator(".wb-app");
  const sidebar = page.getByRole("complementary", {
    name: "IP Corporation Workbench navigation",
  });

  await expect(sidebar).toHaveAttribute("data-collapse-mode", "expanded");
  await expect(app).toHaveClass(/nav-open/);

  await page.getByRole("button", { name: "Collapse navigation" }).click();

  await expect(sidebar).toHaveAttribute("data-collapse-mode", "manual");
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await expect(app).toHaveClass(/nav-collapsed/);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), preferenceKey))
    .toBe("true");

  await page.reload();
  await expect(sidebar).toHaveAttribute("data-collapse-mode", "manual");

  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(sidebar).toHaveAttribute("data-collapse-mode", "expanded");
  await expect(app).toHaveClass(/nav-open/);
});

test("collapses for a narrow viewport and restores the wider layout", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const app = page.locator(".wb-app");
  const sidebar = page.getByRole("complementary", {
    name: "IP Corporation Workbench navigation",
  });

  await page.setViewportSize({ width: 1000, height: 800 });

  await expect(sidebar).toHaveAttribute("data-collapse-mode", "responsive");
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await expect(app).toHaveClass(/nav-collapsed/);
  await expect(
    page.getByRole("button", { name: /Collapse navigation|Expand navigation/ })
  ).toHaveCount(0);
  await expect(sidebar.locator(".wb-nav-subitems")).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
    .toBeLessThanOrEqual(76);

  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(sidebar).toHaveAttribute("data-collapse-mode", "expanded");
  await expect(app).toHaveClass(/nav-open/);
  await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible();
});

test("keeps a manual collapse choice after a narrow viewport comes and goes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const sidebar = page.getByRole("complementary", {
    name: "IP Corporation Workbench navigation",
  });

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(sidebar).toHaveAttribute("data-collapse-mode", "manual");

  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(sidebar).toHaveAttribute("data-collapse-mode", "responsive");

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sidebar).toHaveAttribute("data-collapse-mode", "manual");
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
});
