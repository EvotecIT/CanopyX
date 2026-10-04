import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const definition = (extra = {}) => Object.assign({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  source: { kind: "inline", navigation: "offset" }, rowHeight: 28, pageSize: 7, presentation: "paged", pageLength: 25,
  selection: "multiple", search: true, columns: [{ id: "name", title: "Name", kind: "text", width: 200, sortable: true },
    { id: "amount", title: "Amount", kind: "number", width: 100, sortable: true }],
  query: { sort: [{ column: "amount", direction: "asc" }] },
  rows: Array.from({ length: 137 }, (_, index) => ({ id: "row-" + index, cells: { name: "Row " + index, amount: index } })) }, extra);
const controller = "document.querySelector('[data-canopyx-host]').canopyx";
async function open(page, view, setup = "") {
  await page.route("http://canopyx.test/paging", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("</head>", "<script>" + setup + "</script></head>")
      .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Inventory</h1>').replace("</body>", "</main></body>") }));
  await page.goto("http://canopyx.test/paging"); await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready); await nextFrames(page);
}
const positions = page => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => Number(row.getAttribute("aria-rowindex"))));

test("paging follows full filtering and sorting while exports retain the whole accepted result", async ({ page }) => {
  await open(page, definition());
  await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    await grid.setQuery({ filters: [{ column: "amount", operator: "ge", values: [50] }], sort: [{ column: "amount", direction: "desc" }] });
    grid.setSelection(["row-136", "row-50"]); await grid.goToPage(3);
  });
  await expect(page.locator(".cx-grid-page-range")).toHaveText("76–87 of 87 rows");
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "88");
  await expect(page.locator('.cx-row[data-cx-id="row-61"]')).toBeVisible();
  await expect(page.locator('.cx-row[data-cx-id="row-50"]')).toBeVisible();
  expect(await positions(page)).toEqual(Array.from({ length: 12 }, (_, index) => index + 77));
  const exported = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, ids = [];
    for await (const row of grid.prepareExport({ scope: "filtered" }).rows()) ids.push(row.id);
    return { ids, selection: grid.getSelection(), paging: grid.getPaging() };
  });
  expect(exported.ids).toEqual(Array.from({ length: 87 }, (_, index) => "row-" + (136 - index)));
  expect(exported.selection).toEqual(["row-136", "row-50"]);
  expect(exported.paging.pageIndex).toBe(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("controls handle page length, direct jumps, queued search, reset and empty results", async ({ page }) => {
  await open(page, definition({ searchDelayMs: 5000 }));
  await page.getByRole("button", { name: "Last page", exact: true }).click();
  await expect(page.locator(".cx-grid-page-range")).toHaveText("126–137 of 137 rows");
  await expect(page.getByRole("spinbutton", { name: "Page", exact: true })).toBeFocused();
  await page.getByRole("combobox", { name: "Rows per page", exact: true }).selectOption("50");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("101–137 of 137 rows");
  await page.getByRole("spinbutton", { name: "Page", exact: true }).fill("2");
  await page.getByRole("spinbutton", { name: "Page", exact: true }).press("Enter");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("51–100 of 137 rows");
  await page.getByRole("searchbox").fill("Row 136");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".cx-grid-page-range")).toHaveText("1–1 of 1 rows");
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Row 136");
  await page.evaluate(controller + ".setQuery({search:'missing'})");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("0–0 of 0 rows");
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  expect(await page.evaluate(controller + ".getPaging().pageLength")).toBe(25);
  await expect(page.locator(".cx-grid-page-range")).toHaveText("1–25 of 137 rows");
});

test("keyboard and host position navigation cross page boundaries with global row indices", async ({ page }) => {
  await open(page, definition({ pageLength: 5 }));
  await page.evaluate(controller + ".scrollToRow(4)"); await page.locator('.cx-row[data-cx-id="row-4"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.cx-row[data-cx-id="row-5"]')).toBeFocused();
  await expect(page.locator('.cx-row[data-cx-id="row-5"]')).toHaveAttribute("aria-rowindex", "7");
  await page.keyboard.press("Control+End");
  await expect(page.locator('.cx-row[data-cx-id="row-136"]')).toBeFocused();
  await page.keyboard.press("Control+Home");
  await expect(page.locator('.cx-row[data-cx-id="row-0"]')).toBeFocused();
  await page.getByRole("searchbox").focus();
  await page.evaluate(controller + ".scrollToRow(110)");
  await expect(page.getByRole("searchbox")).toBeFocused();
  expect(await page.evaluate(controller + ".getPaging().pageIndex")).toBe(22);
});

