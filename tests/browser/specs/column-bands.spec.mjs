import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { serveGrid, headerColumns } from "./column-groups-support.mjs";
import { nextFrames } from "./support.mjs";

const order = ["host", "liveBefore", "rootDomain", "liveAfter"];
function definition(patch = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "bands", label: "Resource status", pageSize: 20, selection: "multiple", search: true,
    source: { kind: "inline" }, reporting: { columnReorder: true, responsive: true },
    columns: order.map((id, index) => ({ id, title: ["Host", "Served", "Root domain", "Issuer"][index], kind: "text", sortable: true,
      width: index === 2 ? 300 : 200, minWidth: index === 2 ? 300 : 200, priority: index === 2 ? "optional" : "essential", ...(index === 0 ? { rowHeader: true } : {}) })),
    columnBands: [{ id: "identity", title: "Identity", columns: ["host", "rootDomain"] }, { id: "live", title: "Live", columns: ["liveBefore", "liveAfter"] }],
    rows: ["one", "two"].map(id => ({ id, cells: { host: id, liveBefore: "Valid", rootDomain: "example.test", liveAfter: "Example Issuer" } })), ...patch };
}
const bands = page => page.evaluate(() => api.getColumnBands().map(band => band.title + ":" + band.columns.join(",")));

test("contiguous default bands span once and reordered runs visibly continue without regrouping", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = definition();
  view.columns = [view.columns[0], view.columns[2], view.columns[1], view.columns[3]];
  view.columns[0].pinned = null;
  await serveGrid(page, view, { runtime: "canopyx-reporting" });
  expect(await bands(page)).toEqual(["Identity:host,rootDomain", "Live:liveBefore,liveAfter"]);
  await expect(page.locator(".cx-hband-continuation")).toHaveCount(0);
  const hierarchy = await page.locator(".cx-hband").first().evaluate(element => {
    const band = getComputedStyle(element), column = getComputedStyle(document.querySelector(".cx-hrow:not(.cx-hgroup-row) .cx-hcell"));
    return { distinct: band.backgroundColor !== column.backgroundColor, separator: parseFloat(band.borderInlineEndWidth) };
  });
  expect(hierarchy.distinct).toBe(true);
  expect(hierarchy.separator).toBeGreaterThan(0);
  await page.evaluate(order => api.setColumnOrder(order), order);
  expect(await headerColumns(page)).toEqual(order);
  expect(await bands(page)).toEqual(["Identity:host", "Live:liveBefore", "Identity:rootDomain", "Live:liveAfter"]);
  const continued = page.locator(".cx-hband-continuation");
  await expect(continued).toHaveCount(2);
  expect(await continued.evaluateAll(cells => cells.map(cell => [cell.dataset.cxGroup,
    getComputedStyle(cell.querySelector(".cx-hgroup-title"), "::before").content,
    getComputedStyle(cell.querySelector(".cx-hgroup-title")).textDecorationStyle]))).toEqual([
    ["identity", '"↳ "', "dotted"], ["live", '"↳ "', "dotted"]]);
  await assertAria(page);
});
test("grid construction rejects non-array semantic and presentation definitions", async ({ page }) => {
  await serveGrid(page, definition({ columnBands: [] }), { runtime: "canopyx-reporting" });
  const errors = await page.evaluate(view => {
    const result = [];
    for (const field of ["columnGroups", "columnBands"]) for (const value of [null, {}, "", "group", 1, { length: 1 }]) {
      const host = document.body.appendChild(document.createElement("div"));
      const input = { ...view }; delete input.columnBands; input[field] = value;
      try { CanopyX.createDataGrid(host, { view: input }); result.push("accepted"); }
      catch (error) { result.push(error.message); }
      finally { host.remove(); }
    }
    return result;
  }, definition());
  expect(errors).toHaveLength(12);
  expect(errors.every(message => message.includes("as an array"))).toBe(true);
});
const state = page => page.evaluate(() => ({ columns: api.getState().columns, query: api.getQuery(), selection: api.getSelection() }));
async function assertAria(page) {
  expect(await page.locator(".cx-hgroup").evaluateAll(cells => cells.map(cell => ({ title: cell.getAttribute("aria-label"),
    index: Number(cell.getAttribute("aria-colindex")), span: Number(cell.getAttribute("aria-colspan")) })))).toEqual(
    await page.evaluate(() => api.getColumnBands().map(band => ({ title: band.title, index: band.columnIndex, span: band.columnSpan }))));
  await expect(page.locator(".cx-hgroup .cx-resize,.cx-hgroup .cx-column-move")).toHaveCount(0);
}

