import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, viewPage, nextFrames, openGridControl } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const tuple = (columns, values, exclude = false) => ({ columns: columns.map(column => typeof column === "string" ? { column } : column), values, exclude });
const pairs = tuple(["a", "b"], [["North", "Open"], ["South", "Closed"]]);
const rows = [
  ["North", "Open", 5], ["North", "Closed", 15], ["South", "Open", 25], ["South", "Closed", 35],
  [null, "Open", 45], ["north", "Open", 55], ["", "Open", 65], [true, "Open", 75]
].map(([a, b, amount], index) => ({ id: "r" + index, cells: { a, b, amount, date: index % 2 ? "2026-02-01T00:00:00Z" : "2026-01-01T02:00:00+02:00" } }));
function definition(extra = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "tuples", label: "Records", source: { kind: "inline" },
    pageSize: 100, selection: "multiple", search: true, rows,
    columns: [{ id: "a", title: "Region", kind: "text", sortable: true }, { id: "b", title: "Status", kind: "text", sortable: true },
      { id: "amount", title: "Amount", kind: "number", sortable: true }, { id: "date", title: "Date", kind: "datetime", sortable: true },
      { id: "private", title: "Private", kind: "text", filterable: false }], ...extra };
}
async function open(page, view = definition(), setup = "") {
  await page.route("http://canopyx.test/tuples", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/tuples"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready"); await nextFrames(page);
}
const set = (page, query) => page.evaluate(query => document.querySelector("[data-canopyx-host]").canopyx.setQuery(query), query);
const ids = page => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId));
const exported = (page, scope = "filtered") => page.evaluate(async scope => {
  const captured = document.querySelector("[data-canopyx-host]").canopyx.prepareExport({ scope }), ids = [];
  for await (const row of captured.rows()) ids.push(row.id);
  return { ids, query: captured.request.query };
}, scope);

test("exact correlated tuples reject cross-pairs and case folding before paging and export", async ({ page }) => {
  await open(page, definition({ presentation: "paged", pageLength: 1 }));
  await set(page, { tupleFilters: [pairs], sort: [{ column: "amount", direction: "desc" }] });
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "3");
  expect(await ids(page)).toEqual(["r3"]);
  expect((await exported(page)).ids).toEqual(["r3", "r0"]);
  await page.evaluate(api + ".nextPage()"); expect(await ids(page)).toEqual(["r0"]);
  // Changing only tuples must invalidate the inline ordering and page caches.
  await set(page, { tupleFilters: [tuple(["a", "b"], [["North", "Closed"]])] });
  expect((await exported(page)).ids).toEqual(["r1"]);
  await set(page, { tupleFilters: [pairs, tuple(["amount"], [[35]])], search: "Closed",
    filters: [{ column: "amount", operator: "gt", values: [10] }],
    filterGroup: { operator: "or", filters: [{ column: "b", operator: "eq", values: ["Closed"] }], groups: [] } });
  expect((await exported(page)).ids).toEqual(["r3"]);
});

test("exclusion complements membership including explicit null, missing cells and typed boolean values", async ({ page }) => {
  const view = definition(); view.rows = [...rows, { id: "r8", cells: { b: "Open", amount: 85, date: null } }];
  await open(page, view);
  await set(page, { tupleFilters: [tuple(["a", "b"], [[null, "Open"], [true, "Open"], ["", "Open"]])] });
  expect((await exported(page)).ids).toEqual(["r4", "r6", "r7", "r8"]);
  await set(page, { tupleFilters: [tuple(["a", "b"], [["North", "Open"], ["South", "Closed"]], true)] });
  expect((await exported(page)).ids).toEqual(["r1", "r2", "r4", "r5", "r6", "r7", "r8"]);
  await set(page, { tupleFilters: [tuple(["a"], [[null]], true)] });
  expect((await exported(page)).ids).toEqual(["r0", "r1", "r2", "r3", "r5", "r6", "r7"]);
  await set(page, { tupleFilters: [tuple(["a"], [["true"]])] }); expect((await exported(page)).ids).toEqual([]);
});

