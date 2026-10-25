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

test('filter builder value fields are single-line typed inputs, with date presets and faceted membership',async({page})=>{
  await open(page);await openGridControl(page,'filters');
  // Membership first: the live date preset below narrows the full-query facet counts once it applies.
  const membership=await addCondition(page,'state','in'),summary=membership.locator('.cx-ms > summary');
  const control=await box(membership.getByRole('combobox',{name:'Column',exact:true}));
  expect((await box(summary)).height).toBe(control.height);await expect(summary).toHaveText('Choose a value');
  await summary.click();await expect(membership.locator('.cx-val')).toHaveCount(2);
  // The opened list grows its own cell; the row's controls keep one top line and the joiner word stays centred on it.
  const tops=await Promise.all([membership.getByRole('combobox',{name:'Column',exact:true}),membership.getByRole('combobox',{name:'Condition',exact:true}),summary,membership.getByRole('button',{name:'Remove condition',exact:true})].map(async item=>(await box(item)).top));
  expect(Math.max(...tops)-Math.min(...tops)).toBeLessThanOrEqual(0.5);const word=await box(membership.locator('.w'));expect(Math.abs((word.top+word.bottom)/2-(tops[0]+control.height/2))).toBeLessThanOrEqual(1);
  expect(await membership.locator('.cx-val').evaluateAll(rows=>rows.map(row=>[row.textContent.replace(/\d+$/,''),row.querySelector('.cx-val-n').textContent]))).toEqual([['Failing','8'],['Healthy','22']]);
  const failing=membership.locator('.cx-val').filter({hasText:'Failing'}).locator('input');await failing.check();await expect(summary).toHaveText('Failing');
  await failing.press('Escape');await expect(membership.locator('.cx-ms')).not.toHaveAttribute('open','');await expect(panel(page)).toBeVisible();
  const row=await addCondition(page,'name');
  await expect(row.locator('input.cx-grid-filter-value')).toHaveJSProperty('type','text');
  await row.getByRole('combobox',{name:'Column',exact:true}).selectOption('amount');await expect(row.locator('input.cx-grid-filter-value')).toHaveAttribute('type','number');
  await row.getByRole('combobox',{name:'Column',exact:true}).selectOption('date');await expect(row.locator('input.cx-grid-filter-value')).toHaveAttribute('type','datetime-local');
  expect((await box(row.locator('input.cx-grid-filter-value'))).height).toBe(control.height);
  expect(await row.getByRole('combobox',{name:'Condition',exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value))).toEqual(expect.arrayContaining(['today','yesterday','last7','last30','month']));
  await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption('last7');await expect(row.locator('.cx-condition-value:visible')).toHaveCount(0);
  await expect(panel(page).locator('textarea')).toHaveCount(0);
  await flushGridFilters(page,false);
  const filters=(await query(page)).filters;expect(filters[0]).toEqual({column:'state',operator:'in',values:['Failing']});
  expect(filters.slice(1).map(item=>[item.column,item.operator])).toEqual([['date','ge'],['date','lt']]);
  expect(Date.parse(filters[2].values[0])-Date.parse(filters[1].values[0])).toBe(7*86400000);
});
test('filter builder caps its height to the viewport and scrolls conditions between a visible header and footer',async({page})=>{
  await page.setViewportSize({width:1440,height:620});
  await open(page,{rows:base.rows.slice(0,3),pageLength:3});
  await setQuery(page,{filters:Array.from({length:12},(_,i)=>({column:'amount',operator:'ne',values:[100+i]}))});
  await openGridControl(page,'filters');
  const pop=await box(panel(page)),grid=await box(page.locator('[data-canopyx-host]'));
  expect(pop.bottom).toBeGreaterThan(grid.bottom);expect(pop.bottom).toBeLessThanOrEqual(620-8+0.5);
  const body=panel(page).locator('.cx-pop-b');
  expect(await body.evaluate(element=>element.scrollHeight>element.clientHeight&&getComputedStyle(element).overflowY==='auto')).toBe(true);
  const done=panel(page).getByRole('button',{name:'Done',exact:true}),clear=panel(page).getByRole('button',{name:'Clear all filters',exact:true});
  const visible=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===element||element.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});
  expect(await visible(done)).toBe(true);expect(await visible(clear)).toBe(true);expect(await visible(panel(page).locator('.cx-pop-h'))).toBe(true);
  const before=await box(done);await body.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  expect(await box(done)).toEqual(before);expect(await visible(done)).toBe(true);
});

