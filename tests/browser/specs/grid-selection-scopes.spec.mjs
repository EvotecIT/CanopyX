import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const record = i => ({id:'r'+String(i).padStart(4,'0'),cells:{name:i%2?'Archive':'Source',amount:i}});
const definition = (extra={}) => ({protocol:'canopyx/2',type:'grid',id:'selections',label:'Selection inventory',
  source:{kind:'inline'},rowHeight:28,pageSize:10,presentation:'paged',pageLength:50,selection:'multiple',search:true,
  reporting:{selectionControls:true,columnReorder:true,responsive:true},
  columns:[{id:'name',title:'Name',kind:'text',width:210,sortable:true},{id:'amount',title:'Amount',kind:'number',width:140,sortable:true}],
  rows:Array.from({length:120},(_,i)=>record(i)),...extra});
const api="document.querySelector('[data-canopyx-host]').canopyx";
async function open(page,view=definition(),setup='') {
  await page.route('http://canopyx.test/selections',route=>route.fulfill({contentType:'text/html',body:viewPage(view)
    .replace('</head>','<script>'+setup+'</script></head>').replace('<body class="cx-page">','<body class="cx-page"><main><h1>Selection</h1>')
    .replace('</body>','</main></body>')}));
  await page.goto('http://canopyx.test/selections');await page.waitForSelector('[data-cx-ready]');await nextFrames(page);
}

