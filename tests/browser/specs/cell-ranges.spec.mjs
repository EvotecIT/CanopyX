// Cell ranges and the clipboard (docs/cell-ranges.md): ranges by mouse, keyboard and touch, several ranges, the outline in
// light, dark and forced colours, announcements, copy as tab-separated text with a typed table, paste through the paste
// event with a report of refused cells, the fill handle, the cell menu, and row selection beside them.
import { test, expect } from "@playwright/test";
import { exampleUrl, nextFrames } from "./support.mjs";
import { budgetView, serveGrid, bodyCell } from "./column-groups-support.mjs";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
const ranges = page => page.evaluate(() => api.getCellRanges());
const live = page => page.locator(".cx-live").textContent();
const clipboard = page => page.evaluate(async () => {
  const out = {};
  for (const item of await navigator.clipboard.read()) for (const type of item.types) out[type] = await (await item.getType(type)).text();
  return out;
});
async function drag(page, from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + 8, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 8, b.y + b.height / 2, { steps: 6 }); await page.mouse.up();
}

test("dragging over cells selects a range, outlines it, marks its cells and announces its size", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await drag(page, bodyCell(page, 1, 2), bodyCell(page, 3, 5));
  expect(await ranges(page)).toEqual([{ startRow: 1, endRow: 3, startColumn: "jan", endColumn: "apr" }]);
  expect(await live(page)).toBe("3 rows × 4 columns selected");
  expect(await page.locator(".cx-cell[aria-selected=true]").count()).toBe(12);
  expect(await page.getAttribute("[role=grid]", "aria-multiselectable")).toBe("true");
  const edges = await bodyCell(page, 1, 2).evaluate(cell => [...cell.classList].filter(name => name.startsWith("cx-range")).sort());
  expect(edges).toEqual(["cx-range", "cx-range-l", "cx-range-t"]);
  const fill = await bodyCell(page, 2, 3).evaluate(cell => getComputedStyle(cell).backgroundImage);
  expect(fill).toContain("linear-gradient");
  // Focus moved into the anchor cell, so the keyboard continues from there.
  expect(await page.evaluate(() => document.activeElement.closest(".cx-row").dataset.cxId + "/" + [...document.activeElement.parentElement.children].indexOf(document.activeElement))).toBe("r0001/2");
});

test("Shift+click spans from the anchor and Ctrl+click adds ranges; a plain click shows none", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await bodyCell(page, 2, 3).click();
  expect(await ranges(page)).toEqual([]);
  await bodyCell(page, 4, 6).click({ modifiers: ["Shift"] });
  expect(await ranges(page)).toEqual([{ startRow: 2, endRow: 4, startColumn: "feb", endColumn: "may" }]);
  await bodyCell(page, 8, 9).click({ modifiers: ["Control"] });
  expect(await ranges(page)).toHaveLength(2);
  expect(await live(page)).toBe("2 ranges selected, 13 cells");
  await page.keyboard.press("Escape");
  expect(await ranges(page)).toEqual([]);
  expect(await live(page)).toBe("Cell selection cleared");
});

test("one range at a time when several are off", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: { multiple: false } }));
  await bodyCell(page, 1, 2).click();
  await bodyCell(page, 2, 3).click({ modifiers: ["Control"] });
  expect(await ranges(page)).toEqual([]);
  expect(await page.getAttribute("[role=grid]", "aria-multiselectable")).toBe("true");
  await expect(page.evaluate(() => api.setCellRanges([{ startRow: 0, startColumn: "jan" }, { startRow: 1, startColumn: "jan" }]))).rejects.toThrow();
});

test("Shift with the arrow keys extends a range from the focused cell and keeps its far corner in view", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }, 300));
  await bodyCell(page, 1, 2).click();
  await page.keyboard.press("Shift+ArrowRight"); await page.keyboard.press("Shift+ArrowRight"); await page.keyboard.press("Shift+ArrowDown");
  expect(await ranges(page)).toEqual([{ startRow: 1, endRow: 2, startColumn: "jan", endColumn: "mar" }]);
  expect(await live(page)).toBe("2 rows × 3 columns selected");
  await page.keyboard.press("Control+Shift+ArrowDown");
  expect((await ranges(page))[0].endRow).toBe(299);
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id="r0299"]')).toBeVisible();
  await page.keyboard.press("Shift+End");
  expect((await ranges(page))[0].endColumn).toBe("reviewed");
  await page.keyboard.press("Shift+PageUp");
  expect((await ranges(page))[0].endRow).toBeLessThan(299);
  // A plain arrow clears the ranges and moves focus as before.
  await page.keyboard.press("ArrowDown");
  expect(await ranges(page)).toEqual([]);
  await page.keyboard.press("Control+a");
  expect(await ranges(page)).toEqual([{ startRow: 0, endRow: 299, startColumn: "line", endColumn: "reviewed" }]);
});

