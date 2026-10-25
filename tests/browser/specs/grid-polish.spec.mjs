import { test, expect } from "@playwright/test";
import { serveGrid, bodyCell, rowId } from "./column-groups-support.mjs";

function view(extra = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "polish", label: "Work items", source: { kind: "inline" },
    columns: [{ id: "name", title: "Name", kind: "text", width: 240, sortable: true },
      { id: "number", title: "Number", kind: "number", width: 140 }, { id: "day", title: "Day", kind: "text", width: 160 }],
    rowHeight: 34, pageSize: 100, selection: "none", search: true,
    rows: Array.from({ length: 20 }, (_, index) => ({ id: rowId(index), cells: {
      name: "Item " + (index + 1), number: index + 1, day: "2026-01-" + String(index + 1).padStart(2, "0") } })), ...extra };
}

test("an opt-in auto-height page header stays usable on page scroll and leaves fixed-height grids alone", async ({ page }) => {
  await serveGrid(page, view({ stickyHeader: true }), { height: 1600 });
  await page.evaluate(() => { document.getElementById("host").style.marginTop = "200px"; document.body.style.minHeight = "3000px"; window.scrollTo(0, 400); });
  const host = page.locator("#host"), header = page.locator(".cx-head");
  await expect(host).toHaveAttribute("data-cx-page-header", "true");
  await expect.poll(() => header.evaluate(head => head.getBoundingClientRect().top)).toBe(0);
  await page.getByRole("button", { name: "Name", exact: true }).click();
  expect(await page.evaluate(() => api.getQuery().sort)).toEqual([{ column: "name", direction: "asc" }]);
  expect(await page.locator('.cx-head [role="columnheader"]').count()).toBe(3);
  await page.evaluate(() => api.setQuery({ search: "Item 1" }));
  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(host).toHaveAttribute("data-cx-page-header", "true");
  await expect.poll(() => page.evaluate(() => {
    const grid = document.querySelector(".cx-grid");
    const last = Math.max(...[...grid.querySelectorAll(".cx-row[data-cx-id]")].map(row => row.getBoundingClientRect().bottom));
    return grid.getBoundingClientRect().bottom - last;
  })).toBeLessThanOrEqual(3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(host).not.toHaveAttribute("data-cx-page-header", "true");
  await serveGrid(page, view({ stickyHeader: true, autoHeight: false }), { height: 300 });
  await page.evaluate(() => { document.body.style.minHeight = "3000px"; window.scrollTo(0, 200); });
  await expect(page.locator("#host")).not.toHaveAttribute("data-cx-page-header", "true");
  expect(await page.locator(".cx-page-header-space").count()).toBe(0);
});

test("card token slots remain literal, preserve cell order and restore ordinary values when the layout changes", async ({ page }) => {
  const definition = view({ layout: { mode: "cards" }, cardTemplate: { name: "{name} · #{number}", day: "Due: {day}" } });
  definition.rows[0].cells.name = "<img src=x onerror=alert(1)>";
  await serveGrid(page, definition);
  await expect(bodyCell(page, 0, 0).locator(".cx-card-slot")).toHaveText("<img src=x onerror=alert(1)> · #1");
  await expect(bodyCell(page, 0, 2).locator(".cx-card-slot")).toHaveText("Due: 2026-01-01");
  expect(await page.locator(".cx-card-slot img,.cx-card-slot script").count()).toBe(0);
  expect(await page.locator('.cx-row[data-cx-id="r0000"] .cx-cell').count()).toBe(3);
  await page.evaluate(() => api.setLayout({ mode: "fit" }));
  await expect(bodyCell(page, 0, 0)).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator(".cx-card-slot")).toHaveCount(0);
});

