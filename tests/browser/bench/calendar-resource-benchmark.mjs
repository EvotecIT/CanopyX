// Focused day/week column-window measurement using the browser suite's calendar fixture and normal benchmark runner.
// Baseline assets are read from a Git commit into memory; no checkout or other worktree is changed.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { repo, runtimeAssets, median } from "../specs/support.mjs";
import { calendarC1Page } from "../specs/calendar-c1-support.mjs";
import { openBuilt } from "../specs/calendar-support.mjs";

export async function measureResourceColumns(browser, output, baseline = "5204223b0c0f72825b4e3c215a2d2ae0214ee10f") {
  const current = runtimeAssets("grid"), before = { ...current };
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "CanopyX.Html/Assets"], { cwd: repo, encoding: "utf8" }).trim().split("\n");
  for (const file of files.filter(file => /\/[^/]+\.(?:js|css)$/.test(file) && !file.includes(".source/"))) {
    const now = fs.readFileSync(path.join(repo, file), "utf8"), old = execFileSync("git", ["show", baseline + ":" + file], { cwd: repo, encoding: "utf8", maxBuffer: 20000000 }).replace(/\r\n/g, "\n");
    // Runtime fixture composition includes several generated assets. Replace each complete asset, preserving their order.
    const key = file.endsWith(".css") ? "style" : "script";
    before[key] = before[key].replace(now, old);
  }
  const digest = assets => createHash("sha256").update(assets.script).update(assets.style).digest("hex");
  const report = { baseline, assets: { baseline: digest(before), current: digest(current) }, browser: browser.version(),
    machine: { cpu: os.cpus()[0].model, platform: os.platform(), release: os.release() }, viewport: { width: 1440, height: 900 },
    runs: 3, timer: "firstPaintMs: mount through calendar-ready and two frames; ms: mount through the Friday resource window and two frames",
    fixture: { date: "2026-10-16", firstDay: "Monday", minTime: "08:00", maxTime: "18:00", slotMinutes: 30, events: "one Friday 09:00–10:00 event per resource" }, cases: [] };
  for (const count of [24, 48, 1000]) for (const view of ["day", "week"]) for (const cpu of [1, 4]) for (const [candidate, assets] of [["baseline", before], ["current", current]]) {
    const samples = [];
    for (let run = 0; run < report.runs; run++) {
      const context = await browser.newContext({ viewport: report.viewport });
      try {
        const page = await context.newPage(), session = await context.newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        await openBuilt(page, "calendar-bench.html", calendarC1Page({ count, view }, assets));
        const initial = await page.evaluate(async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { firstPaintMs: performance.now() - window.mountedAt, initiallyVisibleEvents: document.querySelectorAll(".cx-cal-ev").length };
        });
        // A week starts on Monday, while the data is on Friday. Pan the current window to the day whose events we measure.
        const picker = page.locator(".cx-cal-rpick-select");
        if (view === "week" && await picker.count()) {
          const first = await picker.evaluate((select, offset) => Math.max(...[...select.options].map(option => Number(option.value)).filter(value => value <= offset)), 4 * count);
          await picker.selectOption(String(first));
          await page.waitForFunction(() => document.querySelectorAll(".cx-cal-ev").length > 0);
        }
        const sample = await page.evaluate(async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { ms: performance.now() - window.mountedAt, resources: document.querySelectorAll(".cx-cal-rhead").length,
            slots: document.querySelectorAll(".cx-cal-slot").length, visibleEvents: document.querySelectorAll(".cx-cal-ev").length,
            logicalEvents: window.api.getCalendarEvents().length, nodes: document.getElementsByTagName("*").length, errors: window.errors };
        });
        Object.assign(sample, initial);
        if (sample.errors.length) throw new Error(sample.errors.join("; "));
        samples.push(sample);
      } finally { await context.close(); }
    }
    const item = { count, view, cpu, candidate, medianFirstPaintMs: median(samples.map(sample => sample.firstPaintMs)), medianMs: median(samples.map(sample => sample.ms)), samples };
    report.cases.push(item); console.log(JSON.stringify(item));
  }
  report.comparability = "24-resource day is matched behaviour with 24 displayed events in both candidates (use firstPaintMs). Week initially shows Monday, then current pans to Friday; it shows eight Friday assignments while baseline shows the complete week. Above 24 resources baseline drops resource columns. Those cases prove capability and bounded DOM, not an equivalent-view speedup.";
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2));
  return report;
}