test("presentation bands follow responsive hidden separators without changing column state", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveGrid(page, definition(), { runtime: "canopyx-reporting" });
  const original = await state(page);
  const exportRequest = await page.evaluate(() => {
    window.bandExport = api.prepareExport({ scope: "all", columns: api.view.columns.map(column => column.id), values: "raw" });
    return window.bandExport.request;
  });
  expect(await bands(page)).toEqual(["Identity:host", "Live:liveBefore", "Identity:rootDomain", "Live:liveAfter"]);
  await page.setViewportSize({ width: 720, height: 900 });
  await expect.poll(() => page.evaluate(() => api.getColumnLayout().find(column => column.id === "rootDomain").hiddenReason)).toBe("priority");
  await expect.poll(() => bands(page)).toEqual(["Identity:host", "Live:liveBefore,liveAfter"]);
  expect(await headerColumns(page)).toEqual(["host", "liveBefore", "liveAfter"]);
  expect(await state(page)).toEqual(original);
  expect(await page.evaluate(() => window.bandExport.request)).toEqual(exportRequest);
  await assertAria(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => bands(page)).toEqual(["Identity:host", "Live:liveBefore", "Identity:rootDomain", "Live:liveAfter"]);
  expect(await state(page)).toEqual(original);
  expect(await headerColumns(page)).toEqual(order);
  const mutations = await page.evaluate(async () => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.querySelector(".cx-head"), { childList: true, subtree: true });
    await new Promise(resolve => setTimeout(resolve, 200)); observer.disconnect(); return count;
  });
  expect(mutations).toBe(0);
  expect(errors).toEqual([]);
});

test("presentation chooser hide show and reorder keep ordinary layout and saved views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveGrid(page, definition(), { runtime: "canopyx-reporting" });
  await page.evaluate(() => api.saveView("Original"));
  const originalQuery = await page.evaluate(() => api.getQuery());
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const root = page.getByRole("checkbox", { name: "Root domain", exact: true });
  await root.uncheck();
  await expect.poll(() => bands(page)).toEqual(["Identity:host", "Live:liveBefore,liveAfter"]);
  await root.check();
  await root.focus(); await page.keyboard.press("Alt+ArrowDown");
  expect(await page.evaluate(() => api.getState().columns.map(column => column.id))).toEqual(["host", "liveBefore", "liveAfter", "rootDomain"]);
  expect(await bands(page)).toEqual(["Identity:host", "Live:liveBefore,liveAfter", "Identity:rootDomain"]);
  await page.keyboard.press("Escape");
  await page.evaluate(() => api.setColumnOrder(["liveBefore", "host", "liveAfter", "rootDomain"]));
  expect(await headerColumns(page)).toEqual(["liveBefore", "host", "liveAfter", "rootDomain"]);
  expect(await bands(page)).toEqual(["Live:liveBefore", "Identity:host", "Live:liveAfter", "Identity:rootDomain"]);
  expect(await page.evaluate(() => api.getState().columns.map(column => column.id))).toEqual(["liveBefore", "host", "liveAfter", "rootDomain"]);
  expect(await page.evaluate(() => api.getQuery())).toEqual(originalQuery);
  await page.evaluate(() => api.applySavedView("Original"));
  expect(await headerColumns(page)).toEqual(order);
  const move = page.locator('.cx-hcell[data-cx-column="rootDomain"]').getByRole("button", { name: /drag to move/ });
  await move.press("ArrowLeft");
  expect(await headerColumns(page)).toEqual(["host", "rootDomain", "liveBefore", "liveAfter"]);
  await expect(move).toBeFocused();
  await page.evaluate(() => api.applySavedView("Original"));
  await assertAria(page);
  expect(await page.evaluate(async () => { try { await api.setColumnGroupVisible("live", false); return false; } catch { return true; } })).toBe(true);
});

