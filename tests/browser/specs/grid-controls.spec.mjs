import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const definition = () => ({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  source: { kind: "inline" }, rowHeight: 28, pageSize: 10, selection: "multiple", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 180, sortable: true },
    { id: "size", title: "Size", kind: "number", width: 100, sortable: true },
    { id: "date", title: "Date", kind: "datetime", width: 200, sortable: true }],
  rows: Array.from({ length: 120 }, (_, i) => ({ id: "row-" + i,
    cells: { name: i % 2 ? "Archive" : "Source", size: { value: i, text: i + " KiB" }, date: "2026-01-" + String(i % 28 + 1).padStart(2, "0") + "T00:00:00Z" } })) });
async function openGrid(page, view = definition(), setup = "") {
  const html = viewPage(view).replace("</head>", "<script>" + setup + "</script></head>")
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Inventory</h1>').replace("</body>", "</main></body>");
  await page.route("http://canopyx.test/controls", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/controls"); await page.waitForSelector("[data-cx-ready]");
}
const api = "document.querySelector('[data-canopyx-host]').canopyx";

test("opening and applying filters preserves mixed raw membership and newline text", async ({ page }) => {
  const view = definition(); view.rows = [{ id: "bool", cells: { name: true } }, { id: "text", cells: { name: "true" } }, { id: "line", cells: { name: "line1\nline2" } }];
  view.query = { filters: [{ column: "name", operator: "in", values: [true, "true"] }] };
  await openGrid(page, view); await page.locator(".cx-grid-filters > summary").click();
  await page.locator(".cx-grid-filters").getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery().filters[0].values)).toEqual([true, "true"]);
  await page.evaluate(async () => document.querySelector('[data-canopyx-host]').canopyx.setQuery({ filters: [{ column: "name", operator: "eq", values: ["line1\nline2"] }] }));
  await page.locator(".cx-grid-filters > summary").click(); await page.locator(".cx-grid-filters > summary").click();
  await page.locator(".cx-grid-filters").getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery().filters[0].values)).toEqual(["line1\nline2"]);
});
for (const [column, values, extra] of [["size", [111, 112], "113"], ["date", ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"], "2026-01-03T00:00:00Z"]])
test(`membership editing displays and retains every original ${column} operand`, async ({page}) => {
  const view = definition(); view.query = {filters:[{column, operator:"in", values}]};
  await openGrid(page, view); await page.locator(".cx-grid-filters > summary").click();
  const membership = page.locator(".cx-grid-filter textarea:enabled");
  await expect(membership).toHaveValue(values.join("\n"));
  await membership.fill(values.join("\n") + "\n" + extra);
  await page.locator(".cx-grid-filters").getByRole("button", {name:"Apply",exact:true}).click();
  const actual = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery().filters[0].values);
  expect(actual).toEqual([...values, column === "size" ? Number(extra) : extra]);
});

test("reset supersedes queued search input before a slow host restoration", async ({ page }) => {
  const view = definition(); view.source = { kind: "host" }; delete view.rows;
  await openGrid(page, view, `window.queries=[];CanopyX.configure('inventory',{source:{async query(query){window.queries.push(query.search);await new Promise(resolve=>setTimeout(resolve,300));return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:0,total:0,matched:0,items:[]};}}});`);
  await page.getByRole("searchbox").fill("queued"); await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery().search)).toBe("");
  await expect(page.getByRole("grid")).toHaveAttribute("aria-busy", "false");
  expect(await page.evaluate(() => window.queries)).toEqual(["", ""]);
});
test("inactive numeric inputs do not prevent a valid membership filter from submitting", async ({ page }) => {
  await openGrid(page); await page.locator(".cx-grid-filters > summary").click();
  const panel = page.locator(".cx-grid-filters"); await panel.getByRole("button", { name: "Add filter", exact: true }).click();
  const row = panel.locator("fieldset"); await row.getByRole("combobox", { name: "Column", exact: true }).selectOption("size");
  await row.locator("input.cx-grid-filter-value").press("-");
  expect(await row.locator("input.cx-grid-filter-value").evaluate(input => input.validity.badInput)).toBe(true);
  await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("in"); await row.locator("textarea.cx-grid-filter-value:visible").fill("111");
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "2");
});
test("a keyboard reorder reaching a boundary keeps focus in that column's controls", async ({ page }) => {
  await openGrid(page); await page.locator(".cx-grid-columns > summary").click();
  const move = page.getByRole("button", { name: "Move Size earlier", exact: true }); await move.focus(); await move.press("Enter");
  await expect(page.getByRole("button", { name: "Move Size later", exact: true })).toBeFocused();
});

