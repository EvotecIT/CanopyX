import { test, expect } from "@playwright/test";
import { runtimeAssets, nextFrames } from "./support.mjs";

// Generic fixtures: a six-column rules list, a products table, a log with long messages and a 30-column table.
const words = ["Configuration", "Replication health", "Certificate expiry", "Password policy (weakness)", "Service accounts", "Time synchronization"];
function rules(rows = 18, extra = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "rules", label: "Rules", rowHeight: 34, pageSize: 250, selection: "single", search: true, noun: "rules",
    columns: [
      { id: "rule", title: "Rule", kind: "text", sortable: true, presenter: { kind: "link" } },
      { id: "category", title: "Category", kind: "text", sortable: true },
      { id: "controllers", title: "Domain controllers", kind: "text", presenter: { kind: "statusStrip" } },
      { id: "failing", title: "Failing on", kind: "number" },
      { id: "worst", title: "Worst", kind: "text", priority: "essential", presenter: { kind: "enum", tones: { Severe: "danger", Passed: "success" }, quietTones: ["success"] } },
      { id: "weight", title: "Weight", kind: "number", priority: "optional" }
    ], source: { kind: "inline" }, ...extra,
    rows: Array.from({ length: rows }, (_, i) => ({ id: "r" + i, cells: {
      rule: { value: "#rule-" + i, text: words[i % words.length] + " rule " + i },
      category: ["Security", "Health", "Configuration"][i % 3],
      controllers: { value: "5", series: Array.from({ length: 5 }, (_, d) => ({ period: "dc" + d, state: d <= i % 5 ? "Fail" : "Pass", tone: d <= i % 5 ? "danger" : "success" })) },
      failing: { value: i % 5, text: (i % 5) + " of 5" }, worst: i % 4 ? "Severe" : "Passed", weight: 50 - i
    } })) };
}
function products(rows = 5) {
  return { protocol: "canopyx/2", type: "grid", id: "products", label: "Products", rowHeight: 34, pageSize: 250, selection: "multiple", search: false,
    columns: [{ id: "name", title: "Product", kind: "text" }, { id: "category", title: "Category", kind: "text" },
      { id: "sku", title: "SKU", kind: "text", width: 220 }, { id: "stock", title: "In stock", kind: "number" }, { id: "price", title: "Price", kind: "number" }],
    source: { kind: "inline" }, rows: Array.from({ length: rows }, (_, i) => ({ id: "p" + i, cells: {
      name: "Product " + i + (i % 2 ? "" : " with a longer catalogue name"), category: ["Hardware", "Software"][i % 2], sku: "S" + (100 + i), stock: 10 + i, price: 9 + i } })) };
}
function servers() {
  return { protocol: "canopyx/2", type: "grid", id: "servers", label: "Servers", rowHeight: 28, pageSize: 250, selection: "single", search: false,
    columns: [{ id: "name", title: "Server", kind: "text" }, { id: "domain", title: "Domain", kind: "text", width: 200 },
      { id: "os", title: "Operating system", kind: "text" }, ...["a", "b"].map(id => ({ id, title: "Metric " + id, kind: "number" }))],
    source: { kind: "inline" }, rows: Array.from({ length: 6 }, (_, i) => ({ id: "s" + i, cells: { name: "srv-" + i, domain: "corp.example",
      os: "Windows Server 2022 Datacenter Azure Edition", a: i, b: i * 2 } })) };
}
function wide() {
  return { protocol: "canopyx/2", type: "grid", id: "wide", label: "Wide", rowHeight: 28, pageSize: 250, selection: "single", search: false,
    columns: [{ id: "name", title: "Device", kind: "text" }, { id: "site", title: "Site", kind: "text", pinned: "left" },
      ...Array.from({ length: 27 }, (_, c) => ({ id: "m" + c, title: "Metric " + c, kind: "number" })), { id: "status", title: "Status", kind: "text", pinned: "right" }],
    source: { kind: "inline" }, rows: Array.from({ length: 20 }, (_, i) => ({ id: "w" + i, cells: Object.assign({ name: "device-" + i, site: "Site " + (i % 3), status: "Online" },
      ...Array.from({ length: 27 }, (_, c) => ({ ["m" + c]: i * c })) ) })) };
}
function log() {
  return { protocol: "canopyx/2", type: "grid", id: "log", label: "Log", rowHeight: 28, pageSize: 250, selection: "single", search: false,
    columns: [{ id: "time", title: "Time", kind: "datetime", priority: "essential" }, { id: "level", title: "Level", kind: "text" },
      { id: "message", title: "Message", kind: "text", rowHeader: true, pinned: null, maxWidth: 600 }],
    source: { kind: "inline" }, rows: Array.from({ length: 8 }, (_, i) => ({ id: "e" + i, cells: { time: "2026-10-01T08:0" + i + ":00Z", level: "Information",
      message: "Request " + i + " completed after retrying the upstream connection; the response was cached for the next caller and the retry budget was reset." } })) };
}

