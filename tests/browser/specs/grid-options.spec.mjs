import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, openGridControl } from "./support.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const view = extra => ({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory", pageSize: 2,
  presentation: "paged", pageLength: 2, selection: "none", search: true, source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true, width: 200 },
    { id: "amount", title: "Amount", kind: "number", sortable: true, width: 180 },
    { id: "rank", title: "Rank", kind: "number", sortable: true, hidden: true, width: 80 }],
  rows: [{ id: "a", cells: { name: "Alpha", amount: 10, rank: 3 } }, { id: "b", cells: { name: "Beta", amount: 20, rank: 1 } },
    { id: "c", cells: { name: "Gamma", amount: 30, rank: 2 } }, { id: "d", cells: { name: "Delta", amount: 40, rank: 4 } }], ...extra });
const sum = { id: "sum", column: "amount", operation: "sum", label: "Sum" };
const footers = [{ id: "page", label: "Current page", scope: "page", aggregates: [sum] },
  { id: "all", label: "All matching records", scope: "all", aggregates: [sum] }];
async function mount(page, definition, script = "", runtime = "canopyx-grid", overrides = {}) {
  const requested = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://grid-options.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (overrides[file]) return overrides[file](route);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Grid options</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/' + runtime + '.css"><script src="/' + runtime + '.js"></script></head><body><div id="grid" data-canopyx-host data-cx-mount="manual" style="height:500px"></div><script>' + script + ';window.api=CanopyX.createDataGrid(document.querySelector("#grid"),{view:' + JSON.stringify(definition).replace(/</g, "\\u003c") + ',...window.options});window.ready=api.ready.catch(error=>{window.failure=error.message})</script></body></html>' });
    requested.push(file);
    return route.fulfill({ path: path.join(assets, file), contentType: file.endsWith(".css") ? "text/css" : "text/javascript" });
  });
  await page.goto("https://grid-options.test/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.ready);
  expect(errors).toEqual([]);
  return requested;
}
const ids = page => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId));

test("footer page and full matching totals follow paging and filtering", async ({ page }) => {
  const requests = await mount(page, view({ footers }));
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 30");
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 100");
  expect(requests).toContain("canopyx-grid-options.js");
  await page.evaluate(() => api.nextPage());
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 70");
  await page.evaluate(() => api.setQuery({ filters: [{ column: "amount", operator: "ge", values: [20] }] }));
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 90");
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 50");
  await page.evaluate(() => api.setQuery({ search: "No match" }));
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: —");
});

test("page footers follow aggregate group ordering", async ({ page }) => {
  const definition = view({ footers, reporting: { groupBy: [{ column: "name", direction: "asc" }], aggregates: [sum] } });
  definition.rows = [{ id: "a", cells: { name: "A", amount: 1 } }, { id: "b", cells: { name: "A", amount: 2 } },
    { id: "c", cells: { name: "B", amount: 10 } }, { id: "d", cells: { name: "B", amount: 20 } }];
  await mount(page, definition, "", "canopyx-reporting");
  await page.evaluate(() => api.setGroupBy([{ column: "name", direction: "desc", aggregate: "sum" }]));
  await expect.poll(() => ids(page)).toEqual(["c", "d"]);
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 30");
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 33");
  await page.evaluate(() => api.nextPage());
  await expect.poll(() => ids(page)).toEqual(["a", "b"]);
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 3");
});

test("column defaults use selectors and preserve explicit settings in headers cells and footers", async ({ page }) => {
  const definition = view({ footers, columnDefaults: [{ targets: ["*"], className: "financial", alignment: "end" },
    { targets: ["#name"], className: "later" }] });
  definition.columns[0].alignment = "center";
  definition.columns[1].className = "amount-value";
  await mount(page, definition);
  await expect(page.locator('.cx-hcell[data-cx-column="name"]')).toHaveCSS("text-align", "center");
  await expect(page.locator('.cx-row[data-cx-id="a"] .amount-value')).toHaveCSS("text-align", "end");
  await expect(page.locator('[data-cx-footer="all"] .amount-value')).toHaveCSS("text-align", "end");
  expect(await page.evaluate(() => api.view.columns[0].className)).toBe("financial");
});

