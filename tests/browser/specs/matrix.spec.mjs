// The matrix view (docs/matrix.md): sticky headers with both axes windowed, states drawn with a symbol and a label, totals,
// sorting, filtering and grouping on either axis, the self cells of a square matrix, details, the grid keyboard, phones,
// right to left, the state API, printing, and documents that fail.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const STATES = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/matrix-small.json"), "utf8")).states;
// The shared fixture (CanopyX.Tests reads it too): six rows (two sites) by four columns (two tiers). Totals count Failing and
// Slow: rows a 1, b 0, c 1, d 2, e 0, f 0; columns x 2, y 0, z 1, w 1.
function matrixDoc(extra = {}) {
  return Object.assign(JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/matrix-small.json"), "utf8")), extra);
}async function mountMatrix(page, view, { width = 1200, height = 520, dir = "ltr", lang = "en", options = "", script = "" } = {}) {
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  const body = "<!DOCTYPE html><html lang=\"" + lang + "\" dir=\"" + dir + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Matrix</title><style>" +
    asset("canopyx-grid.css") + asset("canopyx-matrix.css") + "</style><script>" + asset("canopyx-grid.js") + "\n" + asset("canopyx-matrix.js") + "\n" + script + "</script></head>" +
    "<body style=\"margin:0;padding:16px\"><div id=\"frame\" style=\"width:" + width + "px;max-width:100%\"><div id=\"host\" style=\"height:" + height + "px\"></div></div>" +
    "<script>window.events=[];document.addEventListener('canopyx:matrixCell',e=>events.push(e.detail));document.addEventListener('canopyx:matrixState',e=>events.push({state:e.detail}));" +
    "window.api=CanopyX.createMatrix(document.getElementById('host'),Object.assign({view:JSON.parse(" + JSON.stringify(json) + ")}," + (options || "{}") + "));</script></body></html>";
  await page.route("http://canopyx.test/matrix", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/matrix");
  await page.evaluate(() => api.ready);
  await nextFrames(page);
}
// Cells are drawn on a canvas per row; the focused cell is a gridcell element. These read a cell's name through focus, its
// drawn background through the canvas, and click it where it is drawn.
const cellLabel = (page, row, column) => page.evaluate(([row, column]) => { api.focusCell(row, column); return document.activeElement.getAttribute("aria-label"); }, [row, column]);
async function cellPoint(page, rowLabel, column) {
  return page.evaluate(([rowLabel, column]) => {
    const row = [...document.querySelectorAll(".cx-mx-row")].find(item => item.querySelector(".cx-mx-rowhead").textContent === rowLabel);
    const head = document.querySelector('.cx-mx-hcell[aria-colindex="' + (column + 2) + '"]').getBoundingClientRect(), box = row.getBoundingClientRect();
    return { x: head.left + head.width / 2, y: box.top + box.height / 2 };
  }, [rowLabel, column]);
}
const cellPixel = (page, rowLabel, column) => page.evaluate(([rowLabel, column]) => {
  const row = [...document.querySelectorAll(".cx-mx-row")].find(item => item.querySelector(".cx-mx-rowhead").textContent === rowLabel), canvas = row.querySelector("canvas");
  const head = document.querySelector('.cx-mx-hcell[aria-colindex="' + (column + 2) + '"]').getBoundingClientRect(), box = canvas.getBoundingClientRect(), ratio = canvas.width / box.width;
  return [...canvas.getContext("2d").getImageData(Math.round((head.left - box.left + 3) * ratio), Math.round(3 * ratio), 1, 1).data];
}, [rowLabel, column]);
const clickCell = async (page, rowLabel, column) => { const point = await cellPoint(page, rowLabel, column); await page.mouse.click(point.x, point.y); };
const rowLabels = page => page.locator(".cx-mx-row").evaluateAll(rows => rows.sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex")).map(row => row.querySelector(".cx-mx-rowhead").textContent));
const headLabels = page => page.locator(".cx-mx-hcell").evaluateAll(cells => cells.sort((a, b) => a.getAttribute("aria-colindex") - b.getAttribute("aria-colindex")).map(cell => cell.textContent));

test("a matrix draws its cells with a symbol, a label and its totals", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  const grid = page.getByRole("grid", { name: "Small matrix" });
  await expect(grid).toHaveAttribute("aria-rowcount", "8");
  await expect(grid).toHaveAttribute("aria-colcount", "6");
  expect(await rowLabels(page)).toEqual(["Row A", "Row B", "Row C", "Row D", "Row E", "Row F"]);
  expect(await headLabels(page)).toEqual(["Col X", "Col Y", "Col Z", "Col W"]);
  // A state never relies on colour alone: a symbol in the cell and the state in its accessible name.
  expect(await cellLabel(page, "c", "x")).toBe("Row C and Col X: Failing, 3");
  expect(await cellLabel(page, "c", "y")).toBe("Row C and Col Y: No data");
  await expect(page.locator(".cx-mx-key svg")).toHaveCount(3);
  // Cells that need attention are filled with their tone; the others draw only their symbol.
  // Layout and theme observers may queue another canvas paint after the DOM has its final labels.
  await expect.poll(async () => (await cellPixel(page, "Row C", 0))[3]).toBeGreaterThan(0);
  expect((await cellPixel(page, "Row A", 0))[3]).toBe(0);
  expect(await page.locator(".cx-mx-row .cx-mx-total").allTextContents()).toEqual(["1", "0", "1", "2", "0", "0"]);
  expect(await page.locator(".cx-mx-fcell").allTextContents()).toEqual(["2", "0", "1", "1"]);
  await expect(page.locator(".cx-mx-grand")).toHaveText("4");
  await expect(page.locator(".cx-mx-summary")).toHaveText("6 × 4 · Need attention: 4");
  expect(await page.locator(".cx-mx-key").allTextContents()).toEqual(["Failing3", "Slow1", "Healthy14", "No data6"]);
});

test("a theme switch draws the cells again in the theme's colours", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  const light = await cellPixel(page, "Row C", 0);
  await page.locator("#host").evaluate(host => host.setAttribute("data-cx-theme", "dark"));
  await nextFrames(page); await nextFrames(page);
  const dark = await cellPixel(page, "Row C", 0);
  expect(dark).not.toEqual(light);
  expect(dark[3]).toBeGreaterThan(0);
});

test("the keyboard moves one tab stop over cells, headers and totals, and Enter opens the details", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.locator('.cx-mx-scroll [tabindex="0"]').focus();
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row A and Col X: Healthy");
  await expect(page.locator('.cx-mx-scroll [tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row C and Col X: Failing, 3");
  await expect(page.locator(".cx-mx-tip")).toBeVisible();
  await expect(page.locator(".cx-mx-tip")).toContainText("Three probes failed.");
  await page.keyboard.press("End");
  await expect(page.locator(":focus")).toHaveText("1");
  await page.keyboard.press("Home");
  await expect(page.locator(":focus")).toHaveText("Row C");
  await page.keyboard.press("Control+End");
  await expect(page.locator(":focus")).toHaveClass(/cx-mx-grand/);
  await page.keyboard.press("Control+Home");
  await expect(page.locator(":focus")).toHaveText("Row A");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(":focus")).toHaveClass(/cx-mx-corner/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(":focus")).toHaveText("Col X");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog.cx-mx-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("h2")).toHaveText("Row D · Col X");
  await expect(dialog).toContainText("Value42");
  expect(await page.evaluate(() => events.filter(event => event.row).map(event => [event.row, event.column, event.state, event.value]))).toEqual([["d", "x", "slow", 42]]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row D and Col X: Slow, 42");
});

test("a host that handles the cell event, or asks for details host, keeps the dialog closed", async ({ page }) => {
  await mountMatrix(page, matrixDoc(), { options: "{onCell:(detail,event)=>{if(detail.row==='c')event.preventDefault();}}" });
  await clickCell(page, "Row C", 0);
  await expect(page.locator("dialog.cx-mx-dialog")).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row C and Col X: Failing, 3");
  await clickCell(page, "Row D", 0);
  await expect(page.locator("dialog.cx-mx-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.unrouteAll();
  await mountMatrix(page, matrixDoc({ details: "host" }));
  await clickCell(page, "Row D", 0);
  await expect(page.locator("dialog.cx-mx-dialog")).toHaveCount(0);
  expect(await page.evaluate(() => events.filter(event => event.row).length)).toBe(1);
});

test("sorting by total or name, grouping and collapsing a group rolls its cells up", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.evaluate(() => api.sort("rows", "#total", "desc"));
  expect(await rowLabels(page)).toEqual(["Row D", "Row A", "Row C", "Row B", "Row E", "Row F"]);
  await page.evaluate(() => api.sort("columns", "#label", "desc"));
  expect(await headLabels(page)).toEqual(["Col Z", "Col Y", "Col X", "Col W"]);
  await page.evaluate(() => { api.sort("columns", null); api.group("rows", "site"); });
  expect(await rowLabels(page)).toEqual(["North3", "Row A", "Row C", "Row B", "South3", "Row D", "Row E", "Row F"]);
  // Collapsing North rolls its three rows into one: the worst state of each column and how many need attention.
  await page.getByRole("button", { name: "Collapse North" }).click();
  expect(await rowLabels(page)).toEqual(["North3", "South3", "Row D", "Row E", "Row F"]);
  expect(await cellLabel(page, "a", "x")).toBe("North and Col X: Failing, 1");
  await expect(page.locator(".cx-mx-rolledrow .cx-mx-total")).toHaveText("2");
  await page.getByRole("button", { name: "Expand North" }).click();
  await expect(page.locator(".cx-mx-rolledrow")).toHaveCount(0);
  // Columns group into bands; a collapsed band is one column.
  await page.evaluate(() => api.group("columns", "tier"));
  await expect(page.locator(".cx-mx-bcell")).toHaveText(["Core", "Edge"]);
  await page.getByRole("button", { name: "Collapse Edge" }).click();
  expect(await headLabels(page)).toEqual(["Col X", "Col Y", "Edge"]);
  expect(await page.evaluate(() => api.getState())).toMatchObject({ group: { rows: "site", columns: "tier" }, collapsed: { rows: [], columns: ["Edge"] } });
});

test("search, facet values and only problems filter both axes, and the totals follow", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.getByRole("searchbox", { name: "Find rows and columns" }).fill("col z");
  await expect.poll(() => headLabels(page)).toEqual(["Col Z"]);
  expect(await rowLabels(page)).toHaveLength(6);
  await expect(page.locator(".cx-mx-summary")).toHaveText("Rows: 6 of 6, columns: 1 of 4 · Need attention: 1");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect.poll(() => headLabels(page)).toHaveLength(4);
  await page.getByRole("button", { name: "Server", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Server" });
  await panel.getByRole("checkbox", { name: /South/ }).check();
  expect(await rowLabels(page)).toEqual(["Row D", "Row E", "Row F"]);
  await expect(page.locator(".cx-mx-grand")).toHaveText("2");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.getByRole("checkbox", { name: "Only problems" }).check();
  expect(await rowLabels(page)).toEqual(["Row D"]);
  expect(await headLabels(page)).toEqual(["Col X", "Col W"]);
  expect(await page.evaluate(() => api.getVisible())).toEqual({ rows: ["d"], columns: ["x", "w"] });
  await page.evaluate(() => api.setState({ filters: { rows: { site: ["East"] } }, attentionOnly: false }));
  await expect(page.locator(".cx-mx-empty")).toHaveText("No rows or columns match.");
});

test("hide empty drops the rows and columns without data, keeps the partners of a search, and empty cells show a faint dot", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  // A cell without data draws a small dot at its centre and nothing at its edge.
  const empty = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".cx-mx-row")].find(item => item.querySelector(".cx-mx-rowhead").textContent === "Row C"), canvas = row.querySelector("canvas");
    const head = document.querySelector('.cx-mx-hcell[aria-colindex="3"]').getBoundingClientRect(), box = canvas.getBoundingClientRect(), ratio = canvas.width / box.width, ctx = canvas.getContext("2d");
    const at = (x, y) => ctx.getImageData(Math.round((head.left - box.left + x) * ratio), Math.round(y * ratio), 1, 1).data[3];
    return { centre: at(head.width / 2, box.height / 2), edge: at(4, 4) };
  });
  expect(empty.centre).toBeGreaterThan(0); expect(empty.edge).toBe(0);
  const toggle = page.getByRole("checkbox", { name: "Hide empty rows and columns" });
  await toggle.check();
  expect(await rowLabels(page)).toEqual(["Row A", "Row B", "Row C", "Row D", "Row E"]);
  expect(await headLabels(page)).toHaveLength(4);
  await page.getByRole("searchbox", { name: "Find rows and columns" }).fill("row c");
  await expect.poll(() => headLabels(page)).toEqual(["Col X", "Col W"]);
  expect(await page.evaluate(() => api.getState())).toMatchObject({ search: "row c", hideEmpty: true });
  await page.evaluate(() => api.setState({ hideEmpty: false }));
  await expect.poll(() => headLabels(page)).toHaveLength(4);
  await expect(toggle).not.toBeChecked();
  // A matrix with data in every cell offers no switch; a document can open with it on.
  await page.unrouteAll();
  await mountMatrix(page, matrixDoc({ cells: Array.from({ length: 6 }, () => "2222"), notes: [] }));
  await expect(toggle).toBeHidden();
  await page.unrouteAll();
  await mountMatrix(page, matrixDoc({ hideEmpty: true }));
  await expect(toggle).toBeChecked();
  expect(await rowLabels(page)).toHaveLength(5);
});

