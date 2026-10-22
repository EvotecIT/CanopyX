import { test, expect } from "@playwright/test";
import { pinTestFont } from "./visual-font.mjs";
import { nextFrames } from "./support.mjs";
import { reportLayoutView, mountReportLayout, layoutGeometry } from "./report-grid-layout-support.mjs";

test.beforeEach(async ({ page }) => pinTestFont(page));
for (const theme of ["light", "dark"]) {
  test(`themed short pills fit their computed font and inline chrome in ${theme}`, async ({ page }) => {
    const view = reportLayoutView(); view.reporting.columnReorder = false;
    view.columns = [{ id: "name", title: "Record", kind: "text", rowHeader: true },
      { id: "state", title: "Up", kind: "text", presenter: { kind: "enum" } },
      { id: "review", title: "Down", kind: "text", presenter: { kind: "enum" } }];
    view.rows = view.rows.map(row => ({ id: row.id, cells: { name: row.cells.name,
      state: { value: "Up", tone: "warning" }, review: { value: "Down", tone: "danger" } } }));
    await mountReportLayout(page, { view, theme, width: 780 });
    await page.addStyleTag({ content: `.review-style .p-pill {font-size:11px;font-weight:500;letter-spacing:1px;padding-inline:16px;border:1px solid currentColor}` });
    await page.evaluate(async () => {
      document.querySelector('[data-canopyx-host]').classList.add("review-style"); api().autoSizeColumns(); await api().ready;
    });
    await nextFrames(page);
    expect((await layoutGeometry(page)).clippedPills).toBe(0);
    const need = await page.evaluate(() => api().autoFitColumn("review").width);
    const pill = await page.locator(".p-pill.danger").first().evaluate(node => node.getBoundingClientRect().width);
    expect(need).toBeGreaterThanOrEqual(pill + 24);
  });

  test(`body overlays receive only the configured host styling classes in ${theme}`, async ({ page }) => {
    await mountReportLayout(page, { theme });
    await page.addStyleTag({ content: `.review-style .p-pill {padding-inline:17px;font-size:11px}` });
    await page.evaluate(async () => {
      const host = document.querySelector('[data-canopyx-host]');
      const view = JSON.parse(host.querySelector('.cx-config').textContent);
      api().destroy(); host.replaceChildren(); host.classList.add("review-style");
      host.canopyx = CanopyX.createDataGrid(host, { view, overlayClass: "review-style report-style" });
      window.overlayView = view;
      await api().ready; await api().openDetails("a");
    });
    const drawer = page.locator("dialog.cx-drawer");
    await expect(drawer).toHaveClass(/review-style report-style/);
    expect(await drawer.locator(".p-pill").first().evaluate(node => getComputedStyle(node).paddingLeft)).toBe("17px");
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator('[data-cx-column-menu="state"]').click();
    await expect(page.locator(".cx-grid-overlay.cx-pop")).toHaveClass(/review-style report-style/);
    await page.keyboard.press("Escape");
    await expect(page.locator(".cx-grid-overlay.cx-pop")).toHaveCount(0);
    await page.evaluate(async () => {
      const host = document.querySelector('[data-canopyx-host]'); api().destroy(); host.replaceChildren();
      host.canopyx = CanopyX.createDataGrid(host, { view: window.overlayView, overlayClass: "other-host" });
      await api().ready; await api().openDetails("a");
    });
    await expect(drawer).toHaveClass(/other-host/);
    await expect(drawer).not.toHaveClass(/review-style/);
  });
}