test("typed filter controls combine category, raw numbers and UTC dates across the complete source", async ({ page }) => {
  await openGrid(page); await page.locator(".cx-grid-filters > summary").click();
  const panel = page.locator(".cx-grid-filters");
  for (const [column, operator, value] of [["name", "in", "ARCHIVE"], ["size", "ge", "111"], ["date", "lt", "2026-01-08T00:00"]]) {
    await panel.getByRole("button", { name: "Add filter", exact: true }).click();
    const row = panel.locator("fieldset").last();
    await row.getByRole("combobox", { name: "Column", exact: true }).selectOption(column);
    await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption(operator);
    await row.locator(".cx-grid-filter-value:visible").fill(value);
    await expect(row.getByRole("button", { name: "Remove " + (column === "name" ? "Name" : column === "size" ? "Size" : "Date") + " filter", exact: true })).toBeVisible();
  }
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "4");
  expect(await page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId))).toEqual(["row-113", "row-115", "row-117"]);
  await panel.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "121");
});

test("column controls preserve a visible column, reorder keyboard cells and reset the original view", async ({ page }) => {
  await openGrid(page); await page.locator(".cx-grid-columns > summary").click();
  const panel = page.locator(".cx-grid-columns");
  await panel.getByRole("button", { name: "Move Date earlier", exact: true }).click();
  expect(await page.getByRole("columnheader").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn))).toEqual(["name", "date", "size"]);
  await panel.getByRole("checkbox", { name: "Name", exact: true }).uncheck();
  await panel.getByRole("checkbox", { name: "Date", exact: true }).uncheck();
  await expect(panel.getByRole("checkbox", { name: "Size", exact: true })).toBeDisabled();
  await page.locator('.cx-row[data-cx-id="row-0"]').focus(); await page.keyboard.press("F2");
  await expect(page.getByRole("gridcell").first()).toBeFocused();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(page.getByRole("columnheader")).toHaveCount(3);
  expect(await page.getByRole("columnheader").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn))).toEqual(["name", "size", "date"]);
  await page.getByRole("separator", { name: "Resize Size", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("separator", { name: "Resize Size", exact: true })).toHaveAttribute("aria-valuenow", "110");
  const head = page.getByRole("columnheader").first(), before = await head.boundingBox();
  await page.getByRole("grid").evaluate(grid => { grid.scrollTop = 700; }); await nextFrames(page);
  expect((await head.boundingBox()).y).toBe(before.y);
});

test("state round trips query, layout, selection and position without mutating on invalid snapshots", async ({ page }) => {
  await openGrid(page);
  const saved = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    await grid.setQuery({ search: "Archive", sort: [{ column: "size", direction: "desc" }], filters: [{ column: "size", operator: "ge", values: [50] }] });
    grid.setColumnOrder(["date", "name", "size"]); grid.setColumnWidth("date", 280); grid.setColumnVisible("name", false);
    grid.setTimeZone("local"); grid.setSelection(["row-101", "row-1"]); document.querySelector(".cx-grid").scrollTop = 350;
    return grid.getState();
  });
  await page.evaluate(api + ".resetView()"); await page.evaluate(state => document.querySelector("[data-canopyx-host]").canopyx.setState(state), saved);
  expect(await page.evaluate(api + ".getState()")).toEqual(saved);
  for (const patch of [{ version: 2 }, { view: "another" }, { timeZone: "unknown" }, { columns: saved.columns.map(column => ({ ...column, hidden: true })) }, { selection: [null] }]) {
    expect(await page.evaluate(async state => {
      try { await document.querySelector("[data-canopyx-host]").canopyx.setState(state); return false; } catch { return true; }
    }, { ...saved, ...patch })).toBe(true);
    expect(await page.evaluate(api + ".getState()")).toEqual(saved);
  }
});

