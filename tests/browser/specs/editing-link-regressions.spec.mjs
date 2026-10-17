// Public editing and linked-view regressions exposed by the combined roadmap integration.
import { test, expect } from "@playwright/test";
import { serveGrid, read, cell } from "./editing-support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const condition = value => ({ column: "site", operator: "eq", values: [value] });
function view(extra = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "assets", label: "Records", pageSize: 50, selection: "multiple", search: true,
    source: { kind: "inline" }, columns: [
      { id: "name", title: "Name", kind: "text", width: 200, sortable: true, editable: true },
      { id: "cost", title: "Cost", kind: "number", width: 120, sortable: true, editable: true },
      { id: "owner", title: "Owner", kind: "text", width: 180, editable: true, editor: { type: "lookup", lookup: { limit: 2 } } },
      { id: "site", title: "Site", kind: "text", width: 120, sortable: true } ],
    rows: [
      { id: "a0", cells: { name: "Alpha", cost: 1, owner: "Ada", site: "Berlin" } },
      { id: "a1", cells: { name: "Beta", cost: 2, owner: "Ann", site: "Berlin" } },
      { id: "a2", cells: { name: "Gamma", cost: 3, owner: "Bob", site: "Madrid" } } ], ...extra };
}
function plain(extra = {}) {
  const result = view(extra);
  result.columns = result.columns.map(({ editable, editor, ...column }) => column);
  return result;
}
test.beforeEach(({ page }) => { page.pageErrors = []; page.on("pageerror", error => page.pageErrors.push(error.message)); });
test.afterEach(({ page }) => { expect(page.pageErrors).toEqual([]); });

for (const lang of ["ar-EG", "fa-IR"]) test(`number editing accepts locale numerals and directional signs (${lang})`, async ({ page }) => {
  const data = view(); data.rows[0].cells.cost = -123.4;
  await serveGrid(page, { view: data, lang });
  await page.evaluate(`${api}.beginEdit('a0','cost')`);
  expect(await page.evaluate(`${api}.endEdit()`)).toBe(true);
  expect(await page.evaluate(`${api}.getChanges()`)).toEqual([]);
  await page.evaluate(`${api}.beginEdit('a0','cost')`);
  const text = await page.evaluate(lang => new Intl.NumberFormat(lang).format(-345.6), lang);
  await cell(page, "a0", 1).locator("input").fill(text);
  expect(await page.evaluate(`${api}.endEdit()`)).toBe(true);
  expect((await page.evaluate(`${api}.getChanges()`))[0].values.cost).toBe(-345.6);
});

