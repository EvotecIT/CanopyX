import { test, expect } from "@playwright/test";
import { nextFrames, viewPage, openExample, runtimeAssets } from "./support.mjs";
import AxeBuilder from "@axe-core/playwright";

const definition = (rows = []) => ({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  source: { kind: "inline" }, rows, rowHeight: 28, pageSize: 10, selection: "multiple", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 180, sortable: true },
    { id: "size", title: "Size", kind: "number", width: 100, sortable: true },
    { id: "date", title: "Date", kind: "datetime", width: 200, sortable: true }] });

async function openGrid(page, view, setup = "") {
  const html = viewPage(view).replace("</head>", "<script>" + setup + "</script></head>");
  await page.route("http://canopyx.test/grid", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/grid");
}
const ids = page => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id")));
const hostView = () => { const view = definition(); view.source = { kind: "host" }; delete view.rows; return view; };
const hostSource = `window.calls = []; window.activeRequests = 0; window.maxRequests = 0;
CanopyX.configure('inventory', { cachePageLimit: 2, source: { async query(query, {signal}) {
  window.calls.push({query,signal}); window.activeRequests++; window.maxRequests=Math.max(window.maxRequests,window.activeRequests);
  try { await new Promise(resolve=>setTimeout(resolve,10));
    return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'host-v1',offset:query.offset,total:1000000,matched:1000000,
      items:Array.from({length:Math.min(query.limit,1000000-query.offset)},(_,i)=>({id:'row-'+(query.offset+i),cells:{name:'Record '+(query.offset+i),size:query.offset+i}}))};
  } finally { window.activeRequests--; }
}}});`;

test("the C# inventory writer and runtime share typed queries and accessible grid markup", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await openExample(page, "inventory-grid.html");
  await expect(page.getByRole("grid", { name: "File inventory" })).toHaveAttribute("aria-rowcount", "1251");
  expect((await ids(page)).slice(0, 3)).toEqual(["file-4999", "file-4995", "file-4991"]);
  await expect(page.locator('.cx-row[data-cx-id="file-4999"]')).toContainText("4,999 KiB");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await openExample(page, "inventory-grid-dark.html");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("one grid runtime preserves interactive tree contracts on a mixed page", async ({ page }) => {
  const view = definition([{ id: "a", cells: { name: "Flat record", size: 2 } }]);
  const tree = { protocol: "canopyx/2", type: "view", id: "tree", label: "Folders", pageSize: 100,
    selection: "multiple", checkboxes: "independent", source: {kind:"inline"}, columns: [{id:"name",title:"Folder",kind:"text",width:200}],
    roots: [{id:"parent",label:"Parent",children:[{id:"child",label:"Child"}]}] };
  const {script,style} = runtimeAssets("grid");
  const host = value => '<div class="cx-host" data-canopyx-host style="height:300px"><script type="application/json" class="cx-config">'+JSON.stringify(value)+'</script></div>';
  const html = '<!doctype html><html lang="en"><head><title>Mixed views</title><style>'+style+'</style><script>'+script+'</script></head><body>'+host(tree)+host(view)+'</body></html>';
  await page.route("http://canopyx.test/mixed", route => route.fulfill({contentType:"text/html",body:html}));
  await page.goto("http://canopyx.test/mixed"); await expect(page.locator("[data-cx-ready]")).toHaveCount(2);
  const parent = page.locator('.cx-row[data-cx-id="parent"]');
  await parent.focus(); await page.keyboard.press("ArrowRight");
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.cx-row[data-cx-id="child"]')).toHaveAttribute("aria-level", "2");
  await parent.getByRole("checkbox").click();
  await expect(parent.getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "2");
  await expect(page.getByRole("treegrid")).toHaveAttribute("aria-rowcount", "3");
});

test("flat grids sort raw values, keep missing values last and use stable ID ties", async ({ page }) => {
  const view = definition([
    { id: "z", cells: { name: "Z", size: { value: 10, text: "small" }, date: "2026-10-01T23:00:00-02:00" } },
    { id: "missing", cells: { name: "Missing" } },
    { id: "b", cells: { name: "B", size: 10, date: "2026-10-02T00:00:00Z" } },
    { id: "a", cells: { name: "A", size: { value: 2, text: "huge" }, date: "2026-10-02T00:00:00+02:00" } }
  ]);
  view.query = { sort: [{ column: "size", direction: "asc" }] };
  await openGrid(page, view); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
  expect(await ids(page)).toEqual(["a", "b", "z", "missing"]);
  await expect(page.locator('.cx-row[data-cx-id="a"]')).toContainText("huge");
  await page.evaluate(async () => document.querySelector("[data-canopyx-host]").canopyx.sort([{ column: "size", direction: "desc" }]));
  expect(await ids(page)).toEqual(["b", "z", "a", "missing"]);
  await page.evaluate(async () => document.querySelector("[data-canopyx-host]").canopyx.sort([{ column: "date", direction: "asc" }]));
  expect(await ids(page)).toEqual(["a", "b", "z", "missing"]);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
  await expect(page.locator(".cx-row[aria-level],.cx-exp")).toHaveCount(0);
});

test("search and typed filters cover the full inline dataset before the result window", async ({ page }) => {
  const view = definition(Array.from({ length: 500 }, (_, i) => ({ id: "row-" + String(i).padStart(3, "0"),
    cells: { name: "Record " + i, size: { value: i, text: "Display only" } } })));
  await openGrid(page, view); await page.waitForSelector("[data-cx-ready]");
  await page.getByRole("searchbox").fill("Record 499"); await page.getByRole("searchbox").press("Enter");
  await expect(page.locator('.cx-row[data-cx-id="row-499"]')).toBeVisible();
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "2");
  await page.evaluate(async () => document.querySelector("[data-canopyx-host]").canopyx.setQuery({
    filters: [{ column: "size", operator: "ge", values: [497] }, { column: "size", operator: "lt", values: [499] }],
    sort: [{ column: "size", direction: "desc" }]
  }));
  expect(await ids(page)).toEqual(["row-498", "row-497"]);
  await page.evaluate(async () => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "Display only" }));
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "1");
  await expect(page.getByRole("status")).toHaveText("No results");
});

