// Dedicated config for the Foreman Briefing e2e checks (spec checks 4-7).
// Port 5218 on purpose: 5217 is strictPort and is usually held by the
// autostarted main-checkout Workbench, which does not contain this branch.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "foreman-briefing.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5218",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5218",
    url: "http://127.0.0.1:5218",
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