for (const [editor, value] of [["date", "2026-10-15"], ["time", "13:45"], ["datetime", "2026-10-15T13:45"]])
  test(`untouched native ${editor} input preserves legacy text until the reader changes it`, async ({ page }) => {
    const data = view(); data.columns[0].editor = editor; data.rows[0].cells.name = "legacy date text";
    await serveGrid(page, { view: data });
    await page.evaluate(`${api}.beginEdit('a0','name')`);
    const input = cell(page, "a0", 0).locator("input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("type", editor === "datetime" ? "datetime-local" : editor);
    expect(await page.evaluate(`${api}.endEdit()`)).toBe(true);
    await expect(cell(page, "a0", 0)).toHaveText("legacy date text");
    expect(await page.evaluate(`${api}.view.rows[0].cells.name`)).toBe("legacy date text");
    expect(await page.evaluate(`${api}.getChanges()`)).toEqual([]);
    await page.evaluate(`${api}.beginEdit('a0','name')`);
    await cell(page, "a0", 0).locator("input").fill(value);
    expect(await page.evaluate(`${api}.endEdit()`)).toBe(true);
    expect((await page.evaluate(`${api}.getChanges()`))[0].values.name).toBe(value);
  });

test("typing to start a lookup clears the prior choice and searches before accepting a value", async ({ page }) => {
  await serveGrid(page, { view: view(), script: `window.lookups=[]; CanopyX.configure('assets',{editing:{lookups:{owner:request=>{
    lookups.push(request.search);return [{value:'Zoe',label:'Zoe'}];}}}});` });
  await page.evaluate(`${api}.beginEdit('a0','owner',{initial:'Z'})`);
  expect(await page.evaluate(`${api}.endEdit()`)).toBe(false);
  expect(await page.evaluate(`${api}.getChanges()`)).toEqual([]);
  await expect(page.getByRole("option", { name: "Zoe" })).toBeVisible();
  expect(await page.evaluate(() => window.lookups)).toEqual(["Z"]);
  await page.getByRole("option", { name: "Zoe" }).click();
  await page.evaluate(`${api}.endEdit()`);
  expect((await page.evaluate(`${api}.getChanges()`))[0].values.owner).toBe("Zoe");
});

test("prototype-sensitive column IDs survive change validation undo redo and commit", async ({ page }) => {
  const ids = ["__proto__", "constructor", "toString"];
  const data = view({ columns: ids.map(id => ({ id, title: id, kind: "text", editable: true,
    ...(id === "toString" ? { editor: { type: "lookup", options: ["Old", "New"] } } : {}) })),
    rows: [{ id: "a0", cells: Object.fromEntries(ids.map(id => [id, "Old"])) }] });
  await serveGrid(page, { view: data, script: `CanopyX.configure('assets',{editing:{validators:{['__proto__']:value=>value==='New'?null:'Unexpected'},
    formatters:{},lookups:{},
    commit:batch=>{window.batch=batch;return {protocol:'canopyx/2',type:'gridCommitResult',view:batch.view,rows:[{id:'a0',status:'saved'}]};}}});` });
  await expect(page.locator('.cx-row[data-cx-id="a0"] [aria-invalid="true"]')).toHaveCount(0);
  for (const id of ids) expect(await page.evaluate(id => document.querySelector('[data-canopyx-host]').canopyx.setCellValue('a0',id,'New'), id))
    .toEqual({ applied: true, valid: true });
  // Playwright's object deserializer drops __proto__; transport the real public JSON without altering its keys.
  expect(JSON.parse(await page.evaluate(`JSON.stringify(${api}.getChanges())`))[0].values).toEqual(Object.fromEntries(ids.map(id => [id, "New"])));
  expect((await page.evaluate(`${api}.validate()`)).valid).toBe(true);
  for (const id of ids) await page.evaluate(`${api}.undo()`);
  expect(await page.evaluate(`${api}.getChanges()`)).toEqual([]);
  for (const id of ids) await page.evaluate(`${api}.redo()`);
  expect((await page.evaluate(`${api}.commitChanges()`)).saved).toBe(1);
  expect(JSON.parse(await page.evaluate(() => JSON.stringify(window.batch.rows[0].original)))).toEqual(Object.fromEntries(ids.map(id => [id, "Old"])));
  expect(await page.evaluate(`${api}.view.rows[0].cells.__proto__`)).toBe("New");
  await expect(cell(page, "a0", 2)).toHaveText("New");
  await page.evaluate(`${api}.beginEdit('a0','toString')`); await page.getByRole("combobox").fill("Old");
  await page.getByRole("option", { name: "Old", exact: true }).click(); await page.evaluate(`${api}.endEdit()`);
  expect((await page.evaluate(`${api}.getChanges()`))[0].values).toEqual({ toString: "Old" });
});

test("canonical saved cells become the optimistic baseline while newer edits stay pending", async ({ page }) => {
  await serveGrid(page, { view: view(), script: `window.batches=[];CanopyX.configure('assets',{editing:{commit:async batch=>{
    batches.push(batch);if(batches.length===1)await new Promise(resolve=>window.releaseSave=resolve);
    return {protocol:'canopyx/2',type:'gridCommitResult',view:batch.view,rows:batch.rows.map(row=>({id:row.id,status:'saved',
      cells:{name:row.values.name.trim(),cost:10}}))};}}});` });
  await page.evaluate(`${api}.setCellValue('a0','name',' first ')`);
  await page.evaluate(`window.saving=${api}.commitChanges();0`);
  await page.waitForFunction(() => typeof window.releaseSave === "function");
  await page.evaluate(`${api}.setCellValue('a0','name','latest')`);
  await page.evaluate(`${api}.setCellValue('a0','cost',20)`);
  await page.evaluate(() => window.releaseSave()); await page.evaluate(() => window.saving);
  expect(await page.evaluate(`${api}.getChanges()`)).toEqual([{ id: "a0", values: { name: "latest", cost: 20 }, original: { name: "first", cost: 10 } }]);
  await page.evaluate(`${api}.commitChanges()`);
  expect(await page.evaluate(() => window.batches[1].rows[0].original)).toEqual({ name: "first", cost: 10 });
});

test("malformed canonical cells reject every row before any batch result is applied", async ({ page }) => {
  await serveGrid(page, { view: view(), script: `CanopyX.configure('assets',{editing:{commit:batch=>({protocol:'canopyx/2',type:'gridCommitResult',view:batch.view,
    rows:[{id:'a0',status:'saved',cells:{name:'Canonical'}},{id:'a1',status:'saved',cells:{cost:'not a number'}}]})}});` });
  await page.evaluate(`${api}.setCellValue('a0','name','One')`); await page.evaluate(`${api}.setCellValue('a1','name','Two')`);
  const result = await page.evaluate(`${api}.commitChanges()`);
  expect([result.saved, result.failed, result.rows.map(row => row.status)]).toEqual([0, 2, ["error", "error"]]);
  expect((await page.evaluate(`${api}.getChanges()`)).map(change => change.values.name)).toEqual(["One", "Two"]);
  expect(await page.evaluate(`${api}.view.rows.map(row=>row.cells.name)`)).toEqual(["Alpha", "Beta", "Gamma"]);
});

test("duplicate requested commit IDs produce one writer row and one successful outcome", async ({ page }) => {
  await serveGrid(page, { view: view(), script: `CanopyX.configure('assets',{editing:{commit:batch=>{window.batch=batch;
    return {protocol:'canopyx/2',type:'gridCommitResult',view:batch.view,rows:batch.rows.map(row=>({id:row.id,status:'saved'}))};}}});` });
  await page.evaluate(`${api}.setCellValue('a0','name','New')`);
  expect(await page.evaluate(`${api}.commitChanges({ids:['a0','a0']})`)).toEqual({ ok: true, saved: 1, failed: 0, rows: [{ id: "a0", ok: true, status: "saved" }] });
  expect(await page.evaluate(() => window.batch.rows.map(row => row.id))).toEqual(["a0"]);
});

for (const mode of ["row", "form"]) test(`${mode} save reuses asynchronous validators for the completed proposed row`, async ({ page }) => {
  if (mode === "form") await page.setViewportSize({ width: 390, height: 800 });
  const data = view(); data.columns = data.columns.slice(0, 2);
  data.rows = data.rows.map(row => ({ ...row, cells: { name: row.cells.name, cost: row.cells.cost } }));
  await serveGrid(page, { view: data, script: `window.checks=[];CanopyX.configure('assets',{editing:{mode:'${mode === "row" ? "row" : "cell"}',validators:{
    name:async(value,row)=>{checks.push(['name',value,row.cells.cost]);return null;},cost:(value,row)=>{checks.push(['cost',value,row.cells.name]);return null;}}},
    onRowCommit:()=>({status:'saved'})});` });
  if (mode === "form") await page.locator('.cx-row[data-cx-id="a0"]').click();
  else await page.evaluate(`${api}.beginEdit('a0','name')`);
  await page.getByRole("textbox", { name: "Edit Name" }).fill("Changed");
  await page.getByRole("textbox", { name: "Edit Cost" }).fill("5");
  if (mode === "form") await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  else await page.evaluate(`${api}.endEdit()`);
  await expect.poll(() => page.evaluate(`${api}.getChanges()`)).toEqual([]);
  expect(await page.evaluate(() => window.checks)).toEqual([["name", "Changed", 5], ["cost", 5, "Changed"]]);
  if (mode === "form") await expect(page.getByRole("dialog")).toBeHidden();
});

test("a later edit to another field invalidates a cached row-dependent cell check", async ({ page }) => {
  await serveGrid(page, { view: view(), script: `CanopyX.configure('assets',{editing:{validators:{name:(value,row)=>row.cells.cost>10?'Over budget':null}}});` });
  await page.evaluate(`${api}.setCellValue('a0','name','Changed')`); await page.evaluate(`${api}.setCellValue('a0','cost',20)`);
  const result = await page.evaluate(`${api}.commitChanges()`);
  expect(result.rows).toEqual([{ id: "a0", ok: false, status: "invalid", errors: { name: "Over budget" }, error: null }]);
});

test("hosted lookup facets reject misrouted malformed and duplicate response buckets", async ({ page }) => {
  const data = view(); delete data.rows; data.source = { kind: "host" };
  await serveGrid(page, { view: data, script: `window.facetCase='valid';CanopyX.configure('assets',{source:{
    query:q=>({protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'r1',offset:q.offset,total:3,matched:3,
      items:[{id:'a0',cells:{name:'Alpha',cost:1,owner:'Ada',site:'Berlin'}},{id:'a1',cells:{name:'Beta',cost:2,owner:'Ann',site:'Berlin'}},{id:'a2',cells:{name:'Gamma',cost:3,owner:'Bob',site:'Madrid'}}]}),
    facet:r=>{const p={protocol:'canopyx/2',type:'gridFacetPage',view:r.query.view,revision:r.query.revision,column:r.column,search:r.search,
      includeCurrentFilter:r.includeCurrentFilter,matched:3,totalValues:2,truncated:false,items:[{value:'Ada',count:1},{value:'Ann',count:1}]};
      const changes={view:{view:'other'},revision:{revision:'old'},column:{column:'site'},search:{search:'wrong'},projection:{includeCurrentFilter:true},
        counts:{matched:-1},value:{items:[{value:{name:'Ada'},count:1}]},duplicate:{items:[{value:'Ada',count:1},{value:'ADA',count:1}]},
        limit:{totalValues:3,items:[{value:'Ada',count:1},{value:'Ann',count:1},{value:'Amy',count:1}]}};
      return Object.assign(p,changes[facetCase]);}}});` });
  for (const kind of ["view", "revision", "column", "search", "projection", "counts", "value", "duplicate", "limit"]) {
    await page.evaluate(kind => { window.facetCase = kind; }, kind);
    await page.evaluate(`${api}.beginEdit('a0','owner')`); await page.getByRole("combobox").fill("A");
    await expect(page.locator(".cx-editor-note")).toContainText("CanopyX:");
    await expect(page.getByRole("option")).toHaveCount(0); await page.evaluate(`${api}.cancelEdit()`);
  }
  await page.evaluate(() => { window.facetCase = "valid"; });
  await page.evaluate(`${api}.beginEdit('a0','owner')`); await page.getByRole("combobox").fill("A");
  await expect(page.getByRole("option")).toHaveText(["Ada", "Ann"]);
});

test("an editing script load failure can be retried through the same grid API", async ({ page }) => {
  let requests = 0;
  await serveGrid(page, { view: view(), routes: { "/canopyx-editing.js": route => ++requests === 1 ?
    route.fulfill({ status: 503, body: "" }) : route.fulfill({ contentType: "text/javascript", body: read("canopyx-editing.js") }) } });
  expect(await page.evaluate(`${api}.beginEdit('a0','name')`)).toBe(true);
  expect(requests).toBe(2);
  await expect(page.getByRole("textbox", { name: "Edit Name" })).toBeFocused();
});

test("identical reader filters survive normalized sorting paging reload and link removal", async ({ page }) => {
  const data = plain({ presentation: "paged", pageLength: 1 });
  await serveGrid(page, { view: data });
  await page.evaluate(`(${api}).setQuery({filters:[${JSON.stringify(condition("Berlin"))}]})`);
  await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['Berlin']})`);
  await page.locator('[data-cx-column="name"] .cx-sort').click();
  await expect.poll(() => page.evaluate(`${api}.getQuery().sort.length`)).toBe(1);
  await page.evaluate(`${api}.goToPage(1)`); await page.evaluate(`${api}.reload()`);
  expect(await page.evaluate(`${api}.getState().query.filters`)).toEqual([condition("Berlin")]);
  await page.evaluate(`${api}.clearExternalFilters()`);
  expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([condition("Berlin")]);
  expect((await page.evaluate(`${api}.getPaging()`)).matched).toBe(2);
});

for (const method of ["setState", "applySavedView"]) for (const persist of [false, true])
  test(`saved reader filters survive ${method} with external persistence ${persist}`, async ({ page }) => {
    await serveGrid(page, { view: plain() });
    await page.evaluate(`${api}.setQuery({filters:[${JSON.stringify(condition("Berlin"))}]})`);
    await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['Berlin'],persist:${persist}})`);
    const state = await page.evaluate(`JSON.parse(JSON.stringify(${api}.getState()))`);
    expect(state.query.filters).toEqual([condition("Berlin")]);
    await page.evaluate(`${api}.saveView('Berlin')`);
    for (let pass = 0; pass < 2; pass++) {
      if (method === "setState") await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), state);
      else await page.evaluate(`${api}.applySavedView('Berlin')`);
      expect(await page.evaluate(`${api}.getState().query.filters`)).toEqual([condition("Berlin")]);
    }
    await page.evaluate(`${api}.clearExternalFilters()`);
    expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([condition("Berlin")]);
    expect((await page.evaluate(`${api}.getPaging()`)).matched).toBe(2);
  });

