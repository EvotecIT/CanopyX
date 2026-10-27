import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { viewPage, nextFrames, runtimeAssets } from "./support.mjs";
const api="document.querySelector('[data-canopyx-host]').canopyx";
const definition=(extra={})=>({protocol:'canopyx/2',type:'grid',id:'delivery',label:'Inventory',source:{kind:'inline'},rowHeight:28,
  pageSize:10,presentation:'paged',pageLength:5,selection:'multiple',search:true,reporting:{selectionControls:true},
  columns:[{id:'name',title:'Name',kind:'text',width:200,sortable:true},{id:'amount',title:'Amount',kind:'number',width:150,sortable:true},
    {id:'when',title:'Updated',kind:'datetime',width:200,sortable:true}],
  rows:Array.from({length:137},(_,i)=>({id:'r'+i,cells:{name:i%2?'Archive':'Current',amount:i+0.5,when:'2026-10-04T12:30:00Z'}})),...extra});
async function open(page,view=definition(),setup='',runtime) {
  let html=viewPage(view);
  if(runtime)html=html.replace(/<script>[\s\S]*?<\/script>/,()=>'<script>'+runtimeAssets(runtime).script+'</script>');
  await page.route('http://canopyx.test/delivery',route=>route.fulfill({contentType:'text/html',body:html
    .replace('</head>','<script>'+setup+'</script></head>')}));
  await page.goto('http://canopyx.test/delivery');await page.waitForSelector('[data-cx-ready]');await nextFrames(page);
}

test('delivery metadata, locale and complete snapshot are captured before later view changes',async({page})=>{
  await open(page);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;await grid.setQuery({search:'Archive',sort:[{column:'amount',direction:'desc'}]});
    const progress=[],options={scope:'filtered',columns:['amount','name'],locale:'de-DE',timeZone:'utc',fileName:'October inventory',onProgress:p=>progress.push(p)};
    const operation=grid.materializeExport(options);options.columns=['when'];options.fileName='changed';options.maxRows=1;options.onProgress=()=>{};
    await grid.setQuery({search:'Current'});grid.setTimeZone('local');const snapshot=await operation;
    const text=await grid.toCsv({scope:'all',columns:['amount'],locale:'de-DE',timeZone:'utc'});
    return {snapshot,progress,text,frozen:Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.rows)&&Object.isFrozen(snapshot.rows[0].cells)};
  });
  expect(result.snapshot.rows).toHaveLength(68);expect(result.snapshot.rows[0].id).toBe('r135');
  expect(result.snapshot.request).toMatchObject({fileName:'October inventory',locale:'de-DE',timeZone:'utc',query:{search:'Archive'}});
  expect(result.snapshot.request.columns.map(c=>c.id)).toEqual(['amount','name']);expect(result.frozen).toBe(true);
  expect(result.progress).toEqual([{phase:'reading',completed:0,total:68},{phase:'generating',completed:68,total:68},{phase:'ready',completed:68,total:68}]);
  expect(result.text).toContain('"136,5"');
});

test('print snapshots include accepted selected-query exclusions and full records outside the viewport',async({page})=>{
  await open(page,definition(),'window.printed=[];CanopyX.configure("delivery",{onPrint({snapshot,signal}){printed.push({snapshot,aborted:signal.aborted});}});');
  const snapshot=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;await grid.setQuery({search:'Archive',sort:[{column:'amount',direction:'asc'}]});grid.selectAllMatching();grid.setRowSelected('r1',false);
    await grid.print({scope:'selected',values:'raw',columns:['name','amount']});return printed[0].snapshot;
  });
  expect(snapshot.rows).toHaveLength(67);expect(snapshot.rows.some(r=>r.id==='r1')).toBe(false);expect(snapshot.rows.at(-1).id).toBe('r135');
  expect(snapshot.request.querySelection).toMatchObject({matched:68,excludedIds:['r1']});
  await page.locator('.cx-grid-export > summary').click();
  await page.locator('.cx-grid-overflow > summary').click();await expect(page.getByRole('button',{name:'Print',exact:true})).toHaveCount(1);
});

test('snapshot bounds reject full scopes without truncation and ordinary grids reject reporting metadata',async({page})=>{
  await open(page);
  const errors=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;
    return [await grid.materializeExport({scope:'all',maxRows:10}).catch(e=>e.message),
      await Promise.resolve().then(()=>grid.print({scope:'all',maxRows:10})).catch(e=>e.message)];
  });
  expect(errors[0]).toContain('row bound');expect(errors[1]).toContain('row bound');
  await page.unroute('http://canopyx.test/delivery');const plain=definition();delete plain.reporting;await open(page,plain);
  expect(await page.evaluate(`Promise.resolve().then(()=>${api}.toCsv({scope:'all',locale:'pl-PL'})).catch(e=>e.message)`)).toContain('export metadata requires reporting');
});

