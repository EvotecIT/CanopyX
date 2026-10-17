import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, definition, open, orders } from "./grid-grouping-fixtures.mjs";

// The detail-only fixture: no grouping, so the detail rows part loads alone.
const flat = (extra = {}) => { const view = definition(extra); view.reporting = { detail: view.reporting.detail, selectionControls: true, ...(extra.reporting || {}) }; return view; };
const record = (page, id) => page.locator(`.cx-row[data-cx-id="${id}"]`);
const detailOf = (page, id) => page.locator(`.cx-detail-row[data-cx-detail="${id}"]`);

test("an expander loads a nested grid once, sized to its content inside the visible width", async ({ page }) => {
  await open(page, flat());
  const toggle = record(page, "o000").locator(".cx-detail-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false"); await expect(toggle).toHaveAttribute("aria-label", "Show details");
  await toggle.click();
  const detail = detailOf(page, "o000");
  await expect(detail.locator(".cx-detail-view [role='grid']")).toBeVisible();
  await expect(detail).toHaveAttribute("role", "row");
  await expect(detail.locator(":scope > [role='gridcell']")).toHaveAttribute("aria-colspan", "7");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).not.toHaveAttribute("aria-controls", /./);
  await expect(detail.locator(".cx-detail-view .cx-row[data-cx-id]")).toHaveCount(orders()[0].detail.rows.length);
  const layout = await page.evaluate(() => {
    const grid = document.querySelector(".cx-grid"), detail = document.querySelector(".cx-detail-row"), body = detail.querySelector(".cx-detail-body");
    const next = document.querySelector('.cx-row[data-cx-id="o001"]');
    return { body: body.getBoundingClientRect().width, view: grid.clientWidth, height: detail.offsetHeight,
      gap: next.getBoundingClientRect().top - detail.getBoundingClientRect().bottom };
  });
  expect(layout.body).toBeLessThanOrEqual(layout.view); expect(layout.body).toBeGreaterThan(layout.view - 40);
  expect(layout.height).toBeGreaterThan(80); expect(Math.abs(layout.gap)).toBeLessThan(2);
  expect(await page.evaluate(api + ".getExpandedDetails()")).toEqual(["o000"]);
  await toggle.click(); await expect(detail).toHaveCount(0);
});

test("detail rows stay inside the visible width when the columns scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const view = flat(); view.columns.forEach(column => { column.width = 260; column.fixed = true; });
  await open(page, view);
  await page.evaluate(api + ".expandDetail('o000')");
  await page.locator(".cx-grid").first().evaluate(grid => { grid.scrollLeft = 600; });
  await page.waitForTimeout(100);
  const box = await page.evaluate(() => {
    const grid = document.querySelector(".cx-grid").getBoundingClientRect(), body = document.querySelector(".cx-detail-row .cx-detail-body").getBoundingClientRect();
    return { left: body.left - grid.left, right: grid.right - body.right };
  });
  expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeGreaterThanOrEqual(0);
});

test("keyboard: the expander takes Enter and Space, focus moves into the detail and back", async ({ page }) => {
  await open(page, flat());
  await record(page, "o000").focus();
  await page.keyboard.press("F2");
  await expect(page.locator(":focus")).toHaveClass(/cx-detail-toggle/);
  await page.keyboard.press("Enter");
  await expect(detailOf(page, "o000").locator(".cx-detail-view .cx-row[data-cx-id]").first()).toBeVisible();
  await page.keyboard.press("Escape"); await expect(record(page, "o000")).toBeFocused();
  await page.keyboard.press("ArrowDown"); await expect(detailOf(page, "o000")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate("!!document.activeElement.closest('.cx-detail-view')")).toBe(true);
  // Space inside the nested grid never selects the outer record.
  await page.keyboard.press("Space");
  expect(await page.evaluate(api + ".getSelection()")).toEqual([]);
  await page.keyboard.press("Escape"); await expect(detailOf(page, "o000")).toBeFocused();
  await page.keyboard.press("Escape"); await expect(record(page, "o000")).toBeFocused();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await expect(record(page, "o001")).toBeFocused();
  await page.keyboard.press("ArrowUp"); await expect(detailOf(page, "o000")).toBeFocused();
  await page.keyboard.press("F2"); await page.keyboard.press("Tab");
  expect(await page.evaluate(api + ".getSelection()")).toEqual([]);
});

