// Pasted and filled values must validate against the values that will actually be retained.
import { test, expect } from "@playwright/test";
import { serveGrid } from "./column-groups-support.mjs";

function definition() {
  return { protocol: "canopyx/2", type: "grid", id: "range-validation", label: "Validated values", pageSize: 50, selection: "none",
    source: { kind: "inline" }, rangeSelection: { fillHandle: true }, columns: ["base", "amount", "fee", "note"].map(id =>
      ({ id, title: id, kind: "number", width: 150, editable: true })), rows: [
      { id: "a-dependent", cells: { base: 10, amount: 10, fee: 10, note: 1 } },
      { id: "b-valid", cells: { base: 1, amount: 1, fee: 1, note: 1 } },
      { id: "c-untouched", cells: { base: 20, amount: 20, fee: 20, note: 1 } } ] };
}
const options = ({ asynchronous = false, baseFixed = true, hooks = "", guards = "" } = {}) => `{${hooks}editing:{${guards}validators:{
  base:${asynchronous ? "async " : ""}(value,row)=>${baseFixed ? "row.id==='a-dependent'&&value!==10?'Base is fixed.':null" : "null"},
  amount:${asynchronous ? "async " : ""}(value,row)=>(value??0)<(row.cells.base??0)?'Amount below base.':null,
  fee:${asynchronous ? "async " : ""}(value,row)=>(value??0)<(row.cells.amount??0)?'Fee below amount.':null
},validateRow:row=>(row.cells.amount??0)<(row.cells.base??0)||(row.cells.fee??0)<(row.cells.amount??0)?'Invalid final row.':null}}`;

const open = (page, view, options) => serveGrid(page, view, { options });

test.beforeEach(({ page }) => { page.pageErrors = []; page.on("pageerror", error => page.pageErrors.push(error.message)); });
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); expect(await page.evaluate(() => window.errors)).toEqual([]); });

for (const asynchronous of [false, true]) test(`partial paste revalidates dependent cells after refusals (${asynchronous ? "async" : "sync"} validators)`, async ({ page }, testInfo) => {
  const view = definition();
  await open(page, view, options({ asynchronous }));
  const result = await page.evaluate(() => api.pasteCells("2\t3\t4\t2\n2\t3\t4\t2", { row: 0, column: "base" }));
  const outcome = await page.evaluate(async () => ({ changes: api.getChanges(), validation: await api.validate(), source: api.view.rows }));
  await testInfo.attach("paste-outcome", { body: JSON.stringify({ result, ...outcome }, null, 2), contentType: "application/json" });
  expect(result.applied).toBe(5);
  expect(result.refused.map(cell => [cell.id, cell.column, cell.reason])).toEqual([
    ["a-dependent", "base", "Base is fixed."], ["a-dependent", "amount", "Amount below base."], ["a-dependent", "fee", "Fee below amount."] ]);
  expect(outcome.validation.valid).toBe(true);
  expect(outcome.changes.map(change => [change.id, change.values])).toEqual([
    ["a-dependent", { note: 2 }], ["b-valid", { base: 2, amount: 3, fee: 4, note: 2 }] ]);
  expect(outcome.source).toEqual(view.rows);
  await page.evaluate(() => api.undo()); expect(await page.evaluate(() => api.getChanges())).toEqual([]);
});

test("pasting empty fields revalidates dependent clear values and keeps valid rows", async ({ page }) => {
  await open(page, definition(), options({ asynchronous: true }));
  const result = await page.evaluate(() => api.pasteCells("\t\t\t\n\t\t\t", { row: 0, column: "base" }));
  expect(result.applied).toBe(5);
  expect(result.refused.map(cell => cell.column)).toEqual(["base", "amount", "fee"]);
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]))).toEqual([
    ["a-dependent", { note: null }], ["b-valid", { base: null, amount: null, fee: null, note: null }] ]);
  expect((await page.evaluate(() => api.validate())).valid).toBe(true);
  await page.evaluate(() => api.undo()); expect(await page.evaluate(() => api.getChanges())).toEqual([]);
});

test("fill down revalidates dependent values through the shared paste owner", async ({ page }) => {
  const view = definition(); view.rows.unshift({ id: "00-source", cells: { base: 2, amount: 3, fee: 4, note: 2 } });
  await open(page, view, options({ asynchronous: true }));
  const start = page.locator('.cx-canvas .cx-row[data-cx-id="00-source"] .cx-cell').first();
  await start.click(); await expect(start).toBeFocused();
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 2, startColumn: "base", endColumn: "note" }]));
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator(".cx-live")).toHaveText("Filled 5 cells. 3 cells were not pasted");
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]).sort(([left], [right]) => left.localeCompare(right)))).toEqual([
    ["a-dependent", { note: 2 }], ["b-valid", { base: 2, amount: 3, fee: 4, note: 2 }] ]);
  expect((await page.evaluate(() => api.validate())).valid).toBe(true);
  expect(await page.evaluate(() => api.view.rows)).toEqual(view.rows);
  await page.evaluate(() => api.undo()); expect(await page.evaluate(() => api.getChanges())).toEqual([]);
});

