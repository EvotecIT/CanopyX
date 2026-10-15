// Simple init (docs/enhance.md): grids from records with field paths and render functions, from a URL read once, and from a
// server asked for every query; kinds read from values; state saved with a duration or in the address; short texts.
import { expect, test } from "@playwright/test";
import { exampleUrl } from "./support.mjs";
import { ORIGIN, ready, rowIds, servePage } from "./enhance-support.mjs";

const build = (page, source, name = "grid") => page.evaluate(([source, name]) =>
  new Function("return (" + source + ");")().then(grid => { window[name] = grid; }), [source, name]);
const info = page => page.locator(".cx-grid-page-range");

test("records with field paths and render functions give display, sort, search and type values", async ({ page }) => {
  await page.goto(exampleUrl("enhance-data.html"));
  await ready(page, "projectsGrid");
  const first = page.locator("#projects .cx-row[data-cx-id]").first();
  await expect(first).toContainText("€99,109");
  const state = await page.evaluate(() => ({ kinds: projectsGrid.view.columns.map(column => column.kind), sort: projectsGrid.getQuery().sort,
    first: projectsGrid.getRows("page")[0].name }));
  expect(state).toEqual({ kinds: ["text", "text", "text", "number", "datetime", "text"], sort: [{ column: "budget", direction: "desc" }], first: "Project L" });
  // The render returns the raw number for search, so the digits find the row; the date displays as written by render.
  await page.evaluate(() => projectsGrid.setQuery({ ...projectsGrid.getQuery(), search: "99109", revision: undefined }));
  expect(await page.evaluate(() => projectsGrid.getRows("filtered").map(record => record.id))).toEqual(["p12"]);
  await expect(page.locator("#projects .cx-row[data-cx-id='p12']")).toContainText("Dec 12, 2026");
});

test("a state kept in the address restores the sort, search and page of a shared link", async ({ page }) => {
  await page.goto(exampleUrl("enhance-data.html"));
  await ready(page, "projectsGrid");
  await page.evaluate(() => projectsGrid.sort([{ column: "owner.name", direction: "asc" }]));
  await page.evaluate(() => projectsGrid.goToPage(2));
  await page.waitForFunction(() => {
    const text = new URLSearchParams(location.hash.slice(1)).get("projects"), state = text && JSON.parse(text);
    return state?.s?.length === 1 && state.s[0][0] === "owner.name" && state.s[0][1] === "asc" && state.o === 20;
  });
  const shared = await page.evaluate(() => location.href);
  expect(decodeURIComponent(new URL(shared).hash)).toContain('"s":[["owner.name","asc"]]');
  const fresh = await page.context().newPage();
  await fresh.goto(shared);
  await ready(fresh, "projectsGrid");
  expect(await fresh.evaluate(() => ({ sort: projectsGrid.getQuery().sort, page: projectsGrid.getPaging().pageIndex }))).toEqual({ sort: [{ column: "owner.name", direction: "asc" }], page: 2 });
  await fresh.close();
});

test("a URL source with declared columns shows the loading state, then its rows; Retry reads it again after a failure", async ({ page }) => {
  await servePage(page, "<div id='orders'></div>");
  let calls = 0, release;
  const requests = [];
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(ORIGIN + "/api/orders*", async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, body: "busy" });
    await gate;
    const url = new URL(route.request().url());
    requests.push([route.request().method(), url.searchParams.get("region")]);
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ payload: { region: url.searchParams.get("region"),
      rows: Array.from({ length: 30 }, (_, index) => ({ number: "SO-" + (100 + index), total: index * 10.5 })) } }) });
  });
  await build(page, "CanopyX.grid('#orders', { label: 'Orders', pageLength: 10, rowId: 'number', url: { url: '/api/orders', data: { region: 'north' }, dataSrc: 'payload.rows' }," +
    " columns: [{ data: 'number', title: 'Order', type: 'text' }, { data: 'total', title: 'Total', type: 'number' }] })");
  await expect(page.locator(".cx-grid-retry")).toBeVisible();
  await page.locator(".cx-grid-retry").click();
  await expect(page.locator(".cx-initial-skeleton")).toBeVisible();
  release();
  await expect(info(page)).toHaveText("Showing 1 to 10 of 30 rows");
  expect(calls).toBe(2);
  expect(requests).toEqual([["GET", "north"]]);
  expect((await rowIds(page)).slice(0, 2)).toEqual(["SO-100", "SO-101"]);
});