test("content loads lazily once, survives scrolling and repainting, and is disposed on collapse", async ({ page }) => {
  const setup = `window.renders = []; window.disposed = 0; CanopyX.configure('orders', { detail: {
    render(row, element, context) { renders.push(row.id); const text = document.createElement('p'); text.textContent = 'Lines of ' + row.cells.order;
      element.appendChild(text); context.onDispose(() => disposed++); } } });`;
  await open(page, flat({ reporting: {} }), setup);
  expect(await page.evaluate("renders")).toEqual([]);
  await page.evaluate(api + ".expandDetail('o000')");
  await expect(detailOf(page, "o000")).toContainText("Lines of SO-1000");
  const body = await detailOf(page, "o000").locator(".cx-detail-body").elementHandle();
  await page.locator(".cx-grid").first().evaluate(grid => { grid.scrollTop = grid.scrollHeight; }); await page.waitForTimeout(150);
  await expect(detailOf(page, "o000")).toHaveCount(0);
  await page.locator(".cx-grid").first().evaluate(grid => { grid.scrollTop = 0; }); await page.evaluate(api + ".refresh()"); await page.waitForTimeout(150);
  expect(await body.evaluate(element => element.isConnected)).toBe(true);
  expect(await page.evaluate("renders")).toEqual(["o000"]);
  await page.evaluate(api + ".collapseDetail('o000')"); expect(await page.evaluate("disposed")).toBe(1);
  await page.evaluate(api + ".expandDetail('o000')"); expect(await page.evaluate("renders")).toEqual(["o000", "o000"]);
  // A new query keeps an expanded record it still contains, at its new position.
  await page.evaluate(api + ".setQuery({ sort: [{ column: 'amount', direction: 'desc' }] })");
  expect(await page.evaluate(api + ".getExpandedDetails()")).toEqual(["o000"]);
  await page.evaluate(api + ".setQuery({ search: 'SO-1001' })");
  expect(await page.evaluate(api + ".getExpandedDetails()")).toEqual([]);
});

test("trusted HTML, page templates and record payloads fill details; failures show a retry", async ({ page }) => {
  const view = flat({ reporting: { detail: { template: "order-detail" } } });
  view.rows[0].cells.customer = "<b>Not markup</b>";
  const setup = `document.addEventListener('DOMContentLoaded', () => { const template = document.createElement('template'); template.id = 'order-detail';
    template.innerHTML = '<dl><dt>Customer</dt><dd data-cx-field="customer"></dd></dl>'; document.body.appendChild(template); });`;
  await open(page, view, setup);
  await page.evaluate(api + ".expandDetail('o000')");
  await expect(detailOf(page, "o000").locator("dd")).toHaveText("<b>Not markup</b>");
  const payload = flat({ reporting: { detail: {} } }); payload.rows[0].detail = { type: "properties", items: [{ name: "Owner", value: { value: "Ops", tone: "info" } }] };
  payload.rows[1].detail = { type: "table", columns: ["A"], rows: [["x"]] }; delete payload.rows[2].detail;
  await open(page, payload);
  await expect(record(page, "o002").locator(".cx-detail-toggle")).toHaveCount(0); await expect(record(page, "o001").locator(".cx-detail-toggle")).toHaveCount(1);
  await page.evaluate(api + ".expandDetail('o000')"); await expect(detailOf(page, "o000").locator(".cx-props dt")).toHaveText("Owner");
  const html = `window.attempts = 0; CanopyX.configure('orders', { detail: { html(row) { if (++attempts === 1) throw new Error('offline'); return '<em>' + row.id + '</em>'; } } });`;
  await open(page, flat({ reporting: {} }), html);
  await page.evaluate(api + ".expandDetail('o001').catch(() => {})");
  await expect(detailOf(page, "o001")).toContainText("Details could not load: offline");
  await detailOf(page, "o001").getByRole("button", { name: "Retry" }).click();
  await expect(detailOf(page, "o001").locator("em")).toHaveText("o001");
});

