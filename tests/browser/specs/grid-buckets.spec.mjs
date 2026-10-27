import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";

const bucketPart = () => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-buckets.js"), "utf8");
function calendarView(kind = "month", timeZone = "UTC") {
  const view = definition();
  view.reporting.groupBy = [{ column: "placed", direction: "asc", bucket: { kind, timeZone, firstWeekday: 1 } }];
  delete view.reporting.detail;
  return view;
}

test("calendar bucket groups retain every record and follow chronological keys", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, calendarView(), bucketPart());
  const summary = await page.evaluate(api + ".getSummary()");
  expect(summary.groups.map(group => [group.value, group.count])).toEqual([[24300, 31], [24301, 17]]);
  expect(summary.groups.reduce((sum, group) => sum + group.count, 0)).toBe(48);
  await expect(page.locator(".cx-grid-group-text").first()).toContainText("2026-01");
  await page.evaluate(api + ".setGroupBy([{column:'placed',direction:'asc',bucket:{kind:'week'}}])");
  expect((await page.evaluate(api + ".getSummary()")).groups.map(group => group.count).reduce((a, b) => a + b, 0)).toBe(48);
  expect((await page.evaluate(api + ".getState()")).query.groupBy[0].bucket).toEqual({ kind: "week", timeZone: "UTC", firstWeekday: 1 });
  expect(errors).toEqual([]);
});

test("hour buckets merge repeated DST hours and omit a skipped hour", async ({ page }) => {
  const view = calendarView("hour", "America/New_York");
  const instants = ["2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"];
  view.rows = view.rows.slice(0, 4).map((row, index) => ({ ...row, cells: { ...row.cells, placed: instants[index] } }));
  await open(page, view, bucketPart());
  expect((await page.evaluate(api + ".getSummary()")).groups.map(group => [group.value, group.count])).toEqual([[1, 3], [3, 1]]);
  await expect(page.locator(".cx-grid-group-text").first()).toContainText("01:00");
});

test("bucket facets display labels and install numeric bucket filters that survive saved state", async ({ page }) => {
  const view = calendarView();
  view.reporting.facetColumns = ["placed"];
  view.facets = { position: "top", columns: [{ column: "placed", bucket: { kind: "month" } }] };
  await open(page, view, bucketPart());
  await expect(page.locator(".cx-facet-text").first()).toHaveText("2026-01");
  await page.locator(".cx-facet-val input").first().check();
  await expect.poll(async () => (await page.evaluate(api + ".getSummary()")).matched).toBe(31);
  const state = await page.evaluate(api + ".getState()");
  expect(state.query.filters[0].bucket.kind).toBe("month");
  expect(state.query.filters[0].values).toEqual([24300]);
  const facet = await page.evaluate(api + ".getFacets('placed',{bucket:{kind:'month'},includeCurrentFilter:false})");
  expect(facet.items.map(item => [item.value, item.count])).toEqual([[24300, 31], [24301, 17]]);
});

test("explicit numeric intervals are half-open and sort numerically across negative values", async ({ page }) => {
  const view = definition(); delete view.reporting.detail;
  view.reporting.groupBy = [{ column: "amount", direction: "asc", bucket: { kind: "edges", edges: [-10, 0, 10] } }];
  view.rows = view.rows.slice(0, 5).map((row, index) => ({ ...row, cells: { ...row.cells, amount: [-11, -10, -1, 0, 10][index] } }));
  await open(page, view, bucketPart());
  expect((await page.evaluate(api + ".getSummary()")).groups.map(group => [group.value, group.count])).toEqual([[0, 1], [1, 2], [2, 1], [3, 1]]);
});

test("the grouping chip changes calendar and range partitions without replacing raw cells", async ({ page }) => {
  await open(page, calendarView(), bucketPart());
  await page.getByLabel("Placed: Bucket", { exact: true }).selectOption("quarter");
  await expect.poll(async () => (await page.evaluate(api + ".getSummary()")).groups.length).toBe(1);
  await expect(page.locator(".cx-grid-group-text").first()).toContainText("2026 Q1");
  await page.evaluate(api + ".setGroupBy([{column:'amount',direction:'asc'}])");
  await page.getByLabel("Amount: Bucket", { exact: true }).selectOption("width");
  await expect(page.getByLabel("Amount: Range width", { exact: true })).toBeVisible();
  await page.getByLabel("Amount: Range width", { exact: true }).fill("250");
  await page.getByLabel("Amount: Range width", { exact: true }).press("Tab");
  await expect.poll(async () => (await page.evaluate(api + ".getGroupBy()"))[0].bucket.width).toBe(250);
  expect((await page.evaluate(api + ".getSummary()")).matched).toBe(48);
});
