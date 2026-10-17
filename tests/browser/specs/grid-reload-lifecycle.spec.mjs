import { expect, test } from "@playwright/test";
import { ready, servePage } from "./enhance-support.mjs";

const view = { protocol: "canopyx/2", type: "grid", id: "reload-life", label: "Reload lifecycle", pageSize: 2,
  selection: "none", search: true, searchDelayMs: 5000, source: { kind: "host", navigation: "offset" },
  presentation: "paged", pageLength: 2, columns: [{ id: "name", title: "Name", kind: "text", sortable: true }] };

test.beforeEach(({ page }) => { page.errors = []; page.on("pageerror", error => page.errors.push(error.message)); });
test.afterEach(({ page }) => { expect(page.errors).toEqual([]); });

test("reload accepts a queued search before its debounce expires", async ({ page }) => {
  await servePage(page, "<div id='host'></div>");
  await page.evaluate(async view => {
    window.requests = [];
    window.grid = CanopyX.createDataGrid(document.querySelector("#host"), { view, source: { query: async query => {
      requests.push(query);
      const rows = [{ id: "a", cells: { name: "Alpha" } }, { id: "b", cells: { name: "Beta" } }]
        .filter(row => row.cells.name.toLowerCase().includes(query.search.toLowerCase()));
      return { protocol: "canopyx/2", type: "gridPage", view: view.id, revision: "r" + requests.length,
        total: 2, matched: rows.length, offset: query.offset, items: rows };
    } } }); await grid.ready;
  }, view);
  await ready(page);
  await page.locator(".cx-search-input").fill("Beta");
  await page.evaluate(() => grid.reload());
  expect(await page.evaluate(() => ({ search: grid.getQuery().search, requests: requests.map(query => [query.search, query.revision]) })))
    .toEqual({ search: "Beta", requests: [["", undefined], ["Beta", undefined]] });
  await expect(page.locator(".cx-search-input")).toHaveValue("Beta");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveAttribute("data-cx-id", "b");
});

test("reload preserves a pending page length while starting a new snapshot", async ({ page }) => {
  await servePage(page, "<div id='host'></div>");
  const result = await page.evaluate(async view => {
    let calls = 0, pendingSignal;
    const grid = CanopyX.createDataGrid(document.querySelector("#host"), { view, source: { query: async (query, options) => {
      if (++calls === 2) { pendingSignal = options.signal; return new Promise(() => {}); }
      return { protocol: "canopyx/2", type: "gridPage", view: view.id, revision: calls === 1 ? "r1" : "r2",
        total: 4, matched: 4, offset: 0, items: ["Alpha", "Beta", "Gamma", "Omega"].map((name, index) => ({ id: String(index), cells: { name } })) };
    } } }); await grid.ready;
    const pending = grid.setPageLength(4).catch(error => error.name);
    while (!pendingSignal) await new Promise(resolve => setTimeout(resolve, 0));
    await grid.reload();
    return { calls, pending: await pending, aborted: pendingSignal.aborted, length: grid.getPaging().pageLength, revision: grid.getQuery().revision };
  }, { ...view, pageSize: 4 });
  expect(result).toEqual({ calls: 3, pending: "AbortError", aborted: true, length: 4, revision: "r2" });
});

test("reload retires pending cursor navigation without carrying its old traversal edge", async ({ page }) => {
  await servePage(page, "<div id='host'></div>");
  const result = await page.evaluate(async definition => {
    let calls = 0, pendingSignal; const queries = [], errors = [];
    const grid = CanopyX.createDataGrid(document.querySelector("#host"), { view: { ...definition, source: { kind: "host", navigation: "cursor" } },
      onError: event => errors.push(event.error.message), source: { query: async (query, options) => {
        queries.push(query); if (++calls === 2) { pendingSignal = options.signal; return new Promise(() => {}); }
        return { protocol: "canopyx/2", type: "gridCursorPage", view: definition.id, revision: calls === 1 ? "r1" : "r2",
          total: 4, matched: 4, offset: 0, nextCursor: "next-" + calls,
          items: [{ id: "a", cells: { name: "Alpha" } }, { id: "b", cells: { name: "Beta" } }] };
      } } }); await grid.ready;
    const pending = grid.nextPage().catch(error => error.name);
    while (!pendingSignal) await new Promise(resolve => setTimeout(resolve, 0));
    await grid.reload();
    return { pending: await pending, aborted: pendingSignal.aborted, query: grid.getQuery(), paging: grid.getPaging(), errors,
      requests: queries.map(query => [query.cursor, query.revision]) };
  }, view);
  expect(result.pending).toBe("AbortError"); expect(result.aborted).toBe(true); expect(result.errors).toEqual([]);
  expect(result.query.revision).toBe("r2"); expect(result.paging.first).toBe(1);
  expect(result.requests).toEqual([[undefined, undefined], ["next-1", "r1"], [undefined, undefined]]);
});