test("after a retried load, keys and clicks inside a nested grid still stay out of the outer grid", async ({ page }) => {
  const setup = `window.attempts = 0; CanopyX.configure('orders', { detail: { grid(row) {
    if (++attempts === 1) throw new Error('offline');
    return { view: { protocol: 'canopyx/2', type: 'grid', id: 'lines', label: 'Lines', source: { kind: 'inline' }, pageSize: 50, selection: 'multiple', search: false,
      columns: [{ id: 'product', title: 'Product', kind: 'text' }], rows: row.detail.rows.map(line => ({ id: line.id, cells: { product: line.cells.product } })) } }; } } });`;
  await open(page, flat({ reporting: { selectionControls: true } }), setup);
  await page.evaluate(api + ".expandDetail('o000').catch(() => {})");
  await detailOf(page, "o000").getByRole("button", { name: "Retry" }).click();
  const nested = detailOf(page, "o000").locator(".cx-detail-view .cx-row[data-cx-id]").first();
  await nested.focus(); await page.keyboard.press("Space"); await page.keyboard.press("ArrowDown"); await nested.click();
  expect(await page.evaluate(api + ".getSelection()")).toEqual([]);
  await page.keyboard.press("Escape"); await expect(detailOf(page, "o000")).toBeFocused();
});
test("exports and print snapshots carry details under their records unless excluded", async ({ page }) => {
  const setup = `window.printed = null; CanopyX.configure('orders', { onPrint({ snapshot }) { printed = snapshot; } });`;
  await open(page, flat(), setup);
  const rows = await page.evaluate(`(async () => { const rows = []; for await (const row of ${api}.prepareExport({ scope: 'filtered' }).rows()) rows.push(row); return rows; })()`);
  expect(rows[0].detail.type).toBe("table");
  expect(rows[0].detail.columns).toEqual(["Product", "Quantity", "Price", "Total"]);
  expect(rows[0].detail.rows).toHaveLength(orders()[0].detail.rows.length);
  expect(await page.evaluate(api + ".prepareExport({ scope: 'filtered' }).request.details")).toBe(true);
  expect(await page.evaluate(api + ".prepareExport({ scope: 'filtered', includeDetails: false }).request.details")).toBeUndefined();
  await page.evaluate(api + ".print({ scope: 'filtered', maxRows: 100 })");
  expect(await page.evaluate("printed.rows[3].detail.rows.length")).toBe(orders()[3].detail.rows.length);
  const excluded = flat(); excluded.reporting.detail.print = false;
  await open(page, excluded);
  expect(await page.evaluate(api + ".prepareExport({ scope: 'filtered' }).request.details")).toBeUndefined();
  const csv = await page.evaluate(api + ".toCsv({ scope: 'filtered' })");
  expect(csv.split("\r\n")).toHaveLength(50);
});

for (const theme of ["light", "dark"]) for (const width of [1440, 390])
test(`detail rows read well at ${width} in ${theme}: inline on phones, with no accessibility violations`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await open(page, flat(), "", theme);
  await record(page, "o000").locator(".cx-detail-toggle").click();
  await expect(detailOf(page, "o000").locator(".cx-detail-view .cx-row[data-cx-id]").first()).toBeVisible();
  // On phones the detail stays an inline section under its record; the record drawer is not opened.
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include("[data-canopyx-host]").analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`detail-${theme}-${width}.png`) });
});
