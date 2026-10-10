import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {runtimeAssets} from './support.mjs';
import path from 'node:path';

const columns=[
  {id:'name',title:'Name',kind:'text',width:200,presenter:{kind:'identifier',mono:true}},
  {id:'flag',title:'Enabled',kind:'text',width:90,presenter:{kind:'boolean'}},
  {id:'state',title:'State',kind:'text',width:120,presenter:{kind:'enum',tones:{Healthy:'success',Failing:'danger'}}},
  {id:'change',title:'Latency',kind:'number',width:130,presenter:{kind:'change',deltaColumn:'delta'},aggregatable:true},
  {id:'delta',title:'Delta',kind:'number',width:70,hidden:true},
  {id:'history',title:'History',kind:'text',width:150,presenter:{kind:'statusStrip'}},
  {id:'trend',title:'Trend',kind:'text',width:120,presenter:{kind:'sparklineLine',thresholds:[{upperBound:10,tone:'success'},{upperBound:30,tone:'warning'}]}},
  {id:'tags',title:'Tags',kind:'text',width:160,presenter:{kind:'tags',separator:','}},
  {id:'notes',title:'Notes',kind:'text',width:230,wrap:true}
];
const periods=Array.from({length:90},(_,i)=>({period:'Day '+(i+1),state:i===31?'Failing':'Healthy',tone:i===31?'danger':'success'}));
const base={protocol:'canopyx/2',type:'grid',id:'presenters',label:'Presenter gallery',columns,pageSize:100,selection:'multiple',search:true,source:{kind:'inline'},rows:[
  {id:'one',cells:{name:{value:'alpha',secondary:'example.test'},flag:true,state:'Healthy',change:142,delta:-6,history:{value:'Healthy',series:periods},trend:{value:'Trend',series:periods.slice(0,10).map((point,i)=>({...point,value:i*5}))},tags:'One,Two,Three,Four,Five',notes:'A long paragraph. '.repeat(80)}},
  {id:'two',cells:{name:'beta',flag:false,state:'Failing',change:318,delta:84,history:{value:'No data',series:[{period:'Today'}]}}}
]};
async function open(page,theme='light',view=base) {
  const {script,style}=runtimeAssets('grid');
  await page.setContent('<!doctype html><html lang="en"><head><title>Presenters</title><style>'+style+'</style></head><body><main><h1>Presenter gallery</h1><div id="host" data-cx-theme="'+theme+'"></div></main></body></html>');
  await page.addScriptTag({content:script});await page.evaluate(async view=>{window.grid=CanopyX.createDataGrid(document.querySelector('#host'),{view});await grid.ready;},view);
}

test('long bar histories preserve an early worst period and the last-period marker within the available width',async({page})=>{
  for(const mark of ['worst','last']){
    const column={id:'history',title:'Daily history',kind:'text',width:120,fixed:true,presenter:{kind:'sparklineBars',mark,thresholds:[{upperBound:10,tone:'success'},{upperBound:100,tone:'danger'}]}};
    const series=periods.map((point,index)=>({period:point.period,value:index===2?75:5}));
    await open(page,'light',{...base,columns:[column],rows:[{id:'one',cells:{history:{value:'90 daily samples',series}}}]});
    const bars=page.locator('.p-spark');expect(await bars.locator('i').count()).toBeLessThan(90);
    await expect(bars.locator('i.danger')).toHaveCount(1);await expect(bars.locator('i.danger')).toHaveAttribute('title',/Day 1.*75/);
    await expect(bars.locator('.cx-history-mark')).toHaveCount(1);
    await expect(bars.locator('.cx-history-mark')).toHaveAttribute('title',mark==='worst'?/75/:/Day 90/);
    expect(await bars.evaluate(element=>element.getBoundingClientRect().width)).toBeLessThanOrEqual(96);
    await page.evaluate(()=>grid.destroy());
  }
});
test('ordinary column presenters preserve raw exports, long strip periods and accessible names',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await open(page);
  const first=page.locator('.cx-row[data-cx-id="one"]');
  await expect(first.getByRole('img',{name:'Yes',exact:true})).toBeVisible();
  await expect(page.locator('.cx-row[data-cx-id="two"]').getByRole('img',{name:'No',exact:true})).toHaveText('—');
  await expect(first.locator('.p-state.quiet')).toHaveText('Healthy');
  await expect(first.locator('.p-delta.good')).toHaveText('↓ 6');
  await expect(first.locator('.p-tag')).toHaveCount(3);await expect(first.getByRole('button',{name:'Tags: show complete text'})).toHaveText('+2');
  const strip=first.locator('.p-strip');expect(await strip.locator('i').count()).toBeLessThan(90);
  expect(await strip.locator('i').evaluateAll(items=>items.reduce((sum,item)=>sum+Number(item.dataset.cxPeriods),0))).toBe(90);
  await expect(strip.locator('i.danger')).toHaveCount(1);await expect(strip.locator('i.danger')).toHaveAttribute('title',/Day .*Failing/);
  expect(await strip.evaluate(item=>item.getBoundingClientRect().width)).toBeLessThanOrEqual(126);
  const rows=await page.evaluate(async()=>{const records=[];for await(const row of grid.prepareExport({scope:'all',raw:true}).rows())records.push(row);return records;});
  expect(rows[0].cells.change.value).toBe(142);expect(rows[0].cells.history.value).toBe('Healthy');
  if(process.env.CANOPYX_EVIDENCE)await page.screenshot({path:path.join(process.env.CANOPYX_EVIDENCE,'presenters-light-1440.png')});
  await first.getByRole('button',{name:'Notes: show complete text'}).click();await expect(page.getByRole('dialog').locator('pre')).toHaveText(base.rows[0].cells.notes);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
for(const theme of ['light','dark'])test('Graphite presenter contrast and semantics pass axe in '+theme,async({page})=>{
  await open(page,theme);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