test("alternate sort fields fixed pre-sort and per-column direction cycle compose", async ({ page }) => {
  const definition = view({ pageLength: 4, preSort: [{ column: "amount", direction: "desc" }] });
  definition.columns[0].orderData = ["rank"]; definition.columns[0].orderSequence = ["desc", "asc"];
  definition.rows[0].cells.amount = definition.rows[1].cells.amount = 40;
  await mount(page, definition);
  await page.locator('.cx-sort').filter({ hasText: "Name" }).click();
  await expect.poll(() => ids(page)).toEqual(["d", "a", "b", "c"]);
  expect(await page.evaluate(() => api.getQuery().sort)).toEqual([{ column: "amount", direction: "desc" }, { column: "name", direction: "desc" }]);
  await page.locator('.cx-sort').filter({ hasText: "Name" }).click();
  await expect.poll(() => ids(page)).toEqual(["b", "a", "d", "c"]);
});

test("fixed pre-sort leaves user priorities independent and footer bands fill the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const definition = view({ footers, preSort: [{ column: "rank", direction: "asc" }] });
  definition.columns.forEach(column => { column.width = 120; column.fixed = true; });
  definition.columns.find(column => column.id === "rank").hidden = true;
  definition.columns.find(column => column.id === "name").headerDescription = "Stable resource identifier";
  await mount(page, definition);
  await page.locator('.cx-sort').filter({ hasText: "Name" }).click();
  await expect(page.locator('.cx-hcell[data-cx-column="name"]')).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator('.cx-sort-priority')).toHaveCount(0);
  await expect(page.locator('.cx-hcell[data-cx-column="name"]')).toHaveAttribute("title", /Always sorted by.*first/);
  await expect(page.locator('.cx-hcell[data-cx-column="name"] .cx-sort')).toHaveAttribute("title", /Stable resource identifier\nAlways sorted by.*first/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator('.cx-footer-row').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().width >= row.closest('.cx-grid').clientWidth - 1))).toBe(true);
    await expect(page.locator('.cx-footer-fill')).toHaveCount(2);
    await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 100");
  }
});

test("plugin filter comparator and aggregate hooks run against raw complete data", async ({ page }) => {
  const definition = view({ pageLength: 4, footers: [{ id: "spread", label: "Matching spread", scope: "all", aggregates: [{ ...sum, operation: "spread" }] }],
    query: { sort: [{ column: "amount", direction: "asc" }], filters: [{ column: "amount", operator: "multiple", values: [20] }] } });
  definition.columns[1].sortComparator = "reverse";
  await mount(page, definition, `CanopyX.use({name:"math",filterOperators:{multiple:(value,values)=>value%values[0]===0},sortComparators:{reverse:(a,b)=>b-a},aggregates:{spread:values=>Math.max(...values)-Math.min(...values)}})`);
  await expect.poll(() => ids(page)).toEqual(["d", "b"]);
  await expect(page.locator('[data-cx-footer="spread"]')).toContainText("Sum: 20");
});

test("grouped rows preserve custom filters and alternate-field comparators", async ({ page }) => {
  const definition = view({ pageLength: 4, footers, reporting: { groupBy: [{ column: "name", direction: "asc" }], aggregates: [sum] },
    query: { sort: [{ column: "amount", direction: "asc" }], filters: [{ column: "amount", operator: "multiple", values: [20] }] } });
  definition.rows.forEach(row => { row.cells.name = "One group"; });
  definition.columns[1].sortComparator = "reverse";
  definition.columns[1].orderData = ["rank"];
  await mount(page, definition, `CanopyX.use({name:"group-math",filterOperators:{multiple:(value,values)=>value%values[0]===0},sortComparators:{reverse:(a,b)=>b-a}})`, "canopyx-reporting");
  await expect.poll(() => ids(page)).toEqual(["d", "b"]);
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 60");
});

test("hosted totals use explicit page values and never cached partial records", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, footers }); delete definition.rows;
  await mount(page, definition, `window.options={source:{query:query=>({protocol:"canopyx/2",type:"gridPage",view:"inventory",revision:"r1",offset:query.offset,total:4,matched:4,items:[{id:"a",cells:{name:"Alpha",amount:10,rank:3}},{id:"b",cells:{name:"Beta",amount:20,rank:1}}],footerValues:{all:{sum:100}}})}}`);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 100");
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 30");
});

