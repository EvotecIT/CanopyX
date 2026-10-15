// Progressive enhancement of an existing table (docs/enhance.md): what the table gives the grid, the options its attributes
// carry, the pager the enhanced grid shows, short event names, record access and an exact restore on destroy.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames } from "./support.mjs";
import { ready, rowIds, serverTable, servePage } from "./enhance-support.mjs";

// Options are plain values, or a source string when they hold functions (which cannot cross into the page as values).
const enhance = (page, options = {}, selector = "#servers") => page.evaluate(([selector, options]) =>
  CanopyX.enhance(selector, typeof options === "string" ? new Function("return (" + options + ");")() : options).then(grid => { window.grid = grid; }), [selector, options]);

test("a table gives the grid its columns, header groups, rows, ids, sort and search values, markup, caption and footer", async ({ page }) => {
  await servePage(page, serverTable());
  await enhance(page, { pageLength: 10 });
  await ready(page);
  const shape = await page.evaluate(() => ({
    columns: grid.view.columns.map(column => [column.id, column.title, column.kind, !!column.rowHeader, column.section || null]),
    groups: grid.headerGroups, label: grid.element.querySelector("[role=grid]").getAttribute("aria-label"), table: grid.table.id, attached: grid.table.isConnected
  }));
  expect(shape.columns).toEqual([["c0", "Server", "text", true, null], ["c1", "Site", "text", false, null], ["c2", "Load", "number", false, "Usage"],
    ["c3", "Memory", "number", false, "Usage"], ["c4", "Patched", "datetime", false, null], ["c5", "Console", "text", false, null]]);
  expect(shape.groups).toEqual([[{ title: "Usage", columns: ["c2", "c3"] }]]);
  expect(shape).toMatchObject({ label: "Servers by site", table: "servers", attached: false });
  expect((await rowIds(page)).slice(0, 3)).toEqual(["srv-1", "srv-2", "srv-3"]);
  // The row keeps its class and tone; the cell keeps its link; the caption and footer stay visible.
  await expect(page.locator('.cx-row[data-cx-id="srv-3"]')).toHaveClass(/retiring/);
  await expect(page.locator('.cx-row[data-cx-id="srv-1"] a[href="#srv-1"]')).toHaveText("Open");
  await expect(page.locator(".cx-enhanced-caption")).toHaveText("Servers by site");
  await expect(page.locator(".cx-enhanced-foot")).toHaveText("TotalLoad avg 48 %Memory 1,020 GB");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 1 to 10 of 30 rows");
  // Sort values order the column by data-order and data-sort; the text stays what the table showed.
  await page.evaluate(() => grid.sort([{ column: "c3", direction: "asc" }]));
  const memory = await page.evaluate(() => grid.getRows("page").map(record => record[3]));
  expect(memory.slice(0, 3)).toEqual(["4 GB", "6 GB", "8 GB"]);
  // Search values match: WAW is the code of Warsaw in data-search.
  await page.evaluate(() => grid.setQuery({ ...grid.getQuery(), search: "waw", revision: undefined }));
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 1 to 10 of 10 rows (filtered from 30)");
  expect(new Set(await page.evaluate(() => grid.getRows("filtered").map(record => record[1])))).toEqual(new Set(["Warsaw"]));
});

