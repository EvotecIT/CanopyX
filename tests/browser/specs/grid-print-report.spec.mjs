import { expect, test } from "@playwright/test";
import { examples, openGridControl, viewPage } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

test("print retains frozen query context, group subtotals and query totals with neutral complete values", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.parent.printedHtml = document.documentElement.outerHTML; }; });
  await page.goto(server.url + "office-export.html"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    await api.setQuery({ filters: [{ column: "region", operator: "eq", values: ["North"] }] });
    await api.print({ scope: "filtered" });
    const doc = new DOMParser().parseFromString(window.printedHtml, "text/html");
    return { header: doc.querySelector("header").textContent, subtotal: doc.querySelector("[data-cx-print-subtotal]")?.textContent,
      total: doc.querySelector("[data-cx-print-total]")?.textContent, rows: doc.querySelectorAll("tbody tr:not(:has(th)):not([data-cx-print-subtotal])").length,
      printStyle: doc.querySelector("style").textContent, columns: [...doc.querySelectorAll("colgroup col")].map(col => col.style.width),
      links: [...doc.querySelectorAll("tbody a")].map(a => a.style.cssText), colorSpans: doc.querySelectorAll("tbody tr[data-cx-print-record] span[style*='color']").length };
  });
  expect(result.header).toContain("Filtered results · 30 rows · Grouped by Region");
  expect(result.header).toContain("Filters: Region = North");
  expect(result.header).toContain("UTC");
  expect(result.subtotal).toContain("$ 7,072.50"); expect(result.total).toContain("Grand total"); expect(result.total).toContain("$ 7,072.50");
  expect(result.rows).toBe(30); expect(result.printStyle).toContain("@page"); expect(result.printStyle).toContain("table-header-group");
  expect(result.columns).toEqual(["", "", "1%", "144px", "1%"]);
  expect(result.links).toHaveLength(30); expect(result.links.every(css => css.includes("color: inherit") && css.includes("text-decoration: none"))).toBe(true);
  expect(result.colorSpans).toBe(0);
});

for (const layout of ['table', 'stacked']) test(`${layout} grouped print retains tabular numbers in records and totals`, async ({ page }) => {
  await page.addInitScript(() => { window.print = () => {
    const values = selector => [...document.querySelectorAll(selector)].map(element => ({
      text: element.textContent, variant: getComputedStyle(element).fontVariantNumeric
    }));
    const stacked = !!document.querySelector('.cx-print-cards');
    window.parent.printedNumbers = {
      records: values(stacked ? '.cx-print-card dl>div:nth-child(2) dd' : '[data-cx-print-record]>td:nth-child(3)'),
      subtotals: values(stacked ? '[data-cx-print-subtotal]>div:last-child' : '[data-cx-print-subtotal] td div>span:last-child'),
      totals: values(stacked ? '[data-cx-print-total]>div:last-child' : '[data-cx-print-total] td div>span:last-child')
    };
  }; });
  const view = { protocol: 'canopyx/2', type: 'grid', id: 'print-numbers', label: 'Grouped amounts', locale: 'en-US',
    source: { kind: 'inline' }, rowHeight: 28, pageSize: 10, selection: 'none', layout: { mode: layout === 'stacked' ? 'cards' : 'scroll' },
    reporting: { grouping: { column: 'region', direction: 'asc' }, aggregates: [{ id: 'total', column: 'amount', operation: 'sum', label: 'Total amount' }] },
    columns: [{ id: 'name', title: 'Name', kind: 'text', width: 200 }, { id: 'region', title: 'Region', kind: 'text', width: 120, sortable: true },
      { id: 'amount', title: 'Amount', kind: 'number', width: 150 }],
    rows: [{ id: 'ones', cells: { name: 'First', region: 'North', amount: 111111 } }, { id: 'eights', cells: { name: 'Second', region: 'North', amount: 888888 } }] };
  await page.route('http://canopyx.test/print-numbers', route => route.fulfill({ contentType: 'text/html', body: viewPage(view) }));
  await page.goto('http://canopyx.test/print-numbers');
  await page.waitForSelector('[data-cx-ready]');
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.print({ scope: 'filtered' }));
  const numbers = await page.evaluate(() => window.printedNumbers);
  expect(numbers.records).toHaveLength(2);
  expect(numbers.subtotals).toHaveLength(1);
  expect(numbers.totals).toHaveLength(1);
  expect(numbers.subtotals[0].text).toContain('999,999');
  expect(numbers.totals[0].text).toContain('999,999');
  for (const value of [...numbers.records, ...numbers.subtotals, ...numbers.totals]) {
    expect(value.text).toMatch(/\d/);
    expect(value.variant, `${layout}: ${value.text}`).toBe('tabular-nums');
  }
});