test('page selection reads every record on the page and retains explicit identities across pages',async({page})=>{
  await page.setViewportSize({width:900,height:500});await open(page);
  expect(await page.locator('.cx-row[data-cx-id]').count()).toBeLessThan(50);
  await page.locator('.cx-header-check').click();await page.getByRole('button',{name:'Select page',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cx-grid-selection-status')).toHaveText('50 selected');
  expect(await page.evaluate(api+'.getSelection()')).toEqual(Array.from({length:50},(_,i)=>record(i).id));
  await page.evaluate(api+'.nextPage()');await page.evaluate(api+'.selectPage()');
  expect((await page.evaluate(api+'.getSelection()')).length).toBe(100);
  await page.evaluate(api+'.selectPage(false)');expect((await page.evaluate(api+'.getSelection()')).length).toBe(50);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await expect(page.locator('.cx-grid-selection-status')).toHaveText('0 selected');
});

test('a million matching records use a bounded revision/query descriptor with exclusions and defined invalidation',async({page})=>{
  const view=definition({source:{kind:'host'},rows:undefined});
  await open(page,view,`window.calls=[];window.revision='v1';CanopyX.configure('selections',{source:{query(q){calls.push(q);
    return {protocol:'canopyx/2',type:'gridPage',view:q.view,revision,offset:q.offset,total:1000000,matched:1000000,
      items:Array.from({length:q.limit},(_,i)=>({id:'host-'+(q.offset+i),cells:{name:'Inventory',amount:q.offset+i}}))};}}});`);
  const before=await page.evaluate('calls.length');await page.evaluate(api+'.selectAllMatching()');
  expect(await page.evaluate('calls.length')).toBe(before);
  await expect(page.locator('.cx-grid-selection-status')).toHaveText('1,000,000 matching records selected; 0 excluded');
  await page.evaluate(api+".setRowSelected('host-0',false)");
  const descriptor=await page.evaluate(api+'.getSelectionDescriptor()');
  expect(descriptor).toMatchObject({kind:'query',revision:'v1',matched:1000000,excludedIds:['host-0']});
  expect(await page.evaluate(api+'.getState().selection')).toEqual([]);
  expect(await page.evaluate(`(()=>{const s=${api}.getSelectionDescriptor();return Object.isFrozen(s)&&Object.isFrozen(s.query)&&Object.isFrozen(s.excludedIds)})()`)).toBe(true);
  expect(await page.evaluate(`(()=>{try{${api}.getSelection()}catch(e){return e.message}})()`)).toContain('getSelectionDescriptor');
  await page.evaluate(api+'.nextPage()');expect(await page.evaluate(api+'.getSelectionDescriptor()')).toEqual(descriptor);
  await page.evaluate(api+".setQuery({search:'Inventory'})");expect(await page.evaluate(api+'.getSelectionDescriptor().kind')).toBe('ids');
  await page.evaluate(api+".setSelection(['host-1'])");await page.evaluate(api+".setQuery({search:''})");
  expect(await page.evaluate(api+'.getSelection()')).toEqual(['host-1']);
  await page.evaluate('revision="v2"');await page.evaluate(api+'.setQuery({})');expect(await page.evaluate(api+'.getSelection()')).toEqual([]);
});

test('selected query exports preserve captured filtering, order and exclusions after the UI changes',async({page})=>{
  await open(page,definition(),"CanopyX.configure('selections',{onExport(event){window.hostExport=event.request;}});");
  await page.evaluate(async()=>{const grid=document.querySelector('[data-canopyx-host]').canopyx;
    await grid.setQuery({search:'Archive',sort:[{column:'amount',direction:'desc'}]});
    grid.setColumnOrder(['amount','name']);grid.selectAllMatching();grid.setRowSelected('r0119',false);
    window.exported=grid.prepareExport({scope:'selected'});await grid.exportToHost('xlsx',{scope:'selected'});
    await grid.setQuery({search:'Source'});});
  const ids=await page.evaluate(async()=>{const ids=[];for await(const row of exported.rows())ids.push(row.id);return ids;});
  expect(ids).toEqual(Array.from({length:59},(_,i)=>record(117-i*2).id));
  expect(await page.evaluate('hostExport.querySelection')).toMatchObject({kind:'query',matched:60,excludedIds:['r0119']});
  expect(await page.evaluate('hostExport.columns.map(c=>c.id)')).toEqual(['amount','name']);
  await page.evaluate(api+".selectAllMatching()");
  expect(await page.evaluate(api+".toCsv({scope:'selected',maxRows:20}).catch(e=>e.message)")).toContain('row limit');
  const csv=await page.evaluate(api+".toCsv({scope:'selected',maxRows:60,values:'raw'})");
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(61);
});

test('cross-page ranges are atomic, cancelled on query change and never accept stale source identities',async({page})=>{
  const view=definition({source:{kind:'host'},rows:undefined});
  await open(page,view,`window.held=false;window.repeat=false;window.signals=[];CanopyX.configure('selections',{source:{query(q,{signal}){
    const result={protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'v1',offset:q.offset,total:120,matched:120,
      items:Array.from({length:Math.min(q.limit,120-q.offset)},(_,i)=>({id:'r'+String(q.offset+i).padStart(4,'0'),cells:{name:'Inventory',amount:q.offset+i}}))};
    if(repeat&&q.offset)result.items[0].id='r0000';
    if(held){signals.push(signal);return new Promise(r=>window.rangeResolve=()=>r(result));}return result;}}});`);
  await page.evaluate(api+'.selectRange(4,83)');expect((await page.evaluate(api+'.getSelection()')).length).toBe(80);
  await page.evaluate(`(()=>{held=true;window.pendingRange=${api}.selectRange(0,39).catch(e=>e.name)})()`);
  await expect.poll(()=>page.evaluate('!!window.rangeResolve')).toBe(true);
  await page.evaluate('held=false');await page.evaluate(api+".setQuery({search:'Inventory'})");
  expect(await page.evaluate('pendingRange')).toBe('AbortError');expect(await page.evaluate('signals.at(-1).aborted')).toBe(true);
  await page.evaluate('rangeResolve()');expect((await page.evaluate(api+'.getSelection()')).length).toBe(80);
  await page.evaluate('repeat=true');
  expect(await page.evaluate(api+'.selectRange(0,29).catch(e=>e.message)')).toContain('repeated');
  expect((await page.evaluate(api+'.getSelection()')).length).toBe(80);
  await page.evaluate('repeat=false;held=true');
  await page.evaluate(`(()=>{window.rangeAbort=new AbortController();window.cancelledRange=${api}.selectRange(0,29,{signal:rangeAbort.signal}).catch(e=>e.name)})()`);
  await page.evaluate('rangeAbort.abort()');expect(await page.evaluate('cancelledRange')).toBe('AbortError');
  expect((await page.evaluate(api+'.getSelection()')).length).toBe(80);
  expect(await page.evaluate(api+'.selectRange(0,10000).catch(e=>e.message)')).toContain('10,000');
});

test('unknown-count cursor selection spans the accepted page and exports its query without fake totals',async({page})=>{
  const view=definition({source:{kind:'host',navigation:'cursor'},rows:undefined,pageLength:5});
  await open(page,view,`CanopyX.configure('selections',{source:{navigation:'cursor',query(q){const offset=q.cursor?Number(q.cursor):0;
    const items=Array.from({length:Math.min(q.limit,13-offset)},(_,i)=>({id:'r'+String(offset+i).padStart(4,'0'),cells:{name:'Inventory',amount:offset+i}}));
    return {protocol:'canopyx/2',type:'gridCursorPage',view:q.view,revision:'v1',offset,total:null,matched:null,items,
      ...(offset+items.length<13?{nextCursor:String(offset+items.length)}:{}),...(offset?{previousCursor:String(Math.max(0,offset-q.limit))}:{})};}}});`);
  await page.evaluate(api+'.selectPage()');expect((await page.evaluate(api+'.getSelection()')).length).toBe(5);
  await page.evaluate(api+'.selectAllMatching()');await page.evaluate(api+".setRowSelected('r0000',false)");
  await expect(page.locator('.cx-grid-selection-status')).toHaveText('All matching records selected; 1 excluded');
  await page.evaluate(api+'.nextPage()');await page.evaluate(api+'.selectPage(false)');
  expect(await page.evaluate(api+'.getSelectionDescriptor().excludedIds')).toEqual(['r0000','r0005','r0006','r0007','r0008','r0009']);
  expect(await page.evaluate(api+'.selectRange(0,6).catch(e=>e.message)')).toContain('accepted page');
  const ids=await page.evaluate(async()=>{const grid=document.querySelector('[data-canopyx-host]').canopyx,ids=[];
    for await(const row of grid.prepareExport({scope:'selected'}).rows())ids.push(row.id);return ids;});
  expect(ids).toEqual(['r0001','r0002','r0003','r0004','r0010','r0011','r0012']);
  expect(await page.evaluate(api+".toCsv({scope:'selected',maxRows:3}).catch(e=>e.message)")).toContain('row limit');
});

test('checkboxes, Shift selection and cell keyboard navigation survive compact pinning and reordering',async({page})=>{
  await page.setViewportSize({width:390,height:700});await open(page);
  await page.locator('[data-canopyx-host]').evaluate(host=>host.dataset.cxTheme='dark');
  await page.evaluate(api+".setColumnPinned('name','left')");await page.evaluate(api+".setColumnOrder(['name','amount'])");
  const first=page.locator('.cx-row[data-cx-id="r0000"]');await first.focus();await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-selected','true');
  await first.locator('.cx-grid-row-select').click();await expect(first).toHaveAttribute('aria-selected','false');
  await first.locator('.cx-grid-row-select').click();
  await page.locator('.cx-row[data-cx-id="r0004"]').focus();await page.keyboard.press('Shift+Space');
  await expect(page.locator('.cx-grid-selection-status')).toHaveText('5 selected');
  await first.focus();await page.keyboard.press('F2');await expect(first.locator('.cx-grid-row-select')).toBeFocused();
  await page.keyboard.press('Escape');await expect(first).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await expect(first.locator('.cx-phone-field').filter({has:page.locator('.cx-phone-field-title',{hasText:/^Amount:$/})}).locator('.cx-phone-value')).toHaveText('0');
  expect(await first.locator('[role="gridcell"]').count()).toBe(await page.locator('.cx-hcell').count());
});

test('selection controls recover after a failed query and query selections remain ephemeral in saved state',async({page})=>{
  const view=definition({source:{kind:'host'},rows:undefined,stateKey:'scope-test'});
  await open(page,view,`window.fail=false;CanopyX.configure('selections',{source:{query(q){if(fail)throw new Error('Query unavailable');
    return {protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'v1',offset:q.offset,total:120,matched:120,
      items:Array.from({length:q.limit},(_,i)=>({id:'r'+String(q.offset+i).padStart(4,'0'),cells:{name:'Inventory',amount:q.offset+i}}))};}}});`);
  await page.evaluate(api+'.selectAllMatching()');await page.evaluate(api+".saveView('Layout')");
  expect(await page.evaluate(api+'.getViewSettings().views[0].state.selection')).toEqual([]);
  await page.evaluate('fail=true');expect(await page.evaluate(api+".setQuery({search:'bad'}).catch(e=>e.message)")).toBe('Query unavailable');
  await page.locator('.cx-header-check').click();await expect(page.getByRole('button',{name:'Select all matching',exact:true})).toBeEnabled();
  await expect(page.locator('.cx-grid-row-select').first()).toBeEnabled();
  expect(await page.evaluate(api+'.getSelectionDescriptor().kind')).toBe('query');
  await page.evaluate('fail=false');await page.evaluate(api+".applySavedView('Layout')");
  expect(await page.evaluate(api+'.getSelectionDescriptor().kind')).toBe('ids');
});

test('selection checkboxes retain focus across custom host cell paints and recycled records',async({page})=>{
  await open(page,definition(),`window.rendererDisposals=0;CanopyX.configure('selections',{renderers:{name(row,cell,context){
    if(row.id==='r0001')return false;
    context.onDispose(()=>rendererDisposals++);
    if(row.id==='r0002'){cell.dataset.decorated='true';return false;}
    const link=document.createElement('a');link.href='#'+row.id;link.textContent='Inspect '+row.id;cell.appendChild(link);return true;
  }}});`);
  const first=page.locator('.cx-row[data-cx-id="r0000"]');
  await first.focus();await page.keyboard.press('F2');
  await expect(first.locator('.cx-grid-row-select')).toBeFocused();
  const checkbox=await first.locator('.cx-grid-row-select').elementHandle();
  await page.keyboard.down('Space');
  try{await page.evaluate(api+'.refresh()');await nextFrames(page);}
  finally{await page.keyboard.up('Space');}
  await nextFrames(page);
  expect(await first.locator('.cx-grid-row-select').evaluate((current,held)=>current===held,checkbox)).toBe(true);
  await expect(first.locator('.cx-grid-row-select')).toBeChecked();
  await expect(first.locator('.cx-grid-row-select')).toBeFocused();
  await expect(first.getByRole('link')).toHaveText('Inspect r0000');
  await expect(page.locator('.cx-row[data-cx-id="r0001"] .cx-content')).toHaveText('Archive');
  await expect(page.locator('.cx-row[data-cx-id="r0002"] .cx-content[data-decorated="true"]')).toHaveText('Source');
  expect(await page.evaluate('rendererDisposals')).toBeGreaterThan(0);
  await page.evaluate(api+'.selectAllMatching()');await nextFrames(page);
  await expect(first.locator('.cx-grid-row-select')).toBeFocused();
  await page.evaluate(api+'.nextPage()');await nextFrames(page);
  const next=page.locator('.cx-row[data-cx-id="r0050"]');
  await expect(next.locator('.cx-grid-row-select')).toHaveAttribute('aria-label','Select record r0050');
  await next.locator('.cx-grid-row-select').click();
  expect(await page.evaluate(api+'.getSelectionDescriptor().excludedIds')).toEqual(['r0050']);
  expect(await next.locator('[role="gridcell"]').count()).toBe(2);
});

test('single-record deselection changes only the named identity',async({page})=>{
  await open(page,definition({selection:'single'}));
  await page.evaluate(api+".setSelection(['r0000'])");await page.evaluate(api+".setRowSelected('r0001',false)");
  expect(await page.evaluate(api+'.getSelection()')).toEqual(['r0000']);
  await page.evaluate(api+".setRowSelected('r0001',true)");expect(await page.evaluate(api+'.getSelection()')).toEqual(['r0001']);
  await page.evaluate(api+".setRowSelected('r0001',false)");expect(await page.evaluate(api+'.getSelection()')).toEqual([]);
});

test('bounded selection descriptors require opt-in while legacy selection remains available',async({page})=>{
  await open(page,definition({reporting:{columnReorder:true}}));
  await page.evaluate(api+".setSelection(Array.from({length:10001},(_,i)=>'legacy-'+i))");
  expect((await page.evaluate(api+'.getSelection()')).length).toBe(10001);
  expect(await page.evaluate(`['getSelectionDescriptor','selectAllMatching','selectPage','selectRange','setRowSelected'].every(name=>${api}[name]===undefined)`)).toBe(true);
});

test('row-body clicks report a bounded selection failure without changing the selected identities',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await open(page);
  await page.evaluate(`(()=>{window.selectionErrors=[];document.querySelector('[data-canopyx-host]').addEventListener('canopyx:error',e=>selectionErrors.push(e.detail.error.message));
    ${api}.setSelection(Array.from({length:10000},(_,i)=>'other-'+i));})()`);
  await page.locator('.cx-row[data-cx-id="r0000"] .cx-text').first().click({modifiers:['ControlOrMeta']});
  await expect(page.locator('.cx-grid-selection-status')).toContainText('10,000 IDs');
  expect((await page.evaluate(api+'.getSelection()')).length).toBe(10000);
  expect((await page.evaluate('selectionErrors')).length).toBe(1);expect(errors).toEqual([]);
});
