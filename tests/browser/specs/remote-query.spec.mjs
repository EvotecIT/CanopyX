import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "query", title: "Query records", pageSize: 2, selection: "multiple",
  columns: [{ id: "name", title: "Name", width: 230, sortable: true }, { id: "value", title: "Value", width: 120, sortable: true, kind: "number" }],
  filters: [{ id: "flagged", label: "Flagged", flag: "flagged" }], source: { kind: "inline" }, roots: [] };

async function open(page) {
  await page.route("https://query.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://query.test/"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}

test("host order, global filtering, and cursors follow the accepted query without client reordering", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); const calls = [];
    const rows = [{ id: "c", label: "C", cells: { value: 3 } }, { id: "a", label: "A", cells: { value: 1 } }, { id: "b", label: "B", cells: { value: 2 } }];
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
      calls.push({ cursor, query: request.query, revision: request.revision, frozen: Object.isFrozen(request.query) && Object.isFrozen(request.query.filters) });
      const all = request.query.filters.length ? [rows[1]] : request.query.sort ? [rows[2], rows[0], rows[1]] : rows;
      const offset = Number(cursor || 0); return { items: all.slice(offset, offset + 2), offset, total: all.length, next: offset + 2 < all.length ? String(offset + 2) : null, revision: "r" + (request.query.filters.length ? 3 : request.query.sort ? 2 : 1) };
    } } }); await api.ready; await api.loadMore(null); await api.sort("value", "desc");
    const sorted = api.visibleRows().map(row => row.node.id); await api.loadMore(null);
    const paged = api.visibleRows().map(row => row.node.id); await api.setFilterActive("flagged", true);
    const filtered = api.visibleRows().map(row => row.node.id); api.setFilter(() => true);
    return { sorted, paged, filtered, active: api.getActiveFilters(), query: api.getQuery(), calls };
  }, view);
  expect(result.sorted).toEqual(["b", "c"]); expect(result.paged).toEqual(["b", "c", "a"]);
  expect(result.filtered).toEqual(["a"]); expect(result.active).toEqual(["flagged"]);
  expect(result.query).toEqual({ version: 1, sort: { column: "value", direction: "desc" }, filters: ["flagged"] });
  expect(result.calls.map(call => call.cursor)).toEqual([null, "2", null, "2", null]);
  expect(result.calls[3].revision).toBe("r2"); expect(result.calls.every(call => call.frozen)).toBe(true);
});

for (const failure of ["transport", "revision", "duplicate", "aborted"]) {
  test(`a ${failure} query failure leaves data, selection and accepted controls intact`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ data, failure }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let pending = false;
      const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
        if (!request.query.sort) return { items: [{ id: "old", label: "Old" }], next: null, revision: "r1" };
        pending = true;
        if (failure === "aborted") return new Promise(() => {});
        if (failure === "transport") throw new Error("offline");
        return { items: failure === "duplicate" ? [{ id: "new", label: "New", children: [{ id: "new", label: "Duplicate" }] }] : [{ id: "new", label: "New" }], next: null, ...(failure === "revision" ? {} : { revision: "r2" }) };
      } } }); await api.ready; api.setSelection(["old"]); const before = api.getSelected()[0];
      const controller = new AbortController(); let error = null;
      const promise = api.setQuery({ version: 1, sort: { column: "name", direction: "asc" }, filters: [] }, { signal: controller.signal }).catch(e => { error = e.message; return false; });
      if (failure === "aborted") controller.abort();
      const accepted = await promise;
      return { pending, accepted, error, ids: api.visibleRows().map(row => row.node.id), same: before === api.getSelected()[0], query: api.getQuery(), aria: host.querySelector('[data-cx-column="name"]').getAttribute("aria-sort") };
    }, { data: view, failure });
    expect(result.pending).toBe(true); expect(result.accepted).toBe(false); expect(result.ids).toEqual(["old"]); expect(result.same).toBe(true);
    expect(result.query).toEqual({ version: 1, sort: null, filters: [] }); expect(result.aria).toBe("none");
    if (failure !== "aborted") expect(result.error).toBeTruthy();
  });
}

test("a newer query retires stalled query, page, search, counts and navigation consumers", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); const calls = [];
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true,
      page: async (node, cursor, request) => {
        calls.push(request.signal);
        if (cursor || request.query.sort && request.query.sort.direction === "asc") return new Promise(() => {});
        return { items: [{ id: request.query.sort ? "new" : "old", label: "Row" }], next: request.query.sort ? null : "later", revision: request.query.sort ? "r2" : "r1" };
      }, search: () => new Promise(() => {}), counts: () => new Promise(() => {})
    } }); await api.ready;
    const nav = api.expandPath(["missing"]); const search = api.search("row").catch(e => e.name); const counts = api.refreshCounts(["old"]);
    const oldQuery = api.sort("name", "asc"); const newer = api.sort("name", "desc");
    return { accepted: await newer, retired: await oldQuery, nav: await nav, search: await search, counts: await counts,
      signals: calls.map(signal => signal.aborted), ids: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result.accepted).toBe(true); expect(result.retired).toBe(false); expect(result.nav).toBeNull(); expect(result.search).toBe("AbortError"); expect(result.counts).toBeNull();
  expect(result.signals.every(Boolean)).toBe(true); expect(result.ids).toEqual(["new"]);
});

