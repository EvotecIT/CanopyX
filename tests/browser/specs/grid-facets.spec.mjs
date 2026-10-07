import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";
import AxeBuilder from "@axe-core/playwright";

const filter = (column, operator, ...values) => ({ column, operator, values });
const group = (operator, filters = [], groups = []) => ({ operator, filters, groups });
const values = ["ALPHA", "alpha", "Beta", true, "true", false, null, undefined, "Beta", "ALPHA"];
const definition = { protocol: "canopyx/2", type: "grid", id: "facets", label: "Facet inventory", source: { kind: "inline" },
  rowHeight: 28, pageSize: 5, presentation: "paged", pageLength: 2, selection: "multiple", search: true,
  reporting: { facetColumns: ["category", "date"], headerFilters: true, filterGroups: true },
  columns: [{ id: "category", title: "Category", width: 180, kind: "text", sortable: true },
    { id: "amount", title: "Amount", width: 140, kind: "number" }, { id: "date", title: "Date", width: 200, kind: "datetime" }],
  rows: values.map((value, i) => ({ id: "r" + String(i).padStart(2, "0"), cells: { category: value, amount: i,
    date: i % 2 ? "2026-10-01T12:00:00Z" : "2026-10-01T14:00:00+02:00" } })) };

async function open(page, query = {}, setup = "", host = false) {
  const view = { ...definition, query, ...(host ? { source: { kind: "host" }, rows: undefined } : {}) };
  await page.route("http://canopyx.test/facets", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/facets"); await page.waitForSelector("[data-cx-ready]");
}
const facets = (page, column = "category", options = {}) => page.evaluate(({ column, options }) =>
  document.querySelector("[data-canopyx-host]").canopyx.getFacets(column, options), { column, options });
const buckets = page => page.items.map(item => [item.value, item.count]);

test("facets count the complete accepted query and retain raw boolean/text/missing identities", async ({ page }) => {
  await open(page); await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  const full = await facets(page);
  expect(full.matched).toBe(10); expect(full.totalValues).toBe(6); expect(full.truncated).toBe(false);
  expect(buckets(full)).toEqual([[false, 1], [true, 1], ["ALPHA", 3], ["Beta", 2], ["true", 1], [null, 2]]);
  expect(buckets(await facets(page, "date"))).toEqual([["2026-10-01T12:00:00.000Z", 10]]);
  const bounded = await facets(page, "category", { limit: 2 });
  expect(bounded.totalValues).toBe(6); expect(bounded.truncated).toBe(true); expect(buckets(bounded)).toEqual([[false, 1], [true, 1]]);
  expect(buckets(await facets(page, "category", { search: "ALp" }))).toEqual([["ALPHA", 3]]);
});

test("facet projection replaces current-column predicates by true within nested OR and keeps other applied conditions", async ({ page }) => {
  const query = { filters: [filter("amount", "ge", 2)],
    filterGroup: group("and", [], [group("or", [filter("category", "eq", "ALPHA"), filter("amount", "lt", 4)])]) };
  await open(page, query);
  const before = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery());
  expect(buckets(await facets(page))).toEqual([[true, 1], ["ALPHA", 1], ["Beta", 1]]);
  const projected = await facets(page, "category", { includeCurrentFilter: false });
  expect(projected.matched).toBe(8); expect(buckets(projected)).toEqual([[false, 1], [true, 1], ["ALPHA", 1], ["Beta", 2], ["true", 1], [null, 2]]);
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery())).toEqual(before);
});

const hostSetup = `window.facetRequests=[];window.facetResolvers=[];
  CanopyX.configure('facets',{source:{query(q){return {protocol:'canopyx/2',type:'gridPage',view:'facets',revision:'snapshot',offset:q.offset,total:100,matched:100,
    items:Array.from({length:q.limit},(_,i)=>({id:'h'+(q.offset+i),cells:{category:'Host',amount:i}}))};},
    facet(request,{signal}){facetRequests.push({request,signal});return new Promise(resolve=>facetResolvers.push(resolve));}}});`;
const response = (request, patch = {}) => ({ protocol: "canopyx/2", type: "gridFacetPage", view: "facets", revision: "snapshot",
  column: request.column, search: request.search, includeCurrentFilter: request.includeCurrentFilter,
  matched: 100, totalValues: 1, truncated: false, items: [{ value: "Host", count: 100 }], ...patch });