test("options come from data attributes on the table and header cells, and script options win", async ({ page }) => {
  await servePage(page, serverTable({ attributes: "data-page-length='5' data-order='[[2,\"desc\"]]' data-search-text='Berlin' data-info='\"range\"'",
    columnAttributes: { link: "data-sortable='false' data-searchable='false'", seen: "data-visible='false'", load: "data-type='text'" } }));
  await enhance(page, { pageLength: 6 });
  await ready(page);
  const state = await page.evaluate(() => ({ query: grid.getQuery(), paging: grid.getPaging(), columns: grid.view.columns.map(column => [column.id, column.kind, column.sortable, !!column.hidden]),
    searchColumns: grid.view.searchColumns }));
  expect(state.paging.pageLength).toBe(6);
  expect(state.query.sort).toEqual([{ column: "c2", direction: "desc" }]);
  expect(state.query.search).toBe("Berlin");
  expect(state.columns).toEqual([["c0", "text", true, false], ["c1", "text", true, false], ["c2", "text", true, false], ["c3", "number", true, false],
    ["c4", "datetime", true, true], ["c5", "text", false, false]]);
  expect(state.searchColumns).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  await expect(page.locator(".cx-grid-page-range")).toHaveText("1–6 of 10 rows");
  // A text column still sorts by its sort values, as numbers: 90 % before 77 % before 7 %.
  expect((await page.evaluate(() => grid.getRows("page").map(record => record[2]))).slice(0, 2)).toEqual(["90 %", "77 %"]);
});

test("numbered pages, page sizes with All and the result sentence; the current page keeps focus", async ({ page }) => {
  await servePage(page, serverTable({ rows: 95 }));
  await enhance(page, "{ pageLength: 10, on: { page(detail) { (window.pages ||= []).push(detail.paging.pageIndex); } } }");
  await ready(page);
  const pages = page.getByRole("button", { name: /^Page \d+$/ });
  expect(await pages.allTextContents()).toEqual(["1", "2", "3", "4", "5", "10"]);
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Page 5" }).click();
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 41 to 50 of 95 rows");
  await expect(page.getByRole("button", { name: "Page 5" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Page 5" })).toBeFocused();
  expect(await pages.allTextContents()).toEqual(["1", "4", "5", "6", "10"]);
  // Keyboard: the next page button is a Tab stop away, and Enter moves on with focus on the new current page.
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 51 to 60 of 95 rows");
  await expect(page.getByRole("button", { name: "Page 6" })).toBeFocused();
  expect(await page.evaluate(() => window.pages)).toEqual([4, 5]);
  const sizes = page.getByRole("combobox", { name: "Rows per page" });
  expect(await sizes.locator("option").allTextContents()).toEqual(["10", "25", "50", "100", "All"]);
  await sizes.selectOption("all");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 1 to 95 of 95 rows");
  await expect(page.getByRole("button", { name: /^Page \d+$/ })).toHaveCount(1);
});

test("short event names follow accepted queries and the controller reads and changes records", async ({ page }) => {
  await servePage(page, serverTable({ rows: 30 }));
  await page.evaluate(() => { window.log = []; });
  await enhance(page, "{ pageLength: 10, on: { init: () => log.push(\"init\") } }");
  await ready(page);
  await page.evaluate(() => { for (const name of ["draw", "order", "search", "page", "length", "select"]) grid.on(name, () => log.push(name)); });
  await page.evaluate(() => grid.sort([{ column: "c2", direction: "asc" }]));
  await page.evaluate(() => grid.goToPage(1));
  await page.evaluate(() => grid.setPageLength(25));
  await page.evaluate(() => grid.setQuery({ ...grid.getQuery(), search: "Madrid", revision: undefined }));
  expect(await page.evaluate(() => log)).toEqual(["init", "order", "draw", "page", "draw", "length", "page", "draw", "search", "draw"]);
  // Records come back as the table's cell texts; rows can be added and removed without losing the sort or search.
  expect(await page.evaluate(() => grid.getRow("srv-2"))).toEqual(["server-02", "Berlin", "48 %", "17 GB", "2026-02-11", "Open"]);
  await page.evaluate(() => grid.addRows([["server-99", "Madrid", "1 %", "2 GB", "2026-01-01", "Open"]]));
  expect(await page.evaluate(() => ({ query: grid.getQuery().search, first: grid.getRows("page")[0][0], count: grid.getPaging().matched }))).toEqual({ query: "Madrid", first: "server-99", count: 11 });
  await page.evaluate(() => grid.removeRows(["r31"]));
  expect(await page.evaluate(() => grid.getPaging().matched)).toBe(10);
  await page.evaluate(() => grid.setData([["only", "Madrid", "5 %", "1 GB", "2026-01-01", "-"]]));
  expect(await page.evaluate(() => grid.getRows())).toEqual([["only", "Madrid", "5 %", "1 GB", "2026-01-01", "-"]]);
});

test("destroy puts the original table back exactly; enhancing twice returns the same controller", async ({ page }) => {
  await servePage(page, "<p>before</p>" + serverTable({ rows: 12 }) + "<p>after</p>");
  const original = await page.evaluate(() => { window.table = document.getElementById("servers"); return table.outerHTML; });
  await enhance(page);
  await ready(page);
  // The table left the document, so a selector no longer finds it; the element and the grid host find the same controller.
  expect(await page.evaluate(() => Promise.all([CanopyX.enhance(table), CanopyX.grid(grid.element)]).then(found => found.every(item => item === grid)))).toBe(true);
  await page.evaluate(() => grid.destroy());
  expect(await page.evaluate(() => ({ same: document.getElementById("servers") === table, html: table.outerHTML, between: table.previousElementSibling.textContent + table.nextElementSibling.textContent,
    hosts: document.querySelectorAll(".cx-host").length }))).toEqual({ same: true, html: original, between: "beforeafter", hosts: 0 });
});

test("the enhanced example works without a build step and passes axe in light and dark", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.goto(exampleUrl("enhance-table.html") + (theme === "dark" ? "?theme=dark" : ""));
    await ready(page, "exampleGrid");
    await expect(page.locator(".cx-host")).toHaveAttribute("data-cx-theme", theme);
    await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 1 to 10 of 60 rows");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.map(violation => violation.id + ": " + violation.nodes.slice(0, 3).map(node => node.target.join(" ")).join(", "))).toEqual([]);
  }
});

test("on a phone the numbered pager fits and shows five pages at most", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await servePage(page, serverTable({ rows: 95 }));
  await enhance(page, { pageLength: 10 });
  await ready(page);
  await nextFrames(page);
  expect(await page.getByRole("button", { name: /^Page \d+$/ }).count()).toBeLessThanOrEqual(5);
  const overflow = await page.evaluate(() => { const pager = document.querySelector(".cx-grid-pager"); return pager.scrollWidth - pager.clientWidth; });
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Page 2" }).click();
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
});

