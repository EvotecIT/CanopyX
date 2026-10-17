// Browser tests for the CanopyX runtime. They open the pages CanopyX.Examples generates (see specs/support.mjs).
// CANOPYX_TEST_BROWSERS picks the engines (default chromium; "all" or chromium,firefox,webkit); see tools/browsers.mjs.
// Set CANOPYX_BROWSER_CHANNEL=msedge (or chrome) to use an installed browser instead of Playwright's Chromium.
// The visual baselines run as their own "visual" project on Playwright's Chromium on Windows, the baseline platform;
// CANOPYX_VISUAL=0 leaves them out and CANOPYX_VISUAL=1 runs them anyway (expect differences on other platforms).
import { defineConfig } from "@playwright/test";

const engines = ["chromium", "firefox", "webkit"];
const benchmarks = process.env.CANOPYX_BENCHMARKS === "1";
const requested = (process.env.CANOPYX_TEST_BROWSERS || "chromium").trim();
const browserNames = requested === "all" ? engines : requested.split(",").map(name => name.trim());
if (new Set(browserNames).size !== browserNames.length || browserNames.some(name => !engines.includes(name))) {
  throw new Error("CANOPYX_TEST_BROWSERS must be \"all\" or name unique chromium, firefox, or webkit engines.");
}

const customChromium = !!(process.env.CANOPYX_BROWSER_CHANNEL || process.env.CANOPYX_BROWSER_EXECUTABLE);
const visual = !benchmarks && (process.env.CANOPYX_VISUAL === "1" ||
  (process.env.CANOPYX_VISUAL !== "0" && browserNames.includes("chromium") && process.platform === "win32" && !customChromium));
const visualSpec = /visual-baselines\.spec\.mjs$/;
// Explicit benchmark runs include the calendar measurements on Chromium after the other selected projects finish.
// Ordinary correctness CI does not create this project.
const calendarPerformanceSpec = /calendar-performance\.spec\.mjs$/;
const calendarPerformance = benchmarks && browserNames.includes("chromium") && !customChromium;

export default defineConfig({
  testDir: "specs",
  grep: benchmarks ? /@benchmark/ : undefined,
  grepInvert: benchmarks ? undefined : /@benchmark/,
  timeout: 60000,
  expect: {
    timeout: 10000,
    // A pixel may differ by the default colour threshold, and at most 0.15% of a crop may differ at all: less than one
    // full-width line at 1440 and at 390, so a changed border or row fails. The baselines use a bundled font and grayscale text.
    toHaveScreenshot: { threshold: 0.2, maxDiffPixelRatio: 0.0015, animations: "disabled", caret: "hide", scale: "css" }
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  projects: [
    ...browserNames.map(browserName => ({ name: browserName, testIgnore: [visualSpec, calendarPerformanceSpec], use: {
      browserName,
      ...(browserName === "chromium" ? {
        channel: process.env.CANOPYX_BROWSER_CHANNEL || undefined,
        launchOptions: { executablePath: process.env.CANOPYX_BROWSER_EXECUTABLE || undefined }
      } : {}),
      // Firefox reports the machine's own pointers, so a laptop's touch screen makes any-pointer:coarse match and swaps
      // in the touch layout. Pin a mouse, as the other engines do; contexts with hasTouch still emulate touch.
      ...(browserName === "firefox" ? {
        launchOptions: { firefoxUserPrefs: { "ui.primaryPointerCapabilities": 6, "ui.allPointerCapabilities": 6 } }
      } : {})
    } })),
    ...(calendarPerformance ? [{ name: "calendar-performance", testMatch: calendarPerformanceSpec, dependencies: [...browserNames, ...(visual ? ["visual"] : [])], use: { browserName: "chromium" } }] : []),
    ...(visual ? [{ name: "visual", testMatch: visualSpec, use: {
      browserName: "chromium",
      // Grayscale anti-aliasing, unhinted glyphs and an sRGB output keep the pixels independent of display settings.
      launchOptions: { args: ["--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"] }
    } }] : [])
  ],
  use: {
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure"
  }
});
