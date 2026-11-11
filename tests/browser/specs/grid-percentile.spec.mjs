// Built-in median and percentile aggregates. The shared vectors (tests/fixtures/aggregate-percentile.json) are checked by the
// C# CanopyGridAggregate too; the page tests cover group rows, the summary row, footers, the aggregate menu, saved views
// and pivot values over inline data.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { repo } from "./support.mjs";
import { api, definition, open, orders } from "./grid-grouping-fixtures.mjs";

const vectors = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/aggregate-percentile.json"), "utf8"));
// Execute the maintained aggregate source in a test context for its pure percentile function; the runtime never uses vm.
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx.aggregates.source/10-aggregate-values.js"), "utf8"), context);
const assets = path.join(repo, "CanopyX.Html/Assets");
const parts = (...names) => names.map(name => fs.readFileSync(path.join(assets, "canopyx-" + name + ".js"), "utf8")).join("\n");

// The documented method, written independently: rank (n - 1) * p / 100 of the ascending values, linear between the closest ranks.
function ranked(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b), rank = (sorted.length - 1) * percentile / 100, lower = Math.floor(rank);
  return sorted[lower] + (sorted[Math.ceil(rank)] - sorted[lower]) * (rank - lower);
}

for (const vector of vectors) test("shared percentile vector: " + vector.id, () => {
  const values = vector.values.filter(value => value !== null);
  expect(context.groupPercentile(values, vector.operation === "median" ? 50 : vector.percentile)).toBe(vector.expected);
});

function latencyView() {
  const view = definition(); delete view.reporting.detail;
  view.reporting.groupBy = [{ column: "region", direction: "asc" }];
  view.reporting.aggregates = [{ id: "median", column: "amount", operation: "median", label: "Amount" },
    { id: "p95", column: "amount", operation: "percentile", percentile: 95, label: "Amount" }];
  view.footers = [{ id: "totals", label: "Totals", scope: "all", aggregates: [{ id: "tail", column: "amount", operation: "percentile", percentile: 99.5, label: "P99.5" }] }];
  return view;
}

test("medians and percentiles label group rows, the summary and footers with values ranked from the records", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, latencyView(), parts("values"));
  const rows = orders(), amounts = region => rows.filter(row => !region || row.cells.region === region).map(row => row.cells.amount);
  const summary = await page.evaluate(api + ".getSummary()");
  expect(summary.aggregates.median).toBeCloseTo(ranked(amounts(), 50), 9);
  expect(summary.aggregates.p95).toBeCloseTo(ranked(amounts(), 95), 9);
  for (const group of summary.groups) {
    expect(group.aggregates.median).toBeCloseTo(ranked(amounts(group.value), 50), 9);
    expect(group.aggregates.p95).toBeCloseTo(ranked(amounts(group.value), 95), 9);
  }
  const heading = page.locator(".cx-grid-group .cx-aggregate-button").first();
  await expect(heading).toHaveText(/^Median [\d,.]+ · P95 [\d,.]+$/);
  await expect(heading).toHaveAttribute("title", /^Amount · Median: [\d,.]+ · Amount · P95: [\d,.]+$/);
  await expect(page.locator(".cx-footer-row")).toContainText("P99.5 ");
  // The aggregate menu names each value by its label and function.
  await heading.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Amount · Median"); await expect(dialog).toContainText("Amount · P95");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("groups ordered by a percentile survive a saved and restored view", async ({ page }) => {
  await open(page, latencyView(), parts("values"));
  await page.evaluate(api + ".setGroupBy([{ column: 'region', direction: 'desc', aggregate: 'p95' }])");
  const rows = orders(), p95 = region => ranked(rows.filter(row => row.cells.region === region).map(row => row.cells.amount), 95);
  const expected = [...new Set(rows.map(row => row.cells.region))].sort((a, b) => p95(b) - p95(a));
  await expect.poll(async () => (await page.evaluate(api + ".getSummary()")).groups.map(group => group.value)).toEqual(expected);
  const state = await page.evaluate(api + ".getState()");
  await page.evaluate(api + ".setGroupBy([{ column: 'region', direction: 'asc' }])");
  await page.evaluate(state => document.querySelector("[data-canopyx-host]").canopyx.setState(state), state);
  await expect.poll(async () => (await page.evaluate(api + ".getSummary()")).groups.map(group => group.value)).toEqual(expected);
});

test("pivot values rank each intersection and name their percentile", async ({ page }) => {
  const view = latencyView(); view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [{ column: "status", direction: "asc" }], values: ["median", "p95"] };
  await open(page, view, parts("buckets", "values", "pivot"));
  const result = await page.evaluate(api + ".getPivotResult()"), rows = orders();
  for (const cell of result.cells) {
    const row = result.rows.find(node => node.key === cell.row), column = result.columns.find(node => node.key === cell.column);
    const amounts = rows.filter(record => (!row.path.length || record.cells.region === row.path[0]) &&
      (!column.path.length || record.cells.status === column.path[0])).map(record => record.cells.amount);
    expect(cell.aggregates.median).toBeCloseTo(ranked(amounts, 50), 9);
    expect(cell.aggregates.p95).toBeCloseTo(ranked(amounts, 95), 9);
  }
  await expect(page.locator(".cx-pivot-table")).toContainText("Amount · P95");
  await expect(page.locator(".cx-pivot-table")).toContainText("Amount · Median");
});

test("a percentile needs a percentile between 0 and 100 and keeps one identity", async ({ page }) => {
  await open(page);
  const failures = await page.evaluate(async () => {
    const attempt = async aggregates => {
      const host = document.createElement("div"); document.body.appendChild(host);
      const view = { protocol: "canopyx/2", type: "grid", id: "p" + Math.random().toString(36).slice(2), label: "P", source: { kind: "inline" }, pageSize: 10,
        selection: "none", columns: [{ id: "a", title: "A", kind: "number", sortable: true }], rows: [], reporting: { aggregates } };
      try { await CanopyX.createDataGrid(host, { view }).ready; return "ready"; } catch (error) { return error.message; }
    };
    return [await attempt([{ id: "x", column: "a", operation: "percentile", label: "A" }]),
      await attempt([{ id: "x", column: "a", operation: "percentile", percentile: 100, label: "A" }]),
      await attempt([{ id: "x", column: "a", operation: "median", percentile: 50, label: "A" }]),
      await attempt([{ id: "x", column: "a", operation: "percentile", percentile: 99.9, label: "A" }])];
  });
  expect(failures.slice(0, 3).every(message => /invalid aggregate binding/.test(message))).toBe(true);
  expect(failures[3]).toBe("ready");
});
