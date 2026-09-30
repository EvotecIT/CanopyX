// Opening a search hit: the search index says where the pages on a hit's path are, so they load at once instead of
// level after level, and the path renders once. See "Search Index" in docs/data-protocol.md for the location fields
// of an entry.
import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "paths", label: "Paths", columns: [{ id: "name", title: "Name", width: 400 }],
  search: { minLength: 2, maxResults: 20 }, source: { kind: "sidecar", base: "/data/" } };
const listPage = (parent, offset, items, next) => JSON.stringify({ protocol: "canopyx/1", type: "page", parent, offset, total: 3, items, next });
const pack = (...pages) => ({ protocol: "canopyx/1", type: "pack", pages });
const entries = [[-1, 0, "a", 0, "Alpha", null, "p/0#0"], [0, 1, "/2", 0, "Two", null, "p/2#0", "p/1#0"], [1, 3, "/x", 0, "Needle"]];

/** "a" has three children on three pages in two packs; the last one opens a list of its own, in a third pack. */
function bundle(entryItems = entries) {
  return {
    manifest: { protocol: "canopyx/1", type: "manifest", view: view.id, root: "r/0", nodeCount: 5, pageSize: 1, packs: 3,
      search: { entryCount: 3, entryFiles: [0], kinds: [], shards: { ne: 1 } } },
    "r/0": { protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 1, items: [{ id: "a", label: "Alpha", hasChildren: true, childCount: 3, ref: "p/0#0" }], next: null },
    "p/0": pack(listPage("a", 0, [{ id: "a/0", label: "Zero" }], "p/0#1"), listPage("a", 1, [{ id: "a/1", label: "One" }], "p/1#0")),
    "p/1": pack(listPage("a", 2, [{ id: "a/2", label: "Two", hasChildren: true, childCount: 1, ref: "p/2#0" }], null)),
    "p/2": pack(JSON.stringify({ protocol: "canopyx/1", type: "page", parent: "a/2", offset: 0, total: 1, items: [{ id: "a/2/x", label: "Needle" }], next: null })),
    "e/0": { protocol: "canopyx/1", type: "searchEntries", first: 0, stem: [], entries: entryItems },
    "s/k-ne": { protocol: "canopyx/1", type: "searchShard", key: "ne", words: ["needle"], postings: [[2]] }
  };
}

/**
 * Serves the bundle. While held, a pack request waits until release() or 1.5 s,
 * so a runtime that asks for the packs of a path one after another has asked for one only.
 */
async function serve(page, docs) {
  const requested = [];
  let held = false;
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.route("https://canopyx.test/data/**", async (route) => {
    const ref = new URL(route.request().url()).pathname.slice(6, -3);
    requested.push(ref);
    if (held && ref.startsWith("p/")) await Promise.race([released, new Promise((resolve) => setTimeout(resolve, 1500))]);
    return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, docs[ref]])});` });
  });
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  return { requested, hold: () => { held = true; }, release: () => release() };
}

/** Counts the batches of row changes on the grid, each a separate render, from now on. */
function countRenders(page) {
  return page.evaluate(() => {
    window.renders = 0;
    new MutationObserver(() => { window.renders++; }).observe(document.querySelector(".cx-canvas"),
      { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cx-id", "aria-expanded", "data-cx-status"] });
  });
}

test.beforeEach(({ page }) => {
  page.runtimeErrors = [];
  page.on("pageerror", (error) => page.runtimeErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(page.runtimeErrors).toEqual([]);
});

test("a search hit loads every pack on its path at once and renders the path once", async ({ page }) => {
  const server = await serve(page, bundle());
  const hit = await page.evaluate(async () => (await document.querySelector(".cx-host").canopyx.search("needle")).hits[0]);
  expect(hit.path).toEqual(["a", "a/2", "a/2/x"]);
  await countRenders(page);
  server.hold();
  await page.evaluate((path) => { window.opening = document.querySelector(".cx-host").canopyx.expandPath(path); }, hit.path);
  // The first children page of "a", the later page that holds "a/2", and the children of "a/2": three packs, asked
  // for before the first one arrives.
  await expect.poll(() => server.requested.filter((ref) => ref.startsWith("p/")).sort(), { timeout: 1000 }).toEqual(["p/0", "p/1", "p/2"]);
  server.release();
  expect(await page.evaluate(async () => ({ node: (await window.opening).id, renders: window.renders }))).toEqual({ node: "a/2/x", renders: 1 });
  await expect(page.locator('.cx-row[data-cx-id="a/2/x"]')).toHaveAttribute("aria-selected", "true");
  expect(server.requested.filter((ref) => ref.startsWith("p/"))).toHaveLength(3);
});

for (const [name, entry] of [["a number", 42], ["an empty string", ""], ["an unpaired surrogate", "p/\uD800"]]) {
  test(`an entry whose page reference is ${name} is rejected`, async ({ page }) => {
    await serve(page, bundle([entries[0], [0, 1, "/2", 0, "Two", null, "p/2#0", entry], entries[2]]));
    const message = await page.evaluate(() => document.querySelector(".cx-host").canopyx.search("needle").then(() => "", (error) => error.message));
    expect(message).toContain("search entry 1 does not match the manifest or is malformed");
  });
}
