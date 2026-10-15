// Regressions found by running the suite in Firefox and WebKit. Each test reproduces the engine behaviour in every
// engine, so Chromium runs guard the fixes too.
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, viewPage } from "./support.mjs";

const record = i => ({ id: "r" + String(i).padStart(4, "0"), cells: { name: i % 2 ? "Archive" : "Source", amount: i } });
const selections = { protocol: "canopyx/2", type: "grid", id: "selections", label: "Selection inventory", source: { kind: "inline" }, rowHeight: 28,
  pageSize: 10, presentation: "paged", pageLength: 50, selection: "multiple", search: true, reporting: { selectionControls: true },
  columns: [{ id: "name", title: "Name", kind: "text", width: 210, sortable: true }, { id: "amount", title: "Amount", kind: "number", width: 140, sortable: true }],
  rows: Array.from({ length: 120 }, (_, i) => record(i)) };

// WebKit does not focus a pressed button: focus moves to the nearest focusable ancestor, here the grid that holds the
// header selection menu. That focus used to close the menu before the click arrived, so Select page did nothing.
test("a press whose focus lands on an ancestor of the menu keeps the header selection menu open for its click", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.route("http://canopyx.test/press", route => route.fulfill({ contentType: "text/html", body: viewPage(selections) }));
  await page.goto("http://canopyx.test/press");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
  await page.locator(".cx-header-check").click();
  const menu = page.locator(".cx-header-selection");
  await expect(menu).toHaveAttribute("open", "");
  const result = await page.evaluate(() => {
    const button = [...document.querySelectorAll(".cx-header-selection .cx-button")].find(item => item.textContent === "Select page");
    const grid = document.querySelector(".cx-data-grid .cx-grid"), init = { bubbles: true, cancelable: true, composed: true };
    button.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }));
    // What WebKit does on mousedown over an unfocusable button.
    grid.focus({ preventScroll: true });
    const openAfterFocus = document.querySelector(".cx-header-selection").open;
    button.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }));
    button.click();
    return { openAfterFocus, grid: grid.contains(button) };
  });
  expect(result).toEqual({ openAfterFocus: true, grid: true });
  await expect(page.locator(".cx-grid-selection-status")).toHaveText("50 selected");
  // Once the press is over, focus that moves to the same ancestor closes the menu as before.
  await expect(menu).toHaveAttribute("open", "");
  await page.locator(".cx-data-grid .cx-grid").evaluate(grid => grid.focus());
  await expect(menu).not.toHaveAttribute("open", "");
});

// The handle's width comes from its glyph, which Firefox draws narrower than 24 pixels with its padding.
test("column chooser drag handles keep a 24 pixel target", async ({ page }) => {
  await page.goto(exampleUrl("inline.html"));
  await page.waitForSelector("[data-cx-ready]");
  await page.getByText("Columns", { exact: true }).click();
  // The chooser comes with the lazily loaded tree tools part.
  await expect(page.locator(".cx-grid-column-handle:visible").first()).toBeVisible();
  const widths = await page.locator(".cx-grid-column-handle:visible").evaluateAll(handles => handles.map(handle => handle.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(0);
  for (const width of widths) expect(width).toBeGreaterThanOrEqual(24);
});

// Engines infer different focus rings for script focus. The record drawer states it: a ring after a key, none after a
// pointer, whichever engine runs it.
test("the record drawer title rings after a key and not after a pointer, and a key while it keeps focus brings the ring", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "ring", label: "Servers", pageSize: 20, selection: "single", search: false, rowAction: "details",
    source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "state", title: "State", kind: "text" }],
    rows: Array.from({ length: 6 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + i, state: "Pass" } })) };
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route("http://canopyx.test/ring", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/ring");
  await page.waitForSelector("[data-cx-ready]");
  const title = page.locator(".cx-drawer h4");
  const ring = () => title.evaluate(element => document.activeElement === element && element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none");
  await page.locator('.cx-row[data-cx-id="r2"] .cx-cell').first().click();
  await expect(title).toHaveText("Server 2");
  expect(await ring()).toBe(false);
  // The next record by keyboard repaints the drawer while its title keeps focus.
  await page.keyboard.press("ArrowDown");
  await expect(title).toHaveText("Server 3");
  await expect.poll(ring).toBe(true);
});
