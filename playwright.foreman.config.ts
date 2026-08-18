// Dedicated config for the Foreman Briefing e2e checks (spec checks 3-7).
// Its own port on purpose: 5217 is strictPort and is usually held by the
// autostarted main-checkout Workbench, and 5218 is the side-by-side preview
// pair used to look at this branch by hand. Every /api call is stubbed in the
// checks, so this server needs no gateway of its own.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "foreman-briefing.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5219",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5219",
    url: "http://127.0.0.1:5219",
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
