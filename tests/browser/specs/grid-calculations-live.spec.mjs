import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";
import { open, api } from "./grid-grouping-fixtures.mjs";

const calculations = () => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-calculations.js"), "utf8");
function definition() {
  return { protocol: "canopyx/2", type: "grid", id: "live-calculations", label: "Live calculations", source: { kind: "inline" }, pageSize: 100, rowHeight: 34, selection: "none",
    live: { stableOrder: false, flash: true }, columns: [{ id: "input", title: "Input", kind: "number", sortable: true },
      { id: "derived", title: "Derived", kind: "number", sortable: true, calculation: "[input] * 2" }],
    rows: [{ id: "a", cells: { input: 1 } }, { id: "b", cells: { input: 2 } }] };
}

for (const operation of ["update", "add", "replace"]) test("live calculated values drive membership and order after " + operation, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const time = new Date("2026-10-31T00:00:00Z");
  await page.clock.install({ time });
  await open(page, definition(), calculations());
  await page.evaluate(api + ".setQuery({sort:[{column:'derived',direction:'desc'}],filters:[{column:'derived',operator:'ge',values:[4]}]})");
  // Export enumeration may outlast a transient flash on a busy runner. Freeze before the update, then paint it.
  await page.clock.pauseAt(new Date(time.getTime() + 60000));
  const result = await page.evaluate(async operation => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    if (operation === "update") await grid.updateRows([{ id: "a", cells: { input: 3 } }]);
    else if (operation === "add") await grid.addRows([{ id: "a", cells: { input: 3 } }]);
    else await grid.setRows([{ id: "a", cells: { input: 3 } }, { id: "b", cells: { input: 2 } }]);
    const rows = []; for await (const row of grid.prepareExport({ scope: "filtered" }).rows()) rows.push([row.id, row.cells.derived.value]);
    return { rows, loaded: grid.getLoadedRows(["a"])[0].cells.derived };
  }, operation);
  expect(result).toEqual({ rows: [["a", 6], ["b", 4]], loaded: 6 });
  await page.clock.runFor(32);
  await expect(page.locator('[data-cx-id="a"] .cx-live-flash').filter({ hasText: "6" })).toBeVisible();
  await page.evaluate(api + ".updateRows([{id:'a',cells:{input:0}}])");
  await page.clock.runFor(32);
  await expect(page.locator('[data-cx-id="a"]')).toHaveCount(0); expect(errors).toEqual([]);
});

test("ordinary live matching keeps working after another grid loads calculations", async ({ page }) => {
  const ordinary = definition(); ordinary.columns = ordinary.columns.filter(column => !column.calculation);
  await open(page, ordinary, calculations());
  await page.evaluate(async definition => {
    const host = document.createElement("div"); document.body.append(host);
    const calculated = CanopyX.createDataGrid(host, { view: definition }); await calculated.ready;
    const ordinary = document.querySelector('[data-canopyx-host]').canopyx;
    await ordinary.updateRows([{ id: "a", cells: { input: 3 } }]);
  }, definition());
  expect((await page.evaluate(api + ".getLoadedRows(['a'])"))[0].cells.input).toBe(3);
});

test("grouped live updates calculate before aggregate projection", async ({ page }) => {
  const view = definition(); view.columns.push({ id: "category", title: "Category", kind: "text", sortable: true });
  view.rows.forEach(row => row.cells.category = "All");
  view.reporting = { groupBy: [{ column: "category", direction: "asc" }], aggregates: [{ id: "total", column: "derived", operation: "sum", label: "Total" }] };
  await open(page, view, calculations());
  await page.evaluate(api + ".updateRows([{id:'a',cells:{input:3}}])");
  expect((await page.evaluate(api + ".getSummary()")).aggregates.total).toBe(10);
});
