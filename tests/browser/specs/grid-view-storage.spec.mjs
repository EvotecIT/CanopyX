import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage } from "./support.mjs";

const definition = () => ({ protocol: "canopyx/2", type: "grid", id: "prefs", label: "Preference inventory",
  source: { kind: "inline" }, rowHeight: 28, pageSize: 10, presentation: "paged", pageLength: 5,
  selection: "multiple", search: true, stateKey: "report-reader", reporting: { viewStorage: "local", columnReorder: true },
  columns: [{ id: "name", title: "Name", kind: "text", width: 180, sortable: true },
    { id: "amount", title: "Amount", kind: "number", width: 130, sortable: true }],
  rows: Array.from({ length: 40 }, (_, i) => ({ id: "r" + i, cells: { name: i % 2 ? "Archive" : "Source", amount: i } })) });
const api = "document.querySelector('[data-canopyx-host]').canopyx";
async function open(page, view = definition(), setup = "", ready = true) {
  await page.route("http://canopyx.test/preferences", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace("</head>", "<script>" + setup + "</script></head>")
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Preferences</h1>').replace("</body>", "</main></body>") }));
  await page.goto("http://canopyx.test/preferences");
  await page.waitForSelector(ready ? "[data-cx-ready]" : "[data-canopyx-mounted]");
}
const state = (view = definition()) => ({ version: 1, view: view.id, columns: view.columns.map(c => ({ id: c.id, width: c.width, hidden: false, pin: "none" })),
  query: { protocol: "canopyx/2", type: "gridQuery", view: view.id, offset: 0, limit: 10, search: "Archive", sort: [], filters: [] },
  timeZone: "utc", selection: [], scrollTop: 0, paging: { pageLength: 5, offset: 0 } });
const settings = () => ({ version: 1, view: "prefs", current: state(), views: [{ name: "Archives", state: state() }], defaultView: "Archives" });

test("durable named views retain defaults across tabs, rename safely and reset without deleting preferences", async ({ page, context }) => {
  await open(page);
  await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    await grid.setQuery({ search: "Archive" }); grid.setColumnOrder(["amount", "name"]);
    grid.saveView("Archives"); grid.setDefaultView("Archives"); grid.renameSavedView("Archives", "Review");
    await grid.resetView(); grid.saveView("Everything"); await grid.flushViewSettings();
  });
  expect(await page.evaluate(api + ".getDefaultView()")).toBe("Review");
  expect(await page.evaluate(api + ".getQuery().search")).toBe("");
  const other = await context.newPage();
  try {
    await open(other);
    expect(await other.evaluate(api + ".getSavedViews()")).toEqual(["Review", "Everything"]);
    expect(await other.evaluate(api + ".getQuery().search")).toBe("Archive");
    expect(await other.getByRole("columnheader").evaluateAll(cells => cells.map(c => c.dataset.cxColumn))).toEqual(["amount", "name"]);
    expect(await other.evaluate(() => { try { document.querySelector('[data-canopyx-host]').canopyx.renameSavedView("Review", "Everything"); } catch (e) { return e.message; } })).toContain("already exists");
    await other.evaluate(api + ".removeSavedView('Review')");
    expect(await other.evaluate(api + ".getDefaultView()")).toBe(null);
    await other.reload(); await other.waitForSelector("[data-cx-ready]");
    expect(await other.evaluate(api + ".getDefaultView()")).toBe(null);
    expect(await other.evaluate(api + ".getSavedViews()")).toEqual(["Everything"]);
  } finally { await other.close(); }
});

test("versioned and legacy settings adapt added/removed columns while incompatible nested conditions stay rejected", async ({ page }) => {
  const old = state(); old.columns.push({ id: "removed", width: 80, hidden: false });
  old.columns = old.columns.filter(c => c.id !== "amount");
  old.query.sort = [{ column: "removed", direction: "asc" }]; old.query.filters = [{ column: "removed", operator: "eq", values: ["secret"] }];
  const invalid = structuredClone(old); invalid.query.filterGroup = { operator: "or", filters: [{ column: "removed", operator: "eq", values: ["secret"] }], groups: [] };
  const stored = { current: old, views: [{ name: "Old layout", state: old }, { name: "Invalid group", state: invalid }] };
  await open(page, definition(), `localStorage.setItem('cx:grid:report-reader:prefs',${JSON.stringify(JSON.stringify(stored))});`);
  const restored = await page.evaluate(api + ".getState()");
  expect(restored.columns.map(c => c.id)).toEqual(["name", "amount"]); expect(restored.query.sort).toEqual([]); expect(restored.query.filters).toEqual([]);
  expect(await page.evaluate(api + ".getSavedViews()")).toEqual(["Old layout"]);
  await expect(page.locator(".cx-grid-view-storage")).toContainText("incompatible");
});