test("hosted reporting summaries accept distinct footer aggregate bindings", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, reporting: { grouping: { column: "name", direction: "asc" }, aggregates: [sum] },
    footers: [{ id: "all", label: "All records", scope: "all", aggregates: [{ id: "records", column: "name", operation: "count", label: "Records" }] }] });
  delete definition.rows;
  await mount(page, definition, `window.options={source:{
    query:q=>({protocol:"canopyx/2",type:"gridPage",view:"inventory",revision:"r1",offset:q.offset,total:2,matched:2,items:[{id:"a",cells:{name:"One group",amount:10}},{id:"b",cells:{name:"One group",amount:20}}],footerValues:{all:{records:2}}}),
    summary:q=>({protocol:"canopyx/2",type:"gridSummary",view:"inventory",revision:"r1",query:q,matched:2,aggregates:{sum:30,records:2},groups:[{key:"one",value:"One group",offset:0,count:2,aggregates:{sum:30,records:2}}]})}}`, "canopyx-reporting");
  expect(await page.evaluate(() => window.failure)).toBeUndefined();
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Records: 2");
  expect(await page.evaluate(() => api.getSummary().aggregates)).toEqual({ sum: 30, records: 2 });
});

test("hosted comparator execution stays with the host", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, query: { sort: [{ column: "name", direction: "asc" }] } });
  definition.columns[0].sortComparator = "natural"; delete definition.rows;
  await mount(page, definition, `window.options={source:{query:q=>({protocol:"canopyx/2",type:"gridPage",view:"inventory",revision:"r1",offset:q.offset,total:2,matched:2,items:[{id:"b",cells:{name:"Item 2"}},{id:"a",cells:{name:"Item 10"}}]})}}`);
  expect(await page.evaluate(() => window.failure)).toBeUndefined();
  await expect.poll(() => ids(page)).toEqual(["b", "a"]);
});

test("inline reporting summaries include distinct footer aggregate bindings", async ({ page }) => {
  const definition = view({ pageLength: 4, reporting: { groupBy: [{ column: "name", direction: "asc" }], aggregates: [sum] },
    footers: [{ id: "all", label: "All records", scope: "all", aggregates: [{ id: "records", column: "name", operation: "count", label: "Records" }] }] });
  definition.rows.forEach(row => { row.cells.name = "One group"; });
  await mount(page, definition, "", "canopyx-reporting");
  const summary = await page.evaluate(() => api.getSummary());
  expect(summary.aggregates).toEqual({ sum: 100, records: 4 });
  expect(summary.groups[0].aggregates).toEqual(summary.aggregates);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Records: 4");
});

for (const grouped of [false, true]) test("fixed pre-sort uses raw keys with alternate fields " + grouped, async ({ page }) => {
  const definition = view({ pageLength: 4, preSort: [{ column: "amount", direction: "asc" }],
    ...(grouped ? { reporting: { groupBy: [{ column: "name", direction: "asc" }] } } : {}) });
  definition.columns[1].orderData = ["rank"];
  if (grouped) definition.rows.forEach(row => { row.cells.name = "One group"; });
  await mount(page, definition, "", grouped ? "canopyx-reporting" : "canopyx-grid");
  await expect.poll(() => ids(page)).toEqual(["a", "b", "c", "d"]);
});

test("footer windows follow initial and saved nonzero page offsets", async ({ page }) => {
  await mount(page, view({ footers, query: { offset: 2 } }));
  await expect.poll(() => ids(page)).toEqual(["c", "d"]);
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 70");
  await page.evaluate(() => api.saveView("Second page"));
  await page.evaluate(() => api.previousPage());
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 30");
  await page.evaluate(() => api.applySavedView("Second page"));
  await expect.poll(() => ids(page)).toEqual(["c", "d"]);
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 70");
});

test("rejected host pages preserve accepted footer totals across layout renders", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, footers }); delete definition.rows;
  await mount(page, definition, `window.badPage=false;window.options={source:{query:q=>({protocol:"canopyx/2",type:"gridPage",view:"inventory",revision:"r1",offset:q.offset,total:2,matched:2,
    items:[{id:"a",cells:{name:"Alpha",amount:10}},{id:badPage?"a":"b",cells:{name:"Beta",amount:20}}],footerValues:{all:{sum:badPage?999:30}}})}}`);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 30");
  const rejected = await page.evaluate(async () => { badPage=true; try { await api.reload(); return false; } catch { return true; } });
  expect(rejected).toBe(true);
  await page.evaluate(() => api.setColumnVisible("rank", true));
  await expect.poll(() => ids(page)).toEqual(["a", "b"]);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 30");
});