test('invalid file metadata is rejected before host generation and date/number raw values stay typed',async({page})=>{
  const view=definition();view.rows[0].cells.name='=HYPERLINK("https://example.org","Literal formula text")';
  view.rows[1].cells.name='https://example.org/record';
  await open(page,view,'window.exports=[];CanopyX.configure("delivery",{onExport(e){exports.push(e.request);}});');
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx,errors=[];
    for(const fileName of ['../secret','CON','nul.txt','report.','a\u202eb','a/b','x'.repeat(101)])
      try{await grid.exportToHost('xlsx',{scope:'all',fileName});}catch(e){errors.push(e.message);}
    await grid.exportToHost('xlsx',{scope:'all',fileName:'Inventory 2026',locale:'pl-PL',values:'raw'});
    const snapshot=await grid.materializeExport({scope:'all',columns:['name','amount','when'],values:'raw'});
    return {errors,exports,first:snapshot.rows[0],snapshot};
  });
  expect(result.errors).toHaveLength(7);expect(result.errors.every(e=>e.includes('safe basename'))).toBe(true);
  expect(result.exports).toHaveLength(1);expect(result.exports[0]).toMatchObject({fileName:'Inventory 2026',locale:'pl-PL',values:'raw'});
  expect(result.first.cells.amount.value).toBe(0.5);expect(result.first.cells.when.value).toBe('2026-10-04T12:30:00Z');
  expect(result.snapshot.rows).toHaveLength(137);expect(result.first.cells.name.value).toBe(view.rows[0].cells.name);
  expect(result.snapshot.rows[1].cells.name.value).toBe('https://example.org/record');
  fs.writeFileSync(test.info().outputPath('accepted-export-snapshot.json'),JSON.stringify(result.snapshot,null,2));
});

const hostedSetup=`window.calls=[];window.held=false;CanopyX.configure('delivery',{source:{query(q,{signal}){
  calls.push({offset:q.offset,signal});if(held&&q.offset>=10)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
  return {protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'host',offset:q.offset,total:137,matched:137,
    items:Array.from({length:Math.min(q.limit,137-q.offset)},(_,i)=>({id:'r'+(q.offset+i),cells:{name:'Record',amount:q.offset+i,when:null}}))};}},
  onPrint({snapshot,signal}){window.printed=snapshot;}});`;

test('cancellation stops independent snapshot windows and toolbar reports cancellation without a product error',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page,definition({source:{kind:'host'},rows:undefined}),hostedSetup);
  await page.evaluate('held=true');await page.locator('.cx-grid-export > summary').click();
  await page.locator('.cx-grid-overflow > summary').click();await page.getByRole('button',{name:'Print',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancel export',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate('calls.filter(c=>c.offset===10).length')).toBeGreaterThan(0);
  const cancel=page.getByRole('button',{name:'Cancel export',exact:true});
  await cancel.focus();await expect(cancel).toBeFocused();await cancel.press('Enter');
  await expect(page.locator('.cx-grid-delivery-status')).toHaveText('Export cancelled');
  await expect(page.getByRole('combobox',{name:'Export: rows',exact:true})).toBeFocused();
  expect(await page.evaluate('calls.at(-1).signal.aborted')).toBe(true);expect(await page.evaluate('window.printed')).toBe(undefined);
  await page.locator('.cx-grid-overflow > summary').click();
  await expect(page.getByRole('button',{name:'Print',exact:true})).toBeEnabled();expect(errors).toEqual([]);
});

test('host progress is monotonic, ignores retired callbacks, and surfaces host failure',async({page})=>{
  await open(page,definition(),`window.progress=[];window.fail=false;CanopyX.configure('delivery',{onExport({reportProgress}){
    window.retired=reportProgress;reportProgress('reading',100);reportProgress('generating',137);if(fail)throw new Error('Generator unavailable');}});`);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;
    await grid.exportToHost('pdf',{scope:'all',onProgress:p=>progress.push(p)});const length=progress.length;retired('ready',137);
    fail=true;const error=await grid.exportToHost('xlsx',{scope:'all'}).catch(e=>e.message);return {progress,length,error};
  });
  expect(result.progress.map(p=>[p.phase,p.completed])).toEqual([['reading',0],['reading',100],['generating',137],['ready',137]]);
  expect(result.progress).toHaveLength(result.length);expect(result.error).toBe('Generator unavailable');
});

