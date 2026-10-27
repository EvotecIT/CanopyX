import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { nextFrames } from "./support.mjs";
import { api, definition, open, orders } from "./grid-grouping-fixtures.mjs";

const headings = page => page.locator(".cx-grid-group");
const pluginSetup = `CanopyX.use({ name: "median-aggregate", aggregates: { median: { label: "med {value}", compute(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return !sorted.length ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; } } } });`;

test("two levels nest complete groups, label their aggregates and make the grid a treegrid", async ({ page }) => {
  await open(page);
  const summary = await page.evaluate(api + ".getSummary()");
  expect(summary.groups.map(group => group.value)).toEqual(["East", "North", "South", "West"]);
  const east = summary.groups[0];
  expect(east.groups.map(group => [group.value, group.offset, group.count])).toEqual([["Closed", 0, 4], ["Open", 4, 4], ["Shipped", 8, 4]]);
  expect(new Set(summary.groups.flatMap(group => [group.key, ...group.groups.map(inner => inner.key)])).size).toBe(16);
  const rows = orders().filter(row => row.cells.region === "East");
  expect(east.aggregates.total).toBe(rows.reduce((sum, row) => sum + row.cells.amount, 0));
  await expect(page.locator(".cx-grid")).toHaveAttribute("role", "treegrid");
  const first = headings(page).first();
  await expect(first).toHaveAttribute("aria-level", "1"); await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(headings(page).nth(1)).toHaveAttribute("aria-level", "2");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("aria-level", "3");
  const amount = first.locator('[role="gridcell"]').last();
  await expect(amount).toHaveText(/^sum [\d,.]+ · avg [\d,.]+$/);
  await expect(amount).toHaveAttribute("title", /^Total amount · Sum: [\d,.]+ · Average amount · Avg: [\d,.]+$/);
  await expect(page.locator(".cx-summary-row [role='gridcell']").first()).toHaveText(/^count 48/);
  await expect(page.locator(".cx-gchip")).toHaveCount(2);
  const order = await page.locator(".cx-canvas > .cx-row").evaluateAll(list => list.map(row => Number(row.getAttribute("aria-rowindex"))));
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("readers regroup from the API, the column menu and the chips; levels travel in queries and saved views", async ({ page }) => {
  await open(page, definition({ stateKey: "orders-levels" }));
  await page.evaluate(api + ".setGroupBy([{ column: 'status', direction: 'desc' }])");
  expect((await page.evaluate(api + ".getQuery()")).groupBy).toEqual([{ column: "status", direction: "desc" }]);
  expect((await page.evaluate(api + ".getSummary()")).groups.map(group => group.value)).toEqual(["Shipped", "Open", "Closed"]);
  await expect(page.locator(".cx-grid")).toHaveAttribute("role", "grid");
  await page.locator('[data-cx-column-menu="region"]').click();
  const groupAction = page.getByRole("menuitem", { name: "Group by this column" });
  await expect(groupAction).toBeVisible(); await page.keyboard.press("End");
  await expect(groupAction).toBeFocused(); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(["status", "region"]);
  // Sorting a grouped column turns its groups around; the chip's direction button does the same.
  await page.locator('.cx-gchip[data-cx-level="2"] .cx-gchip-direction').click();
  await expect.poll(() => page.evaluate(api + ".getGroupBy()[1].direction")).toBe("desc");
  await page.evaluate(api + ".saveView('By status')");
  await expect(page.locator('.cx-gchip[data-cx-level="1"] .cx-gchip-order option')).toHaveText(["by value", "by Total amount", "by Average amount", "by Orders"]);
  await page.locator('.cx-gchip[data-cx-level="1"] .cx-gchip-order').selectOption("total");
  await expect.poll(() => page.evaluate(api + ".getGroupBy()[0].aggregate")).toBe("total");
  const byTotal = (await page.evaluate(api + ".getSummary()")).groups.map(group => group.aggregates.total);
  expect(byTotal).toEqual([...byTotal].sort((a, b) => b - a));
  // Alt+Right moves a level later, keeping focus on its chip.
  await page.locator('.cx-gchip[data-cx-level="1"] .cx-gchip-direction').focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(["region", "status"]);
  await page.locator('[data-cx-column-menu="region"]').click();
  await page.getByRole("menuitem", { name: "Stop grouping by this column" }).click();
  await expect.poll(() => page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(["status"]);
  expect((await page.evaluate(api + ".getQuery()")).sort.some(sort => sort.column === "region")).toBe(false);
  await page.evaluate(api + ".applySavedView('By status')");
  expect(await page.evaluate(api + ".getGroupBy()")).toEqual([{ column: "status", direction: "desc" }, { column: "region", direction: "desc" }]);
  expect((await page.evaluate(api + ".getShareState()")).query.groupBy).toHaveLength(2);
  await page.evaluate(api + ".setGroupBy([])");
  await expect(headings(page)).toHaveCount(0); await expect(page.locator(".cx-groupbar-hint")).toBeVisible();
  expect(await page.evaluate(api + ".getState().query.groupBy")).toEqual([]);
});

for (const method of ["setGroupBy", "setQuery"]) {
  test(`${method} retires stale grouping menus and reopened actions preserve host levels and the four-level cap`, async ({ page }) => {
    await open(page);
    const change = async columns => expect(await page.evaluate(async ({ method, columns }) => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx;
      const groupBy = columns.map(column => ({ column, direction: "asc" }));
      const stale = document.querySelector(".cx-column-menu") && JSON.stringify(grid.getGroupBy()) !== JSON.stringify(groupBy);
      const pending = method === "setGroupBy" ? grid.setGroupBy(groupBy) : grid.setQuery({ ...grid.getQuery(), groupBy });
      const retiredAtIntent = !stale || !document.querySelector(".cx-column-menu");
      await pending;
      return retiredAtIntent;
    }, { method, columns })).toBe(true);
    await change(["region"]);
    const menu = page.locator(".cx-column-menu"), add = page.getByRole("menuitem", { name: "Group by this column", exact: true });
    await page.locator('[data-cx-column-menu="customer"]').click();
    await expect(add).toBeVisible();
    // A query with unchanged grouping must leave the column menu alone.
    await change(["region"]);
    await expect(add).toBeVisible();
    await change(["region", "status"]);
    await expect(menu).toHaveCount(0);
    await page.locator('[data-cx-column-menu="customer"]').click();
    await add.click();
    await expect.poll(() => page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(["region", "status", "customer"]);
    await page.locator('[data-cx-column-menu="customer"]').click();
    await expect(page.getByRole("menuitem", { name: "Stop grouping by this column", exact: true })).toBeVisible();
    await change(["region", "status", "order", "items"]);
    await expect(menu).toHaveCount(0);
    await page.locator('[data-cx-column-menu="customer"]').click();
    await expect(add).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    expect(await page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(["region", "status", "order", "items"]);
  });
}

test("a queued column grouping action resolves the latest host intent and rechecks the level cap", async ({ page }) => {
  await open(page);
  await page.evaluate(api + ".setGroupBy([{ column: 'region', direction: 'asc' }])");
  const add = page.getByRole("menuitem", { name: "Group by this column", exact: true });
  for (const columns of [["region", "status"], ["region", "status", "order", "items"]]) {
    await page.locator('[data-cx-column-menu="customer"]').click();
    await expect(add).toBeVisible();
    // The shared menu queues its action. Change host intent in the same turn before that action runs.
    await add.evaluate((item, columns) => {
      item.click();
      return document.querySelector("[data-canopyx-host]").canopyx
        .setGroupBy(columns.map(column => ({ column, direction: "asc" })))
        .catch(error => { if (error.name !== "AbortError") throw error; });
    }, columns);
    const expected = columns.length === 4 ? columns : [...columns, "customer"];
    await expect.poll(() => page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(expected);
    if (columns.length < 4) await page.evaluate(api + ".setGroupBy([{ column: 'region', direction: 'asc' }])");
  }
});

test("expand and collapse all, by level, by heading keys; a focused record hidden by a collapse hands focus to its heading", async ({ page }) => {
  await open(page);
  await page.evaluate(api + ".setGroupLevelCollapsed(2, true)");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(0);
  expect(await headings(page).count()).toBe(16);
  await page.evaluate(api + ".collapseAllGroups()"); await expect(headings(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Expand all" }).click(); await expect(headings(page).first()).toHaveAttribute("aria-expanded", "true");
  const east = headings(page).first(); await east.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(":focus")).toHaveAttribute("aria-level", "2");
  await page.keyboard.press("ArrowLeft"); await expect(page.locator(":focus")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowLeft"); await expect(page.locator(":focus")).toHaveAttribute("aria-level", "1");
  await page.keyboard.press("Enter"); await expect(page.locator(":focus")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space"); await expect(page.locator(":focus")).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(api + ".expandAllGroups()"); await headings(page).first().focus();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate("document.activeElement.dataset.cxId || null")).toMatch(/^o\d+/);
  const inner = await page.evaluate(api + ".getSummary().groups[0].groups[0].key");
  await page.evaluate(api + `.setGroupCollapsed(${JSON.stringify(inner)}, true)`);
  await expect(page.locator(":focus")).toHaveAttribute("data-cx-group", inner);
  const events = await page.evaluate(() => new Promise(resolve => {
    document.querySelector("[data-canopyx-host]").addEventListener("canopyx:group", event => resolve(event.detail), { once: true });
    document.querySelector("[data-canopyx-host]").canopyx.setGroupLevelCollapsed(1, true);
  }));
  expect(events).toMatchObject({ level: 1, collapsed: true }); expect(events.keys).toHaveLength(4);
});

test("a heading selects its group's records; exports of the filtered result carry the outline", async ({ page }) => {
  await open(page);
  await headings(page).nth(1).locator(".cx-grid-group-select").click();
  await expect.poll(() => page.evaluate(api + ".getSelection().length")).toBe(4);
  await expect(headings(page).nth(1).locator(".cx-grid-group-select")).toBeChecked();
  await headings(page).nth(1).locator(".cx-grid-group-select").click();
  await expect.poll(() => page.evaluate(api + ".getSelection().length")).toBe(0);
  const request = await page.evaluate(api + ".prepareExport({ scope: 'filtered' }).request");
  expect(request.grouping.levels.map(level => [level.column, level.title])).toEqual([["region", "Region"], ["status", "Status"]]);
  expect(request.grouping.groups[0].groups[0]).toMatchObject({ text: "Closed", offset: 0, count: 4 });
  expect(request.grouping.totals.orders).toBe(48);
  expect((await page.evaluate(api + ".prepareExport({ scope: 'all' }).request")).grouping).toBeUndefined();
  const ids = await page.evaluate(`(async () => { const ids = []; for await (const row of ${api}.prepareExport({ scope: 'filtered' }).rows()) ids.push(row.id); return ids; })()`);
  expect(ids.slice(0, 4)).toEqual(orders().filter(row => row.cells.region === "East" && row.cells.status === "Closed").map(row => row.id));
});

test("distinct counts and plugin aggregates are computed for inline data and labelled with their own templates", async ({ page }) => {
  const view = definition();
  view.reporting.aggregates = [{ id: "customers", column: "customer", operation: "distinctCount", label: "Customers" },
    { id: "median", column: "amount", operation: "median", label: "Median amount" }];
  await open(page, view, pluginSetup);
  const summary = await page.evaluate(api + ".getSummary()");
  expect(summary.aggregates.customers).toBe(new Set(orders().map(row => row.cells.customer)).size);
  const amounts = orders().map(row => row.cells.amount).sort((a, b) => a - b);
  expect(summary.aggregates.median).toBe((amounts[23] + amounts[24]) / 2);
  await expect(page.locator(".cx-summary-row [role='gridcell']").last()).toHaveText(/^med [\d,.]+$/);
  await expect(page.locator(".cx-summary-row [role='gridcell']").nth(1)).toHaveText(/^distinct \d+$/);
  const failure = await page.evaluate(async view => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const grid = CanopyX.createDataGrid(host, { view: { ...view, id: "no-plugin", reporting: { ...view.reporting, aggregates: [{ id: "x", column: "amount", operation: "spread", label: "Spread" }] } } });
    return grid.ready.then(() => "ready", error => error.message).catch(error => error.message);
  }, view);
  expect(String(failure)).toContain("no plugin computes the aggregate 'spread'");
});

test("every aggregate of one function in a column keeps the same decimals, trailing zeros included", async ({ page }) => {
  const view = definition();
  view.reporting.groupBy = [{ column: "region", direction: "asc" }];
  view.rows = [["North", 2], ["North", 4], ["South", 1], ["South", 2], ["West", 2.5], ["West", 3.25]].map(([region, amount], i) =>
    ({ id: "r" + i, cells: { order: "SO-" + i, customer: "C", region, status: "Open", amount, items: 1, placed: "2026-01-01T00:00:00Z" } }));
  await open(page, view);
  // Undeclared aggregate formats use two decimals consistently in headings and totals, independent of the loaded sample.
  const texts = await page.locator(".cx-grid-group [role='gridcell']:last-child, .cx-summary-row [role='gridcell']:last-child").allTextContents();
  expect(texts).toEqual(["sum 6.00 · avg 3.00", "sum 3.00 · avg 1.50", "sum 5.75 · avg 2.88", "sum 14.75 · avg 2.46"]);
});

test("runtime grouping keeps the inline source's facet counts", async ({ page }) => {
  const view = definition(); view.reporting.facetColumns = ["region"];
  await open(page, view);
  const facets = await page.evaluate(api + ".getFacets('region')");
  expect(facets.items.map(value => [value.value, value.count])).toEqual([["East", 12], ["North", 12], ["South", 12], ["West", 12]]);
});

test("a header dragged onto the group-by bar adds a level", async ({ page }) => {
  await open(page, definition({ reporting: { ...definition().reporting, groupBy: [] } }));
  const handle = page.locator('[data-cx-column="customer"] .cx-column-move'), bar = page.locator(".cx-groupbar");
  const from = await handle.boundingBox(), to = await bar.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 10, { steps: 4 }); await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 6 });
  await expect(bar).toHaveClass(/cx-group-drop/);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(api + ".getGroupBy().map(level => level.column)")).toEqual(["customer"]);
});

for (const theme of ["light", "dark"]) for (const width of [1440, 390])
test(`grouped orders read well at ${width} in ${theme} with no accessibility violations`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await open(page, definition(), "", theme);
  if (width < 600) {
    // Phones wrap the bar inside its container, every chip and button in view, and show the aggregates of columns out of view after the heading.
    const fit = await page.locator(".cx-groupbar").evaluate(bar => {
      const box = bar.getBoundingClientRect(), host = bar.closest("[data-canopyx-host]").getBoundingClientRect();
      const inside = [...bar.querySelectorAll(".cx-gchip,.cx-groupbar-all")].every(item => { const own = item.getBoundingClientRect();
        return own.left >= box.left - 0.5 && own.right <= box.right + 0.5 && own.width > 0; });
      return { scroll: bar.scrollWidth - bar.clientWidth, right: box.right - host.right, inside, chips: bar.querySelectorAll(".cx-gchip").length };
    });
    expect(fit).toEqual({ scroll: 0, right: expect.any(Number), inside: true, chips: 2 }); expect(fit.right).toBeLessThanOrEqual(0.5);
    await expect(headings(page).first().locator(".cx-grid-group-aggregates")).toContainText("Amount sum");
  }
  await page.locator(".cx-grid-group").first().focus();
  expect((await new AxeBuilder({ page }).include("[data-canopyx-host]").analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`grouped-${theme}-${width}.png`) });
  await nextFrames(page);
});
