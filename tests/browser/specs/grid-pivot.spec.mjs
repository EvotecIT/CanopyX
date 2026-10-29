import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const parts = () => ["buckets", "values", "pivot"].map(name => fs.readFileSync(path.join(assets, "canopyx-" + name + ".js"), "utf8")).join("\n") +
  ";document.head.append(Object.assign(document.createElement('style'),{textContent:" + JSON.stringify(fs.readFileSync(path.join(assets, "canopyx-pivot.css"), "utf8")) + "}));";
function pivotView() {
  const view = definition(); delete view.reporting.detail; view.reporting.groupBy = [];
  view.reporting.pivotable = true;
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [{ column: "status", direction: "asc" }], values: ["total", "average", "orders"] };
  return view;
}

test("pivot computes complete-query totals and drills a cell to its exact records", async ({ page }) => {
  const view = pivotView(), errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, view, parts());
  const result = await page.evaluate(api + ".getPivotResult()");
  expect(result.matched).toBe(view.rows.length);
  const grand = result.cells.find(cell => cell.row === "r" && cell.column === "c");
  expect(grand.aggregates.total).toBe(view.rows.reduce((sum, row) => sum + row.cells.amount, 0));
  expect(grand.aggregates.average).toBe(grand.aggregates.total / view.rows.length);
  await expect(page.locator(".cx-pivot-table")).toBeVisible();
  const row = result.rows.find(node => node.path[0] === "North"), column = result.columns.find(node => node.path[0] === "Open");
  const count = result.cells.find(cell => cell.row === row.key && cell.column === column.key).count;
  await page.getByRole("button", { name: /^Show records for North, Open: Total amount/ }).click();
  await expect.poll(() => page.evaluate(api + ".getQuery().tupleFilters?.length")).toBe(2);
  expect(await page.evaluate(api + ".getPivot().active")).toBe(false);
  const exported = await page.evaluate("(async()=>{const e=" + api + ".prepareExport({scope:'filtered'});const rows=[];for await(const row of e.rows())rows.push(row);return rows})()");
  expect(exported).toHaveLength(count); expect(exported.map(row => [row.cells.region.value, row.cells.status.value])).toEqual(Array.from({ length: count }, () => ["North", "Open"]));
  await page.getByRole("button", { name: "Return to pivot", exact: true }).click();
  await expect(page.locator(".cx-pivot-table")).toBeVisible(); expect(await page.evaluate(api + ".getQuery().tupleFilters")).toBeUndefined(); expect(errors).toEqual([]);
});

test("both axes collapse without changing totals and saved views restore the pivot", async ({ page }) => {
  const view = pivotView(); view.reporting.pivot.rows.push({ column: "customer", direction: "asc" }); view.reporting.pivot.columns.push({ column: "items", direction: "asc" });
  await open(page, view, parts());
  const result = await page.evaluate(api + ".getPivotResult()"), row = result.rows.find(node => node.path.length === 1), column = result.columns.find(node => node.path.length === 1);
  const before = await page.locator(".cx-pivot-table tbody tr").count();
  const states = await page.evaluate(async ([row, column]) => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    await grid.setPivotCollapsed("rows", row, true); const first = grid.getPivot();
    await grid.setPivotCollapsed("columns", column, true); return [first, grid.getPivot()];
  }, [row.key, column.key]);
  expect(states[0].collapsedRows).toContain(row.key); expect(states[1].collapsedRows).toContain(row.key);
  const state = await page.evaluate(api + ".getState()"); expect(state.pivot.collapsedRows).toContain(row.key); expect(state.pivot.collapsedColumns).toContain(column.key);
  expect(await page.locator(".cx-pivot-table tbody tr").count()).toBeLessThan(before);
  await page.evaluate(api + ".setPivot(false)"); await expect(page.locator(".cx-pivot-table")).toBeHidden();
  await page.evaluate(state => document.querySelector("[data-canopyx-host]").canopyx.setState(state), state);
  await expect(page.locator(".cx-pivot-table")).toBeVisible(); expect(await page.evaluate(api + ".getPivotResult().cells")).toEqual(result.cells);
  state.pivot.rows = [{ column: "status", direction: "asc" }]; state.pivot.columns = [{ column: "region", direction: "desc" }];
  state.pivot.collapsedRows = []; state.pivot.collapsedColumns = [];
  await page.evaluate(state => document.querySelector("[data-canopyx-host]").canopyx.setState(state), state);
  expect((await page.evaluate(api + ".getPivotResult()")).definition.rows).toEqual(state.pivot.rows);
  expect((await page.evaluate(api + ".getPivotResult()")).definition.columns).toEqual(state.pivot.columns);
});