async function mount(page, view, { width = 1200, theme = "light", height = 480, viewport } = {}) {
  const { script, style } = runtimeAssets(view.reporting ? "reporting" : "grid");
  if (viewport) await page.setViewportSize(viewport);
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  await page.route("http://canopyx.test/fit", route => route.fulfill({ contentType: "text/html", body: "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>" + style + "</style><script>" + script + "</script></head>" +
    "<body style=\"margin:0;padding:16px\"><div id=\"frame\" style=\"width:" + width + "px;max-width:100%\"><div class=\"cx-host\" data-canopyx-host data-cx-theme=\"" + theme +
    "\" style=\"height:" + height + "px\"><script type=\"application/json\" class=\"cx-config\">" + json + "</script></div></div>" +
    "<script>window.api=()=>document.querySelector('[data-canopyx-host]').canopyx;</script></body></html>" }));
  await page.goto("http://canopyx.test/fit"); await page.evaluate(() => api().ready); await nextFrames(page);
}
const headers = page => page.locator(".cx-hcell").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn));
const truncated = (page, selector) => page.locator(selector).evaluateAll(items => items.filter(item => item.scrollWidth > item.clientWidth + 1).length);

for (const theme of ["light", "dark"]) for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`columns fill the width without truncating a header (${theme}, ${viewport.width})`, async ({ page }) => {
    await mount(page, products(), { theme, viewport, width: viewport.width - 32 });
    const geometry = await page.evaluate(() => {
      const grid = document.querySelector(".cx-grid"), cells = [...document.querySelectorAll(".cx-hcell")];
      return { client: grid.clientWidth, scroll: grid.scrollWidth, row: cells.reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0),
        clipped: cells.filter(cell => { const label = cell.querySelector(".cx-sort,.cx-htext"); return label.scrollWidth > label.clientWidth + 1; }).length };
    });
    if (geometry.row <= geometry.client + 1) expect(geometry.row).toBeGreaterThan(geometry.client - 2);
    expect(geometry.clipped).toBe(0);
    expect(await page.locator(".cx-hcell").evaluateAll(cells => cells.every(cell => cell.querySelectorAll(".cx-grid-column-menu").length === 1))).toBe(true);
    await expect(page.locator(".cx-row").first()).toBeVisible();
  });

  test(`healthy tones render as plain text and the columns menu fits its labels (${theme}, ${viewport.width})`, async ({ page }) => {
    const view = rules(12); view.columns[1].title = "A deliberately long column label for the chooser";
    await mount(page, view, { theme, viewport, width: viewport.width - 32 });
    const quiet = page.locator('.cx-row[data-cx-id="r0"] .p-muted');
    if (await page.locator('.cx-hcell[data-cx-column="worst"]').count()) {
      await expect(quiet).toHaveText("Passed");
      await expect(page.locator('.cx-row[data-cx-id="r0"] :is(.p-pill,.p-dot)')).toHaveCount(0);
      await expect(page.locator('.cx-row[data-cx-id="r1"] .p-pill')).toHaveText("Severe");
    }
    const summary = page.locator(".cx-grid-columns > summary");
    if (!await summary.isVisible()) await page.locator(".cx-grid-overflow > summary").click();
    await page.locator(".cx-grid-columns > summary").click();
    const menu = page.locator(".cx-grid-columns > .cx-grid-panel");
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox()).width).toBeGreaterThanOrEqual(Math.min(280, viewport.width - 32));
    const names = await menu.locator(".cx-grid-column-name").evaluateAll(items => items.map(item => ({ lines: Math.round(item.getBoundingClientRect().height / parseFloat(getComputedStyle(item).lineHeight)), title: item.title, overflow: getComputedStyle(item).textOverflow })));
    expect(names.every(name => name.lines <= 1 && name.overflow === "ellipsis" && name.title)).toBe(true);
    await expect(menu.locator(".cx-grid-column-handle")).toHaveCount(6);
  });
}