for (const presentation of ["paged", "continuous"]) {
test(`cell navigation retains its column when the destination needs another source window (${presentation})`, async ({ page }) => {
  await open(page, definition({ presentation }));
  await page.evaluate(controller + (presentation === "paged" ? ".goToPage(1)" : ".scrollToRow(25)"));
  await page.locator('.cx-row[data-cx-id="row-25"]').focus();
  await page.keyboard.press("Enter"); await page.keyboard.press("ArrowRight");
  await expect(page.locator('.cx-row[data-cx-id="row-25"]').getByRole("gridcell").nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('.cx-row[data-cx-id="row-24"]').getByRole("gridcell").nth(1)).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(page.locator('.cx-row[data-cx-id="row-136"]').getByRole("gridcell").nth(1)).toBeFocused();
  const target = await page.locator(".cx-grid").evaluate(grid => 136 - Math.max(1,
    Math.floor((grid.clientHeight - grid.querySelector(".cx-head").offsetHeight) / 28)));
  await page.keyboard.press("PageUp");
  await expect(page.locator('.cx-row[data-cx-id="row-' + target + '"]').getByRole("gridcell").nth(1)).toBeFocused();
});

test(`delayed keyboard navigation preserves a later focus choice outside the grid (${presentation})`, async ({ page }) => {
  const view = definition({ presentation, pageSize: 25 }); view.source = { kind: "host" }; delete view.rows;
  await open(page, view, `window.pending=[];CanopyX.configure('inventory',{source:{query(query){
    const result={protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:query.offset,total:137,matched:137,
      items:Array.from({length:Math.min(query.limit,137-query.offset)},(_,i)=>({id:'row-'+(query.offset+i),cells:{name:'Row '+(query.offset+i),amount:query.offset+i}}))};
    return query.offset===25?new Promise(resolve=>pending.push(()=>resolve(result))):result;
  }}});`);
  await page.evaluate(controller + ".scrollToRow(24)");
  await expect(page.locator('.cx-row[data-cx-id="row-24"]')).toBeVisible();
  await page.locator('.cx-row[data-cx-id="row-24"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => pending.length)).toBe(1);
  await page.getByRole("searchbox").focus();
  await page.evaluate(() => pending[0]());
  if (presentation === "paged") await expect(page.locator(".cx-grid-page-range")).toHaveText("26–50 of 137 rows");
  await expect(page.locator('.cx-row[data-cx-id="row-25"]')).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeFocused();
});
}

test("restored page state clamps against a refreshed host count before installing its layout", async ({ page }) => {
  const view = definition(); view.source = { kind: "host", navigation: "offset" }; delete view.rows;
  await open(page, view, `window.count=137;window.revision='r1';window.requests=[];CanopyX.configure('inventory',{source:{navigation:'offset',query(query){
    requests.push(query);return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:window.revision,offset:query.offset,total:count,matched:count,
      items:Array.from({length:Math.min(query.limit,count-query.offset)},(_,i)=>({id:'row-'+(query.offset+i),cells:{name:'Row '+(query.offset+i),amount:query.offset+i}}))};}}});`);
  const state = await page.evaluate(async () => { const grid=document.querySelector("[data-canopyx-host]").canopyx; await grid.goToPage(5);grid.setColumnWidth('name',250);return grid.getState(); });
  await page.evaluate(() => { window.count=35;window.revision='r2'; });
  await page.evaluate(state => document.querySelector("[data-canopyx-host]").canopyx.setState(state), state);
  await expect(page.locator(".cx-grid-page-range")).toHaveText("26–35 of 35 rows");
  expect(await page.evaluate(() => requests.at(-1).offset)).toBeLessThan(35);
  expect(await page.evaluate(controller + ".getState().columns[0].width")).toBe(250);
  expect(await page.evaluate(controller + ".getState().paging")).toEqual({ pageLength: 25, offset: 25 });
  expect(await page.evaluate(controller + ".getQuery().revision")).toBe("r2");
});

test("a superseded page request cannot replace the newer accepted page", async ({ page }) => {
  const view = definition(); view.source = { kind: "host" }; delete view.rows;
  await open(page, view, `window.pending=[];CanopyX.configure('inventory',{source:{query(query,{signal}){
    const result={protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:query.offset,total:137,matched:137,
      items:Array.from({length:Math.min(query.limit,137-query.offset)},(_,i)=>({id:'row-'+(query.offset+i),cells:{name:'Row '+(query.offset+i),amount:query.offset+i}}))};
    return query.offset===25||query.offset===75?new Promise(resolve=>pending.push({offset:query.offset,signal,accept:()=>resolve(result)})):result;
  }}});`);
  await page.evaluate(() => { document.querySelector("[data-canopyx-host]").canopyx.goToPage(1).catch(()=>{}); });
  await expect.poll(() => page.evaluate(() => pending.length)).toBe(1);
  await page.evaluate(() => { document.querySelector("[data-canopyx-host]").canopyx.goToPage(3).catch(()=>{}); });
  await expect.poll(() => page.evaluate(() => pending.length)).toBe(2);
  await page.evaluate(() => pending.find(item=>item.offset===75).accept());
  await expect(page.locator(".cx-grid-page-range")).toHaveText("76–100 of 137 rows");
  await page.evaluate(() => pending.find(item=>item.offset===25).accept()); await nextFrames(page);
  expect(await page.evaluate(controller + ".getPaging().pageIndex")).toBe(3);
  expect(await page.evaluate(() => pending.find(item=>item.offset===25).signal.aborted)).toBe(true);
});

test("offset grids reject cursor-only navigation and unknown result counts", async ({ page }) => {
  await open(page, definition());
  expect(await page.evaluate(() => {
    const view=JSON.parse(document.querySelector('script.cx-config').textContent),host=document.createElement('div');
    document.body.appendChild(host);view.source.navigation='cursor';
    try{CanopyX.createDataGrid(host,{view});return false;}catch{return host.childElementCount===0;}finally{host.remove();}
  })).toBe(true);
  await page.evaluate(controller + ".destroy()");
  await page.evaluate(() => {
    const view=JSON.parse(document.querySelector('script.cx-config').textContent);view.source={kind:'host'};delete view.rows;
    const host=document.querySelector('[data-canopyx-host]');host.canopyx=CanopyX.createDataGrid(host,{view,source:{query(query){return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:0,total:null,matched:null,items:[]};}}});host.canopyx.ready.catch(()=>{});
  });
  await expect(page.getByRole("alert")).toContainText("grid");
});

