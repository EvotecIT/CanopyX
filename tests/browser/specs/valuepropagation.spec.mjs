import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { openGridControl, flushGridFilters } from "./support.mjs";
import { mountReportLayout, reportLayoutView } from "./report-grid-layout-support.mjs";

function categoryView() {
  const view = reportLayoutView();
  view.id = "value-propagation"; view.selection = "none";
  view.reporting = { facetColumns: ["category"] };
  view.columns = [{ id: "name", title: "Record", kind: "text" },
    { id: "category", title: "Category", kind: "text", valueLabels: {
      A: "Upper category", a: "Lower category", " A ": "Spaced category", true: "String true"
    }, valueOrder: ["a", " A ", "true", "A"] }];
  view.rows = [["upper", "A"], ["lower", "a"], ["spaced", " A "], ["boolean", true], ["string", "true"], ["empty", null],
    ...Array.from({ length: 8 }, (_, index) => ["other" + index, "token" + index])]
    .map(([id, category]) => ({ id, cells: { name: "Record " + id, category } }));
  return view;
}

const facet = page => page.locator('.cx-facet[data-cx-facet="category"]');
const renderedIds = page => page.locator('.cx-row[data-cx-id]').evaluateAll(rows => rows.map(row => row.dataset.cxId).sort());
const expectRows = (page, ids) => expect.poll(() => renderedIds(page)).toEqual([...ids].sort());
const facetChoice = (page, label) => facet(page).getByRole("checkbox", { name: label + ", 1 rows", exact: true });
const operandChoice = (picker, label, count = 1) => picker.getByRole("checkbox", { name: new RegExp("^" + label + "\\s*" + count + "$") });

test("facet panel keeps labelled case, whitespace, boolean and null buckets independently selectable", async ({ page }) => {
  const view = categoryView();
  view.facets = { columns: [{ column: "category", limit: 20 }] };
  await mountReportLayout(page, { view });
  await expect(facet(page).getByRole("checkbox")).toHaveCount(14);
  for (const label of ["Upper category", "Lower category", "Spaced category", "Yes", "String true", "(Empty)"])
    await expect(facetChoice(page, label)).not.toBeChecked();
  await facetChoice(page, "Upper category").check(); await expectRows(page, ["upper"]);
  await facetChoice(page, "Lower category").check(); await expectRows(page, ["upper", "lower"]);
  await facetChoice(page, "Upper category").uncheck(); await expectRows(page, ["lower"]);
  await facetChoice(page, "Lower category").uncheck(); await expectRows(page, view.rows.map(row => row.id));
  for (const [label, id] of [["Spaced category", "spaced"], ["Yes", "boolean"], ["String true", "string"], ["(Empty)", "empty"]]) {
    await facetChoice(page, label).check(); await expectRows(page, [id]);
    await expect(facetChoice(page, label)).toBeChecked();
    await facetChoice(page, label).uncheck(); await expectRows(page, view.rows.map(row => row.id));
  }
});

test("facet panel applies exact declared category order", async ({ page }) => {
  const view = categoryView();
  view.rows = view.rows.filter(row => !row.id.startsWith("other"));
  view.rows.push(...["Z", "b", "B", "z"].map(category => ({ id: category, cells: { name: category, category } })));
  view.facets = { columns: [{ column: "category", limit: 20 }] };
  await mountReportLayout(page, { view });
  await expect.poll(() => facet(page).locator(".cx-facet-text").allTextContents())
    .toEqual(["Lower category", "Spaced category", "String true", "Upper category", "Yes", "B", "Z", "b", "z", "(Empty)"]);
});

test("facet panel searches authored labels and retains selected raw buckets", async ({ page }) => {
  const view = categoryView();
  view.facets = { columns: [{ column: "category", limit: 20 }] };
  await mountReportLayout(page, { view });
  await facet(page).getByRole("searchbox").fill("upper category");
  await expect(facet(page).locator(".cx-facet-text")).toHaveText(["Upper category"]);
  await facetChoice(page, "Upper category").check(); await expectRows(page, ["upper"]);
  await facet(page).getByRole("searchbox").fill("");
  await expect(facetChoice(page, "Upper category")).toBeChecked();
  await expect(facet(page).getByRole("checkbox")).toHaveCount(14);
});