test("without columns a URL source is read first and its first record names the columns", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  await page.route(ORIGIN + "/people.json", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify([{ name: "Ada", joined: "2024-03-01", score: 12 }, { name: "Bruno", joined: "2023-11-20", score: 7 }]) }));
  await build(page, "CanopyX.grid('#people', { url: '/people.json', order: [['score', 'asc']] })");
  await ready(page);
  expect(await page.evaluate(() => grid.view.columns.map(column => [column.id, column.title, column.kind]))).toEqual([["name", "name", "text"], ["joined", "joined", "datetime"], ["score", "score", "number"]]);
  expect(await page.evaluate(() => grid.getRows("page").map(record => record.name))).toEqual(["Bruno", "Ada"]);
});

test("server processing posts each canopyx/2 query and maps a plain answer through the columns", async ({ page }) => {
  await servePage(page, "<div id='events'></div>");
  const requests = [];
  const all = Array.from({ length: 230 }, (_, index) => ({ id: "e" + index, source: index % 2 ? "Gateway" : "Backup", code: index }));
  await page.route(ORIGIN + "/api/events/query", route => {
    const query = JSON.parse(route.request().postData());
    requests.push(query);
    const rows = all.filter(item => !query.search || item.source.toLowerCase().includes(query.search.toLowerCase()));
    if (query.sort[0]?.direction === "desc") rows.reverse();
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ total: all.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }) });
  });
  await build(page, "CanopyX.grid('#events', { label: 'Events', rowId: 'id', pageLength: 20, url: { url: '/api/events/query', serverSide: true, headers: { 'X-Tenant': 'demo' }, data: q => ({ tenant: 'demo' }) }," +
    " columns: [{ data: 'source', title: 'Source', type: 'text' }, { data: 'code', title: 'Code', type: 'number' }] })");
  await ready(page);
  await expect(info(page)).toHaveText("Showing 1 to 20 of 230 rows");
  expect(requests[0]).toMatchObject({ protocol: "canopyx/2", type: "gridQuery", offset: 0, limit: 20, search: "", tenant: "demo" });
  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await expect(info(page)).toHaveText("Showing 41 to 60 of 230 rows");
  expect(requests.at(-1)).toMatchObject({ offset: 40, limit: 20 });
  await page.evaluate(() => grid.setQuery({ ...grid.getQuery(), search: "gateway", offset: 0, revision: undefined }));
  await expect(info(page)).toHaveText("Showing 1 to 20 of 115 rows (filtered from 230)");
  expect(await page.evaluate(() => grid.getRows("page").length)).toBe(20);
  await expect(page.evaluate(() => grid.addRows([{ id: "x" }]))).rejects.toThrow(/server/);
});