test("headers add multi-column sorting and keyboard navigation follows cells without tree semantics", async ({ page }) => {
  const view = definition([{ id: "a", cells: { name: "Same", size: 2 } }, { id: "b", cells: { name: "Same", size: 1 } }]);
  await openGrid(page, view); await page.waitForSelector("[data-cx-ready]");
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await page.getByRole("button", { name: "Size", exact: true }).click({ modifiers: ["Shift"] });
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().sort)).toEqual([
    { column: "name", direction: "asc" }, { column: "size", direction: "asc" }
  ]);
  expect(await ids(page)).toEqual(["b", "a"]);
  await page.locator('.cx-row[data-cx-id="b"]').focus(); await page.keyboard.press("ArrowRight");
  await expect(page.locator('.cx-row[data-cx-id="b"] .cx-cell').nth(0)).toBeFocused();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
  await expect(page.locator('.cx-row[data-cx-id="a"] .cx-cell').nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getSelection())).toEqual(["a"]);
  await page.keyboard.press("Escape"); await expect(page.locator('.cx-row[data-cx-id="a"]')).toBeFocused();
});

test("a million-row host source keeps a bounded DOM, reloads evicted pages and retains selection IDs", async ({ page }) => {
  await openGrid(page, hostView(), hostSource); await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator('.cx-row[data-cx-id="row-0"]')).toBeVisible();
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setSelection(["row-0"]));
  for (const top of [500000, 1000000, 1500000, 0]) {
    await page.getByRole("grid").evaluate((grid, value) => { grid.scrollTop = value; }, top);
    await nextFrames(page); await page.waitForTimeout(100);
  }
  await expect(page.locator('.cx-row[data-cx-id="row-0"]')).toBeVisible();
  const result = await page.evaluate(() => ({ calls: window.calls.map(call => call.query.offset), max: window.maxRequests,
    ids: document.querySelector("[data-canopyx-host]").canopyx.getSelection() }));
  expect(result.calls.filter(offset => offset === 0).length).toBeGreaterThan(1);
  expect(result.max).toBeLessThanOrEqual(4); expect(result.ids).toEqual(["row-0"]);
  expect(await page.locator(".cx-row").count()).toBeLessThan(100);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "1000001");
  await expect(page.locator('.cx-row[data-cx-id="row-0"]')).toHaveAttribute("aria-selected", "true");
});

