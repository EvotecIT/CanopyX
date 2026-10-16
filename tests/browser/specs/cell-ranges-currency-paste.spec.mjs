// Currency paste contracts at the public host/editing boundary: signs, accounting amounts, locale separators and refusals.
import { test, expect } from "@playwright/test";
import { budgetView, serveGrid, bodyCell, rowId } from "./column-groups-support.mjs";

const currencies = [
  { name: "English", lang: "en", amount: "1,234.50", currency: "$" },
  { name: "German", lang: "de", amount: "1.234,50", currency: "€" },
  { name: "Polish", lang: "pl", amount: "1\u00a0234,50", currency: "zł" },
  { name: "French", lang: "fr", amount: "1\u202f234,50", currency: "€" }
];

for (const { name, lang, amount, currency } of currencies) {
  test("currency signs and accounting paste as numbers in " + name, async ({ page }) => {
    await serveGrid(page, budgetView({ rangeSelection: true }), { lang,
      options: "{ onPaste(detail) { events.push({ source: detail.source, cells: detail.cells, refused: detail.refused }); } }" });
    const original = await bodyCell(page, 0, 2).textContent();
    const texts = ["-" + currency + amount, "(" + currency + amount + ")", currency + "-" + amount,
      "+" + currency + amount, "-" + amount + currency, "(" + amount + currency + ")", "(" + amount + ")" + currency, "-3.5e2", "\u2212" + currency + amount];
    const result = await page.evaluate(texts => api.pasteCells(texts.join("\n"), { row: 0, column: "jan" }), texts);
    const [detail] = await page.evaluate(() => events);
    expect(detail.source).toBe("api");
    expect(detail.cells.map(cell => [cell.id, cell.column, cell.text, cell.value])).toEqual(texts.map((text, index) =>
      [rowId(index), "jan", text, index === 3 ? 1234.5 : index === 7 ? -350 : -1234.5]));
    expect(detail.refused).toEqual([]);
    expect(result).toEqual({ applied: 0, refused: [], cancelled: false });
    // A host-only paste offers values without mutating the displayed rows.
    await expect(bodyCell(page, 0, 2)).toHaveText(original);
    expect(await page.evaluate(() => errors)).toEqual([]);
  });
}

test("malformed currency signs and unsafe amounts are refused before reaching the host", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), {
    options: "{ onPaste(detail) { events.push({ cells: detail.cells, refused: detail.refused }); } }" });
  const texts = ["--$1,234.50", "+-$1,234.50", "(-$1,234.50)", "(+$1,234.50)", "$1,234.50-", "$1,234.50+",
    "($1,234.50", "$1,234.50)", "$1,2,34.50", "$1x234.50", "($1)2", "$1e309", "$9007199254740992", "$Infinity", "$NaN",
    "(\u2212$1,234.50)", "\u2212-$1,234.50"];
  const result = await page.evaluate(texts => api.pasteCells(texts.join("\n"), { row: 0, column: "jan" }), texts);
  expect(result.applied).toBe(0);
  expect(result.cancelled).toBe(false);
  expect(result.refused.map(cell => [cell.id, cell.column, cell.text, cell.value])).toEqual(texts.map((text, index) => [rowId(index), "jan", text, null]));
  expect(result.refused.every(cell => cell.reason.includes("is not a valid value for Jan"))).toBe(true);
  const [detail] = await page.evaluate(() => events);
  expect(detail.cells).toEqual([]);
  expect(detail.refused).toEqual(result.refused);
  await expect(page.locator(".cx-paste-report")).toBeVisible();
  await expect(bodyCell(page, 0, 2)).toHaveText("1,000");
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("parsed currency still follows editing limits and one paste undo step", async ({ page }) => {
  const view = budgetView({ rangeSelection: true });
  for (const column of view.columns.filter(column => ["jan", "feb"].includes(column.id)))
    Object.assign(column, { editable: true, validation: { min: -2000, max: 2000 } });
  await serveGrid(page, view, { options: "{ editing: { isEditable: (row, column) => !(row.id === 'r0001' && column === 'feb') } }" });
  const result = await page.evaluate(() => api.pasteCells("-$1,234.50\t($2,345.50)\n+$1,234.50\t($1,234.50)", { row: 0, column: "jan" }));
  expect(result.applied).toBe(2);
  expect(result.refused.map(cell => [cell.id, cell.column, cell.value, cell.reason])).toEqual([
    [rowId(1), "feb", -1234.5, "This cell cannot be changed."],
    [rowId(0), "feb", -2345.5, "Feb must be at least -2,000."]
  ]);
  expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values]))).toEqual([
    [rowId(0), { jan: -1234.5 }], [rowId(1), { jan: 1234.5 }]
  ]);
  await expect(bodyCell(page, 0, 2)).toHaveText("-1,234.5");
  expect(await page.evaluate(() => api.canUndo())).toBe(true);
  await page.evaluate(() => api.undo());
  expect(await page.evaluate(() => api.getChanges())).toEqual([]);
  await expect(bodyCell(page, 0, 2)).toHaveText("1,000");
  expect(await page.evaluate(() => errors)).toEqual([]);
});