for (const operation of ["page", "child", "search", "counts", "push"]) {
  test(`${operation} rejects a different snapshot before mutating accepted data`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ data, operation }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let error = null;
      host.addEventListener("canopyx:error", event => { error = event.detail.message; });
      const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true,
        page: async (node, cursor) => !node && !cursor ? { items: [{ id: "old", label: "Old", hasChildren: true }], next: "more", revision: "r1" } : { items: [{ id: "wrong", label: "Wrong" }], next: null, revision: "r2" },
        search: async () => ({ hits: [{ path: ["wrong"], label: "Wrong" }], revision: "r2" }),
        counts: async () => ({ protocol: "canopyx/2", type: "counts", items: [{ id: "old", cells: { name: "Wrong" } }], revision: "r2" })
      } }); await api.ready; api.setSelection(["old"]);
      try {
        if (operation === "page") await api.loadMore(null);
        else if (operation === "child") await api.expandPath(["old"], { expandLast: true, select: false });
        else if (operation === "search") await api.search("wrong");
        else if (operation === "counts") await api.refreshCounts(["old"]);
        else api.applyCounts({ protocol: "canopyx/2", type: "counts", revision: "r2", items: [{ id: "old", cells: { name: "Wrong" } }] });
      } catch (failure) { error = failure.message; }
      return { ids: api.visibleRows().map(row => row.node.id), cells: api.getSelected()[0].cells, error, notices: host.textContent };
    }, { data: view, operation });
    expect(result.ids).toEqual(["old"]); expect(result.cells).toBeUndefined();
    expect(result.error || result.notices).toContain("dataset revision changed");
  });
}

test("root reload reads the accepted loaded range into a new revision and retires old lazy children", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let revision = "r1"; const calls = [];
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
      calls.push([node && node.id, cursor, request.revision]);
      if (node) return { items: [{ id: revision + "-child", label: "Child" }], next: null, revision };
      const offset = Number(cursor || 0); return { items: [{ id: "p" + offset, label: "Parent", hasChildren: true }], offset, total: 2, next: offset ? null : "1", revision };
    } } }); await api.ready; await api.loadMore(null); await api.expandPath(["p0"], { expandLast: true });
    api.setSelection(["p1", "r1-child"]); revision = "r2"; await api.reload(null);
    return { ids: api.visibleRows().map(row => row.node.id), selected: api.getSelected().map(node => node.id), calls };
  }, view);
  expect(result.ids).toEqual(["p0", "r2-child", "p1"]); expect(result.selected).toEqual(["p1"]);
  expect(result.calls.slice(-3)).toEqual([[null, null, null], [null, "1", "r2"], ["p0", null, "r2"]]);
});

test("saved presentation waits for its remote query, and failed queries do not resize or filter the old view", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let fail = false; const calls = [];
    const api = CanopyX.createTreeGrid(host, { view: data, source: { queryAware: true, page: async (node, cursor, request) => {
      calls.push(request.query); if (fail) throw new Error("offline");
      return { items: [{ id: "row", label: "Row" }], next: null, revision: "r1" };
    } } }); await api.ready; const saved = api.getState(); saved.sort = { column: "name", direction: "desc" }; saved.filters = ["flagged"]; saved.columns[1].width = 330;
    const restored = await api.setState(saved); const before = api.getState(); fail = true;
    const rejected = { ...saved, sort: null, filters: [], columns: saved.columns.map(column => ({ ...column, width: 440 })) };
    let error = null; try { await api.setState(rejected); } catch (failure) { error = failure.message; }
    return { restored, before, after: api.getState(), error, calls };
  }, view);
  expect(result.restored).toBe(true); expect(result.before.columns[1].width).toBe(330); expect(result.after).toEqual(result.before); expect(result.error).toContain("offline");
  expect(result.calls[1]).toEqual({ version: 1, sort: { column: "name", direction: "desc" }, filters: ["flagged"] });
});

test("HTTP endpoints receive encoded query and revision in page, search and count requests", async ({ page }) => {
  const requests = [];
  const remote = { ...view, search: { minLength: 1, maxResults: 10 }, source: { kind: "remote", queryAware: true,
    children: "/children?ref={ref}&cursor={cursor}&view={viewQuery}&revision={revision}", search: "/search?q={query}&limit={limit}&view={viewQuery}&revision={revision}", counts: "/counts?ids={ids}&view={viewQuery}&revision={revision}" } };
  delete remote.roots;
  await page.route("https://query.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: viewPage(remote) });
    requests.push({ path: url.pathname, query: JSON.parse(url.searchParams.get("view")), revision: url.searchParams.get("revision"), ids: url.searchParams.get("ids") });
    const body = url.pathname === "/children" ? { type: "page", parent: null, offset: 0, items: [{ id: "a,b", label: "Row" }], next: null } :
      url.pathname === "/search" ? { type: "search", query: url.searchParams.get("q"), hits: [{ path: ["a,b"], label: "Row" }], truncated: false } : { type: "counts", items: [{ id: "a,b", cells: { name: "Updated" } }] };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ protocol: "canopyx/2", revision: "rev/😀", ...body }) });
  });
  await page.goto("https://query.test/"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => { const api = document.querySelector(".cx-host").canopyx; await api.sort("name", "desc"); await api.search("row"); await api.refreshCounts(["a,b"]); api.setSelection(["a,b"]); return api.getSelected()[0].cells; });
  expect(result).toEqual({ name: "Updated" }); expect(requests.map(request => request.path)).toEqual(["/children", "/children", "/search", "/counts"]);
  expect(requests.slice(1).every(request => request.query.sort.direction === "desc")).toBe(true);
  expect(requests.slice(2).every(request => request.revision === "rev/😀")).toBe(true); expect(requests[3].ids).toBe("a%2Cb");
});
