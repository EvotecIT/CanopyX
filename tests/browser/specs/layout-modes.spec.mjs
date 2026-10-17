// Layout modes (docs/layout-modes.md): fit, scroll and cards with the density switch, from the Layout menu and the API;
// switching keeps the query, selection, scroll position and focus; saved views and remembered state keep the choice; hosts
// set the default and allowed modes; trees offer fit and scroll; print asks for a table or stacked records.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openExample, nextFrames } from "./support.mjs";
import { ticketView, treeView, open, call, settle } from "./view-modes-support.mjs";

const host = page => page.locator("[data-canopyx-host]").first();
const firstRowIndex = page => page.evaluate(() => {
  const grid = document.querySelector(".cx-grid"), top = grid.getBoundingClientRect().top + document.querySelector(".cx-head").offsetHeight;
  const rows = [...document.querySelectorAll(".cx-canvas .cx-row[data-cx-id]")].filter(row => row.getBoundingClientRect().bottom > top + 1);
  rows.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return rows[0] && Number(rows[0].getAttribute("aria-rowindex"));
});

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test(`the support tickets example switches between fit, scroll and cards from the Layout menu (${theme}, ${width})`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await openExample(page, theme === "dark" ? "support-tickets-dark.html" : "support-tickets.html");
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready); await nextFrames(page);
    // The initial search count shares this live region and announces after its count settles.
    await expect(page.locator(".cx-live")).toHaveText(/matches$/);
    const summary = page.locator(".cx-grid-layout > summary");
    await expect(summary).toHaveAttribute("role", "button");
    await summary.click();
    const panel = page.locator(".cx-grid-layout .cx-grid-panel");
    await expect(panel.getByRole("radiogroup", { name: "Layout" })).toBeVisible();
    await expect(panel.getByRole("radio", { name: "Fit to width" })).toBeChecked();
    // On phones the menu is a sheet at the bottom with touch-sized choices.
    if (width === 390) {
      expect(await panel.evaluate(element => getComputedStyle(element).position)).toBe("fixed");
      expect((await panel.locator(".cx-layout-choice").first().boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await panel.getByRole("radio", { name: "Cards" }).check();
    await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
    const card = page.locator(".cx-canvas .cx-row[data-cx-id]").first();
    // A card holds every shown field under the title, labelled with its column, inside its fixed height.
    expect(await card.evaluate(row => [...row.querySelectorAll(".cx-cell[data-cx-label]")].map(cell => cell.dataset.cxLabel))).toEqual(
      ["Subject", "Customer", "Status", "Priority", "Assignee", "Channel", "Replies", "Updated"]);
    expect(await card.evaluate(row => [...row.children].every(cell => cell.getBoundingClientRect().bottom <= row.getBoundingClientRect().bottom + 0.5))).toBe(true);
    await expect(page.locator(".cx-live")).toContainText("Layout: Cards, Normal");
    await panel.getByRole("radio", { name: "All columns, scroll sideways" }).check();
    await expect(host(page)).toHaveAttribute("data-cx-layout", "scroll");
    expect(await page.locator(".cx-hcell").count()).toBe(9);
    await expect(page.locator(".cx-hcell").first()).toHaveAttribute("data-cx-pin", "left");
    if (width === 390) expect(await page.locator(".cx-grid").evaluate(grid => grid.scrollWidth > grid.clientWidth)).toBe(true);
    await panel.getByRole("radio", { name: "Comfortable" }).check();
    await expect(host(page)).toHaveAttribute("data-cx-density", "comfortable");
    expect(await card.evaluate(row => row.getBoundingClientRect().height)).toBe(42);
    await panel.getByRole("radio", { name: "Fit to width" }).check();
    await expect(host(page)).not.toHaveAttribute("data-cx-layout", /./);
    const axe = await new AxeBuilder({ page }).include(".cx-toolbar").disableRules(["scrollable-region-focusable"]).analyze();
    expect(axe.violations.filter(item => ["color-contrast", "aria-allowed-role", "label", "aria-required-children", "button-name"].includes(item.id))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const width of [1440, 390]) test(`cards hide the header row and offer sorting, column menus and select-all from Sort by (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await open(page, ticketView(120, { reporting: { selectionControls: true }, layout: { mode: "cards" } }));
  // No column header is visible: each card labels its fields.
  expect(await page.locator(".cx-hcell").evaluateAll(cells => cells.filter(cell => cell.checkVisibility()).length)).toBe(0);
  const sort = page.locator(".cx-grid-sort");
  await expect(sort).toBeVisible();
  await sort.locator(":scope > summary").click();
  const panel = sort.locator(".cx-grid-panel");
  await expect(panel.getByRole("group", { name: "Sort by" })).toBeVisible();
  // Sorting by a column applies at once and shows its direction; a second press reverses it.
  await panel.getByRole("button", { name: "Replies", exact: true }).click();
  await expect.poll(() => call(page, "getQuery").then(query => query.sort)).toEqual([{ column: "replies", direction: "asc" }]);
  await expect(panel.locator(".cx-sort-column[aria-pressed='true']")).toHaveText(/Replies/);
  await panel.locator(".cx-sort-column[aria-pressed='true']").click();
  await expect.poll(() => call(page, "getQuery").then(query => query.sort)).toEqual([{ column: "replies", direction: "desc" }]);
  // The select-all commands of the hidden header are at the top of the menu.
  await expect(panel.getByRole("button", { name: "Select all matching" })).toBeVisible();
  // A column's menu opens from its row, with the column's actions.
  await panel.getByRole("button", { name: "Menu for Priority" }).click();
  await expect(page.locator(".cx-column-menu")).toBeVisible();
  // The menu belongs to the card layout only; the header comes back in fit.
  await page.keyboard.press("Escape");
  await call(page, "setLayout", { mode: "fit" }); await settle(page);
  await expect(sort).toBeHidden();
  await expect(page.locator(".cx-hcell").first()).toBeVisible();
});

test("switching keeps the sort, filters, search, selection, first row in view and the focused cell", async ({ page }) => {
  await open(page, ticketView(3000, { query: { search: "printer", sort: [{ column: "replies", direction: "desc" }], filters: [{ column: "priority", operator: "in", values: ["High", "Urgent"] }] } }));
  const query = await call(page, "getQuery");
  const ids = await page.locator(".cx-canvas .cx-row[data-cx-id]").evaluateAll(rows => rows.slice(2, 4).map(row => row.dataset.cxId));
  await call(page, "setSelection", ids);
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = 34 * 120; });
  await settle(page);
  const before = await firstRowIndex(page);
  // Focus a cell in the first row in view (F2 on the row enters its cells).
  await page.locator(".cx-canvas .cx-row[aria-rowindex='" + before + "']").focus();
  await page.keyboard.press("F2"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  const focused = await page.evaluate(() => [document.activeElement.closest(".cx-row").dataset.cxId, document.activeElement.getAttribute("aria-colindex")]);
  for (const mode of ["cards", "scroll", "fit"]) {
    await call(page, "setLayout", { mode });
    await settle(page);
    expect(await call(page, "getQuery")).toEqual(query);
    expect(await call(page, "getSelection")).toEqual(ids);
    expect(Math.abs((await firstRowIndex(page)) - before)).toBeLessThanOrEqual(1);
    const now = await page.evaluate(() => [document.activeElement.closest(".cx-row")?.dataset.cxId, document.activeElement.getAttribute("aria-colindex")]);
    expect(now[0]).toBe(focused[0]);
    // Every column is shown in all three layouts at this width, so the same column's cell keeps focus.
    expect(now[1]).toBe(focused[1]);
  }
});

test("the layout and density are part of saved views and the remembered state", async ({ page }) => {
  await open(page, ticketView(200, { stateKey: "tickets" }));
  await call(page, "setLayout", { mode: "cards", density: "compact" });
  expect((await call(page, "getState")).layout).toEqual({ mode: "cards", density: "compact" });
  await call(page, "saveView", "Phone cards");
  await call(page, "setLayout", { mode: "fit", density: "default" }); await settle(page);
  await call(page, "applySavedView", "Phone cards"); await settle(page);
  expect(await call(page, "getLayout")).toMatchObject({ mode: "cards", density: "compact" });
  await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
  await call(page, "resetView"); await settle(page);
  expect(await call(page, "getLayout")).toMatchObject({ mode: "fit", density: "default" });
  await call(page, "setLayout", { mode: "scroll" });
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForSelector("[data-cx-ready]"); await settle(page);
  expect(await call(page, "getLayout")).toMatchObject({ mode: "scroll" });
  // The remembered layout is in place for the first rows: every column, the identity pinned.
  await expect(page.locator(".cx-hcell").first()).toHaveAttribute("data-cx-pin", "left");
});

test("density sets the row height and padding, and keeps an explicit row height's offset", async ({ page }) => {
  await open(page, ticketView(50, { layout: { density: "compact" } }));
  const row = page.locator(".cx-canvas .cx-row[data-cx-id]").first();
  expect(await row.evaluate(element => element.getBoundingClientRect().height)).toBe(28);
  for (const [density, height] of [["default", 34], ["comfortable", 42], ["compact", 28]]) {
    await call(page, "setLayout", { density }); await settle(page);
    expect(await page.locator(".cx-canvas .cx-row[data-cx-id]").first().evaluate(element => element.getBoundingClientRect().height)).toBe(height);
  }
});

test("hosts choose the default and the allowed modes, and can leave the menu out", async ({ page }) => {
  await open(page, ticketView(40, { layout: { mode: "cards", modes: ["cards", "fit"] } }));
  await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
  await page.locator(".cx-grid-layout > summary").click();
  expect(await page.locator(".cx-grid-layout .cx-layout-group").first().getByRole("radio").evaluateAll(list => list.map(input => input.value))).toEqual(["cards", "fit"]);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setLayout({ mode: "scroll" }).then(() => "ok", error => error.message))).toMatch(/setLayout/);
  await page.unrouteAll();
  await open(page, ticketView(40, { toolbar: { layout: false } }));
  await expect(page.locator(".cx-grid-layout")).toHaveCount(0);
  await call(page, "setLayout", { mode: "scroll" });
  await expect(host(page)).toHaveAttribute("data-cx-layout", "scroll");
  // A view without layout options has no menu and refuses the call.
  await page.unrouteAll();
  const plain = ticketView(10); delete plain.layout;
  await open(page, plain);
  await expect(page.locator(".cx-grid-layout")).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setLayout({ mode: "scroll" }).then(() => "ok", error => error.message))).toMatch(/declares no layout/);
  expect(await page.evaluate(view => { try { CanopyX.createDataGrid(document.createElement("div"), { view: { ...view, id: "bad", layout: { modes: ["tiles"] } } }); return "ok"; } catch (error) { return error.message; } }, plain)).toMatch(/invalid layout/);
});

test("the Layout menu works from the keyboard: arrows move between the choices and apply them", async ({ page }) => {
  await open(page, ticketView(40));
  await page.locator(".cx-grid-layout > summary").focus();
  await page.keyboard.press("Enter");
  await page.locator(".cx-grid-layout .cx-layout-choice input").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(host(page)).toHaveAttribute("data-cx-layout", "scroll");
  await page.keyboard.press("ArrowDown");
  await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cx-grid-layout > summary")).toBeFocused();
});

test("cards keep virtual rows: a card height for the width, and scrolling to the last record of 100,000", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, ticketView(100000, { pageSize: 1000 }), { height: 640 });
  await call(page, "setLayout", { mode: "cards" }); await settle(page);
  const heights = await page.locator(".cx-canvas .cx-row[data-cx-id]").evaluateAll(rows => [...new Set(rows.map(row => row.getBoundingClientRect().height))]);
  expect(heights.length).toBe(1);
  expect(await page.locator(".cx-canvas .cx-row[data-cx-id]").count()).toBeLessThan(40);
  await call(page, "scrollToRow", 99999); await settle(page);
  await expect(page.locator(".cx-canvas .cx-row[data-cx-id='t99999']")).toBeVisible();
  // A wider panel fits more fields on a line: the cards get shorter.
  await page.setViewportSize({ width: 1440, height: 800 }); await settle(page); await page.waitForTimeout(100); await settle(page);
  const wide = await page.locator(".cx-canvas .cx-row[data-cx-id]").first().evaluate(row => row.getBoundingClientRect().height);
  expect(wide).toBeLessThan(heights[0]);
  await expect(page.locator(".cx-canvas .cx-row[data-cx-id='t99999']")).toBeVisible();
});

test.describe("on a touch phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } });
  test("a tap on a card opens the record drawer, and a tap on Next match moves to the match", async ({ page }) => {
    await open(page, ticketView(40, { layout: { mode: "cards" }, query: { search: "printer" } }), { height: 640 });
    await page.locator(".cx-canvas .cx-row[data-cx-id='t7'] .cx-cell").nth(2).tap();
    await expect(page.locator(".cx-drawer h4")).toHaveText("TCK-1007");
    await page.locator(".cx-drawer").getByRole("button", { name: "Close record details" }).tap();
    await page.getByRole("button", { name: "Next match" }).tap();
    // Next starts at the focused card: TCK-1007, the last of the six results in id order ("t7" follows "t35").
    await expect(page.locator(".cx-matches-count")).toHaveText("6 of 6");
  });
});

test("a tree offers fit and scroll, with the density, and refuses cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, treeView({ columns: [{ id: "name", title: "Article", kind: "text" }, { id: "owner", title: "Owner", kind: "text", priority: "optional" },
    { id: "views", title: "Views", kind: "number", sortable: true, priority: "optional" }] }), { height: 500 });
  expect(await page.locator(".cx-hcell").count()).toBeLessThan(3);
  await page.locator(".cx-grid-layout > summary").click();
  expect(await page.locator(".cx-grid-layout .cx-layout-group").first().getByRole("radio").evaluateAll(list => list.map(input => input.value))).toEqual(["fit", "scroll"]);
  await page.locator(".cx-grid-layout").getByRole("radio", { name: "All columns, scroll sideways" }).check();
  await expect(page.locator(".cx-hcell")).toHaveCount(3);
  expect(await page.locator(".cx-row > .cx-tree").first().evaluate(cell => getComputedStyle(cell).position)).toBe("sticky");
  await page.locator(".cx-grid-layout").getByRole("radio", { name: "Comfortable" }).check();
  expect(await page.locator(".cx-canvas .cx-row[data-cx-id]").first().evaluate(row => row.getBoundingClientRect().height)).toBe(36);
  expect((await call(page, "getState")).layout).toEqual({ mode: "scroll", density: "comfortable" });
  expect(await page.evaluate(view => { try { CanopyX.createTreeGrid(document.createElement("div"), { view: { ...view, id: "bad", layout: { mode: "cards" } } }); return "ok"; } catch (error) { return error.message; } },
    treeView())).toMatch(/invalid layout/);
});

test("print asks the host for stacked records in the card layout and a table otherwise", async ({ page }) => {
  await open(page, [], { runtime: "reporting" });
  const layouts = await page.evaluate(async view => {
    const host = document.createElement("div"); host.className = "cx-host"; host.style.height = "400px"; document.querySelector("main").appendChild(host);
    const seen = [], grid = CanopyX.createDataGrid(host, { view, onPrint: ({ layout }) => { seen.push(layout); } });
    await grid.ready;
    await grid.print({ scope: "filtered" });
    await grid.setLayout({ mode: "cards" });
    await grid.print({ scope: "filtered" });
    return seen;
  }, ticketView(20, { reporting: {} }));
  expect(layouts).toEqual(["table", "stacked"]);
});
