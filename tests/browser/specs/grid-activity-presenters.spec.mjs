import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import {runtimeAssets,repo} from './support.mjs';

// Relative times, logs, state pills and run-history slots: what readers see and hear, kept current by one clock per grid.
const now=Date.parse('2026-11-11T12:00:00Z');
const at=offset=>new Date(now+offset).toISOString();
const events=[
  {time:'2026-11-11T02:00:01Z',kind:'INFO',summary:'Started nightly backup'},
  {time:'2026-11-11T02:00:04Z',kind:'DEBUG',summary:'Loaded configuration'},
  {time:'2026-11-11T02:00:09Z',kind:'WARN',summary:'Batch 3 was slow'},
  {time:'2026-11-11T02:00:21Z',kind:'ERROR',summary:'Could not write to the destination share: the remote volume reported insufficient free space'}
];
const runs=[{period:'Mon',value:40,state:'Succeeded',tone:'success'},{period:'Tue'},{period:'Wed',value:2,state:'Failed',tone:'danger'},{period:'Thu',value:20,state:'Succeeded',tone:'success'}];
function view(options={}){
  return {protocol:'canopyx/2',type:'grid',id:'jobs',label:'Scheduled jobs',pageSize:100,selection:'single',search:true,source:{kind:'inline'},timeZone:'utc',...options.view,
    columns:[
      {id:'name',title:'Job',kind:'text',width:160},
      {id:'state',title:'State',kind:'text',width:130,presenter:{kind:'state',style:'pill',tones:{Active:'success',Error:'danger'},icons:{'Read-only':'🔒'}}},
      {id:'schedule',title:'Schedule',kind:'text',width:90,hidden:true},
      {id:'next',title:'Next run',kind:'datetime',width:170,sortable:true,presenter:{kind:'relativeTime',secondaryColumn:'schedule'}},
      {id:'last',title:'Last run',kind:'datetime',width:130,presenter:{kind:'relativeTime'}},
      {id:'runs',title:'Recent runs',kind:'text',width:110,presenter:{kind:'sparklineBars',slots:true}},
      {id:'log',title:'Log',kind:'text',width:380,presenter:{kind:'log',lines:2}},
      {id:'raw',title:'Raw log',kind:'text',width:300,presenter:{kind:'log',split:true}}
    ],
    rows:[
      {id:'backup',cells:{name:'Nightly backup',state:'Active',schedule:'At 02:00',next:at(3*36e5),last:at(-27e3),runs:{value:'2 of 3 runs succeeded',series:runs},
        log:{value:events.map(event=>event.summary).join('\n'),events},raw:'02:00:01 INFO Started\n02:00:09 ERROR Failed'}},
      {id:'audit',cells:{name:'Audit archive',state:'Read-only',schedule:'Every 15 min',next:at(-30*36e5),last:at(-2*864e5),runs:{value:'No runs',series:[{period:'Mon'}]},log:''}}
    ]};
}
async function open(page,definition=view(),theme='light'){
  const {script,style}=runtimeAssets('grid'),asset=name=>fs.readFileSync(path.join(repo,'CanopyX.Html/Assets/'+name),'utf8');
  await page.clock.setFixedTime(now);
  await page.setContent('<!doctype html><html lang="en"><head><title>Jobs</title><style>'+style+asset('canopyx-activity.css')+'</style></head><body><main><h1>Jobs</h1><div id="host" data-cx-theme="'+theme+'"></div></main></body></html>');
  await page.addScriptTag({content:script+'\n'+asset('canopyx-activity.js')});
  await page.evaluate(async definition=>{window.grid=CanopyX.createDataGrid(document.querySelector('#host'),{view:definition});await grid.ready;},definition);
}
const row=(page,id)=>page.locator('.cx-row[data-cx-id="'+id+'"]');

