import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { repo, openGridControl } from "./support.mjs";
import { open, api } from "./grid-grouping-fixtures.mjs";

const directory = path.join(repo, "CanopyX.Html/Assets"), source = name => fs.readFileSync(path.join(directory, name), "utf8");
const pure = vm.createContext({ requireIdentifier: value => { if (typeof value !== "string" || !value) throw new Error("identifier"); } });
vm.runInContext(source("canopyx.calculations.source/00-calculation-parser.js") + source("canopyx.calculations.source/10-calculation-evaluator.js") + ";this.calculations={parse:calculationParse,evaluate:calculationEvaluate};", pure);
const vectors = JSON.parse(fs.readFileSync(path.join(repo, "tests/conformance/calculations.json"), "utf8"));
for (const vector of vectors) test("shared calculation vector: " + vector.name, () => {
  const result = pure.calculations.evaluate(pure.calculations.parse(vector.expression), id => vector.row[id] ?? null);
  expect(result).toEqual({ value: vector.value, error: vector.error });
});

test("native browser rounding agrees with the shared negative-scale vectors", async ({ page }) => {
  const cases = vectors.filter(vector => ["round-binary-negative-scale", "round-negative-binary-scale"].includes(vector.name));
  await page.addScriptTag({ content: source("canopyx.calculations.source/00-calculation-parser.js") +
    source("canopyx.calculations.source/10-calculation-evaluator.js") });
  expect(await page.evaluate(cases => cases.map(vector => calculationEvaluate(calculationParse(vector.expression), () => null)), cases))
    .toEqual(cases.map(vector => ({ value: vector.value, error: vector.error })));
});
const parts = () => source("canopyx-calculations.js") + "\n" + source("canopyx-values.js") +
  ";document.head.append(Object.assign(document.createElement('style'),{textContent:" + JSON.stringify(source("canopyx-calculations.css")) + "}));";
export function calculationView() {
  return { protocol: "canopyx/2", type: "grid", id: "calculations", label: "Order calculations", source: { kind: "inline" }, pageSize: 100, rowHeight: 34,
    selection: "multiple", calculatedColumnsEditable: true,
    reporting: { facetColumns: ["amount"], aggregates: [{ id: "revenue", column: "amount", operation: "sum", label: "Revenue" }] },
    columns: [{ id: "product", title: "Product", kind: "text", sortable: true }, { id: "quantity", title: "Quantity", kind: "number", sortable: true },
      { id: "price", title: "Unit price", kind: "number", sortable: true }, { id: "amount", title: "Amount", kind: "number", sortable: true, calculation: "[quantity] * [price]" },
      { id: "caption", title: "Caption", kind: "text", sortable: true, calculation: 'CONCAT([product], ": ", [amount])' },
      { id: "ratio", title: "Ratio", kind: "number", sortable: true, calculation: "[price] / [quantity]" }],
    rows: [{ id: "a", cells: { product: "Desk", quantity: 2, price: 30 } }, { id: "b", cells: { product: "Chair", quantity: 3, price: 10 } },
      { id: "c", cells: { product: "Lamp", quantity: 0, price: 20 } }] };
}

test("calculated cells drive sorting, filters, facets, aggregates and numeric exports", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, calculationView(), parts());
  expect((await page.evaluate(api + ".getSummary()")).aggregates.revenue).toBe(90);
  const facets = await page.evaluate(api + ".getFacets('amount')"); expect(facets.items.map(item => [item.value, item.count])).toEqual([[0, 1], [30, 1], [60, 1]]);
  await page.evaluate(api + ".setQuery({sort:[{column:'amount',direction:'desc'}],filters:[{column:'amount',operator:'ge',values:[30]}]})");
  const exported = await page.evaluate("(async()=>{const rows=[];for await(const row of " + api + ".prepareExport({scope:'filtered'}).rows())rows.push(row);return rows})()");
  expect(exported.map(row => row.id)).toEqual(["a", "b"]);
  expect(exported.map(row => row.cells.amount.value)).toEqual([60, 30]);
  expect(exported[0].cells.caption.value).toBe("Desk: 60"); expect(errors).toEqual([]);
});

test("cell errors have a tooltip and leave independent calculations usable", async ({ page }) => {
  await open(page, calculationView(), parts());
  const row = page.locator('[data-cx-id="c"]');
  await expect(row.getByText("#ERROR", { exact: true })).toBeVisible();
  await expect(row.locator('[title="Calculation error: divide-by-zero"]')).toBeVisible();
  const loaded = await page.evaluate(api + ".getLoadedRows(['c'])"); expect(loaded[0].cells.amount).toBe(0); expect(loaded[0].cells.caption).toBe("Lamp: 0");
});

test("calculated column definitions restore with saved views and reject cycles atomically", async ({ page }) => {
  await open(page, calculationView(), parts());
  await page.evaluate(api + ".setCalculatedColumns([..." + api + ".getCalculatedColumns(),{id:'tax',title:'Tax',kind:'number',expression:'ROUND([amount] * 0.2, 2)'}])");
  await page.evaluate(api + ".setQuery({sort:[{column:'tax',direction:'desc'}]})");
  const saved = await page.evaluate(api + ".getState()"); expect(saved.calculatedColumns).toHaveLength(4);
  await page.evaluate(api + ".resetView()"); expect((await page.evaluate(api + ".getCalculatedColumns()")).map(column => column.id)).not.toContain("tax");
  await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), saved);
  expect(await page.evaluate(api + ".getQuery().sort[0].column")).toBe("tax");
  const result = await page.evaluate("(async()=>{try{await " + api + ".setCalculatedColumns([..." + api + ".getCalculatedColumns(),{id:'cycle',title:'Cycle',kind:'number',expression:'[cycle]+1'}]);return 'accepted'}catch(e){return e.message}})()");
  expect(result).toContain("cycle"); expect(await page.evaluate(api + ".getState()")).toEqual(saved);
});