test("new queries cancel old requests and reject late responses without replacing the accepted snapshot", async ({ page }) => {
  const setup = `window.pending=[]; CanopyX.configure('inventory',{source:{query(query,{signal}) {
    const response=()=>({protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:query.search||'initial',offset:query.offset,
      total:1,matched:1,items:[{id:query.search||'initial',cells:{name:query.search||'Initial'}}]});
    if (!query.search) return response();
    return new Promise(resolve=>window.pending.push({query,signal,resolve:()=>resolve(response())}));
  }}});`;
  await openGrid(page, hostView(), setup); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => {
    const grid=document.querySelector("[data-canopyx-host]").canopyx;
    window.first=grid.setQuery({search:"older"}).catch(error=>error.name);
    window.second=grid.setQuery({search:"newer"});
  });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(1);
  // The superseded request is cancelled before its host callback starts.
  expect(await page.evaluate(() => window.first)).toBe("AbortError");
  await expect(page.locator('.cx-row[data-cx-id="initial"]')).toBeVisible();
  await page.evaluate(async () => { window.pending[0].resolve(); await window.second; });
  await expect(page.locator('.cx-row[data-cx-id="newer"]')).toBeVisible();
  // Now let a source which ignores cancellation finish after its replacement query.
  await page.evaluate(() => { window.late=document.querySelector("[data-canopyx-host]").canopyx.setQuery({search:"late"}).catch(e=>e.name); });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(2);
  await page.evaluate(() => { window.last=document.querySelector("[data-canopyx-host]").canopyx.setQuery({search:"last"}); });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(3);
  await page.evaluate(async () => { window.pending[2].resolve(); await window.last; window.pending[1].resolve(); await window.late; });
  await nextFrames(page); expect(await ids(page)).toEqual(["last"]);
});

test("initial host failures remain retryable and destroy cancels an uncooperative request", async ({ page }) => {
  const setup = `window.attempt=0; window.signals=[]; CanopyX.configure('inventory',{source:{query(query,{signal}) {
    window.signals.push(signal); if (++window.attempt===1) throw new Error('Temporarily unavailable');
    if (query.search==='wait') return new Promise(()=>{});
    return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'ready',offset:query.offset,total:1,matched:1,
      items:[{id:'one',cells:{name:'One'}}]};
  }}});`;
  await openGrid(page, hostView(), setup);
  await page.getByRole("alert").getByRole("button").click();
  await expect(page.locator('.cx-row[data-cx-id="one"]')).toBeVisible();
  await page.evaluate(() => { window.waiting=document.querySelector("[data-canopyx-host]").canopyx.setQuery({search:"wait"}).catch(e=>e.name); });
  await expect.poll(() => page.evaluate(() => window.signals.length)).toBe(3);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.destroy());
  expect(await page.evaluate(() => window.waiting)).toBe("AbortError");
  expect(await page.evaluate(() => window.signals.every(signal => signal.aborted))).toBe(true);
  await expect(page.getByRole("grid")).toHaveCount(0);
});

test("invalid result windows and revisions cannot replace accepted rows", async ({ page }) => {
  const setup = `CanopyX.configure('inventory',{source:{query(query) {
    return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'v1',offset:query.search?'1':0,total:1,matched:1,
      items:[{id:query.search||'good',cells:{name:query.search||'Good'}}]};
  }}});`;
  await openGrid(page, hostView(), setup); await page.waitForSelector("[data-cx-ready]");
  const error = await page.evaluate(async () => {
    try { await document.querySelector("[data-canopyx-host]").canopyx.setQuery({search:"bad"}); } catch(e) { return e.message; }
  });
  expect(error).toContain("requested window"); expect(await ids(page)).toEqual(["good"]);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-busy", "false");
});

test("text equality and category membership ignore case without treating missing values as unequal", async ({ page }) => {
  const view = definition([
    { id: "a", cells: { name: "Archive" } }, { id: "b", cells: { name: "ARCHIVE" } },
    { id: "c", cells: { name: "Active" } }, { id: "d", cells: {} },
    { id: "e", cells: { name: "Árchive" } }
  ]);
  await openGrid(page, view); await page.waitForSelector("[data-cx-ready]");
  for (const [operator, expected] of [["eq", ["a", "b"]], ["in", ["a", "b"]], ["ne", ["c", "e"]]]) {
    await page.evaluate(async operator => document.querySelector("[data-canopyx-host]").canopyx.setQuery({
      filters: [{ column: "name", operator, values: ["archive"] }]
    }), operator);
    expect(await ids(page)).toEqual(expected);
  }
});