test("footer and summary sums preserve cancellation residuals", async ({ page }) => {
  const average = { id: "average", column: "amount", operation: "average", label: "Average", format: { maximumFractionDigits: 3 } };
  const definition = view({ pageSize: 3, pageLength: 3, footers: [{ id: "all", label: "All records", scope: "all", aggregates: [sum, average] }],
    reporting: { aggregates: [sum, average] } });
  definition.rows = [9007199254740991, 0.5, -9007199254740991].map((amount, i) => ({ id: String(i), cells: { name: "Value " + i, amount } }));
  await mount(page, definition, "", "canopyx-reporting");
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 0.5");
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Average: 0.167");
  expect(await page.evaluate(() => api.getSummary().aggregates)).toEqual({ sum: 0.5, average: 0.5 / 3 });
});

test("group heading templates render tokens as text", async ({ page }) => {
  const definition = view({ reporting: { grouping: { column: "name", direction: "asc", headerTemplate: "<b>{value}</b> — {count}" } } });
  await mount(page, definition, "", "canopyx-reporting");
  await expect(page.locator('.cx-grid-group').first()).toContainText("<b>Alpha</b> — 1");
  await expect(page.locator('.cx-grid-group b')).toHaveCount(0);
  expect(await page.evaluate(() => api.getQuery().sort)).toEqual([{column:"name",direction:"asc"}]);
});

test("ordinary grids keep the optional footer and hook part unloaded", async ({ page }) => {
  const requested = await mount(page, view({}));
  expect(requested.some(file => file.startsWith("canopyx-grid-options"))).toBe(false);
  await expect(page.locator('.cx-footers')).toHaveCount(0);
});

test("query hooks stay scoped to each grid and reject invalid hook results", async ({ page }) => {
  const definition = view({ pageLength: 4, query: { filters: [{ column: "amount", operator: "choose", values: [20] }] } });
  await mount(page, definition, 'window.options={plugins:[{name:"choice",filterOperators:{choose:(value,values)=>value>=values[0]}}]}');
  await expect.poll(() => ids(page)).toEqual(["b", "c", "d"]);
  const second = await page.evaluate(async () => {
    const host = document.body.appendChild(document.createElement("div")); host.style.height = "400px";
    const view = structuredClone(api.view); view.id = "other";
    const other = CanopyX.createDataGrid(host, { view, plugins: [{ name: "choice", filterOperators: { choose: (value, values) => value < values[0] } }] });
    await other.ready;
    const ids = [...host.querySelectorAll('[data-cx-id]')].map(row => row.dataset.cxId);
    other.destroy(); host.remove();
    const broken = document.body.appendChild(document.createElement("div")); broken.style.height = "400px";
    const bad = CanopyX.createDataGrid(broken, { view: { ...view, id: "invalid" }, plugins: [{ name: "choice", filterOperators: { choose: () => "true" } }] });
    let message; try { await bad.ready; } catch (error) { message = error.message; }
    bad.destroy(); broken.remove(); return { ids, message };
  });
  expect(second.ids).toEqual(["a"]);
  expect(second.message).toContain("filter hooks return a boolean");
  await page.evaluate(() => api.reload());
  await expect.poll(() => ids(page)).toEqual(["b", "c", "d"]);
});

test("hosted missing totals stay unavailable while page totals remain visible", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, footers }); delete definition.rows;
  await mount(page, definition, `window.options={source:{query:query=>({protocol:"canopyx/2",type:"gridPage",view:"inventory",revision:"r1",offset:query.offset,total:4,matched:4,items:[{id:"a",cells:{name:"Alpha",amount:10,rank:3}},{id:"b",cells:{name:"Beta",amount:20,rank:1}}]})}}`);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: Unavailable");
  await expect(page.locator('[data-cx-footer="page"]')).toBeVisible();
});

test("host page footer requests cover the visible page when transport and visible sizes differ", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, pageLength: 3, footers }); delete definition.rows;
  await mount(page, definition, `window.windows=[];window.options={source:{query:query=>{
    windows.push([query.offset,query.limit]);const items=[10,20,30,40].slice(query.offset,query.offset+query.limit).map((amount,i)=>({id:String(query.offset+i),cells:{name:"Record "+(query.offset+i),amount,rank:i}}));
    return {protocol:"canopyx/2",type:"gridPage",view:"inventory",revision:"r1",offset:query.offset,total:4,matched:4,items,footerValues:{page:{sum:items.reduce((total,row)=>total+row.cells.amount,0)},all:{sum:100}}}
  }}}`);
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 60");
  await page.evaluate(() => api.nextPage());
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 40");
  expect(await page.evaluate(() => windows)).toEqual([[0, 3], [3, 3]]);
});

