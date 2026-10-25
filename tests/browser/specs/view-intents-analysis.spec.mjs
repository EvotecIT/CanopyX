import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const parts = () => ["buckets", "values", "pivot", "view-intents"].map(name => fs.readFileSync(path.join(assets, "canopyx-" + name + ".js"), "utf8")).join("\n") +
  ";document.head.append(Object.assign(document.createElement('style'),{textContent:" + JSON.stringify(["pivot", "view-intents"].map(name => fs.readFileSync(path.join(assets, "canopyx-" + name + ".css"), "utf8")).join("\n")) + "}));";
const proposal = extra => ({ protocol: "canopyx/2", type: "viewIntent", version: 1, view: "orders", ...extra });
const pivot = (rows = "region", columns = "status", values = ["total"]) => ({ rows: [{ column: rows, direction: "asc" }], columns: [{ column: columns, direction: "asc" }], values });
async function start(page, options = {}) {
  const view = definition({ viewIntents: true }); delete view.reporting.detail; view.reporting.groupBy = [];
  view.reporting.pivotable = options.pivotable !== false;
  if (options.locale) {
    const source = JSON.parse(fs.readFileSync(path.join(repo, "CanopyX/Views/Locales/labels.json"), "utf8"));
    view.labels = Object.fromEntries(Object.entries(source).filter(([name]) => !["OverflowNote", "UnknownTotal", "HiddenRows", "FullReport"].includes(name)).map(([name, value]) => [name[0].toLowerCase() + name.slice(1), value[["pl", "de", "es", "fr", "it"].indexOf(options.locale)]]));
  }
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, view, parts() + ";window.intentQueries=[];CanopyX.configure('orders',{onQuery({query}){intentQueries.push(query);}});", options.theme || "light"); return errors;
}
async function preview(page, input) {
  await page.evaluate(async input => { window.preview = await document.querySelector("[data-canopyx-host]").canopyx.applyViewIntent(input); }, input);
}
const state = page => page.evaluate(api + ".getPivot()");

test("pivot intent previews without a query then activates, changes axes and values, and returns to records", async ({ page }) => {
  const errors = await start(page);
  const initial = await page.evaluate(api + ".getQuery()");
  await preview(page, proposal({ pivot: pivot() }));
  expect(await state(page)).toBeNull(); expect(await page.evaluate(api + ".getQuery()")).toEqual(initial);
  await expect(page.locator(".cx-view-intent-preview")).toContainText("Row groups: Region");
  await page.evaluate("preview.apply()");
  await expect(page.locator(".cx-pivot-table")).toBeVisible();
  expect((await state(page)).rows[0].column).toBe("region");
  let result = await page.evaluate(api + ".getPivotResult()");
  expect(result.rows.some(node => node.path[0] === "North")).toBe(true);
  await preview(page, proposal({ pivot: pivot("status", "region", ["orders"]) }));
  await page.evaluate("preview.apply()");
  result = await page.evaluate(api + ".getPivotResult()");
  expect(result.rows.some(node => node.path[0] === "Open")).toBe(true);
  expect(result.columns.some(node => node.path[0] === "North")).toBe(true);
  expect(result.definition.values).toEqual(["orders"]);
  const exported = await page.evaluate(api + ".getViewIntent()");
  expect(exported.pivot.values).toEqual(["orders"]); expect(exported.pivot.active).toBeUndefined();
  await preview(page, proposal({ pivot: false })); await page.evaluate("preview.apply()");
  await expect(page.locator(".cx-pivot-table:visible")).toHaveCount(0);
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(48);
  expect((await page.evaluate(api + ".getViewIntent()")).pivot).toBe(false);
  await preview(page, exported); await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getViewIntent()")).pivot).toEqual(exported.pivot);
  expect(errors).toEqual([]);
});

test("bucket grouping and pivot chips roundtrip canonical analysis definitions", async ({ page }) => {
  await start(page);
  const level = { column: "placed", direction: "asc", bucket: { kind: "month", timeZone: "UTC", firstWeekday: 1 } };
  await preview(page, proposal({ query: { groupBy: [level] } })); await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getViewIntent()")).query.groupBy).toEqual([level]);
  const input = proposal({ query: { groupBy: [] }, pivot: { rows: [level], columns: [], values: ["orders"], maxColumns: 7, topNColumns: 3,
    sortByTotal: { aggregate: "orders", direction: "desc" } } });
  await preview(page, input);
  await expect(page.locator(".cx-view-intent-preview")).toContainText("Month, UTC");
  await expect(page.locator(".cx-view-intent-preview")).toContainText("7");
  await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getViewIntent()")).pivot).toEqual(input.pivot);
});

for (const [name, change] of [
  ["unknown axis", value => { value.rows[0].column = "missing"; }],
  ["unknown aggregate", value => { value.values = ["missing"]; }],
  ["saved active flag", value => { value.active = true; }],
  ["collapsed state", value => { value.collapsedRows = []; }],
  ["axis aggregate", value => { value.rows[0].aggregate = "total"; }],
  ["column limit", value => { value.maxColumns = 201; }],
  ["wrong bucket kind", value => { value.rows[0].bucket = { kind: "month" }; }]
]) test(`pivot intent rejects ${name} before changing accepted state`, async ({ page }) => {
  await start(page); const before = await page.evaluate(api + ".getState()"), input = pivot(); change(input);
  expect(await page.evaluate(async input => { try { await document.querySelector("[data-canopyx-host]").canopyx.applyViewIntent(input); return false; } catch { return true; } }, proposal({ pivot: input }))).toBe(true);
  expect(await page.evaluate(api + ".getState()")).toEqual(before);
  await expect(page.locator(".cx-view-intent-preview")).toHaveCount(0);
});