test("kinds come from the values: grouped numbers, units, decimal marks of the page language and ISO dates", async ({ page }) => {
  const table = lang => "<table id='values'><thead><tr><th>Amount</th><th>Share</th><th>Date</th><th>Mixed</th><th>Label</th></tr></thead><tbody>" +
    [["1,234.5", "12 %", "2024-05-01", "3", "a"], ["€ 1.234,50", "-4 %", "2024-05-01T10:00:00+02:00", "2024-01-01", "b"], ["1 024", "−5 %", "2023-12-31T23:00Z", "7", "c"],
      ["980", "", "", "A12", "d"], [lang === "de" ? "1.500" : "1,500", "0.5 %", "2024-01-02", "1", "e"]]
      .map(cells => "<tr>" + cells.map(cell => "<td>" + cell + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  await servePage(page, table("en"));
  await build(page, "CanopyX.enhance('#values', { paging: false })");
  await ready(page);
  expect(await page.evaluate(() => grid.view.columns.map(column => column.kind))).toEqual(["number", "number", "datetime", "text", "text"]);
  await page.evaluate(() => grid.sort([{ column: "c0", direction: "asc" }]));
  expect(await page.evaluate(() => grid.getRows("filtered").map(record => record[0]))).toEqual(["980", "1 024", "1,234.5", "€ 1.234,50", "1,500"]);
  await page.evaluate(() => grid.sort([{ column: "c1", direction: "asc" }]));
  expect(await page.evaluate(() => grid.getRows("filtered").map(record => record[1]))).toEqual(["−5 %", "-4 %", "0.5 %", "12 %", ""]);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await servePage(page, table("de"), { lang: "de" });
  await build(page, "CanopyX.enhance('#values', { paging: false })");
  await ready(page);
  await page.evaluate(() => grid.sort([{ column: "c0", direction: "desc" }]));
  expect((await page.evaluate(() => grid.getRows("filtered").map(record => record[0])))[0]).toBe("1.500");
  // A declared kind keeps a cell it cannot read as text: shown as written, without a value, sorted last.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await servePage(page, "<table id='typed'><thead><tr><th data-type='number'>Size</th></tr></thead><tbody><tr><td>n/a</td></tr><tr><td>12</td></tr><tr><td>3</td></tr></tbody></table>");
  await build(page, "CanopyX.enhance('#typed', { order: [[0, 'asc']] })");
  await ready(page);
  expect(await page.evaluate(() => [grid.view.columns[0].kind, grid.getRows("filtered").map(record => record[0])])).toEqual(["number", ["3", "12", "n/a"]]);
  await expect(page.locator(".cx-row[data-cx-id='r1']")).toContainText("n/a");
});

test("stateSave keeps the view in session or local storage for its duration, or in the host's own store", async ({ page }) => {
  await servePage(page, "<div id='list'></div>");
  const create = options => build(page, "CanopyX.grid('#list', { id: 'list', data: Array.from({ length: 40 }, (_, i) => ({ id: 'n' + i, name: 'Item ' + i, size: i })), rowId: 'id', pageLength: 10, " + options + " })");
  await create("stateSave: { storage: 'local', duration: 60 }");
  await ready(page);
  await page.evaluate(() => grid.sort([{ column: "size", direction: "desc" }]));
  await page.evaluate(() => grid.destroy());
  await create("stateSave: { storage: 'local', duration: 60 }");
  await ready(page);
  expect(await page.evaluate(() => grid.getQuery().sort)).toEqual([{ column: "size", direction: "desc" }]);
  // An older state than the duration is not restored.
  await page.evaluate(() => { grid.destroy(); const key = Object.keys(localStorage).find(name => name.startsWith("cx:state:"));
    const saved = JSON.parse(localStorage.getItem(key)); saved.time -= 120000; localStorage.setItem(key, JSON.stringify(saved)); });
  await create("stateSave: { storage: 'local', duration: 60 }");
  await ready(page);
  expect(await page.evaluate(() => grid.getQuery().sort)).toEqual([]);
  await page.evaluate(() => { grid.destroy(); window.store = { list: { time: Date.now(), current: { version: 1, view: 'list', columns: [], timeZone: 'utc', selection: [], scrollTop: 0,
    query: { sort: [{ column: 'name', direction: 'desc' }], filters: [], search: 'Item 3' }, paging: { pageLength: 10, offset: 0 } }, views: [] } }; window.saves = 0; });
  await create("stateSave: { load: ({ view }) => new Promise(resolve => setTimeout(() => resolve(store[view]), 20)), save: ({ view, state }) => { store[view] = state; saves++; } }");
  await ready(page);
  expect(await page.evaluate(() => grid.getQuery())).toMatchObject({ search: "Item 3", sort: [{ column: "name", direction: "desc" }] });
  await page.evaluate(() => grid.setPageLength(25));
  await page.waitForFunction(() => saves > 0 && store.list.current.paging.pageLength === 25);
});

test("short texts relabel the pager and search box; the reporting runtime enhances too", async ({ page }) => {
  await servePage(page, "<table id='t'><thead><tr><th>Name</th><th>Size</th></tr></thead><tbody>" +
    Array.from({ length: 12 }, (_, i) => "<tr><td>N" + i + "</td><td>" + i + "</td></tr>").join("") + "</tbody><tfoot><tr><td>Sum</td><td>66</td></tr></tfoot></table>", { runtime: "reporting" });
  await build(page, "CanopyX.enhance('#t', { pageLength: 5, texts: { search: 'Find rows', info: 'Rows {first} to {last} of {count}', unknown: 'ignored' }," +
    " view: { reporting: { aggregates: [{ id: 'sum', column: 'c1', label: 'Sum', operation: 'sum' }] } } })");
  await ready(page);
  await expect(page.getByRole("searchbox", { name: "Find rows" })).toBeVisible();
  await expect(info(page)).toHaveText("Rows 1 to 5 of 12");
  // Declared aggregates take the footer's place.
  await expect(page.locator(".cx-enhanced-foot")).toHaveCount(0);
});

test("pager settings from .NET load the embedded pager part; a view's invalid pager reports an error and keeps the built-in pager", async ({ page }) => {
  const loads = [];
  page.on("request", request => { if (/canopyx-pager/.test(request.url())) loads.push(request.url()); });
  await page.goto(exampleUrl("paged-grid.html"));
  await page.waitForSelector(".cx-pages .cx-page");
  expect(await page.locator(".cx-rpp select option").allTextContents()).toEqual(["10", "25", "50", "All"]);
  await expect(info(page)).toHaveText("Showing 1 to 10 of 180 rows");
  expect(loads).toEqual([]);
  await servePage(page, "<div id='a'></div><div id='b'></div>");
  await page.evaluate(() => {
    const view = id => ({ protocol: "canopyx/2", type: "grid", id, label: id, source: { kind: "inline" }, pageSize: 50, selection: "none", search: true, presentation: "paged", pageLength: 5,
      columns: [{ id: "n", title: "N", kind: "number", sortable: true }], rows: Array.from({ length: 40 }, (_, i) => ({ id: "r" + i, cells: { n: i } })) });
    window.errors = [];
    window.a = CanopyX.createDataGrid(document.getElementById("a"), { view: { ...view("a"), pager: { numbers: 5, firstLast: false, info: "none", lengthMenu: false } } });
    window.b = CanopyX.createDataGrid(document.getElementById("b"), { view: { ...view("b"), pager: { numbers: 3 } }, onError: ({ error }) => errors.push(error.message) });
    return Promise.all([a.ready, b.ready.catch(() => {})]);
  });
  await page.waitForFunction(() => document.querySelector("#a .cx-pages .cx-page") && errors.length);
  expect(await page.evaluate(() => ({ first: document.querySelector("#a .cx-grid-pager button[aria-label='First page']").hidden, input: document.querySelector("#a .pg").hidden,
    range: document.querySelector("#a .cx-grid-page-range").hidden, menu: document.querySelector("#a .cx-rpp").hidden, pages: document.querySelectorAll("#a .cx-page").length,
    fallback: document.querySelector("#b .cx-grid-pager").hidden, error: errors[0] })), "five slots: pages 1 to 3, a gap and the last page").toEqual({ first: true, input: true, range: true, menu: true, pages: 4, fallback: false, error: "CanopyX: invalid pager numbers." });
});
