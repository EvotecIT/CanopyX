import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import {viewPage} from './support.mjs';
const definition={protocol:'canopyx/2',type:'grid',id:'states',label:'Services',noun:'services',emptyReason:'The inventory has not been connected.',pageSize:10,selection:'multiple',search:true,statusBar:true,source:{kind:'inline'},columns:[
 {id:'name',title:'Service',kind:'text',width:240,sortable:true,presenter:{kind:'identifier',mono:true},section:'Identity'},
 {id:'state',title:'State',kind:'text',width:140,presenter:{kind:'state',tones:{Healthy:'success',Failed:'danger'}},section:'Health'},
 {id:'amount',title:'Amount',kind:'number',width:140,aggregatable:true,section:'Health'},
 {id:'note',title:'Note',kind:'text',width:240,hidden:true,section:'Details'}
],rows:Array.from({length:40},(_,i)=>({id:'r'+i,cells:{name:{value:'Service '+i,secondary:'Inventory record'},state:i%3?'Healthy':'Failed',amount:i,note:'Complete record '+i}}))};
async function open(page,patch={},options=''){
 let html=viewPage({...definition,...patch});if(options)html=html.replace('</head>','<script>CanopyX.configure("states",'+options+');</script></head>');
 html=html.replace('<body class="cx-page">','<body class="cx-page"><main><h1>Services</h1>').replace('</body>','</main></body>');
 await page.route('http://canopyx.test/states',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('http://canopyx.test/states');
}
const api=(page,run)=>page.locator('[data-canopyx-host]').evaluate((host,source)=>eval(source)(host.canopyx),run.toString());
async function capture(page,name){if(process.env.CANOPYX_EVIDENCE)await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,name+'.png')});}
test('empty inventory and no matches have distinct reasons and a working clear action',async({page})=>{
 await open(page,{rows:[]});await api(page,api=>api.ready);await expect(page.getByRole('heading',{name:'No services',exact:true})).toBeVisible();await expect(page.getByText(definition.emptyReason,{exact:true})).toBeVisible();await capture(page,'state-empty-light');
 await open(page);await api(page,api=>api.ready);await api(page,api=>api.setQuery({search:'unavailable-name',filters:[{column:'amount',operator:'gt',values:[99]}]}));
 await expect(page.getByRole('heading',{name:'No matching services',exact:true})).toBeVisible();await expect(page.locator('.cx-state p')).toContainText('unavailable-name');await expect(page.locator('.cx-state p')).toContainText('1');await capture(page,'state-no-matches-light');
 await page.locator('.cx-state').getByRole('button',{name:'Clear all',exact:true}).click();await expect(page.locator('.cx-state')).toHaveCount(0);await expect(page.locator('.cx-row[data-cx-id]')).not.toHaveCount(0);
});
test('initial skeletons wait 150ms, reduced motion is static, and failure keeps accepted rows',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const time=new Date('2026-10-05T12:00:00Z');await page.clock.install({time});await page.clock.pauseAt(time);
 const options='{source:{query(query){return new Promise((resolve,reject)=>{window.__reply=()=>resolve({protocol:"canopyx/2",type:"gridPage",view:"states",offset:query.offset,total:40,matched:40,revision:"one",items:Array.from({length:Math.min(query.limit,40-query.offset)},(_,i)=>({id:"r"+(i+query.offset),cells:{name:"Service "+(i+query.offset),state:"Healthy",amount:i+query.offset}}))});window.__fail=()=>reject(new Error("Connection interrupted"));});}}}';
 await open(page,{source:{kind:'host'},rows:undefined,presentation:'paged',pageLength:10},options);await expect(page.locator('.cx-skel')).toHaveCount(0);await page.clock.runFor(149);await expect(page.locator('.cx-skel')).toHaveCount(0);await page.clock.runFor(2);
 await expect(page.locator('.cx-initial-skeleton .cx-skel')).toHaveCount(6);expect(await page.locator('.cx-skel i').first().evaluate(bar=>getComputedStyle(bar).animationName)).toBe('none');await capture(page,'state-loading-light');
 await page.evaluate(()=>window.__reply());await api(page,api=>api.ready);await page.clock.runFor(50);await expect(page.locator('.cx-initial-skeleton')).toHaveCount(0);
 await page.evaluate(()=>{document.querySelector('[data-canopyx-host]').canopyx.setQuery({search:'retry'}).catch(()=>{});});await page.evaluate(()=>window.__fail());await page.clock.runFor(50);
 await expect(page.getByRole('alert')).toContainText('Connection interrupted');await expect(page.locator('.cx-row[data-cx-id]')).not.toHaveCount(0);await capture(page,'state-error-light');
 await page.getByRole('button',{name:'Retry',exact:true}).click();await page.evaluate(()=>window.__reply());await page.clock.runFor(50);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('paged footer offers inline All and selected aggregates describe full records',async({page})=>{
 await open(page,{presentation:'paged',pageLength:10});await api(page,api=>api.ready);
 const choice=page.getByRole('combobox',{name:'Rows per page',exact:true});await expect(choice.locator('option')).toHaveText(['10','25','50','100','All']);
 await choice.selectOption('all');await expect.poll(()=>api(page,api=>api.getPaging().pageLength)).toBe(40);expect(await api(page,api=>api.getState().paging.allRows)).toBe(true);
 await api(page,api=>api.setSelection(['r2','r7']));await expect(page.locator('.cx-grid-status .agg')).toHaveText('Amount: 9');await expect(page.locator('.cx-grid-status .agg span')).toHaveAttribute('title',/Average: 4.5/);await capture(page,'paging-status-light');
 await api(page,api=>api.clearSelection());await expect(page.locator('.cx-grid-status .agg')).toBeEmpty();
});
for(const theme of ['light','dark'])test('record drawer uses all presenters, navigation, focus return and '+theme+' contrast',async({page})=>{
 await open(page);await api(page,api=>api.ready);await page.locator('[data-canopyx-host]').evaluate((host,theme)=>host.setAttribute('data-cx-theme',theme),theme);
 const row=page.locator('.cx-row[data-cx-id="r0"]');await row.focus();await row.press('Enter');const drawer=page.locator('.cx-drawer');await expect(drawer).toBeVisible();await expect(drawer.getByText('Complete record 0')).toBeVisible();await expect(drawer.locator('.p-state')).toHaveText('Failed');
 await page.keyboard.press('ArrowDown');await expect(drawer.getByRole('heading',{name:'Service 1',exact:true})).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await capture(page,'drawer-'+theme);
 await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(row).toBeFocused();
});
test('closing a drawer during a held adjacent-record load does not reopen it on completion',async({page})=>{
 const options='{source:{query(query){const reply={protocol:"canopyx/2",type:"gridPage",view:"states",offset:query.offset,total:40,matched:40,revision:"one",items:Array.from({length:Math.min(query.limit,40-query.offset)},(_,i)=>({id:"r"+(i+query.offset),cells:{name:"Service "+(i+query.offset),state:"Healthy",amount:i+query.offset}}))};if(query.offset===10)return new Promise(resolve=>window.__nextRecord=()=>resolve(reply));return reply;}}}';
 await open(page,{source:{kind:'host'},rows:undefined},options);await api(page,api=>api.ready);
 const row=page.locator('.cx-row[data-cx-id="r9"]');await row.focus();await row.press('Enter');await expect(page.locator('.cx-drawer')).toBeVisible();
 await page.keyboard.press('ArrowDown');await expect.poll(()=>page.evaluate(()=>typeof window.__nextRecord)).toBe('function');
 await page.keyboard.press('Escape');await expect(page.locator('.cx-drawer')).toHaveCount(0);await page.evaluate(()=>window.__nextRecord());
 await expect(page.locator('.cx-row[data-cx-id="r10"]')).toBeVisible();await expect(page.locator('.cx-drawer')).toHaveCount(0);
});

test('phone hidden fields open a full-screen drawer and overflow remains usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await api(page,api=>api.ready);const row=page.locator('.cx-row[data-cx-id="r0"]');await expect(row.locator('.cx-hidden-fields')).toHaveText('+1');
 await row.click();const drawer=page.locator('.cx-drawer');await expect(drawer).toBeVisible();expect(await drawer.evaluate(element=>Math.round(element.getBoundingClientRect().width))).toBe(390);await capture(page,'drawer-phone-light');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'More',exact:true}).click();await expect(page.locator('.cx-grid-overflow > .cx-grid-panel')).toBeVisible();await capture(page,'phone-toolbar-overflow-light');
});
