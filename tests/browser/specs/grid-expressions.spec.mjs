import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const predicate = (column, operator, ...values) => ({ column, operator, values });
const group = (operator, filters = [], groups = []) => ({ operator, filters, groups });
const definition = rows => ({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  source: { kind: "inline" }, rows, rowHeight: 28, pageSize: 2, selection: "multiple", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 180, sortable: true },
    { id: "category", title: "Category", kind: "text", width: 130, sortable: true },
    { id: "amount", title: "Amount", kind: "number", width: 100, sortable: true }] });
async function open(page, view, setup = "") {
  await page.route("http://canopyx.test/expressions", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/expressions");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}
const ids = page => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id")));

test("word and phrase search combine columns and aliases without changing raw sort or export values", async ({ page }) => {
  const view = definition([
    { id: "a", cells: { name: { value: "Alpha", text: "Visible only", searchText: "north office" }, category: "Ready", amount: 20 } },
    { id: "b", cells: { name: "north", category: "office ready", amount: 10 } },
    { id: "c", cells: { name: { value: "north office", searchText: "" }, category: "Ready", amount: 30 } }
  ]);
  view.searchColumns = ["name", "category"];
  await open(page, view);
  const search = (text, mode) => page.evaluate(async ({ text, mode }) => {
    await document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: text, searchMode: mode });
  }, { text, mode });
  await search("ready north", "words"); expect(await ids(page)).toEqual(["a", "b"]);
  await search('ready "north office"', "words"); expect(await ids(page)).toEqual(["a"]);
  await search('"north office', "words"); expect(await ids(page)).toEqual(["a"]);
  await search("ready north", "substring"); expect(await ids(page)).toEqual([]);
  await search("Visible only", "words"); expect(await ids(page)).toEqual([]);
  await search("20", "words"); expect(await ids(page)).toEqual([]);
  await search("north", "words");
  const csv = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.toCsv({ scope: "filtered", values: "raw" }));
  expect(csv).toContain("Alpha,Ready,20"); expect(csv).not.toContain("Visible only"); expect(csv).not.toContain("north office,Ready,30");
});

test("nested AND/OR predicates evaluate the whole dataset before windows, sorting and exports", async ({ page }) => {
  const view = definition(Array.from({ length: 500 }, (_, amount) => ({ id: "row-" + String(amount).padStart(3, "0"),
    cells: { name: "Record " + amount, category: amount % 2 ? "Odd" : "Even", amount } })));
  const expression = group("or", [predicate("amount", "eq", 490)], [group("and", [predicate("category", "eq", "Odd"), predicate("amount", "ge", 495)])]);
  view.query = { filterGroup: expression, sort: [{ column: "amount", direction: "desc" }] };
  await open(page, view);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
  expect((await ids(page)).slice(0, 2)).toEqual(["row-499", "row-497"]);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const exported = grid.prepareExport({ scope: "filtered" }); grid.saveView("Grouped query");
    await grid.setQuery({ search: "Record 000" });
    const captured = []; for await (const row of exported.rows()) captured.push(row.id);
    await grid.applySavedView("Grouped query");
    grid.setSelection(["row-100", "row-499"]);
    const all = grid.prepareExport({ scope: "all" }), selected = grid.prepareExport({ scope: "selected" });
    const selectedIds = []; for await (const row of selected.rows()) selectedIds.push(row.id);
    return { captured, selectedIds, allGroup: all.request.query.filterGroup || null,
      restored: grid.getQuery().filterGroup, immutable: Object.isFrozen(exported.request.query.filterGroup.groups[0].filters[0].values) };
  });
  expect(result.captured).toEqual(["row-499", "row-497", "row-495", "row-490"]);
  expect(result.selectedIds).toEqual(["row-499", "row-100"]);
  expect(result.allGroup).toBeNull(); expect(result.restored).toEqual(expression); expect(result.immutable).toBe(true);
  await page.locator(".cx-grid-filters summary").click();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "501");
});

test("nested limits and unknown fields reject queries before replacing the accepted snapshot", async ({ page }) => {
  await open(page, definition([{ id: "original", cells: { name: "Original", amount: 1 } }]));
  const results = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, leaf = { column: "name", operator: "isNotNull", values: [] };
    const expression = { operator: "and", filters: [leaf], groups: [] };
    const cases = [{ searchMode: "regex" }, { filterGroup: { operator: "and", filters: [], groups: [] } },
      { filters: Array(64).fill(leaf), filterGroup: expression },
      { filterGroup: { operator: "or", filters: [{ column: "amount", operator: "eq", values: ["1"] }], groups: [] } }];
    let deep = expression;
    for (let level = 1; level < 9; level++) deep = { operator: "and", filters: [], groups: [deep] };
    cases.push({ filterGroup: deep });
    const cyclic = { operator: "or", filters: [leaf], groups: [] }; cyclic.groups.push(cyclic); cases.push({ filterGroup: cyclic });
    const failures = [];
    for (const query of cases) { try { await grid.setQuery(query); failures.push(false); } catch (_) { failures.push(true); } }
    return { failures, query: grid.getQuery() };
  });
  expect(results.failures).toEqual(Array(6).fill(true)); expect(results.query.search).toBe("");
  expect(await ids(page)).toEqual(["original"]);
});

test("host queries receive immutable nested rules and search mode through sort, state and export", async ({ page }) => {
  const view = definition([]); view.source = { kind: "host" }; delete view.rows;
  const expression = group("or", [predicate("name", "eq", "Alpha")]);
  view.query = { search: "alpha ready", searchMode: "words", filterGroup: expression };
  const setup = `window.queries=[]; CanopyX.configure('inventory',{source:{query(query){
    window.queries.push({query, frozen:query.filterGroup ? Object.isFrozen(query.filterGroup.filters[0].values) : true});
    return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'host',offset:query.offset,total:1,matched:1,
      items:[{id:'one',cells:{name:'Alpha',category:'Ready',amount:10}}]};
  }}});`;
  await open(page, view, setup);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    grid.saveView("Words"); await grid.sort([{ column: "amount", direction: "desc" }]);
    await grid.toCsv({ scope: "filtered" }); await grid.applySavedView("Words");
    return window.queries;
  });
  expect(result.length).toBeGreaterThanOrEqual(4);
  for (const entry of result) { expect(entry.query.searchMode).toBe("words"); expect(entry.query.filterGroup).toEqual(expression); expect(entry.frozen).toBe(true); }
});