test("export menu is one vertical format list and announces the chosen scope count", async ({ page }) => {
  await page.goto(server.url + "office-export.html"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    await api.setQuery({ search: "North" }); api.setSelection(["resource-000", "resource-001"]);
  });
  await openGridControl(page, "export");
  const panel = page.locator(".cx-export-panel");
  await expect(panel.getByRole("combobox", { name: "Export: rows", exact: true })).toBeVisible();
  await expect(panel.locator(".cx-export-count")).toHaveText("30 rows");
  await expect(panel.locator(".cx-export-choice-title")).toHaveText(["Excel workbook (.xlsx)", "PDF", "CSV", "Copy to clipboard", "Print"]);
  await expect(panel.locator(".cx-export-hint")).toHaveText(["Formatted, with groups and totals", "Paged report with repeating headings", "Plain text values (.csv)"]);
  const boxes = await panel.locator(".cx-export-choice").evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, bottom: box.bottom, width: box.width };
  }));
  for (let index = 1; index < boxes.length; index++) { expect(boxes[index].x).toBe(boxes[0].x); expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].bottom); }
  await panel.getByRole("combobox").selectOption("selected"); await expect(panel.locator(".cx-export-count")).toHaveText("2 rows");
  await panel.getByRole("combobox").selectOption("all"); await expect(panel.locator(".cx-export-count")).toHaveText("60 rows");
});

test("phone warning cue stays in the resource identity line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(server.url + "office-export-dark.html"); await page.waitForSelector("[data-cx-ready]");
  const row = page.locator('.cx-row[data-cx-id="resource-006"]');
  await expect(row.locator(".cx-phone-primary > .cx-fmt-icon")).toBeVisible();
  expect(await row.locator(".cx-phone-primary").evaluate(element => {
    const icon = element.querySelector(".cx-fmt-icon").getBoundingClientRect(), box = element.getBoundingClientRect();
    return icon.top >= box.top && icon.bottom <= box.bottom;
  })).toBe(true);
  await openGridControl(page, "export");
  expect(await page.locator(".cx-export-panel").evaluate(element => parseFloat(getComputedStyle(element, "::before").flexBasis))).toBe(4);
});

test("print identifies multiple aggregates and inclusive query comparisons", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.parent.printedHtml = document.documentElement.outerHTML; }; });
  await page.goto(server.url + "office-export.html"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const host = document.querySelector("[data-canopyx-host]"), original = host.canopyx, view = structuredClone(original.view);
    view.reporting.aggregates = [
      { id: "total", column: "cost", operation: "sum", label: "Total amount" },
      { id: "average", column: "cost", operation: "average", label: "Average order" }
    ];
    original.destroy(); host.replaceChildren();
    const api = CanopyX.createDataGrid(host, { view }); await api.ready;
    await api.setQuery({ filters: [{ column: "cost", operator: "ge", values: [100] }, { column: "cost", operator: "le", values: [200] }] });
    await api.print({ scope: "filtered" });
    const doc = new DOMParser().parseFromString(window.printedHtml, "text/html");
    return { header: doc.querySelector("header").textContent,
      summaries: [...doc.querySelectorAll("[data-cx-print-subtotal], [data-cx-print-total]")].map(row => row.textContent) };
  });
  expect(result.header).toContain("Monthly cost ≥ 100"); expect(result.header).toContain("Monthly cost ≤ 200");
  expect(result.summaries.length).toBeGreaterThan(1);
  for (const summary of result.summaries) { expect(summary).toContain("Total amount: "); expect(summary).toContain("Average order: "); }
});
