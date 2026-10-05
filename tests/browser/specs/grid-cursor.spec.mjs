import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const definition = { protocol: "canopyx/2", type: "grid", id: "cursor", label: "Cursor inventory",
  source: { kind: "host", navigation: "cursor" }, rowHeight: 28, pageSize: 7, presentation: "paged", pageLength: 5,
  selection: "multiple", search: true, searchDelayMs: 5000,
  columns: [{ id: "name", title: "Name", kind: "text", width: 210, sortable: true },
    { id: "amount", title: "Amount", kind: "number", width: 110, sortable: true }] };

const source = `window.calls=[];window.pending=[];window.hold=false;window.failure=null;
CanopyX.configure('cursor',{source:{navigation:'cursor',query(query,{signal}) {
  calls.push({query,signal});
  let rows=Array.from({length:13},(_,i)=>({id:'row-'+i,cells:{name:'Row '+i,amount:i}}));
  rows=rows.filter(row=>(!query.search||row.cells.name.includes(query.search))&&query.filters.every(f=>
    f.column==='amount'&&f.operator==='ge'&&row.cells.amount>=f.values[0]));
  if(query.sort[0]?.direction==='desc') rows.reverse();
  const shape=JSON.stringify([query.search,query.filters,query.sort,query.limit]);
  const token=offset=>JSON.stringify({shape,offset,revision:'r1'});
  const position=query.cursor?JSON.parse(query.cursor):{offset:0};
  if(query.cursor&&(position.shape!==shape||position.revision!==query.revision)) throw new Error('Invalid host cursor');
  const offset=position.offset,items=rows.slice(offset,offset+query.limit);
  const result={protocol:'canopyx/2',type:'gridCursorPage',view:'cursor',revision:'r1',offset,
    total:(window.totalKnown??window.known)?13:null,matched:(window.matchedKnown??window.known)?rows.length:null,items};
  if(offset+items.length<rows.length) result.nextCursor=token(offset+items.length);
  if(offset) result.previousCursor=token(Math.max(0,offset-query.limit));
  if(window.failure==='revision') result.revision='r2';
  if(window.failure==='offset') result.offset++;
  if(window.failure==='identity'&&offset) result.items[0]={id:'row-0',cells:{name:'Repeated',amount:0}};
  if(window.failure==='count') result.matched=99;
  if(window.failure==='token') result.nextCursor=query.cursor;
  if(window.failure==='transport') throw new Error('Host unavailable');
  if(window.failure==='truncated'&&offset+query.limit>=rows.length) {result.items=items.slice(0,-1);delete result.nextCursor;}
  return hold&&offset?new Promise(resolve=>pending.push({signal,accept:()=>resolve(result)})):result;
}}});`;

