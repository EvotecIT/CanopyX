// Performance budgets from docs/architecture.md on the large bundle example (more than 100,000 nodes, opened from disk).
// The search budget starts when the query runs, after the search box's 150 ms typing pause.
// Interactions are timed in the page, until the result is painted, as the median of three attempts on a fresh page,
// so one slow sample on a busy CI runner does not decide the result. The timings are printed for pull requests.
import { expect, test } from "@playwright/test";
import { exampleUrl, median, openExample } from "./support.mjs";

const FIRST_ROWS_MS = 2500;
const INTERACTION_MS = 250;

/** Runs an async expression in the page and returns the milliseconds until the next painted frame. */
function timed(page, body) {
  return page.evaluate(async (source) => {
    const api = document.querySelector(".cx-host").canopyx;
    const run = new Function("api", "return (async () => { " + source + " })();");
    const started = performance.now();
    await run(api);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - started;
  }, body);
}

async function measure(browser, body, setup) {
  const samples = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await browser.newPage();
    await openExample(page, "bundle/index.html");
    if (setup) {
      await page.evaluate(async (source) => new Function("api", "return (async () => { " + source + " })();")(document.querySelector(".cx-host").canopyx), setup);
    }
    samples.push(await timed(page, body));
    await page.close();
  }
  return median(samples);
}

test("first rows paint within budget on a cold load", async ({ browser }) => {
  const samples = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await browser.newPage();
    const started = Date.now();
    await page.goto(exampleUrl("bundle/index.html"));
    await page.waitForSelector(".cx-row[data-cx-id]");
    samples.push(Date.now() - started);
    await page.close();
  }
  const ms = median(samples);
  console.log("first rows: " + ms + " ms");
  expect(ms).toBeLessThanOrEqual(FIRST_ROWS_MS);
});

test("expanding a folder, including its page load, stays within budget", async ({ browser }) => {
  const ms = await measure(browser, "await api.expandPath(['share-b'], { expandLast: true, select: false, focus: false });");
  console.log("expand: " + ms.toFixed(1) + " ms");
  expect(ms).toBeLessThanOrEqual(INTERACTION_MS);
});

test("a page of children behind show more stays within budget", async ({ browser }) => {
  const ms = await measure(browser, "await api.loadMore('share-a/d0/p0');",
    "await api.expandPath(['share-a', 'share-a/d0', 'share-a/d0/p0'], { expandLast: true, select: false, focus: false });");
  console.log("show more: " + ms.toFixed(1) + " ms");
  expect(ms).toBeLessThanOrEqual(INTERACTION_MS);
});

test("search to an expanded hit stays within budget", async ({ browser }) => {
  const ms = await measure(browser, "const result = await api.search('quarterly review'); await api.expandPath(result.hits[result.hits.length - 1].path);");
  console.log("search to expanded hit: " + ms.toFixed(1) + " ms");
  expect(ms).toBeLessThanOrEqual(INTERACTION_MS);
});

test("scrolling a long expanded list never shows a blank viewport", async ({ page }) => {
  await openExample(page, "bundle/index.html");
  await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    await api.expandPath(["share-a", "share-a/d0", "share-a/d0/p0"], { expandLast: true, select: false, focus: false });
    for (let i = 0; i < 5; i++) {
      await api.loadMore("share-a/d0/p0");
    }
    const grid = document.querySelector(".cx-grid");
    const box = grid.getBoundingClientRect();
    const probes = [0.3, 0.6, 0.9].map((y) => [box.left + 80, box.top + box.height * y]);
    window.__blank = 0;
    window.__samples = 0;
    grid.addEventListener("scroll", () => requestAnimationFrame(() => {
      window.__samples++;
      // A point counts as painted only if it lands on a row that shows a node with a label, not an empty recycled row.
      if (probes.some(([x, y]) => { const hit = document.elementFromPoint(x, y); const r = hit && hit.closest(".cx-row[data-cx-id]"); return !(r && r.textContent.trim()); })) {
        window.__blank++;
      }
    }), { passive: true });
  });
  const box = await page.locator(".cx-grid").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(16);
  }
  const result = await page.evaluate(() => ({ blank: window.__blank, samples: window.__samples }));
  console.log("scroll: " + result.blank + " blank of " + result.samples + " samples");
  expect(result.samples).toBeGreaterThan(20);
  expect(result.blank).toBe(0);
});
