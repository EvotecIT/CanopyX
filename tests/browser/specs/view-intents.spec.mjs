import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, viewPage } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const intent = (query = {}, extra = {}) => ({ protocol: "canopyx/2", type: "viewIntent", version: 1, view: "intent-grid", query, ...extra });
const predicate = (column, operator, ...values) => ({ column, operator, values });
function view(host = false) {
  return { protocol: "canopyx/2", type: "grid", id: "intent-grid", label: "Inventory", viewIntents: true, stateKey: "intent-test", search: true,
    pageSize: 100, rowHeight: 28, selection: "multiple", source: { kind: host ? "host" : "inline" },
    reporting: { groupable: true },
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true, width: 240 },
      { id: "amount", title: "Amount", kind: "number", sortable: true, width: 160 },
      { id: "date", title: "Date", kind: "datetime", sortable: true, width: 200 },
      { id: "secret", title: "Secret", kind: "text", filterable: false, width: 120 }],
    ...(host ? {} : { rows: Array.from({ length: 5 }, (_, index) => ({ id: "r" + index, cells: { name: "Record " + index, amount: index,
      date: "2026-10-25T00:00:00Z", secret: "private" } })) }) };
}
async function open(page, options = {}) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("http://canopyx.test/intent", route => {
    const definition = view(options.host); if (options.enabled === false) definition.viewIntents = false;
    if (options.reporting === false) delete definition.reporting;
    if (options.modes) { definition.searchHighlight = true; definition.layout = { modes: ["fit", "scroll", "cards"] }; }
    const script = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-view-intents.js"), "utf8");
    const style = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-view-intents.css"), "utf8");
    const configuration = `<script>window.queryCalls=[];window.failQuery=false;window.holdQuery=false;CanopyX.configure('intent-grid',{
      onQuery({query}){queryCalls.push(JSON.parse(JSON.stringify(query)));},
      ${options.host ? `source:{async query(query,{signal}){window.requested=(window.requested||0)+1;
        if(window.holdQuery) await new Promise((resolve,reject)=>{window.releaseQuery=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});});
        if(window.failQuery) throw new Error('Host refused query');return {protocol:'canopyx/2',type:'gridPage',view:'intent-grid',revision:'snapshot-1',offset:query.offset,total:0,matched:0,items:[]};}},` : ""}
    });</script>`;
    return route.fulfill({ contentType: "text/html", body: viewPage(definition).replace("</head>", `<style>${style}</style><script>${script}</script>${configuration}</head>`)
      .replace("</body>", '<div id="preview"></div><button id="outside">Outside</button></body>') });
  });
  await page.goto("http://canopyx.test/intent");
  await page.waitForSelector("[data-cx-ready]"); await page.evaluate(`${api}.ready`);
  return errors;
}
async function preview(page, input) {
  return page.evaluate(async input => {
    window.preview = await document.querySelector("[data-canopyx-host]").canopyx.applyViewIntent(input, document.querySelector("#preview"));
    return { frozen: Object.isFrozen(window.preview.intent), columns: window.preview.intent.columns };
  }, input);
}
const region = page => page.getByRole("region", { name: "Preview view changes", exact: true });
const query = page => page.evaluate(`${api}.getQuery()`);

test("applyViewIntent previews safely, snapshots caller input and applies exactly once from keyboard", async ({ page }) => {
  const errors = await open(page);
  const before = await query(page);
  await page.evaluate(() => { window.input = { protocol: "canopyx/2", type: "viewIntent", version: 1, view: "intent-grid",
    query: { filters: [{ column: "amount", operator: "ge", values: [3] }], sort: [{ column: "amount", direction: "desc" }] }, columns: ["amount", "name"] }; });
  await page.evaluate(`(async()=>{window.preview = await ${api}.applyViewIntent(window.input, document.querySelector('#preview')); window.input.query.filters[0].values[0] = 100; window.input.columns[0] = 'secret';})()`);
  await expect(region(page)).toContainText("Amount ≥ 3");
  await expect(region(page)).toContainText("Columns: Amount, Name");
  expect(await query(page)).toEqual(before);
  expect(await page.evaluate("queryCalls.length")).toBe(1);
  expect(await page.evaluate("Object.isFrozen(preview.intent.query.filters[0].values)")).toBe(true);
  const apply = region(page).getByRole("button", { name: "Apply", exact: true }); await apply.focus(); await apply.press("Enter");
  await expect(region(page).getByRole("status")).toHaveText("View changes applied.");
  expect((await query(page)).filters).toEqual([predicate("amount", "ge", 3)]);
  expect(await page.evaluate(`${api}.getState().columns.filter(column=>!column.hidden).map(column=>column.id)`)).toEqual(["amount", "name"]);
  expect(await page.evaluate("queryCalls.length")).toBe(2);
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
  expect(await page.locator('.cx-row[data-cx-id]').evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id")))).toEqual(["r4", "r3"]);
  expect(errors).toEqual([]);
});

test("preview and cancel perform no host query and never change saved preferences", async ({ page }) => {
  await open(page, { host: true });
  // Let the accepted initial query's existing autosave finish before measuring preview/cancel effects.
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem("cx:grid:intent-test:intent-grid"))).not.toBeNull();
  const before = await page.evaluate(`({query:${api}.getQuery(),storage:sessionStorage.getItem('cx:grid:intent-test:intent-grid'),requests:window.requested})`);
  await preview(page, intent({ search: "sensitive search" }));
  expect(await page.evaluate("window.requested")).toBe(before.requests);
  expect(await query(page)).toEqual(before.query);
  await region(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(region(page)).toHaveCount(0);
  expect(await page.evaluate("window.requested")).toBe(before.requests);
  expect(await page.evaluate("sessionStorage.getItem('cx:grid:intent-test:intent-grid')")).toBe(before.storage);
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
});

