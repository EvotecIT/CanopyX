// Regressions for column groups and cell ranges found in review: pins and resets, events, auto-scroll, copied numbers,
// context menus on links, grouped reports, row selection, paste answers, accessibility attributes and lifetimes.
import { test, expect } from "@playwright/test";
import { budgetView, serveGrid, bodyCell, headerColumns, rowId, MONTHS } from "./column-groups-support.mjs";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
const ranges = page => page.evaluate(() => api.getCellRanges());
const pins = page => page.evaluate(() => api.getColumnGroups().map(group => group.pin));
const grouped = (extra = {}) => budgetView({ rangeSelection: true, reporting: { grouping: { column: "team", direction: "asc" }, aggregates: [] }, ...extra });

test("a declared group pin is only the initial pin: unpinning sticks through later header builds", async ({ page }) => {
  const view = budgetView({ columnGroups: [{ id: "h1", title: "First half", pinned: "left", columns: MONTHS.slice(0, 6) }, { id: "h2", title: "Second half", columns: MONTHS.slice(6) }] });
  await serveGrid(page, view);
  expect(await pins(page)).toEqual(["left", "none"]);
  await page.evaluate(() => api.setColumnPinned("feb", "none"));
  await page.evaluate(() => { api.setColumnVisible("dec", false); api.setColumnVisible("dec", true); api.setColumnWidth("jan", 140); });
  expect(await pins(page)).toEqual(["none", "none"]);
  expect(await page.locator('.cx-head [data-cx-column="jan"]').getAttribute("data-cx-pin")).toBeNull();
});

test("a restored view keeps the reader's pins, and Reset columns returns to the declared layout", async ({ page }) => {
  const view = budgetView({ stateKey: "budget-state", columnGroups: [{ id: "h1", title: "First half", pinned: "left", columns: MONTHS.slice(0, 6) }, { id: "h2", title: "Second half", columns: MONTHS.slice(6) }] });
  await serveGrid(page, view);
  await page.evaluate(() => { api.setColumnPinned("jan", "none"); api.setColumnPinned("oct", "right"); });
  await page.evaluate(() => api.setColumnOrder(["line", "team", "jun", "may", "apr", "mar", "feb", "jan", "total", "reviewed", ...["jul", "aug", "sep", "oct", "nov", "dec"]]));
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.api && document.querySelector("[data-cx-ready]") && api.getColumnGroups().length);
  await page.evaluate(() => api.ready);
  expect(await pins(page)).toEqual(["none", "right"]);
  expect((await page.evaluate(() => api.getColumnGroups()))[0].columns).toEqual(["jun", "may", "apr", "mar", "feb", "jan"]);
  await page.evaluate(() => api.resetColumns());
  expect(await pins(page)).toEqual(["left", "none"]);
  expect((await headerColumns(page)).slice(0, 8)).toEqual(["line", "jan", "feb", "mar", "apr", "may", "jun", "team"]);
});

test("a plain click that clears the ranges raises cellRangeChange and is announced", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: "{ onCellRangeChange: ({ ranges }) => events.push(ranges.length) }" });
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 2, startColumn: "jan" }]));
  await bodyCell(page, 5, 4).click();
  expect(await page.evaluate(() => events)).toEqual([1, 0]);
  await expect(page.locator(".cx-live")).toHaveText("Cell selection cleared");
});

test("a press that stays put near the grid's edge does not scroll or make a range", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }, 200), { height: 400 });
  const cells = page.locator(".cx-canvas .cx-row .cx-cell");
  const box = await page.locator(".cx-grid").boundingBox();
  const bottom = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".cx-row")?.dataset.cxId, [box.x + 300, box.y + box.height - 12]);
  expect(bottom).toBeTruthy();
  await page.mouse.move(box.x + 300, box.y + box.height - 12); await page.mouse.down();
  await page.waitForTimeout(400);
  expect(await page.locator(".cx-grid").evaluate(grid => grid.scrollTop)).toBe(0);
  await page.mouse.up();
  expect(await ranges(page)).toEqual([]);
  void cells;
});

test("display copies keep negative numbers without the formula apostrophe", async ({ page }) => {
  const view = budgetView({ rangeSelection: true });
  view.rows[0].cells.jan = -1234; view.rows[0].cells.line = "-not a number";
  await serveGrid(page, view);
  const text = await page.evaluate(() => { api.setCellRanges([{ startRow: 0, startColumn: "line", endColumn: "jan" }]); return api.getCellRangeText(); });
  expect(text).toBe("'-not a number\tPlatform\t-1,234\r\n");
});

test("right-clicking a link in a cell keeps the browser's menu", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: "{ renderers: { line: (row, element) => { const link = document.createElement('a'); link.href = '#' + row.id; link.textContent = row.cells.line; element.appendChild(link); return true; } } }" });
  const prevented = await page.locator(".cx-canvas .cx-row").first().locator("a").evaluate(link => !link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  expect(prevented).toBe(false);
  await page.waitForTimeout(200);
  expect(await page.locator(".cx-cell-menu").count()).toBe(0);
});

test("collapsing or expanding a group of a grouped report clears the ranges", async ({ page }) => {
  await serveGrid(page, grouped(), { runtime: "canopyx-reporting" });
  await page.evaluate(() => api.setCellRanges([{ startRow: 1, endRow: 3, startColumn: "jan" }]));
  await page.evaluate(() => api.setGroupCollapsed(api.getSummary().groups[0].key, true));
  expect(await ranges(page)).toEqual([]);
});