test("the phone Columns editor validates expressions before adding a column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, calculationView(), parts(), "dark");
  await openGridControl(page, "columns");
  await page.getByRole("button", { name: "Add calculated column", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add calculated column" }); await expect(dialog).toBeVisible();
  await dialog.getByLabel("Column title", { exact: true }).fill("Tax");
  await dialog.getByLabel("Expression", { exact: true }).fill("[missing] + 1");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click(); await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Expression", { exact: true }).fill("ROUND([amount] * 0.2, 2)");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(api + ".getCalculatedColumns().length")).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("the calculation engine loads only when a view first declares it", async ({ page }) => {
  const requests = [], view = calculationView();
  delete view.calculatedColumnsEditable; view.columns = view.columns.filter(column => !column.calculation); delete view.reporting;
  await page.route(/canopyx-calculations\.(js|css)$/, route => {
    requests.push(new URL(route.request().url()).pathname);
    const file = route.request().url().endsWith(".js") ? "canopyx-calculations.js" : "canopyx-calculations.css";
    return route.fulfill({ contentType: file.endsWith(".js") ? "text/javascript" : "text/css", body: source(file) });
  });
  await open(page, view); expect(requests).toEqual([]);
  const calculated = calculationView(); delete calculated.reporting;
  const rows = await page.evaluate(async definition => {
    const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
    const grid = CanopyX.createDataGrid(host, { view: definition }); await grid.ready;
    return grid.getLoadedRows(["a"]);
  }, calculated);
  expect(requests.filter(url => url.endsWith(".js"))).toHaveLength(1);
  expect(requests.filter(url => url.endsWith(".css"))).toHaveLength(1); expect(rows[0].cells.amount).toBe(60);
});

test("a short viewport keeps the calculation editor header and scrolled Apply button reachable", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 180 }); await open(page, calculationView(), parts(), "dark");
  await page.evaluate(api + ".openCalculatedColumn()");
  const dialog = page.getByRole("dialog", { name: "Add calculated column" });
  await dialog.getByLabel("Column title", { exact: true }).fill("Tax");
  await dialog.getByLabel("Expression", { exact: true }).fill("[amount] * 0.2");
  // Firefox on macOS can finish scrolling the focused textarea after fill returns.
  await dialog.getByLabel("Expression", { exact: true }).blur();
  await expect.poll(() => dialog.evaluate(element => {
    const body = element.querySelector('[data-hfx-part="body"]'); body.scrollTop = body.scrollHeight;
    const box = element.getBoundingClientRect(), button = element.querySelector('button[type="submit"]').getBoundingClientRect(), heading = element.querySelector(".cx-drawer-h").getBoundingClientRect();
    return { buttonInside: button.top >= box.top && button.bottom <= box.bottom, headingInside: heading.top >= box.top && heading.bottom <= box.bottom,
      dialogInside: box.top >= 0 && box.bottom <= innerHeight };
  })).toEqual({ buttonInside: true, headingInside: true, dialogInside: true });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(api + ".getCalculatedColumns().length")).toBe(4);
});

test("compact row data evaluates formulas before its initial unsorted page", async ({ page }) => {
  const view = calculationView(); delete view.reporting; delete view.rows;
  view.rowData = { version: 1, count: 2, columns: ["product", "quantity", "price"], ordered: true, chunks: [[["a", "Desk", 2, 30], ["b", "Chair", 3, 10]]] };
  await open(page, view, parts());
  expect((await page.evaluate(api + ".getLoadedRows(['a','b'])")).map(row => row.cells.amount)).toEqual([60, 30]);
});

test("calculated identifiers stay own cell keys and missing prototype names stay null", async ({ page }) => {
  const view = calculationView(); delete view.reporting;
  view.columns.push({ id: "constructor", title: "Optional source", kind: "number" },
    { id: "__proto__", title: "Derived value", kind: "number", calculation: "COALESCE([constructor], [amount])" });
  await open(page, view, parts());
  const result = await page.evaluate(() => { const cells = document.querySelector('[data-canopyx-host]').canopyx.getLoadedRows(["a"])[0].cells; return { own: Object.hasOwn(cells, "__proto__"), value: cells.__proto__ }; });
  expect(result).toEqual({ own: true, value: 60 });
});

test("calculation grammar rejects unbounded, executable and malformed input", () => {
  for (const expression of ["x".repeat(2049), "(".repeat(33) + "1" + ")".repeat(33), "1" + "+1".repeat(33), "globalThis.alert(1)", "[x].constructor", "1e999", 'CONCAT("unterminated)', "IF(true,1)"])
    expect(() => pure.calculations.parse(expression)).toThrow();
  expect(pure.calculations.evaluate(pure.calculations.parse("IF(false, 1/0, COALESCE(null, 7))"), () => null)).toEqual({ value: 7, error: null });
});
