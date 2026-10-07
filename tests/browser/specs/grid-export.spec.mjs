import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { viewPage, nextFrames, openExample } from "./support.mjs";
const api = "document.querySelector('[data-canopyx-host]').canopyx";
test("the generated inventory details dialog returns focus to its invoking record", async ({page}) => {
  await openExample(page, "inventory-grid.html");
  const row = page.locator('.cx-row[data-cx-id="file-4999"]');
  await row.focus(); await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("dialog", {name:"Record details"})).toBeVisible();
  await expect(page.locator("#record-fields")).toContainText("4,999 KiB");
  await page.getByRole("button", {name:"Close details"}).click(); await expect(row).toBeFocused();
});
const definition = () => ({ protocol:"canopyx/2",type:"grid",id:"records",label:"Records",source:{kind:"inline"},
  rowHeight:28,pageSize:7,selection:"multiple",search:true,
  columns:[{id:"name",title:"Name",kind:"text",width:180,sortable:true},{id:"size",title:"Size",kind:"number",width:100,sortable:true}],
  rows:Array.from({length:80},(_,i)=>({id:String(i).padStart(3,"0"),cells:{name:i%2?"Archive":"Source",size:{value:i,text:i+" KiB"}}})) });
async function open(page, view=definition(), setup="") {
  const html=viewPage(view).replace("</head>","<script>"+setup+"</script></head>");
  await page.route("http://canopyx.test/exports",route=>route.fulfill({contentType:"text/html",body:html}));
  await page.goto("http://canopyx.test/exports"); await page.waitForSelector("[data-cx-ready]");
}
test("exports capture accepted queries and selected identities independently of viewport and later changes",async({page})=>{
  await open(page);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;
    grid.setColumnOrder(['size','name']);grid.setColumnVisible('name',false);grid.setSelection(['001','078']);
    await grid.setQuery({search:'Archive',sort:[{column:'size',direction:'desc'}]});
    const filtered=grid.prepareExport({scope:'filtered'}),selected=grid.prepareExport({scope:'selected',columns:['name','size']}),all=grid.prepareExport({scope:'all'});
    await grid.setQuery({search:'Source',sort:[{column:'size',direction:'asc'}]});grid.clearSelection();grid.setColumnOrder(['name','size']);
    const collect=async exp=>{const rows=[];for await(const row of exp.rows())rows.push(row);return rows;};
    return {filtered:await collect(filtered),selected:await collect(selected),all:await collect(all),request:filtered.request,frozen:Object.isFrozen(filtered.request.columns[0])};
  });
  expect(result.filtered.map(row=>row.id)).toEqual(Array.from({length:40},(_,i)=>String(79-i*2).padStart(3,"0")));
  expect(result.selected.map(row=>row.id)).toEqual(['078','001']);expect(result.all).toHaveLength(80);
  expect(Object.keys(result.filtered[0].cells)).toEqual(['size']);expect(result.request.columns.map(column=>column.id)).toEqual(['size']);expect(result.frozen).toBe(true);
});
test("CSV defines raw/display values, column ordering, text escaping and formula safety without silent truncation",async({page})=>{
  const view=definition();view.rows=[{id:'a',cells:{name:'  =SUM(1,2)',size:{value:-12,text:'12 KiB'}}},{id:'b',cells:{name:'line1\n"line2"',size:null}}];
  await open(page,view);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;
    return {raw:await grid.toCsv({scope:'all',values:'raw',columns:['size','name']}),display:await grid.toCsv({scope:'all'}),
      limit:await grid.toCsv({scope:'all',maxRows:1}).then(()=>null,error=>error.message)};
  });
  expect(result.raw).toBe('Size,Name\r\n-12,"\'  =SUM(1,2)"\r\n,"line1\n""line2"""\r\n');
  expect(result.display).toContain('12 KiB');expect(result.limit).toContain('client row limit');
});
const hostSetup=`window.requests=[];window.revision='r1';window.delay=0;window.hold=false;
CanopyX.configure('records',{source:{async query(query,{signal}){
  window.requests.push({query,signal});if(window.hold)await new Promise(()=>{});if(window.delay)await new Promise(resolve=>setTimeout(resolve,window.delay));
  return {protocol:'canopyx/2',type:'gridPage',view:'records',revision:window.revision,offset:query.offset,total:80,matched:query.search?40:80,
    items:Array.from({length:Math.min(query.limit,(query.search?40:80)-query.offset)},(_,i)=>({id:String(query.offset+i).padStart(3,'0'),cells:{name:'Record '+(query.offset+i),size:query.offset+i}}))};
}}});`;
function hostView(){const view=definition();view.source={kind:'host'};delete view.rows;return view;}
test("host export validates every page revision and counts, and rejects absent selected identities",async({page})=>{
  await open(page,hostView(),hostSetup);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx,exported=grid.prepareExport({scope:'all'});
    const iterator=exported.rows()[Symbol.asyncIterator]();await iterator.next();window.revision='r2';
    let mismatch;try{while(!(await iterator.next()).done){}}catch(error){mismatch=error.message;}
    window.revision='r1';grid.setSelection(['absent']);const absent=await grid.toCsv({scope:'selected'}).then(()=>null,error=>error.message);
    return {mismatch,absent};
  });
  expect(result.mismatch).toContain('snapshot changed');expect(result.absent).toContain('absent');
});
test("export cancellation and grid destruction terminate a source that ignores abort",async({page})=>{
  await open(page,hostView(),hostSetup);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;window.hold=true;
    const cancel=new AbortController(),first=grid.toCsv({scope:'all',signal:cancel.signal});cancel.abort();
    const cancelled=await first.then(()=>null,error=>error.name);
    const second=grid.toCsv({scope:'all'});grid.destroy();const destroyed=await second.then(()=>null,error=>error.name);
    return {cancelled,destroyed};
  });expect(result).toEqual({cancelled:'AbortError',destroyed:'AbortError'});
});
test("large host exports receive frozen accepted metadata without client materialization",async({page})=>{
  await open(page,hostView(),hostSetup.replace("CanopyX.configure('records',{source", "CanopyX.configure('records',{onExport:async event=>{window.exportEvent=event;window.exportFrozen=Object.isFrozen(event.request.query.filters);},source"));
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;await grid.setQuery({search:'accepted'});grid.setSelection(['079']);
    const before=window.requests.length;await grid.exportToHost('xlsx',{scope:'selected',columns:['size']});
    return {newRequests:window.requests.length-before,request:window.exportEvent.request,format:window.exportEvent.format,frozen:window.exportFrozen};
  });expect(result.newRequests).toBe(0);expect(result.request.selection).toEqual(['079']);expect(result.request.query.search).toBe('');expect(result.request.matched).toBe(40);expect(result.format).toBe('xlsx');expect(result.frozen).toBe(true);
});
test("clipboard denial is observable and keyboard copying leaves native controls in charge",async({page})=>{
  await open(page,definition(),`window.copies=[];window.copyErrors=[];CanopyX.configure('records',{onError:event=>window.copyErrors.push(event.error.message)});
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copies.push(text);if(window.deny)throw new Error('Permission denied');}}});`);
  const row=page.locator('.cx-row[data-cx-id="000"]');await row.focus();await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>window.copies.length)).toBe(1);
  await page.getByRole('searchbox').focus();await page.keyboard.press('Control+c');expect(await page.evaluate(()=>window.copies.length)).toBe(1);
  await page.evaluate(()=>window.deny=true);await row.focus();await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>window.copyErrors)).toEqual(['Permission denied']);
});
test("record details use immutable raw records and cancel older hooks on navigation or query change",async({page})=>{
  await open(page,definition(),`window.details=[];CanopyX.configure('records',{onDetails:async event=>{window.details.push(event);await new Promise(()=>{});}});`);
  const result=await page.evaluate(async()=>{
    const grid=document.querySelector('[data-canopyx-host]').canopyx;
    const first=grid.openDetails('000').catch(error=>error.name);await Promise.resolve();await Promise.resolve();
    const second=grid.openDetails('001').catch(error=>error.name);await Promise.resolve();await Promise.resolve();
    const firstResult=await first;await grid.setQuery({search:'Archive'});const secondResult=await second;
    return {firstResult,secondResult,ids:window.details.map(event=>event.row.id),aborted:window.details.map(event=>event.signal.aborted),frozen:window.details.every(event=>Object.isFrozen(event.row.cells))};
  });expect(result).toEqual({firstResult:'AbortError',secondResult:'AbortError',ids:['000','001'],aborted:[true,true],frozen:true});
});
test("export controls download the chosen scope and preserve the existing Enter and F2 cell model",async({page})=>{
  await open(page,definition(),`window.opened=[];CanopyX.configure('records',{onDetails:event=>window.opened.push(event.row.id)});`);
  const row=page.locator('.cx-row[data-cx-id="000"]');await row.focus();await page.keyboard.press('F2');await expect(row.getByRole('gridcell').first()).toBeFocused();
  await page.keyboard.press('F2');await expect(row).toBeFocused();await page.keyboard.press('Control+Enter');await expect.poll(()=>page.evaluate(()=>window.opened)).toEqual(['000']);
  await page.locator('.cx-grid-export > summary').click();await page.locator('.cx-grid-export').getByRole('combobox').selectOption('all');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSV',exact:true}).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('records.csv');
  const csv = await fs.readFile(await file.path(), 'utf8');
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(81);
  await nextFrames(page);
});

