import { test, expect } from "@playwright/test";
import { nextFrames } from "./support.mjs";
import { reportLayoutView, mountReportLayout, layoutGeometry } from "./report-grid-layout-support.mjs";

const headers = page => page.locator(".cx-hcell :is(.cx-sort,.cx-htext)").evaluateAll(nodes => nodes.map(node => ({
  text: node.textContent, title: node.title, clipped: node.scrollWidth > node.clientWidth + 1
})));
async function resize(page, width) {
  await page.locator("#frame").evaluate(frame => frame.parentElement.style.maxWidth = "none");
  await page.locator("#frame").evaluate((frame, value) => frame.style.width = value + "px", width);
  await nextFrames(page); await nextFrames(page);
}

for (const theme of ["light", "dark"]) {
  test(`phone header priority precedes an essential peer's preferred whitespace in ${theme}`, async ({ page }) => {
    const view = reportLayoutView(); view.reporting.columnReorder = false;
    view.columns = [{ id: "name", title: "Record", kind: "text", rowHeader: true },
      { id: "state", title: "Signal", kind: "text", priority: 1, width: 500 }];
    view.rows = view.rows.map(row => ({ id: row.id, cells: { name: row.cells.name, state: row.cells.state } }));
    await mountReportLayout(page, { theme, view, width: 600, viewport: { width: 640, height: 800 } });
    expect((await headers(page)).filter(header => header.clipped)).toEqual([]);
    const box = await layoutGeometry(page);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    expect(box.widths.state).toBeLessThan(500);
  });

  test(`phone header restoration includes disclosure space within an authored maximum in ${theme}`, async ({ page }) => {
    const view = reportLayoutView(); view.reporting.columnReorder = false;
    view.columns = [{ id: "name", title: "Record", kind: "text", rowHeader: true, width: 80, maxWidth: 100 },
      { id: "group", title: "Owner", kind: "text", priority: "optional", minWidth: 600 }];
    view.rows = view.rows.map(row => ({ id: row.id, cells: { name: row.cells.name, group: row.cells.group } }));
    await mountReportLayout(page, { theme, view, width: 342, viewport: { width: 390, height: 844 } });
    await expect(page.locator('.cx-hidden-fields').first()).toHaveText("+1 column");
    expect((await layoutGeometry(page)).widths.name).toBeLessThanOrEqual(100);
  });

  test(`phone record line retains header minimums and the full essential value tooltip in ${theme}`, async ({ page }) => {
    const view = reportLayoutView(); view.reporting.columnReorder = false;
    view.columns = [{ id: "name", title: "Record", kind: "text", rowHeader: true },
      { id: "state", title: "Signal", kind: "text", priority: 1 }];
    view.rows = view.rows.map(row => ({ id: row.id, cells: { name: row.cells.name, state: "X".repeat(40) } }));
    await mountReportLayout(page, { theme, view, width: 342, viewport: { width: 390, height: 844 } });
    expect((await headers(page)).filter(header => header.clipped)).toEqual([]);
    const box = await layoutGeometry(page);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    await expect(page.locator('.cx-row[data-cx-id="a"] .cx-phone-value')).toHaveAttribute("title", "X".repeat(40));
  });

  test(`report headers precede preferred whitespace and retain their minimum during overflow in ${theme}`, async ({ page }) => {
    const view = reportLayoutView();
    await mountReportLayout(page, { theme, view, width: 1086 });
    expect((await headers(page)).filter(header => header.clipped)).toEqual([]);
    expect((await layoutGeometry(page)).clippedPills).toBe(0);
    await resize(page, 1600);
    const roomy = await layoutGeometry(page);
    expect(roomy.widths.name).toBeGreaterThanOrEqual(240);
    expect(roomy.widths.group).toBeGreaterThanOrEqual(260);
    await page.evaluate(() => api().setColumnWidth("group", 600));
    await resize(page, 1086);
    const overflow = await layoutGeometry(page);
    expect(overflow.widths.group).toBe(600);
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
    expect((await headers(page)).filter(header => header.clipped)).toEqual([]);
    expect(overflow.clippedPills).toBe(0);
  });

  test(`headers that cannot collectively fit retain full names and tooltips in ${theme}`, async ({ page }) => {
    await mountReportLayout(page, { theme, width: 760 });
    const labels = await headers(page);
    expect(labels.some(header => header.clipped)).toBe(true);
    for (const label of labels) {
      expect(label.title).toBe(label.text);
      await expect(page.getByRole("columnheader", { name: label.text, exact: false })).toHaveCount(1);
    }
    expect((await layoutGeometry(page)).clippedPills).toBe(0);
  });
}
