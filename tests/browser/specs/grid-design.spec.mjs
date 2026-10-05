import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";
import path from "node:path";

async function mount(page, view, options = {}, runtime = "grid") {
  const {script,style} = runtimeAssets(runtime);
  await page.setContent("<!doctype html><html lang='en'><head><title>Grid design</title><style>" + style + "</style></head><body><main><div id='host' data-cx-theme='light'></div></main></body></html>");
  await page.addScriptTag({content:script});
  await page.evaluate(async ({view,options}) => { window.grid = CanopyX.createDataGrid(document.querySelector('#host'), {view,...options}); await grid.ready; }, {view,options});
}
const base = {protocol:"canopyx/2",type:"grid",id:"design",label:"Records",pageSize:100,selection:"multiple",search:true,
  source:{kind:"inline"},columns:[{id:"name",title:"Name",kind:"text",width:220,sortable:true}],rows:[{id:"r1",cells:{name:"First record"}}]};

test("screen-reader headings outside a view do not widen the phone viewport",async({page})=>{
  await page.setViewportSize({width:390,height:844});await mount(page,base);
  await page.evaluate(()=>{const title=document.createElement('h1');title.className='cx-sr-only';title.textContent='A complete inventory with an accessible page title that is much wider than the phone';document.body.prepend(title);});
  const title=page.locator('h1.cx-sr-only');await expect(title).toHaveCSS('width','1px');await expect(title).toHaveCSS('height','1px');
  expect(await title.getAttribute('aria-hidden')).toBeNull();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test("density supplies default row sizes and preserves explicit dimensions", async ({page}) => {
  for (const [density,height,padding] of [["compact",28,8],["default",34,12],["comfortable",42,14]]) {
    await mount(page,{...base,density});
    await expect(page.locator('.cx-row')).toHaveCSS('height',height + 'px');
    await expect(page.locator('.cx-row .cx-cell')).toHaveCSS('padding-left',padding + 'px');
    await page.evaluate(() => grid.destroy());
  }
  await mount(page,{...base,density:"comfortable",rowHeight:29});
  await expect(page.locator('.cx-row')).toHaveCSS('height','29px');
});

test("Graphite rows are unstriped by default and preserve explicit zebra styling",async({page})=>{
  const view={...base,rows:[...base.rows,{id:'r2',cells:{name:'Second record'}}]};
  await mount(page,view);await expect(page.locator('.cx-row.cx-alt')).toHaveCount(0);
  const backgrounds=await page.locator('.cx-row').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).backgroundColor));
  expect(backgrounds[0]).toBe(backgrounds[1]);await page.evaluate(()=>grid.destroy());
  await mount(page,{...view,zebra:true});await expect(page.locator('.cx-row.cx-alt')).toHaveCount(1);
});

test("numeric headers align their control group and selected pinned cells remain opaque",async({page})=>{
  await page.setViewportSize({width:650,height:900});await mount(page,{...base,columns:[...base.columns,{id:'amount',title:'Amount',kind:'number',width:180,sortable:true},{id:'note',title:'Note',kind:'text',width:600}],rows:[{id:'r1',tone:'warning',cells:{name:'First record',amount:20,note:'Wide scrolling content'}}]});
  const header=page.locator('.cx-hcell[data-cx-column="amount"]');
  expect(await header.evaluate(cell=>cell.querySelector('.cx-sort').getBoundingClientRect().left-cell.getBoundingClientRect().left)).toBeGreaterThan(40);
  await page.evaluate(()=>{grid.setColumnPinned('name','left');grid.setSelection(['r1']);});
  const row=page.locator('.cx-row[data-cx-id="r1"]');await expect(row).toHaveAttribute('aria-selected','true');await row.hover();
  expect(await row.evaluate(element=>getComputedStyle(element.querySelector('[data-cx-pin]')).backgroundColor)).toBe(await row.evaluate(element=>getComputedStyle(element).backgroundColor));
  expect(await row.evaluate(element=>getComputedStyle(element.querySelector('[data-cx-pin]'),'::before').width)).toBe('2px');
  expect(await row.evaluate(element=>getComputedStyle(element.querySelector('[data-cx-pin]')).position)).toBe('sticky');
  const pinned=row.locator('[data-cx-pin]'),start=await pinned.boundingBox();
  await page.locator('.cx-grid').evaluate(element=>element.scrollLeft=200);
  await expect.poll(async()=>(await pinned.boundingBox()).x).toBeCloseTo(start.x,0);
  expect(await pinned.evaluate(element=>getComputedStyle(element,'::after').width)).toBe('3px');
  expect(await pinned.evaluate(element=>getComputedStyle(element,'::after').left)).toBe('2px');
  await page.evaluate(()=>grid.setColumnPinned('amount','left'));
  const cells=row.locator('[data-cx-pin="left"]');await expect(cells).toHaveCount(2);
  expect((await cells.nth(1).boundingBox()).x).toBeCloseTo((await cells.nth(0).boundingBox()).x+220,0);
  await page.setViewportSize({width:390,height:900});
  await expect(row.locator('[data-cx-pin="left"]')).toHaveCount(1);
});

test("Graphite toolbar separates search, selection and the accepted result line", async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await mount(page, {...base,noun:"servers"});
  await expect(page.locator('.cx-grid-query-summary')).toBeHidden();
  await expect(page.locator('.cx-selbar')).toBeHidden();
  const order = await page.locator('.cx-toolbar').evaluate(toolbar => [...toolbar.children].map(item => item.className));
  expect(order.slice(0,4)).toEqual(['cx-search','cx-columns cx-grid-filters','cx-columns cx-grid-columns','cx-columns cx-grid-views']);
  await page.locator('.cx-row').focus(); await page.keyboard.press('/');
  await expect(page.locator('.cx-search-input')).toBeFocused();
  await page.locator('.cx-search-input').fill('First');
  await expect(page.locator('.cx-grid-query-summary')).toBeVisible();
  await expect(page.locator('.cx-grid-result-count')).toHaveText('1 of 1 servers');
  await page.evaluate(() => grid.setSelection(['r1']));
  await expect(page.locator('.cx-selbar')).toBeVisible();
  await expect(page.locator('.cx-selbar')).toContainText('1 selected');
  await expect(page.locator('.cx-selbar button')).toHaveCount(2);
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'toolbar-light-1440.png')});
  await page.locator('.cx-selbar button[aria-label="Clear selection"]').click();
  await expect(page.locator('.cx-selbar')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#host')).toHaveClass(/cx-phone/);
  await page.locator('.cx-grid-overflow > summary').click();
  await expect(page.locator('.cx-grid-overflow .cx-grid-views')).toBeVisible();
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'toolbar-overflow-light-390.png')});
});