test("a matrix whose rows fit is as tall as they are, and a long one fills its host and scrolls", async ({ page }) => {
  await mountMatrix(page, matrixDoc(), { height: 520 });
  const sizes = () => page.evaluate(() => {
    const host = document.getElementById("host").getBoundingClientRect(), scroll = document.querySelector(".cx-mx-scroll");
    return { host: Math.round(host.height), gap: Math.round(host.bottom - scroll.getBoundingClientRect().bottom), overflow: scroll.scrollHeight - scroll.clientHeight };
  });
  const fitted = await sizes();
  expect(fitted.host).toBeLessThan(470); expect(Math.abs(fitted.gap)).toBeLessThanOrEqual(2); expect(fitted.overflow).toBe(0);
  await page.evaluate(doc => api.update(doc), matrixDoc({ autoHeight: false }));
  await nextFrames(page);
  expect((await sizes()).host).toBe(520);
  const items = Array.from({ length: 60 }, (_, i) => ({ id: "r" + i, label: "Row " + i }));
  await page.evaluate(doc => api.update(doc), matrixDoc({ rows: { title: "Server", items }, cells: items.map(() => "2222"), notes: [] }));
  await nextFrames(page);
  const long = await sizes();
  expect(long.host).toBe(520); expect(Math.abs(long.gap)).toBeLessThanOrEqual(2); expect(long.overflow).toBeGreaterThan(0);
  // Rows passing under the totals row raise it with a shadow, and under the header once scrolled.
  await expect(page.locator(".cx-mx-foot")).toHaveClass(/cx-mx-raised/);
  await expect(page.locator(".cx-mx-head")).not.toHaveClass(/cx-mx-raised/);
  await page.locator(".cx-mx-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator(".cx-mx-head")).toHaveClass(/cx-mx-raised/);
  await expect(page.locator(".cx-mx-foot")).not.toHaveClass(/cx-mx-raised/);
  // A host that was hidden fits once it shows.
  await page.locator("#host").evaluate(host => { host.style.display = "none"; });
  await page.evaluate(doc => api.update(doc), matrixDoc());
  await page.locator("#host").evaluate(host => { host.style.display = ""; });
  await nextFrames(page); await nextFrames(page);
  const shown = await sizes();
  expect(shown.host).toBeLessThan(470); expect(Math.abs(shown.gap)).toBeLessThanOrEqual(2); expect(shown.overflow).toBe(0);
  await page.evaluate(() => api.destroy());
  expect(await page.locator("#host").evaluate(host => [host.style.height, host.style.maxHeight])).toEqual(["520px", ""]);
});

test("the self cells of a square matrix count nowhere, unless the diagonal holds data", async ({ page }) => {
  const square = { protocol: "canopyx/2", type: "matrix", id: "square", label: "Square", square: true, columnTitle: "Source",
    rows: { title: "Destination", items: ["a", "b", "c"].map(id => ({ id, label: id.toUpperCase() })) }, states: STATES, cells: ["000", "201", "220"] };
  await mountMatrix(page, square);
  expect(await cellLabel(page, "a", "a")).toBe("A and A: Same item");
  expect(await cellLabel(page, "c", "c")).toBe("C and C: Same item");
  await expect(page.locator(".cx-mx-grand")).toHaveText("3");
  await expect(page.locator(".cx-mx-hrow .cx-mx-corner")).toContainText("Source");
  await page.unrouteAll();
  await mountMatrix(page, Object.assign({}, square, { diagonal: "data" }));
  expect(await cellLabel(page, "a", "a")).toBe("A and A: Failing");
  await expect(page.locator(".cx-mx-grand")).toHaveText("6");
});

test("both axes are windowed: a 150 by 150 matrix mounts a viewport of cells, with headers stuck to the edges", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(exampleUrl("matrix-replication.html"));
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
  // The cells drawn: each mounted row's canvas covers the window of columns.
  const mounted = () => page.locator(".cx-mx-row canvas:not([hidden])").evaluateAll(canvases => canvases.reduce((sum, canvas) => sum + Math.round(parseFloat(canvas.style.width) / 30), 0));
  expect(await mounted()).toBeLessThan(2500);
  const scroll = page.locator(".cx-mx-scroll");
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; element.scrollLeft = element.scrollWidth; });
  await nextFrames(page);
  expect(await mounted()).toBeLessThan(2500);
  const geometry = await page.evaluate(() => {
    const scroll = document.querySelector(".cx-mx-scroll").getBoundingClientRect(), head = document.querySelector(".cx-mx-head").getBoundingClientRect();
    const rowHead = document.querySelector(".cx-mx-row .cx-mx-rowhead").getBoundingClientRect(), foot = document.querySelector(".cx-mx-foot").getBoundingClientRect();
    return { head: head.top - scroll.top, rowHead: rowHead.left - scroll.left, foot: scroll.bottom - foot.bottom };
  });
  expect(Math.abs(geometry.head)).toBeLessThanOrEqual(2); expect(Math.abs(geometry.rowHead)).toBeLessThanOrEqual(2); expect(Math.abs(geometry.foot)).toBeLessThanOrEqual(2);
  await expect(page.locator(".cx-mx-hcell").last()).toContainText("DC");
  await expect(page.locator('.cx-mx-hcell[aria-colindex="151"]')).toHaveCount(1);
});