test("pivot intents require the declared opt-in and stale previews preserve the newer pivot", async ({ page }) => {
  await start(page, { pivotable: false });
  expect(await page.evaluate(async input => { try { await document.querySelector("[data-canopyx-host]").canopyx.validateViewIntent(input); return false; } catch { return true; } }, proposal({ pivot: false }))).toBe(true);
  await page.unroute("http://canopyx.test/orders"); await start(page);
  await preview(page, proposal({ pivot: pivot() }));
  await page.evaluate(input => document.querySelector("[data-canopyx-host]").canopyx.setPivot(input), pivot("status", "region", ["orders"]));
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
  expect((await state(page)).rows[0].column).toBe("status");
});

test("exported drill-through correlation and bucket predicates retain exact records", async ({ page }) => {
  await start(page);
  const tuples = [{ columns: [{ column: "region" }, { column: "status" }], values: [["North", "Open"], ["South", "Closed"]], exclude: false }];
  await page.evaluate(input => document.querySelector("[data-canopyx-host]").canopyx.setQuery(input), { tupleFilters: tuples });
  const before = await page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId));
  expect(before).toHaveLength(8);
  const exported = await page.evaluate(api + ".getViewIntent()"); expect(exported.query.tupleFilters).toEqual(tuples);
  await page.evaluate(api + ".setQuery({tupleFilters:[]})");
  await preview(page, exported); await page.evaluate("preview.apply()");
  expect(await page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId))).toEqual(before);
  const bucket = { kind: "month", timeZone: "UTC", firstWeekday: 1 };
  await preview(page, proposal({ query: { tupleFilters: [], filters: [{ column: "placed", operator: "eq", values: [24300], bucket }] } }));
  await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(31);
  const filtered = await page.evaluate(api + ".getViewIntent()");
  expect(filtered.query.filters[0].bucket).toEqual(bucket);
  await preview(page, filtered); await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getViewIntent()")).query).toEqual(filtered.query);
});

for (const locale of ["pl", "de", "es", "fr", "it"]) test(`pivot preview uses ${locale} labels with no query or service call`, async ({ page }) => {
  const errors = await start(page, { locale }); const requests = []; page.on("request", request => requests.push(request.url()));
  const count = await page.evaluate("intentQueries.length");
  const source = JSON.parse(fs.readFileSync(path.join(repo, "CanopyX/Views/Locales/labels.json"), "utf8"));
  await preview(page, proposal({ pivot: pivot() }));
  await expect(page.locator(".cx-view-intent-preview")).toContainText(source.GridPivotRows[["pl", "de", "es", "fr", "it"].indexOf(locale)]);
  await expect(page.locator(".cx-view-intent-preview")).toContainText(source.GridPivotValues[["pl", "de", "es", "fr", "it"].indexOf(locale)]);
  await page.evaluate("preview.cancel()");
  expect(await page.evaluate("intentQueries.length")).toBe(count); expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test("an unrestricted exported intent clears newer drill-through restrictions on replay", async ({ page }) => {
  await start(page);
  const exported = await page.evaluate(api + ".getViewIntent()");
  await page.evaluate(api + ".setQuery({tupleFilters:[{columns:[{column:'region'}],values:[['North']]}]})");
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(12);
  await preview(page, exported); await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(48);
  expect((await page.evaluate(api + ".getViewIntent()")).query.tupleFilters).toEqual([]);
});

test("an accepted explicit-offset datetime tuple exports as UTC and replays the same records", async ({ page }) => {
  await start(page);
  await page.evaluate(api + ".setQuery({tupleFilters:[{columns:[{column:'placed'}],values:[['2026-01-01T02:00:00+02:00'],[null]]}]})");
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(1);
  const exported = await page.evaluate(api + ".getViewIntent()");
  expect(exported.query.tupleFilters[0].values).toEqual([["2026-01-01T00:00:00.000Z"], [null]]);
  await page.evaluate(api + ".setQuery({tupleFilters:[]})");
  await preview(page, exported); await page.evaluate("preview.apply()");
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(1);
  await expect(page.locator('.cx-row[data-cx-id="o000"]')).toBeVisible();
});

for (const kind of ["pivot cap", "pivot bucket zone", "pivot bucket weekday", "group bucket", "filter bucket", "nested filter bucket", "tuple bucket"])
  test(`explicit-null ${kind} is rejected before a validated snapshot`, async ({ page }) => {
    await start(page);
    const bucket = { kind: "month", timeZone: null }, level = { column: "placed", direction: "asc", bucket };
    const input = kind === "pivot cap" ? { pivot: { ...pivot(), maxColumns: null } } :
      kind.startsWith("pivot") ? { pivot: { ...pivot(), rows: [{ ...level, bucket: kind.endsWith("weekday") ? { kind: "month", firstWeekday: null } : bucket }] } } :
      kind === "group bucket" ? { query: { groupBy: [level] } } :
      kind === "tuple bucket" ? { query: { tupleFilters: [{ columns: [{ column: "placed", bucket }], values: [[24300]] }] } } :
      kind === "nested filter bucket" ? { query: { filterGroup: { operator: "and", filters: [{ column: "placed", bucket, operator: "eq", values: [24300] }], groups: [] } } } :
      { query: { filters: [{ column: "placed", bucket, operator: "eq", values: [24300] }] } };
    const before = await page.evaluate(api + ".getState()");
    expect(await page.evaluate(async input => {
      try { await document.querySelector("[data-canopyx-host]").canopyx.validateViewIntent(input); return false; } catch { return true; }
    }, proposal(input))).toBe(true);
    expect(await page.evaluate(api + ".getState()")).toEqual(before);
  });
