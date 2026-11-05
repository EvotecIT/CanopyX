import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo, openExample } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";
import { serveGrid } from "./column-groups-support.mjs";

async function chartPage(page, view, theme = "light", beforeOpen = async () => {}) {
  const errors = [], loads = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/canopyx-*.{js,css}", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop(); loads.push(name);
    return route.fulfill({ contentType: name.endsWith(".js") ? "text/javascript" : "text/css",
      body: readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8") });
  });
  await beforeOpen();
  view.reporting.chartable = true; delete view.reporting.detail;
  await open(page, view, "", theme);
  return { errors, loads };
}

test("a native self-contained chart-only page loads its parts and filters without network assets", async ({ page }) => {
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("request", request => requests.push(request.url()));
  await openExample(page, "analysis-charts.html");
  await page.locator(".cx-chart-open").click();
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(2);
  await page.locator(".cx-chart-canvas [data-cfx-category]").first().click();
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(1);
  expect(requests.filter(url => !url.endsWith("analysis-charts.html"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("chart renderer loads only on first action and accepted groups filter both ways without losing the reader query", async ({ page }, info) => {
  const view = definition(), { errors, loads } = await chartPage(page, view);
  expect(await page.evaluate(() => typeof window.ChartForgeXRenderer)).toBe("undefined");
  expect(loads).not.toContain("canopyx-charts.js");
  await page.locator(".cx-chart-open").click();
  await expect(page.locator(".cx-chart-canvas svg [data-cfx-category]")).toHaveCount(4);
  expect(loads.filter(name => name === "canopyx-charts.js")).toHaveLength(1);
  await page.evaluate(api + ".setQuery({..." + api + ".getQuery(),search:'SO-10'})");
  await expect(page.locator(".cx-chart-canvas svg [data-cfx-category]")).toHaveCount(4);
  await page.locator(".cx-chart-canvas [data-cfx-category]").first().click();
  await expect.poll(() => page.evaluate(api + ".getExternalFilters().length")).toBe(1);
  expect(await page.evaluate(api + ".getQuery().search")).toBe("SO-10");
  await expect(page.locator(".cx-chart-canvas svg [data-cfx-category]")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear chart filter", exact: true }).click();
  await expect(page.locator(".cx-chart-canvas svg [data-cfx-category]")).toHaveCount(4);
  await page.getByLabel("Chart type", { exact: true }).selectOption("stacked");
  await expect(page.locator(".cx-chart-canvas svg")).toHaveAttribute("data-cfx-renderer", "stacked");
  expect(await page.locator(".cx-chart-dialog [data-hfx-part='body']").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("group-chart-light.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cx-chart-dialog")).toHaveAttribute("data-phone", "true");
  expect(await page.locator(".cx-chart-dialog [data-hfx-part='body']").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("group-chart-phone.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Close complete text", exact: true }).click();
  await expect(page.locator(".cx-chart-analysis")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("selected and ranged raw cells chart through accepted grid captures", async ({ page }) => {
  const view = definition(); view.reporting.groupBy = []; view.rangeSelection = { enabled: true };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".setSelection(['o000','o001'])");
  await page.evaluate(api + ".openChart({source:'selected',category:'region',values:['amount']})");
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(2);
  await page.evaluate(api + ".setSelection(['o002'])");
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(1);
  await page.evaluate(api + ".setCellRanges([{startRow:0,endRow:2,startColumn:'placed',endColumn:'amount'}])");
  await page.evaluate(api + ".openChart({source:'range',category:'placed',values:['amount']})");
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(3);
  await expect(page.locator(".cx-chart-canvas svg")).toHaveAttribute("data-cfx-renderer", "line");
  const labels = await page.locator(".cx-chart-canvas [data-cfx-category]").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  expect(labels[0]).toContain(String(view.rows[0].cells.amount));
  expect(errors).toEqual([]);
});

test("pivot charts use accepted leaf values and linked row-axis predicates", async ({ page }, info) => {
  const view = definition(); view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [{ column: "status", direction: "asc" }], values: ["total"] };
  const { errors } = await chartPage(page, view, "dark");
  await page.evaluate(api + ".openChart({source:'pivot'})");
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(12);
  await expect(page.locator(".cx-chart-canvas svg")).toHaveAttribute("data-cfx-renderer", "stacked");
  await page.screenshot({ path: info.outputPath("pivot-chart-dark.png"), animations: "disabled" });
  await page.locator(".cx-chart-canvas [data-cfx-category]").first().click();
  await expect.poll(() => page.evaluate(api + ".getExternalFilters()[0]?.predicate.column")).toBe("region");
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("missing and bucket group categories reuse native grid predicates exactly", async ({ page }) => {
  const view = definition(); view.rows[0].cells.region = null;
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openChart({source:'groups',values:['total']})");
  await page.locator(".cx-chart-canvas [aria-label*='Missing']").click();
  await expect.poll(() => page.evaluate(api + ".getExternalFilters()[0]?.predicate.operator")).toBe("isNull");
  await expect.poll(() => page.evaluate(api + ".getQuery().filters.some(filter=>filter.operator==='isNull')")).toBe(true);
  await page.getByRole("button", { name: "Clear chart filter", exact: true }).click();
  await page.evaluate(api + ".setGroupBy([{column:'amount',direction:'asc',bucket:{kind:'width',width:500,origin:0}}])");
  await page.evaluate(api + ".openChart({source:'groups',values:['total']})");
  await page.locator(".cx-chart-canvas [data-cfx-category]").first().click();
  await expect.poll(() => page.evaluate(api + ".getExternalFilters()[0]?.predicate.bucket?.width")).toBe(500);
  await expect.poll(() => page.evaluate(api + ".getQuery().filters.some(filter=>filter.bucket?.width===500)")).toBe(true);
  expect(errors).toEqual([]);
});

test("optional chart cells keep raw values and release their drawings when rows change", async ({ page }, info) => {
  const view = definition(); view.reporting.groupBy = [];
  const kinds = ["sparklineArea", "sparklineColumns", "sparklineWinLoss", "bullet"];
  view.columns = [{ id: "order", title: "Order", kind: "text" }, ...kinds.map(kind => ({ id: kind, title: kind, kind: "number", width: 180,
    presenter: { kind, ...(kind === "bullet" ? { target: 6 } : {}) } }))];
  view.rows = view.rows.slice(0, 4).map((row, index) => ({ id: row.id, cells: { order: row.cells.order,
    ...Object.fromEntries(kinds.map(kind => [kind, { value: index + 3,
      series: [{ period: "Jan", value: 4 }, { period: "Feb", value: -2 }, { period: "Mar", value: 0 }, { period: "Apr", value: index + 3 }] }])) } }));
  delete view.reporting;
  const errors = [], loads = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/canopyx-*.{js,css}", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop(); loads.push(name);
    return route.fulfill({ contentType: name.endsWith(".js") ? "text/javascript" : "text/css", body: readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8") });
  });
  await open(page, view);
  await expect(page.locator(".cx-chart-cell svg")).toHaveCount(16);
  expect(loads.filter(name => name === "canopyx-chart-renderer.js")).toHaveLength(1);
  expect(loads).not.toContain("canopyx-charts.js");
  const rows = await page.evaluate(async () => {
    const exported = document.querySelector("[data-canopyx-host]").canopyx.prepareExport({ scope: "filtered", values: "raw" }), rows = [];
    for await (const row of exported.rows()) rows.push(row);
    return rows;
  });
  expect(rows[0].cells.sparklineArea.value).toBe(3);
  await page.screenshot({ path: info.outputPath("chart-cells-light.png"), animations: "disabled" });
  await page.evaluate(api + ".setQuery({..." + api + ".getQuery(),search:'SO-1000'})");
  await expect(page.locator(".cx-chart-cell svg")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("collapsed pivot branches retain every leaf value in a reopened chart", async ({ page }) => {
  const view = definition(); view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }, { column: "customer", direction: "asc" }],
    columns: [{ column: "status", direction: "asc" }, { column: "items", direction: "asc" }], values: ["total"] };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openChart({source:'pivot'})");
  const values = () => page.locator(".cx-chart-canvas [data-cfx-category]").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  const before = await values(); expect(before.length).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, result = grid.getPivotResult();
    await grid.setPivotCollapsed("rows", result.rows.find(item => item.path.length === 1).key, true);
    await grid.setPivotCollapsed("columns", result.columns.find(item => item.path.length === 1).key, true);
    await grid.openChart({ source: "pivot" });
  });
  expect(await values()).toEqual(before); expect(errors).toEqual([]);
});

test("a 33-category pivot initializes a usable value picker within the renderer limit", async ({ page }) => {
  const view = definition(); view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.rows = view.rows.slice(0, 33).map((row, index) => ({ ...row, cells: { ...row.cells, status: "Status " + index } }));
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [{ column: "status", direction: "asc" }], values: ["total"] };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openChart({source:'pivot'})");
  const picker = page.getByLabel("Values", { exact: true });
  await expect(picker.locator("option")).toHaveCount(33);
  await expect(page.locator(".cx-chart-canvas svg")).toHaveCount(1);
  const selected = await picker.locator("option").evaluateAll(nodes => nodes.slice(0, 2).map(node => node.value));
  await picker.selectOption(selected);
  await expect.poll(() => page.locator(".cx-chart-canvas [data-cfx-series]").evaluateAll(nodes => new Set(nodes.map(node => node.dataset.cfxSeries)).size)).toBe(2);
  expect(errors).toEqual([]);
});

test("host-enabled and API-established ranges both open analysis without a view declaration", async ({ page }) => {
  const view = definition(); view.reporting = { chartable: true };
  await serveGrid(page, view, { runtime: "canopyx-reporting", options: "{rangeSelection:true}" });
  await page.evaluate(async () => {
    await window.api.setCellRanges([{ startRow: 0, endRow: 2, startColumn: "placed", endColumn: "amount" }]);
    await window.api.openChart({ source: "range", category: "placed", values: ["amount"] });
  });
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(3);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("closing a hosted range chart settles capture and stops its remaining page walk", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "remote-charts", label: "Remote records", source: { kind: "host" },
    pageSize: 20, selection: "none", reporting: { chartable: true }, rangeSelection: true,
    columns: [{ id: "name", title: "Name", kind: "text" }, { id: "value", title: "Value", kind: "number" }] };
  const before = "window.calls=[];window.releasePages=[];window.chartSettled=false;";
  const options = `{source:{async query(query){ calls.push(query.offset);if(query.offset>=40)await new Promise(resolve=>releasePages.push(resolve));
    return {protocol:'canopyx/2',type:'gridPage',view:query.view,revision:'one',offset:query.offset,total:200,matched:200,
      items:Array.from({length:Math.min(query.limit,200-query.offset)},(_,i)=>({id:'r'+(query.offset+i),cells:{name:'Record '+(query.offset+i),value:query.offset+i}}))};}}}`;
  await serveGrid(page, view, { runtime: "canopyx-reporting", height: 160, before, options });
  await page.evaluate(async () => {
    await window.api.setCellRanges([{ startRow: 0, endRow: 150, startColumn: "name", endColumn: "value" }]);
    window.chartOperation = window.api.openChart({ source: "range" }).finally(() => { window.chartSettled = true; });
  });
  await expect.poll(() => page.evaluate(() => window.releasePages.length)).toBeGreaterThan(0);
  const calls = await page.evaluate(() => window.calls.slice());
  await page.getByRole("button", { name: "Close complete text", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.chartSettled)).toBe(true);
  await page.evaluate(() => { for (const release of window.releasePages.splice(0)) release(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.calls)).toEqual(calls);
});

test("drawer chart cells stay visible through grid paints and dispose on drawer closure", async ({ page }) => {
  const view = definition(); view.reporting = { chartable: true };
  view.columns[5].presenter = { kind: "bullet", target: 6 };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openDetails('o000')");
  const drawer = page.locator(".cx-drawer");
  await expect(drawer.locator(".cx-chart-cell svg")).toHaveCount(1);
  await page.evaluate(() => {
    window.drawerCell = document.querySelector(".cx-drawer .cx-chart-cell");
    document.querySelector("[data-canopyx-host]").canopyx.setSelection(["o001"]);
  });
  await expect(drawer.locator(".cx-chart-cell svg")).toHaveCount(1);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.drawerCell.querySelectorAll("svg").length)).toBe(0);
  expect(errors).toEqual([]);
});

test("explicit pivot values retain semantic identity when filtering reorders exported columns", async ({ page }) => {
  const view = definition(); view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.rows = [["R1", "B", 10], ["R1", "C", 20], ["R2", "A", 30]].map(([region, status, amount], index) =>
    ({ id: "semantic-" + index, cells: { ...view.rows[0].cells, region, status, amount } }));
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [{ column: "status", direction: "asc" }], values: ["total"] };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openChart({source:'pivot'})");
  const picker = page.getByLabel("Values", { exact: true });
  const valueFor = prefix => picker.locator("option").evaluateAll((nodes, prefix) => nodes.find(node => node.textContent.startsWith(prefix)).value, prefix);
  await picker.selectOption(await valueFor("B:"));
  const mark = page.locator(".cx-chart-canvas [data-cfx-category]");
  await expect(mark).toHaveCount(1); await expect(mark).toHaveAttribute("aria-label", /B:.*R1: 10$/);
  await mark.click();
  await expect.poll(() => picker.locator("option:checked").allTextContents()).toEqual(["B: Total amount · Sum"]);
  await expect(mark).toHaveAttribute("aria-label", /B:.*R1: 10$/);
  await mark.focus();
  await page.evaluate(api + ".setQuery({..." + api + ".getQuery(),filters:[{column:'status',operator:'eq',values:['C']}]})");
  await expect(mark).toHaveCount(0);
  await expect(page.locator(".cx-chart-status")).toContainText("No data");
  await expect(picker).toBeFocused();
  await page.getByLabel("Chart type", { exact: true }).selectOption("column");
  await expect(page.locator(".cx-chart-status")).toContainText("No data");
  await picker.selectOption(await valueFor("C:"));
  await expect(mark).toHaveCount(1); await expect(mark).toHaveAttribute("aria-label", /C:.*R1: 20$/);
  expect(errors).toEqual([]);
});

test("valid empty and long captions remain renderable", async ({ page }) => {
  const view = definition(); view.reporting = {};
  view.columns.find(column => column.id === "amount").title = "";
  view.columns.find(column => column.id === "amount").presenter = { kind: "bullet", target: 2000 };
  view.columns.find(column => column.id === "items").title = "Long title ".repeat(250);
  view.columns.find(column => column.id === "items").presenter = { kind: "sparklineArea" };
  view.rows = view.rows.slice(0, 4);
  for (const row of view.rows) row.cells.items = { value: 3, text: "Full value ".repeat(250),
    series: [{ period: "Long period ".repeat(250), value: 3 }, { period: "Next", value: 4 }] };
  const { errors } = await chartPage(page, view);
  await expect(page.locator("[data-canopyx-host] .cx-chart-cell svg")).toHaveCount(8);
  expect(await page.locator(".cx-chart-cell svg").evaluateAll(nodes => nodes.every(node => node.getAttribute("aria-label").length <= 2000))).toBe(true);
  await page.evaluate(api + ".openChart({source:'filtered',category:'order',values:['amount','items']})");
  await expect(page.locator(".cx-chart-canvas svg")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("chart presenters keep facet choices readable as scalar text", async ({ page }) => {
  const view = definition(); view.reporting = {}; view.rows = view.rows.slice(0, 4);
  view.columns.find(column => column.id === "amount").presenter = { kind: "bullet", target: 2000 };
  view.facets = { columns: [{ column: "amount", kind: "list", label: "Amount" }], open: true };
  const { errors } = await chartPage(page, view);
  await expect(page.locator("[data-canopyx-host] .cx-chart-cell svg")).toHaveCount(4);
  await page.evaluate(api + ".setQuery({..." + api + ".getQuery(),search:'SO-100'})");
  await expect(page.locator(".cx-facet-values .cx-chart-cell")).toHaveCount(0);
  await expect(page.locator(".cx-facet-values")).toContainText(String(view.rows[0].cells.amount));
  expect(errors).toEqual([]);
});

test("record-only chart presenters load before the first drawer paint", async ({ page }) => {
  const view = definition(); view.reporting = {};
  view.record = { fields: [{ id: "measure", title: "Record measure", kind: "number", presenter: { kind: "bullet", target: 10 } }] };
  for (const row of view.rows) row.fields = { measure: 4 };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openDetails('o000')");
  await expect(page.locator(".cx-drawer dd[data-cx-field='measure'] svg")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("a failed chart-cell request recovers on the next native paint", async ({ page }) => {
  const view = definition(); view.reporting = {};
  view.rows = view.rows.slice(0, 4);
  view.columns.find(column => column.id === "amount").presenter = { kind: "bullet", target: 2000 };
  let requests = 0;
  const { errors } = await chartPage(page, view, "light", () => page.route("**/canopyx-chart-cells.js", route => {
    requests++; return requests === 1 ? route.abort("failed") : route.fallback();
  }));
  await page.evaluate(api + ".setSelection(['o000'])");
  await expect(page.locator("[data-canopyx-host] .cx-chart-cell svg")).toHaveCount(4);
  expect(requests).toBe(2); expect(errors).toEqual([]);
});

test("long pivot paths keep bounded drawing IDs and exact linked-filter values", async ({ page }) => {
  const view = definition(), region = "Region ".repeat(350);
  view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.rows = view.rows.slice(0, 2); view.rows[0].cells.region = region; view.rows[1].cells.region = "Short";
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [{ column: "status", direction: "asc" }], values: ["total"] };
  const { errors } = await chartPage(page, view);
  await page.evaluate(api + ".openChart({source:'pivot'})");
  const mark = page.locator(".cx-chart-canvas [data-cfx-category]").first();
  await expect(mark).toHaveAttribute("data-cfx-category", /^k\d+$/);
  await mark.click();
  await expect.poll(() => page.evaluate(api + ".getExternalFilters()[0]?.predicate.values[0]")).toBe(region);
  await expect(page.locator(".cx-chart-canvas [data-cfx-category]")).toHaveCount(1);
  expect(errors).toEqual([]);
});
