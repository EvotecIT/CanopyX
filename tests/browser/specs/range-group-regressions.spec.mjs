// Grouped ranges keep visual positions while clipboard/fill operations target data records only.
import { test, expect } from "@playwright/test";
import { serveGrid } from "./column-groups-support.mjs";

function definition() {
  return { protocol: "canopyx/2", type: "grid", id: "ranged-groups", label: "Grouped records", pageSize: 50, selection: "none", search: true,
    source: { kind: "inline" }, rangeSelection: { fillHandle: true }, reporting: { groupBy: [{ column: "team", direction: "asc" }], groupable: true },
    columns: [{ id: "name", title: "Name", kind: "text", width: 200, sortable: true, editable: true },
      { id: "team", title: "Team", kind: "text", width: 120, sortable: true },
      { id: "amount", title: "Amount", kind: "number", width: 140, sortable: true, editable: true }],
    rows: [
      { id: "a0", cells: { name: "Alpha", team: "A", amount: 1 } },
      { id: "a1", cells: { name: "Beta", team: "A", amount: 2 } },
      { id: "a2", cells: { name: "Gamma", team: "B", amount: 100 } },
      { id: "a3", cells: { name: "Delta", team: "B", amount: 200 } } ] };
}
const cell = (page, id) => page.locator(`.cx-canvas .cx-row[data-cx-id="${id}"] .cx-cell`).nth(2);
const open = (page, data = definition(), options = "{}") => serveGrid(page, data, { runtime: "canopyx-reporting", options });
const changes = page => page.evaluate(() => api.getChanges().map(change => [change.id, change.values.amount]));
test.beforeEach(({ page }) => { page.pageErrors = []; page.on("pageerror", error => page.pageErrors.push(error.message)); });
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); expect(await page.evaluate(() => window.errors)).toEqual([]); });

test("grouped ranges retain shown positions while counts and copies include only data cells", async ({ page }) => {
  await open(page);
  await page.evaluate(() => api.selectAllCells());
  expect(await page.evaluate(() => api.getCellRanges())).toEqual([{ startRow: 0, endRow: 5, startColumn: "name", endColumn: "amount" }]);
  await expect(page.locator(".cx-live")).toHaveText("4 rows × 3 columns selected");
  await expect(page.locator(".cx-cell[aria-selected=true]")).toHaveCount(12);
  expect(await page.evaluate(() => api.getCellRangeText({ values: "raw" }))).toBe("Alpha\tA\t1\r\nBeta\tA\t2\r\nGamma\tB\t100\r\nDelta\tB\t200\r\n");
  await page.evaluate(() => api.setCellRanges([{ startRow: 1, endRow: 4, startColumn: "amount" }, { startRow: 5, startColumn: "amount" }]));
  await expect(page.locator(".cx-live")).toHaveText("2 ranges selected, 4 cells");
});

test("multiline paste crosses group headings without consuming input lines", async ({ page }) => {
  await open(page, definition(), "{onPaste:detail=>events.push(detail.cells.map(cell=>[cell.id,cell.row,cell.value]))}");
  const result = await page.evaluate(() => api.pasteCells("10\n20\n30\n40", { row: 1, column: "amount" }));
  expect(result).toEqual({ applied: 4, refused: [], cancelled: false });
  expect(await page.evaluate(() => events[0])).toEqual([["a0", 1, 10], ["a1", 2, 20], ["a2", 4, 30], ["a3", 5, 40]]);
  expect(await changes(page)).toEqual([["a0", 10], ["a1", 20], ["a2", 30], ["a3", 40]]);
});

test("multiline paste skips expanded detail rows as well as group headings", async ({ page }) => {
  await open(page, definition(), "{detail:{render:(record,element)=>{element.textContent='Detail '+record.id;}}}");
  await page.evaluate(() => api.expandDetail("a0"));
  await expect(page.locator('.cx-detail-row[data-cx-detail="a0"]')).toBeVisible();
  const result = await page.evaluate(() => api.pasteCells("10\n20\n30\n40", { row: 1, column: "amount" }));
  expect(result).toEqual({ applied: 4, refused: [], cancelled: false });
  expect(await changes(page)).toEqual([["a0", 10], ["a1", 20], ["a2", 30], ["a3", 40]]);
});

