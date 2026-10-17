// Clipboard text must retain real calendar dates and the values of a configured select editor.
import { test, expect } from "@playwright/test";
import { budgetView, serveGrid, rowId } from "./column-groups-support.mjs";

const observePaste = "{ onPaste(detail) { events.push({ cells: detail.cells, refused: detail.refused }); } }";
const changes = page => page.evaluate(() => api.getChanges().map(change => [change.id, change.values]));

for (const editable of [false, true]) {
  test("zoned pasted dates reject calendar rollover " + (editable ? "before editing" : "before the host"), async ({ page }) => {
    const view = budgetView({ rangeSelection: true });
    Object.assign(view.columns.find(column => column.id === "reviewed"), { editable });
    await serveGrid(page, view, { options: observePaste });
    const texts = ["2026-02-30T00:00:00Z", "2026-02-29T10:30:00+02:00", "2026-04-31T23:59:59.125-05:00",
      "2026-03-01T24:00:00Z", "2026-02-30", "30.02.2026 10:30"];
    const result = await page.evaluate(texts => api.pasteCells(texts.join("\n"), { row: 0, column: "reviewed" }), texts);
    expect(result).toMatchObject({ applied: 0, cancelled: false });
    expect(result.refused.map(cell => [cell.id, cell.text, cell.value])).toEqual(texts.map((text, index) => [rowId(index), text, null]));
    expect(result.refused.every(cell => cell.reason.includes("is not a valid value for Reviewed"))).toBe(true);
    expect(await page.evaluate(() => events[0].cells)).toEqual([]);
    if (editable) expect(await changes(page)).toEqual([]);
    await expect(page.locator(".cx-paste-report")).toBeVisible();
    expect(await page.evaluate(() => errors)).toEqual([]);
  });
}

test("valid zoned and local pasted dates retain their instant and leap day", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: observePaste, lang: "pl" });
  const texts = ["2024-02-29T23:59:59.125+02:00", "2026-04-30T23:59-05:00", "2026-03-01T00:00:00Z",
    "2024-02-29", "29.02.2024 10:30"];
  const result = await page.evaluate(texts => api.pasteCells(texts.join("\n"), { row: 0, column: "reviewed" }), texts);
  expect(result).toEqual({ applied: 0, refused: [], cancelled: false });
  expect(await page.evaluate(() => events[0].cells.map(cell => cell.value))).toEqual([
    "2024-02-29T21:59:59.125Z", "2026-05-01T04:59:00.000Z", "2026-03-01T00:00:00.000Z",
    "2024-02-29T00:00:00.000Z", "2024-02-29T10:30:00.000Z"
  ]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

function choiceView() {
  const select = (id, title, kind, options, required = false) => ({ id, title, kind, editable: true,
    editor: { type: "select", options }, validation: { required } });
  const view = budgetView({ rangeSelection: true }, 4);
  view.columns = [{ id: "line", title: "Budget line", kind: "text", rowHeader: true },
    select("code", "Code", "text", [{ value: "internal", label: "Display" }]),
    select("amount", "Amount", "number", [{ value: 2, label: "Two" }]),
    select("date", "Date", "datetime", [{ value: "2026-04-01T10:15:00Z", label: "Spring review" }]),
    select("flag", "Flag", "text", [{ value: false, label: "Disabled" }, { value: true, label: "Enabled" }]),
    select("optional", "Optional", "text", ["internal"]), select("required", "Required", "text", ["internal"], true)];
  delete view.columnGroups;
  for (const row of view.rows) row.cells = { line: row.cells.line, code: "old", amount: 1,
    date: "2026-01-01T00:00:00Z", flag: true, optional: "internal", required: "internal" };
  return view;
}

test("select paste resolves configured labels and values before the column kind", async ({ page }) => {
  await serveGrid(page, choiceView(), { options: observePaste });
  const result = await page.evaluate(() => api.pasteCells("display\tTwo\tSpring review\tDisabled\nINTERNAL\t2\t2026-04-01T10:15:00Z\tfalse", { row: 0, column: "code" }));
  expect(result).toEqual({ applied: 8, refused: [], cancelled: false });
  const values = { code: "internal", amount: 2, date: "2026-04-01T10:15:00Z", flag: false };
  expect(await changes(page)).toEqual([[rowId(0), values], [rowId(1), values]]);
  expect(await page.evaluate(() => events[0].cells.map(cell => cell.value))).toEqual(Object.values(values).concat(Object.values(values)));
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id="r0000"] .cx-cell').nth(2)).toHaveText("Two");
  await page.evaluate(() => api.undo());
  expect(await changes(page)).toEqual([]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("select paste refuses nonchoices even when their text fits the column kind", async ({ page }) => {
  await serveGrid(page, choiceView(), { options: observePaste });
  const result = await page.evaluate(() => api.pasteCells("Unlisted\t3\t2026-05-01T00:00:00Z\tno", { row: 0, column: "code" }));
  expect(result).toMatchObject({ applied: 0, cancelled: false });
  expect(result.refused.map(cell => [cell.column, cell.text, cell.value])).toEqual([
    ["code", "Unlisted", null], ["amount", "3", null], ["date", "2026-05-01T00:00:00Z", null], ["flag", "no", null]
  ]);
  expect(await page.evaluate(() => events[0].cells)).toEqual([]);
  expect(await changes(page)).toEqual([]);
  await expect(page.locator(".cx-paste-report")).toBeVisible();
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("empty select paste clears an optional choice and respects required validation", async ({ page }) => {
  await serveGrid(page, choiceView());
  const result = await page.evaluate(() => api.pasteCells(" \t ", { row: 0, column: "optional" }));
  expect(result).toMatchObject({ applied: 1, cancelled: false });
  expect(result.refused.map(cell => [cell.column, cell.value, cell.reason])).toEqual([["required", null, "Required is required."]]);
  expect(await changes(page)).toEqual([[rowId(0), { optional: null }]]);
  await page.evaluate(() => api.undo());
  expect(await changes(page)).toEqual([]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("an explicitly labelled empty-string select option remains distinct from clearing", async ({ page }) => {
  const view = choiceView();
  view.columns.find(column => column.id === "optional").editor.options.push({ value: "", label: "Empty choice" });
  await serveGrid(page, view);
  const result = await page.evaluate(() => api.pasteCells("Empty choice", { row: 0, column: "optional" }));
  expect(result).toEqual({ applied: 1, refused: [], cancelled: false });
  expect(await changes(page)).toEqual([[rowId(0), { optional: "" }]]);
  await page.evaluate(() => api.undo());
  expect(await changes(page)).toEqual([]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});