test("phone card templates reuse their text slot across paints and keep the selection checkbox reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await serveGrid(page, view({ layout: { mode: "cards" }, cardTemplate: { name: "{name} · #{number}" },
    selection: "multiple", reporting: { responsive: true, selectionControls: true } }), { runtime: "canopyx-reporting" });
  const cell = bodyCell(page, 0, 0);
  for (const ids of [["r0000"], [], ["r0000"]]) {
    await page.evaluate(ids => api.setSelection(ids), ids);
    await expect(cell.locator(":scope > .cx-card-slot")).toHaveCount(1);
    await expect(cell.locator(".cx-card-slot")).toHaveCount(1);
    await expect(cell.locator(".cx-grid-row-select")).toBeVisible();
  }
  await cell.locator(".cx-grid-row-select").click();
  expect(await page.evaluate(() => api.getSelection())).toEqual([]);
});

for (const copy of [false, true]) test(`fill handle ${copy ? "copies while Ctrl is held at release" : "continues numbers, date-only values and Item labels"}`, async ({ page }) => {
  await serveGrid(page, view({ rangeSelection: { fillHandle: true } }), {
    before: "window.fills=[];", options: "{onPaste(detail){fills.push(detail.cells.map(cell=>({column:cell.column,value:cell.value})));}}"
  });
  await page.evaluate(() => api.setCellRanges([{ startRow: 0, endRow: 1, startColumn: "name", endColumn: "day" }]));
  const handle = await page.locator(".cx-fill-handle").boundingBox(), target = await bodyCell(page, 4, 2).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  if (copy) await page.keyboard.down("Control");
  await page.mouse.up();
  if (copy) await page.keyboard.up("Control");
  await expect.poll(() => page.evaluate(() => fills.length)).toBe(1);
  const values = await page.evaluate(() => Object.fromEntries(["name", "number", "day"].map(column => [column, fills[0].filter(cell => cell.column === column).map(cell => cell.value)])));
  expect(values).toEqual(copy ? { name: ["Item 1", "Item 2", "Item 1"], number: [1, 2, 1], day: ["2026-01-01", "2026-01-02", "2026-01-01"] } :
    { name: ["Item 3", "Item 4", "Item 5"], number: [3, 4, 5], day: ["2026-01-03", "2026-01-04", "2026-01-05"] });
});

test("opt-in regex quick search filters raw values and rejects unsafe patterns without replacing the accepted query", async ({ page }) => {
  await serveGrid(page, view({ noun: "work items", allowRegexSearch: true, query: { searchMode: "regex" } }));
  const input = page.getByRole("searchbox", { name: "Search pattern", exact: true });
  await input.fill("^Item [12]$");
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 20 work items");
  await input.fill("(a+)+$");
  await expect.poll(() => input.evaluate(element => element.validity.valid)).toBe(false);
  expect(await page.evaluate(() => api.getQuery().search)).toBe("^Item [12]$");
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 20 work items");
  await input.fill("^Item [12]$");
  await expect.poll(() => input.evaluate(element => element.validity.valid)).toBe(true);
  await input.fill("");
  await expect.poll(() => page.evaluate(() => api.getQuery().search)).toBe("");
  await input.fill("(");
  await expect.poll(() => input.evaluate(element => element.validity.valid)).toBe(false);
  await input.fill("");
  await expect.poll(() => input.evaluate(element => element.validity.valid)).toBe(true);
  await input.fill("^Item 20$");
  await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 20 work items");
  await expect.poll(() => input.evaluate(element => element.validity.valid)).toBe(true);
  await expect(bodyCell(page, 19, 0)).toHaveText("Item 20");
  await page.evaluate(() => api.setQuery({ search: "", searchMode: "substring" }));
  await expect(page.getByRole("searchbox", { name: "Search work items", exact: true })).toHaveAttribute("placeholder", "Search work items");
  await page.evaluate(() => api.setQuery({ search: "Item 1" }));
  await expect(page.getByRole("searchbox", { name: "Search work items", exact: true })).toBeVisible();
  await page.evaluate(() => api.setQuery({ search: "", searchMode: "regex" }));
  await expect(page.getByRole("searchbox", { name: "Search pattern", exact: true })).toBeVisible();
});
