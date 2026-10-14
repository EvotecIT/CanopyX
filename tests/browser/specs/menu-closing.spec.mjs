// CanopyX menus close when focus moves outside them, when another CanopyX menu opens, and on the canopyx:closemenus event
// a host dispatches (or closeMenus on one view), so two menus never stay open together, from the keyboard either.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { runtimeAssets, nextFrames } from "./support.mjs";

const rows = Array.from({ length: 30 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + i, state: i % 2 ? "Pass" : "Fail", owner: "Team " + (i % 4) } }));
const grid = id => ({ protocol: "canopyx/2", type: "grid", id, label: "Servers " + id, pageSize: 30, selection: "single", search: true, stateKey: "menus-" + id,
  source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "state", title: "State", kind: "text", sortable: true },
    { id: "owner", title: "Owner", kind: "text" }], rows });
const tree = id => ({ protocol: "canopyx/2", type: "view", id, label: "Tree " + id, pageSize: 50, selection: "single", stateKey: "menus-" + id,
  contextActions: [{ id: "inspect", label: "Inspect" }], source: { kind: "inline" },
  columns: [{ id: "name", title: "Name" }, { id: "size", title: "Size", kind: "number" }],
  roots: [{ id: "a", label: "Alpha", cells: { size: 1 }, children: [{ id: "a1", label: "Alpha one", cells: { size: 2 } }] }, { id: "b", label: "Beta", cells: { size: 3 } }] });

/** A host page with its own popover button and the given views, on the runtime the views need. */
async function open(page, views, runtime = "grid") {
  const { script, style } = runtimeAssets(runtime);
  const hosts = views.map(view => "<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"light\" style=\"height:360px\"><script type=\"application/json\" class=\"cx-config\">" +
    JSON.stringify(view).replace(/</g, "\\u003c") + "</script></div>").join("");
  // The tree's host takes its actions, so the actions menu has entries.
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Menus</title><style>" + style + "</style><script>" + script +
    "\nCanopyX.configure(\"tree\",{onAction:()=>true});</script></head><body class=\"cx-page\"><button id=\"host-popover\" type=\"button\">Host popover</button>" + hosts + "</body></html>";
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.route("http://canopyx.test/menus", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/menus");
  await page.waitForFunction(count => document.querySelectorAll("[data-cx-ready]").length === count, views.length);
  await page.evaluate(() => {
    window.menuEvents = [];
    document.addEventListener("canopyx:closemenus", event => window.menuEvents.push(event.detail?.source?.className || "host"));
  });
  await nextFrames(page);
}
const host = (page, index) => page.locator("[data-canopyx-host]").nth(index);
const openMenus = page => page.evaluate(() => [...document.querySelectorAll("details[open]")].map(menu => menu.closest("[data-canopyx-host]").canopyx.view.id + ":" + menu.className.split(" ").pop())
  .concat([...document.querySelectorAll(".cx-grid-overlay.cx-pop, .cx-interaction-panel")].map(panel => "panel:" + panel.getAttribute("role"))));
// The open phone sheets that show a drag handle.
const handles = page => page.evaluate(() => [...document.querySelectorAll("details[open] > .cx-grid-panel")].filter(panel => getComputedStyle(panel, "::before").display !== "none")
  .map(panel => panel.parentElement.className.split(" ").pop().replace("cx-grid-", "")));
async function capture(page, name) { if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") }); }

/** Opens a toolbar menu from the keyboard: focus its summary, press Enter. */
async function openFromKeyboard(page, index, kind) {
  await host(page, index).locator(".cx-grid-" + kind + " > summary").focus();
  await page.keyboard.press("Enter");
  await expect(host(page, index).locator(".cx-grid-" + kind)).toHaveAttribute("open", "");
}

test("a toolbar menu closes when focus moves outside it, so a host popover opened with Enter is the only one open", async ({ page }) => {
  await open(page, [grid("first")]);
  await openFromKeyboard(page, 0, "columns");
  expect(await openMenus(page)).toEqual(["first:cx-grid-columns"]);
  // Tab moves focus through the open menu; leaving the view for the host's button closes it.
  await page.locator("#host-popover").focus();
  expect(await openMenus(page)).toEqual([]);
  // Opening the menu again and moving focus to the grid's own search box closes it as well.
  await openFromKeyboard(page, 0, "columns");
  await host(page, 0).getByRole("searchbox").focus();
  expect(await openMenus(page)).toEqual([]);
  // Focus inside the open menu keeps it open.
  await openFromKeyboard(page, 0, "views");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.closest(".cx-grid-views") !== null)).toBe(true);
  expect(await openMenus(page)).toEqual(["first:cx-grid-views"]);
  await capture(page, "menus-views-open-keyboard");
});