test('phone filter builder is a full-screen sheet with its footer pinned',async({page})=>{
  await page.setViewportSize({width:390,height:700});
  await open(page);await setQuery(page,{filters:Array.from({length:12},(_,i)=>({column:'amount',operator:'ne',values:[100+i]}))});
  await openGridControl(page,'filters');
  expect(await box(panel(page))).toEqual({left:0,right:390,top:0,bottom:700,width:390,height:700});
  const done=await box(panel(page).getByRole('button',{name:'Done',exact:true}));expect(done.bottom).toBeLessThanOrEqual(700);expect(done.top).toBeGreaterThan(600);
  expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);
});

test('only a filtered header shows the filled accent funnel; column menus appear on hover and focus',async({page})=>{
  await open(page);await page.mouse.move(0,0);
  await expect(page.locator('.cx-grid-header-filter:visible')).toHaveCount(0);
  const opacity=column=>page.locator('[data-cx-column-menu="'+column+'"]').evaluate(element=>getComputedStyle(element).opacity);
  // A device with any coarse pointer (a touch screen) keeps every menu button visible, as the spec requires on touch.
  const rest=await page.evaluate(()=>matchMedia('(any-pointer:coarse)').matches)?'1':'0';
  expect(await opacity('name')).toBe(rest);
  expect(await page.locator('[data-cx-column-menu="name"] svg').evaluate(element=>getComputedStyle(element).rotate)).toBe('90deg');
  await page.locator('.cx-hcell[data-cx-column="name"]').hover();await expect.poll(()=>opacity('name')).toBe('1');
  await page.mouse.move(0,0);await expect.poll(()=>opacity('name')).toBe(rest);
  await page.locator('.cx-hcell[data-cx-column="state"] .cx-sort').focus();await expect.poll(()=>opacity('state')).toBe('1');
  await setQuery(page,{filters:[{column:'amount',operator:'gt',values:[5]}]});
  await expect(page.locator('.cx-grid-header-filter:visible')).toHaveCount(1);
  const funnel=page.locator('.cx-hcell[data-cx-column="amount"] .cx-grid-header-filter');await expect(funnel).toBeVisible();
  const colors=await funnel.evaluate(element=>{const svg=element.querySelector('svg'),probe=document.createElement('span');probe.style.color='var(--hfx-color-accent)';element.appendChild(probe);
    const result={fill:getComputedStyle(svg).fill,stroke:getComputedStyle(svg).stroke,accent:getComputedStyle(probe).color};probe.remove();return result;});
  expect(colors.fill).toBe(colors.accent);expect(colors.stroke).toBe(colors.accent);
  await funnel.click();const pop=page.getByRole('dialog',{name:'Amount: Filter…'});await expect(pop).toBeVisible();await pop.getByRole('spinbutton',{name:'Value',exact:true}).press('Escape');await expect(funnel).toBeFocused();
});

test('column value filter keeps Select all in the checkbox column with a right-aligned total',async({page})=>{
  await open(page);await menu(page,'State').click();await page.getByRole('menuitem',{name:'Filter…',exact:true}).click();
  const pop=page.getByRole('dialog',{name:'State: Filter…'});await expect(pop.locator('.cx-val')).toHaveCount(2);
  const all=pop.getByRole('checkbox',{name:'Select all values',exact:true}),first=pop.locator('.cx-val input').first();
  const allBox=await box(all),firstBox=await box(first);expect(Math.abs(allBox.left-firstBox.left)).toBeLessThanOrEqual(0.5);
  expect(await all.evaluate(input=>input===input.parentElement.firstElementChild)).toBe(true);
  const total=pop.locator('.cx-val-all .cx-val-n');await expect(total).toHaveText('2');
  expect(Math.abs((await box(total)).right-(await box(pop.locator('.cx-val .cx-val-n').first())).right)).toBeLessThanOrEqual(0.5);
  expect(await pop.locator('.cx-val-all').evaluate(label=>label.nextElementSibling.className)).toBe('cx-val-list');
});

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