test('relative times read in the page language, name the exact time and stay current on one clock',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await open(page);
  const next=row(page,'backup').locator('.p-when').first(),last=row(page,'backup').locator('.p-when').nth(1);
  await expect(next.locator('time')).toHaveText('in 3 hr.');await expect(next).toHaveAttribute('title','2026-11-11 15:00 UTC');
  await expect(next.locator('.p-sub')).toHaveText('At 02:00');
  await expect(last.locator('time')).toHaveText('27 sec. ago');
  await expect(row(page,'audit').locator('.p-when time').first()).toHaveText('yesterday');
  // The cell's accessible text carries the relative time, then the exact time and the secondary text.
  expect(await next.evaluate(element=>element.closest('[role="gridcell"]').textContent)).toBe('in 3 hr., 2026-11-11 15:00 UTC,At 02:00');
  await page.clock.setFixedTime(now+1000);await expect(last.locator('time')).toHaveText('28 sec. ago');
  // A hidden page stops the clock; showing it again repaints at once.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.setFixedTime(now+61000);await page.waitForTimeout(1500);await expect(last.locator('time')).toHaveText('28 sec. ago');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(last.locator('time')).toHaveText('1 min. ago');
  // Sorting and exports keep the raw timestamp.
  const rows=await page.evaluate(async()=>{const records=[];for await(const item of grid.prepareExport({scope:'all',raw:true}).rows())records.push(item);return records;});
  expect(rows.map(item=>item.cells.next.value).sort()).toEqual([at(-30*36e5),at(3*36e5)]);
  await page.evaluate(()=>grid.sort([{column:'next',direction:'asc'}]));
  await expect(page.locator('.cx-row').first()).toHaveAttribute('data-cx-id','audit');
  await page.evaluate(()=>grid.destroy());
  expect(await page.locator('.p-when').count()).toBe(0);
});

test('state pills, run slots and log previews keep text as the meaning',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await open(page);
  const active=row(page,'backup').locator('.p-status');
  await expect(active).toHaveText('Active');await expect(active).toHaveClass(/success/);
  await expect(active.locator('.p-dot')).toHaveAttribute('aria-hidden','true');
  const locked=row(page,'audit').locator('.p-status');
  await expect(locked).toHaveText('🔒Read-only');await expect(locked.locator('.p-glyph')).toHaveAttribute('aria-hidden','true');
  const slots=row(page,'backup').locator('.p-slots');
  await expect(slots).toHaveAttribute('aria-label','Recent runs: 2 of 3 runs succeeded');
  await expect(slots.locator('i')).toHaveCount(4);await expect(slots.locator('i.empty')).toHaveAttribute('title','Tue: No data');
  expect(await slots.locator('i.danger').evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(14);
  // Fixed rows preview the first line and open the complete log in the text dialog.
  const preview=row(page,'backup').locator('.p-log-preview').first();
  await expect(preview.locator('.p-log-line')).toHaveCount(1);await expect(preview.locator('.p-log-time')).toHaveText('02:00:01');
  await expect(preview.locator('.p-log-time')).toHaveAttribute('title','2026-11-11 02:00 UTC');
  await preview.getByRole('button',{name:'Log: show complete text'}).click();
  await expect(page.getByRole('dialog')).toContainText('insufficient free space');
  await page.keyboard.press('Escape');
  const split=row(page,'backup').locator('.p-log-preview').nth(1);
  await expect(split.locator('.p-log-level')).toHaveText('INFO');await expect(split.locator('.p-log-message')).toHaveText('Started');
  await expect(row(page,'audit').locator('.p-log-preview, .p-missing').last()).toHaveText('—');
  const results=await new AxeBuilder({page}).include('#host').analyze();expect(results.violations).toEqual([]);
});

test('logs in rows that size to content bound their lines, show all in place and copy the whole log',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await open(page,view({view:{rowHeight:'auto'}}),'dark');
  const log=row(page,'backup').locator('.p-log').first();
  await expect(log.locator('.p-log-line')).toHaveCount(2);
  await expect(log.locator('.p-log-level').nth(1)).toHaveClass(/cx-tone-muted/);
  const before=await row(page,'backup').evaluate(element=>element.offsetHeight);
  await log.getByRole('button',{name:'Show all 4'}).click();
  await expect(log.locator('.p-log-line')).toHaveCount(4);await expect(log.locator('.p-log-level').nth(3)).toHaveClass(/cx-tone-danger/);
  await expect(log.getByRole('button',{name:'Copy: Log'})).toBeFocused();
  await expect.poll(()=>row(page,'backup').evaluate(element=>element.offsetHeight)).toBeGreaterThan(before);
  // The message wraps within the column instead of widening the row.
  expect(await log.evaluate(element=>element.scrollWidth<=element.closest('[role="gridcell"]').clientWidth)).toBe(true);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.copied=text;return Promise.resolve();}}}));
  await log.getByRole('button',{name:'Copy: Log'}).click();
  await expect.poll(()=>page.evaluate(()=>window.copied)).toBe(events.map(event=>event.time.slice(11,19)+' '+event.kind+' '+event.summary).join('\n'));
  await expect(page.locator('#host .cx-live')).toHaveText('Copied to the clipboard');
});
