// Editing (docs/editing.md): typed editors, validation, the change set, row and batch commit, undo and redo, the keyboard
// model, full-row mode, read-only rules and the phone edit form.
import { test, expect } from "@playwright/test";
import { serveGrid, assetView, cell } from "./editing-support.mjs";

test.beforeEach(async ({ page }) => {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(page.pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("an editable grid loads the editing part with its first query, after the filter editor", async ({ page }) => {
  const requested = await serveGrid(page);
  for (const file of ["canopyx-editing.js", "canopyx-editing.css", "canopyx-filter-editor.js", "canopyx-filter-editor.css"]) expect(requested).toContain(file);
  await expect(page.locator(".cx-editbar")).toBeHidden();
  // Editable cells say so; the others are read-only for assistive technology.
  await expect(cell(page, "a0", 1)).not.toHaveAttribute("aria-readonly", "true");
  await expect(cell(page, "a0", 8)).toHaveAttribute("aria-readonly", "true");
});

test("a grid without editable columns loads the part only when an editing method runs", async ({ page }) => {
  const view = assetView(); view.columns.forEach(column => { delete column.editable; delete column.editor; delete column.validation; });
  const requested = [];
  page.on("request", request => requested.push(new URL(request.url()).pathname));
  await serveGrid(page, { view });
  expect(requested.some(file => file.includes("canopyx-editing"))).toBe(false);
  expect(await page.evaluate(() => { const api = document.querySelector("[data-canopyx-host]").canopyx; return [api.getChanges(), api.hasChanges(), api.canUndo(), api.undo()]; }))
    .toEqual([[], false, false, false]);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.beginEdit("a0", "name"))).toBe(false);
  expect(requested.some(file => file.includes("canopyx-editing.js"))).toBe(true);
});

test("F2 opens the typed editor of the focused cell, Enter applies and moves down, and the cell is marked as changed", async ({ page }) => {
  await serveGrid(page);
  const name = cell(page, "a0", 1);
  await name.click();
  await expect(name).toBeFocused();
  await page.keyboard.press("F2");
  const input = name.locator("input.cx-editor");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-label", "Edit Name");
  await input.fill("Laptop renamed");
  await page.keyboard.press("Enter");
  await expect(cell(page, "a1", 1)).toBeFocused();
  await expect(name).toHaveText("Laptop renamed");
  await expect(name).toHaveClass(/cx-dirty/);
  await expect(page.locator(".cx-editbar-text")).toHaveText("Unsaved changes: 1");
  const changes = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getChanges());
  expect(changes).toEqual([{ id: "a0", values: { name: "Laptop renamed" }, original: { name: "Laptop 0" } }]);
});

const api = page => page.evaluateHandle(() => document.querySelector("[data-canopyx-host]").canopyx);
const changes = page => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getChanges());

test("typing starts editing with the typed character, Escape restores the value and focus returns to the cell", async ({ page }) => {
  await serveGrid(page);
  const name = cell(page, "a2", 1);
  await name.click();
  await page.keyboard.type("Desk");
  const input = name.locator("input.cx-editor");
  await expect(input).toHaveValue("Desk");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(name).toBeFocused();
  await expect(name).toHaveText("Laptop 2");
  expect(await changes(page)).toEqual([]);
  // Backspace starts an empty editor; a double click edits too.
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("");
  await page.keyboard.press("Escape");
  await cell(page, "a3", 1).dblclick();
  await expect(cell(page, "a3", 1).locator("input.cx-editor")).toBeFocused();
});

test("Tab applies and edits the next editable cell, skipping read-only columns and wrapping to the next row", async ({ page }) => {
  await serveGrid(page);
  await cell(page, "a0", 7).click();
  await page.keyboard.press("Enter");
  await expect(cell(page, "a0", 7).locator("input")).toBeFocused();
  await page.keyboard.press("Tab");
  // Site is read-only, so Tab goes on to the first editable cell of the next row.
  await expect(cell(page, "a1", 0).locator("input.cx-editor")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cell(page, "a0", 7).locator("input.cx-editor")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cell(page, "a0", 6).locator("input[type=checkbox]")).toBeFocused();
});

