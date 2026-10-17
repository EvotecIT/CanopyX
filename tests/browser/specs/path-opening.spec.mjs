// Opening a path (a search hit, a deep link, remembered state, expandPath): however many levels it opens, its rows
// are rebuilt and rendered once, and focus moves once, to the node at its end.
import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

// The tree keeps the host's height: its debounced fit to the rows would add a resize, and a render, to whichever
// measurement it happens to land in, at a time each engine schedules differently.
const view = { protocol: "canopyx/2", type: "view", id: "paths", label: "Paths", autoHeight: false, columns: [{ id: "name", title: "Name", width: 400 }],
  source: { kind: "inline" }, roots: [] };

/**
 * Mounts the view over a source whose levels each take `delay` milliseconds, as from a file share or a slow server.
 * "a" opens "a/0" to "a/2", and "a/2" opens "a/2/x"; "b" opens "b/0". window.holdB() makes the next page of "b" wait
 * until window.releaseB().
 */
async function open(page, delay) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async ({ data, delay }) => {
    const children = {
      "": [{ id: "a", label: "Alpha", hasChildren: true }, { id: "b", label: "Beta", hasChildren: true }, { id: "c", label: "Gamma" }],
      a: [{ id: "a/0", label: "Zero" }, { id: "a/1", label: "One" }, { id: "a/2", label: "Two", hasChildren: true }],
      "a/2": [{ id: "a/2/x", label: "Needle" }],
      b: [{ id: "b/0", label: "Beta zero" }]
    };
    let heldB = null;
    window.holdB = () => { heldB = new Promise((resolve) => { window.releaseB = resolve; }); };
    const host = document.querySelector(".cx-host");
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node) => {
      if (node && node.id === "b" && heldB) await heldB;
      if (node) await new Promise((resolve) => setTimeout(resolve, delay));
      const items = children[node ? node.id : ""];
      return { items, total: items.length, next: null, offset: 0 };
    } } });
    await api.ready;
    // The top level is painted before the renders of a path are counted.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { data: view, delay });
}

/** Counts the batches of row changes on the grid from now on; each is a separate render. */
function countRenders(page) {
  return page.evaluate(() => {
    window.renders = 0;
    new MutationObserver(() => { window.renders++; }).observe(document.querySelector(".cx-canvas"),
      { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cx-id", "aria-expanded", "data-cx-status"] });
  });
}

/** The renders until the next two frames have painted. */
function rendersAfterFrames(page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.renders)))));
}

/**
 * Runs an async expression in the page and returns its result with how long it took. A path that takes longer than
 * 250 ms shows its progress, so the render count is checked only for a path that opened within that time: a runner
 * too busy to keep three 20 ms levels under it says nothing about the batching.
 */
function timed(page, body) {
  return page.evaluate(async (source) => {
    const started = performance.now();
    const value = await new Function("return (async () => { " + source + " })();")();
    return { value, ms: performance.now() - started };
  }, body);
}

test.beforeEach(({ page }) => {
  page.runtimeErrors = [];
  page.on("pageerror", (error) => page.runtimeErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(page.runtimeErrors).toEqual([]);
});

test("a path loads level by level and renders once", async ({ page }) => {
  // Three levels of 20 ms each, more than a frame; before, each level showed its loading row in a frame of its own.
  await open(page, 20);
  await countRenders(page);
  const opened = await timed(page, "return (await api.expandPath(['a', 'a/2', 'a/2/x'])).id;");
  expect(opened.value).toBe("a/2/x");
  const renders = await rendersAfterFrames(page);
  if (opened.ms < 200) expect(renders).toBe(1);
  expect(await page.evaluate(() => document.activeElement.getAttribute("data-cx-id"))).toBe("a/2/x");
});

test("restoring remembered state renders once", async ({ page }) => {
  await open(page, 20);
  await countRenders(page);
  const restored = await timed(page, "await api.setState({ expanded: [['a'], ['a', 'a/2'], ['b']] });");
  const renders = await rendersAfterFrames(page);
  if (restored.ms < 200) expect(renders).toBe(1);
  expect(await page.evaluate(() => api.visibleRows().map((row) => row.node.id))).toEqual(["a", "a/0", "a/1", "a/2", "a/2/x", "b", "b/0", "c"]);
});

for (const filtered of [false, true]) {
test(`a path that opens while another one still loads reveals and focuses its node${filtered ? ", clearing a filter that hides it" : ""}`, async ({ page }) => {
  await open(page, 0);
  // "a" and "a/2" are loaded, then closed again, so the second path below loads nothing.
  await page.evaluate(async (filtered) => {
    await api.expandPath(["a", "a/2", "a/2/x"], { select: false, focus: false });
    await api.setState({ expanded: [] });
    if (filtered) api.setFilter((node) => node.id === "c");
  }, filtered);
  await page.evaluate(() => {
    holdB();
    window.slow = api.expandPath(["b", "b/0"]);
  });
  const fast = await page.evaluate(async () => {
    const node = await api.expandPath(["a", "a/2", "a/2/x"]);
    return { node: node.id, focused: document.activeElement.getAttribute("data-cx-id"), selected: api.getSelected().map((n) => n.id),
      visible: api.visibleRows().map((row) => row.node.id) };
  });
  expect(fast).toEqual({ node: "a/2/x", focused: "a/2/x", selected: ["a/2/x"], visible: ["a", "a/0", "a/1", "a/2", "a/2/x", "b", "c"] });
  await page.evaluate(() => { releaseB(); return slow; });
});
}