for (const method of ["setState", "applySavedView"])
  test(`persistent linked state survives ${method} after its external source is cleared`, async ({ page }) => {
    await serveGrid(page, { view: plain() });
    await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['Berlin'],persist:true})`);
    const state = await page.evaluate(`${api}.getState()`); await page.evaluate(`${api}.saveView('Berlin')`);
    await page.evaluate(`${api}.clearExternalFilters()`);
    expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([]);
    if (method === "setState") await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), state);
    else await page.evaluate(`${api}.applySavedView('Berlin')`);
    expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([condition("Berlin")]);
    expect(await page.evaluate(`${api}.getExternalFilters()`)).toEqual([]);
    expect((await page.evaluate(`${api}.getPaging()`)).matched).toBe(2);
  });

test("setQuery accepts a full effective query without converting its external tail into reader state", async ({ page }) => {
  await serveGrid(page, { view: plain() });
  await page.evaluate(`${api}.setQuery({filters:[${JSON.stringify(condition("Berlin"))}]})`);
  await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['Berlin']})`);
  await page.evaluate(`${api}.setQuery(${api}.getQuery())`);
  expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([condition("Berlin"), condition("Berlin")]);
  await page.evaluate(`${api}.clearExternalFilters()`);
  expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([condition("Berlin")]);
});

