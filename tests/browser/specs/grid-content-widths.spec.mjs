import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

async function open(page, { reporting, responsive = false, hidden = false, saved = false } = {}) {
  const view = { protocol: "canopyx/2", type: "grid", id: "widths", label: "Content widths", rowHeight: 28,
    pageSize: 250, selection: "single", search: false, columns: [
      { id: "name", title: "Name", kind: "text" }, { id: "code", title: "Identifier", kind: "text" },
      { id: "fixed", title: "Fixed", kind: "text", width: 123 }
    ], source: { kind: "inline" }, rows: Array.from({ length: 300 }, (_, i) => ({ id: "r" + String(i).padStart(3, "0"),
      cells: { name: "R " + i, code: "LongIdentifierForLoadedRecord_" + i, fixed: "A very long explicit-width value" } })) };
  if (reporting) view.reporting = { layout: { name: { minimum: 80, maximum: 180, flex: 1 }, code: { minimum: 200, maximum: 220 } } };
  if (responsive) { view.reporting.responsive = true; view.reporting.layout.code.maximum = 600; }
  if (saved) view.stateKey = "widths";
  await page.route("http://canopyx.test/widths", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Widths</h1>')
    .replace('<div class="cx-host"', '<div style="' + (hidden ? "display:none" : "") + '" class="cx-host"')
    .replace("</body>", `<script>window.getApi=()=>document.querySelector('[data-canopyx-host]').canopyx;
    ${saved ? `sessionStorage.setItem('cx:grid:widths:widths',JSON.stringify({current:{version:1,view:'widths',
      columns:[{id:'name',width:151,hidden:false},{id:'code',width:241,hidden:false},{id:'fixed',width:123,hidden:false}],
      query:{search:'',sort:[],filters:[]},timeZone:'utc',selection:[],scrollTop:0},views:[]}));` : ""}</script></main></body>`) }));
  await page.goto("http://canopyx.test/widths"); await page.evaluate(() => getApi().ready); await nextFrames(page);
}

test("first layout measures loaded content, respects explicit widths, and exposes bounded fit all", async ({ page }) => {
  await open(page);
  const widths = await page.evaluate(() => getApi().getState().columns.map(column => column.width));
  expect(widths[1]).toBeGreaterThan(widths[0]); expect(widths[2]).toBe(123);
  const result = await page.evaluate(() => getApi().autoFitColumns());
  expect(Object.keys(result)).toEqual(["name", "code", "fixed"]);
  expect(result.code.sampled).toBe(200); expect(result.code.scope).toBe("loaded"); expect(result.fixed.width).toBeGreaterThan(123);
  await page.locator('.cx-grid-columns > summary').click(); await page.getByRole("button", { name: "Fit all columns", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("initial fitting respects bounds and flex, and fits a hidden grid on reveal", async ({ page }) => {
  await open(page, { reporting: true, hidden: true });
  expect(await page.locator('.cx-row').count()).toBe(0);
  await page.locator('[data-canopyx-host]').evaluate(host => host.style.removeProperty("display")); await nextFrames(page);
  const columns = await page.evaluate(() => getApi().getState().columns);
  expect(columns[1].width).toBe(220); expect(columns[0].width).toBeGreaterThanOrEqual(80); expect(columns[0].width).toBeLessThanOrEqual(180);
  expect(columns[0].flex).toBe(true);
  expect((await page.locator('.cx-hcell[data-cx-column="name"]').boundingBox()).width).toBeGreaterThanOrEqual(columns[0].width);
});

test("saved widths win at creation and after fitting and reloading a named view", async ({ page }) => {
  await open(page, { saved: true });
  expect(await page.evaluate(() => getApi().getState().columns.map(column => column.width))).toEqual([151, 241, 123]);
  await page.evaluate(async () => { getApi().saveView("Reader widths"); getApi().autoFitColumns(); await getApi().applySavedView("Reader widths"); });
  expect(await page.evaluate(() => getApi().getState().columns.map(column => column.width))).toEqual([151, 241, 123]);
});

test("responsive visibility uses fitted widths on the first compact render", async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 720 }); await open(page, { reporting: true, responsive: true });
  expect(await page.locator('.cx-hcell').evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn))).toEqual(["name"]);
});