test("an editability refusal revalidates cells that depended on the refused proposal", async ({ page }) => {
  await open(page, definition(), options({ asynchronous: true, baseFixed: false,
    guards: "isEditable:(row,column)=>!(row.id==='a-dependent'&&column==='amount'&&row.cells.base===2)," }));
  const result = await page.evaluate(() => api.pasteCells("2\t3\t4\t2\n2\t3\t4\t2", { row: 0, column: "base" }));
  expect(result.applied).toBe(6);
  expect(result.refused.map(cell => [cell.id, cell.column, cell.reason])).toEqual([
    ["a-dependent", "amount", "This cell cannot be changed."], ["a-dependent", "fee", "Fee below amount."] ]);
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]))).toEqual([
    ["a-dependent", { base: 2, note: 2 }], ["b-valid", { base: 2, amount: 3, fee: 4, note: 2 }] ]);
  expect((await page.evaluate(() => api.validate())).valid).toBe(true);
});

test("changing vetoes precede mutation and changed hooks describe only the stable accepted cells", async ({ page }) => {
  const view = definition();
  await open(page, view, options({ asynchronous: true, baseFixed: false, hooks: `
    onCellValueChanging:detail=>{events.push(['changing',detail.id,detail.column,api.getChanges().length,detail.row.cells.base]);
      return !(detail.id==='a-dependent'&&detail.column==='base');},
    onCellValueChanged:detail=>events.push(['changed',detail.id,detail.column]),` }));
  const result = await page.evaluate(() => api.pasteCells("2\t3\t4\t2\n2\t3\t4\t2", { row: 0, column: "base" }));
  expect(result.applied).toBe(5);
  expect(result.refused.map(cell => cell.column)).toEqual(["base", "amount", "fee"]);
  const events = await page.evaluate(() => window.events);
  const changing = events.filter(event => event[0] === "changing"), changed = events.filter(event => event[0] === "changed");
  expect(changing.map(event => event.slice(1, 3))).toEqual(["a-dependent", "b-valid"].flatMap(id => ["base", "amount", "fee", "note"].map(column => [id, column])));
  expect(changing.every(event => event[3] === 0)).toBe(true);
  expect(changing.filter(event => event[1] === "a-dependent").map(event => event[4])).toEqual([10, 10, 10, 10]);
  expect(events.slice(0, changing.length)).toEqual(changing);
  expect(changed).toEqual([["changed", "a-dependent", "note"], ...["base", "amount", "fee", "note"].map(column => ["changed", "b-valid", column])]);
  expect((await page.evaluate(() => api.validate())).valid).toBe(true);
  expect(await page.evaluate(() => api.view.rows)).toEqual(view.rows);
  await page.evaluate(() => api.undo()); expect(await page.evaluate(() => api.getChanges())).toEqual([]);
});

test("a row changed during asynchronous paste validation keeps the reader's edit and aborts the paste", async ({ page }) => {
  const view = definition();
  await open(page, view, `{editing:{validators:{base:async(value,row)=>{
    if(row.id==='a-dependent'){window.waiting=true;await new Promise(resolve=>window.release=resolve);}return null;}}}}`);
  await page.evaluate(() => { window.pendingPaste = api.pasteCells("2\t3\t4\t2\n2\t3\t4\t2", { row: 0, column: "base" })
    .then(result => result, error => ({ name: error.name })); });
  await page.waitForFunction(() => window.waiting);
  await page.evaluate(() => api.setCellValue("a-dependent", "note", 9));
  await page.evaluate(() => window.release());
  expect(await page.evaluate(() => window.pendingPaste)).toEqual({ name: "AbortError" });
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]))).toEqual([["a-dependent", { note: 9 }]]);
  expect(await page.evaluate(() => api.view.rows)).toEqual(view.rows);
});

test("long validation dependencies conservatively refuse the remaining row within the work bound", async ({ page }) => {
  const view = definition(), ids = Array.from({ length: 9 }, (_, index) => "c" + index);
  view.columns = [...ids, "note"].map(id => ({ id, title: id, kind: "number", editable: true, width: 100 }));
  view.rows = ["a-dependent", "b-valid"].map(id => ({ id, cells: Object.fromEntries([...ids.map(column => [column, id === "a-dependent" ? 10 : 1]), ["note", 1]]) }));
  const validators = ids.map((id, index) => `${id}:(value,row)=>${index ? `value<row.cells.c${index - 1}?'Below c${index - 1}.':null` : "row.id==='a-dependent'&&value!==10?'Base is fixed.':null"}`).join(",");
  await open(page, view, `{editing:{validators:{${validators}},validateRow:row=>${ids.slice(1).map((id, index) => `row.cells.${id}<row.cells.c${index}`).join("||")}? 'Invalid final row.':null}}`);
  const values = [...ids.map((_, index) => index + 1), 2].join("\t");
  const result = await page.evaluate(text => api.pasteCells(text + "\n" + text, { row: 0, column: "c0" }), values);
  expect(result.applied).toBe(10);
  expect(result.refused.map(cell => cell.column)).toEqual([...ids, "note"]);
  expect(result.refused.slice(-2).map(cell => cell.reason)).toEqual(["Below c6.", "Below c6."]);
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]))).toEqual([
    ["b-valid", Object.fromEntries([...ids.slice(1).map((id, index) => [id, index + 2]), ["note", 2]])] ]);
  expect((await page.evaluate(() => api.validate())).valid).toBe(true);
  expect(await page.evaluate(() => api.view.rows)).toEqual(view.rows);
});
