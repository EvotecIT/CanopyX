import {test,expect} from '@playwright/test';
import {viewPage,openGridControl,flushGridFilters} from './support.mjs';

// Reviewer parity checks against docs/design/data-grid-spec.html sections 03 (callout 4), 05, 06 and 08.
const base={protocol:'canopyx/2',type:'grid',id:'polish',label:'Polish inventory',pageSize:50,selection:'multiple',search:true,source:{kind:'inline'},presentation:'paged',pageLength:10,columns:[
  {id:'name',title:'Name',kind:'text',width:200,sortable:true},
  {id:'state',title:'State',kind:'text',width:140,sortable:true,presenter:{kind:'state',tones:{Healthy:'success',Failing:'danger'}}},
  {id:'amount',title:'Amount',kind:'number',width:130,sortable:true},
  {id:'date',title:'Date',kind:'datetime',width:200,sortable:true}
],rows:Array.from({length:30},(_,i)=>({id:'r'+i,cells:{name:'Record '+i,state:i%4?'Healthy':'Failing',amount:i,date:'2026-03-'+String(i%28+1).padStart(2,'0')+'T12:00:00Z'}}))};
async function open(page,patch={}){
  await page.route('http://canopyx.test/polish',route=>route.fulfill({contentType:'text/html',body:viewPage({...base,...patch}).replace('<body class="cx-page">','<body class="cx-page"><main><h1>Polish inventory</h1>').replace('</body>','</main></body>')}));
  await page.goto('http://canopyx.test/polish');await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.ready);
}
const query=page=>page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery());
const setQuery=(page,value)=>page.evaluate(value=>document.querySelector('[data-canopyx-host]').canopyx.setQuery(value),value);
const menu=(page,column)=>page.getByRole('button',{name:'Menu for '+column,exact:true});
const box=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
const panel=page=>page.locator('.cx-grid-filters > .cx-fb');
async function addCondition(page,column,operator){
  await panel(page).getByRole('button',{name:'+ Condition',exact:true}).first().click();
  const row=panel(page).locator('fieldset.cx-grid-filter').last();
  await row.getByRole('combobox',{name:'Column',exact:true}).selectOption(column);
  if(operator)await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption(operator);
  return row;
}

test('paging footer keeps the range left and groups rows per page with the pager on one line',async({page})=>{
  await open(page);
  const footer=await box(page.locator('.cx-grid-pager')),range=await box(page.locator('.cx-grid-page-range')),rows=await box(page.locator('.cx-grid-pager .cx-rpp')),pager=await box(page.locator('.cx-grid-pager .cx-pager'));
  expect(range.left-footer.left).toBeLessThanOrEqual(13);expect(footer.right-pager.right).toBeLessThanOrEqual(13);
  expect(pager.left-rows.right).toBeGreaterThanOrEqual(19);expect(pager.left-rows.right).toBeLessThanOrEqual(21);
  expect(rows.left-range.right).toBeGreaterThan(100);
  for(const item of [rows,pager])expect(Math.abs((item.top+item.bottom)/2-(range.top+range.bottom)/2)).toBeLessThanOrEqual(1);
  expect(rows.height).toBeLessThanOrEqual(32);
  expect(await page.locator('.cx-grid-pager > *').evaluateAll(items=>items.map(item=>item.className))).toEqual(['cx-grid-page-range','cx-grid-field cx-rpp','cx-pager']);
});

test('phone paging footer collapses to the compact pager',async({page})=>{
  await page.setViewportSize({width:390,height:700});await open(page);
  await expect(page.locator('.cx-grid-page-range')).toBeHidden();await expect(page.locator('.cx-grid-pager .cx-rpp')).toBeHidden();
  await expect(page.getByRole('button',{name:'First page',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'Next page',exact:true})).toBeVisible();
  const footer=await box(page.locator('.cx-grid-pager')),pager=await box(page.locator('.cx-grid-pager .cx-pager'));
  expect(Math.abs((pager.left-footer.left)-(footer.right-pager.right))).toBeLessThanOrEqual(1);expect(footer.height).toBeLessThanOrEqual(61);
});
