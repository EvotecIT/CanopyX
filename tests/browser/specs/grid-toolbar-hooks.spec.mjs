import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

// Generic inventory fixtures for the toolbar switches, host slots, more-menu content entries and menu layering.
const definition = (patch = {}) => ({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  source: { kind: "inline" }, rowHeight: 28, pageSize: 50, selection: "multiple", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "size", title: "Size", kind: "number", sortable: true },
    { id: "owner", title: "Owner", kind: "text" }],
  rows: Array.from({ length: 40 }, (_, i) => ({ id: "item-" + i, cells: { name: "Item " + i, size: i, owner: i % 2 ? "Operations" : "Finance" } })),
  ...patch });
const reporting = patch => definition({ reporting: { headerFilters: true }, ...patch });
const api = "document.querySelector('[data-canopyx-host]').canopyx";
const sizes = [{ width: 1440, height: 900 }, { width: 390, height: 800 }];

/** Opens a view page. markup goes inside the host element before its configuration; setup runs before the automatic mount. */
async function openGrid(page, view, { setup = "", markup = "", theme = "light", wrap = null, size = sizes[0] } = {}) {
  let html = viewPage(view).replace('data-cx-theme="light"', 'data-cx-theme="' + theme + '"')
    .replace('<script type="application/json" class="cx-config">', markup + '<script type="application/json" class="cx-config">')
    .replace("</head>", "<script>" + setup + "</script></head>");
  if (wrap) html = html.replace('<div class="cx-host"', '<div class="frame" style="' + wrap + '"><div class="cx-host"').replace("</div></body>", "</div></div></body>");
  await page.setViewportSize(size);
  await page.route("http://canopyx.test/toolbar", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/toolbar"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
/** The toolbar's direct children as short names: slots by name, controls by class. */
const toolbarOrder = page => page.evaluate(() => [...document.querySelector(".cx-toolbar").children].map(element =>
  element.dataset.cxToolbarSlot ? "slot:" + element.dataset.cxToolbarSlot : element.classList.contains("cx-search") ? "search" :
    [...element.classList].find(name => /^cx-(grid-\w+|spacer|selbar|sep)$/.test(name))?.replace(/^cx-(grid-)?/, "") || element.className));

const controls = { search: ".cx-search", filters: ".cx-grid-filters", columns: ".cx-grid-columns", views: ".cx-grid-views",
  export: ".cx-grid-export", more: ".cx-grid-overflow", count: ".cx-grid-result-count" };

for (const size of sizes)
for (const runtime of ["grid", "reporting"])
test(`each toolbar switch removes only its control (${runtime}, ${size.width})`, async ({ page }) => {
  const view = (runtime === "reporting" ? reporting : definition)({ query: { search: "Item" } });
  await openGrid(page, view, { size });
  for (const selector of Object.values(controls)) await expect(page.locator(selector)).toHaveCount(1);
  for (const [name, selector] of Object.entries(controls)) {
    await page.unrouteAll();
    await openGrid(page, view, { size, setup: `CanopyX.configure("inventory", { toolbar: { ${name}: false } });` });
    await expect(page.locator(selector), name + " is removed").toHaveCount(0);
    for (const [other, kept] of Object.entries(controls)) if (other !== name) await expect(page.locator(kept), other + " stays").toHaveCount(1);
    await expect(page.locator(".cx-grid-query-summary")).toBeVisible();
    if (name === "more") await expect(page.locator(".cx-grid-details, .cx-grid-print")).toHaveCount(0);
    if (name === "count") await expect(page.locator(".cx-grid-query-chips .cx-grid-chip")).toHaveCount(1);
  }
});

test("document switches remove controls and runtime options override them", async ({ page }) => {
  const view = definition({ toolbar: { filters: false, columns: false, views: false, export: false, more: false, count: false } });
  await openGrid(page, view);
  expect(await toolbarOrder(page)).toEqual(["search", "spacer", "selbar", "sep"]);
  await expect(page.locator(".cx-toolbar details")).toHaveCount(0);
  // The methods behind removed controls stay available.
  await page.evaluate(`${api}.saveView("Mine")`);
  expect(await page.evaluate(`${api}.getSavedViews()`)).toEqual(["Mine"]);
  expect(await page.evaluate(`${api}.toCsv({ scope: "all" }).then(text => text.trim().split("\\n").length)`)).toBe(41);
  await page.unrouteAll();
  await openGrid(page, view, { setup: `CanopyX.configure("inventory", { toolbar: { columns: true, search: false } });` });
  expect(await toolbarOrder(page)).toEqual(["columns", "spacer", "selbar", "sep"]);
});

test("a malformed toolbar switch fails the mount with a clear error", async ({ page }) => {
  await page.setViewportSize(sizes[0]);
  await page.route("http://canopyx.test/toolbar", route => route.fulfill({ contentType: "text/html", body: viewPage(definition({ toolbar: { chips: false } })) }));
  await page.goto("http://canopyx.test/toolbar");
  await expect(page.locator(".cx-mount-error")).toContainText("toolbar options are booleans by control name");
});

for (const size of sizes)
test(`host slots keep their place and content through re-renders, phone moves and remounts (${size.width})`, async ({ page }) => {
  await openGrid(page, reporting(), { size,
    markup: '<span data-cx-slot="start" class="host-start">Start</span><span data-cx-slot="end" class="host-count">40 items</span>' });
  const order = await toolbarOrder(page);
  expect(order.slice(0, 3)).toEqual(["slot:start", "search", "slot:afterSearch"]);
  expect(order.indexOf("slot:afterViews") + 1).toBe(order.indexOf("spacer"));
  expect(order.indexOf("slot:end")).toBe(order.indexOf("spacer") + 1);
  if (size.width > 640) expect(order[order.indexOf("slot:afterViews") - 1]).toBe("views");
  await page.evaluate(`(() => { const chip = document.createElement("button"); chip.className = "cx-button host-chip"; chip.textContent = "Owner: Finance";
    ${api}.toolbarSlot("afterSearch").append(chip); window.slots = ["start", "afterSearch", "afterViews", "end"].map(name => ${api}.toolbarSlot(name)); })()`);
  await expect(page.locator(".cx-toolbar > [data-cx-toolbar-slot=start] > .host-start")).toHaveText("Start");
  await expect(page.locator(".cx-toolbar > [data-cx-toolbar-slot=end] > .host-count")).toBeVisible();
  // Queries, column changes, saved views and layout changes rebuild rows and headers; the slots are the same elements.
  await page.evaluate(`${api}.setQuery({ search: "1" })`);
  await page.evaluate(`${api}.setColumnVisible("owner", false)`);
  await page.evaluate(`${api}.resetView()`);
  await page.setViewportSize({ width: size.width > 640 ? 390 : 1440, height: 800 }); await nextFrames(page);
  await page.setViewportSize(size); await nextFrames(page);
  expect(await page.evaluate(`window.slots.every((slot, index) => slot === ${api}.toolbarSlot(["start", "afterSearch", "afterViews", "end"][index]) && slot.isConnected)`)).toBe(true);
  expect(await toolbarOrder(page)).toEqual(order);
  await expect(page.locator("[data-cx-toolbar-slot=afterSearch] > .host-chip")).toHaveText("Owner: Finance");
  expect(await page.evaluate(`(() => { try { ${api}.toolbarSlot("middle"); return "accepted"; } catch (error) { return error.message; } })()`)).toContain("toolbar slots are");
  // Declarative content returns to the host element on destroy and joins the next grid mounted there.
  await page.evaluate(`${api}.destroy()`);
  expect(await page.evaluate(() => [...document.querySelector("[data-canopyx-host]").children].filter(node => node.dataset.cxSlot).map(node => node.dataset.cxSlot))).toEqual(["start", "end"]);
  await page.evaluate(() => { const host = document.querySelector("[data-canopyx-host]"); CanopyX.createDataGrid(host, { view: JSON.parse(host.querySelector(".cx-config").textContent) }); });
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator(".cx-toolbar > [data-cx-toolbar-slot=end] > .host-count")).toHaveText("40 items");
  // A replacement grid on another host takes host content through its own slot.
  await page.evaluate(async () => {
    const old = document.querySelector("[data-canopyx-host]"), next = document.createElement("div"), count = old.querySelector(".host-count");
    next.className = "cx-host"; next.style.height = "400px"; old.after(next);
    const grid = CanopyX.createDataGrid(next, { view: { ...JSON.parse(old.querySelector(".cx-config").textContent), id: "replacement" } });
    await grid.ready; grid.toolbarSlot("end").append(count); old.canopyx.destroy(); old.remove();
  });
  await expect(page.locator(".cx-toolbar > [data-cx-toolbar-slot=end] > .host-count")).toHaveCount(1);
  await expect(page.locator(".cx-toolbar > [data-cx-toolbar-slot=end] > .host-count")).toBeVisible();
});

test("a misspelt declarative slot fails the mount and leaves the host content in place", async ({ page }) => {
  await page.setViewportSize(sizes[0]);
  const html = viewPage(reporting()).replace('<script type="application/json" class="cx-config">',
    '<span data-cx-slot="end" class="host-count">40 items</span><span data-cx-slot="middle" class="host-odd">Odd</span><script type="application/json" class="cx-config">');
  await page.route("http://canopyx.test/toolbar", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/toolbar");
  await expect(page.locator(".cx-mount-error")).toContainText("toolbar slots are");
  expect(await page.evaluate(() => [...document.querySelector("[data-canopyx-host]").children].map(node => node.className))).toEqual(
    expect.arrayContaining(["host-count", "host-odd"]));
});

test("with the more menu off, phone layouts keep Views and Export usable in the toolbar", async ({ page }) => {
  await openGrid(page, reporting(), { size: sizes[1], setup: `CanopyX.configure("inventory", { toolbar: { more: false } });` });
  for (const kind of ["views", "export"]) {
    const control = page.locator(".cx-toolbar > .cx-grid-" + kind);
    await expect(control.locator(":scope > summary")).toBeVisible();
    await control.locator(":scope > summary").click();
    await expect.poll(() => control.locator(":scope > .cx-grid-panel").evaluate(element => element.matches(":popover-open"))).toBe(true);
    await page.keyboard.press("Escape"); await expect(control).not.toHaveAttribute("open", "");
  }
});

test("a menu open across the phone breakpoint closes instead of leaving the top layer", async ({ page }) => {
  await openGrid(page, reporting());
  await page.locator(".cx-grid-views > summary").click();
  await expect.poll(() => page.locator(".cx-grid-views > .cx-grid-panel").evaluate(element => element.matches(":popover-open"))).toBe(true);
  await page.setViewportSize(sizes[1]); await nextFrames(page);
  await expect(page.locator(".cx-grid-views")).not.toHaveAttribute("open", "");
  await expect(page.locator(".cx-grid-panel:popover-open")).toHaveCount(0);
  await expect(page.locator(".cx-grid-overflow .cx-grid-views")).toHaveCount(1);
});

test("list menus keep their height cap; the filter builder uses the room beside it", async ({ page }) => {
  const columns = Array.from({ length: 30 }, (_, i) => ({ id: "c" + i, title: "Column " + i, kind: "text" }));
  await openGrid(page, reporting({ columns, rows: [{ id: "a", cells: { c0: "x" } }] }));
  await page.locator(".cx-grid-columns > summary").click();
  await expect(page.locator(".cx-grid-column-choice").first()).toBeVisible();
  expect(await page.locator(".cx-grid-columns > .cx-grid-panel").evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await page.locator(".cx-grid-filters > summary").click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  expect(await page.locator(".cx-grid-filters > .cx-grid-panel").evaluate(element => parseFloat(element.style.maxHeight))).toBeGreaterThan(320);
});

test("with the Filters menu off, a complex column condition offers no dead Edit as text button", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await openGrid(page, reporting({ query: { filterGroup: { operator: "or", filters: [{ column: "owner", operator: "eq", values: ["Finance"] },
    { column: "size", operator: "gt", values: [30] }], groups: [] } } }), { setup: `CanopyX.configure("inventory", { toolbar: { filters: false } });` });
  await expect(page.locator(".cx-grid-filters")).toHaveCount(0);
  await page.locator('[data-cx-filter-column="owner"]').click();
  await expect(page.locator(".cx-column-filter")).toContainText("mixed condition group");
  await expect(page.locator(".cx-column-filter").getByRole("button", { name: "Edit as text" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Clear grouped filters" })).toBeVisible();
  expect(errors).toEqual([]);
  await page.unrouteAll();
  await openGrid(page, reporting({ query: { filterGroup: { operator: "or", filters: [{ column: "owner", operator: "eq", values: ["Finance"] },
    { column: "size", operator: "gt", values: [30] }], groups: [] } } }));
  await page.locator('[data-cx-filter-column="owner"]').click();
  await page.locator(".cx-column-filter").getByRole("button", { name: "Edit as text" }).click();
  await expect(page.locator(".cx-grid-filters")).toHaveAttribute("open", "");
});

test("with the Export menu off, a reporting print hook still runs from the more menu", async ({ page }) => {
  await openGrid(page, reporting(), { setup: `window.printed = []; CanopyX.configure("inventory", { toolbar: { export: false },
    onPrint: ({ snapshot }) => { window.printed.push(snapshot.request.scope + ":" + snapshot.rows.length); } });` });
  await expect(page.locator(".cx-grid-export")).toHaveCount(0);
  await page.locator(".cx-grid-overflow > summary").click();
  await page.locator(".cx-grid-overflow").getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.printed)).toEqual(["filtered:40"]);
});
const saveViewSetup = `window.rendered = 0; window.ran = 0;
CanopyX.configure("inventory", { actions: [
  { label: "Save view…", render(container, context) {
    window.rendered++;
    const label = document.createElement("label"), name = document.createElement("input"), save = document.createElement("button");
    label.className = "cx-grid-field"; label.append("View name", name); save.type = "button"; save.className = "cx-button"; save.textContent = "Save";
    save.addEventListener("click", () => { document.querySelector("[data-canopyx-host]").canopyx.saveView(name.value); context.close(); });
    container.append(label, save);
  } },
  { label: "Reset", run() { window.ran++; } }
] });`;

for (const size of sizes)
for (const theme of ["light", "dark"])
test(`a more-menu content entry keeps focus, keyboard and Escape correct (${theme}, ${size.width})`, async ({ page }) => {
  await openGrid(page, reporting(), { size, theme, setup: saveViewSetup });
  const menu = page.locator(".cx-grid-overflow"), more = menu.locator(":scope > summary"), entry = menu.locator(".cx-grid-action");
  const summary = entry.locator(":scope > summary"), name = page.getByRole("textbox", { name: "View name", exact: true });
  await more.focus(); await page.keyboard.press("Enter"); await expect(menu).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeVisible();
  await expect(entry).not.toHaveAttribute("open", ""); expect(await page.evaluate(() => window.rendered)).toBe(0);
  await summary.focus(); await page.keyboard.press("Enter");
  await expect(entry).toHaveAttribute("open", ""); await expect(name).toBeFocused();
  await page.keyboard.type("Finance only");
  // Escape folds the entry back to its summary; the menu stays open. A second Escape closes the menu.
  await page.keyboard.press("Escape"); await expect(entry).not.toHaveAttribute("open", ""); await expect(summary).toBeFocused();
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Enter"); await expect(name).toBeFocused(); await expect(name).toHaveValue("Finance only");
  expect(await page.evaluate(() => window.rendered)).toBe(1);
  const results = await new AxeBuilder({ page }).include(".cx-grid-overflow").analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(`${api}.getSavedViews()`)).toEqual(["Finance only"]);
  await expect(menu).not.toHaveAttribute("open", ""); await expect(more).toBeFocused();
  // Reopening shows the folded entry; a handler entry still runs.
  await page.keyboard.press("Enter"); await expect(entry).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Reset", exact: true }).click(); expect(await page.evaluate(() => window.ran)).toBe(1);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
});

test("a content entry whose render throws reports the error and renders again on the next open", async ({ page }) => {
  await openGrid(page, reporting(), { setup: `window.calls = 0; window.errors = []; CanopyX.configure("inventory", { onError: event => window.errors.push(event.error.message),
    actions: [{ label: "Flaky", render(container) { window.calls++; container.append(document.createElement("input")); if (window.calls === 1) throw new Error("first draw failed"); } }] });` });
  const entry = page.locator(".cx-grid-action"), summary = entry.locator(":scope > summary");
  await page.locator(".cx-grid-overflow > summary").click();
  await summary.click();
  await expect.poll(() => page.evaluate(() => window.errors)).toEqual(["first draw failed"]); await expect(summary).toBeFocused();
  await expect(entry.locator("input")).toHaveCount(0);
  await summary.click(); await summary.click();
  await expect(entry.locator("input")).toBeFocused(); expect(await page.evaluate(() => window.calls)).toBe(2);
});
test("content entries validate like handler entries and need the reporting runtime", async ({ page }) => {
  await page.setViewportSize(sizes[0]);
  await page.route("http://canopyx.test/toolbar", route => route.fulfill({ contentType: "text/html", body: viewPage(definition()) }));
  await page.goto("http://canopyx.test/toolbar"); await page.waitForSelector("[data-cx-ready]");
  const attempt = actions => page.evaluate(actions => {
    const host = document.createElement("div"); document.body.append(host);
    try { CanopyX.createDataGrid(host, { view: { ...JSON.parse(document.querySelector(".cx-config").textContent), id: "attempt" }, actions: eval(actions) }); return "mounted"; }
    catch (error) { return error.message; } finally { host.canopyx?.destroy(); host.remove(); }
  }, actions);
  expect(await attempt('[{ label: "Save", render() {} }]')).toContain("actions need a label and handler");
  expect(await attempt('[{ label: "Run", run() {} }]')).toBe("mounted");
});

test("the reporting runtime rejects an action that both runs and renders", async ({ page }) => {
  await openGrid(page, reporting());
  const attempt = actions => page.evaluate(actions => {
    const host = document.createElement("div"); document.body.append(host);
    try { CanopyX.createDataGrid(host, { view: { ...JSON.parse(document.querySelector(".cx-config").textContent), id: "attempt" }, actions: eval(actions) }); return "mounted"; }
    catch (error) { return error.message; } finally { host.canopyx?.destroy(); host.remove(); }
  }, actions);
  expect(await attempt('[{ label: "Both", run() {}, render() {} }]')).toContain("either a run or a render function");
  expect(await attempt('[{ render() {} }]')).toContain("either a run or a render function");
  expect(await attempt('[{ label: "Save", render() {} }, { label: "Run", run() {} }]')).toBe("mounted");
});

for (const density of ["compact", "default", "comfortable"])
test(`row checkboxes reserve exactly the width they draw (${density})`, async ({ page }) => {
  const view = definition({ density, selection: "multiple", search: false, reporting: { selectionControls: true },
    columns: [{ id: "name", title: "Id", kind: "text", rowHeader: true },
      ...Array.from({ length: 9 }, (_, i) => ({ id: "c" + i, title: "Column " + i, kind: "text", priority: "essential" }))],
    rows: Array.from({ length: 6 }, (_, i) => ({ id: "r" + i, cells: { name: "WORKSTATION-" + String(i).repeat(6),
      ...Object.fromEntries(Array.from({ length: 9 }, (_, c) => ["c" + c, "Value " + c + " " + "x".repeat(18)])) } })) });
  await openGrid(page, view, { size: { width: 900, height: 600 } });
  const geometry = await page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id] .cx-cell:first-child")].map(cell => {
    const check = cell.querySelector(".cx-grid-row-select").getBoundingClientRect(), text = cell.querySelector(".cx-text"), style = getComputedStyle(cell);
    return { drawn: text.getBoundingClientRect().left - check.left, cut: text.scrollWidth - text.clientWidth,
      overflow: text.getBoundingClientRect().right - (cell.getBoundingClientRect().right - parseFloat(style.paddingRight)) };
  }));
  // The grid is narrower than its essential columns, so the identity column gets exactly its measured need.
  expect(await page.evaluate(() => document.querySelector(".cx-grid").scrollWidth > document.querySelector(".cx-grid").clientWidth)).toBe(true);
  for (const cell of geometry) { expect(cell.drawn).toBe(28); expect(cell.cut).toBeLessThanOrEqual(0); expect(cell.overflow).toBeLessThanOrEqual(0.5); }
});

