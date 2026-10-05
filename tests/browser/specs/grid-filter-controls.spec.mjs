import { test, expect } from "@playwright/test";
import { viewPage, openGridControl, flushGridFilters } from "./support.mjs";

const columns = [
  { id: "name", title: "Name", kind: "text", width: 170, sortable: true },
  { id: "category", title: "Category", kind: "text", width: 150 },
  { id: "amount", title: "Amount", kind: "number", width: 140, sortable: true },
  { id: "date", title: "Date", kind: "datetime", width: 210 },
  { id: "flag", title: "Flag", kind: "text", width: 130 }
];
const base = { protocol: "canopyx/2", type: "grid", id: "filters", label: "Filtered inventory", source: { kind: "inline" },
  rowHeight: 28, pageSize: 5, presentation: "paged", pageLength: 2, selection: "multiple", search: true,
  reporting: { headerFilters: true, ordering: { category: { text: "ordinal", categories: ["A", "B"] } } },
  columns: columns.map(column => ({ ...column, sortable: true })),
  rows: Array.from({ length: 18 }, (_, i) => ({ id: "row-" + String(i).padStart(2, "0"),
    cells: { name: "Item " + i, category: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "Other", amount: { value: i, text: "$" + i },
      date: "2026-01-" + String(i + 1).padStart(2, "0") + "T00:00:00Z", flag: i % 2 === 0 } })) };

async function open(page, patch = {}) {
  await page.route("http://canopyx.test/filters", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...base, ...patch }) }));
  await page.goto("http://canopyx.test/filters");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
}