test("the first of several row-header columns is the identity column; text options keep their attribute; a page anchor stays", async ({ page }) => {
  await servePage(page, "<p id='top'>top</p><table id='regions'><thead><tr><th data-id='2024'>Region</th><th>Country</th><th>Code</th></tr></thead><tbody>" +
    "<tr><th>North</th><th>Norway</th><td>A12</td></tr><tr><th>South</th><th>Spain</th><td>B07</td></tr></tbody></table>");
  await page.evaluate(() => { location.hash = "top"; });
  await enhance(page, { stateSave: { url: "hash" } }, "#regions");
  await ready(page);
  expect(await page.evaluate(() => grid.view.columns.map(column => [column.id, !!column.rowHeader, column.kind]))).toEqual([["2024", true, "text"], ["c1", false, "text"], ["c2", false, "text"]]);
  await page.evaluate(() => grid.sort([{ column: "c1", direction: "desc" }]));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => location.hash)).toBe("#top");
});

test("leaving the first page by Previous keeps focus on the pager", async ({ page }) => {
  await servePage(page, serverTable({ rows: 40 }));
  await enhance(page, { pageLength: 10 });
  await ready(page);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Page 2", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeFocused();
  // Typing elsewhere while a page loads keeps the reader's focus where it went.
  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await page.getByRole("searchbox").focus();
  await page.waitForTimeout(200);
  await expect(page.getByRole("searchbox")).toBeFocused();
});