test("the identity column takes spare width and shrinks first when the frame narrows", async ({ page }) => {
  await mount(page, products(), { width: 1100 });
  const widthOf = id => page.locator(`.cx-hcell[data-cx-column="${id}"]`).evaluate(cell => cell.getBoundingClientRect().width);
  const wideName = await widthOf("name"), wideStock = await widthOf("stock");
  await page.locator("#frame").evaluate(frame => frame.style.width = "720px"); await nextFrames(page); await nextFrames(page);
  expect(await widthOf("name")).toBeLessThan(wideName);
  expect(await widthOf("stock")).toBeCloseTo(wideStock, 0);
  const fill = await page.evaluate(() => { const grid = document.querySelector(".cx-grid"); return [grid.scrollWidth, grid.clientWidth]; });
  expect(fill[0]).toBeLessThanOrEqual(fill[1] + 1);
});

test("long values keep their measured width before a short column keeps its preferred width", async ({ page }) => {
  await mount(page, servers(), { width: 1400 });
  // Narrow the frame until the short column gives up part of its declared width; the long values must still fit.
  const domain = () => page.locator('.cx-hcell[data-cx-column="domain"]').evaluate(cell => cell.getBoundingClientRect().width);
  for (let width = 1400; width > 300 && await domain() >= 199; width -= 10) {
    await page.locator("#frame").evaluate((frame, value) => frame.style.width = value + "px", width); await nextFrames(page); await nextFrames(page);
  }
  expect(await truncated(page, '.cx-row [aria-colindex="3"] .cx-text')).toBe(0);
  expect(await domain()).toBeLessThan(200);
});

test("number headers align with their values and never truncate", async ({ page }) => {
  await mount(page, products(), { width: 1100 });
  const edges = await page.evaluate(() => {
    const label = document.querySelector('.cx-hcell[data-cx-column="price"] .cx-htext, .cx-hcell[data-cx-column="price"] .cx-sort');
    const value = document.querySelector('.cx-row [aria-colindex="5"] .cx-text');
    return [label.getBoundingClientRect().right, value.getBoundingClientRect().right];
  });
  expect(Math.abs(edges[0] - edges[1])).toBeLessThanOrEqual(2);
});

test("a grid whose rows fit is as tall as its rows; long lists keep the bounded height", async ({ page }) => {
  await mount(page, products(3), { height: 480 });
  const fitted = await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), rows = [...document.querySelectorAll(".cx-row")], grid = document.querySelector(".cx-grid");
    return { host: host.getBoundingClientRect().height, gap: grid.getBoundingClientRect().bottom - Math.max(...rows.map(row => row.getBoundingClientRect().bottom)) };
  });
  expect(fitted.host).toBeLessThan(300); expect(fitted.gap).toBeLessThanOrEqual(3);
  await page.unrouteAll(); await mount(page, products(200), { height: 480 });
  expect(await page.locator("[data-canopyx-host]").evaluate(host => Math.round(host.getBoundingClientRect().height))).toBe(480);
});