async function membership(page) {
  await openGridControl(page, "filters");
  const panel = page.locator(".cx-grid-filters");
  if (!await panel.locator("fieldset.cx-grid-filter").count()) {
    await panel.getByRole("button", { name: "+ Condition", exact: true }).first().click();
  }
  const row = panel.locator("fieldset.cx-grid-filter").first();
  const column = row.getByRole("combobox", { name: "Column", exact: true }), condition = row.getByRole("combobox", { name: "Condition", exact: true });
  if (await column.inputValue() !== "category") await column.selectOption("category");
  if (await condition.inputValue() !== "in") await condition.selectOption("in");
  const picker = panel.locator("fieldset.cx-grid-filter .cx-ms").first();
  await picker.locator(":scope > summary").click();
  return picker;
}

test("membership picker searches labels and preserves exact raw operands through edits", async ({ page }) => {
  await mountReportLayout(page, { view: categoryView() });
  let picker = await membership(page);
  await expect.poll(() => picker.locator(".cx-val").allTextContents().then(labels => labels.slice(0, 4)))
    .toEqual(["Lower category1", "Spaced category1", "String true1", "Upper category1"]);
  await picker.getByRole("searchbox", { name: "Search values", exact: true }).fill("upper category");
  await expect(picker.getByRole("checkbox")).toHaveCount(1);
  await operandChoice(picker, "Upper category").check();
  await picker.getByRole("searchbox").fill("");
  await operandChoice(picker, "Lower category").check();
  await flushGridFilters(page, false); await expectRows(page, ["upper", "lower"]);
  picker = await membership(page);
  await expect(operandChoice(picker, "Upper category")).toBeChecked();
  await expect(operandChoice(picker, "Lower category")).toBeChecked();
  for (const label of ["Spaced category", "String true", "Yes"])
    await operandChoice(picker, label).check();
  await flushGridFilters(page, false); await expectRows(page, ["upper", "lower", "spaced", "boolean", "string"]);
  expect(await page.evaluate(() => api().getQuery().filters.find(item => item.column === "category").values))
    .toEqual(["A", "a", " A ", "true", true]);
  picker = await membership(page);
  await operandChoice(picker, "Upper category").uncheck();
  await flushGridFilters(page, false); await expectRows(page, ["lower", "spaced", "boolean", "string"]);
  expect(await page.evaluate(() => api().getQuery().filters.find(item => item.column === "category").values))
    .toEqual(["a", " A ", "true", true]);
});

test("undeclared facet and membership values retain case folding and numeric and null distinctions", async ({ page }) => {
  const view = categoryView(); delete view.columns[1].valueLabels; delete view.columns[1].valueOrder;
  view.columns.push({ id: "amount", title: "Amount", kind: "number" });
  view.rows = view.rows.filter(row => ["upper", "lower", "boolean", "string", "empty"].includes(row.id));
  view.rows.forEach((row, index) => { row.cells.amount = index === 4 ? null : index % 2 + 1; });
  view.facets = { columns: ["category", { column: "amount", kind: "list" }] };
  await mountReportLayout(page, { view });
  await expect(facet(page).getByRole("checkbox", { name: "A, 2 rows", exact: true })).toBeVisible();
  await expect(facet(page).getByRole("checkbox")).toHaveCount(4);
  await facet(page).getByRole("checkbox", { name: "A, 2 rows", exact: true }).check();
  await expectRows(page, ["upper", "lower"]);
  const amounts = page.locator('.cx-facet[data-cx-facet="amount"]');
  await amounts.getByRole("checkbox", { name: "1, 1 rows", exact: true }).check(); await expectRows(page, ["upper"]);
  await amounts.getByRole("button", { name: "Clear Amount", exact: true }).click();
  await expectRows(page, ["upper", "lower"]);
  await facet(page).getByRole("button", { name: "Clear Category", exact: true }).click();
  await amounts.getByRole("checkbox", { name: "(Empty), 1 rows", exact: true }).check(); await expectRows(page, ["empty"]);
  await amounts.getByRole("button", { name: "Clear Amount", exact: true }).click();
  await expectRows(page, view.rows.map(row => row.id));
  const picker = await membership(page);
  await expect(operandChoice(picker, "A", 2)).toBeVisible();
  await operandChoice(picker, "A", 2).check();
  await flushGridFilters(page, false); await expectRows(page, ["upper", "lower"]);
});