test("incompatible envelopes, duplicate names and excessive input leave a usable definition with visible feedback", async ({ page }) => {
  for (const input of [{ ...settings(), version: 2 }, { ...settings(), view: "other" },
    { ...settings(), views: [settings().views[0], settings().views[0]] }, { ...settings(), defaultView: "Missing" }]) {
    await open(page, definition(), `localStorage.setItem('cx:grid:report-reader:prefs',${JSON.stringify(JSON.stringify(input))});`);
    expect(await page.evaluate(api + ".getQuery().search")).toBe(""); expect(await page.evaluate(api + ".getSavedViews()")).toEqual([]);
    await expect(page.locator(".cx-grid-view-storage")).not.toHaveText("");
  }
  await open(page, definition(), "localStorage.setItem('cx:grid:report-reader:prefs','x'.repeat(1048577));");
  expect(await page.evaluate(api + ".getQuery().search")).toBe("");
  await expect(page.locator(".cx-grid-view-storage")).toContainText("limit");
  expect(await page.evaluate("localStorage.getItem('cx:grid:report-reader:prefs').length")).toBe(1048577);
  await page.evaluate(api + ".resetView()"); await page.evaluate(api + ".flushViewSettings()");
  await expect(page.locator(".cx-grid-view-storage")).toHaveText("");
  expect(await page.evaluate("JSON.parse(localStorage.getItem('cx:grid:report-reader:prefs')).version")).toBe(1);
});

test("delayed host loading preserves newer query intent and refuses edits before preference loading completes", async ({ page }) => {
  await open(page, definition(), `window.loadSignal=null;CanopyX.configure('prefs',{viewStore:{
    load({signal}){loadSignal=signal;return new Promise(resolve=>window.loadResolve=resolve);},save(){}}});`, false);
  await page.evaluate(api + ".setQuery({search:'Source'})");
  expect(await page.evaluate(() => { try { document.querySelector('[data-canopyx-host]').canopyx.saveView("Early"); } catch (e) { return e.message; } })).toContain("finish loading");
  await page.evaluate(input => loadResolve(input), settings());
  await page.evaluate(api + ".ready");
  expect(await page.evaluate(api + ".getQuery().search")).toBe("Source");
  expect(await page.evaluate(api + ".getSavedViews()")).toEqual(["Archives"]);
  expect(await page.evaluate("loadSignal.aborted")).toBe(true);
});

test("host preference saves are serial, immutable and coalesce waiting changes to the newest envelope", async ({ page }) => {
  await open(page, definition(), `window.saved=[];window.saveResolvers=[];window.activeSaves=0;window.maximumSaves=0;
    CanopyX.configure('prefs',{viewStore:{load(){return null;},save(event){activeSaves++;maximumSaves=Math.max(maximumSaves,activeSaves);
      saved.push({settings:event.settings,signal:event.signal,frozen:Object.isFrozen(event.settings.views)});
      return new Promise(resolve=>saveResolvers.push(()=>{activeSaves--;resolve();}));}}});`);
  await page.evaluate(api + ".saveView('First')");
  await expect.poll(() => page.evaluate("saved.length")).toBe(1);
  await page.evaluate(() => { const grid = document.querySelector('[data-canopyx-host]').canopyx; grid.saveView("Second"); grid.renameSavedView("Second", "Latest"); window.flushed=grid.flushViewSettings(); saveResolvers[0](); });
  await expect.poll(() => page.evaluate("saved.length")).toBe(2);
  expect(await page.evaluate("saved[1].settings.views.map(v=>v.name)")).toEqual(["First", "Latest"]);
  expect(await page.evaluate("maximumSaves")).toBe(1); expect(await page.evaluate("saved.every(s=>s.frozen)")).toBe(true);
  await page.evaluate("saveResolvers[1]()"); await page.evaluate("flushed");
});

test("a timed-out uncooperative save is cancelled and never followed by a concurrent overwrite", async ({ page }) => {
  await open(page, definition(), `window.saved=[];CanopyX.configure('prefs',{requestTimeoutMs:100,viewStore:{load(){return null;},
    save(event){saved.push(event);return new Promise(resolve=>window.lateSave=resolve);}}});`);
  await page.evaluate(api + ".saveView('First')");
  expect(await page.evaluate(api + ".flushViewSettings().catch(e=>e.message)")).toContain("timed out");
  await page.evaluate(api + ".saveView('After timeout')");
  expect(await page.evaluate("saved.length")).toBe(1); expect(await page.evaluate("saved[0].signal.aborted")).toBe(true);
  await page.evaluate("lateSave()"); await page.evaluate(api + ".setQuery({search:'Source'})");
  expect(await page.evaluate("saved.length")).toBe(1); expect(await page.evaluate(api + ".getSavedViews()")).toEqual(["First", "After timeout"]);
  await expect(page.locator(".cx-grid-view-storage")).toContainText("timed out");
});

