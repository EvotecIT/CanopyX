import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, examples, trackScriptLoads } from "./support.mjs";
import { open, api } from "./grid-grouping-fixtures.mjs";

const part = () => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-calculations.js"), "utf8");
const pivotParts = () => part() + ["buckets", "pivot"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");
function view(columns) {
  return { protocol: "canopyx/2", type: "grid", id: "analyst-boundaries", label: "Calculated boundaries", source: { kind: "inline" }, pageSize: 100,
    selection: "none", columns, rows: [{ id: "r", cells: { input: 8e15 } }] };
}

for (const [input, expected] of [["2026-10-25", "2026-10-25T00:00:00Z"], ["2026-10-25T01:30:00+02:00", "2026-10-24T23:30:00Z"],
  ["2026-10-25T01:30:00.1234567Z", "2026-10-25T01:30:00.123Z"]]) test("calculated datetime normalizes before dependent text: " + input, async ({ page }) => {
  await open(page, view([{ id: "input", title: "Input", kind: "number" }, { id: "when", title: "When", kind: "datetime", calculation: JSON.stringify(input) },
    { id: "spelling", title: "Spelling", kind: "text", calculation: "CONCAT([when])" }]), part());
  const row = (await page.evaluate(api + ".getLoadedRows(['r'])"))[0];
  expect(row.cells.when).toBe(expected); expect(row.cells.spelling).toBe(expected);
});

for (const expression of ["1e16", "-1e16", "[input] * 2"]) test("oversized numeric result stays a cell error: " + expression, async ({ page }) => {
  await open(page, view([{ id: "input", title: "Input", kind: "number" }, { id: "wide", title: "Wide", kind: "number", calculation: expression },
    { id: "dependent", title: "Dependent", kind: "number", calculation: "[wide] / 10" }, { id: "independent", title: "Independent", kind: "number", calculation: "7" }]), part());
  const row = (await page.evaluate(api + ".getLoadedRows(['r'])"))[0];
  for (const id of ["wide", "dependent"]) { expect(row.cells[id].value).toBeNull(); expect(row.cells[id].title).toContain("number-range"); }
  expect(row.cells.independent).toBe(7);
});

for (const shape of ["flat", "nested", "tuple"]) test("filter-only single-file page works with no companion assets: " + shape, async ({ page }) => {
  const loads = await trackScriptLoads(page), requests = [], url = "http://127.0.0.1/canopyx-boundary/" + shape;
  await page.route("**/*", route => {
    if (route.request().url() === url) return route.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(examples, "analysis-bucket-filter-" + shape + ".html"), "utf8") });
    requests.push(route.request().url()); return route.abort();
  });
  await page.goto(url); await page.waitForSelector("[data-cx-ready]");
  expect(await page.evaluate(api + ".getQuery().filters.length + (" + api + ".getQuery().tupleFilters?.length || 0) + (" + api + ".getQuery().filterGroup ? 1 : 0)")).toBe(1);
  expect(await page.evaluate(api + ".getLoadedRows(['1','2','3','4']).map(row=>row.id)")).toEqual(["1", "2"]);
  expect(requests).toEqual([]); expect(await loads()).toEqual([]);
});

function derivedView() {
  return { ...view([{ id: "input", title: "Input", kind: "number" }, { id: "derived", title: "Derived", kind: "number", calculation: "[input] / 1e15" }]),
    calculatedColumnsEditable: true, reporting: { pivotable: true, facetColumns: ["derived"], aggregates: [{ id: "sum", column: "derived", operation: "sum", label: "Derived sum" }] } };
}
const replaceFormula = (page, expression) => page.evaluate(expression => {
  const api = document.querySelector('[data-canopyx-host]').canopyx;
  return api.setCalculatedColumns(api.getCalculatedColumns().map(column => ({ ...column, expression })));
}, expression);

test("changed formulas refresh summaries and facets and restore through saved state", async ({ page }) => {
  await open(page, derivedView(), pivotParts()); const saved = await page.evaluate(api + ".getState()");
  await replaceFormula(page, "[input] / 1e15 * 2");
  expect((await page.evaluate(api + ".getSummary()")).aggregates.sum).toBe(16);
  expect((await page.evaluate(api + ".getFacets('derived')")).items.map(item => item.value)).toEqual([16]);
  await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), saved);
  expect((await page.evaluate(api + ".getSummary()")).aggregates.sum).toBe(8);
});

test("active pivots refresh after a formula replacement and saved-state restore", async ({ page }) => {
  await open(page, derivedView(), pivotParts());
  await page.evaluate(api + ".setPivot({rows:[],columns:[],values:['sum']})"); const saved = await page.evaluate(api + ".getState()");
  await replaceFormula(page, "[input] / 1e15 * 2");
  expect((await page.evaluate(api + ".getPivotResult()")).cells[0].aggregates.sum).toBe(16);
  await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), saved);
  expect((await page.evaluate(api + ".getPivotResult()")).cells[0].aggregates.sum).toBe(8);
});

test("a formula replacement cannot mix new values into an earlier export capture", async ({ page }) => {
  const source = derivedView(); source.rows.push({ id: "s", cells: { input: 4e15 } });
  await open(page, source, pivotParts());
  await page.evaluate("window.capture=" + api + ".prepareExport({scope:'all'});window.records=window.capture.rows();");
  expect((await page.evaluate("window.records.next()")).value.cells.derived.value).toBe(8);
  await replaceFormula(page, "[input] / 1e15 * 2");
  const result = await page.evaluate(async () => { try { await window.records.next(); return "mixed"; } catch (error) { return error.message; } });
  expect(result).toMatch(/calculated|revision|snapshot/i);
  const fresh = await page.evaluate("(async()=>{const rows=[];for await(const row of " + api + ".prepareExport({scope:'all'}).rows())rows.push(row.cells.derived.value);return rows})()");
  expect(fresh).toEqual([16, 8]);
});

test("saved calculation definitions retain authored kinds and compatible presentation metadata", async ({ page }) => {
  const source = derivedView(); source.columns[1].format = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  await open(page, source, pivotParts()); const before = await page.evaluate(api + ".getState()");
  const result = await page.evaluate(async () => {
    const api = document.querySelector('[data-canopyx-host]').canopyx;
    try { await api.setCalculatedColumns([{ ...api.getCalculatedColumns()[0], kind: "text", expression: '"text"' }]); return "accepted"; } catch (error) { return error.message; }
  });
  expect(result).toContain("declared result kind"); expect(await page.evaluate(api + ".getState()")).toEqual(before);
});
