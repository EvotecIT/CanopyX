import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";

const parts = () => ["buckets", "values", "pivot"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");
function source() {
  const view = definition(); delete view.reporting.detail; view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.rows = [[2, "Open", 60], [2, "Other", 50], [2, "Closed", 5], [3, "Open", 40], [3, "Other", 30], [3, "Closed", 20], [4, "Open", 10]]
    .map(([items, status, amount], index) => ({ id: "r" + index, cells: { order: "O" + index, customer: "C" + index,
      region: index % 2 ? "South" : null, status, items, amount, placed: "2026-01-01T00:00:00Z" } }));
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }, { column: "customer", direction: "asc" }],
    columns: [{ column: "items", direction: "asc" }, { column: "status", direction: "asc" }], values: ["total", "orders"], maxColumns: 3 };
  return view;
}

test("pivot export preserves typed identities, exact prefix totals and contiguous collapsed column ranges", async ({ page }, testInfo) => {
  const view = source(); await open(page, view, parts());
  const accepted = await page.evaluate(api + ".getPivotResult()");
  const row = accepted.rows.find(node => node.path.length === 1), column = accepted.columns.find(node => node.path.length === 1);
  await page.evaluate(async ([row, column]) => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    await grid.setPivotCollapsed("rows", row, true); await grid.setPivotCollapsed("columns", column, true);
  }, [row.key, column.key]);
  const snapshot = await page.evaluate(api + ".getPivotExport()");
  expect(snapshot.rowAxis).toEqual(accepted.rows); expect(snapshot.columnAxis).toEqual(accepted.columns);
  expect(snapshot.query).toEqual(accepted.query); expect(snapshot.definition).toEqual(accepted.definition);
  expect(snapshot.matched).toBe(7); expect(snapshot.distinctColumns).toBe(7); expect(snapshot.columnsLimited).toBe(true);
  expect(snapshot.retainedColumns).toEqual([[2, "Open"], [2, "Other"]]);
  const group = snapshot.columnGroups.find(group => group.key === column.key);
  expect(group).toMatchObject({ firstColumn: 3, columnCount: 4, depth: 1, collapsed: true, hidden: false });
  const descendants = snapshot.columns.slice(group.firstColumn, group.firstColumn + group.columnCount);
  expect(descendants.map(item => item.axisKey)).toEqual(accepted.columns.filter(node => node.parent === column.key).flatMap(node => [node.key, node.key]));
  expect(descendants.every(item => item.hidden && !item.summary && item.outlineLevel === 1)).toBe(true);
  expect(snapshot.columns.filter(item => item.axisKey === column.key).every(item => item.summary && item.collapsed && !item.hidden)).toBe(true);
  expect(snapshot.rows.filter(item => accepted.rows.find(node => node.key === item.axisKey)?.parent === row.key).every(item => item.hidden)).toBe(true);
  const grand = snapshot.rows.find(item => item.grandTotal), total = snapshot.columns.find(item => item.grandTotal && item.aggregate === "total");
  expect(grand.cells[total.id]).toMatchObject({ value: 215, mode: "value", numberFormat: "0.00" });
  const prefix = snapshot.columns.find(item => item.axisKey === column.key && item.aggregate === "total");
  expect(grand.cells[prefix.id].value).toBe(115);
  const other = snapshot.columns.find(item => item.axisKey === "c:other" && item.aggregate === "total");
  expect(grand.cells[other.id].value).toBe(105);
  expect(snapshot.columnAxis.find(item => item.key === "c:other")).toMatchObject({ path: [], other: true });
  expect(snapshot.columnAxis.find(item => item.path[1] === "Other").other).toBe(false);
  await page.evaluate(api + ".setAggregateShowAs('total','percentGrandTotal')");
  const percent = await page.evaluate(api + ".getPivotExport()");
  expect(percent.rows.find(item => item.grandTotal).cells[prefix.id]).toMatchObject({ value: 115 / 215, mode: "percentGrandTotal", numberFormat: "0.00%" });
  expect(await page.evaluate("(async()=>{const e=await " + api + ".getPivotExport();return Object.isFrozen(e)&&Object.isFrozen(e.columnGroups)&&Object.isFrozen(e.rowAxis[1].path)&&Object.isFrozen(e.rows[0].cells)})()")).toBe(true);

  // A hosted reader allows parent-before-child order. The export still makes each outline range contiguous.
  const hosted = { ...accepted, rows: [...accepted.rows].sort((a, b) => a.path.length - b.path.length),
    columns: [...accepted.columns].sort((a, b) => (a.other ? 1 : a.path.length) - (b.other ? 1 : b.path.length)) };
  await open(page, view, parts() + ";CanopyX.configure('orders',{source:{query:async query=>({protocol:'canopyx/2',type:'gridPage',view:'orders',revision:query.revision||'hosted-export',offset:query.offset," +
    "total:7,matched:7,items:" + JSON.stringify(view.rows) + "}),pivot:async request=>({..." + JSON.stringify(hosted) + ",query:request.query,revision:request.query.revision})}});");
  const normalized = await page.evaluate(api + ".getPivotExport()");
  expect(normalized.rows.map(item => item.axisKey)).toEqual(snapshot.rows.map(item => item.axisKey));
  expect(normalized.columns.map(item => item.axisKey)).toEqual(snapshot.columns.map(item => item.axisKey));
  expect(normalized.columnGroups.map(({ collapsed, hidden, ...group }) => group)).toEqual(snapshot.columnGroups.map(({ collapsed, hidden, ...group }) => group));
  const fixture = testInfo.outputPath("pivot-export-fixture.json");
  fs.writeFileSync(fixture, JSON.stringify({ view, accepted, snapshot, percent }, null, 2));
  await testInfo.attach("pivot-export-fixture.json", { path: fixture, contentType: "application/json" });
});

test("a total-only pivot exports one numeric column per value without a synthetic outline", async ({ page }) => {
  const view = source(); view.reporting.pivot = { rows: [], columns: [], values: ["total", "orders"] };
  await open(page, view, parts()); const snapshot = await page.evaluate(api + ".getPivotExport()");
  expect(snapshot.columnGroups).toEqual([]); expect(snapshot.rows).toHaveLength(1); expect(snapshot.columns).toHaveLength(3);
  expect(snapshot.rows[0]).toMatchObject({ axisKey: "r", summary: true, grandTotal: true, collapsed: false, hidden: false });
  expect(snapshot.columns.slice(1).every(item => item.axisKey === "c" && item.grandTotal && !item.hidden)).toBe(true);
  expect(snapshot.rows[0].cells[snapshot.columns[1].id].value).toBe(215);
});
