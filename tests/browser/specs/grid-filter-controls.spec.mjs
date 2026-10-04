import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const columns = [
  { id: "name", title: "Name", kind: "text", width: 170, sortable: true },
  { id: "category", title: "Category", kind: "text", width: 150 },
  { id: "amount", title: "Amount", kind: "number", width: 140, sortable: true },
  { id: "date", title: "Date", kind: "datetime", width: 210 },
  { id: "flag", title: "Flag", kind: "text", width: 130 }
];
const base = { protocol: "canopyx/2", type: "grid", id: "filters", label: "Filtered inventory", source: { kind: "inline" },
  rowHeight: 28, pageSize: 5, presentation: "paged", pageLength: 2, selection: "multiple", search: true,
  reporting: { headerFilters: true, ordering: { category: { text: "ordinal", categories: ["A", "B"] } } },
  columns: columns.map(column => ({ ...column, sortable: true })),
  rows: Array.from({ length: 18 }, (_, i) => ({ id: "row-" + String(i).padStart(2, "0"),
    cells: { name: "Item " + i, category: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "Other", amount: { value: i, text: "$" + i },
      date: "2026-01-" + String(i + 1).padStart(2, "0") + "T00:00:00Z", flag: i % 2 === 0 } })) };

async function open(page, patch = {}) {
  await page.route("http://canopyx.test/filters", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...base, ...patch }) }));
  await page.goto("http://canopyx.test/filters");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
}
const panel = page => page.locator(".cx-grid-filters");
const filters = page => panel(page).locator("fieldset.cx-grid-filter");
const query = page => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery());
async function exported(page) {
  return page.evaluate(async () => {
    const rows = []; for await (const row of document.querySelector('[data-canopyx-host]').canopyx.prepareExport({ scope: "filtered" }).rows()) rows.push(row.id);
    return rows;
  });
}

test("inclusive number ranges query the full dataset before visible paging and scoped export", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Filter Amount", exact: true }).click();
  const row = filters(page).first(); await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("between");
  await row.getByRole("spinbutton", { name: "Value (UTC for dates)", exact: true }).fill("3");
  await row.getByRole("spinbutton", { name: "Upper value (UTC for dates)", exact: true }).fill("6");
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
  expect((await query(page)).filters).toEqual([{ column: "amount", operator: "ge", values: [3] }, { column: "amount", operator: "le", values: [6] }]);
  expect(await exported(page)).toEqual(["row-03", "row-04", "row-05", "row-06"]);
  await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Filter Amount", exact: true })).toHaveAttribute("data-cx-filtered", "true");
  await row.getByRole("spinbutton", { name: "Value (UTC for dates)", exact: true }).press("Escape");
  await expect(page.getByRole("button", { name: "Filter Amount", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Filter Amount", exact: true }).press("Enter");
  await expect(filters(page)).toHaveCount(1); await expect(filters(page).getByRole("combobox", { name: "Condition", exact: true })).toHaveValue("between");
});

test("UTC date ranges preserve original offsets and fractional operands when reapplied", async ({ page }) => {
  const values = ["2026-01-03T00:00:00.123456+02:00", "2026-01-05T00:00:00.987654+02:00"];
  const predicates = [{ column: "date", operator: "ge", values: [values[0]] }, { column: "date", operator: "le", values: [values[1]] }];
  await open(page, { query: { filters: predicates } });
  await page.getByRole("button", { name: "Filter Date", exact: true }).click();
  await expect(filters(page)).toHaveCount(1);
  await expect(filters(page).getByRole("combobox", { name: "Condition", exact: true })).toHaveValue("between");
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await query(page)).filters).toEqual(predicates);
  expect(await exported(page)).toEqual(["row-02", "row-03"]);
});

test("reversed ranges keep the accepted results and report an actionable error", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Filter Amount", exact: true }).click();
  const row = filters(page).first(); await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("between");
  await row.getByRole("spinbutton", { name: "Value (UTC for dates)", exact: true }).fill("9");
  await row.getByRole("spinbutton", { name: "Upper value (UTC for dates)", exact: true }).fill("2");
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(panel(page).getByRole("status")).toHaveText("Enter an upper value greater than or equal to the lower value.");
  expect((await query(page)).filters).toEqual([]); await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "19");
});

test("category suggestions and translated boolean choices preserve typed raw predicates", async ({ page }) => {
  await open(page, { labels: { gridTrue: "Tak", gridFalse: "Nie" } });
  await page.getByRole("button", { name: "Filter Category", exact: true }).click();
  await filters(page).first().getByRole("combobox", { name: "Suggested category", exact: true }).selectOption("B");
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await query(page)).filters).toEqual([{ column: "category", operator: "eq", values: ["B"] }]);
  await page.getByRole("button", { name: "Filter Flag", exact: true }).click();
  const flag = filters(page).filter({ has: page.locator('select option[value="flag"]:checked') });
  await flag.getByRole("combobox", { name: "Raw value type", exact: true }).selectOption("boolean");
  await flag.getByRole("combobox", { name: "Boolean value", exact: true }).selectOption({ label: "Nie" });
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await query(page)).filters).toEqual([
    { column: "category", operator: "eq", values: ["B"] }, { column: "flag", operator: "eq", values: [false] }
  ]);
  expect(await exported(page)).toEqual(["row-01", "row-07", "row-13"]);
});

test("missing operators and membership disable inactive range controls", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "Filter Amount", exact: true }).click();
  const row = filters(page).first(); await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("between");
  await row.getByRole("spinbutton", { name: "Upper value (UTC for dates)", exact: true }).press("-");
  await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("in");
  await row.getByRole("textbox", { name: "Value (UTC for dates)", exact: true }).fill("2\n8");
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await query(page)).filters).toEqual([{ column: "amount", operator: "in", values: [2, 8] }]);
  expect(await exported(page)).toEqual(["row-02", "row-08"]);
  await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("isNull");
  await panel(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await query(page)).filters).toEqual([{ column: "amount", operator: "isNull", values: [] }]);
  expect(await exported(page)).toEqual([]);
});

test("header controls track stable column identities after reordering and reset", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    grid.setColumnOrder(["flag", "date", "amount", "category", "name"]);
    await grid.setQuery({ filters: [{ column: "amount", operator: "gt", values: [9] }] });
  });
  const button = page.getByRole("button", { name: "Filter Amount", exact: true }); await button.focus();
  await page.evaluate(async () => document.querySelector('[data-canopyx-host]').canopyx.setQuery({ search: "Item" }));
  await expect(button).toBeFocused(); await button.press("Enter");
  await expect(filters(page).first().getByRole("combobox", { name: "Column", exact: true })).toHaveValue("amount");
  await filters(page).first().getByRole("spinbutton", { name: "Value (UTC for dates)", exact: true }).press("Escape");
  await expect(button).toBeFocused(); await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(button).toHaveAttribute("data-cx-filtered", "false"); expect((await query(page)).filters).toEqual([]);
});