test("a column band names itself from where it meets the view, and a sliver of a band shows no name", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(exampleUrl("matrix-replication.html"));
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
  const bands = () => page.evaluate(() => {
    const start = document.querySelector(".cx-mx-bandcorner").getBoundingClientRect().right, end = document.querySelector(".cx-mx-bandend").getBoundingClientRect().left;
    return [...document.querySelectorAll(".cx-mx-bcell")].map(band => {
      const box = band.getBoundingClientRect(), toggle = band.querySelector(".cx-mx-toggle").getBoundingClientRect();
      return { x: box.left, width: box.width, shown: Math.min(end, box.right) - Math.max(start, box.left), clipped: band.classList.contains("cx-mx-bclip"), left: Math.round(toggle.left - start), right: Math.round(end - toggle.right) };
    }).filter(band => band.shown > 0).sort((a, b) => a.x - b.x);
  });
  // Every band in view either shows its whole button inside the view, or (a sliver at the edge) no name at all.
  const check = list => { for (const band of list) if (!band.clipped) { expect(band.left).toBeGreaterThanOrEqual(-1); expect(band.right).toBeGreaterThanOrEqual(-1); } else expect(band.shown).toBeLessThan(Math.min(40, band.width)); };
  const initial = await bands();
  expect(initial.length).toBeGreaterThan(1);
  check(initial);
  // Scroll halfway into the first band, so it passes under the row headers.
  await page.locator(".cx-mx-scroll").evaluate(element => { element.scrollLeft = Math.floor(element.querySelector(".cx-mx-bcell").getBoundingClientRect().width / 2); });
  await nextFrames(page);
  const scrolled = await bands();
  check(scrolled);
  // The band scrolled under the row headers names itself at the start of the view.
  expect(scrolled[0].clipped).toBe(false);
  expect(scrolled[0].left).toBeGreaterThanOrEqual(0); expect(scrolled[0].left).toBeLessThanOrEqual(6);
});