test("Ctrl+C copies tab-separated text and a typed table that keeps numbers and dates", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await bodyCell(page, 0, 1).click();
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "team", endColumn: "feb" }]));
  await page.keyboard.press("Control+c");
  await expect(page.locator(".cx-live")).toHaveText("Copied 2 rows × 3 columns");
  const copied = await clipboard(page);
  expect(copied["text/plain"]).toBe("Platform\t1,000\t1,130\r\nProduct\t1,070\t1,200\r\n");
  expect(copied["text/html"]).toContain('x:num="1130"');
  expect(copied["text/html"]).toContain("<td");
  const raw = await page.evaluate(() => { api.setCellRanges([{ startRow: 0, startColumn: "jan", endColumn: "reviewed" }]); return api.getCellRangeText({ values: "raw" }); });
  expect(raw.split("\t")[0]).toBe("1000");
  expect(raw.trim().split("\t").at(-1)).toBe("2026-01-10 10:30:00");
});

test("copies with headers carry the group rows above the column titles", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true, clipboard: { copyHeaders: true } }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, startColumn: "mar", endColumn: "apr" }]));
  const text = await page.evaluate(() => api.copyCellRanges());
  expect(text).toBe("First half\t\r\nQ1\tQ2\r\nMar\tApr\r\n1,260\t1,390\r\n");
  const html = (await clipboard(page))["text/html"];
  expect(html).toContain("First half");
  expect(html).toContain("Q2");
});

test("text that would start a spreadsheet formula is quoted, and fields with tabs or line breaks are quoted", async ({ page }) => {
  const view = budgetView({ rangeSelection: true });
  view.rows[0].cells.line = "=SUM(A1:A2)"; view.rows[1].cells.line = "two\tparts";
  await serveGrid(page, view);
  const text = await page.evaluate(() => { api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "line" }]); return api.getCellRangeText(); });
  expect(text).toBe("'=SUM(A1:A2)\r\n\"two\tparts\"\r\n");
});

test("copying loads the rows of a range that are not in the cache yet", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true, pageSize: 50 }, 2000));
  const text = await page.evaluate(() => { api.selectAllCells(); api.setCellRanges([{ startRow: 0, endRow: 1999, startColumn: "line" }]); return api.getCellRangeText(); });
  const lines = text.trim().split("\r\n");
  expect(lines).toHaveLength(2000);
  expect(lines[1999]).toBe("Line 1999");
});

test("ranges are cleared by a new query and kept by a reload of the same one", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 2, startColumn: "jan" }]));
  await page.evaluate(() => api.reload());
  expect(await ranges(page)).toHaveLength(1);
  await page.evaluate(() => api.sort([{ column: "jan", direction: "desc" }]));
  expect(await ranges(page)).toEqual([]);
});

test("paste offers the parsed cells to the host, applies none itself, and reports the refused ones", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: `{ onPaste(detail) { events.push(JSON.parse(JSON.stringify(detail))); detail.respondWith({ refused: detail.cells.filter(cell => cell.value < 0).map(cell => ({ id: cell.id, column: cell.column, reason: "Negative" })) }); } }` });
  await bodyCell(page, 0, 2).click();
  await page.evaluate(() => navigator.clipboard.writeText("1 234\t-5\tlots\n7\t8\t9\n"));
  await page.keyboard.press("Control+v");
  await expect(page.locator(".cx-paste-report")).toBeVisible();
  const [detail] = await page.evaluate(() => events);
  expect(detail.source).toBe("clipboard");
  expect(detail.cells.map(cell => [cell.id, cell.column, cell.value])).toEqual([["r0000", "jan", 1234], ["r0000", "feb", -5], ["r0001", "jan", 7], ["r0001", "feb", 8], ["r0001", "mar", 9]]);
  expect(detail.refused.map(cell => [cell.column, cell.text])).toEqual([["mar", "lots"]]);
  await expect(page.locator(".cx-live")).toHaveText("Pasted 4 cells. 2 cells were not pasted");
  await page.locator(".cx-paste-report summary").click();
  expect(await page.locator(".cx-paste-report li").allTextContents()).toEqual(["Row Line 000, Mar: “lots” is not a valid value for Mar.", "Row Line 000, Feb: Negative"]);
  // The pasted block becomes the range; nothing changed in the grid without the editing part.
  expect(await ranges(page)).toEqual([{ startRow: 0, endRow: 1, startColumn: "jan", endColumn: "mar" }]);
  expect(await bodyCell(page, 0, 2).textContent()).toBe("1,000");
  await page.locator(".cx-paste-report button").click();
  await expect(page.locator(".cx-paste-report")).toHaveCount(0);
});