test("a failed length change retains the accepted page and retry applies the requested length", async ({ page }) => {
  const view=definition();view.source={kind:'host'};delete view.rows;
  await open(page,view,`window.failNext=false;CanopyX.configure('inventory',{source:{query(query){
    if(window.failNext){window.failNext=false;throw new Error('Host unavailable');}
    return {protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:query.offset,total:137,matched:137,
      items:Array.from({length:Math.min(query.limit,137-query.offset)},(_,i)=>({id:'row-'+(query.offset+i),cells:{name:'Row '+(query.offset+i),amount:query.offset+i}}))};
  }}});`);
  await page.evaluate(controller+'.goToPage(5)');
  await page.evaluate(async()=>{window.failNext=true;try{await document.querySelector('[data-canopyx-host]').canopyx.setPageLength(50);}catch{}});
  await expect(page.getByRole('alert')).toContainText('Host unavailable');
  await expect(page.locator('.cx-grid-page-range')).toHaveText('126–137 of 137 rows');
  expect(await page.evaluate(controller+'.getPaging().pageLength')).toBe(25);
  await page.evaluate(controller+'.retry()');
  await expect(page.locator('.cx-grid-page-range')).toHaveText('101–137 of 137 rows');
  expect(await page.evaluate(controller+'.getPaging().pageLength')).toBe(50);
});