test("date tuple fields compare normalized instants while retaining the original operands", async ({ page }) => {
  await open(page);
  const value = tuple(["date", "b"], [["2026-01-01T00:00:00Z", "Open"]]);
  await set(page, { tupleFilters: [value] });
  expect((await exported(page)).ids).toEqual(["r0", "r2", "r4", "r6"]);
  expect((await page.evaluate(api + ".getQuery()")).tupleFilters).toEqual([value]);
});

test("numeric and calendar tuple buckets trigger lazy loading on both initial and replacement queries", async ({ page }) => {
  const bucketSource = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-buckets.js"), "utf8");
  const version = bucketSource.match(/version\s*:\s*"([a-f0-9]{16})"/)[1];
  const inert = `const part=document.createElement('script');part.type='application/x-canopyx-buckets';part.dataset.cxVersion='${version}';part.textContent=${JSON.stringify(bucketSource)};document.head.appendChild(part);`;
  const month = tuple([{ column: "date", bucket: { kind: "month" } }, "b"], [[24300, "Open"]]);
  await open(page, definition({ rows: [...rows, { id: "missing", cells: { date: null, b: "Open", amount: null } }] }), inert);
  await set(page, { tupleFilters: [month] });
  expect((await exported(page)).ids).toEqual(["r0", "r2", "r4", "r6"]);
  expect((await page.evaluate(api + ".getQuery()")).tupleFilters[0].columns[0].bucket).toEqual({ kind: "month", timeZone: "UTC", firstWeekday: 1 });
  await set(page, { tupleFilters: [tuple(month.columns, [[null, "Open"]])] });
  expect((await exported(page)).ids).toEqual(["missing"]);
  const interval = tuple([{ column: "amount", bucket: { kind: "width", width: 20 } }, "b"], [[0, "Open"], [1, "Closed"]]);
  await open(page, definition({ query: { tupleFilters: [interval] } }), inert);
  expect((await exported(page)).ids).toEqual(["r0", "r3"]);
});

test("facets drop an entire referenced tuple and retain independent tuples; atomic column edits are locked", async ({ page }) => {
  const view = definition({ reporting: { facetColumns: ["a", "b", "amount"] }, facets: { position: "top", columns: ["a", "b"] } });
  const independent = tuple(["amount"], [[5], [15], [25], [35]]);
  view.query = { tupleFilters: [pairs, independent] };
  await open(page, view);
  const projection = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    return { full: await grid.getFacets("a", { includeCurrentFilter: true }),
      projected: await grid.getFacets("a", { includeCurrentFilter: false }) };
  });
  expect(projection.full.matched).toBe(2); expect(projection.projected.matched).toBe(4);
  expect(projection.projected.items.map(item => [item.value, item.count])).toEqual([["North", 2], ["South", 2]]);
  await expect(page.locator(".cx-facet-val input").first()).toBeDisabled();
  await page.getByRole("button", { name: "Filter Region", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Region: Filter…" });
  await expect(dialog).toContainText("mixed condition group");
  expect((await page.evaluate(api + ".getQuery()")).tupleFilters).toEqual([pairs, independent]);
  await page.keyboard.press("Escape");
  // Replacing only tuples refreshes the facet panel's cache shape.
  await set(page, { tupleFilters: [tuple(["amount"], [[55]])] });
  await expect(page.locator(".cx-facet-val")).toContainText(["north", "Open"]);
});