test("a single pasted value fills every range; a cancelled paste changes nothing", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: `{ onPaste(detail) { events.push(detail.cells.length); return events.length > 1 ? false : undefined; } }` });
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "jan", endColumn: "feb" }, { startRow: 5, startColumn: "dec" }]));
  let result = await page.evaluate(() => api.pasteCells("42"));
  expect(await page.evaluate(() => events)).toEqual([5]);
  expect(result.cancelled).toBe(false);
  result = await page.evaluate(() => api.pasteCells("1\t2", { row: 3, column: "jan" }));
  expect(result.cancelled).toBe(true);
});

test("pasted numbers and dates read as the page language writes them", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { lang: "pl", options: `{ onPaste(detail) { events.push(detail.cells.map(cell => cell.value)); } }` });
  await page.evaluate(() => api.pasteCells("1 234,5\t12,5\t(7)\t3.5e2", { row: 0, column: "jan" }));
  await page.evaluate(() => api.pasteCells("15.03.2026 10:30", { row: 0, column: "reviewed" }));
  await page.evaluate(() => api.pasteCells("2026-03-15", { row: 1, column: "reviewed" }));
  expect(await page.evaluate(() => events)).toEqual([[1234.5, 12.5, -7, 350], ["2026-03-15T10:30:00.000Z"], ["2026-03-15T00:00:00.000Z"]]);
});

test("the fill handle drags down to continue each column's series or repeat its values", async ({ page }) => {
  const view = budgetView({ rangeSelection: { fillHandle: true } });
  view.rows[0].cells.jan = 100; view.rows[1].cells.jan = 150; view.rows[0].cells.team = "A"; view.rows[1].cells.team = "B";
  await serveGrid(page, view, { options: `{ onPaste(detail) { events.push(detail); } }` });
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "team", endColumn: "jan" }]));
  const handle = page.locator(".cx-fill-handle");
  await expect(handle).toHaveAttribute("title", "Drag to fill the cells below");
  const from = await handle.boundingBox(), to = await bodyCell(page, 4, 2).boundingBox();
  await page.mouse.move(from.x + 3, from.y + 3); await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + 10, { steps: 6 });
  expect(await page.locator(".cx-range-fill").count()).toBe(6);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => events.length)).toBe(1);
  const detail = await page.evaluate(() => ({ source: events[0].source, cells: events[0].cells.map(cell => [cell.id, cell.column, cell.value]) }));
  expect(detail.source).toBe("fill");
  expect(detail.cells).toEqual([["r0002", "team", "A"], ["r0003", "team", "B"], ["r0004", "team", "A"], ["r0002", "jan", 200], ["r0003", "jan", 250], ["r0004", "jan", 300]]);
  expect(await ranges(page)).toEqual([{ startRow: 0, endRow: 4, startColumn: "team", endColumn: "jan" }]);
  await page.keyboard.press("Control+d");
  await expect.poll(() => page.evaluate(() => events.length)).toBe(2);
  expect(await page.evaluate(() => events[1].cells.filter(cell => cell.column === "jan").map(cell => cell.value))).toEqual([100, 100, 100, 100]);
});

test("the fill handle is off by default", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "jan" }]));
  expect(await page.locator(".cx-fill-handle").count()).toBe(0);
});

test("the cell menu copies, pastes, selects all and clears; the keyboard opens it too", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 1, endRow: 2, startColumn: "mar", endColumn: "apr" }]));
  await bodyCell(page, 1, 4).click({ button: "right" });
  const menu = page.locator(".cx-cell-menu [role=menu]");
  await expect(menu).toBeVisible();
  expect(await menu.locator("[role=menuitem]").allTextContents()).toEqual(["Copy cells", "Copy cells with headers", "Paste", "Select all cells", "Clear cell selection"]);
  expect(await ranges(page)).toHaveLength(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-live")).toHaveText("Copied 2 rows × 2 columns");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("1,330\t1,460\r\n1,400\t1,030\r\n");
  await page.keyboard.press("Escape");
  await bodyCell(page, 1, 4).click();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Select all cells" }).click();
  expect((await ranges(page))[0]).toEqual({ startRow: 0, endRow: 39, startColumn: "line", endColumn: "reviewed" });
  // Right-click outside the ranges starts over at that cell.
  await page.keyboard.press("Escape");
  await page.evaluate(() => api.setCellRanges([{ startRow: 1, endRow: 2, startColumn: "mar" }]));
  await bodyCell(page, 9, 1).click({ button: "right" });
  expect(await ranges(page)).toEqual([]);
  await page.keyboard.press("Escape");
});