test("Clear all recovers from the first linked filter producing an empty result", async ({ page }) => {
  await serveGrid(page, { view: plain() }); await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['Missing']})`);
  await page.locator(".cx-grid-notice .acts button").click();
  await expect.poll(() => page.evaluate(`${api}.getExternalFilters()`)).toEqual([]);
  expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([]);
  expect((await page.evaluate(`${api}.getPaging()`)).matched).toBe(3);
});

const hostScript = `window.failNext=false;window.holdQuery=false;window.queries=[];const records=${JSON.stringify(view().rows)};
  CanopyX.configure('assets',{source:{query:async q=>{queries.push(q);if(holdQuery)await new Promise(resolve=>window.releaseQuery=resolve);
    if(failNext){window.failNext=false;throw new Error('host down');}const rows=records.filter(row=>q.filters.every(f=>f.values.includes(row.cells[f.column])));
    return {protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'r1',offset:q.offset,total:records.length,matched:rows.length,items:rows.slice(q.offset,q.offset+q.limit)};}}});`;
for (const fail of [false, true]) test(`identical pending linked calls share the eventual ${fail ? "failure" : "result"}`, async ({ page }) => {
  await serveGrid(page, { view: plain({ source: { kind: "host" }, rows: undefined }), script: hostScript });
  await page.evaluate(`window.holdQuery=true;window.failNext=${fail};window.first=${api}.setExternalFilter('sites',{field:'site',values:['Berlin']}).then(value=>value,error=>error.message);0`);
  await page.waitForFunction(() => typeof window.releaseQuery === "function");
  await page.evaluate(`window.secondSettled=false;window.second=${api}.setExternalFilter('sites',{field:'site',values:['Berlin']}).then(value=>{secondSettled=true;return value},error=>{secondSettled=true;return error.message});0`);
  expect(await page.evaluate(async () => { await Promise.resolve(); return window.secondSettled; })).toBe(false);
  await page.evaluate(() => { window.holdQuery = false; window.releaseQuery(); });
  expect(await page.evaluate(() => Promise.all([window.first, window.second]))).toEqual(fail ? ["host down", "host down"] : [true, true]);
});

for (const previous of [null, "Berlin"]) test(`failed linked filter retry restores ${previous || "unfiltered"} reader intent`, async ({ page }) => {
  await serveGrid(page, { view: plain({ source: { kind: "host" }, rows: undefined }), script: hostScript });
  if (previous) await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['${previous}']})`);
  const result = await page.evaluate(`window.failNext=true;${api}.setExternalFilter('sites',{field:'site',values:['Madrid']}).catch(error=>error.message)`);
  expect(result).toBe("host down"); await page.evaluate(`${api}.retry()`);
  expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual(previous ? [condition(previous)] : []);
  expect(await page.evaluate(`${api}.getState().query.filters`)).toEqual([]);
  await page.evaluate(`${api}.clearExternalFilters()`); expect((await page.evaluate(`${api}.getPaging()`)).matched).toBe(3);
});

