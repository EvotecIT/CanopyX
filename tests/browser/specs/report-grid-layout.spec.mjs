import { pinTestFont } from "./visual-font.mjs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { nextFrames } from "./support.mjs";
import { reportLayoutView, mountReportLayout, layoutGeometry } from "./report-grid-layout-support.mjs";

// Stable glyph metrics keep width and projection contracts independent of installed platform fonts.
test.beforeEach(async ({ page }) => { await pinTestFont(page); });

// Headless Chromium otherwise adds --hide-scrollbars, which would leave the classic-gutter contract unexercised.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function settled(page) { await nextFrames(page); await nextFrames(page); }
async function rowsFit(page) {
  await expect.poll(async () => {
    const box = await layoutGeometry(page);
    return box.rows === 3 && box.scrollHeight <= box.clientHeight && box.bottom <= box.visibleBottom + 0.5;
  }).toBe(true);
}

test("auto height recovers when controls grow beyond the previous fitted host", async ({ page }) => {
  await mountReportLayout(page);
  await rowsFit(page);
  const before = await page.locator(".cx-host").evaluate(host => host.getBoundingClientRect().height);
  await page.locator(".cx-toolbar").evaluate(toolbar => {
    const controls = document.createElement("div");
    controls.style.cssText = "flex:0 0 100%;height:220px";
    controls.textContent = "Report controls added after mount";
    toolbar.appendChild(controls);
  });
  await rowsFit(page);
  expect(await page.locator(".cx-host").evaluate(host => host.getBoundingClientRect().height)).toBeGreaterThan(before + 200);
});

for (const theme of ["light", "dark"]) test(`report shortage preserves header minima and atomic status content in ${theme}`, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await mountReportLayout(page, { theme, width: 1320 });
  const box = await layoutGeometry(page);
  expect(box.clippedPills).toBe(0);
  const headers = await page.locator(".cx-hcell > :is(.cx-sort,.cx-htext)").evaluateAll(labels => labels.map(label => ({
    title: label.title, text: label.textContent, clipped: label.scrollWidth > label.clientWidth + 1
  })));
  expect(headers.every(label => label.title === label.text)).toBe(true);
  expect(headers.some(label => label.clipped)).toBe(false);
  await rowsFit(page);
  await page.getByRole("button", { name: "Record", exact: true }).click(); await settled(page);
  await expect(page.locator('.cx-hcell[data-cx-column="name"]')).toHaveAttribute("aria-sort", "ascending");
  const grip = page.getByRole("separator", { name: "Resize Responsible team", exact: true });
  const beforeResize = (await layoutGeometry(page)).widths.group;
  await grip.focus(); await page.keyboard.press("ArrowRight"); await settled(page);
  const readerWidth = (await layoutGeometry(page)).widths.group;
  expect(readerWidth).toBe(beforeResize + 10);
  await page.locator("#frame").evaluate(frame => frame.style.width = "760px"); await settled(page);
  const narrow = await layoutGeometry(page);
  expect(narrow.widths.group).toBe(readerWidth);
  expect(narrow.scrollWidth).toBeGreaterThan(narrow.clientWidth); expect(narrow.clippedPills).toBe(0);
  await rowsFit(page); expect(errors).toEqual([]);
});

for (const classic of [false, true]) test(`three wide rows fit after hidden mount and resize with ${classic ? "classic" : "overlay"} scrollbars`, async ({ page }) => {
  const view = reportLayoutView();
  // 1196 px of explicit safe widths inside a 1086 px frame must scroll horizontally.
  [240, 260, 220, 240, 236].forEach((width, i) => { view.columns[i].minWidth = width; view.columns[i].maxWidth = width; });
  await mountReportLayout(page, { view, hidden: true, classic });
  // At phone width the two-line identity and context need more block space than the original one-line fixture.
  await page.locator(".cx-host").evaluate(host => host.style.height = "800px");
  await page.locator("#frame").evaluate(frame => frame.style.display = "");
  await page.evaluate(() => api().ready); await rowsFit(page);
  const wide = await layoutGeometry(page);
  expect(wide.scrollWidth).toBe(1196); expect(wide.scrollWidth).toBeGreaterThan(wide.clientWidth);
  expect(wide.clippedPills).toBe(0);
  if (classic && test.info().project.name === "chromium") expect(wide.scrollbar).toBeGreaterThan(0);
  await page.locator(".cx-grid").evaluate(grid => grid.scrollLeft = grid.scrollWidth); await settled(page); await rowsFit(page);
  // Wrapped chrome changes the available block space, independently of the row count.
  await page.locator("#frame").evaluate(frame => frame.style.width = "480px"); await settled(page); await rowsFit(page);
  await page.locator("#frame").evaluate(frame => { frame.parentElement.style.maxWidth = "none"; frame.style.width = "1300px"; }); await settled(page); await rowsFit(page);
  const roomy = await layoutGeometry(page);
  expect(roomy.scrollWidth).toBeLessThanOrEqual(roomy.clientWidth + 1); expect(roomy.scrollbar).toBe(0);
  expect(roomy.clientHeight).toBe(wide.clientHeight);
});

