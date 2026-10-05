import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage } from "./support.mjs";

const predicate = (column, operator, ...values) => ({ column, operator, values });
const group = (operator, filters = [], groups = []) => ({ operator, filters, groups });
function view(query = {}, enabled = true) {
  return { protocol: "canopyx/2", type: "grid", id: "groups", label: "Grouped conditions", source: { kind: "inline" },
    rowHeight: 28, pageSize: 5, presentation: "paged", pageLength: 2, selection: "multiple", search: true,
    reporting: { headerFilters: true, filterGroups: enabled }, query,
    columns: [{ id: "name", title: "Name", width: 180, kind: "text", sortable: true },
      { id: "amount", title: "Amount", width: 140, kind: "number", sortable: true },
      { id: "flag", title: "Flag", width: 130, kind: "text" }],
    rows: Array.from({ length: 20 }, (_, i) => ({ id: "r" + String(i).padStart(2, "0"),
      cells: { name: "Record " + i, amount: i, flag: i % 2 === 0 } })) };
}
const api = page => page.evaluateHandle(() => document.querySelector("[data-canopyx-host]").canopyx);
async function open(page, query, enabled) {
  await page.route("http://canopyx.test/filter-groups", route => route.fulfill({ contentType: "text/html", body: viewPage(view(query, enabled))
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Inventory conditions</h1>').replace('</body>', '</main></body>') }));
  await page.goto("http://canopyx.test/filter-groups"); await page.waitForSelector("[data-cx-ready]");
  await page.locator(".cx-grid-filters > summary").click();
}
const roots = page => page.locator(".cx-grid-filter-groups > div");
const first = page => roots(page).locator(":scope > .cx-grid-filter-group");
const directRows = element => element.locator(":scope > div").first().locator(":scope > .cx-grid-filter");
const actions = element => element.locator(":scope > .cx-grid-filter-group-actions");
const apply = page => page.locator(".cx-grid-filters").getByRole("button", { name: "Apply", exact: true }).click();
async function exported(page) {
  return page.evaluate(async () => {
    const ids = [], descriptor = document.querySelector("[data-canopyx-host]").canopyx.prepareExport({ scope: "filtered" });
    for await (const row of descriptor.rows()) ids.push(row.id); return ids;
  });
}

test("changing an AND range to OR retains the range as one condition and exports the whole result", async ({ page }) => {
  await open(page, { filterGroup: group("and", [predicate("amount", "ge", 3), predicate("amount", "le", 6), predicate("flag", "eq", true)]) });
  const root = first(page);
  await expect(directRows(root)).toHaveCount(2);
  await root.getByRole("combobox", { name: "Match", exact: true }).selectOption("or"); await apply(page);
  const expected = Array.from({ length: 20 }, (_, i) => i).filter(i => i % 2 === 0 || i >= 3 && i <= 6).map(i => "r" + String(i).padStart(2, "0"));
  expect(await exported(page)).toEqual(expected);
  await expect(page.locator(".cx-grid-result-count")).toHaveText(expected.length + " of 20 rows");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  const accepted = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filterGroup);
  expect(accepted).toEqual(group("or", [predicate("flag", "eq", true)], [group("and", [predicate("amount", "ge", 3), predicate("amount", "le", 6)])]));
});

test("an existing OR's independent bounds are preserved and outer filters stay a conjunction", async ({ page }) => {
  const query = { filters: [predicate("amount", "lt", 12)], filterGroup: group("or", [predicate("amount", "ge", 3), predicate("amount", "le", 6)]) };
  await open(page, query); await expect(directRows(first(page))).toHaveCount(2); await apply(page);
  expect(await exported(page)).toEqual(Array.from({ length: 12 }, (_, i) => "r" + String(i).padStart(2, "0")));
  const accepted = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery());
  expect(accepted.filters).toEqual(query.filters); expect(accepted.filterGroup).toEqual(query.filterGroup);
});

test("nested controls compose typed conditions and survive saved-state restoration and header filtering", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add condition group", exact: true }).click();
  const root = first(page); await actions(root).getByRole("button", { name: "Add filter", exact: true }).click();
  const row = directRows(root).first();
  await row.getByRole("combobox", { name: "Column", exact: true }).selectOption("amount");
  await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("ge");
  await row.getByRole("spinbutton", { name: "Value (UTC for dates)", exact: true }).fill("10");
  await actions(root).getByRole("button", { name: "Add condition group", exact: true }).click();
  const child = root.locator(":scope > .cx-grid-filter-group-children > fieldset");
  await actions(child).getByRole("button", { name: "Add filter", exact: true }).click();
  const nested = directRows(child).first();
  await nested.getByRole("combobox", { name: "Column", exact: true }).selectOption("flag");
  await nested.getByRole("combobox", { name: "Raw value type", exact: true }).selectOption("boolean");
  await nested.getByRole("combobox", { name: "Boolean value", exact: true }).selectOption("false"); await apply(page);
  expect(await exported(page)).toEqual(["r11", "r13", "r15", "r17", "r19"]);
  await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, state = grid.getState();
    await grid.resetView(); await grid.setState(state);
  });
  await page.getByRole("button", { name: "Filter Amount", exact: true }).click();
  await page.locator(".cx-grid-filters .cx-grid-filter-form > div").first().locator(".cx-grid-filter").getByRole("spinbutton", { name: "Value (UTC for dates)", exact: true }).fill("13");
  await apply(page); expect(await exported(page)).toEqual(["r13"]);
  await page.locator(".cx-grid-filters").getByRole("button", { name: "Clear filters", exact: true }).click();
  expect(await exported(page)).toHaveLength(20);
  const add = page.locator(".cx-grid-filter-groups > button"); await expect(add).toBeEnabled(); await add.click();
  await actions(first(page)).getByRole("button", { name: "Add filter", exact: true }).click();
  await directRows(first(page)).getByRole("textbox", { name: "Value (UTC for dates)", exact: true }).fill("Record 1");
  await apply(page); expect(await exported(page)).toEqual(["r01"]);
});