test("calendar axes keep numeric bucket keys and two-level Other drill-through remains correlated", async ({ page }) => {
  const view = pivotView(); view.reporting.pivot.columns = [{ column: "placed", direction: "asc", bucket: { kind: "month" } }, { column: "status", direction: "asc" }];
  view.reporting.pivot.maxColumns = 3;
  await open(page, view, parts());
  const result = await page.evaluate(api + ".getPivotResult()"); expect(result.columnsLimited).toBe(true);
  expect(result.retainedColumns).toHaveLength(2); expect(result.retainedColumns.every(path => typeof path[0] === "number")).toBe(true);
  await expect(page.locator(".cx-pivot-note")).toContainText("combined in Other");
  const other = result.cells.find(cell => cell.row === "r" && cell.column === "c:other");
  await page.getByRole("button", { name: /^Show records for Grand total, Other: Orders · Count,/ }).click();
  const query = await page.evaluate(api + ".getQuery()"); expect(query.tupleFilters[0].exclude).toBe(true); expect(query.tupleFilters[0].columns[0].bucket.kind).toBe("month");
  const summary = await page.evaluate(api + ".getSummary()"); expect(summary.matched).toBe(other.count);
});

test("phone pivot scrolls all column groups and display changes keep numeric export values", async ({ page }) => {
  const view = pivotView(); view.reporting.pivot.rows.push({ column: "customer", direction: "asc" });
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, view, parts(), "dark");
  await expect(page.getByRole("combobox", { name: "Choose column", exact: true })).toHaveCount(0);
  expect(await page.locator(".cx-pivot-scroll").evaluate(scroll => scroll.scrollWidth > scroll.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Choose column", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Choose column", exact: true })).toHaveAttribute("data-hfx-part", "menu");
  await page.getByRole("menuitem", { name: "Grand total", exact: true }).click();
  expect(await page.locator(".cx-pivot-scroll").evaluate(scroll => scroll.scrollLeft)).toBeGreaterThan(0);
  await page.locator(".cx-pivot-scroll").evaluate(scroll => { scroll.scrollLeft = 0; });
  await page.locator(".cx-pivot-value-menu").first().click();
  await page.getByRole("combobox", { name: "Show values as", exact: true }).selectOption("percentRow");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cx-pivot-caption").first()).toHaveText("% of row total");
  const snapshot = await page.evaluate(api + ".getPivotExport()");
  await expect(page.locator(".cx-pivot-cell").first()).toHaveText(snapshot.rows[0].cells.v0_0.text);
  const value = Object.values(snapshot.rows[0].cells).find(cell => cell.mode === "percentRow"); expect(typeof value.value).toBe("number"); expect(value.numberFormat).toBe("0.00%");
  expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
  expect(await page.locator(".cx-pivot-table tfoot").evaluate(foot => foot.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
  expect(await page.locator(".cx-pivot-scroll").evaluate(scroll => scroll.scrollHeight > scroll.clientHeight)).toBe(true);
  await page.locator(".cx-pivot-toggle").click();
  const apply = page.getByRole("button", { name: "Apply", exact: true }); await apply.scrollIntoViewIfNeeded();
  await apply.click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cx-pivot-table")).toBeVisible();
  await page.locator(".cx-pivot-toggle").click();
  await page.getByRole("dialog").getByRole("button", {name:"Show records",exact:true}).click();
  await expect(page.locator(".cx-pivot-table")).toBeHidden();
  await expect(page.locator(".cx-grid")).toBeVisible();
});

test("pivot configuration validates axes and values without a script expression", async ({ page }) => {
  const view = pivotView(); delete view.reporting.pivot; await open(page, view, parts());
  const trigger = page.locator(".cx-pivot-toggle");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-hfx-part="body"]')).toHaveCount(1);
  expect(await dialog.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.every(input => input.getBoundingClientRect().width <= 28))).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("combobox", { name: "Row groups 1", exact: true }).selectOption("region");
  await page.getByRole("combobox", { name: "Column groups 1", exact: true }).selectOption("status");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cx-pivot-table")).toBeVisible();
  expect((await page.evaluate(api + ".getPivot()")).rows[0].column).toBe("region");
});