for (const width of [1440, 1100, 900, 700]) test(`the essential Rule column shows full names at ${width} pixels; optional columns hide before scrolling`, async ({ page }) => {
  await mount(page, rules(), { width, viewport: { width: Math.max(width + 32, 800), height: 900 } });
  expect(await truncated(page, '.cx-row [aria-colindex="1"] .cx-text')).toBe(0);
  const state = await page.evaluate(() => {
    const grid = document.querySelector(".cx-grid");
    return { overflow: grid.scrollWidth > grid.clientWidth + 1, weight: !!document.querySelector('.cx-hcell[data-cx-column="weight"]') };
  });
  if (state.overflow) expect(state.weight).toBe(false);
  await expect(page.locator('.cx-hcell[data-cx-column="worst"]')).toHaveCount(1);
});

test("pinned left and right columns stay put while the centre scrolls, and a host pin survives", async ({ page }) => {
  await mount(page, wide(), { width: 900 });
  const box = id => page.locator(`.cx-hcell[data-cx-column="${id}"]`).boundingBox();
  const before = [await box("name"), await box("site"), await box("status")];
  expect(await headers(page)).toEqual(expect.arrayContaining(["name", "site", "status"]));
  await page.locator(".cx-grid").evaluate(grid => grid.scrollLeft = 900); await nextFrames(page);
  const after = [await box("name"), await box("site"), await box("status")];
  for (let i = 0; i < 3; i++) expect(after[i].x).toBeCloseTo(before[i].x, 0);
  await expect(page.locator("[data-canopyx-host]")).toHaveClass(/cx-scroll-left/);
  const layout = await page.evaluate(() => api().getColumnLayout?.() || api().getState().columns);
  expect(layout.find(column => column.id === "site").pin).toBe("left");
});

