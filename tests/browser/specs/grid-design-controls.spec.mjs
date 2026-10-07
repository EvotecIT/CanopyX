import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {viewPage} from './support.mjs';
import path from 'node:path';
const base={protocol:'canopyx/2',type:'grid',id:'controls',label:'Control inventory',pageSize:50,selection:'multiple',search:true,timeZone:'local',source:{kind:'inline'},columns:[
  {id:'name',title:'Name',kind:'text',width:210,sortable:true},
  {id:'state',title:'State',kind:'text',width:140,sortable:true,presenter:{kind:'state',tones:{Healthy:'success',Failing:'danger'}}},
  {id:'amount',title:'Amount',kind:'number',width:130,sortable:true},
  {id:'date',title:'Date',kind:'datetime',width:200,sortable:true}
],rows:Array.from({length:20},(_,i)=>({id:'r'+i,cells:{name:'Record '+i,state:i%4?'Healthy':'Failing',amount:i,date:'2026-03-29T12:00:00Z'}}))};
async function open(page,patch={}){await page.route('http://canopyx.test/controls',route=>route.fulfill({contentType:'text/html',body:viewPage({...base,...patch}).replace('<body class="cx-page">','<body class="cx-page"><main><h1>Control inventory</h1>').replace('</body>','</main></body>')}));await page.goto('http://canopyx.test/controls');await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.ready);}
const menu=(page,column)=>page.getByRole('button',{name:'Menu for '+column,exact:true});
test('column menus have roving focus and generic sorting, pinning and hiding',async({page})=>{
  await open(page);await menu(page,'Amount').press('ArrowDown');const panel=page.getByRole('menu',{name:'Menu for Amount'});
  await expect(panel.getByRole('menuitem',{name:'Sort ascending',exact:true})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(panel.getByRole('menuitem',{name:'Sort descending',exact:true})).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  if(process.env.CANOPYX_EVIDENCE)await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'column-menu-light.png')});
  await page.keyboard.press('Home');await page.keyboard.press('Enter');await expect(page.locator('.cx-hcell[data-cx-column="amount"]')).toHaveAttribute('aria-sort','ascending');
  await menu(page,'Name').click();await page.getByRole('menuitem',{name:'Pin left',exact:true}).click();await expect(page.locator('.cx-hcell[data-cx-column="name"]')).toHaveAttribute('data-cx-pin','left');
  await menu(page,'Date').click();await page.getByRole('menuitem',{name:'Hide column',exact:true}).click();await expect(page.locator('.cx-hcell[data-cx-column="date"]')).toHaveCount(0);
});
test('header value filtering is scoped, live and counts the complete query',async({page})=>{
  await open(page);await menu(page,'State').click();await page.getByRole('menuitem',{name:'Filter…',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'State: Filter…'});await expect(panel.locator('.cx-val')).toHaveCount(2);
  await expect(panel.locator('.cx-val').filter({hasText:'Failing'}).locator('.cx-val-n')).toHaveText('5');
  await panel.locator('.cx-val').filter({hasText:'Failing'}).locator('input').uncheck();await expect(page.locator('.cx-grid-result-count')).toContainText('15');
  await expect(page.locator('.cx-grid-filters')).not.toHaveAttribute('open','');await expect(panel).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  if(process.env.CANOPYX_EVIDENCE)await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'column-filter-values-light.png')});
  await panel.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});
test.describe('date calendar boundaries',()=>{test.use({timezoneId:'Europe/Warsaw'});
  test('today uses grid local midnight through the daylight-saving transition',async({page})=>{
    await page.clock.setFixedTime(new Date('2026-03-29T10:00:00Z'));await open(page);await menu(page,'Date').click();await page.getByRole('menuitem',{name:'Filter…',exact:true}).click();
    const panel=page.getByRole('dialog',{name:'Date: Filter…'});await panel.getByRole('combobox',{name:'Range',exact:true}).selectOption('today');
    await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery().filterGroup?.filters.map(item=>item.values[0]))).toEqual(['2026-03-28T23:00:00.000Z','2026-03-29T22:00:00.000Z']);
    if(process.env.CANOPYX_EVIDENCE)await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'column-filter-date-light.png')});
  });
});

test('complex saved column conditions open the shared builder in an ordinary grid',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await open(page);
  await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.setQuery({filters:[
    {column:'amount',operator:'gt',values:[4]},{column:'amount',operator:'lt',values:[18]},{column:'amount',operator:'ne',values:[9]}
  ]}));
  await menu(page,'Amount').click();await page.getByRole('menuitem',{name:'Filter…',exact:true}).click();
  await page.getByRole('button',{name:'Edit as text',exact:true}).click();await expect(page.locator('form.cx-grid-filter-form')).toBeVisible();
  await expect(page.locator('.cx-grid-filter-form .cx-grid-filter')).toHaveCount(3);expect(errors).toEqual([]);
  await expect(page.locator('.cx-grid-result-count')).toContainText('12');
});
test('sentence builder applies typed groups and preserves deeper saved filters for text editing',async({page})=>{
  await open(page);await page.locator('.cx-grid-filters > summary').click();const form=page.locator('.cx-grid-filter-form');
  await form.getByRole('button',{name:'+ Group',exact:true}).first().click();const group=form.locator('.cx-group').first();await group.getByRole('button',{name:'+ Condition',exact:true}).click();
  const row=group.locator('.cx-grid-filter');await row.locator('select').nth(0).selectOption('amount');await row.locator('select').nth(1).selectOption('gt');await row.locator('input[type="number"]').fill('9');
  await expect(page.locator('.cx-grid-result-count')).toContainText('10');await expect(form.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0);
  if(process.env.CANOPYX_EVIDENCE)await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'filter-builder-group-light.png')});
  await form.getByRole('button',{name:'Done',exact:true}).click();
  await page.evaluate(async()=>{const api=document.querySelector('[data-canopyx-host]').canopyx;const condition={column:'amount',operator:'gt',values:[4]};await api.setQuery({filterGroup:{operator:'and',filters:[],groups:[{operator:'and',filters:[],groups:[{operator:'and',filters:[condition],groups:[]}]}]}});});
  await page.locator('.cx-grid-filters > summary').click();await expect(page.getByRole('textbox',{name:'Filter expression'})).toHaveAttribute('readonly','');
  await page.getByRole('button',{name:'Edit as text',exact:true}).click();await expect(page.getByRole('textbox',{name:'Filter expression'})).not.toHaveAttribute('readonly','');
  await page.getByRole('textbox',{name:'Filter expression'}).evaluate(input=>{
    input.value=JSON.stringify({filters:[{column:'amount',operator:'gt',values:[9]}]});input.dispatchEvent(new Event('input',{bubbles:true}));
    input.value='{';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await expect(form.locator('.cx-grid-control-error')).toHaveText('Enter a valid filter value.');
  await page.waitForTimeout(250);await expect(page.locator('.cx-grid-result-count')).toContainText('15');
  expect(await page.evaluate(()=>document.querySelector('[data-canopyx-host]').canopyx.getQuery().filterGroup.groups[0].groups[0].filters[0].values)).toEqual([4]);
});