async function open(page, known = false, extra = "") {
  await page.route("http://canopyx.test/cursor", route => route.fulfill({ contentType: "text/html",
    body: viewPage(definition).replace("</head>", `<script>window.known=${known};${source}${extra}</script></head>`)
      .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Cursor inventory</h1>').replace("</body>", "</main></body>") }));
  await page.goto("http://canopyx.test/cursor");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready); await nextFrames(page);
}
const controller = "document.querySelector('[data-canopyx-host]').canopyx";

for (const known of [false, true]) test(`cursor controls preserve actual positions with ${known ? "known" : "unknown"} counts`, async ({ page }) => {
  await open(page, known);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", known ? "14" : "-1");
  await expect(page.getByRole("button", { name: "First page", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  expect(await page.getByRole("spinbutton", { name: "Page", exact: true }).count()).toBe(0);
  expect(await page.getByRole("button", { name: "Last page", exact: true }).count()).toBe(0);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator('.cx-row[data-cx-id="row-5"]')).toHaveAttribute("aria-rowindex", "7");
  const paging = await page.evaluate(controller + ".getPaging()");
  expect(paging).toMatchObject({ pageIndex: null, pageCount: null, first: 6, last: 10, matched: known ? 13 : null, hasPrevious: true });
  await page.evaluate(controller + ".nextPage()");
  await expect(page.locator(".cx-grid-page-range")).toHaveText(known ? "11–13 of 13 rows" : "Rows 11–13");
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
  await page.evaluate(controller + ".previousPage()");
  expect((await page.evaluate(controller + ".getPaging()")).first).toBe(6);
  await page.evaluate(controller + ".firstPage()");
  expect((await page.evaluate(controller + ".getPaging()")).first).toBe(1);
  expect(await page.evaluate(() => calls.every(call => !Object.hasOwn(call.query, "offset") && call.query.type === "gridCursorQuery"))).toBe(true);
  if (!known) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("cursor record keys and position API stay inside the accepted page without pretending random access", async ({ page }) => {
  await open(page); await page.evaluate(controller + ".nextPage()");
  await page.locator('.cx-row[data-cx-id="row-5"]').focus();
  await page.keyboard.press("ArrowUp"); await expect(page.locator('.cx-row[data-cx-id="row-5"]')).toBeFocused();
  await page.keyboard.press("Control+End"); await expect(page.locator('.cx-row[data-cx-id="row-9"]')).toBeFocused();
  await page.keyboard.press("ArrowDown"); await expect(page.locator('.cx-row[data-cx-id="row-9"]')).toBeFocused();
  await page.keyboard.press("Control+Home"); await expect(page.locator('.cx-row[data-cx-id="row-5"]')).toBeFocused();
  const errors = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx, results = [];
    for (const run of [() => grid.goToPage(2), () => grid.scrollToRow(12), () => grid.setQuery({ offset: 5 }),
      () => grid.setQuery({ cursor: "without-revision" })]) {
      try { await run(); results.push(null); } catch (error) { results.push(error.message); }
    }
    return results;
  });
  expect(errors.every(Boolean)).toBe(true); expect(await page.evaluate(() => calls.length)).toBe(2);
});

test("new criteria, queued search, page length and saved views clear traversal tokens", async ({ page }) => {
  await open(page); await page.evaluate(controller + ".nextPage()");
  const state = await page.evaluate(controller + ".getState()");
  expect(state.query.cursor).toBeUndefined(); expect(state.query.revision).toBeUndefined();
  expect(state.query.offset).toBeUndefined(); expect(state.paging.offset).toBe(0);
  await page.getByRole("searchbox").fill("Row 1");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Rows 1–4");
  expect(await page.evaluate(controller + ".getQuery().cursor")).toBeUndefined();
  await page.evaluate(controller + ".setState(" + JSON.stringify(state) + ")");
  expect((await page.evaluate(controller + ".getPaging()")).first).toBe(1);
  await page.evaluate(controller + ".nextPage()"); await page.evaluate(controller + ".setPageLength(25)");
  expect((await page.evaluate(controller + ".getPaging()")).last).toBe(13);
  expect(await page.evaluate(() => calls.at(-1).query.limit)).toBe(25);
  await page.evaluate(controller + ".setQuery({search:'absent'})");
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Rows 0–0");
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
});

test("unknown-count exports replay the captured revision and scope independently of the visible page", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    await grid.setQuery({ filters: [{ column: "amount", operator: "ge", values: [3] }], sort: [{ column: "amount", direction: "desc" }] });
    await grid.nextPage(); grid.setSelection(["row-0", "row-12"]);
    const captured = grid.prepareExport({ scope: "filtered" }); await grid.setQuery({ search: "Row 1" });
    const ids = async exported => { const rows = []; for await (const row of exported.rows()) rows.push(row.id); return rows; };
    return { filtered: await ids(captured), selected: await ids(grid.prepareExport({ scope: "selected" })),
      all: await ids(grid.prepareExport({ scope: "all" })), request: captured.request };
  });
  expect(result.filtered).toEqual(Array.from({ length: 10 }, (_, i) => "row-" + (12 - i)));
  expect(result.selected).toEqual(["row-0", "row-12"]);
  expect(result.all).toEqual(Array.from({ length: 13 }, (_, i) => "row-" + i));
  expect(result.request.query.cursor).toBeUndefined(); expect(result.request.matched).toBeNull();
  const error = await page.evaluate(async () => {
    try { await document.querySelector('[data-canopyx-host]').canopyx.toCsv({ scope: "all", maxRows: 12 }); }
    catch (error) { return error.message; }
  });
  expect(error).toContain("client row limit");
});

for (const totalKnown of [false, true]) for (const matchedKnown of [false, true])
test(`cursor export scopes support independently nullable counts: total ${totalKnown}, matched ${matchedKnown}`, async ({ page }) => {
  await open(page, false, `window.totalKnown=${totalKnown};window.matchedKnown=${matchedKnown};`);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    await grid.setQuery({ filters: [{ column: "amount", operator: "ge", values: [10] }] });
    grid.setSelection(["row-11"]);
    const scopes = {};
    for (const scope of ["filtered", "all", "selected"]) {
      const exported = grid.prepareExport({ scope }), ids = [];
      for await (const row of exported.rows()) ids.push(row.id);
      scopes[scope] = { ids, request: exported.request, csv: await grid.toCsv({ scope, values: "raw" }) };
    }
    return { scopes, paging: grid.getPaging() };
  });
  expect(result.scopes.filtered.ids).toEqual(["row-10", "row-11", "row-12"]);
  expect(result.scopes.all.ids).toEqual(Array.from({ length: 13 }, (_, i) => "row-" + i));
  expect(result.scopes.selected.ids).toEqual(["row-11"]);
  for (const [scope, value] of Object.entries(result.scopes)) {
    expect(value.request.total).toBe(totalKnown ? 13 : null);
    expect(value.request.matched).toBe(matchedKnown ? 3 : null);
    expect(value.csv.trim().split("\r\n")).toHaveLength(value.ids.length + 1);
    if (scope === "selected") expect(value.csv).toContain("Row 11,11");
  }
  expect(result.paging.matched).toBe(matchedKnown ? 3 : null);
});