test("custom filter operands remain editable without losing their operator", async ({ page }) => {
  const definition = view({ pageLength: 4, query: { filters: [{ column: "amount", operator: "multiple", values: [20] }] } });
  await mount(page, definition, 'window.options={plugins:[{name:"arithmetic",filterOperators:{multiple:(value,values)=>value%values[0]===0}}]}');
  await expect.poll(() => ids(page)).toEqual(["b", "d"]);
  await openGridControl(page, "filters");
  await expect(page.getByRole("combobox", { name: "Condition", exact: true })).toHaveValue("multiple");
  await page.getByRole("spinbutton", { name: "Value", exact: true }).fill("30");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(["c"]);
  expect(await page.evaluate(() => api.getQuery().filters[0].operator)).toBe("multiple");
});

test("explicit null and empty column options clear inherited defaults", async ({ page }) => {
  const definition = view({ columnDefaults: [{ targets: ["#name"], className: "derived", alignment: "end", orderData: ["rank"], orderSequence: ["desc"], sortComparator: "unused" }] });
  Object.assign(definition.columns[0], { className: null, alignment: null, orderData: [], orderSequence: [], sortComparator: null });
  await mount(page, definition);
  expect(await page.evaluate(() => window.failure)).toBeUndefined();
  await page.locator('.cx-sort').filter({ hasText: "Name" }).click();
  await expect.poll(() => ids(page)).toEqual(["a", "b"]);
  expect(await page.evaluate(() => api.getQuery().sort)).toEqual([{ column: "name", direction: "asc" }]);
  await expect(page.locator('.cx-hcell.derived')).toHaveCount(0);
});

test("footer cells retain explicit column and scope associations alongside grouped summaries", async ({ page }) => {
  await mount(page, view({ footers, reporting: { grouping: { column: "name", direction: "asc" }, aggregates: [sum] } }), "", "canopyx-reporting");
  const cells = page.locator('[data-cx-footer="all"] [role="gridcell"]');
  await expect(cells.last()).toHaveAccessibleName("Amount All matching records Sum: 100");
  const indices = await page.locator('.cx-summary-row,.cx-footer-row').evaluateAll(rows => rows.map(row => Number(row.getAttribute("aria-rowindex"))));
  expect(new Set(indices).size).toBe(indices.length);
  const overlap = await page.evaluate(() => {
    const summary = document.querySelector('.cx-grid-summary').getBoundingClientRect(), footer = document.querySelector('.cx-footers').getBoundingClientRect();
    return summary.bottom > footer.top + 1;
  });
  expect(overlap).toBe(false);
  await page.evaluate(() => api.setColumnVisible("name", false));
  await expect(cells).toHaveCount(1);
  await expect(cells).toHaveAccessibleName("Amount All matching records Sum: 100");
});

test("compact footer totals wait for the complete row dataset", async ({ page }) => {
  const definition = view({ footers, rowData: { version: 1, columns: ["name", "amount", "rank"], count: 4, ordered: true, base: "data/", chunks: 2 } });
  delete definition.rows;
  let release; const held = new Promise(resolve => { release = resolve; });
  const chunk = index => '(self.CanopyXSidecar ||= []).push(["inventory","rows/' + index + '",' + JSON.stringify(JSON.stringify(index ? [["c", "Gamma", 30, 2], ["d", "Delta", 40, 4]] : [["a", "Alpha", 10, 3], ["b", "Beta", 20, 1]])) + ']);';
  const mounting = mount(page, definition, "", "canopyx-grid", {
    "data/rows/0.js": route => route.fulfill({ contentType: "text/javascript", body: chunk(0) }),
    "data/rows/1.js": async route => { await held; return route.fulfill({ contentType: "text/javascript", body: chunk(1) }); }
  });
  try {
    await page.waitForFunction(() => window.api?.view.rows.length === 2);
    expect(await page.evaluate(() => api.getQuery())).toBeNull();
    await expect(page.locator('.cx-footers')).toHaveCount(0);
  } finally { release(); }
  await mounting;
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 100");
  await expect(page.locator('[data-cx-footer="page"]')).toContainText("Sum: 30");
});

test("compact layouts retain totals of columns that are out of view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mount(page, view({ footers }));
  await page.evaluate(() => api.setColumnVisible("amount", false));
  await expect(page.locator('[data-cx-footer="all"] .cx-footer-hidden')).toHaveText("Amount — Sum: 100");
  await expect(page.locator('[data-cx-footer="page"] .cx-footer-hidden')).toHaveText("Amount — Sum: 30");
  await page.evaluate(() => api.nextPage());
  await expect(page.locator('[data-cx-footer="page"] .cx-footer-hidden')).toHaveText("Amount — Sum: 70");
});