test("tuple chips and Clear all remove atomic criteria; all/selected export scopes clear them", async ({ page }) => {
  await open(page, definition({ query: { tupleFilters: [pairs] } }));
  await expect(page.getByRole("button", { name: "Filter Region", exact: true })).toHaveAttribute("data-cx-filtered", "true");
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    grid.setSelection(["r0", "r1"]);
    const filtered = grid.prepareExport({ scope: "filtered" }), all = grid.prepareExport({ scope: "all" }), selected = grid.prepareExport({ scope: "selected" });
    return { filtered: filtered.request.query, all: all.request.query, selected: selected.request.query };
  });
  expect(result.filtered.tupleFilters).toEqual([pairs]); expect(result.all).not.toHaveProperty("tupleFilters"); expect(result.selected).not.toHaveProperty("tupleFilters");
  expect((await exported(page, "all")).ids).toHaveLength(8); expect((await exported(page, "selected")).ids).toEqual(["r0", "r1"]);
  await page.locator('[data-cx-condition="tuple-0"]').click();
  await expect.poll(() => page.evaluate(api + ".getQuery().tupleFilters || null")).toBeNull();
  expect((await exported(page)).ids).toHaveLength(8);
  await set(page, { tupleFilters: [pairs], filters: [{ column: "amount", operator: "ge", values: [0] }] });
  await page.locator('[data-cx-condition="clear"]').click();
  await expect.poll(() => page.evaluate(api + ".getQuery().tupleFilters || null")).toBeNull();
  expect((await exported(page)).ids).toHaveLength(8);
  await set(page, { tupleFilters: [pairs] }); await openGridControl(page, "filters");
  await page.getByRole("button", { name: "Clear all filters", exact: true }).click();
  await expect.poll(() => page.evaluate(api + ".getQuery().tupleFilters || null")).toBeNull();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await set(page, { tupleFilters: [tuple(["a"], [["No such region"]])] });
  await page.locator(".cx-state .acts button").click();
  await expect.poll(() => page.evaluate(api + ".getQuery().tupleFilters || null")).toBeNull();
  await page.evaluate(api + ".resetView()");
  expect((await page.evaluate(api + ".getQuery()")).tupleFilters).toEqual([pairs]);
});

test("host requests echo frozen canonical tuples through sorting, saved views, state and filtered exports", async ({ page }) => {
  const view = definition({ source: { kind: "host" }, rows: undefined, query: { tupleFilters: [pairs] } });
  await open(page, view, `window.requests=[];CanopyX.configure('tuples',{source:{query(query){requests.push({query,frozen:Object.isFrozen(query.tupleFilters)&&Object.isFrozen(query.tupleFilters[0].columns[0])&&Object.isFrozen(query.tupleFilters[0].values[0])});return {protocol:'canopyx/2',type:'gridPage',view:'tuples',revision:'host',offset:query.offset,total:8,matched:1,items:${JSON.stringify([rows[0]])}};}}});`);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    grid.saveView("Correlated"); const state = grid.getState();
    await grid.sort([{ column: "amount", direction: "desc" }]); await grid.toCsv({ scope: "filtered" });
    await grid.applySavedView("Correlated"); await grid.setState(state);
    return { requests, query: grid.getQuery() };
  });
  expect(result.requests.length).toBeGreaterThanOrEqual(5);
  for (const request of result.requests) { expect(request.query.tupleFilters).toEqual([pairs]); expect(request.frozen).toBe(true); }
  expect(result.query.tupleFilters).toEqual([pairs]);
});

test("bounded tuple validation rejects atomically and empty optional tuple filters preserve old query shapes", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, before = grid.getQuery();
    const make = (columns = [{ column: "a" }], values = [["North"]]) => ({ columns, values });
    const invalid = [null, {}, Array(9).fill(make()), [make([])], [make(Array(7).fill({ column: "a" }), [Array(7).fill("North")])],
      [make(undefined, [])], [make(undefined, Array(201).fill(["North"]))], [make(undefined, [["North", "Open"]])],
      [make([{ column: "private" }])], [make([{ column: "missing" }])], [make([{ column: "amount" }], [["5"]])],
      [make([{ column: "date" }], [["2026-01-01"]])], [{ ...make(), exclude: "false" }], [make(undefined, [[undefined]])],
      [make([{ column: "amount", bucket: { kind: "width", width: 10 } }], [["0"]])], [make(undefined, [[{ value: "North" }]])]];
    const failures = [];
    for (const tupleFilters of invalid) { try { await grid.setQuery({ tupleFilters }); failures.push(false); } catch (_) { failures.push(true); } }
    const unchanged = JSON.stringify(before) === JSON.stringify(grid.getQuery());
    const input = { columns: [{ column: "a" }], values: [[null]] };
    await grid.setQuery({ tupleFilters: [input] }); input.values[0][0] = "North";
    const copied = grid.getQuery().tupleFilters[0].values[0][0] === null, defaultExclude = grid.getQuery().tupleFilters[0].exclude;
    const state = grid.getState(); state.query = { ...state.query, tupleFilters: [] }; await grid.setState(state);
    return { failures, unchanged, copied, defaultExclude, omitted: !Object.hasOwn(grid.getQuery(), "tupleFilters") };
  });
  expect(result.failures).toEqual(Array(16).fill(true));
  expect(result).toMatchObject({ unchanged: true, copied: true, defaultExclude: false, omitted: true });
});

