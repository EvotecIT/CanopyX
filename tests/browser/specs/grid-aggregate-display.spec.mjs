import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { repo } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";

const vectors = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/aggregate-display.json"), "utf8"));
const valuesPart = () => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-values.js"), "utf8");
// Execute the maintained pure math source in a test context; product runtime and user expressions never use vm or eval.
const math = {};
vm.runInNewContext(fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx.values.source/10-values-math.js"), "utf8"), {
  GRID_SHOW_AS: math, GRID_SHOW_AS_MODES: [...new Set(vectors.map(vector => vector.mode))]
});

for (const vector of vectors) test("shared aggregate display vector: " + vector.id, () => {
  const actual = math.evaluate(vector.values, vector.mode, vector.grand, vector.parent, vector.rows, vector.columns);
  expect(actual.length).toBe(vector.expected.length);
  actual.forEach((value, index) => vector.expected[index] === null ? expect(value).toBeNull() : expect(value).toBeCloseTo(vector.expected[index], 12));
  expect(math.numberFormat(vector.mode)).toBe(math.percent(vector.mode) ? "0.00%" : vector.mode === "rank" ? "0" : "0.00");
});

test("aggregate percentages display a caption and expose numeric values with export formats", async ({ page }) => {
  const view = definition(); delete view.reporting.detail;
  view.reporting.aggregates[0].showAs = "percentGrandTotal";
  await open(page, view, valuesPart());
  const raw = await page.evaluate(api + ".getSummary()"), display = await page.evaluate(api + ".getDisplaySummary()");
  const first = raw.groups[0];
  expect(display.groups[first.key].total.value).toBeCloseTo(first.aggregates.total / raw.aggregates.total, 12);
  expect(display.groups[first.key].total.numberFormat).toBe("0.00%");
  expect(display.totals.total.value).toBe(1);
  await expect(page.locator(".cx-grid-group .cx-aggregate-button").first()).toContainText("of grand total");
  expect((await page.evaluate(api + ".getSummary()")).aggregates.total).toBe(raw.aggregates.total);
});

test("the aggregate menu changes display mode and saves intent without changing the accepted query", async ({ page }) => {
  const view = definition(); delete view.reporting.detail;
  await open(page, view, valuesPart());
  await page.evaluate(() => {
    window.__aggregateErrors = [];
    document.querySelector("[data-canopyx-host]").addEventListener("canopyx:error", event => window.__aggregateErrors.push(event.detail.error?.message));
  });
  const query = await page.evaluate(api + ".getQuery()"), raw = await page.evaluate(api + ".getSummary()");
  await page.locator(".cx-grid-group .cx-aggregate-button").first().click();
  await page.getByLabel("Total amount: Show values as", { exact: true }).selectOption("rank");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await page.evaluate(api + ".getState()")).aggregateShowAs?.total).toBeUndefined();
  await page.locator(".cx-grid-group .cx-aggregate-button").first().click();
  await page.getByLabel("Total amount: Show values as", { exact: true }).selectOption("rank");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await page.evaluate("window.__aggregateErrors")).toEqual([]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cx-grid-group .cx-aggregate-button").first()).toContainText("Rank");
  const state = await page.evaluate(api + ".getState()");
  expect(state.aggregateShowAs.total).toBe("rank");
  expect(await page.evaluate(api + ".getQuery()")).toEqual(query);
  expect((await page.evaluate(api + ".getSummary()")).aggregates).toEqual(raw.aggregates);
  expect((await page.evaluate(api + ".getShareState()")).aggregateShowAs.total).toBe("rank");
  await page.evaluate(api + ".setAggregateShowAs('total','value')");
  await page.evaluate(state => document.querySelector("[data-canopyx-host]").canopyx.setState(state), state);
  expect((await page.evaluate(api + ".getState()")).aggregateShowAs.total).toBe("rank");
  await expect(page.locator(".cx-grid-group .cx-aggregate-button").first()).toContainText("Rank");
});

test("an undefined difference keeps its caption and menu available", async ({ page }) => {
  const view = definition(); delete view.reporting.detail;
  view.rows = view.rows.slice(0, 1); view.reporting.groupBy = [{ column: "region", direction: "asc" }];
  view.reporting.aggregates = [{ ...view.reporting.aggregates[0], showAs: "difference" }];
  await open(page, view, valuesPart());
  await expect(page.locator(".cx-grid-group .cx-aggregate-button")).toContainText("Difference from previous");
  await page.locator(".cx-grid-group .cx-aggregate-button").click();
  await page.getByLabel("Total amount: Show values as", { exact: true }).selectOption("value");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cx-grid-group .cx-aggregate-button")).not.toContainText("—");
});

test("phone aggregates retain their display-mode menu when the source columns are hidden", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const view = definition(); delete view.reporting.detail; view.reporting.aggregates[0].showAs = "percentGrandTotal";
  await open(page, view, valuesPart(), "dark");
  await page.locator(".cx-grid-group .cx-hidden-aggregates").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("pre")).toContainText("Total amount");
  await expect.poll(() => dialog.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= -1 && box.bottom <= innerHeight + 1; })).toBe(true);
  await page.getByLabel("Total amount: Show values as", { exact: true }).selectOption("rank");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  expect((await page.evaluate(api + ".getState()")).aggregateShowAs.total).toBe("rank");
  await expect(page.locator(".cx-grid-group .cx-hidden-aggregates").first()).toContainText("Rank");
  const geometry = await page.evaluate(() => {
    const button = document.querySelector(".cx-grid-group .cx-hidden-aggregates"); return { hasTitle: !!button.title, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(geometry).toEqual({ hasTitle: true, overflow: false });
});