test("unknown columns, operators and executable fields fail before preview UI or queries", async ({ page }) => {
  await open(page);
  const failures = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const base = { protocol: "canopyx/2", type: "viewIntent", version: 1, view: "intent-grid" };
    const cases = [ { query: { sort: [{ column: "missing", direction: "asc" }] } },
      { query: { filters: [{ column: "missing", operator: "eq", values: [1] }] } },
      { query: { filters: [{ column: "name", operator: "execute", values: ["code"] }] } },
      { query: { filters: [{ column: "secret", operator: "eq", values: ["private"] }] } },
      { query: { filters: [{ column: "date", operator: "eq", values: ["2026-02-30T00:00:00Z"] }] } },
      { columns: ["name", "missing"] }, { columns: ["name", "name"] }, { columns: [] },
      { query: { search: "x", endpoint: "/write" } }, { query: { search: "x", limit: 1 } },
      { query: { groupBy: [{ column: "missing", direction: "asc" }] } }, { query: {}, allow_write: true },
      { query: { search: "x", filterGroup: { operator: "and", filters: [], groups: [] } } },
      { query: { search: "x", sort: [{ column: "name", direction: "asc", code: "alert()" }] } } ];
    const failed = [];
    for (const item of cases) { try { await grid.applyViewIntent({ ...base, ...item }); failed.push(false); } catch { failed.push(true); } }
    return failed;
  });
  expect(failures.every(Boolean)).toBe(true);
  await expect(region(page)).toHaveCount(0);
  expect(await page.evaluate("queryCalls.length")).toBe(1);
});

