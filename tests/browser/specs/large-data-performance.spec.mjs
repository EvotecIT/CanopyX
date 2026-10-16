// Load budgets for large reports (docs/large-data.md), with the CPU slowed four times through the Chromium DevTools protocol:
// the first rows of a single-file grid of 100,000 rows (the default format, which compresses its row data, and row objects),
// and a report of 24 grids that mount when visible becoming ready. Each is the median of three cold loads, timed in the page from navigation start to the
// frame after the first data row is in the DOM; the timings are printed for pull requests. Next to the timing, the report
// checks what does not depend on the runner: only its two visible grids mount at first.
import { expect, test } from "@playwright/test";
import { exampleUrl, median } from "./support.mjs";

const CPU = 4;
// Measured at 4x on a workstation: about 1.2 to 1.7 s, 2.1 to 2.5 s and 1.5 to 2.0 s (docs/large-data.md); the budgets leave room for
// slower hosted runners.
const FIRST_ROWS_DEFAULT_MS = 4000;
const FIRST_ROWS_OBJECTS_MS = 8000;
const REPORT_READY_MS = 6000;

function watchLoad() {
  window.__firstRows = null; window.__ready = null;
  new MutationObserver(() => {
    if (window.__firstRows == null && document.querySelector(".cx-row[data-cx-id]")) {
      window.__firstRows = -1;
      requestAnimationFrame(() => { window.__firstRows = performance.now(); });
    }
    if (window.__ready == null && document.querySelectorAll("[data-cx-ready]").length >= 2) window.__ready = performance.now();
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cx-id", "data-cx-ready"] });
}

async function load(browser, name, until) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(watchLoad);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(exampleUrl(name), { waitUntil: "commit" });
  await page.waitForFunction(until, null, { timeout: 60000, polling: 50 });
  return page;
}

test.describe("large data load budgets", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling needs the Chromium DevTools protocol.");
  test.setTimeout(240000);

  for (const [name, budget] of [["large/grid-100k.html", FIRST_ROWS_DEFAULT_MS], ["large/grid-100k-objects.html", FIRST_ROWS_OBJECTS_MS]]) {
    test("first rows of " + name + " paint within budget at " + CPU + "x CPU", async ({ browser }) => {
      const samples = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const page = await load(browser, name, () => window.__firstRows > 0);
        samples.push(await page.evaluate(() => window.__firstRows));
        await page.close();
      }
      const ms = Math.round(median(samples));
      console.log(name + " first rows at " + CPU + "x: " + ms + " ms");
      expect(ms).toBeLessThanOrEqual(budget);
    });
  }

  test("a report of 24 grids mounts and readies its two visible grids within budget at " + CPU + "x CPU", async ({ browser }) => {
    const samples = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await load(browser, "large/report.html", () => window.__ready != null);
      samples.push(await page.evaluate(() => window.__ready));
      expect(await page.evaluate(() => document.querySelectorAll("[data-canopyx-mounted]").length)).toBe(2);
      await page.close();
    }
    const ms = Math.round(median(samples));
    console.log("report ready at " + CPU + "x: " + ms + " ms");
    expect(ms).toBeLessThanOrEqual(REPORT_READY_MS);
  });
});