const query=page=>page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery());
const panel=page=>page.locator('.cx-grid-filters');
async function builder(page,column){
 await openGridControl(page,'filters');
 const existing=panel(page).locator('fieldset.cx-grid-filter').filter({has:page.locator('select option[value="'+column+'"]:checked')});
 if(await existing.count())return existing.first();
 await panel(page).getByRole('button',{name:'+ Condition',exact:true}).first().click();
 const row=panel(page).locator('fieldset.cx-grid-filter').last();await row.getByRole('combobox',{name:'Column',exact:true}).selectOption(column);return row;
}
async function exported(page){return page.evaluate(async()=>{const rows=[];for await(const row of document.querySelector('[data-canopyx-host]').canopyx.prepareExport({scope:'filtered'}).rows())rows.push(row.id);return rows;});}
test('custom-toolbar grids retain API filtering and hide toolbar entry points',async({page})=>{
 await open(page);await page.evaluate(async()=>{const host=document.querySelector('[data-canopyx-host]'),view=host.canopyx.view;host.canopyx.destroy();host.canopyx=CanopyX.createDataGrid(host,{view,toolbar:false});await host.canopyx.ready;await host.canopyx.setQuery({filters:[{column:'amount',operator:'ge',values:[15]}],sort:[{column:'amount',direction:'desc'}]});});
 await expect(page.locator('.cx-toolbar')).toBeHidden();expect(await exported(page)).toEqual(['row-17','row-16','row-15']);
});
test('inclusive number ranges query the full dataset before visible paging and export',async({page})=>{
 await open(page);const row=await builder(page,'amount');await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('between');await row.getByRole('spinbutton',{name:'Value',exact:true}).fill('3');await row.getByRole('spinbutton',{name:'Upper value',exact:true}).fill('6');await flushGridFilters(page);
 await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount','5');expect((await query(page)).filters).toEqual([{column:'amount',operator:'ge',values:[3]},{column:'amount',operator:'le',values:[6]}]);expect(await exported(page)).toEqual(['row-03','row-04','row-05','row-06']);await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'Filter Amount',exact:true})).toHaveAttribute('data-cx-filtered','true');await expect(panel(page).locator('fieldset.cx-grid-filter')).toHaveCount(1);
});
test('date ranges retain original offsets and fractional operands when Done leaves them unchanged',async({page})=>{
 const values=['2026-01-03T00:00:00.123456+02:00','2026-01-05T00:00:00.987654+02:00'],predicates=values.map((value,i)=>({column:'date',operator:i?'le':'ge',values:[value]}));
 await open(page,{query:{filters:predicates}});const row=await builder(page,'date');await expect(row.getByRole('combobox',{name:'Condition',exact:true})).toHaveValue('between');await flushGridFilters(page);expect((await query(page)).filters).toEqual(predicates);expect(await exported(page)).toEqual(['row-02','row-03']);
});
test('reversed range drafts keep accepted results and report a value error',async({page})=>{
 await open(page);const row=await builder(page,'amount');await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('between');await row.getByRole('spinbutton',{name:'Value',exact:true}).fill('9');await row.getByRole('spinbutton',{name:'Upper value',exact:true}).fill('2');
 await expect(panel(page).getByRole('status')).toHaveText('Enter a valid filter value.');expect((await query(page)).filters).toEqual([]);await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount','19');
});
test('editing one date bound retains the untouched original precision and offset',async({page})=>{
 const upper='2026-01-05T00:00:00.987654+02:00';await open(page,{query:{filters:[{column:'date',operator:'ge',values:['2026-01-03T00:00:00.123456+02:00']},{column:'date',operator:'le',values:[upper]}]}});
 const row=await builder(page,'date');await row.getByLabel('Value',{exact:true}).and(page.locator('input[type="datetime-local"]')).fill('2026-01-04T00:00');await flushGridFilters(page);
 expect((await query(page)).filters).toEqual([{column:'date',operator:'ge',values:['2026-01-04T00:00Z']},{column:'date',operator:'le',values:[upper]}]);expect(await exported(page)).toEqual(['row-03']);
});
test('category suggestions and translated boolean choices preserve raw predicates',async({page})=>{
 await open(page,{labels:{gridTrue:'Tak',gridFalse:'Nie'},columns:base.columns.map(c=>c.id==='flag'?{...c,presenter:{kind:'boolean'}}:c)});
 const category=await builder(page,'category');await category.getByRole('combobox',{name:'Suggested category',exact:true}).selectOption('B');await flushGridFilters(page);
 const flag=await builder(page,'flag');await flag.getByRole('combobox',{name:'Boolean value',exact:true}).selectOption({label:'Nie'});await flushGridFilters(page);
 expect((await query(page)).filters).toEqual([{column:'category',operator:'eq',values:['B']},{column:'flag',operator:'eq',values:[false]}]);expect(await exported(page)).toEqual(['row-01','row-07','row-13']);
});
test('missing and membership operators disable inactive number controls',async({page})=>{
 await open(page);let row=await builder(page,'amount');await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('between');await row.getByRole('spinbutton',{name:'Upper value',exact:true}).press('-');await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('in');await row.getByRole('textbox',{name:'Value',exact:true}).fill('2\n8');await flushGridFilters(page);
 expect((await query(page)).filters).toEqual([{column:'amount',operator:'in',values:[2,8]}]);expect(await exported(page)).toEqual(['row-02','row-08']);row=panel(page).locator('fieldset.cx-grid-filter').first();await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('isNull');await flushGridFilters(page);expect((await query(page)).filters).toEqual([{column:'amount',operator:'isNull',values:[]}]);expect(await exported(page)).toEqual([]);
});
test('header filters stay bound to their column after reordering and return focus on Escape',async({page})=>{
 await open(page);await page.evaluate(async()=>{const grid=document.querySelector('[data-canopyx-host]').canopyx;grid.setColumnOrder(['flag','date','amount','category','name']);await grid.setQuery({filters:[{column:'amount',operator:'gt',values:[9]}]});});
 const button=page.getByRole('button',{name:'Filter Amount',exact:true});await button.click();const pop=page.getByRole('dialog',{name:'Amount: Filter…'});await expect(pop.getByRole('combobox',{name:'Condition',exact:true})).toHaveValue('gt');await expect(panel(page)).not.toHaveAttribute('open','');await pop.getByRole('spinbutton',{name:'Value',exact:true}).press('Escape');await expect(button).toBeFocused();
 await openGridControl(page,'views');await page.getByRole('button',{name:'Reset view',exact:true}).click();await expect(button).toHaveAttribute('data-cx-filtered','false');expect((await query(page)).filters).toEqual([]);
});
