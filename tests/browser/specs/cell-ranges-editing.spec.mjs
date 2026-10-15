// Pastes and fills through the editing part (docs/cell-ranges.md): each cell takes the column's read-only rules and checks,
// refused cells are listed, and one undo takes back the whole paste. The editing part ships separately; on a runtime without
// it these tests are skipped, and the paste tests in cell-ranges.spec.mjs cover the host path.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetView, serveGrid, bodyCell, rowId, MONTHS } from "./column-groups-support.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const editing = JSON.parse(fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-parts.json"), "utf8")).parts.some(part => part.name === "editing");
test.skip(!editing, "The editing part is not in this runtime.");
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

function editableBudget(extra = {}) {
  const view = budgetView({ rangeSelection: { fillHandle: true }, ...extra });
  for (const column of view.columns) if (MONTHS.includes(column.id)) Object.assign(column, { editable: true, validation: { min: 0, max: 100000 } });
  return view;
}
const value = (page, row, column) => page.evaluate(([id, column]) => api.getChanges().find(change => change.id === id)?.values[column], [rowId(row), column]);

test("a paste applies editable cells through editing, refuses read-only and invalid ones, and undoes as one step", async ({ page }) => {
  await serveGrid(page, editableBudget(), { options: "{ editing: { isEditable: (row, column) => !(row.id === 'r0001' && column === 'feb') } }" });
  await bodyCell(page, 0, 1).click();
  await page.evaluate(() => navigator.clipboard.writeText("Sales\t500\t600\n\t700\t-5\n"));
  await page.keyboard.press("Control+v");
  await expect(page.locator(".cx-live")).toHaveText("Pasted 3 cells. 3 cells were not pasted");
  expect(await value(page, 0, "jan")).toBe(500);
  expect(await value(page, 0, "feb")).toBe(600);
  expect(await value(page, 1, "jan")).toBe(700);
  expect(await value(page, 1, "feb")).toBeUndefined();
  await page.locator(".cx-paste-report summary").click();
  const reasons = await page.locator(".cx-paste-report li").allTextContents();
  expect(reasons).toHaveLength(3);
  expect(reasons.join("\n")).toContain("Team: This cell cannot be changed.");
  expect(reasons.join("\n")).toContain("Feb: This cell cannot be changed.");
  expect(reasons.join("\n")).toContain("Line 001, Feb");
  await expect(bodyCell(page, 0, 2)).toHaveText("500");
  expect(await page.evaluate(() => api.canUndo())).toBe(true);
  await page.evaluate(() => api.undo());
  expect(await page.evaluate(() => api.getChanges())).toEqual([]);
  await expect(bodyCell(page, 0, 2)).toHaveText("1,000");
  await page.evaluate(() => api.redo());
  expect(await value(page, 1, "jan")).toBe(700);
});

test("checks that fail are refused with their message and the valid cells are applied", async ({ page }) => {
  await serveGrid(page, editableBudget(), { options: "{ editing: { validators: { mar: value => value > 5000 ? 'Too much for March.' : null } } }" });
  const result = await page.evaluate(() => api.pasteCells("100\t200\t9000", { row: 2, column: "jan" }));
  expect(result.applied).toBe(2);
  expect(result.refused.map(cell => [cell.column, cell.reason])).toEqual([["mar", "Too much for March."]]);
  expect(await value(page, 2, "mar")).toBeUndefined();
});

test("a fill goes through editing as one undo step", async ({ page }) => {
  await serveGrid(page, editableBudget());
  await bodyCell(page, 0, 2).click();
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 3, startColumn: "jan", endColumn: "feb" }]));
  await page.keyboard.press("Control+d");
  await expect(page.locator(".cx-live")).toHaveText("Filled 6 cells");
  expect(await page.evaluate(() => api.getChanges().length)).toBe(3);
  await page.evaluate(() => api.undo());
  expect(await page.evaluate(() => api.getChanges())).toEqual([]);
});

test("cells the host's paste handler refuses are left alone by editing too", async ({ page }) => {
  await serveGrid(page, editableBudget(), { options: `{ onPaste(detail) { detail.respondWith({ refused: [{ id: "${rowId(0)}", column: "feb", reason: "Locked by the host." }] }); } }` });
  const result = await page.evaluate(() => api.pasteCells("10\t20\t30", { row: 0, column: "jan" }));
  expect(result.applied).toBe(2);
  expect(result.refused.map(cell => [cell.column, cell.reason])).toEqual([["feb", "Locked by the host."]]);
  expect(await value(page, 0, "feb")).toBeUndefined();
  expect(await value(page, 0, "mar")).toBe(30);
});