test("inline column facets retain external constraints on other columns", async ({ page }) => {
  await serveGrid(page, { view: plain() }); await page.evaluate(`${api}.setExternalFilter('sites',{field:'site',values:['Berlin']})`);
  await page.getByRole("button", { name: "Menu for Owner", exact: true }).click();
  await page.getByRole("menuitem", { name: "Filter…", exact: true }).click();
  await expect(page.locator(".cx-facet-value")).toHaveText(["Ada", "Ann"]);
  await expect(page.locator(".cx-val .cx-val-n")).toHaveText(["1", "1"]);
});

test("tree external filters compare ISO-looking text as distinct raw strings", async ({ page }) => {
  await serveGrid(page, { view: plain() });
  const ids = await page.evaluate(async () => {
    const host = document.createElement("div"); host.style.height = "300px"; document.body.appendChild(host);
    const tree = CanopyX.createTreeGrid(host, { view: { protocol: "canopyx/2", type: "view", id: "dates-as-text", label: "Dates", pageSize: 50,
      selection: "none", source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "stamp", title: "Stamp", kind: "text" }],
      roots: [{ id: "utc", label: "UTC", cells: { stamp: "2026-01-01T00:00:00Z" } }, { id: "offset", label: "Offset", cells: { stamp: "2026-01-01T01:00:00+01:00" } }] } });
    await tree.ready; await tree.setExternalFilter("time", { field: "stamp", values: ["2026-01-01T00:00:00Z"] });
    await new Promise(requestAnimationFrame);
    return [...host.querySelectorAll(".cx-row[data-cx-id]")].map(row => row.getAttribute("data-cx-id"));
  });
  expect(ids).toEqual(["utc"]);
});

