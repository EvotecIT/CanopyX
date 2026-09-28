// Browser tests for the CanopyX runtime. They open the pages CanopyX.Examples generates (see specs/support.mjs).
// Set CANOPYX_BROWSER_CHANNEL=msedge (or chrome) to use an installed browser instead of Playwright's Chromium.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "specs",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    channel: process.env.CANOPYX_BROWSER_CHANNEL || undefined,
    launchOptions: { executablePath: process.env.CANOPYX_BROWSER_EXECUTABLE || undefined },
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure"
  }
});
