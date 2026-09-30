// Performance budgets from docs/architecture.md on the large bundle example (more than 100,000 nodes, opened from disk).
// The search budget starts when the query runs, after the search box's 150 ms typing pause. Next to the timing, the
// index files a query loads are counted, which does not depend on how fast the runner is.
// Interactions are timed in the page, until the result is painted, as the median of three attempts on a fresh page,
// so one slow sample on a busy CI runner does not decide the result. The timings are printed for pull requests.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { exampleUrl, median, openExample } from "./support.mjs";

const FIRST_ROWS_MS = 2500;
const INTERACTION_MS = 250;
const SEARCH_INDEX_FILES = 32;
// The index is packed into files of up to 64 KiB, so a query reads a few whole packs: about 11% of the example's
// 5.5 MB index for the widest query, against 4% with separate files (see "Index Packs" in docs/data-protocol.md).
const SEARCH_INDEX_BYTES = 1024 * 1024;

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

// Budgets that do not depend on how fast the runner is: the pages on a hit's path load in one round, because the
// index says where they are, and the rows are rebuilt and rendered once for the whole path.
test("a search hit loads the pages on its path in one round and renders the path once", async ({ page }) => {
  await openExample(page, "bundle/index.html");
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    const hit = (await api.search("quarterly review")).hits.pop();
    // A page file is asked for when its script is added, and arrives when the script registers its document.
    const events = [];
    const files = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.tagName === "SCRIPT" && /\/[pr]\/\d+\.js$/.test(node.src)) events.push("request");
    })));
    files.observe(document.head, { childList: true });
    const register = self.CanopyXSidecar.push;
    self.CanopyXSidecar.push = function (entry) {
      if (/^[pr]\//.test(entry[1])) events.push("arrive");
      return register.apply(this, arguments);
    };
    let renders = 0;
    const rows = new MutationObserver(() => { renders++; });
    rows.observe(document.querySelector(".cx-canvas"), { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cx-id", "aria-expanded", "data-cx-status"] });
    const node = await api.expandPath(hit.path);
    files.disconnect();
    self.CanopyXSidecar.push = register;
    return { found: node.id === hit.path[hit.path.length - 1], depth: hit.path.length, events, renders };
  });
  console.log("search hit path: " + result.depth + " levels, page files " + result.events.join(" ") + ", renders " + result.renders);
  expect(result.found).toBe(true);
  const requests = result.events.filter((event) => event === "request").length;
  expect(requests).toBeGreaterThan(0);
  expect(requests).toBeLessThanOrEqual(result.depth);
  expect(result.events.slice(0, requests).every((event) => event === "request")).toBe(true);
  expect(result.renders).toBe(1);
});

test("a repeated search answers from the loaded index within budget", async ({ browser }) => {
  const ms = await measure(browser, "await api.search('quarterly review');", "await api.search('quarterly review');");
  console.log("repeated search: " + ms.toFixed(1) + " ms");
  expect(ms).toBeLessThanOrEqual(INTERACTION_MS);
});

// A query reads the shards of its words and the entry files of the matches it ranks, never the whole index: 4,698
// nodes match "quarterly review", "re" starts the most common words of the example, and the queries with a one-unit
// word match nothing or little among thousands of candidates.
for (const query of ["quarterly review", "re", "İstanbul lau", "version 9", "quarterly z", "quarterly r"]) {
  test(`searching "${query}" loads a bounded part of the index`, async ({ page }) => {
    const loaded = [];
    page.on("request", (request) => {
      const match = /\/data\/[^/]+\/[seq]\/[^/]+\.js$/.exec(request.url());
      if (match) loaded.push(fs.statSync(fileURLToPath(request.url())).size);
    });
    await openExample(page, "bundle/index.html");
    const result = await page.evaluate((text) => document.querySelector(".cx-host").canopyx.search(text), query);
    const bytes = loaded.reduce((sum, size) => sum + size, 0);
    console.log("search \"" + query + "\": " + result.hits.length + " of " + result.total + " hits from " + loaded.length + " index files, " + Math.round(bytes / 1024) + " KiB");
    expect(result.total).toBe(query === "version 9" || query === "quarterly z" ? 0 : result.total);
    expect(result.truncated).toBe(result.total > result.hits.length);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.length).toBeLessThanOrEqual(SEARCH_INDEX_FILES);
    expect(bytes).toBeLessThanOrEqual(SEARCH_INDEX_BYTES);
  });
}

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