test("opening a CanopyX menu closes the others and announces itself to the host", async ({ page }) => {
  await open(page, [grid("first"), grid("second")]);
  await openFromKeyboard(page, 0, "columns");
  // A menu opened without moving focus (a host's own control can do this) still closes the other view's menu.
  await host(page, 1).locator(".cx-grid-export").evaluate(menu => { menu.open = true; });
  await expect.poll(() => openMenus(page)).toEqual(["second:cx-grid-export"]);
  await expect.poll(() => page.evaluate(() => window.menuEvents)).toEqual(["cx-columns cx-grid-columns", "cx-columns cx-grid-export"]);
  // The column menu (a popover) closes the toolbar menus of its own view and of the others too.
  await host(page, 0).locator('[data-cx-column-menu="state"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cx-column-menu")).toBeVisible();
  // Details toggles are queued, so the other menu closes a task later.
  await expect.poll(() => openMenus(page)).toEqual(["panel:dialog"]);
  // A toolbar menu opening closes the popover.
  await host(page, 1).locator(".cx-grid-columns").evaluate(menu => { menu.open = true; });
  await expect.poll(() => openMenus(page)).toEqual(["second:cx-grid-columns"]);
});

test("the column popover closes when focus leaves it", async ({ page }) => {
  await open(page, [grid("first")]);
  await host(page, 0).locator('[data-cx-column-menu="name"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cx-column-menu [role=menuitem]").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cx-column-menu")).toBeVisible();
  await page.locator("#host-popover").focus();
  await expect(page.locator(".cx-column-menu")).toHaveCount(0);
});

test("a host closes CanopyX menus with the canopyx:closemenus event or closeMenus on one view", async ({ page }) => {
  await open(page, [grid("first"), grid("second")]);
  await openFromKeyboard(page, 0, "columns");
  // The host's popover opens from the keyboard with focus still inside the CanopyX menu: the host tells CanopyX.
  await page.evaluate(() => document.getElementById("host-popover").addEventListener("click", () => document.dispatchEvent(new CustomEvent("canopyx:closemenus"))));
  await host(page, 0).locator(".cx-grid-columns .cx-grid-panel input").first().focus();
  await page.evaluate(() => document.getElementById("host-popover").click());
  expect(await openMenus(page)).toEqual([]);
  // Dispatched on one view's host, the event closes that view's menus only; closeMenus does the same through the API.
  await openFromKeyboard(page, 1, "views");
  await host(page, 0).evaluate(element => element.dispatchEvent(new CustomEvent("canopyx:closemenus", { bubbles: true })));
  expect(await openMenus(page)).toEqual(["second:cx-grid-views"]);
  await host(page, 1).evaluate(element => element.dispatchEvent(new CustomEvent("canopyx:closemenus", { bubbles: true })));
  expect(await openMenus(page)).toEqual([]);
  await openFromKeyboard(page, 1, "views");
  await host(page, 0).evaluate(element => element.canopyx.closeMenus());
  expect(await openMenus(page)).toEqual(["second:cx-grid-views"]);
  await host(page, 1).evaluate(element => element.canopyx.closeMenus());
  expect(await openMenus(page)).toEqual([]);
});

test("tree menus and the actions menu close on focus outside, another menu and the host event", async ({ page }) => {
  await open(page, [tree("tree"), grid("grid")], "grid");
  // The tree toolbar menu, from the keyboard.
  await openFromKeyboard(page, 0, "columns");
  await page.locator("#host-popover").focus();
  expect(await openMenus(page)).toEqual([]);
  // The actions menu opens from the keyboard (the API Shift+F10 uses) and closes when focus leaves it.
  await host(page, 0).evaluate(element => element.canopyx.openActions("a"));
  await expect(page.locator(".cx-interaction-panel[role=menu]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.menuEvents.at(-1))).toBe("cx-interaction-panel");
  await page.locator("#host-popover").focus();
  await expect(page.locator(".cx-interaction-panel")).toHaveCount(0);
  // A grid menu opening closes the actions menu, and so does the host event.
  await host(page, 0).evaluate(element => element.canopyx.openActions("b"));
  await expect(page.locator(".cx-interaction-panel[role=menu]")).toBeVisible();
  await host(page, 1).locator(".cx-grid-columns").evaluate(menu => { menu.open = true; });
  await expect(page.locator(".cx-interaction-panel")).toHaveCount(0);
  await host(page, 0).evaluate(element => element.canopyx.openActions("a"));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("canopyx:closemenus")));
  await expect(page.locator(".cx-interaction-panel")).toHaveCount(0);
  expect(await openMenus(page)).toEqual([]);
  await openFromKeyboard(page, 0, "export");
  await host(page, 0).evaluate(element => element.canopyx.closeMenus());
  expect(await openMenus(page)).toEqual([]);
});

test("phone more-menu entries and the reporting header selection menu follow the same rules", async ({ page }) => {
  await open(page, [{ ...grid("first"), selection: "multiple", reporting: { selectionControls: true } }], "reporting");
  // The header selection menu announces itself and closes when focus leaves it.
  await host(page, 0).locator(".cx-header-check").click();
  await expect(host(page, 0).locator(".cx-header-selection")).toHaveAttribute("open", "");
  // The toggle event that announces the menu follows the open attribute asynchronously.
  await expect.poll(() => page.evaluate(() => window.menuEvents.at(-1))).toBe("cx-columns cx-header-selection");
  await page.locator("#host-popover").focus();
  await expect(host(page, 0).locator(".cx-header-selection")).not.toHaveAttribute("open", "");
  // On a phone Views and Export sit inside the more menu: opening one closes the other and keeps the more menu open.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(host(page, 0)).toHaveClass(/cx-phone/);
  await host(page, 0).locator(".cx-grid-overflow > summary").click();
  await host(page, 0).locator(".cx-grid-overflow .cx-grid-views > summary").click();
  await expect(host(page, 0).locator(".cx-grid-views")).toHaveAttribute("open", "");
  // The open Views sheet covers the rest of the more menu: Export is reached from the keyboard.
  await host(page, 0).locator(".cx-grid-overflow .cx-grid-export > summary").focus();
  await expect(host(page, 0).locator(".cx-grid-views")).not.toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect.poll(() => openMenus(page)).toEqual(["first:cx-grid-overflow", "first:cx-grid-export"]);
  // The Export sheet replaces the more menu's sheet: one drag handle shows.
  expect(await handles(page)).toEqual(["export"]);
  await capture(page, "menus-phone-more-export-light-390");
  await host(page, 0).evaluate(element => element.canopyx.closeMenus());
  expect(await openMenus(page)).toEqual([]);
});

test("a phone sheet opened from the more menu shows one drag handle in the dark theme too", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, [grid("first")]);
  await host(page, 0).evaluate(element => element.setAttribute("data-cx-theme", "dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(host(page, 0)).toHaveClass(/cx-phone/);
  await host(page, 0).locator(".cx-grid-overflow > summary").click();
  expect(await handles(page)).toEqual(["overflow"]);
  await host(page, 0).locator(".cx-grid-overflow .cx-grid-export > summary").focus();
  await page.keyboard.press("Enter");
  await expect(host(page, 0).locator(".cx-grid-export")).toHaveAttribute("open", "");
  expect(await handles(page)).toEqual(["export"]);
  await capture(page, "menus-phone-more-export-dark-390");
  // Closing Export gives the more menu its handle back.
  await page.keyboard.press("Escape");
  await expect(host(page, 0).locator(".cx-grid-export")).not.toHaveAttribute("open", "");
  expect(await handles(page)).toEqual(["overflow"]);
});