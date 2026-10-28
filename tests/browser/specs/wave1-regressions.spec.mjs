import { test, expect } from "@playwright/test";
import { serveGrid, assetView } from "./editing-support.mjs";
import { open as openGroups, definition } from "./grid-grouping-fixtures.mjs";
import { call, settle } from "./view-modes-support.mjs";

test("phone search counts hidden fields and opens their matching record", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serveGrid(page, { view: assetView({ searchHighlight: true }) });
  await call(page, "setQuery", { search: "Ada" }); await settle(page);
  await expect(page.locator(".cx-matches-count")).toHaveText("8 matches");
  await page.getByRole("button", { name: "Next match" }).click();
  await expect(page.locator("dialog.cx-drawer")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Edit Owner", exact: true })).toHaveValue("Ada Park");
});

test("editing and undo refresh conditional styles and automatic data bars", async ({ page }) => {
  const view = assetView({ formatRules: [
    { id: "cost", column: "cost", style: { bar: {} } },
    { id: "repair", target: "row", when: { operator: "and", filters: [{ column: "status", operator: "eq", values: ["Repair"] }] }, style: { tone: "danger" } }
  ] });
  await serveGrid(page, { view });
  const row = page.locator('.cx-row[data-cx-id="a0"]');
  await expect(row).not.toHaveClass(/cx-fmt-row/);
  await call(page, "setCellValue", "a0", "status", "Repair");
  await expect(row).toHaveClass(/cx-fmt-row/);
  await call(page, "undo");
  await expect(row).not.toHaveClass(/cx-fmt-row/);
  const before = await row.locator(".cx-fmt-bar").evaluate(element => element.style.cssText);
  await call(page, "setCellValue", "a0", "cost", 10000);
  await expect.poll(() => row.locator(".cx-fmt-bar").evaluate(element => element.style.cssText)).not.toBe(before);
});

test("hosted query changes refresh automatic bounds at the same revision", async ({ page }) => {
  const view = assetView({ source: { kind: "host" }, query: {}, columns: [{ id: "cost", title: "Cost", kind: "number", sortable: true }],
    formatRules: [{ id: "cost", column: "cost", style: { bar: {} } }] });
  delete view.rows;
  await serveGrid(page, { view, script: `CanopyX.configure("assets", { source: { query(q) {
    const values = q.search ? [100, 200] : [10, 100], rows = values.map((cost, i) => ({ id: "r" + i, cells: { cost } }));
    return { protocol: "canopyx/2", type: "gridPage", view: "assets", revision: "same", offset: 0, total: 2, matched: 2, items: rows };
  } } });` });
  const bar = page.locator('.cx-row[data-cx-id="r0"] .cx-fmt-bar');
  const before = await bar.evaluate(element => element.style.cssText);
  await call(page, "setQuery", { search: "different" });
  await expect.poll(() => bar.evaluate(element => element.style.cssText)).not.toBe(before);
  expect(await bar.evaluate(element => parseFloat(element.style.getPropertyValue("--cx-bar-width")) || element.style.cssText)).toBeTruthy();
});

test("mixed sort keys keep numeric ranks first in both directions", async ({ page }) => {
  const view = assetView({ rows: [
    { id: "numeric-low", cells: { name: { value: "Low", sort: 1 } } },
    { id: "text", cells: { name: { value: "Text", sort: "z" } } },
    { id: "numeric-high", cells: { name: { value: "High", sort: 10 } } }
  ], columns: [{ id: "name", title: "Name", kind: "text", sortable: true }], query: {} });
  await serveGrid(page, { view });
  await call(page, "setQuery", { sort: [{ column: "name", direction: "desc" }] });
  await expect.poll(() => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId))).toEqual(["numeric-high", "numeric-low", "text"]);
});

test("unsafe pattern rules are rejected before evaluating cells", async ({ page }) => {
  await serveGrid(page, { view: assetView({ formatRules: [{ id: "base", column: "name", style: { tone: "info" } }] }) });
  for (const pattern of ["(a+)+$", "^(a|aa)+$", "^a+a+$", "a+$", "^(a+)\\1$", "a{10000000}", "^[\\B]+$", "^[\\q]+$", "\\-"]) {
    const error = await page.evaluate(async pattern => {
      const api = document.querySelector("[data-canopyx-host]").canopyx;
      return api.setFormatRules([{ id: "unsafe", column: "name", when: { operator: "and", filters: [{ column: "name", operator: "matches", values: [pattern] }] }, style: { tone: "danger" } }]).then(() => null, error => error.message);
    }, pattern);
    expect(error).toMatch(/pattern/i);
  }
  expect((await call(page, "getFormatRules"))[0].id).toBe("base");
});

test("phone group totals open a readable detail dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGroups(page, definition());
  const totals = page.locator(".cx-grid-group .cx-hidden-aggregates").first();
  await totals.click();
  await expect(page.locator("dialog.cx-reporting-text")).toBeVisible();
  await expect(page.locator("dialog.cx-reporting-text h4")).toContainText("Region:");
  await expect(page.locator("dialog.cx-reporting-text pre")).toHaveText("Order\nOrders · Count: 12\nAmount\nTotal amount · Sum: 6,568.00 · Average amount · Avg: 547.33");
});

test("tree columns accept explicit unpinned null from the schema", async ({ page }) => {
  await serveGrid(page, { view: assetView() });
  const result = await page.evaluate(async () => {
    const host = document.createElement("div"), errors = []; document.body.appendChild(host);
    const api = CanopyX.createTreeGrid(host, { view: { protocol: "canopyx/2", type: "view", id: "unpinned", label: "Unpinned",
      pageSize: 20, selection: "none", source: { kind: "inline" }, columns: [{ id: "name", title: "Name" }, { id: "status", title: "Status", pinned: null }],
      roots: [{ id: "one", label: "One", cells: { status: "Ready" } }] }, onError: event => errors.push(event.error.message) });
    await api.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = { errors, rows: api.visibleRows().length, text: host.textContent };
    api.destroy(); host.remove(); return result;
  });
  expect(result.errors).toEqual([]); expect(result.rows).toBe(1); expect(result.text).toContain("Ready");
});