test('unknown cursor counts stay unknown in progress while bounded snapshots enumerate the entire source',async({page})=>{
  const view=definition({source:{kind:'host',navigation:'cursor'},rows:undefined,pageLength:10});
  const setup=`CanopyX.configure('delivery',{source:{navigation:'cursor',query(q){const offset=q.cursor?Number(q.cursor):0;
    const items=Array.from({length:Math.min(10,23-offset)},(_,i)=>({id:'r'+(offset+i),cells:{name:'Record',amount:offset+i,when:null}}));
    return {protocol:'canopyx/2',type:'gridCursorPage',view:q.view,revision:'cursor',offset,total:null,matched:null,items,
      ...(offset+items.length<23?{nextCursor:String(offset+items.length)}:{})};}}});`;
  await open(page,view,setup);
  const result=await page.evaluate(async()=>{const progress=[],grid=document.querySelector('[data-canopyx-host]').canopyx;
    const snapshot=await grid.materializeExport({scope:'all',maxRows:30,onProgress:p=>progress.push(p)});
    const error=await grid.materializeExport({scope:'all',maxRows:20}).catch(e=>e.message);return {snapshot,progress,error};});
  expect(result.snapshot.rows).toHaveLength(23);expect(result.snapshot.rows.at(-1).id).toBe('r22');
  expect(result.progress.at(-1)).toEqual({phase:'ready',completed:23,total:null});expect(result.error).toContain('row or text bound');
});

test('a large text record fails the snapshot text bound before any print delivery',async({page})=>{
  const setup=hostedSetup.replace("name:'Record',amount:q.offset+i","name:q.offset===10?'x'.repeat(4194304):'Record',amount:q.offset+i");
  await open(page,definition({source:{kind:'host'},rows:undefined}),setup);
  const error=await page.evaluate(api+".print({scope:'all'}).catch(e=>e.message)");
  expect(error).toContain('row or text bound');expect(await page.evaluate('window.printed')).toBe(undefined);
});

test('ordinary grid CSV and Copy retain their controls on a reporting runtime page',async({page})=>{
  const plain=definition();delete plain.reporting;
  await open(page,plain,"window.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>copied.push(text)}});",'reporting');
  await page.locator('.cx-grid-export > summary').click();
  await page.getByRole('button',{name:'Copy to clipboard',exact:true}).click();
  await expect.poll(()=>page.evaluate('copied.length')).toBe(1);
  expect(await page.evaluate('copied[0]')).toContain('136.5');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();
  const download=await pending;expect(fs.readFileSync(await download.path(),'utf8')).toContain('136.5');
});

const deferredClipboard="window.clipboardStarted=false;Object.defineProperty(navigator,'clipboard',{value:{writeText(){clipboardStarted=true;return new Promise(resolve=>window.finishClipboard=resolve);}}});";
test('Cancel settles a pending clipboard permission and ignores its late completion',async({page})=>{
  await open(page,definition(),deferredClipboard);
  await page.locator('.cx-grid-export > summary').click();await page.getByRole('button',{name:'Copy to clipboard',exact:true}).click();
  await expect.poll(()=>page.evaluate('clipboardStarted')).toBe(true);
  await page.getByRole('button',{name:'Cancel export',exact:true}).click();
  await expect(page.locator('.cx-grid-delivery-status')).toHaveText('Export cancelled',{timeout:1500});
  await expect(page.getByRole('button',{name:'Copy to clipboard',exact:true})).toBeEnabled();
  await page.evaluate('finishClipboard()');await nextFrames(page);
  await expect(page.locator('.cx-grid-delivery-status')).toHaveText('Export cancelled');
});

test('clipboard delivery observes destruction and the existing host deadline',async({page})=>{
  await open(page,definition(),deferredClipboard+"CanopyX.configure('delivery',{requestTimeoutMs:1000});");
  expect(await page.evaluate(async()=>{const g=document.querySelector('[data-canopyx-host]').canopyx;
    return await g.copy({scope:'all'}).catch(e=>e.message);})).toContain('timed out');
  const result=await page.evaluate(async()=>{const g=document.querySelector('[data-canopyx-host]').canopyx;
    clipboardStarted=false;const pending=g.copy({scope:'all'}).catch(e=>e.name);
    while(!clipboardStarted)await new Promise(r=>setTimeout(r,0));g.destroy();return pending;});
  expect(result).toBe('AbortError');
});