test("failed and superseded host restorations cannot install another view's column layout", async ({ page }) => {
  const view = definition(); view.source = { kind: "host" }; delete view.rows;
  const setup = `window.pending=[];CanopyX.configure('inventory',{source:{query(query){
    const page={protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'v1',offset:query.offset,total:1,matched:1,
      items:query.offset?[ ]:[{id:'one',cells:{name:query.search||'Original',size:1}}]};
    if(!query.search)return page;return new Promise((resolve,reject)=>window.pending.push({query,resolve:()=>resolve(page),reject}));}}});`;
  await openGrid(page, view, setup);
  const original = await page.evaluate(api + ".getState()");
  await page.evaluate(({ state }) => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    window.old = grid.setState({ ...state, query: { ...state.query, search: "Old" }, columns: [...state.columns].reverse() }).catch(error => error.name);
    window.newest = grid.setState({ ...state, query: { ...state.query, search: "Newest" }, columns: [state.columns[1], state.columns[0], state.columns[2]] });
  }, { state: original });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(1);
  await page.evaluate(() => window.pending[0].resolve()); await page.evaluate(() => window.newest);
  expect(await page.evaluate(() => window.old)).toBe("AbortError");
  expect(await page.getByRole("columnheader").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn))).toEqual(["size", "name", "date"]);
  await page.evaluate(api + ".setState(" + JSON.stringify(original) + ")");
  await page.evaluate(state => { window.failed = document.querySelector("[data-canopyx-host]").canopyx.setState({ ...state,
    query: { ...state.query, search: "Failed" }, columns: [...state.columns].reverse() }).catch(error => error.message); }, original);
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(2);
  await page.evaluate(() => window.pending[1].reject(new Error("Source unavailable")));
  expect(await page.evaluate(() => window.failed)).toBe("Source unavailable");
  expect(await page.evaluate(api + ".getState()")).toEqual(original);
});

test("named session views survive reload, restore accepted settings and have an explicit reset", async ({ page }) => {
  const view = definition(); view.stateKey = "session-test"; await openGrid(page, view);
  await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    await grid.setQuery({ search: "Archive" }); grid.setColumnOrder(["date", "size", "name"]); grid.setSelection(["row-1"]);
    grid.saveView("Archives"); grid.destroy();
  });
  await page.reload(); await page.waitForSelector("[data-cx-ready]");
  expect(await page.evaluate(api + ".getSavedViews()")).toEqual(["Archives"]);
  expect((await page.evaluate(api + ".getState()")).selection).toEqual(["row-1"]);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "121");
  await page.locator(".cx-grid-views > summary").click();
  await page.getByLabel("Choose a saved view", { exact: true }).selectOption("Archives");
  await page.locator(".cx-grid-views").getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "61");
  expect(await page.getByRole("columnheader").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn))).toEqual(["date", "size", "name"]);
  await page.locator(".cx-grid-views").getByRole("button", { name: "Remove view", exact: true }).click();
  expect(await page.evaluate(api + ".getSavedViews()")).toEqual([]);
});

test("open grid controls remain accessible in compact dark layouts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await openGrid(page);
  await page.locator("[data-canopyx-host]").evaluate(host => host.setAttribute("data-cx-theme", "dark"));
  for (const selector of [".cx-grid-columns", ".cx-grid-filters", ".cx-grid-views"]) {
    await page.locator(selector + " > summary").click();
    if (selector === ".cx-grid-filters") await page.getByRole("button", { name: "Add filter", exact: true }).click();
    await nextFrames(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const box = await page.locator(selector + " > .cx-grid-panel").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(7); expect(box.x + box.width).toBeLessThanOrEqual(383);
    await page.locator(selector + " > summary").focus(); await page.keyboard.press("Escape");
  }
});
