import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, openGridControl, flushGridFilters } from "./support.mjs";

const predicate = (column, operator, ...values) => ({ column, operator, values });
const group = (operator, filters = [], groups = []) => ({ operator, filters, groups });
function view(query = {}, enabled = true) {
  return { protocol: "canopyx/2", type: "grid", id: "groups", label: "Grouped conditions", source: { kind: "inline" },
    rowHeight: 28, pageSize: 5, presentation: "paged", pageLength: 2, selection: "multiple", search: true,
    reporting: { headerFilters: true, filterGroups: enabled }, query,
    columns: [{ id: "name", title: "Name", width: 180, kind: "text", sortable: true },
      { id: "amount", title: "Amount", width: 140, kind: "number", sortable: true },
      { id: "flag", title: "Flag", width: 130, kind: "text" }],
    rows: Array.from({ length: 20 }, (_, i) => ({ id: "r" + String(i).padStart(2, "0"),
      cells: { name: "Record " + i, amount: i, flag: i % 2 === 0 } })) };
}
const api = page => page.evaluateHandle(() => document.querySelector("[data-canopyx-host]").canopyx);
async function open(page, query, enabled) {
  await page.route("http://canopyx.test/filter-groups", route => route.fulfill({ contentType: "text/html", body: viewPage(view(query, enabled))
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Inventory conditions</h1>').replace('</body>', '</main></body>') }));
  await page.goto("http://canopyx.test/filter-groups"); await page.waitForSelector("[data-cx-ready]");
  await openGridControl(page,'filters');
}

const root=page=>page.locator('.cx-filter-root');
const first=page=>root(page).locator(':scope > .cx-grid-filter-group-children > .cx-grid-filter-group').first();
const rows=block=>block.locator(':scope > .cx-condition-rows > fieldset');
const actions=block=>block.locator(':scope > .cx-adds');
async function exported(page){return page.evaluate(async()=>{const ids=[];for await(const row of document.querySelector('[data-canopyx-host]').canopyx.prepareExport({scope:'filtered'}).rows())ids.push(row.id);return ids;});}
test('changing an AND range to OR keeps its two bounds together and exports the whole result',async({page})=>{
 await open(page,{filterGroup:group('and',[predicate('amount','ge',3),predicate('amount','le',6),predicate('flag','eq',true)])});const block=first(page);await expect(rows(block)).toHaveCount(2);await block.locator(':scope > .cx-group-h').getByRole('button',{name:'Any',exact:true}).click();await flushGridFilters(page);
 const expected=Array.from({length:20},(_,i)=>i).filter(i=>i%2===0||i>=3&&i<=6).map(i=>'r'+String(i).padStart(2,'0'));expect(await exported(page)).toEqual(expected);
 expect(await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery().filterGroup)).toEqual(group('or',[predicate('flag','eq',true)],[group('and',[predicate('amount','ge',3),predicate('amount','le',6)])]));await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(2);
});
test('independent OR bounds and outer conjunction remain unchanged after opening',async({page})=>{
 const query={filters:[predicate('amount','lt',12)],filterGroup:group('or',[predicate('amount','ge',3),predicate('amount','le',6)])};await open(page,query);await expect(rows(first(page))).toHaveCount(2);await flushGridFilters(page);
 expect(await exported(page)).toEqual(Array.from({length:12},(_,i)=>'r'+String(i).padStart(2,'0')));const q=await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery());expect(q.filters).toEqual(query.filters);expect(q.filterGroup).toEqual(query.filterGroup);
});
test('two nested levels compose typed conditions and restore from preference snapshots',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);await actions(root(page)).getByRole('button',{name:'+ Group',exact:true}).click();const block=first(page);await actions(block).getByRole('button',{name:'+ Condition',exact:true}).click();const row=rows(block).first();await row.getByRole('combobox',{name:'Column',exact:true}).selectOption('amount');await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('ge');await row.getByRole('spinbutton',{name:'Value',exact:true}).fill('10');
 await actions(block).getByRole('button',{name:'+ Group',exact:true}).click();const child=block.locator(':scope > .cx-grid-filter-group-children > .cx-grid-filter-group');await actions(child).getByRole('button',{name:'+ Condition',exact:true}).click();const nested=rows(child).first();await nested.getByRole('combobox',{name:'Column',exact:true}).selectOption('flag');await nested.getByRole('textbox',{name:'Value',exact:true}).fill('false');await flushGridFilters(page);
 // Declare the typed boolean through the public query, preserving the UI's ordinary text-column contract.
 await page.evaluate(async()=>{const grid=document.querySelector('[data-canopyx-host]').canopyx;const q=grid.getQuery(),g=JSON.parse(JSON.stringify(q.filterGroup));g.groups[0].filters[0].values=[false];await grid.setQuery({...q,filterGroup:g});const state=grid.getState();await grid.resetView();await grid.setState(state);});
 expect(await exported(page)).toEqual(['r11','r13','r15','r17','r19']);await openGridControl(page,'filters');await expect(page.locator('.cx-grid-filter-group')).toHaveCount(2);
 expect(errors).toEqual([]);
});
test('empty draft groups leave the accepted filter intact and group removal returns to an action',async({page})=>{
 const expression=group('and',[predicate('amount','ge',10)]);await open(page,{filterGroup:expression});const block=first(page);await actions(block).getByRole('button',{name:'+ Group',exact:true}).click();const child=block.locator(':scope > .cx-grid-filter-group-children > .cx-grid-filter-group');await child.locator(':scope > .cx-group-h').getByRole('button',{name:'Remove condition group',exact:true}).press('Enter');await expect(actions(block).getByRole('button',{name:'+ Condition',exact:true})).toBeFocused();expect(await exported(page)).toHaveLength(10);
});
test('deeper saved filters are read-only until Edit as text and keep the engine depth budget',async({page})=>{
 let expression=group('and',[predicate('amount','eq',1)]);for(let i=0;i<7;i++)expression=group('and',[],[expression]);await open(page,{filterGroup:expression});const text=page.getByRole('textbox',{name:'Filter expression',exact:true});await expect(text).toHaveAttribute('readonly','');await expect(page.locator('.cx-grid-filter-group')).toHaveCount(0);await page.getByRole('button',{name:'Edit as text',exact:true}).click();await expect(text).not.toHaveAttribute('readonly','');await text.fill(JSON.stringify({filterGroup:group('or',[predicate('amount','eq',2),predicate('amount','eq',3)])}));await flushGridFilters(page);expect(await exported(page)).toEqual(['r02','r03']);
});
test('external accepted chip and state changes retire drafts without stealing outside focus',async({page})=>{
 const expression=group('and',[predicate('amount','ge',10)]);await open(page,{filterGroup:expression});const chip=page.getByRole('button',{name:'Clear grouped filters',exact:true});await chip.press('Enter');await expect(page.locator('.cx-grid-filters')).not.toHaveAttribute('open','');expect(await exported(page)).toHaveLength(20);await openGridControl(page,'filters');await expect(first(page)).toHaveCount(0);
 await page.evaluate(async()=>{const grid=document.querySelector('[data-canopyx-host]').canopyx;await grid.setQuery({filterGroup:{operator:'and',filters:[{column:'amount',operator:'eq',values:[5]}],groups:[]}});await grid.resetView();});await expect(page.locator('.cx-grid-filters')).not.toHaveAttribute('open','');expect(await exported(page)).toHaveLength(10);
});
test('phone dark builder keeps two levels, names and focus without horizontal document overflow',async({page})=>{
 await page.setViewportSize({width:390,height:700});await open(page,{filterGroup:group('or',[predicate('name','contains','Record 1')],[group('and',[predicate('amount','ge',3),predicate('amount','le',6)])])});await page.locator('[data-canopyx-host]').evaluate(host=>host.setAttribute('data-cx-theme','dark'));
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);const child=first(page).locator(':scope > .cx-grid-filter-group-children > .cx-grid-filter-group');await rows(child).getByRole('button',{name:'Remove condition',exact:true}).press('Enter');expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);
});