test("right to left mirrors the sticky sides and the arrow keys", async ({ page }) => {
  await mountMatrix(page, matrixDoc(), { dir: "rtl" });
  const geometry = await page.evaluate(() => {
    const scroll = document.querySelector(".cx-mx-scroll").getBoundingClientRect(), head = document.querySelector(".cx-mx-row .cx-mx-rowhead").getBoundingClientRect(), total = document.querySelector(".cx-mx-row .cx-mx-total").getBoundingClientRect();
    return { head: scroll.right - head.right, total: total.left - scroll.left };
  });
  expect(Math.abs(geometry.head)).toBeLessThanOrEqual(2);
  expect(geometry.total).toBeLessThan(80);
  await page.locator('.cx-mx-scroll [tabindex="0"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row A and Col Y: Healthy");
});

test("on a phone the row headers stay pinned, or a card per row lists what needs attention", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const wide = matrixDoc({ columns: { title: "Service", items: Array.from({ length: 14 }, (_, i) => ({ id: "c" + i, label: "Service " + i })) },
    cells: Array.from({ length: 6 }, () => "2".repeat(14)), notes: [] });
  await mountMatrix(page, wide, { width: 358 });
  await expect(page.locator(".cx-matrix")).toHaveClass(/cx-mx-phone/);
  await page.locator(".cx-mx-scroll").evaluate(element => { element.scrollLeft = 200; });
  await nextFrames(page);
  const left = await page.evaluate(() => document.querySelector(".cx-mx-row .cx-mx-rowhead").getBoundingClientRect().left - document.querySelector(".cx-mx-scroll").getBoundingClientRect().left);
  expect(Math.abs(left)).toBeLessThanOrEqual(2);
  expect(await page.locator(".cx-mx-button").first().evaluate(button => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.unrouteAll();
  await mountMatrix(page, matrixDoc({ phone: "cards" }), { width: 358 });
  await expect(page.locator(".cx-mx-scroll")).toBeHidden();
  await expect(page.locator(".cx-mx-card")).toHaveCount(6);
  await expect(page.locator(".cx-mx-card").nth(3)).toContainText("Col X · Slow · 42");
  await expect(page.locator(".cx-mx-card").nth(3).locator(".cx-mx-total")).toHaveAttribute("aria-label", "Row D: 2");
  await expect(page.locator(".cx-mx-card").nth(1)).toContainText("Nothing needs attention");
});

test("the state round-trips, and update keeps the query that still applies", async ({ page }) => {
  await mountMatrix(page, matrixDoc(), { options: "{state:{sort:{rows:{by:'#total',direction:'desc'}},attentionOnly:true}}" });
  expect(await rowLabels(page)).toEqual(["Row D", "Row A", "Row C"]);
  const state = await page.evaluate(() => api.getState());
  expect(state).toMatchObject({ attentionOnly: true, sort: { rows: { by: "#total", direction: "desc" } } });
  await page.evaluate(doc => api.update(doc), matrixDoc({ cells: ["2222", "0222", "2222", "2222", "2222", "...."] }));
  expect(await rowLabels(page)).toEqual(["Row B"]);
  await expect(page.locator(".cx-mx-grand")).toHaveText("1");
  await expect(page.evaluate(() => api.setState({ sort: { rows: { by: "nope", direction: "asc" } } }))).rejects.toThrow(/matrix sort/);
});

test("a resize across the phone width moves rows, headers and cells together", async ({ page }) => {
  await mountMatrix(page, matrixDoc(), { width: 900 });
  const geometry = () => page.evaluate(() => {
    const head = document.querySelector('.cx-mx-hcell[aria-colindex="2"]').getBoundingClientRect(), rows = [...document.querySelectorAll(".cx-mx-row")].sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex"));
    const tile = rows[0].querySelector("canvas").getBoundingClientRect();
    return { offset: Math.round(tile.left - head.left), step: Math.round(rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top), rowHeight: Math.round(rows[0].getBoundingClientRect().height) };
  });
  const wide = await geometry();
  expect(wide.offset).toBe(0); expect(wide.step).toBe(wide.rowHeight);
  expect(await cellLabel(page, "c", "x")).toBe("Row C and Col X: Failing, 3");
  await page.locator("#frame").evaluate(frame => frame.style.width = "380px");
  await nextFrames(page); await nextFrames(page);
  await expect(page.locator(".cx-matrix")).toHaveClass(/cx-mx-phone/);
  const narrow = await geometry();
  expect(narrow.offset).toBe(0); expect(narrow.step).toBe(narrow.rowHeight); expect(narrow.rowHeight).toBeGreaterThan(wide.rowHeight);
  // Keyboard focus stays on its cell through the new layout.
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row C and Col X: Failing, 3");
});

test("a click finds its cell right to left too", async ({ page }) => {
  await mountMatrix(page, matrixDoc(), { dir: "rtl" });
  // The details dialog names the cell the click found.
  await clickCell(page, "Row C", 0);
  await expect(page.locator("dialog.cx-mx-dialog h2")).toHaveText("Row C · Col X");
  await page.keyboard.press("Escape");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row C and Col X: Failing, 3");
  await clickCell(page, "Row D", 3);
  await expect(page.locator("dialog.cx-mx-dialog h2")).toHaveText("Row D · Col W");
});

test("grouped columns add a header row, keep one tab stop and roll up from the keyboard", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.evaluate(() => api.group("columns", "tier"));
  const grid = page.getByRole("grid", { name: "Small matrix" });
  await expect(grid).toHaveAttribute("aria-rowcount", "9");
  await expect(page.locator(".cx-mx-band")).toHaveAttribute("aria-rowindex", "1");
  await expect(page.locator(".cx-mx-hrow")).toHaveAttribute("aria-rowindex", "2");
  expect(await page.locator(".cx-mx-row").first().getAttribute("aria-rowindex")).toBe("3");
  await expect(page.locator('.cx-mx-band button[tabindex="0"], .cx-mx-band button:not([tabindex])')).toHaveCount(0);
  await page.locator('.cx-mx-scroll [tabindex="0"]').focus();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowUp");
  await expect(page.locator(":focus")).toHaveText("Col Z");
  await page.keyboard.press("Enter");
  expect(await headLabels(page)).toEqual(["Col X", "Col Y", "Edge"]);
});

test("focus stays on its cell when the matrix is updated or its state changes", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  expect(await cellLabel(page, "d", "x")).toBe("Row D and Col X: Slow, 42");
  await page.evaluate(doc => api.update(doc), matrixDoc({ notes: [[3, 0, 43]] }));
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row D and Col X: Slow, 43");
  await page.evaluate(() => api.sort("columns", "#label", "desc"));
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row D and Col X: Slow, 43");
  const replacement = matrixDoc({ notes: [[0, 0, 44]], cells: ["1220", "2202", "2222", "0..2", "2222", "...."] });
  replacement.rows.items = [3, 0, 1, 2, 4, 5].map(index => replacement.rows.items[index]);
  await page.evaluate(doc => api.update(doc), replacement);
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row D and Col X: Slow, 44");
});