test("strict saved-state reads accept tuple bounds and reject unknown tuple and field semantics", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const columns = ["a", "b", "amount", "date", "a", "amount"].map(column => ({ column }));
    const values = Array.from({ length: 200 }, () => ["North", "Open", 5, "2026-01-01T00:00:00Z", "North", 5]);
    const state = grid.getState(); state.query = { ...state.query, tupleFilters: Array.from({ length: 8 }, () => ({ columns, values, exclude: false })) };
    await grid.setState(state);
    const before = JSON.stringify(grid.getState()), failures = [];
    for (const field of [false, true]) {
      const invalid = structuredClone(grid.getState()), target = invalid.query.tupleFilters[0];
      (field ? target.columns[0] : target).futureSemantics = true;
      try { await grid.setState(invalid); failures.push(false); } catch (_) { failures.push(true); }
    }
    return { count: grid.getQuery().tupleFilters.length, failures, unchanged: before === JSON.stringify(grid.getState()) };
  });
  expect(result).toEqual({ count: 8, failures: [true, true], unchanged: true });
  expect((await exported(page)).ids).toEqual(["r0"]);
});

test("cursor navigation and filtered export retain tuple criteria on every host request", async ({ page }) => {
  const view = definition({ source: { kind: "host", navigation: "cursor" }, rows: undefined,
    presentation: "paged", pageLength: 1, query: { tupleFilters: [pairs] } });
  await open(page, view, `window.requests=[];CanopyX.configure('tuples',{source:{navigation:'cursor',query(query){requests.push(query);
    const index=query.cursor==='second'?1:0,rows=${JSON.stringify([rows[0], rows[3]])};
    return {protocol:'canopyx/2',type:'gridCursorPage',view:'tuples',revision:'host',offset:index,total:8,matched:2,
      items:[rows[index]],...(index?{previousCursor:'first'}:{nextCursor:'second'})};}}});`);
  expect(await ids(page)).toEqual(["r0"]);
  await page.evaluate(api + ".nextPage()"); expect(await ids(page)).toEqual(["r3"]);
  expect((await exported(page)).ids).toEqual(["r0", "r3"]);
  const requests = await page.evaluate("requests");
  expect(requests.length).toBeGreaterThanOrEqual(4);
  for (const request of requests) { expect(request.type).toBe("gridCursorQuery"); expect(request).not.toHaveProperty("offset"); expect(request.tupleFilters).toEqual([pairs]); }
});

test("ordered compact data waits for all chunks before evaluating a tuple-only query", async ({ page }) => {
  const view = definition({ rows: undefined, pageSize: 1, rowData: { version: 1, columns: ["a", "b", "amount", "date"],
    count: 3, ordered: true, base: "data/", chunks: 2 } });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const payloads = [[rows[0]], [rows[1], rows[3]]].map(chunk => chunk.map(row => [row.id, row.cells.a, row.cells.b, row.cells.amount, row.cells.date]));
  await page.route("http://canopyx.test/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/tuples") return route.fulfill({ contentType: "text/html", body: viewPage(view) });
    const index = Number(/rows\/(\d)\.js$/.exec(pathname)?.[1]);
    if (index === 1) await held;
    return route.fulfill({ contentType: "text/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(['tuples','rows/${index}',${JSON.stringify(JSON.stringify(payloads[index]))}]);` });
  });
  await page.goto("http://canopyx.test/tuples", { waitUntil: "domcontentloaded" }); await page.waitForSelector("[data-cx-ready]");
  const pending = set(page, { tupleFilters: [tuple(["a", "b"], [["South", "Closed"]])] });
  await expect(page.getByRole("grid")).toHaveAttribute("aria-busy", "true");
  release(); await pending;
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "2");
  expect((await exported(page)).ids).toEqual(["r3"]);
});