test("atomic pills wider than the ordinary text cap remain readable and explicit sizing stays bounded", async ({ page }) => {
  const view = reportLayoutView();
  view.rows[0].cells.state.value = "Needs confirmation from the regional operations and service delivery review team";
  view.columns[0].fixed = true; view.columns[0].width = 240;
  view.columns[1].minWidth = 260; view.columns[1].maxWidth = 280;
  await mountReportLayout(page, { view });
  const initial = await layoutGeometry(page);
  expect(initial.widths.state).toBeGreaterThan(420); expect(initial.clippedPills).toBe(0); expect(initial.widths.name).toBe(240);
  await page.evaluate(() => api().setColumnWidth("group", 600)); await settled(page);
  expect((await layoutGeometry(page)).widths.group).toBe(280);
  await page.evaluate(() => api().setColumnWidth("group", 40)); await settled(page);
  expect((await layoutGeometry(page)).widths.group).toBe(260);
  await page.locator("#frame").evaluate(frame => { frame.style.width = "360px"; frame.querySelector(".cx-host").style.height = "1000px"; }); await settled(page);
  expect((await layoutGeometry(page)).clippedPills).toBe(0); await rowsFit(page);
});

test("automatic text content keeps its measured width after header-only slack is exhausted", async ({ page }) => {
  const view = reportLayoutView();
  delete view.columns[1].width; view.reporting.columnReorder = false;
  view.rows[0].cells.group = "Operations review awaiting confirmation";
  view.columns.push({ id: "stage", title: "Reminder stage", kind: "text" });
  view.rows.forEach(row => row.cells.stage = "—");
  await mountReportLayout(page, { view, width: 760 });
  const box = await layoutGeometry(page);
  expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
  expect(box.widths.stage).toBeLessThan(144);
  const text = page.locator('.cx-row[data-cx-id="a"] [aria-colindex="2"] .cx-text');
  expect(await text.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(box.clippedPills).toBe(0); await rowsFit(page);
});

test("auto-height follows horizontal overflow introduced by a user width without a row-count change", async ({ page }) => {
  await mountReportLayout(page, { classic: true, width: 1320 });
  await page.locator("#frame").evaluate(frame => frame.parentElement.style.maxWidth = "none");
  await settled(page); await rowsFit(page);
  await page.evaluate(() => api().setColumnWidth("group", 1000)); await settled(page); await rowsFit(page);
  const overflowing = await layoutGeometry(page);
  expect(overflowing.scrollWidth).toBeGreaterThan(overflowing.clientWidth);
  await page.evaluate(() => api().resetColumns()); await settled(page); await rowsFit(page);
  const reset = await layoutGeometry(page);
  expect(reset.scrollWidth).toBeLessThanOrEqual(reset.clientWidth + 1); expect(reset.clippedPills).toBe(0);
});

test("header-only slack preserves usable sort and menu targets in a phone-width grid", async ({ page }) => {
  const view = reportLayoutView();
  view.columns.push({ id: "stage", title: "Reminder stage", kind: "text", sortable: true, priority: "essential", alwaysVisible: true });
  view.rows.forEach(row => row.cells.stage = "—");
  await mountReportLayout(page, { view, width: 320 });
  const sort = page.getByRole("button", { name: "Reminder stage", exact: true });
  await sort.scrollIntoViewIfNeeded();
  const bounds = await sort.boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(24); expect(bounds.height).toBeGreaterThanOrEqual(24);
  const result = await new AxeBuilder({ page }).include(".cx-grid").withRules(["target-size"]).analyze();
  expect(result.violations.map(violation => violation.id)).toEqual([]);
  await sort.click();
  await expect(page.locator('.cx-hcell[data-cx-column="stage"]')).toHaveAttribute("aria-sort", "ascending");
});