test("a known-total cursor export rejects premature traversal completion with an unknown matched count", async ({ page }) => {
  await open(page, false, "window.totalKnown=true;window.matchedKnown=false;");
  const errors = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    grid.setSelection(["row-11"]); window.failure = "truncated";
    const errors = [];
    for (const scope of ["all", "selected"]) {
      try { await grid.toCsv({ scope }); errors.push(null); } catch (error) { errors.push(error.message); }
    }
    return errors;
  });
  expect(errors).toHaveLength(2);for(const error of errors)expect(error).toMatch(/incomplete.*cursor export/);
});

test("repeated cursor commands coalesce; changed query and destruction settle uncooperative sources", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx; hold = true;
    window.first = grid.nextPage().catch(error => error.name); window.same = grid.nextPage().catch(error => error.name);
  });
  expect(await page.evaluate(() => pending.length)).toBe(1);
  await page.evaluate(controller + ".setQuery({search:'Row 1'})");
  expect(await page.evaluate(() => Promise.all([first, same]))).toEqual(["AbortError", "AbortError"]);
  await page.evaluate(() => pending[0].accept());
  expect((await page.evaluate(controller + ".getPaging()")).last).toBe(4);
  await page.evaluate(controller + ".setQuery({})");
  await page.evaluate(() => { const grid = document.querySelector('[data-canopyx-host]').canopyx;
    window.dead = grid.nextPage().catch(error => error.name); grid.destroy(); });
  expect(await page.evaluate(() => dead)).toBe("AbortError");
});

for (const failure of ["revision", "offset", "identity", "count", "token", "transport"])
test(`invalid ${failure} cursor response retains the accepted page and permits retry`, async ({ page }) => {
  await open(page);
  const error = await page.evaluate(async failure => {
    window.failure = failure;
    try { await document.querySelector('[data-canopyx-host]').canopyx.nextPage(); } catch (error) { return error.message; }
  }, failure);
  expect(error).toBeTruthy();
  expect((await page.evaluate(controller + ".getPaging()")).first).toBe(1);
  await expect(page.locator('.cx-row[data-cx-id="row-0"]')).toBeVisible();
  await page.evaluate(() => { window.failure = null; }); await page.evaluate(controller + ".retry()");
  expect((await page.evaluate(controller + ".getPaging()")).first).toBe(6);
});