test("arithmetic fill continues over records without assigning series values to headings", async ({ page }) => {
  await open(page, definition(), "{onPaste:detail=>events.push({source:detail.source,cells:detail.cells.map(cell=>[cell.id,cell.value])})}");
  await page.evaluate(() => api.setCellRanges([{ startRow: 1, endRow: 2, startColumn: "amount" }]));
  const handle = await page.locator(".cx-fill-handle").boundingBox(), target = await cell(page, "a3").boundingBox();
  await page.mouse.move(handle.x + 3, handle.y + 3); await page.mouse.down();
  await page.mouse.move(target.x + 10, target.y + 10, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => changes(page)).toEqual([["a2", 3], ["a3", 4]]);
  expect(await page.evaluate(() => events[0])).toEqual({ source: "fill", cells: [["a2", 3], ["a3", 4]] });
});

test("fill down takes the first selected data row when a range starts on a heading", async ({ page }) => {
  await open(page); await cell(page, "a0").click();
  await expect(cell(page, "a0")).toBeFocused();
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 5, startColumn: "amount" }]));
  await expect(cell(page, "a0")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+d");
  await expect.poll(() => changes(page)).toEqual([["a1", 1], ["a2", 1], ["a3", 1]]);
  await page.evaluate(() => api.undo()); expect(await changes(page)).toEqual([]);
});

test("detail insertion removal and group reorder clear positions before they target different records", async ({ page }) => {
  await open(page, definition(), "{detail:{render:(record,element)=>{element.textContent='Detail '+record.id;}}}");
  const select = () => page.evaluate(() => api.setCellRanges([{ startRow: 2, startColumn: "amount" }]));
  await select(); await page.evaluate(() => api.expandDetail("a0"));
  expect(await page.evaluate(() => api.getCellRanges())).toEqual([]);
  await select(); await page.evaluate(() => api.collapseDetail("a0"));
  expect(await page.evaluate(() => api.getCellRanges())).toEqual([]);
  await select(); await page.evaluate(() => api.setGroupBy([{ column: "team", direction: "desc" }]));
  expect(await page.evaluate(() => api.getCellRanges())).toEqual([]);
});

test("pasted values await asynchronous validation and rejected cells remain unchanged", async ({ page }) => {
  await open(page, definition(), "{editing:{validators:{amount:async value=>{events.push(value);await Promise.resolve();return value===20?'Over limit':null;}}}}");
  const result = await page.evaluate(() => api.pasteCells("10\n20\n30\n40", { row: 1, column: "amount" }));
  expect(result.applied).toBe(3);
  expect(result.refused.map(cell => [cell.id, cell.reason])).toEqual([["a1", "Over limit"]]);
  expect(await changes(page)).toEqual([["a0", 10], ["a2", 30], ["a3", 40]]);
  await expect(cell(page, "a1")).toHaveText("2");
  expect(await page.evaluate(() => events)).toEqual([10, 20, 30, 40]);
  await page.evaluate(() => api.undo()); expect(await changes(page)).toEqual([]);
});

test("paste rechecks editability when an earlier field makes a later cell read-only", async ({ page }) => {
  await open(page, definition(), "{editing:{isEditable:(row,column)=>column!=='amount'||row.cells.name!=='Locked',validators:{name:async()=>null}}}");
  const result = await page.evaluate(() => api.pasteCells("Locked\tA\t10", { row: 1, column: "name" }));
  expect(result.applied).toBe(1);
  expect(result.refused.map(cell => cell.column)).toEqual(["team", "amount"]);
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]))).toEqual([["a0", { name: "Locked" }]]);
  await expect(cell(page, "a0")).toHaveText("1");
});

test("range text and headers use shared formula protection while raw typed numbers stay numeric", async ({ page }) => {
  const data = definition(); data.columns[0].title = "  =Name";
  const names = ["  =SUM(A1)", "\t=SUM(B1)", "＝SUM(C1)", "Safe"];
  data.rows.forEach((row, index) => { row.cells.name = names[index]; row.cells.amount = -index - 1; });
  await open(page, data); await page.evaluate(() => api.selectAllCells());
  const text = await page.evaluate(() => api.getCellRangeText({ headers: true, values: "raw" }));
  expect(text).toBe("'  =Name\tTeam\tAmount\r\n'  =SUM(A1)\tA\t-1\r\n\"'\t=SUM(B1)\"\tA\t-2\r\n'＝SUM(C1)\tB\t-3\r\nSafe\tB\t-4\r\n");
  expect(await page.evaluate(() => api.view.rows.map(row => row.cells.name))).toEqual(names);
});
