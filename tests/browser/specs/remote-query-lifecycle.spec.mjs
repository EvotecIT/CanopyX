import { test, expect } from "@playwright/test";
import { viewPage, openExample } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "query-life", title: "Records", pageSize: 2,
  columns: [{ id: "name", title: "Name", width: 230, sortable: true }], filters: [{ id: "flagged", label: "Flagged", flag: "flagged" }], source: { kind: "inline" }, roots: [] };
async function open(page) {
  await page.route("https://query.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://query.test/"); await page.waitForSelector("[data-cx-ready]");
}

test("invalid queries and pre-cancelled calls never retire or fetch accepted data", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let calls = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async () => {
      calls++; return { items: [{ id: "a", label: "A" }], next: null, revision: "r1" };
    } } }); await api.ready;
    const invalid = [null, { version: 2, sort: null, filters: [] }, { version: 1, sort: null, filters: ["unknown"] },
      { version: 1, sort: null, filters: ["flagged", "flagged"] }, { version: 1, sort: { column: "missing", direction: "asc" }, filters: [] },
      { version: 1, sort: { column: "name", direction: "invalid" }, filters: [] }];
    let errors = 0; for (const query of invalid) try { await api.setQuery(query); } catch { errors++; }
    const signal = new AbortController(); signal.abort();
    const cancelled = await api.setQuery({ version: 1, sort: { column: "name", direction: "asc" }, filters: [] }, { signal: signal.signal });
    const same = await api.setQuery(api.getQuery()); return { errors, cancelled, same, calls, query: api.getQuery(), ids: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result.errors).toBe(6); expect(result.cancelled).toBe(false); expect(result.same).toBe(true); expect(result.calls).toBe(1); expect(result.ids).toEqual(["a"]);
  expect(result.query.sort).toBeNull();
});

test("a later header click uses pending intent while its accepted indicator waits", async ({ page }) => {
  await open(page);
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); window.queryCalls = [];
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
      window.queryCalls.push(request.query.sort && request.query.sort.direction);
      if (request.query.sort) return new Promise(resolve => { window.acceptHeader = () => resolve({ items: [{ id: request.query.sort.direction, label: "New" }], next: null, revision: "r2" }); });
      return { items: [{ id: "old", label: "Old" }], next: null, revision: "r1" };
    } } }); await api.ready;
  }, view);
  const header = page.getByRole("columnheader", { name: "Name", exact: true });
  await header.getByRole("button").click(); await expect(header).toHaveAttribute("aria-sort", "none");
  await header.getByRole("button").click(); await expect(header).toHaveAttribute("aria-sort", "none");
  expect(await page.evaluate(() => window.queryCalls)).toEqual([null, "asc", "desc"]);
  await page.evaluate(() => window.acceptHeader()); await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator('[data-cx-id="desc"]')).toBeVisible();
});

test("a user query cancels stale state restoration after its accepted root query", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let started;
    const reached = new Promise(resolve => { started = resolve; });
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
      if (cursor) { started(); return new Promise(() => {}); }
      return { items: [{ id: "a", label: "A" }], next: request.query.sort ? null : "more", revision: "r1" };
    } } }); await api.ready;
    const saved = api.getState(); saved.selection = [["missing"]]; saved.columns[0].width = 440;
    const restoring = api.setState(saved); await reached;
    const updated = await api.sort("name", "desc");
    return { updated, restored: await restoring, query: api.getQuery(), selected: api.getSelected(), width: api.getState().columns[0].width };
  }, view);
  expect(result.updated).toBe(true); expect(result.restored).toBe(false); expect(result.query.sort.direction).toBe("desc"); expect(result.selected).toEqual([]);
  // Presentation already accepted before path loading remains, but stale restoration does not overwrite the new query.
  expect(result.width).toBe(440);
});

test("a query can retire a stalled initial load and ready settles on its accepted roots", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let initial;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
      if (!request.query.sort) { initial = request.signal; return new Promise(() => {}); }
      return { items: [{ id: "new", label: "New" }], next: null, revision: "r2" };
    } } }); const accepted = await api.sort("name", "desc"); await api.ready;
    return { accepted, aborted: initial.aborted, ready: host.getAttribute("data-cx-ready"), ids: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result).toEqual({ accepted: true, aborted: true, ready: "true", ids: ["new"] });
});

test("a query retires a stalled child reload and clears stale search choices", async ({ page }) => {
  await open(page);
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); data.search = { minLength: 1, maxResults: 10 };
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, canSearch: true,
      page: async (node, cursor, request) => node ? new Promise(() => {}) : { items: [{ id: "old", label: "Old", hasChildren: true }], next: null, revision: "r1" },
      search: async () => ({ hits: [{ path: ["old"], label: "Old" }], revision: "r1" })
    } }); await api.ready; window.childReload = api.reload("old");
  }, view);
  const search = page.getByRole("combobox"); await search.fill("old"); await expect(page.getByRole("option", { name: "Old" })).toBeVisible();
  const result = await page.evaluate(async () => { const api = document.querySelector(".cx-host").canopyx; await api.sort("name", "desc"); return await window.childReload; });
  expect(result).toBe(false); await expect(search).toHaveAttribute("aria-expanded", "false"); await expect(page.getByRole("option", { name: "Old" })).toBeHidden();
});

test("the generated host accepts global order, retains its view on failure, and pages filtered results", async ({ page }) => {
  await openExample(page, "query-records.html");
  const value = page.getByRole("columnheader", { name: "Value", exact: true });
  await value.getByRole("button").click(); await expect(value).toHaveAttribute("aria-sort", "ascending");
  await value.getByRole("button").click(); await expect(value).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator('[data-cx-id="record-60"]')).toBeVisible();
  await page.getByLabel("Fail next request").check(); await page.getByLabel("Flagged records", { exact: true }).check();
  await expect(page.locator("#query-status")).toContainText("could not read"); await expect(page.getByLabel("Flagged records", { exact: true })).not.toBeChecked();
  await expect(page.locator('[data-cx-id="record-59"]')).toBeVisible();
  await page.getByLabel("Flagged records", { exact: true }).check(); await expect(page.locator('[data-cx-id="record-45"]')).toBeVisible();
  await expect(page.locator('[data-cx-id="record-59"]')).toHaveCount(0);
  await page.locator(".cx-status").click(); await expect(page.locator('[data-cx-id="record-27"]')).toBeVisible();
  await page.getByRole("button", { name: "Reload snapshot" }).click(); await expect(page.locator("#query-status")).toHaveText("Accepted records-2.");
  await expect(page.locator('[data-cx-id="record-60"]')).toContainText("160");
});