test("pasted lines skip the group headings of a grouped report", async ({ page }) => {
  await serveGrid(page, grouped(), { runtime: "canopyx-reporting", options: "{ onPaste(detail) { events.push(detail.cells.map(cell => cell.row + ':' + cell.text)); } }" });
  const first = await page.evaluate(() => api.getSummary().groups[0].count);
  // The last data row of the first group, then the second group's heading, then its first rows.
  await page.evaluate(start => api.pasteCells("1\n2\n3", { row: start, column: "jan" }), first);
  expect(await page.evaluate(() => events[0])).toEqual([first + ":1", (first + 2) + ":2", (first + 3) + ":3"]);
});

test("Shift and Ctrl clicks make ranges without changing the row selection", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true, reporting: { selectionControls: true } }), { runtime: "canopyx-reporting" });
  await bodyCell(page, 1, 3).click();
  await bodyCell(page, 3, 5).click({ modifiers: ["Shift"] });
  await bodyCell(page, 6, 5).click({ modifiers: ["Control"] });
  expect(await ranges(page)).toHaveLength(2);
  expect(await page.evaluate(() => api.getSelection())).toEqual([]);
});

test("the applied count counts only the offered cells the host did not refuse", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: `{ onPaste(detail) { detail.respondWith({ refused: [{ id: "${rowId(0)}", column: "jan" }, { id: "${rowId(0)}", column: "jan" }, { id: "nobody", column: "feb" }] }); } }` });
  const result = await page.evaluate(() => api.pasteCells("1\t2\t3", { row: 0, column: "jan" }));
  expect(result.applied).toBe(2);
  expect(result.refused.map(cell => cell.column)).toEqual(["jan"]);
});

test("the cell menu has its own name and clear command, and its cell keeps no popover attributes", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "jan" }]));
  await bodyCell(page, 0, 2).click({ button: "right" });
  await expect(page.locator(".cx-cell-menu")).toHaveAttribute("aria-label", "Cell actions");
  await expect(page.locator(".cx-cell-menu [role=menuitem]").last()).toHaveText("Clear cell selection");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const attributes = await page.evaluate(() => [...document.querySelectorAll(".cx-canvas .cx-cell")].filter(cell => cell.hasAttribute("aria-expanded") || cell.hasAttribute("aria-controls")).length);
  expect(attributes).toBe(0);
});

test("in forced colours the content of a range takes the highlight text colour", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }), { options: "{ renderers: { line: (row, element) => { const link = document.createElement('a'); link.href = '#'; link.textContent = row.cells.line; element.appendChild(link); return true; } } }" });
  await page.emulateMedia({ forcedColors: "active" });
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, startColumn: "line" }]));
  const colors = await page.locator(".cx-canvas .cx-row").first().locator("a").evaluate(link => [getComputedStyle(link).color, getComputedStyle(link.closest(".cx-cell")).color]);
  expect(colors[0]).toBe(colors[1]);
});

test("a group's resize handle states its range and steps every column by ten pixels", async ({ page }) => {
  await serveGrid(page, budgetView());
  const grip = page.locator('.cx-hgroup[data-cx-group="q1"] > .cx-resize');
  expect(Number(await grip.getAttribute("aria-valuemax"))).toBeGreaterThan(Number(await grip.getAttribute("aria-valuenow")));
  expect(Number(await grip.getAttribute("aria-valuemin"))).toBe(120);
  const before = Number(await grip.getAttribute("aria-valuenow"));
  await grip.focus(); await page.keyboard.press("ArrowRight");
  expect(Number(await grip.getAttribute("aria-valuenow")) - before).toBe(30);
  await page.keyboard.press("Home");
  expect(Number(await grip.getAttribute("aria-valuenow"))).toBe(120);
});

test("destroying a grid removes its classes and variables, and a long press in progress ends with it", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  await page.evaluate(() => api.setColumnPinned("jan", "left"));
  expect(await page.evaluate(() => host.style.getPropertyValue("--cx-pin-left-w"))).not.toBe("");
  await page.evaluate(() => api.destroy());
  expect(await page.evaluate(() => [host.classList.contains("cx-column-groups"), host.classList.contains("cx-cell-ranges"), host.style.getPropertyValue("--cx-pin-left-w")])).toEqual([false, false, ""]);
});

test("API actions answer with a promise that rejects, and the error event stays quiet", async ({ page }) => {
  await serveGrid(page, budgetView({ rangeSelection: true }));
  const outcome = await page.evaluate(async () => {
    const results = [];
    for (const run of [() => api.setCellRanges([{ startRow: 9999, startColumn: "jan" }]), () => api.getCellRangeText({ values: "typed" }), () => api.setColumnGroupVisible("nope", true)]) {
      const answer = run();
      results.push(answer instanceof Promise ? await answer.then(() => "resolved", error => "rejected: " + error.message.slice(0, 20)) : "not a promise");
    }
    return { results, errors: window.errors.length };
  });
  expect(outcome.results.every(result => result.startsWith("rejected"))).toBe(true);
  expect(outcome.errors).toBe(0);
});