test("rapid header and search changes compose against the pending host query", async ({ page }) => {
  const setup = `window.pending=[]; CanopyX.configure('inventory',{source:{query(query) {
    const response=()=>({protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'v1',offset:query.offset,
      total:1,matched:1,items:[{id:'record',cells:{name:'Record',size:1}}]});
    if (!query.search && !query.sort.length) return response();
    return new Promise(resolve=>window.pending.push({query,resolve:()=>resolve(response())}));
  }}});`;
  await openGrid(page, hostView(), setup); await page.waitForSelector("[data-cx-ready]");
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(1);
  await page.getByRole("button", { name: "Size", exact: true }).click({ modifiers: ["Shift"] });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(2);
  await page.getByRole("searchbox").fill("Record"); await page.getByRole("searchbox").press("Enter");
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(3);
  await page.getByRole("button", { name: "Date", exact: true }).click({ modifiers: ["Shift"] });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(4);
  const sorts = [{ column: "name", direction: "asc" }, { column: "size", direction: "asc" }, { column: "date", direction: "asc" }];
  expect(await page.evaluate(() => window.pending[3].query)).toMatchObject({ search: "Record", sort: sorts });
  // Until the latest result is accepted, public callers and exports still see the previous query.
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery())).toMatchObject({ search: "", sort: [] });
  await page.evaluate(() => window.pending[3].resolve());
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().sort)).toEqual(sorts);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().search)).toBe("Record");
  await page.getByRole("searchbox").fill("Changed"); await page.getByRole("searchbox").press("Enter");
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(5);
  await page.evaluate(() => { window.sorted = document.querySelector("[data-canopyx-host]").canopyx.sort([{ column: "size", direction: "desc" }]).catch(error => error.message); });
  await expect.poll(() => page.evaluate(() => window.pending.length)).toBe(6);
  expect(await page.evaluate(() => window.pending[5].query)).toMatchObject({ search: "Changed", sort: [{ column: "size", direction: "desc" }] });
  await page.evaluate(async () => { window.pending[5].resolve(); await window.sorted; });
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().search)).toBe("Changed");
});

for (const leave of [false, true]) test(`an arriving host page ${leave ? "preserves focus outside the grid" : "keeps keyboard focus on the requested row"}`, async ({ page }) => {
  const setup = `window.pending=[]; CanopyX.configure('inventory',{source:{query(query) {
    const response=()=>({protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'v1',offset:query.offset,
      total:200,matched:200,items:Array.from({length:Math.min(query.limit,200-query.offset)},(_,i)=>
        ({id:'row-'+(query.offset+i),cells:{name:'Record '+(query.offset+i)}}))});
    if (query.offset < 100) return response();
    return new Promise(resolve=>window.pending.push({query,resolve:()=>resolve(response())}));
  }}});`;
  await openGrid(page, hostView(), setup); await page.waitForSelector("[data-cx-ready]");
  await page.locator('.cx-row[data-cx-id="row-0"]').focus(); await page.keyboard.press("Control+End");
  await expect(page.locator('.cx-row[aria-rowindex="201"][data-cx-status="loading"]')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.pending.some(item => item.query.offset === 190))).toBe(true);
  if (leave) await page.evaluate(() => {
    const after = document.body.appendChild(document.createElement("button")); after.id = "after-grid"; after.textContent = "Next action";
  });
  if (leave) { await page.keyboard.press("Tab"); await expect(page.locator("#after-grid")).toBeFocused(); }
  await page.evaluate(() => window.pending.filter(item => item.query.offset >= 170).forEach(item => item.resolve()));
  await expect(page.locator('.cx-row[data-cx-id="row-199"]')).toBeVisible();
  if (leave) await expect(page.locator("#after-grid")).toBeFocused();
  else {
    await expect(page.locator('.cx-row[data-cx-id="row-199"]')).toBeFocused();
    await page.keyboard.press("ArrowUp"); await expect(page.locator('.cx-row[data-cx-id="row-198"]')).toBeFocused();
  }
});

test("keyboard cell navigation reaches every host control and respects controls that own arrows", async ({ page }) => {
  const setup = `CanopyX.configure('inventory',{renderers:{name(row,element) {
    for (const label of ['First','Second']) { const button=element.appendChild(document.createElement('button')); button.textContent=label; }
    const input=element.appendChild(document.createElement('input')); input.setAttribute('aria-label','Record note'); input.value='abc';
  }}});`;
  await openGrid(page, definition([{ id: "one", cells: { name: "One", size: 1 } }]), setup);
  await page.waitForSelector("[data-cx-ready]");
  const row = page.locator('.cx-row[data-cx-id="one"]'), firstCell = row.locator(".cx-cell").nth(0);
  await row.focus(); await page.keyboard.press("F2"); await expect(row.getByRole("button", { name: "First" })).toBeFocused();
  await page.keyboard.press("ArrowRight"); await expect(row.getByRole("button", { name: "Second" })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(row.getByRole("button", { name: "First" })).toBeFocused();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await expect(firstCell).toBeFocused();
  await page.keyboard.press("Enter"); await expect(row.getByRole("textbox", { name: "Record note" })).toBeFocused();
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
  await expect(row.getByRole("textbox", { name: "Record note" })).toBeFocused();
  expect(await row.getByRole("textbox").evaluate(input => input.selectionStart)).toBe(1);
  await page.keyboard.press("Escape"); await expect(firstCell).toBeFocused();
  await page.keyboard.press("ArrowRight"); await expect(row.locator(".cx-cell").nth(1)).toBeFocused();
  await page.keyboard.press("Escape"); await expect(row).toBeFocused();
});