test("empty nested groups fail atomically and removal returns focus to an available group action", async ({ page }) => {
  const expression = group("and", [predicate("amount", "ge", 10)]);
  await open(page, { filterGroup: expression });
  const root = first(page); await actions(root).getByRole("button", { name: "Add condition group", exact: true }).click();
  const child = root.locator(":scope > .cx-grid-filter-group-children > fieldset"); await apply(page);
  await expect(page.locator(".cx-grid-filters .cx-grid-control-error")).toContainText("empty grid filter group");
  const errorBox = await page.locator(".cx-grid-filters .cx-grid-control-error").boundingBox();
  const panelBox = await page.locator(".cx-grid-group-editor").boundingBox();
  expect(errorBox.y).toBeGreaterThanOrEqual(panelBox.y);
  expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filterGroup)).toEqual(expression);
  await actions(child).getByRole("button", { name: "Remove condition group", exact: true }).focus();
  await actions(child).getByRole("button", { name: "Remove condition group", exact: true }).press("Enter");
  await expect(actions(root).getByRole("button", { name: "Add filter", exact: true })).toBeFocused();
  await actions(root).getByRole("button", { name: "Remove condition group", exact: true }).focus();
  await actions(root).getByRole("button", { name: "Remove condition group", exact: true }).press("Enter");
  await expect(page.locator(".cx-grid-filter-groups > button")).toBeFocused(); await apply(page);
  expect(await exported(page)).toHaveLength(20);
});

test("nested depth is bounded and a range expansion cannot exceed the query predicate budget", async ({ page }) => {
  let expression = group("and", [predicate("amount", "eq", 1)]);
  for (let i = 0; i < 7; i++) expression = group("and", [], [expression]);
  await open(page, { filterGroup: expression });
  await expect(page.locator(".cx-grid-filter-group")).toHaveCount(8);
  await expect(page.locator(".cx-grid-filter-group").last().locator(":scope > .cx-grid-filter-group-actions").getByRole("button", { name: "Add condition group", exact: true })).toBeDisabled();
  await apply(page); expect(await exported(page)).toEqual(["r01"]);
  const handle = await api(page);
  await handle.evaluate(grid => grid.setQuery({ filters: Array.from({ length: 64 }, () => ({ column: "amount", operator: "ge", values: [0] })) }));
  await page.locator(".cx-grid-filters > summary").click();
  await page.locator(".cx-grid-filter-groups > button").click();
  await actions(first(page)).getByRole("button", { name: "Add filter", exact: true }).click();
  await expect(page.locator(".cx-grid-filters .cx-grid-control-error")).toHaveText("Enter a valid filter value.");
  const bounds = await page.locator(".cx-grid-filters .cx-grid-control-error").boundingBox();
  const panel = await page.locator(".cx-grid-group-editor").boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(panel.y); expect(bounds.y + bounds.height).toBeLessThanOrEqual(panel.y + panel.height);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filters.length)).toBe(64);
});

test("external accepted chip and state changes retire stale grouped drafts without stealing outside focus", async ({ page }) => {
  const expression = group("and", [predicate("amount", "ge", 10)]);
  await open(page, { filterGroup: expression });
  const chip = page.getByRole("button", { name: "Clear grouped filters", exact: true });
  await chip.focus(); await chip.press("Enter");
  await expect(page.locator(".cx-grid-filters")).not.toHaveAttribute("open", "");
  expect(await exported(page)).toHaveLength(20);
  await page.locator(".cx-grid-filters > summary").click(); await expect(first(page)).toHaveCount(0); await apply(page);
  expect(await exported(page)).toHaveLength(20);
  await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const state = grid.getState(); await grid.setQuery({ filterGroup: { operator: "and", filters: [{ column: "amount", operator: "eq", values: [3] }], groups: [] } });
    await grid.setState(state);
  });
  await expect(page.locator(".cx-grid-filters")).not.toHaveAttribute("open", "");
  await page.locator(".cx-grid-filters > summary").click(); await expect(first(page)).toHaveCount(0);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ filterGroup: { operator: "and", filters: [{ column: "amount", operator: "eq", values: [5] }], groups: [] } }));
  await page.locator(".cx-grid-filters > summary").click(); await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.resetView());
  await expect(page.locator(".cx-grid-filters")).not.toHaveAttribute("open", "");
  expect(await exported(page)).toHaveLength(10);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filterGroup)).toEqual(expression);
});

test("compact dark nested controls retain typed content, keyboard focus and accessible names", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page, { filterGroup: group("or", [predicate("name", "contains", "Record 1")], [group("and", [predicate("amount", "ge", 3), predicate("amount", "le", 6)])]) });
  await page.locator("[data-canopyx-host]").evaluate(host => host.setAttribute("data-cx-theme", "dark"));
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
  const child = first(page).locator(":scope > .cx-grid-filter-group-children > fieldset");
  await directRows(child).getByRole("button", { name: "Remove Amount filter", exact: true }).focus();
  await directRows(child).getByRole("button", { name: "Remove Amount filter", exact: true }).press("Enter");
  await expect(actions(child).getByRole("button", { name: "Add filter", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
});
