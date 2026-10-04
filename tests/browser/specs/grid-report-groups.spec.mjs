import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const aggregates = [
  {id:'count',column:'amount',operation:'count',label:'Amounts present'},
  {id:'sum',column:'amount',operation:'sum',label:'Total amount'},
  {id:'average',column:'amount',operation:'average',label:'Average amount'},
  {id:'minimum',column:'amount',operation:'minimum',label:'Minimum amount'},
  {id:'maximum',column:'amount',operation:'maximum',label:'Maximum amount'}
];
const definition = (extra={}) => ({protocol:'canopyx/2',type:'grid',id:'groups',label:'Grouped inventory',
  source:{kind:'inline'},rowHeight:28,pageSize:10,presentation:'paged',pageLength:5,selection:'multiple',search:true,
  reporting:{grouping:{column:'category',direction:'asc'},aggregates,selectionControls:true,viewStorage:'local'},stateKey:'group-report',
  columns:[{id:'name',title:'Name',kind:'text',width:200,sortable:true},{id:'category',title:'Category',kind:'text',width:150,sortable:true},
    {id:'amount',title:'Amount',kind:'number',width:150,sortable:true}],
  rows:Array.from({length:24},(_,i)=>({id:'r'+String(i).padStart(2,'0'),cells:{name:'Item '+i,category:i<8?'A':i<16?'B':null,
    amount:i%5===0?null:i}})),...extra});
async function open(page,view=definition(),setup='') {
  await page.route('http://canopyx.test/group-report',route=>route.fulfill({contentType:'text/html',body:viewPage(view)
    .replace('</head>','<script>'+setup+'</script></head>').replace('<body class="cx-page">','<body class="cx-page"><main><h1>Inventory</h1>')
    .replace('</body>','</main></body>')}));
  await page.goto('http://canopyx.test/group-report');await page.waitForSelector('[data-cx-ready]');await nextFrames(page);
}

test('full-query totals and contiguous group ranges precede paging; missing values and display text are distinct',async({page})=>{
  const view=definition();view.rows[1].cells.amount={value:1,text:'999'};
  await open(page,view);
  await expect(page.locator('[data-cx-column="category"] .cx-sort')).toBeDisabled();
  await expect(page.locator('[data-cx-column="amount"] .cx-sort')).toBeEnabled();
  const summary=await page.evaluate(api+'.getSummary()');
  expect(summary.matched).toBe(24);expect(summary.groups.map(g=>[g.value,g.offset,g.count])).toEqual([['A',0,8],['B',8,8],[null,16,8]]);
  const values=view.rows.map(r=>typeof r.cells.amount==='object'&&r.cells.amount!==null?r.cells.amount.value:r.cells.amount).filter(v=>v!==null);
  expect(summary.aggregates).toEqual({count:19,sum:values.reduce((a,b)=>a+b,0),average:values.reduce((a,b)=>a+b,0)/19,minimum:1,maximum:23});
  expect(await page.locator('.cx-row[data-cx-id]').count()).toBe(5);
  await page.evaluate(api+'.nextPage()');expect(await page.locator('.cx-grid-group').count()).toBe(2);
  expect(await page.evaluate(api+'.getSummary().groups')).toEqual(summary.groups);
  await page.evaluate(api+".setQuery({filters:[{column:'amount',operator:'ge',values:[10]}],sort:[{column:'amount',direction:'desc'}]})");
  const filtered=await page.evaluate(api+'.getSummary()');expect(filtered.matched).toBe(11);
  expect(filtered.groups.map(g=>g.value)).toEqual(['B',null]);
  expect(await page.evaluate(api+'.getQuery().sort')).toEqual([{column:'category',direction:'asc'},{column:'amount',direction:'desc'}]);
  const ids=await page.evaluate(`(async()=>{const ids=[];for await(const r of ${api}.prepareExport({scope:'filtered'}).rows())ids.push(r.id);return ids;})()`);
  expect(ids).toEqual(['r14','r13','r12','r11','r23','r22','r21','r19','r18','r17','r16']);
});