test("record action copy and downloads carry category labels while JSON values and numeric exports remain raw", async ({ page }) => {
  const view = categoryView();
  view.record = { actions: { copy: true, export: true } };
  view.columns.push({ id: "days", title: "Days", kind: "number", numericTones: [{ operator: "below", value: 0, tone: "danger", label: "Overdue" }] });
  view.rows = [{ id: "one", cells: { name: "Record one", category: "A", days: -1 } }];
  await page.addInitScript(() => {
    window.copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: text => { window.copied.push(text); return Promise.resolve(); }
    } });
  });
  await mountReportLayout(page, { view });
  await page.evaluate(() => api().openDetails("one"));
  const drawer = page.locator(".cx-drawer");
  await expect(drawer.locator('dd[data-cx-field="category"]')).toHaveText("Upper category");
  const action = async name => {
    await drawer.getByRole("button", { name: "Record actions", exact: true }).click();
    await drawer.getByRole("menuitem", { name, exact: true }).click();
  };
  await action("Copy values");
  await expect.poll(() => page.evaluate(() => window.copied.length)).toBe(1);
  const text = await page.evaluate(() => window.copied[0]);
  expect(text).toContain("Category\tUpper category"); expect(text).toContain("Days\t-1"); expect(text).not.toContain("Overdue");
  const checkJson = json => {
    expect(json.fields.find(field => field.id === "category")).toMatchObject({ text: "Upper category", value: "A" });
    expect(json.fields.find(field => field.id === "days")).toMatchObject({ text: "-1", value: -1 });
  };
  await action("Copy as JSON");
  await expect.poll(() => page.evaluate(() => window.copied.length)).toBe(2);
  checkJson(JSON.parse(await page.evaluate(() => window.copied[1])));
  const [csv] = await Promise.all([page.waitForEvent("download"), action("Export CSV")]);
  const csvText = fs.readFileSync(await csv.path(), "utf8");
  expect(csvText).toContain('"Category","Upper category"'); expect(csvText).toContain('"Days","-1"'); expect(csvText).not.toContain("Overdue");
  const [json] = await Promise.all([page.waitForEvent("download"), action("Export JSON")]);
  checkJson(JSON.parse(fs.readFileSync(await json.path(), "utf8")));
});

test("record-only wrapping honors three lines, boundary limits and the default with complete tooltips", async ({ page }) => {
  const view = categoryView(), notes = "An observation with the complete detail retained in the record tooltip. ".repeat(30);
  view.columns = view.columns.slice(0, 1);
  view.reporting = {};
  view.record = { fields: [
    { id: "one", title: "One line", wrap: true, maxLines: 1 },
    { id: "three", title: "Three lines", wrap: true, maxLines: 3 },
    { id: "twelve", title: "Twelve lines", wrap: true, maxLines: 12 },
    { id: "default", title: "Default lines", wrap: true }
  ] };
  view.rows = [{ id: "one", cells: { name: "Record one" }, fields: { one: notes, three: notes, twelve: notes, default: notes } }];
  await mountReportLayout(page, { view });
  await page.evaluate(() => api().openDetails("one"));
  for (const [id, lines] of [["one", 1], ["three", 3], ["twelve", 12], ["default", 2]]) {
    const text = page.locator(`.cx-drawer dd[data-cx-field="${id}"] .cx-wrapped-text`);
    await expect(text).toHaveCSS("-webkit-line-clamp", String(lines));
    await expect(text).toHaveAttribute("title", notes);
    expect(await text.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))).toBeCloseTo(lines, 0);
  }
});

for (const [name, maxLines] of [["below minimum", 0], ["above maximum", 13], ["fractional", 1.5], ["string", "3"], ["null", null], ["boolean", true]])
  test(`record-only wrapping rejects an invalid line limit (${name}) through the drawer validation path`, async ({ page }) => {
    const view = categoryView();
    view.record = { fields: [{ id: "notes", title: "Notes", wrap: true, maxLines }] };
    view.rows = [{ id: "one", cells: { name: "Record one", category: "A" }, fields: { notes: "Complete detail" } }];
    await mountReportLayout(page, { view });
    await page.evaluate(() => {
      window.recordErrors = [];
      document.addEventListener("canopyx:error", event => window.recordErrors.push(event.detail.error.message), true);
    });
    await page.evaluate(() => api().openDetails("one"));
    await expect.poll(() => page.evaluate(() => window.recordErrors)).toContain("CanopyX: record maxLines must be an integer from 1 to 12.");
    await expect(page.locator(".cx-drawer")).toBeVisible();
    await expect(page.locator(".cx-drawer .cx-record-panel")).toHaveCount(0);
    await expect(page.locator('.cx-drawer dd[data-cx-field="notes"]')).toHaveCount(0);
  });