for (const size of sizes)
for (const theme of ["light", "dark"])
test(`toolbar menus of a two-row grid escape an overflow-hidden host (${theme}, ${size.width})`, async ({ page }) => {
  const view = reporting({ rows: definition().rows.slice(0, 2), selection: "multiple", reporting: { headerFilters: true, selectionControls: true } });
  await openGrid(page, view, { size, theme, wrap: "overflow:hidden;border-radius:8px;margin:24px" });
  const frame = await page.locator(".frame").boundingBox();
  for (const kind of ["columns", "export", "overflow", "filters", "views"]) {
    const control = page.locator(".cx-grid-" + kind), summary = control.locator(":scope > summary");
    if (!await summary.isVisible()) await page.locator(".cx-grid-overflow > summary").click();
    await summary.click(); await expect(control).toHaveAttribute("open", "");
    const panel = control.locator(":scope > .cx-grid-panel");
    // The toggle event that layers the panel follows the open attribute by one task.
    await expect.poll(() => panel.evaluate(element => element.matches(":popover-open"))).toBe(true);
    if (kind === "columns" || kind === "filters") await expect(panel.locator("button").first()).toBeVisible();
    const state = await panel.evaluate(element => {
      const box = element.getBoundingClientRect(), radius = parseFloat(getComputedStyle(element).borderTopLeftRadius);
      const inside = (x, y) => element.contains(document.elementFromPoint(x, y));
      const host = getComputedStyle(element.closest(".cx-host"));
      return { box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right }, radius, layer: element.matches(":popover-open"),
        visible: inside(box.left + box.width / 2, box.bottom - radius - 2) && inside(box.left + radius + 2, box.top + radius + 2) && inside(box.right - radius - 2, box.bottom - radius - 2),
        background: getComputedStyle(element).backgroundColor, surface: host.getPropertyValue("--cx-surface").trim(), color: getComputedStyle(element).color, text: host.color };
    });
    expect(state.layer, kind + " is in the top layer").toBe(true);
    expect(state.visible, kind + " is drawn whole").toBe(true);
    // The phone filter builder is a full-screen sheet without corners; every other menu keeps them.
    if (kind !== "filters" || size.width > 640) expect(state.radius, kind + " keeps its rounded corners").toBeGreaterThan(0);
    expect(state.color, kind + " keeps the grid's text colour").toBe(state.text);
    if (kind === "columns" && size.width > 640) expect(state.box.bottom, "the Columns menu reaches past the clipping host").toBeGreaterThan(frame.y + frame.height);
    await page.keyboard.press("Escape");
    if (await control.evaluate(element => element.open)) await page.keyboard.press("Escape");
    await page.mouse.click(2, 2);
    await expect(page.locator(".cx-grid-panel:popover-open")).toHaveCount(0);
  }
});

test("the header selection menu is layered above a short grid as well", async ({ page }) => {
  const view = reporting({ rows: definition().rows.slice(0, 2), reporting: { selectionControls: true } });
  await openGrid(page, view, { wrap: "overflow:hidden" });
  await page.locator(".cx-header-selection > summary").click();
  const panel = page.locator(".cx-header-selection > .cx-grid-panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => element.matches(":popover-open") && element.contains(document.elementFromPoint(
    element.getBoundingClientRect().left + 20, element.getBoundingClientRect().bottom - 10)))).toBe(true);
  await page.keyboard.press("Escape"); await expect(page.locator(".cx-grid-panel:popover-open")).toHaveCount(0);
});
