import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";
import { definition, open, api } from "./grid-grouping-fixtures.mjs";

const parts = () => ["buckets", "values", "pivot"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");
const axes = (rows, columns, values) => ({ rows: [{ column: rows, direction: "asc" }], columns: [{ column: columns, direction: "asc" }],
  values, active: true, collapsedRows: [], collapsedColumns: [] });
async function start(page) {
  const view = definition(); delete view.reporting.detail; view.reporting.groupBy = []; view.reporting.pivotable = true;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, view, parts() + `;window.restoreCalls=[];window.restoreEvents=[];window.rejectRestore=false;window.restoreRevision=0;
    const records=${JSON.stringify(view.rows)};
    CanopyX.configure('orders',{onQuery({query}){restoreEvents.push(query);},source:{query:async query=>{
      restoreCalls.push(query); if(rejectRestore)throw new Error('Restore provider rejected');
      const result={protocol:'canopyx/2',type:'gridPage',view:'orders',revision:query.revision||'restore-'+(++restoreRevision),offset:query.offset,
        total:records.length,matched:records.length,items:records.slice(query.offset,query.offset+query.limit)};
      if(query.search==='deferred')return new Promise(resolve=>{window.finishRestore=()=>resolve(result);});
      return result;
    }}});`);
  return { view, errors };
}
async function restore(page, pivot) {
  return page.evaluate(async pivot => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    restoreCalls.length = 0; restoreEvents.length = 0;
    await grid.setState({ ...grid.getState(), pivot });
    return { calls: restoreCalls.length, events: restoreEvents.length, query: grid.getQuery(), pivot: grid.getPivot(), result: grid.getPivotResult(), summary: grid.getSummary() };
  }, pivot);
}

test("saved pivot restores query the selected mode once for activation, changed axes and values, and records", async ({ page }) => {
  const { view, errors } = await start(page), a = axes("region", "status", ["total"]), b = axes("status", "region", ["orders"]);
  let accepted = await restore(page, a);
  expect(accepted.calls).toBe(1); expect(accepted.events).toBe(1);
  expect(accepted.result.rows.some(node => node.path[0] === "North")).toBe(true);
  expect(accepted.result.columns.some(node => node.path[0] === "Open")).toBe(true);
  expect(accepted.result.cells.find(cell => cell.row === "r" && cell.column === "c").aggregates.total).toBe(view.rows.reduce((sum, row) => sum + row.cells.amount, 0));
  accepted = await restore(page, b);
  expect(accepted.calls).toBe(1); expect(accepted.events).toBe(1);
  expect(accepted.result.rows.some(node => node.path[0] === "Open")).toBe(true);
  expect(accepted.result.columns.some(node => node.path[0] === "North")).toBe(true);
  expect(accepted.result.definition.values).toEqual(["orders"]);
  expect(accepted.result.cells.find(cell => cell.row === "r" && cell.column === "c").aggregates.orders).toBe(48);
  accepted = await restore(page, { ...b, active: false });
  expect(accepted.calls).toBe(1); expect(accepted.events).toBe(1); expect(accepted.pivot.active).toBe(false);
  expect(accepted.summary.matched).toBe(48); expect(accepted.summary.aggregates.orders).toBe(48);
  expect(accepted.summary.revision).toBe(accepted.query.revision);
  await expect(page.locator(".cx-pivot-table:visible")).toHaveCount(0);
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
  const records = await page.evaluate("(async()=>{const rows=[];for await(const row of " + api + ".prepareExport({scope:'filtered'}).rows())rows.push(row.id);return rows})()");
  expect(records).toEqual(view.rows.map(row => row.id));
  expect(errors).toEqual([]);
});

test("provider rejection preserves the accepted pivot or records and a superseded restore cannot replace the newer result", async ({ page }) => {
  const { errors } = await start(page), a = axes("region", "status", ["total"]), b = axes("status", "region", ["orders"]);
  for (const pivot of [a, b, { ...b, active: false }]) {
    const before = await page.evaluate(api + ".getState()");
    const result = await page.evaluate(api + ".getPivotResult()");
    const failure = await page.evaluate(async pivot => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx; rejectRestore = true;
      try { await grid.setState({ ...grid.getState(), pivot }); return null; }
      catch (error) { return error.message; } finally { rejectRestore = false; }
    }, pivot);
    expect(failure).toBe("Restore provider rejected");
    expect(await page.evaluate(api + ".getState()")).toEqual(before);
    expect(await page.evaluate(api + ".getPivotResult()")).toEqual(result);
    if (!before.pivot?.active) await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
    else await expect(page.locator(".cx-pivot-table")).toBeVisible();
    await restore(page, pivot);
  }
  await page.evaluate(pivot => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, state = grid.getState();
    window.previousRestore = grid.setState({ ...state, query: { ...state.query, search: "deferred" }, pivot }).then(() => "accepted", error => error.name);
  }, a);
  await expect.poll(() => page.evaluate("typeof finishRestore")).toBe("function");
  const accepted = await restore(page, b);
  expect(await page.evaluate("previousRestore")).toBe("AbortError");
  await page.evaluate("finishRestore()");
  expect(accepted.result.definition.values).toEqual(["orders"]);
  expect((await page.evaluate(api + ".getPivotResult()")).rows.some(node => node.path[0] === "Open")).toBe(true);
  expect((await page.evaluate(api + ".getPivot()")).rows[0].column).toBe("status");
  expect(errors).toEqual([]);
});