test('collapse is presentation only, preserves record selection/export/paging, and restores through named state',async({page})=>{
  const view=definition();view.reporting.layout={name:{minimum:40,maximum:400,pin:'left'},amount:{minimum:40,maximum:400,pin:'right'}};
  await open(page,view);const key=await page.evaluate(api+'.getSummary().groups[0].key');
  await page.evaluate(api+'.selectPage()');await page.evaluate(api+`.setGroupCollapsed(${JSON.stringify(key)},true)`);
  const heading=await page.locator('.cx-grid-group').first().evaluate(row=>({width:row.closest('.cx-grid').querySelector('.cx-hrow').getBoundingClientRect().width,
    cell:row.firstElementChild.getBoundingClientRect().width,pin:row.firstElementChild.getAttribute('data-cx-pin')}));
  expect(heading.cell).toBeCloseTo(heading.width,0);expect(heading.pin).toBe(null);
  expect(await page.locator('.cx-row[data-cx-id]').count()).toBe(0);
  expect((await page.evaluate(api+'.getSelection()')).length).toBe(5);
  const ids=await page.evaluate(`(async()=>{const ids=[];for await(const r of ${api}.prepareExport({scope:'filtered'}).rows())ids.push(r.id);return ids;})()`);
  expect(ids.length).toBe(24);expect(await page.evaluate(api+'.getSummary().matched')).toBe(24);
  await page.evaluate(api+".saveView('Collapsed')");await page.evaluate(api+`.setGroupCollapsed(${JSON.stringify(key)},false)`);
  await page.evaluate(api+".applySavedView('Collapsed')");expect(await page.evaluate(api+'.getCollapsedGroups()')).toEqual([key]);
  expect(await page.evaluate(api+'.getShareState().collapsedGroups')).toBe(undefined);
  await page.evaluate(api+'.nextPage()');expect(await page.locator('.cx-row[data-cx-id]').count()).toBe(2);
  await page.evaluate(api+".setQuery({search:'Item 23'})");expect(await page.evaluate(api+'.getSummary().matched')).toBe(1);
  expect(await page.locator('.cx-grid-group').count()).toBe(1);
});

test('group keyboard navigation and compact themes retain flat-grid ARIA and ordered rows',async({page})=>{
  await page.setViewportSize({width:390,height:700});await open(page);
  await page.locator('[data-canopyx-host]').evaluate(h=>h.dataset.cxTheme='dark');
  const header=page.locator('.cx-grid-group').first();await header.focus();await header.press('ArrowDown');
  expect(await page.evaluate('document.activeElement.dataset.cxId')).toBe('r00');
  await page.keyboard.press('ArrowUp');expect(await page.evaluate('document.activeElement.classList.contains("cx-grid-group")')).toBe(true);
  await page.keyboard.press('ArrowLeft');expect(await page.locator('.cx-row[data-cx-id]').count()).toBe(0);
  await page.keyboard.press('Home');expect(await page.evaluate('document.activeElement.classList.contains("cx-grid-group")')).toBe(true);
  await page.keyboard.press('Control+End');expect(await page.evaluate('document.activeElement.dataset.cxId')).toBe('r23');
  expect(await page.locator('.cx-grid').getAttribute('role')).toBe('grid');
  const order=await page.locator('.cx-canvas > .cx-row').evaluateAll(rows=>rows.map(r=>Number(r.getAttribute('aria-rowindex'))));
  expect(order).toEqual([...order].sort((a,b)=>a-b));
  expect((await new AxeBuilder({page}).include('[data-canopyx-host]').analyze()).violations).toEqual([]);
});

test('folded and natural equivalent raw values still form distinct contiguous groups with deterministic ties',async({page})=>{
  const view=definition({presentation:'continuous',reporting:{grouping:{column:'category',direction:'asc'},aggregates:[],ordering:{category:{text:'foldedNatural'}}}});
  view.rows=['item2','Item02','item02','ITEM2','item10'].map((category,i)=>({id:'r'+i,cells:{name:'Record',category,amount:i}}));
  await open(page,view);expect((await page.evaluate(api+'.getSummary().groups')).map(g=>g.value)).toEqual(['ITEM2','Item02','item02','item2','item10']);
  expect(await page.locator('.cx-grid-group').count()).toBe(5);
});

