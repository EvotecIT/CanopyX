import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const filter = (column, operator, ...values) => ({ column, operator, values });
const group = (operator, filters = [], groups = []) => ({ operator, filters, groups });
const values = ["ALPHA", "alpha", "Beta", true, "true", false, null, undefined, "Beta", "ALPHA"];
const definition = { protocol: "canopyx/2", type: "grid", id: "facets", label: "Facet inventory", source: { kind: "inline" },
  rowHeight: 28, pageSize: 5, presentation: "paged", pageLength: 2, selection: "multiple", search: true,
  reporting: { facetColumns: ["category", "date"], headerFilters: true, filterGroups: true },
  columns: [{ id: "category", title: "Category", width: 180, kind: "text", sortable: true },
    { id: "amount", title: "Amount", width: 140, kind: "number" }, { id: "date", title: "Date", width: 200, kind: "datetime" }],
  rows: values.map((value, i) => ({ id: "r" + String(i).padStart(2, "0"), cells: { category: value, amount: i,
    date: i % 2 ? "2026-10-01T12:00:00Z" : "2026-10-01T14:00:00+02:00" } })) };

async function open(page, query = {}, setup = "", host = false) {
  const view = { ...definition, query, ...(host ? { source: { kind: "host" }, rows: undefined } : {}) };
  await page.route("http://canopyx.test/facets", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/facets"); await page.waitForSelector("[data-cx-ready]");
}
const facets = (page, column = "category", options = {}) => page.evaluate(({ column, options }) =>
  document.querySelector("[data-canopyx-host]").canopyx.getFacets(column, options), { column, options });
const buckets = page => page.items.map(item => [item.value, item.count]);

test("facets count the complete accepted query and retain raw boolean/text/missing identities", async ({ page }) => {
  await open(page); await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  const full = await facets(page);
  expect(full.matched).toBe(10); expect(full.totalValues).toBe(6); expect(full.truncated).toBe(false);
  expect(buckets(full)).toEqual([[false, 1], [true, 1], ["ALPHA", 3], ["Beta", 2], ["true", 1], [null, 2]]);
  expect(buckets(await facets(page, "date"))).toEqual([["2026-10-01T12:00:00.000Z", 10]]);
  const bounded = await facets(page, "category", { limit: 2 });
  expect(bounded.totalValues).toBe(6); expect(bounded.truncated).toBe(true); expect(buckets(bounded)).toEqual([[false, 1], [true, 1]]);
  expect(buckets(await facets(page, "category", { search: "ALp" }))).toEqual([["ALPHA", 3]]);
});

test("facet projection replaces current-column predicates by true within nested OR and keeps other applied conditions", async ({ page }) => {
  const query = { filters: [filter("amount", "ge", 2)],
    filterGroup: group("and", [], [group("or", [filter("category", "eq", "ALPHA"), filter("amount", "lt", 4)])]) };
  await open(page, query);
  const before = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery());
  expect(buckets(await facets(page))).toEqual([[true, 1], ["ALPHA", 1], ["Beta", 1]]);
  const projected = await facets(page, "category", { includeCurrentFilter: false });
  expect(projected.matched).toBe(8); expect(buckets(projected)).toEqual([[false, 1], [true, 1], ["ALPHA", 1], ["Beta", 2], ["true", 1], [null, 2]]);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery())).toEqual(before);
});

const hostSetup = `window.facetRequests=[];window.facetResolvers=[];
  CanopyX.configure('facets',{source:{query(q){return {protocol:'canopyx/2',type:'gridPage',view:'facets',revision:'snapshot',offset:q.offset,total:100,matched:100,
    items:Array.from({length:q.limit},(_,i)=>({id:'h'+(q.offset+i),cells:{category:'Host',amount:i}}))};},
    facet(request,{signal}){facetRequests.push({request,signal});return new Promise(resolve=>facetResolvers.push(resolve));}}});`;
const response = (request, patch = {}) => ({ protocol: "canopyx/2", type: "gridFacetPage", view: "facets", revision: "snapshot",
  column: request.column, search: request.search, includeCurrentFilter: request.includeCurrentFilter,
  matched: 100, totalValues: 1, truncated: false, items: [{ value: "Host", count: 100 }], ...patch });

test("host facet requests are explicit revisioned capabilities and stale work aborts even when the host ignores its signal", async ({ page }) => {
  await open(page, {}, hostSetup, true);
  await page.evaluate(() => { const grid = document.querySelector("[data-canopyx-host]").canopyx;
    window.facetResult = grid.getFacets("category", { includeCurrentFilter: false, search: "Host" }).catch(error => ({ error: error.name })); });
  await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(1);
  const captured = await page.evaluate(() => facetRequests[0].request);
  expect(captured.query.revision).toBe("snapshot"); expect(captured.includeCurrentFilter).toBe(false); expect(captured.search).toBe("Host");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "new" }));
  expect(await page.evaluate(() => facetResult)).toEqual({ error: "AbortError" });
  expect(await page.evaluate(() => facetRequests[0].signal.aborted)).toBe(true);
  await page.evaluate(value => facetResolvers[0](value), response(captured));
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().search)).toBe("new");
});

test("host responses reject mismatched snapshots, duplicate canonical values and contradictory counts", async ({ page }) => {
  await open(page, {}, hostSetup, true);
  for (const patch of [{ revision: "old" }, { totalValues: 2, items: [{ value: "A", count: 50 }, { value: "a", count: 50 }] },
    { items: [{ value: "Host", count: 1 }] }, { includeCurrentFilter: false }]) {
    const index = await page.evaluate(() => { const at = facetRequests.length;
      window.facetResult = document.querySelector("[data-canopyx-host]").canopyx.getFacets("category").catch(error => ({ error: error.message })); return at; });
    await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(index + 1);
    const request = await page.evaluate(index => facetRequests[index].request, index);
    await page.evaluate(({ index, value }) => facetResolvers[index](value), { index, value: response(request, patch) });
    expect((await page.evaluate(() => facetResult)).error).toContain("CanopyX:");
  }
});

test("invalid requests and missing host capabilities reject without deriving facet counts from loaded pages", async ({ page }) => {
  await open(page);
  for (const [column, options] of [["amount", {}], ["category", { limit: 201 }], ["category", { includeCurrentFilter: "false" }]])
    expect(await page.evaluate(async ({ column, options }) => {
      try { await document.querySelector("[data-canopyx-host]").canopyx.getFacets(column, options); return "accepted"; }
      catch (error) { return error.message; }
    }, { column, options })).toContain("CanopyX:");
  await open(page, {}, hostSetup.replace("facet(request,{signal})", "unsupported(request,{signal})"), true);
  expect(await page.evaluate(async () => { try { await document.querySelector("[data-canopyx-host]").canopyx.getFacets("category"); }
    catch (error) { return error.message; } })).toContain("explicit source capability");
});