test("the number editor parses numbers as the page language writes them and refuses text with a message", async ({ page }) => {
  await serveGrid(page, { lang: "pl" });
  const cost = cell(page, "a0", 2);
  await cost.click();
  await page.keyboard.press("F2");
  const input = cost.locator("input.cx-editor");
  await expect(input).toHaveValue("900");
  await input.fill("1 234,5");
  await page.keyboard.press("Enter");
  expect((await changes(page))[0].values).toEqual({ cost: 1234.5 });
  await cost.click(); await page.keyboard.press("F2");
  await input.fill("dwanaście");
  await page.keyboard.press("Enter");
  // The editor stays open, marked invalid and described by the visible message.
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  const tip = page.locator(".cx-edit-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText("Cost must be a number.");
  expect(await input.getAttribute("aria-describedby")).toBe(await tip.getAttribute("id"));
  // Up and Down step by the editor's step within its limits; below min is refused.
  await input.fill("-5");
  await page.keyboard.press("Enter");
  await expect(tip).toHaveText("Cost must be at least 0.");
  await input.fill("10");
  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveValue("10,01");
  await input.fill("10,005");
  await page.keyboard.press("Enter");
  await expect(tip).toHaveText("Cost must be a multiple of 0,01.");
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test.describe("dates follow the grid's time zone", () => {
  test.use({ timezoneId: "America/New_York" });
  for (const zone of ["utc", "local"]) {
    test(`the date and date-time editors show and write moments in ${zone} time`, async ({ page }) => {
      const view = assetView({ timeZone: zone });
      view.rows[0].cells.checked = "2026-10-01T02:30:00Z";
      await serveGrid(page, { view });
      const checked = cell(page, "a0", 4);
      await checked.click(); await page.keyboard.press("Enter");
      const input = checked.locator("input.cx-editor");
      await expect(input).toHaveAttribute("type", "datetime-local");
      // 02:30 UTC is 22:30 the evening before in New York.
      await expect(input).toHaveValue(zone === "utc" ? "2026-10-01T02:30" : "2026-09-30T22:30");
      await input.fill(zone === "utc" ? "2026-10-02T08:15" : "2026-10-02T04:15");
      await page.keyboard.press("Enter");
      expect((await changes(page))[0].values).toEqual({ checked: "2026-10-02T08:15:00Z" });
      // A date keeps the time of day.
      const purchased = cell(page, "a1", 3);
      await purchased.click(); await page.keyboard.press("Enter");
      await purchased.locator("input[type=date]").fill("2025-03-04");
      await page.keyboard.press("Enter");
      const value = (await changes(page)).find(change => change.id === "a1").values.purchased;
      // Midnight UTC is 19:00 the day before in New York, so the local date keeps that time of day.
      expect(value).toBe(zone === "utc" ? "2025-03-04T00:00:00Z" : "2025-03-05T00:00:00Z");
    });
  }
});

test("select, toggle and lookup editors choose values from their lists", async ({ page }) => {
  await serveGrid(page);
  const status = cell(page, "a0", 5);
  await status.click(); await page.keyboard.press("Enter");
  await status.locator("select").selectOption({ label: "Repair" });
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Repair");
  // The toggle shows a checkbox; Space flips it and Enter applies it.
  const insured = cell(page, "a1", 6);
  await expect(insured).toHaveText("Yes");
  await insured.click(); await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await page.keyboard.press("Enter");
  await expect(insured).toHaveText("No");
  // The lookup searches the column's values as the reader types and picks with the keyboard.
  const owner = cell(page, "a2", 7);
  await owner.click(); await page.keyboard.press("Enter");
  const box = owner.getByRole("combobox");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await box.fill("dan");
  const list = page.getByRole("listbox", { name: "Owner" });
  await expect(list.getByRole("option")).toHaveText(["Dana Kim"]);
  await expect(box).toHaveAttribute("aria-expanded", "true");
  await expect(box).toHaveAttribute("aria-activedescendant", /-list-0$/);
  // Enter on the open list picks; a second Enter applies.
  await page.keyboard.press("Enter");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(owner).toHaveText("Dana Kim");
  // A typed value that is not in the list is refused.
  await owner.click(); await page.keyboard.press("Enter");
  await box.fill("Nobody here");
  await expect(page.locator(".cx-editor-note")).toHaveText("No matches");
  await expect(list).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(page.locator(".cx-edit-tip")).toHaveText("Choose Owner from the list.");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  const values = Object.fromEntries((await changes(page)).map(change => [change.id, change.values]));
  expect(values).toEqual({ a0: { status: "Repair" }, a1: { insured: false }, a2: { owner: "Dana Kim" } });
});

test("undo and redo follow Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, the edit bar and the API", async ({ page }) => {
  await serveGrid(page);
  const name = cell(page, "a0", 1);
  for (const text of ["First", "Second"]) {
    await name.click(); await page.keyboard.press("F2");
    await name.locator("input").fill(text); await page.keyboard.press("Enter");
  }
  await expect(name).toHaveText("Second");
  await name.click();
  await page.keyboard.press("Control+z");
  await expect(name).toHaveText("First");
  await expect(page.locator(".cx-live")).toContainText("Undone: Name");
  await page.keyboard.press("Control+z");
  await expect(name).toHaveText("Laptop 0");
  await expect(name).not.toHaveClass(/cx-dirty/);
  expect(await changes(page)).toEqual([]);
  await page.keyboard.press("Control+y");
  await expect(name).toHaveText("First");
  await page.keyboard.press("Control+Shift+Z");
  await expect(name).toHaveText("Second");
  // Discard reverts every change as one step that undo brings back.
  await page.locator(".cx-editbar").getByRole("button", { name: "Discard" }).click();
  await expect(name).toHaveText("Laptop 0");
  await page.locator(".cx-editbar").getByRole("button", { name: "Undo" }).click();
  await expect(name).toHaveText("Second");
  expect(await page.evaluate(() => { const grid = document.querySelector("[data-canopyx-host]").canopyx; return [grid.canUndo(), grid.canRedo(), grid.undo(), grid.redo(), grid.redo(), grid.canRedo()]; }))
    .toEqual([true, true, true, true, true, false]);
});

test("cellValueChanging can refuse a change and cellValueChanged reports it", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", {
    onCellValueChanging: detail => detail.value !== "Forbidden",
    onCellValueChanged: detail => events.push([detail.id, detail.column, detail.previous, detail.value, detail.source]) });` });
  const name = cell(page, "a4", 1);
  for (const text of ["Forbidden", "Allowed"]) { await name.click(); await page.keyboard.press("F2"); await name.locator("input").fill(text); await page.keyboard.press("Enter"); }
  await expect(name).toHaveText("Allowed");
  expect(await page.evaluate(() => events)).toEqual([["a4", "name", "Laptop 4", "Allowed", "edit"]]);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setCellValue("a4", "cost", 12));
  expect((await page.evaluate(() => events))[1]).toEqual(["a4", "cost", 1002, 12, "api"]);
});

test("group separators count only in groups of three digits", async ({ page }) => {
  await serveGrid(page, { lang: "de" });
  const cost = cell(page, "a0", 2), input = cost.locator("input.cx-editor");
  await cost.click(); await page.keyboard.press("F2");
  await input.fill("1.5");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-edit-tip")).toHaveText("Cost must be a number.");
  await input.fill("1.234,5");
  await page.keyboard.press("Enter");
  expect((await changes(page))[0].values).toEqual({ cost: 1234.5 });
});

test("an editor that does not fit its column's kind and an unknown editing label are reported", async ({ page }) => {
  await serveGrid(page, { view: assetView({}, { name: { editor: "number" } }) });
  expect(await page.evaluate(() => window.errors)).toEqual(["CanopyX: column name cannot use a number editor for its kind."]);
  await page.unrouteAll();
  await serveGrid(page, { script: `CanopyX.configure("assets", { labels: { gridEditSav: "Speichern" } });` });
  expect(await page.evaluate(() => window.errors)).toEqual(["CanopyX: there is no label 'gridEditSav'."]);
  await page.evaluate(() => { window.errors.length = 0; });
});