test("host facet requests are explicit revisioned capabilities and stale work aborts even when the host ignores its signal", async ({ page }) => {
  await open(page, {}, hostSetup, true);
  await page.evaluate(() => { const grid = document.querySelector("[data-canopyx-host]").canopyx;
    window.facetResult = grid.getFacets("category", { includeCurrentFilter: false, search: "Host" }).catch(error => ({ error: error.name })); });
  await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(1);
  const captured = await page.evaluate(() => facetRequests[0].request);
  expect(captured.query.revision).toBe("snapshot"); expect(captured.includeCurrentFilter).toBe(false); expect(captured.search).toBe("Host");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "new" }));
  expect(await page.evaluate(() => facetResult)).toEqual({ error: "AbortError" });
  expect(await page.evaluate(() => facetRequests[0].signal.aborted)).toBe(true);
  await page.evaluate(value => facetResolvers[0](value), response(captured));
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().search)).toBe("new");
});

test("host responses reject mismatched snapshots, duplicate canonical values and contradictory counts", async ({ page }) => {
  await open(page, {}, hostSetup, true);
  for (const patch of [{ revision: "old" }, { totalValues: 2, items: [{ value: "A", count: 50 }, { value: "a", count: 50 }] },
    { items: [{ value: "Host", count: 1 }] }, { includeCurrentFilter: false }]) {
    const index = await page.evaluate(() => { const at = facetRequests.length;
      window.facetResult = document.querySelector("[data-canopyx-host]").canopyx.getFacets("category").catch(error => ({ error: error.message })); return at; });
    await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(index + 1);
    const request = await page.evaluate(index => facetRequests[index].request, index);
    await page.evaluate(({ index, value }) => facetResolvers[index](value), { index, value: response(request, patch) });
    expect((await page.evaluate(() => facetResult)).error).toContain("CanopyX:");
  }
});

test("invalid requests and missing host capabilities reject without deriving facet counts from loaded pages", async ({ page }) => {
  await open(page);
  for (const [column, options] of [["amount", {}], ["category", { limit: 201 }], ["category", { includeCurrentFilter: "false" }]])
    expect(await page.evaluate(async ({ column, options }) => {
      try { await document.querySelector("[data-canopyx-host]").canopyx.getFacets(column, options); return "accepted"; }
      catch (error) { return error.message; }
    }, { column, options })).toContain("CanopyX:");
  await open(page, {}, hostSetup.replace("facet(request,{signal})", "unsupported(request,{signal})"), true);
  expect(await page.evaluate(async () => { try { await document.querySelector("[data-canopyx-host]").canopyx.getFacets("category"); }
    catch (error) { return error.message; } })).toContain("explicit source capability");
});

test("host facet counts must respect known accepted matched/total counts while unknown cursor counts stay supported", async ({ page }) => {
  const setup = hostSetup.replace("total:100,matched:100", "total:200,matched:100").replace("amount:i", "amount:i+2");
  await open(page, {filters:[filter('category','eq','Host'),filter('amount','ge',2)]}, setup, true);
  const attempts = [[true, 5, true], [true, 101, true], [false, 99, true], [false, 201, true], [false, 150, false]];
  for (const [index, [includeCurrentFilter, matched, rejected]] of attempts.entries()) {
    await page.evaluate(includeCurrentFilter => { window.facetResult = document.querySelector('[data-canopyx-host]').canopyx
      .getFacets('category', {includeCurrentFilter}).catch(error => ({error:error.message})); }, includeCurrentFilter);
    await expect.poll(() => page.evaluate(() => facetRequests.length)).toBe(index + 1);
    const request = await page.evaluate(index => facetRequests[index].request, index);
    const items = rejected ? [{value:'Host',count:matched}] : [{value:'Host',count:100},{value:'Other',count:50}];
    await page.evaluate(({index,value}) => facetResolvers[index](value), {index, value:response(request,{matched,totalValues:items.length,items})});
    const result = await page.evaluate(() => facetResult);
    if (rejected) expect(result.error).toContain('CanopyX:'); else expect(result.matched).toBe(150);
  }
  await open(page, {filters:[filter('amount','ge',2)],filterGroup:group('and',[filter('amount','lt',1000)])}, setup, true);
  await page.evaluate(() => {window.facetResult=document.querySelector('[data-canopyx-host]').canopyx.getFacets('category',{includeCurrentFilter:false})
    .catch(error=>({error:error.message}));});
  await expect.poll(()=>page.evaluate(()=>facetRequests.length)).toBe(1);
  const unchanged = await page.evaluate(()=>facetRequests[0].request);
  await page.evaluate(value=>facetResolvers[0](value),response(unchanged,{matched:150,items:[{value:'Host',count:150}]}));
  expect((await page.evaluate(()=>facetResult)).error).toContain('CanopyX:');
  const cursorView = {...definition,source:{kind:'host',navigation:'cursor'},rows:undefined};
  await page.evaluate(async view => { const host=document.querySelector('[data-canopyx-host]');host.canopyx.destroy();
    const grid=CanopyX.createDataGrid(host,{view,source:{query(q){return {protocol:'canopyx/2',type:'gridCursorPage',view:q.view,
      revision:'unknown',offset:0,total:null,matched:null,nextCursor:'next',items:[{id:'u1',cells:{category:'Host'}},{id:'u2',cells:{category:'Host'}}]};},facet(request){return {protocol:'canopyx/2',type:'gridFacetPage',
      view:request.query.view,revision:'unknown',column:request.column,search:request.search,includeCurrentFilter:request.includeCurrentFilter,
      matched:7,totalValues:1,truncated:false,items:[{value:'Host',count:7}]};}}});await grid.ready; }, cursorView);
  expect((await facets(page)).matched).toBe(7);
});