const hostedSetup=`window.summaryCalls=[];window.pageCalls=[];window.holdSummary=false;window.invalidSummary='';
  const category=i=>i<500000?'A':'B';
  CanopyX.configure('groups',{cachePageLimit:2,source:{query(q){pageCalls.push(q);return {protocol:'canopyx/2',type:'gridPage',view:q.view,
    revision:'snapshot',offset:q.offset,total:1000000,matched:1000000,
    items:Array.from({length:Math.min(q.limit,1000000-q.offset)},(_,i)=>({id:'host-'+(q.offset+i),cells:{name:'Inventory',category:category(q.offset+i),amount:q.offset+i}}))};},
    summary(q,{signal}){summaryCalls.push(q);window.summarySignal=signal;
      const result={protocol:'canopyx/2',type:'gridSummary',view:q.view,revision:'snapshot',query:q,matched:1000000,aggregates:{},
        groups:[{key:'first',value:'A',offset:0,count:500000,aggregates:{}},{key:'second',value:'B',offset:500000,count:500000,aggregates:{}}]};
      if(invalidSummary==='revision')result.revision='other';
      if(invalidSummary==='query')result.query={...q,search:'other'};
      if(invalidSummary==='echo') {result.query={...q};delete result.query.type;}
      if(invalidSummary==='gap')result.groups[1].offset++;
      if(invalidSummary==='page')result.groups[0].value='Wrong';
      if(holdSummary)return new Promise(resolve=>window.resolveSummary=()=>resolve(result));return result;
  }}});`;
const hostedView = () => definition({source:{kind:'host'},rows:undefined,presentation:'continuous',reporting:{grouping:{column:'category',direction:'asc'},aggregates:[]}});

test('a million hosted rows retain sparse groups, bounded pages and record-based scrolling',async({page})=>{
  await open(page,hostedView(),hostedSetup);
  expect((await page.evaluate(api+'.getSummary().groups')).length).toBe(2);
  expect(await page.evaluate('summaryCalls.length')).toBe(1);
  await page.evaluate(api+'.scrollToRow(999999)');await nextFrames(page);
  expect(await page.locator('.cx-row[data-cx-id="host-999999"]').count()).toBe(1);
  expect(await page.locator('.cx-canvas > .cx-row').count()).toBeLessThan(80);
  expect(await page.evaluate('summaryCalls.length')).toBe(1);
  expect((await page.evaluate('pageCalls.map(q=>q.offset)')).every(offset=>offset>=0)).toBe(true);
  await page.evaluate(api+".setGroupCollapsed('first',true)");
  expect(await page.locator('.cx-grid').getAttribute('aria-rowcount')).toBe('500003');
  expect(await page.evaluate(api+'.getPaging().matched')).toBe(1000000);
});

test('host summary cancellation and stale responses cannot replace the accepted query',async({page})=>{
  await open(page,hostedView(),hostedSetup);
  await page.evaluate(`(()=>{holdSummary=true;window.retired=${api}.setQuery({search:'old'}).catch(e=>e.name);})()`);
  await expect.poll(()=>page.evaluate('summaryCalls.length')).toBe(2);
  await page.evaluate('window.oldSignal=summarySignal;holdSummary=false');
  await page.evaluate(api+".setQuery({search:'new'})");
  expect(await page.evaluate('retired')).toBe('AbortError');expect(await page.evaluate('oldSignal.aborted')).toBe(true);
  await page.evaluate('resolveSummary()');await nextFrames(page);
  expect(await page.evaluate(api+'.getSummary().query.search')).toBe('new');
  await page.evaluate(`(()=>{holdSummary=true;window.destroyedQuery=${api}.setQuery({search:'never'}).catch(e=>e.name);})()`);
  await expect.poll(()=>page.evaluate('summaryCalls.length')).toBe(4);
  await page.evaluate(api+'.destroy()');expect(await page.evaluate('destroyedQuery')).toBe('AbortError');
});

test('inconsistent host summaries fail visibly without replacing the prior query or totals',async({page})=>{
  await open(page,hostedView(),hostedSetup);const before=await page.evaluate(api+'.getSummary()');
  for(const mode of ['revision','query','echo','gap','page']) {
    await page.evaluate(mode=>window.invalidSummary=mode,mode);
    const error=await page.evaluate(api+`.setQuery({search:${JSON.stringify(mode)}}).catch(e=>e.message)`);
    expect(error).toContain('CanopyX:');await expect(page.locator('.cx-grid-notice')).toBeVisible();
    expect(await page.evaluate(api+'.getSummary()')).toEqual(before);
    expect(await page.evaluate(api+'.getQuery().search')).toBe('');
  }
});