test('zero-record snapshots enforce the initial descriptor text bound before printing',async({page})=>{
  await open(page,definition({rows:[]}),"window.printed=[];CanopyX.configure('delivery',{onPrint(e){printed.push(e);}});");
  const result=await page.evaluate(async()=>{const g=document.querySelector('[data-canopyx-host]').canopyx;
    await g.setQuery({search:'x'.repeat(4194304)});
    return [await g.materializeExport({scope:'filtered'}).catch(e=>e.message),await g.print({scope:'filtered'}).catch(e=>e.message),printed.length];});
  expect(result[0]).toContain('text bound');expect(result[1]).toContain('text bound');expect(result[2]).toBe(0);
});

for(const reporting of [false,true])test(`short ${reporting?'reporting':'ordinary'} grid preserves records and paging as controls wrap`,async({page})=>{
  await page.setViewportSize({width:390,height:820});const view=definition();if(!reporting)delete view.reporting;
  await open(page,view,"addEventListener('DOMContentLoaded',()=>{const h=document.querySelector('[data-canopyx-host]');h.style.height='320px';h.style.padding='0';});");
  const geometry=()=>page.evaluate(()=>{const h=document.querySelector('[data-canopyx-host]'),g=h.querySelector('.cx-grid'),p=h.querySelector('.cx-grid-pager');
    return {viewport:g.clientHeight,pagerFits:p.getBoundingClientRect().bottom<=h.getBoundingClientRect().bottom+1,height:h.offsetHeight};});
  await expect.poll(async()=>(await geometry()).viewport).toBeGreaterThanOrEqual(112);
  expect((await geometry()).pagerFits).toBe(true);await expect(page.locator('.cx-row').first()).toBeVisible();
  const compact=(await geometry()).height;await page.setViewportSize({width:1400,height:820});await nextFrames(page);
  expect((await geometry()).height).toBeLessThanOrEqual(compact);expect((await geometry()).pagerFits).toBe(true);
  await page.setViewportSize({width:390,height:820});await nextFrames(page);
  await expect.poll(async()=>(await geometry()).viewport).toBeGreaterThanOrEqual(112);
});

test('a host that owns its toolbar retains explicit short and empty viewport heights',async({page})=>{
  await open(page,definition(),"CanopyX.configure('delivery',{toolbar:false});addEventListener('DOMContentLoaded',()=>{const h=document.querySelector('[data-canopyx-host]');h.style.height='58px';h.style.padding='0';});");
  await expect.poll(()=>page.evaluate("document.querySelector('[data-canopyx-host]').offsetHeight")).toBe(58);
  await page.evaluate(api+".setQuery({search:'missing'})");await nextFrames(page);
  expect(await page.evaluate("document.querySelector('[data-canopyx-host]').offsetHeight")).toBe(58);
});

for(const prior of [false,true])test(`destroy releases grid sizing before a tree remount (${prior?'prior host styling':'unowned styling'})`,async({page})=>{
  await page.setViewportSize({width:390,height:820});
  await open(page,definition(),`addEventListener('DOMContentLoaded',()=>{const h=document.querySelector('[data-canopyx-host]');h.style.height='320px';h.style.padding='0';});`);
  if(prior)await page.evaluate(async()=>{
    const h=document.querySelector('[data-canopyx-host]'),view=h.canopyx.view;h.canopyx.destroy();
    h.style.setProperty('--cx-min-h','75px','important');
    await CanopyX.createDataGrid(h,{view}).ready;
  });
  const host=page.locator('[data-canopyx-host]');
  await expect.poll(()=>host.evaluate(h=>h.offsetHeight)).toBeGreaterThanOrEqual(320);
  const result=await page.evaluate(async()=>{
    const h=document.querySelector('[data-canopyx-host]'),old=h.canopyx;
    old.destroy();h.style.height='70px';
    const replacement=CanopyX.createTreeGrid(h,{toolbar:false,view:{protocol:'canopyx/2',type:'view',id:'replacement',label:'Replacement',source:{kind:'inline'},
      columns:[{id:'name',title:'Name',width:200}],roots:[{id:'root',label:'Replacement'}]}});
    await replacement.ready;old.destroy();
    return {minimum:h.style.getPropertyValue('--cx-min-h'),priority:h.style.getPropertyPriority('--cx-min-h'),gridClass:h.classList.contains('cx-data-grid'),retained:h.canopyx===replacement};
  });
  expect(result).toEqual({minimum:prior?'75px':'',priority:prior?'important':'',gridClass:false,retained:true});
  await expect.poll(()=>host.evaluate(h=>h.offsetHeight)).toBe(70);
  await expect(page.getByRole('treegrid')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('grid-destroy-tree-remount.png')});
});