test("configured link events wait for part installation before API readiness", async ({ page }) => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const mounted = serveGrid(page, { view: plain(), script: `CanopyX.configure('assets',{linkEvents:true});`, routes: {
    "/canopyx-link.js": async route => { await hold; return route.fulfill({ contentType: "text/javascript", body: read("canopyx-link.js") }); } } });
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(`${api}.ready.then(()=>window.apiReady=true);0`);
  expect(await page.evaluate(async () => { await Promise.resolve(); return !!window.apiReady; })).toBe(false);
  release(); await mounted;
  await page.evaluate(`window.links=[];document.querySelector('[data-canopyx-host]').addEventListener('canopyx:linkchange',event=>links.push(event.detail));${api}.setSelection(['a0'])`);
  expect(await page.evaluate(() => window.links[0].keys)).toEqual(["a0"]);
});

test("a configured link part failure rejects readiness", async ({ page }) => {
  await serveGrid(page, { view: plain(), script: `CanopyX.configure('assets',{linkEvents:true});`, routes: {
    "/canopyx-link.js": route => route.fulfill({ status: 503, body: "" }) } });
  expect(await page.evaluate(`${api}.ready.then(()=>null,error=>error.message)`)).toContain("linked views script unavailable");
});

test("link events report positive grouped equalities and ignore negative predicates", async ({ page }) => {
  await serveGrid(page, { view: plain(), script: `window.links=[];CanopyX.configure('assets',{linkEvents:true,onLinkchange:detail=>links.push(detail)});` });
  await page.evaluate(`${api}.setQuery({filterGroup:{operator:'or',filters:[{column:'site',operator:'eq',values:['Berlin']},{column:'site',operator:'ne',values:['Madrid']}],
    groups:[{operator:'and',filters:[{column:'cost',operator:'eq',values:[1]}],groups:[]}]}})`);
  expect(await page.evaluate(() => window.links.at(-1).values)).toEqual({ site: ["Berlin"], cost: [1] });
  await page.evaluate(`${api}.setQuery({filters:[]})`);
  expect(await page.evaluate(() => [window.links.at(-1).action, window.links.at(-1).scope, window.links.at(-1).values])).toEqual(["clear", "filter", {}]);
});