test("presentation bands split at effective pins and leave individual pin actions intact", async ({ page }) => {
  const view = definition(); view.columns[0].pinned = "left"; view.columns[3].pinned = "right";
  // One logical group spans both pinned edges and the scrolling centre.
  view.columnBands = [{ id: "all", title: "Status", columns: order }];
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveGrid(page, view, { runtime: "canopyx-reporting" });
  expect(await page.evaluate(() => api.getColumnBands().map(band => [band.columns, band.pin]))).toEqual([
    [["host"], "left"], [["liveBefore", "rootDomain"], "none"], [["liveAfter"], "right"]]);
  expect(await page.evaluate(() => api.getColumnGroups()[0].pin)).toBe("mixed");
  await page.evaluate(() => api.setColumnPinned("liveBefore", "left"));
  const pins = await page.evaluate(() => Object.fromEntries(api.getState().columns.map(column => [column.id, column.pin])));
  expect(pins).toEqual({ host: "left", liveBefore: "left", rootDomain: "none", liveAfter: "right" });
  await page.setViewportSize({ width: 720, height: 900 }); await nextFrames(page);
  expect(await page.evaluate(() => api.getColumnBands().every(band => band.columns.every(id =>
    api.getColumnLayout().find(column => column.id === id).pin === band.pin)))).toBe(true);
  await assertAria(page);
});

test("unrelated groups with equal titles remain separate and nested spans preserve level", async ({ page }) => {
  const view = definition({ columnBands: [{ id: "outer", title: "Details", groups: [
    { id: "a", title: "Same", columns: ["host", "liveBefore"] }, { id: "b", title: "Same", columns: ["rootDomain", "liveAfter"] }] }] });
  view.columns[0].pinned = null;
  await serveGrid(page, view, { runtime: "canopyx-reporting" });
  expect(await page.evaluate(() => api.getColumnBands().map(band => [band.id, band.level, band.columns]))).toEqual([
    ["outer", 1, order], ["a", 2, ["host", "liveBefore"]], ["b", 2, ["rootDomain", "liveAfter"]]]);
  await assertAria(page);
  const violations = await new AxeBuilder({ page }).include(".cx-grid").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations.violations.map(item => item.id)).toEqual([]);
});

test("presentation mode preserves export snapshots and record drawer sections", async ({ page }) => {
  const view = definition(); view.columns[0].section = "Authored drawer";
  await serveGrid(page, view, { runtime: "canopyx-reporting" });
  const exported = await page.evaluate(async () => {
    const exportView = api.prepareExport({ scope: "all", columns: api.view.columns.map(column => column.id), values: "raw" });
    const rows = []; for await (const row of exportView.rows()) rows.push(row);
    return { columns: exportView.request.columns.map(column => column.id), rows, sections: api.view.columns.map(column => column.section || null) };
  });
  expect(exported.columns).toEqual(order);
  expect(exported.rows).toHaveLength(2);
  expect(exported.sections).toEqual(["Authored drawer", null, null, null]);
});

test("presentation mode rejects group pins while ordinary grids keep bands unloaded", async ({ page }) => {
  await serveGrid(page, definition({ columnBands: [] }), { runtime: "canopyx-reporting" });
  expect(await page.evaluate(() => api.getColumnBands())).toEqual([]);
  const invalid = definition(); invalid.columnBands[0].pinned = "left";
  const message = await page.evaluate(async view => {
    const host = document.body.appendChild(document.createElement("div"));
    const grid = CanopyX.createDataGrid(host, { view }); let error;
    grid.element.addEventListener("canopyx:error", event => { error = event.detail.error.message; });
    await grid.ready; grid.destroy(); host.remove(); return error;
  }, { ...invalid, id: "invalid" });
  expect(message).toContain("column groups");
  const mixed = definition({ columnGroups: [] });
  expect(await page.evaluate(view => {
    try { CanopyX.createDataGrid(document.body.appendChild(document.createElement("div")), { view }); }
    catch (error) { return error.message; }
  }, mixed)).toContain("choose columnBands or columnGroups");
});
