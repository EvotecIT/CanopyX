// Half a million rows on a slow CPU (docs/large-data.md): the 500,000-user grid of the scale benchmark
// (bench/scale-benchmark.mjs), written by the examples app beside the test output and opened from file://, with the CPU
// slowed four times through the Chromium DevTools protocol. While the rows decode in the background and while a search
// runs, no main-thread task may hold the page past its budget, so typing and scrolling keep their turn. The decode, search
// and heap figures are printed for pull requests. Opt-in with the other benchmarks (@benchmark).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { repo } from "./support.mjs";

const CPU = 4;
// Measured at 4x on a workstation: no decoding task over 50 ms and search tasks under 100 ms (before slicing, 70 ms and
// 1.8 s); the budgets leave room for slower hosted runners.
const DECODE_TASK_MS = 250;
const SEARCH_TASK_MS = 250;

function fixture() {
  const folder = path.resolve(process.env.CANOPYX_TEST_OUTPUT_DIR || path.join(repo, "tests/browser/test-results"), "scale-500k");
  const file = path.join(folder, "scale", "users-500000.html");
  if (!fs.existsSync(file)) {
    const examples = path.join(repo, "CanopyX.Examples/bin/Release/net10.0/CanopyX.Examples.dll");
    if (!fs.existsSync(examples)) throw new Error("Build CanopyX.Examples in Release first: " + examples);
    execFileSync("dotnet", [examples, folder, "--scale", "--tiers", "500000"], { stdio: "pipe", timeout: 300000 });
  }
  return pathToFileURL(file).href;
}

function watch() {
  const t = window.__scale = { long: [], first: null, all: null };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) t.long.push([entry.startTime, entry.duration]); }).observe({ type: "longtask", buffered: true });
  const check = () => {
    const host = document.querySelector("[data-cx-ready]"), view = host?.canopyx?.view;
    if (t.first == null && host?.querySelector(".cx-row[data-cx-id]")) t.first = performance.now();
    if (t.first != null && view?.rowData && view.rows.length >= view.rowData.count) t.all = performance.now();
    else setTimeout(check, 10);
  };
  check();
}

const longest = (tasks, from, to) => tasks.filter(([start, duration]) => start + duration >= from && start <= to).reduce((max, [, duration]) => Math.max(max, duration), 0);

test.describe("half a million rows", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling needs the Chromium DevTools protocol.");
  test.setTimeout(600000);

  test("decode and search stay responsive at " + CPU + "x CPU", { tag: "@benchmark" }, async ({ browser }) => {
    const url = fixture();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(watch);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    await page.goto(url, { waitUntil: "commit" });
    await page.waitForFunction(() => window.__scale?.all != null, null, { timeout: 300000, polling: 100 });
    const load = await page.evaluate(() => ({ first: window.__scale.first, all: window.__scale.all, tasks: window.__scale.long }));
    const decodeTask = longest(load.tasks, load.first, load.all);
    // A search through every row: typed into the toolbar, timed until the frame after the first match shows.
    const search = await page.evaluate(async () => {
      const api = document.querySelector("[data-cx-ready]").canopyx, started = performance.now();
      await api.setQuery({ search: "kestrel" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const ended = performance.now();
      await new Promise(resolve => setTimeout(resolve, 200));
      return { started, ended, tasks: window.__scale.long, matched: document.querySelectorAll(".cx-row[data-cx-id]").length };
    });
    const searchTask = longest(search.tasks, search.started, search.ended);
    await cdp.send("HeapProfiler.collectGarbage");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const heap = Math.round(metrics.find(metric => metric.name === "JSHeapUsedSize").value / 1048576);
    console.log(`500,000 rows at ${CPU}x: first rows ${Math.round(load.first)} ms, all rows ${Math.round(load.all)} ms (longest task ${Math.round(decodeTask)} ms), ` +
      `search ${Math.round(search.ended - search.started)} ms (longest task ${Math.round(searchTask)} ms), heap ${heap} MB`);
    expect(search.matched).toBeGreaterThan(0);
    expect(decodeTask).toBeLessThanOrEqual(DECODE_TASK_MS);
    expect(searchTask).toBeLessThanOrEqual(SEARCH_TASK_MS);
    await page.close();
  });
});