test("live refresh keeps valid query components when one axis loses an attribute", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.evaluate(() => api.setState({ search: "Row", hideEmpty: true, attentionOnly: true,
    group: { rows: "site", columns: "tier" }, filters: { rows: { site: ["South"] }, columns: { tier: ["Core"] } },
    sort: { rows: { by: "site", direction: "desc" }, columns: { by: "#label", direction: "desc" } }, collapsed: { columns: ["Core"] } }));
  const doc = matrixDoc();
  delete doc.rows.attributes;
  doc.rows.items.forEach(item => { delete item.values; });
  await page.evaluate(doc => api.update(doc), doc);
  expect(await page.evaluate(() => api.getState())).toEqual({ search: "Row", hideEmpty: true, attentionOnly: true,
    group: { rows: null, columns: "tier" }, filters: { rows: {}, columns: { tier: ["Core"] } },
    sort: { rows: null, columns: { by: "#label", direction: "desc" } }, collapsed: { rows: [], columns: ["Core"] } });
  expect(await page.evaluate(() => api.getVisible().rows)).toEqual(["c", "d"]);
});

test("datetime attributes sort by instant on both axes, including fractional seconds and offsets", async ({ page }) => {
  const doc = matrixDoc(), times = ["2026-10-20T08:00:00.500Z", "2026-10-20T08:00:00Z", "2026-10-20T09:00:00+02:00", "2026-10-20T10:00:00Z"];
  for (const axis of [doc.rows, doc.columns]) {
    axis.attributes.push({ id: "at", title: "At", kind: "datetime" });
    axis.items.forEach((item, index) => { item.values.at = times[index % times.length]; });
  }
  await mountMatrix(page, doc);
  await page.evaluate(() => { api.sort("rows", "at"); api.sort("columns", "at"); });
  expect(await page.evaluate(() => api.getVisible())).toEqual({ rows: ["c", "b", "f", "a", "e", "d"], columns: ["z", "y", "x", "w"] });
});

