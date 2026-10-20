// Visual-regression baselines for the curated examples, at 1440 and 390 pixels, in the light and dark themes.
// Chromium on Windows is the baseline engine (see playwright.config.mjs). Refresh the images after an intended visual
// change with `npm run test:visual:update` in tests/browser, then review every changed image before committing it.
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames } from "./support.mjs";
import { pinTestFont, testFontState } from "./visual-font.mjs";

// Each example has a light page and a dark page; pages without a dark variant follow the system theme.
const examples = [
  { name: "inventory-grid", dark: "inventory-grid-dark" },
  { name: "grouped-grid", dark: "grouped-grid-dark" },
  { name: "rich-grid", dark: "rich-grid-dark" },
  { name: "graphite-grid", dark: "graphite-grid-dark" },
  { name: "responsive-grid", dark: "responsive-grid-dark" },
  { name: "plugins", dark: "plugins-dark" },
  { name: "inline", dark: "inline" },
  { name: "tree-parity", dark: "tree-parity-dark" },
  { name: "plugins-tree", dark: "plugins-tree-dark" },
  // Calendars read the clock for today and the now line, so they open at a fixed moment.
  { name: "calendar", dark: "calendar-dark", calendar: true },
  { name: "calendar-timeline", dark: "calendar-timeline-dark", calendar: true },
  { name: "calendar-certificates", dark: "calendar-certificates-dark", calendar: true },
  // Flows: the horizontal and vertical steppers, edit mode with its mock-host switch, and a dialog-sized single step.
  { name: "flow-mail-server", dark: "flow-mail-server-dark" },
  { name: "flow-schedule-report", dark: "flow-schedule-report-dark" },
  { name: "flow-edit-settings", dark: "flow-edit-settings-dark" },
  { name: "flow-pause", dark: "flow-pause-dark" },
  // Host-connected flows: checks and presets on an edit, a task list with host states, and a dialog flow's launcher.
  { name: "flow-mail-checks", dark: "flow-mail-checks-dark" },
  { name: "flow-setup-tasks", dark: "flow-setup-tasks-dark" },
  { name: "flow-act-on-rows", dark: "flow-act-on-rows-dark" },
  // Matrices: a square matrix grouped by site, services by servers (cards on phones), and a large matrix opening on its problems.
  { name: "matrix-replication", dark: "matrix-replication-dark" },
  { name: "matrix-services", dark: "matrix-services-dark" },
  { name: "matrix-consistency", dark: "matrix-consistency-dark" }
];
const sizes = [{ width: 1440, height: 900, crop: 420 }, { width: 390, height: 844, crop: 600 }];

// Regions whose content may legitimately differ between runs. The examples are generated from fixed data, so this is
// a guard for future pages rather than a list of known noise: anything a page marks volatile, and the example host's
// own status lines (not the views' status regions, which stay compared).
const volatile = ["[data-cx-volatile]", ".cx-example > [role=\"status\"]", ".cx-example main > [role=\"status\"]"];

// The first view's box once its height stops changing: trees fit their height to their rows after a short debounce.
async function settledBox(page) {
  const host = page.locator("[data-canopyx-host]").first();
  let box = await host.boundingBox();
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(150);
    await nextFrames(page);
    const next = await host.boundingBox();
    if (next.y === box.y && next.height === box.height) return next;
    box = next;
  }
  throw new Error("The view's height did not settle.");
}

for (const size of sizes) for (const theme of ["light", "dark"]) {
  test.describe(`${size.width} ${theme}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, colorScheme: theme, locale: "en-US",
      timezoneId: "UTC", reducedMotion: "reduce" });

    for (const example of examples) {
      test(`${example.name} matches its baseline (${size.width}, ${theme})`, async ({ page }) => {
        await pinTestFont(page);
        if (example.calendar) await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
        await page.goto(exampleUrl((theme === "dark" ? example.dark : example.name) + ".html"));
        await page.waitForSelector(example.calendar ? "[data-cx-calendar-ready]" : "[data-cx-ready]");
        expect(await testFontState(page), "the test font must be ready before the views mount").toEqual({ atMount: "loaded", now: "loaded" });
        await nextFrames(page);
        await page.evaluate(() => { scrollTo(0, 0); document.activeElement?.blur?.(); });
        // The first view, cropped to its top rows: the toolbar, the header and the first screen of records.
        const box = await settledBox(page);
        const clip = { x: 0, y: Math.max(0, Math.floor(box.y) - 8), width: size.width, height: 0 };
        clip.height = Math.min(size.crop, Math.ceil(box.y + box.height) + 8 - clip.y, size.height - clip.y);
        await expect(page).toHaveScreenshot(`${example.name}-${size.width}-${theme}.png`, {
          clip, mask: volatile.map(selector => page.locator(selector)), maskColor: "#ff00ff", animations: "disabled", caret: "hide"
        });
      });
    }
  });
}