test("new previews, accepted query changes and column changes supersede old one-shot handles", async ({ page }) => {
  await open(page);
  await preview(page, intent({ search: "Record" })); await page.evaluate("window.old=window.preview");
  await preview(page, intent({ filters: [predicate("amount", "ge", 2)] }));
  expect(await page.evaluate("old.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
  await page.evaluate(`${api}.setColumnVisible('date',false)`);
  await expect(region(page).getByRole("button", { name: "Apply", exact: true }).last()).toBeDisabled();
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
  await preview(page, intent({ search: "Record" }));
  await page.evaluate(`${api}.setQuery({search:'Record 1'})`);
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
  expect((await query(page)).search).toBe("Record 1");
});

test("destroy retires the preview and a failed host apply preserves the accepted query and columns", async ({ page }) => {
  await open(page, { host: true });
  const before = await page.evaluate(`${api}.getState()`);
  await preview(page, intent({ search: "rejected" }, { columns: ["name"] }));
  await page.evaluate("window.failQuery=true");
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.message)")).toBe("Host refused query");
  expect((await query(page)).search).toBe(before.query.search);
  expect(await page.evaluate(`${api}.getState().columns`)).toEqual(before.columns);
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
  await page.evaluate("window.failQuery=false");
  await preview(page, intent({ search: "new" }));
  await page.evaluate(`${api}.destroy()`);
  await expect(region(page)).toHaveCount(0);
  expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
});

test("superseding an in-flight apply aborts its host request and cannot install stale presentation", async ({ page }) => {
  await open(page, { host: true });
  const columns = await page.evaluate(`${api}.getState().columns`);
  await preview(page, intent({ search: "old" }, { columns: ["name"] }));
  await page.evaluate(() => { window.holdQuery=true;window.applying=window.preview.apply().then(()=> "accepted",error=>error.name); });
  await expect.poll(() => page.evaluate("window.requested")).toBe(2);
  await page.evaluate(`(async()=>{window.holdQuery=false;await ${api}.setQuery({search:'current'});})()`);
  expect(await page.evaluate("window.applying")).toBe("AbortError");
  expect((await query(page)).search).toBe("current");
  expect(await page.evaluate(`${api}.getState().columns`)).toEqual(columns);
});

for (const reporting of [false, true]) {
  const kind = reporting ? "reporting" : "ordinary";
  for (const preference of ["order-visibility-pin", "width-timezone", "layout-highlight"]) test(`${kind} grid preserves newer ${preference} while an intent query is pending`, async ({ page }) => {
    const errors = await open(page, { host: true, reporting, modes: preference === "layout-highlight" });
    await preview(page, intent({ search: "proposal" }, { columns: ["amount", "name"] }));
    await page.evaluate(() => {
      window.holdQuery = true;
      window.applying = window.preview.apply().then(() => "accepted", error => error.name);
    });
    await expect.poll(() => page.evaluate("window.requested")).toBe(2);
    const newer = await page.evaluate(async preference => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx;
      if (preference === "order-visibility-pin") {
        grid.setColumnOrder(["date", "name", "amount", "secret"]);
        grid.setColumnVisible("date", false);
        grid.setColumnPinned("amount", "right");
      } else if (preference === "width-timezone") {
        grid.setColumnWidth("date", 333);
        grid.setTimeZone("local");
      } else {
        await grid.setSearchHighlight(false);
        await grid.setLayout({ mode: "scroll", density: "comfortable" });
      }
      const state = grid.getState();
      return { columns: state.columns, timeZone: state.timeZone, layout: state.layout, highlight: state.highlight };
    }, preference);
    await page.evaluate(() => { window.holdQuery = false; window.releaseQuery(); });
    expect(await page.evaluate("window.applying")).toBe("AbortError");
    expect(await page.evaluate(`${api}.getState().columns`)).toEqual(newer.columns);
    expect(await page.evaluate(`${api}.getState().timeZone`)).toBe(newer.timeZone);
    if (preference === "layout-highlight") {
      expect(await page.evaluate(`${api}.getState().layout`)).toEqual(newer.layout);
      expect(await page.evaluate(`${api}.getState().highlight`)).toBe(false);
    }
    expect((await query(page)).search).toBe("proposal");
    expect(await page.evaluate("window.requested")).toBe(2);
    expect(await page.evaluate("preview.apply().then(()=>false,error=>error.name)")).toBe("AbortError");
    await expect(region(page).getByRole("status")).toHaveText("The view changed. Preview the proposal again.");
    expect(errors).toEqual([]);
  });

  test(`${kind} grid still applies an unchanged presentation after a held host query`, async ({ page }) => {
    await open(page, { host: true, reporting });
    await preview(page, intent({ search: "proposal" }, { columns: ["amount", "name"] }));
    await page.evaluate(() => {
      window.holdQuery = true;
      window.applying = window.preview.apply().then(() => "accepted", error => error.name);
    });
    await expect.poll(() => page.evaluate("window.requested")).toBe(2);
    await page.evaluate(() => { window.holdQuery = false; window.releaseQuery(); });
    expect(await page.evaluate("window.applying")).toBe("accepted");
    expect(await page.evaluate(`${api}.getState().columns.filter(column=>!column.hidden).map(column=>column.id)`)).toEqual(["amount", "name"]);
    expect((await query(page)).search).toBe("proposal");
    expect(await page.evaluate("window.requested")).toBe(2);
  });
}

test("reporting preference epoch rejects a pending intent even when the reader returns to the original timezone", async ({ page }) => {
  await open(page, { host: true });
  const before = await page.evaluate(`${api}.getState()`);
  await preview(page, intent({ search: "proposal" }, { columns: ["amount", "name"] }));
  await page.evaluate(() => {
    window.holdQuery = true;
    window.applying = window.preview.apply().then(() => "accepted", error => error.name);
  });
  await expect.poll(() => page.evaluate("window.requested")).toBe(2);
  await page.evaluate(() => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    grid.setTimeZone("local"); grid.setTimeZone("utc");
    window.holdQuery = false; window.releaseQuery();
  });
  expect(await page.evaluate("window.applying")).toBe("AbortError");
  expect(await page.evaluate(`${api}.getState().columns`)).toEqual(before.columns);
  expect(await page.evaluate(`${api}.getState().timeZone`)).toBe(before.timeZone);
});

test("accepted state export roundtrips grouped filters and visibility without cursor, revision or selection", async ({ page }) => {
  await open(page);
  const input = intent({ search: "Record", searchMode: "words", filters: [],
    filterGroup: { operator: "or", filters: [predicate("amount", "ge", 3), predicate("amount", "eq", 1)], groups: [] },
    groupBy: [{ column: "name", direction: "desc" }] }, { columns: ["amount", "name"] });
  await preview(page, input); await page.evaluate("preview.apply()");
  const exported = await page.evaluate(`${api}.getViewIntent()`);
  expect(exported.query.filterGroup).toEqual(input.query.filterGroup);
  expect(exported.query.groupBy).toEqual(input.query.groupBy);
  expect(exported.columns).toEqual(input.columns);
  expect(Object.keys(exported.query).sort()).toEqual(["filterGroup", "filters", "groupBy", "search", "searchMode", "sort"]);
  await page.evaluate(`${api}.resetView()`);
  await preview(page, exported); await page.evaluate("preview.apply()");
  expect(await page.evaluate(`${api}.getViewIntent()`)).toEqual(exported);
});