test("host record navigation reveals uncached rows without taking focus from a drawer", async ({page}) => {
  await open(page, hostView(), hostSetup);
  await page.getByRole('searchbox').focus();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(79));
  await expect(page.locator('.cx-row[data-cx-id="079"]')).toBeVisible();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.focus());
  await expect(page.locator('.cx-row[data-cx-id="079"]')).toBeFocused();
  expect(await page.evaluate(() => { try { document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(80); return false; } catch { return true; } })).toBe(true);
});

test("export cancellation applies between fetched records and before an empty selection completes", async ({page}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    const cancelled = new AbortController(), iterator = grid.prepareExport({scope:'all',signal:cancelled.signal}).rows()[Symbol.asyncIterator]();
    await iterator.next(); cancelled.abort();
    const afterRow = await iterator.next().then(() => null, error => error.name);
    const already = new AbortController(); already.abort();
    const empty = await grid.toCsv({scope:'selected',signal:already.signal}).then(() => null, error => error.name);
    const immediate = new AbortController(), pending = grid.toCsv({scope:'selected',signal:immediate.signal}); immediate.abort();
    const completing = await pending.then(() => null, error => error.name);
    const second = grid.prepareExport({scope:'all'}).rows()[Symbol.asyncIterator](); await second.next(); grid.destroy();
    const destroyed = await second.next().then(() => null, error => error.name);
    return {afterRow,empty,completing,destroyed};
  });
  expect(result).toEqual({afterRow:'AbortError',empty:'AbortError',completing:'AbortError',destroyed:'AbortError'});
  const view = definition(); view.rows = [];
  await open(page, view);
  const emptyDestroyed = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    const pending = ['selected','filtered','all'].map(scope => grid.toCsv({scope}).then(() => null,error => error.name));
    grid.destroy(); return Promise.all(pending);
  });
  expect(emptyDestroyed).toEqual(['AbortError','AbortError','AbortError']);
});

