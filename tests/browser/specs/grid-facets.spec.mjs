import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";
import AxeBuilder from "@axe-core/playwright";

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

test("host facet counts must respect known accepted matched/total counts while unknown cursor counts stay supported", async ({ page }) => {
  const setup = hostSetup.replace("total:100,matched:100", "total:200,matched:100").replace("amount:i", "amount:i+2");
  await open(page, {filters:[filter('category','eq','Host'),filter('amount','ge',2)]}, setup, true);
  const attempts = [[true, 5, true], [true, 101, true], [false, 99, true], [false, 201, true], [false, 150, false]];
  for (const [index, [includeCurrentFilter, matched, rejected]] of attempts.entries()) {
    await page.evaluate(includeCurrentFilter => { window.facetResult = document.querySelector('[data-canopyx-host]').canopyx
      .getFacets('category', {includeCurrentFilter}).catch(error => ({error:error.message})); }, includeCurrentFilter);
    await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(index + 1);
    const request = await page.evaluate(index => facetRequests[index].request, index);
    const items = rejected ? [{value:'Host',count:matched}] : [{value:'Host',count:100},{value:'Other',count:50}];
    await page.evaluate(({index,value}) => facetResolvers[index](value), {index, value:response(request,{matched,totalValues:items.length,items})});
    const result = await page.evaluate(() => facetResult);
    if (rejected) expect(result.error).toContain('CanopyX:'); else expect(result.matched).toBe(150);
  }
  await open(page, {filters:[filter('amount','ge',2)],filterGroup:group('and',[filter('amount','lt',1000)])}, setup, true);
  await page.evaluate(() => {window.facetResult=document.querySelector('[data-canopyx-host]').canopyx.getFacets('category',{includeCurrentFilter:false})
    .catch(error=>({error:error.message}));});
  await expect.poll(()=>page.evaluate(()=>facetRequests.length)).toBe(1);
  const unchanged = await page.evaluate(()=>facetRequests[0].request);
  await page.evaluate(value=>facetResolvers[0](value),response(unchanged,{matched:150,items:[{value:'Host',count:150}]}));
  expect((await page.evaluate(()=>facetResult)).error).toContain('CanopyX:');
  const cursorView = {...definition,source:{kind:'host',navigation:'cursor'},rows:undefined};
  await page.evaluate(async view => { const host=document.querySelector('[data-canopyx-host]');host.canopyx.destroy();
    const grid=CanopyX.createDataGrid(host,{view,source:{query(q){return {protocol:'canopyx/2',type:'gridCursorPage',view:q.view,
      revision:'unknown',offset:0,total:null,matched:null,nextCursor:'next',items:[{id:'u1',cells:{category:'Host'}},{id:'u2',cells:{category:'Host'}}]};},facet(request){return {protocol:'canopyx/2',type:'gridFacetPage',
      view:request.query.view,revision:'unknown',column:request.column,search:request.search,includeCurrentFilter:request.includeCurrentFilter,
      matched:7,totalValues:1,truncated:false,items:[{value:'Host',count:7}]};}}});await grid.ready; }, cursorView);
  expect((await facets(page)).matched).toBe(7);
});

test("numeric facet choices preserve distinct raw binary64 values instead of rounding them to identical labels", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => { const host=document.querySelector('[data-canopyx-host]'),view=host.canopyx.view;host.canopyx.destroy();
    view.reporting.facetColumns=['amount'];view.rows=[{id:'a',cells:{amount:0.0001}},{id:'b',cells:{amount:0.0002}}];
    await CanopyX.createDataGrid(host,{view}).ready; });
  await page.locator('.cx-grid-filters > summary').click(); await page.getByRole('button',{name:'Add filter',exact:true}).click();
  const row=page.locator('.cx-grid-filter').first();await row.getByRole('combobox',{name:'Column',exact:true}).selectOption('amount');
  await row.locator('.cx-grid-facet > summary').click();const choice=row.getByRole('combobox',{name:'Choose a value',exact:true});
  await expect(choice.locator('option')).toHaveText(['Choose a value','0.0001 (1)','0.0002 (1)']);
  await choice.selectOption({label:'0.0002 (1)'});await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect((await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery())).filters).toEqual([filter('amount','eq',0.0002)]);
});

async function editor(page) {
  await page.locator(".cx-grid-filters > summary").click();
  if (!(await page.locator(".cx-grid-filter").count())) await page.getByRole("button", { name: "Add filter", exact: true }).click();
  const row = page.locator(".cx-grid-filter").first();
  await row.locator(".cx-grid-facet > summary").click(); return row;
}