test('numeric facet API retains distinct binary64 values without rounding labels',async({page})=>{
 await open(page);await page.evaluate(async()=>{const host=document.querySelector('[data-canopyx-host]'),view=host.canopyx.view;host.canopyx.destroy();view.reporting.facetColumns=['amount'];view.rows=[{id:'a',cells:{amount:0.0001}},{id:'b',cells:{amount:0.0002}}];await CanopyX.createDataGrid(host,{view}).ready;});
 expect(buckets(await facets(page,'amount'))).toEqual([[0.0001,1],[0.0002,1]]);
});
async function editor(page){await page.getByRole('button',{name:'Menu for Category',exact:true}).click();await page.getByRole('menuitem',{name:'Filter…',exact:true}).click();return page.getByRole('dialog',{name:'Category: Filter…'});}
test('column value counts cover the whole query and distinguish raw boolean, string and missing choices',async({page})=>{
 await open(page);const pop=await editor(page);await expect(pop.locator('.cx-val')).toHaveCount(6);
 expect(await pop.locator('.cx-val').evaluateAll(rows=>rows.map(row=>[row.querySelector('.cx-facet-value').textContent,row.querySelector('.cx-val-n').textContent])))
   .toEqual([['No','1'],['Yes','1'],['ALPHA','3'],['Beta','2'],['true','1'],['—','2']]);
 await pop.getByRole('checkbox',{name:'Select all values',exact:true}).check();await pop.getByRole('checkbox',{name:'Select all values',exact:true}).uncheck();const bool=pop.locator('.cx-val').filter({has:page.locator('.cx-facet-value').filter({hasText:/^Yes$/})});await bool.locator('input').check();await pop.getByRole('button',{name:'Done',exact:true}).click();
 await expect(page.locator('.cx-grid-result-count')).toHaveText('1 of 10 rows');expect((await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery())).filterGroup.filters).toEqual([filter('category','in',true)]);
 const next=await editor(page);await expect(next.locator('.cx-val')).toHaveCount(6);await next.getByRole('checkbox',{name:'Select all values',exact:true}).check();await next.getByRole('checkbox',{name:'Select all values',exact:true}).uncheck();await next.locator('.cx-val').filter({has:page.locator('.cx-facet-value').filter({hasText:/^true$/})}).locator('input').check();await next.getByRole('button',{name:'Done',exact:true}).click();
 expect((await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery())).filterGroup.filters).toEqual([filter('category','in','true')]);
});
test('phone missing-value filter keeps raw null semantics and accessible typed choices',async({page})=>{
 await page.setViewportSize({width:390,height:700});await open(page);await page.locator('[data-canopyx-host]').evaluate(host=>host.setAttribute('data-cx-theme','dark'));const pop=await editor(page);
 await pop.getByRole('checkbox',{name:'Select all values',exact:true}).check();await pop.getByRole('checkbox',{name:'Select all values',exact:true}).uncheck();await pop.locator('.cx-val').filter({hasText:'—'}).locator('input').check();
 expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).disableRules(['region']).analyze()).violations).toEqual([]);await pop.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('.cx-grid-result-count')).toHaveText('2 of 10 rows');
});
test('facet search aborts superseded work and closing the popover retires its outstanding request',async({page})=>{
 await open(page,{},hostSetup,true);const pop=await editor(page);await expect.poll(()=>page.evaluate(()=>facetRequests.length)).toBe(1);await pop.getByRole('searchbox',{name:'Search values',exact:true}).fill('fresh');await expect.poll(()=>page.evaluate(()=>facetRequests.length)).toBe(2);expect(await page.evaluate(()=>facetRequests[0].signal.aborted)).toBe(true);
 const fresh=await page.evaluate(()=>facetRequests[1].request);await page.evaluate(value=>facetResolvers[1](value),response(fresh,{items:[{value:'Fresh',count:100}]}));await expect(pop.locator('.cx-facet-value')).toHaveText('Fresh');
 const stale=await page.evaluate(()=>facetRequests[0].request);await page.evaluate(value=>facetResolvers[0](value),response(stale));await expect(pop.locator('.cx-facet-value')).toHaveText('Fresh');await pop.getByRole('searchbox',{name:'Search values',exact:true}).fill('pending');await expect.poll(()=>page.evaluate(()=>facetRequests.length)).toBe(3);await pop.press('Escape');expect(await page.evaluate(()=>facetRequests[2].signal.aborted)).toBe(true);
});
test('accepted criteria changes close outdated value lists; unsupported facets keep a typed text editor',async({page})=>{
 await open(page);const pop=await editor(page);await expect(pop.locator('.cx-val')).toHaveCount(6);await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.setQuery({search:'Beta'}));await expect(pop).toHaveCount(0);const next=await editor(page);await expect(next.locator('.cx-facet-value')).toHaveText('Beta');
 await open(page,{},hostSetup.replace('facet(request,{signal})','unsupported(request,{signal})'),true);const fallback=await editor(page);await expect(fallback.getByRole('textbox',{name:'Value',exact:true})).toBeVisible();await expect(fallback.locator('.cx-val')).toHaveCount(0);
});