test("focused cell clipboard fields retain formula protection and tab escaping", async ({page}) => {
  const view = definition(); view.rows[0].cells.name = '=SUM(1,2)\tvalue\nnext';
  await open(page,view,"window.copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copies.push(text)}});");
  const row = page.locator('.cx-row[data-cx-id="000"]'); await row.focus(); await page.keyboard.press('F2'); await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => window.copies)).toEqual(['"\'=SUM(1,2)\tvalue\nnext"']);
});

test("export projection preserves declared column identifiers that name object prototype properties", async ({page}) => {
  const view = definition(); view.columns = ['__proto__','constructor','toString'].map(id => ({id,title:id,kind:'text',width:180,sortable:true}));
  view.rows = [{id:'one',cells:JSON.parse('{"__proto__":{"value":"Kept value"},"constructor":"Constructor","toString":"String"}')}];
  await open(page,view);
  const result = await page.evaluate(async () => {
    const grid=document.querySelector('[data-canopyx-host]').canopyx, rows=[];
    for await (const row of grid.prepareExport({scope:'all'}).rows()) rows.push(row);
    return {keys:Object.keys(rows[0].cells),value:rows[0].cells.__proto__.value,frozen:Object.isFrozen(rows[0].cells.__proto__),csv:await grid.toCsv({scope:'all'})};
  });
  expect(result.keys).toEqual(['__proto__','constructor','toString']); expect(result.value).toBe('Kept value'); expect(result.frozen).toBe(true);
  expect(result.csv).toBe('__proto__,constructor,toString\r\nKept value,Constructor,String\r\n');
});

test("pending query details gestures report errors without uncaught browser exceptions", async ({page}) => {
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await open(page,hostView(),hostSetup.replace("CanopyX.configure('records',{source", "window.detailErrors=[];CanopyX.configure('records',{onDetails:()=>{},onError:event=>window.detailErrors.push(event.error.message),source"));
  const row=page.locator('.cx-row[data-cx-id="000"]'); await row.focus();
  await page.evaluate(() => {window.hold=true;document.querySelector('[data-canopyx-host]').canopyx.setQuery({search:'accepted'}).catch(()=>{});});
  await page.keyboard.press('Control+Enter'); await row.dblclick();
  await expect.poll(() => page.evaluate(() => window.detailErrors.length)).toBe(2);
  expect(errors).toEqual([]);
});