test("a pin chosen in the header menu persists in a saved view", async ({ page }) => {
  await mount(page, rules(6, { stateKey: "fit" }), { width: 1100 });
  await page.locator('.cx-hcell[data-cx-column="category"]').hover();
  await page.getByRole("button", { name: "Menu for Category", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pin left", exact: true }).click();
  await expect(page.locator('.cx-hcell[data-cx-column="category"]')).toHaveAttribute("data-cx-pin", "left");
  const pins = await page.evaluate(async () => {
    api().saveView("Pinned"); api().resetColumns(); const reset = api().getState().columns.find(column => column.id === "category").pin;
    await api().applySavedView("Pinned"); return [reset, api().getState().columns.find(column => column.id === "category").pin];
  });
  expect(pins).toEqual(["none", "left"]);
});

test("a plain row click never selects; row actions open details or follow the row link", async ({ page }) => {
  await mount(page, rules(6), { width: 1100 });
  await page.locator('.cx-row[data-cx-id="r2"] [aria-colindex="2"]').click();
  await expect(page.locator('.cx-row[aria-selected="true"]')).toHaveCount(0);
  await expect(page.locator(".cx-selbar")).toBeHidden();
  await page.keyboard.press(" ");
  await expect(page.locator('.cx-row[data-cx-id="r2"]')).toHaveAttribute("aria-selected", "true");
  await page.unrouteAll(); await mount(page, rules(6, { rowAction: "link" }), { width: 1100 });
  await page.locator('.cx-row[data-cx-id="r3"] [aria-colindex="2"]').click();
  await expect(page).toHaveURL(/#rule-3$/);
  await page.unrouteAll(); await mount(page, rules(6, { rowAction: "details" }), { width: 1100 });
  await page.locator('.cx-row[data-cx-id="r1"] [aria-colindex="2"]').click();
  await expect(page.locator(".cx-drawer")).toBeVisible();
});

test("the columns menu reorders by drag and by Alt+Arrow, finds columns and resets", async ({ page }) => {
  const view = wide(); await mount(page, view, { width: 1100 });
  await page.locator(".cx-grid-columns > summary").click();
  const find = page.getByRole("searchbox", { name: "Find a column…" });
  await expect(find).toBeVisible(); await find.fill("metric 2");
  expect(await page.locator(".cx-grid-column-choice:not([hidden])").count()).toBe(8);
  await find.fill("");
  const order = () => page.evaluate(() => api().getState().columns.map(column => column.id));
  const handle = page.getByRole("button", { name: /^Metric 0: drag/ });
  await handle.focus(); await page.keyboard.press("Alt+ArrowDown");
  expect((await order()).slice(2, 4)).toEqual(["m1", "m0"]);
  await expect(page.getByRole("button", { name: /^Metric 0: drag/ })).toBeFocused();
  const source = await page.getByRole("button", { name: /^Metric 3: drag/ }).boundingBox(), target = await page.getByRole("button", { name: /^Metric 1: drag/ }).boundingBox();
  await page.mouse.move(source.x + 5, source.y + 5); await page.mouse.down();
  await page.mouse.move(target.x + 5, target.y + 2, { steps: 5 }); await page.mouse.up();
  expect((await order()).slice(2, 5)).toEqual(["m3", "m1", "m0"]);
  const check = page.locator(".cx-grid-columns").getByRole("checkbox", { name: "Metric 5", exact: true });
  await check.uncheck(); await expect(check).toBeFocused();
  await page.getByRole("button", { name: "Reset columns", exact: true }).click();
  expect((await order()).slice(2, 5)).toEqual(["m0", "m1", "m2"]);
  await expect(check).toBeChecked();
});

test("reset columns restores automatic widths on reporting grids too", async ({ page }) => {
  await mount(page, { ...products(), reporting: { columnReorder: true } }, { width: 1100 });
  const state = () => page.evaluate(() => api().getState().columns.find(column => column.id === "category"));
  await page.evaluate(() => api().setColumnWidth("category", 300));
  expect(await state()).toMatchObject({ width: 300, sized: true });
  await page.evaluate(() => api().resetColumns());
  expect((await state()).sized).toBeUndefined();
});

test("a log keeps long messages readable and the phone layout keeps essential columns", async ({ page }) => {
  await mount(page, log(), { width: 1000 });
  expect(await page.locator('.cx-hcell[data-cx-column="message"]').evaluate(cell => cell.getBoundingClientRect().width)).toBeGreaterThan(500);
  await page.unrouteAll(); await mount(page, rules(), { viewport: { width: 390, height: 844 }, width: 358 });
  expect(await headers(page)).toEqual(expect.arrayContaining(["rule", "worst"]));
  await expect(page.locator('.cx-row[data-cx-id="r0"] .cx-hidden-fields')).toHaveText(/^\+\d+$/);
});

test("a row tone stays quiet unless the host asks for row accents", async ({ page }) => {
  const view = products(3); view.rows[0].tone = "danger";
  const bar = () => page.locator('.cx-row[data-cx-id="p0"] .cx-cell').first().evaluate(cell => getComputedStyle(cell, "::after").content);
  await mount(page, view); expect(await bar()).toBe("none");
  expect(await page.locator('.cx-row[data-cx-id="p0"] [aria-colindex="5"]').evaluate(cell => getComputedStyle(cell).color))
    .toBe(await page.locator('.cx-row[data-cx-id="p1"] [aria-colindex="5"]').evaluate(cell => getComputedStyle(cell).color));
  await page.unrouteAll(); await mount(page, { ...view, rowAccents: true }); expect(await bar()).toBe('""');
});

test("scrollbars follow the theme through their custom properties", async ({ page }) => {
  const colors = {};
  for (const theme of ["light", "dark"]) {
    await page.unrouteAll(); await mount(page, wide(), { width: 700, theme });
    colors[theme] = await page.locator(".cx-grid").evaluate(grid => getComputedStyle(grid).scrollbarColor);
    expect(colors[theme]).not.toBe("auto");
  }
  expect(colors.light).not.toBe(colors.dark);
});