test("destroy cancels an outstanding load and late responses cannot remount or query the disposed grid", async ({ page }) => {
  await open(page, definition(), `window.loadSignal=null;CanopyX.configure('prefs',{viewStore:{load({signal}){loadSignal=signal;
    return new Promise(resolve=>window.loadResolve=resolve);},save(){}}});`, false);
  await page.evaluate(() => { const grid = document.querySelector('[data-canopyx-host]').canopyx; window.finished=grid.ready.catch(e=>e.name); grid.destroy(); });
  expect(await page.evaluate("finished")).toBe("AbortError"); expect(await page.evaluate("loadSignal.aborted")).toBe(true);
  await page.evaluate(input => loadResolve(input), settings());
  await expect(page.locator("[data-canopyx-mounted]")).toHaveCount(0); await expect(page.getByRole("grid")).toHaveCount(0);
});

test("shareable layout strips query-sensitive values, positions and dataset identity without changing accepted settings", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => { const grid=document.querySelector('[data-canopyx-host]').canopyx;
    await grid.setQuery({search:'Archive',sort:[{column:'amount',direction:'desc'}],filters:[{column:'amount',operator:'ge',values:[5]}],
      filterGroup:{operator:'or',filters:[{column:'name',operator:'eq',values:['Archive']}],groups:[]}});
    grid.setSelection(['r9']); grid.setColumnPinned('name','left'); await grid.goToPage(1); });
  const before = await page.evaluate(api + ".getState()"), shared = await page.evaluate(api + ".getShareState()");
  expect(shared.query.search).toBe(""); expect(shared.query.filters).toEqual([]); expect(shared.query.filterGroup).toBeUndefined();
  expect(shared.query.revision).toBeUndefined(); expect(shared.query.cursor).toBeUndefined(); expect(shared.selection).toEqual([]);
  expect(shared.scrollTop).toBe(0); expect(shared.paging.offset).toBe(0); expect(shared.columns[0].pin).toBe("left");
  expect(shared.query.sort).toEqual(before.query.sort); expect(await page.evaluate(api + ".getState()")).toEqual(before); expect(new URL(page.url()).hash).toBe("");
});

test("saved-view controls expose rename/default/reset and remain keyboard accessible in compact dark layouts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await open(page);
  await page.locator("[data-canopyx-host]").evaluate(host=>host.dataset.cxTheme="dark");
  await page.locator(".cx-grid-views > summary").click(); const panel=page.locator(".cx-grid-views");
  await panel.getByRole("textbox", {name:"View name",exact:true}).fill("Inventory");
  await panel.getByRole("button", {name:"Save view",exact:true}).click();
  await panel.getByRole("button", {name:"Make default",exact:true}).click();
  await expect(panel.locator(".cx-grid-view-default")).toHaveText("Default view: Inventory");
  await panel.getByRole("textbox", {name:"View name",exact:true}).fill("Daily inventory");
  await panel.getByRole("button", {name:"Rename view",exact:true}).click();
  await expect(panel.getByRole("combobox", {name:"Choose a saved view",exact:true})).toHaveValue("Daily inventory");
  await panel.getByRole("button", {name:"Clear default",exact:true}).click();
  await expect(panel.locator(".cx-grid-view-default")).toHaveText("No default view");
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await panel.getByRole("button", {name:"Clear default",exact:true}).focus(); await page.keyboard.press("Escape");
  await expect(panel.locator("summary")).toBeFocused(); await expect(panel).not.toHaveAttribute("open");
});

test("unavailable browser storage reports failure but keeps in-memory named views and query controls usable", async ({ page }) => {
  await open(page, definition(), "Storage.prototype.setItem=function(){throw new Error('Preference storage is unavailable');};");
  await page.evaluate(api + ".saveView('Memory only')");
  expect(await page.evaluate(api + ".flushViewSettings().catch(e=>e.message)")).toContain("unavailable");
  expect(await page.evaluate(api + ".getSavedViews()")).toEqual(["Memory only"]);
  await expect(page.locator(".cx-grid-view-storage")).toContainText("unavailable");
  await page.evaluate(api + ".setQuery({search:'Source'})"); expect(await page.evaluate(api + ".getQuery().search")).toBe("Source");
});

test("flush acknowledges the latest layout even before the automatic preference debounce", async ({ page }) => {
  await open(page, definition(), "window.saved=[];CanopyX.configure('prefs',{viewStore:{load(){return null;},save({settings}){saved.push(settings);}}});");
  await page.evaluate(async () => {const grid=document.querySelector('[data-canopyx-host]').canopyx;grid.setColumnWidth('name',275);await grid.flushViewSettings();grid.destroy();});
  expect(await page.evaluate("saved.at(-1).current.columns.find(c=>c.id==='name').width")).toBe(275);
});