for (const condition of [filter('category','ne','item-005'),filter('category','contains','item-2'),
  group('or',[filter('category','startsWith','item-0'),filter('category','startsWith','item-2')])])
test('editing a bounded facet preserves unseen values of '+(condition.operator),async({page})=>{
 const rows=Array.from({length:250},(_,i)=>({id:'v'+i,cells:{category:'item-'+String(i).padStart(3,'0'),amount:i}}));
 await open(page);await page.evaluate(async({rows,condition})=>{
  const host=document.querySelector('[data-canopyx-host]'),view=host.canopyx.view;host.canopyx.destroy();
  view.rows=rows;view.query=condition.groups?{filterGroup:condition}:condition.operator==='ne'?
   {filterGroup:{operator:'and',filters:[condition,{column:'amount',operator:'ge',values:[0]}],groups:[]}}:{filters:[condition]};await CanopyX.createDataGrid(host,{view}).ready;
 },{rows,condition});
 const ids=()=>page.evaluate(async()=>{const rows=[];for await(const row of document.querySelector('[data-canopyx-host]').canopyx.prepareExport({scope:'filtered'}).rows())rows.push(row.id);return rows;});
 const before=await ids(),pop=await editor(page);await expect(pop.locator('.cx-val')).toHaveCount(200);
 const remove=condition.operator==='contains'?'item-200':'item-010';
 if(condition.operator==='contains')await pop.getByRole('searchbox',{name:'Search values',exact:true}).fill(remove);
 const choice=pop.locator('.cx-val').filter({has:page.locator('.cx-facet-value').filter({hasText:new RegExp('^'+remove+'$')})}).locator('input');
 await choice.uncheck();await pop.getByRole('button',{name:'Done',exact:true}).click();
 expect(await ids()).toEqual(before.filter(id=>id!=='v'+Number(remove.slice(5))));
 expect(await ids()).toContain('v249');
 const reopened=await editor(page);await reopened.getByRole('searchbox',{name:'Search values',exact:true}).fill(remove);
 const restore=reopened.locator('.cx-val').filter({has:page.locator('.cx-facet-value').filter({hasText:new RegExp('^'+remove+'$')})}).locator('input');
 await restore.check();await reopened.getByRole('button',{name:'Done',exact:true}).click();expect(await ids()).toEqual(before);
 if(condition.operator==='ne')for(let i=0;i<9;i++){
  const current=await editor(page),check=current.locator('.cx-val').filter({has:page.locator('.cx-facet-value').filter({hasText:/^item-010$/})}).locator('input');
  await check.uncheck();await current.getByRole('button',{name:'Done',exact:true}).click();expect(await ids()).toEqual(before.filter(id=>id!=='v10'));
  const again=await editor(page);await again.locator('.cx-val').filter({has:page.locator('.cx-facet-value').filter({hasText:/^item-010$/})}).locator('input').check();
  await again.getByRole('button',{name:'Done',exact:true}).click();expect(await ids()).toEqual(before);
 }
});
