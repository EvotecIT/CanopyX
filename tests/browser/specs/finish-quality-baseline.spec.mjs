// Optional negative proof against retained generated pages. Ordinary CI uses the rule fixtures and current gallery.
import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { serveExamples } from "../tools/example-server.mjs";
import { inspectFinishQuality } from "../tools/finish-quality.mjs";

async function retainBaseline(page, info, findings) {
  const report = info.outputPath("findings.json"), frame = info.outputPath("frame.png");
  await fs.writeFile(report, JSON.stringify(findings, null, 2));
  await page.screenshot({ path: frame, fullPage: true });
  await info.attach("baseline-findings", { path: report, contentType: "application/json" });
  await info.attach("baseline-frame", { path: frame, contentType: "image/png" });
}

for (const width of [1440, 390]) {
  test(`finish gate detects footer and sort defects in a retained baseline (${width})`, async ({ page }, info) => {
    test.skip(!process.env.CANOPYX_FINISH_BASELINE_GRID, "Set CANOPYX_FINISH_BASELINE_GRID to retained generated examples.");
    const server = await serveExamples(process.env.CANOPYX_FINISH_BASELINE_GRID);
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(server.url + (width === 390 ? "grid-footers-dark.html" : "grid-footers.html"));
      await page.waitForSelector(".cx-footer-row");
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".cx-grid")).opacity === "1");
      const findings = await page.evaluate(inspectFinishQuality);
      await retainBaseline(page, info, findings);
      expect(findings.map(finding => finding.rule)).toEqual(expect.arrayContaining(["band-width", "single-sort-priority"]));
    } finally { await server.close(); }
  });
  test(`finish gate detects calendar space and editor precision defects in a retained baseline (${width})`, async ({ page }, info) => {
    test.skip(!process.env.CANOPYX_FINISH_BASELINE_CALENDAR, "Set CANOPYX_FINISH_BASELINE_CALENDAR to retained generated examples.");
    const server = await serveExamples(process.env.CANOPYX_FINISH_BASELINE_CALENDAR);
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
      await page.goto(server.url + (width === 390 ? "calendar-resource-window-dark.html" : "calendar-resource-window.html"));
      await page.waitForSelector("[data-cx-calendar-ready]");
      const layout = await page.evaluate(inspectFinishQuality);
      const opened = await page.evaluate(async () => {
        const grid = document.querySelector("[data-canopyx-host]").canopyx;
        const event = grid.getCalendarEvents().find(event => event.record === "review");
        return grid.editCalendarOccurrence(event.id);
      });
      expect(opened).toBe(true);
      await page.locator(".cx-cal-occurrence-editor").waitFor();
      const editor = await page.evaluate(inspectFinishQuality), findings = [...layout, ...editor];
      await retainBaseline(page, info, findings);
      expect(findings.map(finding => finding.rule)).toEqual(expect.arrayContaining(["empty-band", "minute-precision"]));
    } finally { await server.close(); }
  });
}