test("facet choices show whole-query counts and edit raw typed drafts until Apply", async ({ page }) => {
  await open(page); const row = await editor(page), choice = row.getByRole("combobox", { name: "Choose a value" });
  await expect(row.getByRole("status")).toHaveText("10 matching rows; 6 of 6 values.");
  await expect(choice.locator("option")).toHaveText(["Choose a value", "Boolean: False (1)", "Boolean: True (1)",
    "Text: ALPHA (3)", "Text: Beta (2)", "Text: true (1)", "is missing (2)"]);
  await choice.selectOption({ label: "Boolean: True (1)" });
  expect((await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery())).filters).toEqual([]);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 10 rows");
  expect((await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery())).filters).toEqual([filter("category", "eq", true)]);
  await row.locator(".cx-grid-facet > summary").click(); await row.locator(".cx-grid-facet > summary").click();
  await expect(row.getByRole("status")).toHaveText("1 matching rows; 1 of 1 values.");
  await row.getByRole("checkbox", { name: "Include this column's applied filters" }).uncheck();
  await expect(row.getByRole("status")).toHaveText("10 matching rows; 6 of 6 values.");
  await choice.selectOption({ label: "Text: true (1)" }); await page.getByRole("button", { name: "Apply", exact: true }).click();
  expect((await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery())).filters).toEqual([filter("category", "eq", "true")]);
});

test("facet value search and missing choices preserve applied query counts and compact keyboard accessibility", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await open(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-cx-theme", "dark"));
  const row = await editor(page), choice = row.getByRole("combobox", { name: "Choose a value" });
  await row.getByRole("searchbox", { name: "Search values" }).fill("alp");
  await row.getByRole("searchbox", { name: "Search values" }).press("Enter");
  await expect(row.getByRole("status")).toHaveText("10 matching rows; 1 of 1 values.");
  await expect(choice.locator("option")).toHaveText(["Choose a value", "Text: ALPHA (3)"]);
  await row.getByRole("searchbox", { name: "Search values" }).fill("");
  await expect(row.getByRole("status")).toHaveText("10 matching rows; 6 of 6 values.");
  await choice.selectOption({ label: "is missing (2)" }); await choice.focus(); await choice.press("Tab");
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).disableRules(["region"]).analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 10 rows");
});

test("facet controls abort superseded value search and removal without accepting stale host choices", async ({ page }) => {
  await open(page, {}, hostSetup, true); const row = await editor(page);
  await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(1);
  await row.getByRole("searchbox", { name: "Search values" }).fill("fresh");
  await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(2);
  expect(await page.evaluate(() => facetRequests[0].signal.aborted)).toBe(true);
  const fresh = await page.evaluate(() => facetRequests[1].request);
  await page.evaluate(value => facetResolvers[1](value), response(fresh, { items: [{ value: "Fresh", count: 100 }] }));
  await expect(row.getByRole("combobox", { name: "Choose a value" }).locator("option")).toHaveText(["Choose a value", "Text: Fresh (100)"]);
  const old = await page.evaluate(() => facetRequests[0].request);
  await page.evaluate(value => facetResolvers[0](value), response(old));
  await expect(row.getByRole("combobox", { name: "Choose a value" }).locator("option")).toHaveText(["Choose a value", "Text: Fresh (100)"]);
  await row.getByRole("button", { name: "Load values" }).click();
  await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(3);
  await row.getByRole("button", { name: "Remove Category filter" }).click();
  expect(await page.evaluate(() => facetRequests[2].signal.aborted)).toBe(true);
});

test("accepted search retires previously completed facet choices and missing host facets show a recoverable error", async ({ page }) => {
  await open(page); const row = await editor(page);
  await expect(row.getByRole("status")).toHaveText("10 matching rows; 6 of 6 values.");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "Beta" }));
  await expect(row.getByRole("combobox", { name: "Choose a value" })).toBeDisabled();
  await expect(row.getByRole("status")).toContainText("Load values again");
  await row.getByRole("button", { name: "Load values" }).click();
  await expect(row.getByRole("status")).toHaveText("2 matching rows; 1 of 1 values.");
  await open(page, {}, hostSetup.replace("facet(request,{signal})", "unsupported(request,{signal})"), true);
  const unsupported = await editor(page);
  await expect(unsupported.getByRole("status")).toContainText("explicit source capability");
  await expect(unsupported.getByRole("button", { name: "Load values" })).toBeEnabled();
});