test("the more menu copies the ranges", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, startColumn: "jan" }]));
  await page.locator(".cx-grid-overflow > summary").click();
  await page.locator(".cx-grid-overflow").getByRole("button", { name: "Copy cells" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("1,000\r\n");
});

test("row selection keeps its own controls beside cell ranges", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 3, startColumn: "jan", endColumn: "feb" }]));
  await page.locator('.cx-canvas .cx-row[data-cx-id="r0005"]').evaluate(row => row.focus());
  await page.keyboard.press(" ");
  expect(await page.evaluate(() => api.getSelection())).toEqual(["r0005"]);
  expect(await ranges(page)).toHaveLength(1);
  expect(await page.locator('.cx-canvas .cx-row[data-cx-id="r0005"]').getAttribute("aria-selected")).toBe("true");
  expect(await page.locator('.cx-canvas .cx-row[data-cx-id="r0001"]').getAttribute("aria-selected")).toBe("false");
});

test("the outline stays visible in forced colours", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.emulateMedia({ forcedColors: "active" });
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "jan", endColumn: "feb" }]));
  const style = await bodyCell(page, 0, 2).evaluate(cell => { const s = getComputedStyle(cell); return { adjust: s.forcedColorAdjust, image: s.backgroundImage, color: s.backgroundColor }; });
  expect(style.adjust).toBe("none");
  expect(style.image).toContain("linear-gradient");
  expect(style.color).not.toBe("rgba(0, 0, 0, 0)");
});

test("a long press starts a range on touch screens, dragging extends it and the handles resize it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await serveGrid(page, budgetView({ rangeSelection: true }));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const a = await bodyCell(page, 2, 0).boundingBox(), b = await bodyCell(page, 5, 1).boundingBox();
  await touch("touchStart", [{ x: a.x + 20, y: a.y + 10 }]);
  await page.waitForTimeout(650);
  for (let i = 1; i <= 5; i++) await touch("touchMove", [{ x: a.x + 20 + (b.x - a.x) * i / 5, y: a.y + 10 + (b.y - a.y) * i / 5 }]);
  await touch("touchEnd", []);
  await expect.poll(() => ranges(page)).toEqual([{ startRow: 2, endRow: 5, startColumn: "line", endColumn: "team" }]);
  expect(await page.locator(".cx-range-handle").count()).toBe(2);
  expect(await page.locator(".cx-drawer").count()).toBe(0);
  // The end handle drags the far corner.
  const handle = await page.locator(".cx-range-handle-end").boundingBox(), c = await bodyCell(page, 8, 1).boundingBox();
  await touch("touchStart", [{ x: handle.x + 6, y: handle.y + 6 }]);
  for (let i = 1; i <= 5; i++) await touch("touchMove", [{ x: handle.x + 6, y: handle.y + 6 + (c.y - handle.y) * i / 5 }]);
  await touch("touchEnd", []);
  await expect.poll(async () => (await ranges(page))[0].endRow).toBe(8);
  // A plain tap clears them.
  await bodyCell(page, 12, 1).tap();
  await expect.poll(() => ranges(page)).toEqual([]);
  await context.close();
});

test("the quarterly budget example takes pasted amounts into its months only", async ({ page }) => {
  await page.goto(exampleUrl("quarterly-budget.html"));
  await page.waitForFunction(() => document.querySelector("[data-cx-ready]") && document.querySelector(".cx-hgroup"));
  const row = page.locator(".cx-canvas .cx-row").first();
  await row.locator(".cx-cell").nth(1).click();
  await page.evaluate(() => navigator.clipboard.writeText("Team\t500\t600"));
  await page.keyboard.press("Control+v");
  await expect(page.locator(".cx-live")).toHaveText("Pasted 2 cells. 1 cells were not pasted");
  await expect(row.locator(".cx-cell").nth(2)).toHaveText("500");
  expect(await page.locator(".cx-paste-report").textContent()).toContain("Only the months take amounts.");
  await nextFrames(page);
  expect(await page.evaluate(() => document.querySelector(".cx-data-grid").canopyx.getCellRanges())).toEqual([{ startRow: 0, endRow: 0, startColumn: "team", endColumn: "feb" }]);
});