test('datetime groups merge equivalent instants and retain UTC millisecond order and missing-last semantics',async({page})=>{
  const view=definition({presentation:'continuous',reporting:{grouping:{column:'when',direction:'desc'},aggregates:[]}});
  view.columns.push({id:'when',title:'Updated',kind:'datetime',width:180,sortable:true});
  const dates=['2026-10-04T12:00:00.001Z','2026-10-04T14:00:00.000+02:00','2026-10-04T12:00:00.0009Z',null];
  view.rows=dates.map((when,i)=>({id:'r'+i,cells:{name:'Record',category:'A',amount:i,when}}));
  await open(page,view);const groups=await page.evaluate(api+'.getSummary().groups');
  expect(groups.map(g=>[g.offset,g.count])).toEqual([[0,1],[1,2],[3,1]]);
  expect(groups[2].value).toBe(null);
  const ids=await page.evaluate(`(async()=>{const ids=[];for await(const r of ${api}.prepareExport({scope:'filtered'}).rows())ids.push(r.id);return ids;})()`);
  expect(ids).toEqual(['r0','r1','r2','r3']);
});

test('typed boolean groups and normalized text operators preserve distinct raw equality',async({page})=>{
  const view=definition({presentation:'continuous',reporting:{grouping:{column:'category',direction:'asc'},aggregates:[]}});
  view.rows=[true,'true',false,'FALSE'].map((category,i)=>({id:'r'+i,cells:{name:'Record',category,amount:i}}));
  await open(page,view);
  await page.evaluate(api+".setQuery({filters:[{column:'category',operator:'eq',values:[true]}]})");
  expect(await page.evaluate(api+'.getSummary().matched')).toBe(1);
  await page.evaluate(api+".setQuery({filters:[{column:'category',operator:'contains',values:['TRU']} ]})");
  expect(await page.evaluate(api+'.getSummary().matched')).toBe(2);
  expect((await page.evaluate(api+'.getSummary().groups')).map(g=>g.value)).toEqual([true,'true']);
});

test('pending query disables keyboard collapse and restored group preferences survive remount',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await open(page,hostedView(),hostedSetup);
  await page.evaluate(`(()=>{holdSummary=true;window.pending=${api}.setQuery({search:'held'});})()`);
  await expect.poll(()=>page.evaluate('summaryCalls.length')).toBe(2);
  await page.locator('.cx-grid-group').first().focus();await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(api+'.getCollapsedGroups()')).toEqual([]);expect(errors).toEqual([]);
  await page.evaluate('resolveSummary()');await page.evaluate('pending');
  await page.evaluate(api+".setGroupCollapsed('first',true)");
  await page.evaluate(api+".saveView('Collapsed')");
  // Use the inline fixture for persisted browser state, independent of host query ownership.
  await page.goto('about:blank');await open(page);
  const key=await page.evaluate(api+'.getSummary().groups[0].key');
  await page.evaluate(api+`.setGroupCollapsed(${JSON.stringify(key)},true)`);
  await page.evaluate(api+'.flushViewSettings()');
  await page.reload();await page.waitForSelector('[data-cx-ready]');await nextFrames(page);
  expect(await page.evaluate(api+'.getCollapsedGroups()')).toEqual([key]);
  expect(await page.locator('.cx-row[data-cx-id]').count()).toBe(0);
  await page.evaluate(api+'.resetView()');expect(await page.evaluate(api+'.getCollapsedGroups()')).toEqual([]);
});

test('record export does not request or replace presentation summaries for a different scope',async({page})=>{
  await open(page,hostedView(),hostedSetup);await page.evaluate(api+".setQuery({search:'filtered'})");
  const summary=await page.evaluate(api+'.getSummary()'), calls=await page.evaluate('summaryCalls.length');
  await page.evaluate("invalidSummary='revision'");
  const first=await page.evaluate(`(async()=>{for await(const row of ${api}.prepareExport({scope:'all'}).rows())return row.id;})()`);
  expect(first).toBe('host-0');expect(await page.evaluate('summaryCalls.length')).toBe(calls);
  expect(await page.evaluate(api+'.getSummary()')).toEqual(summary);
});