test("sort state defaults to ascending and filters preserve supported dictionary keys", async ({ page }) => {
  const doc = matrixDoc();
  doc.rows.attributes.push({ id: "__proto__", title: "Region", facet: true });
  doc.rows.items.forEach((item, index) => { item.values = { ...item.values, ["__proto__"]: index < 3 ? "North" : "South" }; });
  await mountMatrix(page, doc, { options: "{state:{sort:{columns:{by:'#label'}}}}" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "Server", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Server", exact: true });
  await expect(panel.getByRole("checkbox", { name: "North", exact: false }).last()).toBeVisible();
  expect(errors).toEqual([]);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => { api.setState({ sort: { rows: { by: "#label" } } }); api.filter("rows", "__proto__", ["North"]); });
  expect(await page.evaluate(() => api.getVisible().rows)).toEqual(["a", "b", "c"]);
  // Serialize inside the page so the automation transport cannot reinterpret the __proto__ property.
  expect(JSON.parse(await page.evaluate(() => JSON.stringify(api.getState().filters.rows)))).toEqual({ ["__proto__"]: ["North"] });
  expect(await page.evaluate(() => api.getState().sort)).toEqual({ rows: { by: "#label", direction: "asc" }, columns: { by: "#label", direction: "asc" } });
});

test("removing totals during refresh preserves a visible keyboard entry point", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.locator('.cx-mx-scroll [tabindex="0"]').focus();
  await page.keyboard.press("Control+End");
  await expect(page.locator(":focus")).toHaveClass(/cx-mx-grand/);
  await page.getByRole("searchbox").focus();
  await page.evaluate(doc => api.update(doc), matrixDoc({ totals: { rows: false, columns: false } }));
  const entry = page.locator('.cx-mx-scroll [tabindex="0"]');
  await expect(entry).toHaveCount(1);
  await expect(entry).toBeVisible();
  await entry.focus();
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Row F and Col W: No data");
});

