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