test("bounded JSON data rejects accessors, nonfinite values, cyclic objects and oversized proposals", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const base = { protocol: "canopyx/2", type: "viewIntent", version: 1, view: "intent-grid" };
    const cycle = {}; cycle.child = cycle; window.getterCalled=false;
    const getter = Object.defineProperty({}, "search", { enumerable: true, get(){window.getterCalled=true;return "x";} });
    const cases = [{query:getter}, {query:{filters:[{column:"amount",operator:"eq",values:[NaN]}]}}, {query:cycle}, {query:{search:"x".repeat(65537)}},
      {query:{search:"x",sort:undefined}}, {query:{search:new Date()}}];
    const rejected = await Promise.all(cases.map(async item => {try{await grid.validateViewIntent({...base,...item});return false;}catch{return true;}}));
    return rejected.every(Boolean) && !window.getterCalled;
  })).toBe(true);
  expect(await page.evaluate("queryCalls.length")).toBe(1);
});

test("group budgets include inherited accepted predicates and reject before preview", async ({ page }) => {
  await open(page);
  const group = { operator: "and", filters: [predicate("name", "isNotNull")], groups: [] };
  await page.evaluate(input => document.querySelector("[data-canopyx-host]").canopyx.setQuery(input), { filterGroup: group });
  const calls = await page.evaluate("queryCalls.length");
  const filters = Array.from({ length: 64 }, () => predicate("amount", "ge", 0));
  expect(await page.evaluate(async input => {
    try { await document.querySelector("[data-canopyx-host]").canopyx.applyViewIntent(input); return false; } catch { return true; }
  }, intent({ filters }))).toBe(true);
  await expect(region(page)).toHaveCount(0); expect(await page.evaluate("queryCalls.length")).toBe(calls);
  await preview(page, intent({ filters, filterGroup: null }));
  await page.evaluate("preview.apply()");
  expect((await query(page)).filters).toHaveLength(64); expect((await query(page)).filterGroup).toBeUndefined();
});

test("view intents require explicit opt-in and read-only validation never starts a query", async ({ page }) => {
  await open(page, { enabled: false });
  expect(await page.evaluate(async input => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    try { await grid.applyViewIntent(input); return false; } catch { return true; }
  }, intent({ search: "x" }))).toBe(true);
  expect(await page.evaluate("queryCalls.length")).toBe(1);
  await expect(region(page)).toHaveCount(0);
});

for (const width of [1280, 390]) test(`preview chips wrap long untrusted text and preserve outside focus at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const errors = await open(page);
  if (width === 390) await page.evaluate(() => { document.querySelector("[data-canopyx-host]").dataset.cxTheme = "dark"; });
  await page.locator("#outside").focus();
  await preview(page, intent({ search: '<img src=x onerror="window.injected=true">' + "Longword".repeat(24) }));
  await expect(region(page)).toContainText("<img src=x");
  await expect(region(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate("window.injected === true")).toBe(false);
  await expect(page.locator("#outside")).toBeFocused();
  expect(await region(page).evaluate(element => {
    const original = getComputedStyle(document.querySelector("[data-canopyx-host]")), preview = getComputedStyle(element);
    return preview.backgroundColor === original.backgroundColor && preview.color === original.color && preview.fontFamily === original.fontFamily;
  })).toBe(true);
  const geometry = await region(page).evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, height: element.getBoundingClientRect().height,
    page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1); expect(geometry.height).toBeGreaterThan(90);
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1);
  await page.screenshot({ path: test.info().outputPath(`view-intent-${width}.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test("exporting a view intent waits for a settled accepted host query", async ({ page }) => {
  await open(page, { host: true });
  await page.evaluate(() => {
    window.holdQuery = true;
    window.pendingExportQuery = document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "new" });
  });
  await expect.poll(() => page.evaluate("window.requested")).toBe(2);
  expect(await page.evaluate(async () => {
    try { await document.querySelector("[data-canopyx-host]").canopyx.getViewIntent(); return false; } catch { return true; }
  })).toBe(true);
  await page.evaluate(async () => { window.holdQuery = false; window.releaseQuery(); await window.pendingExportQuery; });
  expect((await page.evaluate(`${api}.getViewIntent()`)).query.search).toBe("new");
});