test("printing draws a table of the visible matrix", async ({ page }) => {
  await mountMatrix(page, matrixDoc());
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const table = page.locator(".cx-mx-print table");
  await expect(table.locator("caption")).toContainText("Small matrix");
  await expect(table.locator("tr")).toHaveCount(7);
  await page.emulateMedia({ media: "print" });
  await expect(table).toBeVisible();
  await expect(page.locator(".cx-mx-scroll")).toBeHidden();
});

test("the print table keeps group rows, column bands and tone cells that never rely on colour alone", async ({ page }) => {
  const doc = matrixDoc();
  doc.rows.groupBy = "site"; doc.rows.groupCount = "[one]{count} server[other]{count} servers"; doc.columns.groupBy = "tier";
  await mountMatrix(page, doc);
  await expect(page.locator(".cx-mx-heading .cx-mx-sub").first()).toHaveText("3 servers");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  const table = page.locator(".cx-mx-print table");
  await expect(table.locator("tr.cx-mx-printgroup th")).toHaveText(["North · 3 servers", "South · 3 servers"]);
  await expect(table.locator('th[scope="colgroup"]')).toHaveText(["Core · 2", "Edge · 2"]);
  const failing = table.locator("td.cx-mx-attn.cx-tone-danger", { hasText: "3" });
  await expect(failing).toHaveText("✕ 3");
  await expect(failing).toHaveAttribute("title", "Failing");
  const look = await failing.evaluate(cell => ({ background: getComputedStyle(cell).backgroundColor, adjust: getComputedStyle(cell.closest("table")).printColorAdjust }));
  expect(look.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(look.adjust).toBe("exact");
  const healthy = table.locator("td.cx-mx-printcell.cx-tone-success").first();
  expect(await healthy.evaluate(cell => getComputedStyle(cell).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect(table.locator("td.cx-mx-printnone").first()).toHaveText("·");
  // A collapsed group prints as one rolled-up row.
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Collapse North" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(table.locator("tr.cx-mx-printrolled th")).toHaveText("North · 3 servers");
});

for (const [name, change, message] of [
  ["an unknown property", { extra: 1 }, "unknown property 'extra'"],
  ["a cells string of the wrong length", { cells: ["22", "2222", "0..2", "1220", "2222", "...."] }, "one character per column"],
  ["an undeclared state", { cells: ["9222", "2222", "0..2", "1220", "2222", "...."] }, "undeclared state"],
  ["an unsafe link", { rows: { items: [{ id: "a", label: "A", href: "javascript:alert(1)" }] }, cells: ["2222"], notes: [] }, "not an http, https, mailto"],
  ["a diagonal on a matrix that is not square", { diagonal: "data" }, "only a square matrix has a diagonal"],
  ["a group count without an other form", { rows: Object.assign(matrixDoc().rows, { groupCount: "[one]{count} server" }) }, "group count needs {count}"],
  ["a group count without the count", { rows: Object.assign(matrixDoc().rows, { groupCount: "Servers" }) }, "group count needs {count}"]
]) {
  test("a document with " + name + " fails with a message", async ({ page }) => {
    await page.route("http://canopyx.test/bad", route => route.fulfill({ contentType: "text/html", body: "<!DOCTYPE html><html lang=\"en\"><head><title>x</title><script>" +
      asset("canopyx-grid.js") + "\n" + asset("canopyx-matrix.js") + "</script></head><body><div id=\"host\"></div><script>window.result=CanopyX.createMatrix(document.getElementById('host'),{view:" +
      JSON.stringify(Object.assign(matrixDoc(), change)).replace(/</g, "\\u003c") + "}).ready.then(()=>'ready',e=>e.message);</script></body></html>" }));
    await page.goto("http://canopyx.test/bad");
    expect(await page.evaluate(() => window.result)).toContain(message);
    await expect(page.locator("#host")).toHaveAttribute("data-cx-error", /not valid/);
  });
}

test("labels come from a label pack, and text stays text", async ({ page }) => {
  const doc = matrixDoc();
  doc.rows.items[0].label = "<img src=x onerror=alert(1)>";
  await mountMatrix(page, doc, { lang: "pl", script: asset("canopyx-labels-pl.js"), options: "{labels:CanopyXLocales.pl.labels}" });
  const labels = await page.evaluate(() => CanopyXLocales.pl.labels);
  await expect(page.getByRole("searchbox", { name: labels.matrixSearch })).toBeVisible();
  await expect(page.locator(".cx-mx-htotal")).toHaveText(labels.matrixTotal);
  await expect(page.locator(".cx-mx-rowhead").first()).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator(".cx-matrix img")).toHaveCount(0);
});
