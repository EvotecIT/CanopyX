import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "cache-lifecycle", label: "Cache lifecycle", pageSize: 100,
  selection: "multiple", columns: [{ id: "name", title: "Name", width: 300 }], source: { kind: "inline" }, roots: [] };

async function open(page, options = {}) {
  const hostScript = `CanopyX.configure("cache-lifecycle", { inactiveNodeLimit: ${options.limit ?? 2}, source: {
    ${options.counts ? 'counts: () => new Promise(resolve => { window.finishCounts=resolve; }),' : ''}
    page: async node => {
      if (!node) return { items: ["a","b"].map(id => ({ id, label:id, hasChildren:true, childCount:2 })), total:2 };
      window.loads ||= {}; window.loads[node.id] = (window.loads[node.id] || 0) + 1;
      return { items: [0,1].map(i => ({ id:node.id+i, label:node.id+i })), total:2 };
    }
  } });`;
  await page.route("https://cache.test/", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("</head>", '<script>'+hostScript+'</script></head>') }));
  await page.goto("https://cache.test/"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}

const expand = (page, id) => page.evaluate(id => document.querySelector(".cx-host").canopyx.expandPath([id],
  { select: false, focus: false, reveal: false, expandLast: true }), id);
async function collapse(page, id) {
  await page.locator(`[data-cx-id="${id}"]`).focus(); await page.keyboard.press("ArrowLeft"); await nextFrames(page);
}

test("count responses requested before a node loads cannot overwrite its new identity", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
    let finish;
    const api = CanopyX.createTreeGrid(host, { view:data, source: {
      page:async (_node,cursor) => cursor ? { items:[{id:"new",label:"New",cells:{name:"Current"}}],total:2,offset:1 }
        : { items:[{id:"old",label:"Old"}],total:2,next:"more" },
      counts:() => new Promise(resolve => { finish=resolve; })
    } });
    await api.ready; const pending=api.refreshCounts(["new"]); await api.loadMore(null);
    finish({protocol:"canopyx/2",type:"counts",items:[{id:"new",cells:{name:"Stale"}}]}); await pending;
    return api.visibleRows().find(row => row.node.id === "new").node.cells.name;
  });
  expect(result).toBe("Current");
});

test("inactive collapsed subtrees evict the least recently used data and reload on expansion", async ({ page }) => {
  await open(page); await expand(page,"a"); await collapse(page,"a"); await expand(page,"b"); await collapse(page,"b");
  await expect(page.evaluate(() => document.querySelector(".cx-host").canopyx.setSelection(["a0"])))
    .rejects.toThrow("selection node is not loaded: a0");
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.setSelection(["b0"]))).toBe(true);
  await expand(page,"a");
  expect(await page.evaluate(() => window.loads)).toEqual({a:2,b:1});
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.visibleRows().map(row => row.node.id))).toEqual(["a","a0","a1","b"]);
});

test("a selected hidden descendant pins its subtree until selection is cleared", async ({ page }) => {
  await open(page,{limit:0}); await expand(page,"a");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setSelection(["a0"])); await collapse(page,"a");
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getSelected().map(node => node.id))).toEqual(["a0"]);
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.clearSelection()); await nextFrames(page);
  await expect(page.evaluate(() => document.querySelector(".cx-host").canopyx.setSelection(["a0"])))
    .rejects.toThrow("selection node is not loaded: a0");
  await expand(page,"a"); expect(await page.evaluate(() => window.loads.a)).toBe(2);
});

test("restoration pins a hidden selection until its saved state owns it", async ({ page }) => {
  await open(page,{limit:0}); await expand(page,"a");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setSelection(["a0"])); await collapse(page,"a");
  const result = await page.evaluate(async () => {
    const host=document.querySelector(".cx-host"), old=host.canopyx, saved=old.getState(), source=old.view;
    old.destroy(); let loads=0;
    const api=CanopyX.createTreeGrid(host,{view:source,inactiveNodeLimit:0,source:{page:async node => node
      ? (loads++,{items:[{id:"a0",label:"A child"}],total:1}) : {items:[{id:"a",label:"A",hasChildren:true}],total:1}}});
    await api.ready; await api.setState(saved);
    return {selected:api.getSelected().map(node=>node.id),visible:api.visibleRows().map(row=>row.node.id),loads};
  });
  expect(result).toEqual({selected:["a0"],visible:["a"],loads:1});
});

test("evicted inline children remain expandable without changing the host array", async ({ page }) => {
  await open(page,{limit:0});
  const result=await page.evaluate(async () => {
    const host=document.querySelector(".cx-host"), data=host.canopyx.view; host.canopyx.destroy();
    const children=[{id:"inline-child",label:"Inline child"}]; data.roots=[{id:"inline",label:"Inline",children}];
    const api=CanopyX.createTreeGrid(host,{view:data,inactiveNodeLimit:0}); await api.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let retained=true;
    try { api.setSelection(["inline-child"]); }
    catch (error) { if (!error.message.includes("selection node is not loaded: inline-child")) throw error; retained=false; }
    await api.expandPath(["inline"],{expandLast:true,select:false});
    return {retained,rows:api.visibleRows().map(row=>row.node.id),same:api.view.roots[0].children===children};
  });
  expect(result).toEqual({retained:false,rows:["inline","inline-child"],same:true});
});

test("a count response cannot change a replacement loaded after its old subtree was evicted", async ({ page }) => {
  await open(page,{limit:0,counts:true}); await expand(page,"a");
  await page.evaluate(() => {
    window.oldCount = document.querySelector(".cx-host").canopyx.refreshCounts(["a0"]);
  });
  await collapse(page,"a"); await expand(page,"a");
  const current=await page.evaluate(async () => {
    window.finishCounts({protocol:"canopyx/2",type:"counts",items:[{id:"a0",cells:{name:"Stale"}}]});
    await window.oldCount;
    return document.querySelector(".cx-host").canopyx.visibleRows().find(row=>row.node.id==="a0").node.cells?.name || "Current";
  });
  expect(current).toBe("Current");
  expect(await page.evaluate(()=>window.loads.a)).toBe(2);
});

test("matching filter data stays retained until the filter is cleared", async ({ page }) => {
  await open(page,{limit:0}); await expand(page,"a");
  await page.evaluate(()=>document.querySelector(".cx-host").canopyx.setFilter(()=>true));
  await collapse(page,"a");
  expect(await page.evaluate(()=>document.querySelector(".cx-host").canopyx.setSelection(["a0"]))).toBe(true);
  await page.evaluate(()=>{const api=document.querySelector(".cx-host").canopyx;api.clearSelection();api.setFilter(null);});
  await nextFrames(page);
  await expect(page.evaluate(()=>document.querySelector(".cx-host").canopyx.setSelection(["a0"])))
    .rejects.toThrow("selection node is not loaded: a0");
});

test("a retired API releases loaded rows and selection while retaining its view metadata",async({page})=>{
  await open(page);await expand(page,"a");
  const result=await page.evaluate(async()=>{
    const host=document.querySelector(".cx-host"),api=host.canopyx;
    api.setSelection(["a0"]);api.destroy();
    const search=await api.search("a").then(()=>"unexpected",error=>error.name);
    return {selected:api.getSelected(),rows:api.visibleRows(),view:api.view.id,mounted:!!host.canopyx,search};
  });
  expect(result).toEqual({selected:[],rows:[],view:"cache-lifecycle",mounted:false,search:"AbortError"});
});

test("nonmatching collapsed data obeys its retention limit while ancestor hints keep the filter active", async ({ page }) => {
  await open(page,{limit:0});
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.setFilter({match:()=>false,keep:node=>!!node.hasChildren}));
  for (const id of ['a','b']) {
    await expand(page,id); await collapse(page,id);
    await expect(page.evaluate(id=>document.querySelector('.cx-host').canopyx.setSelection([id+'0']),id))
      .rejects.toThrow('selection node is not loaded: '+id+'0');
  }
  await expand(page,'a');
  expect(await page.evaluate(()=>window.loads.a)).toBe(2);
  await expect(page.locator('[data-cx-id="a"]')).toHaveAttribute('aria-expanded','true');
});

test("matching data moved outside an inline page stays retained under a filter", async ({ page }) => {
  const definition = {...view,pageSize:1,columns:[{id:'name',title:'Name',sortable:true,width:300}],
    roots:[{id:'p',label:'Project',children:[{id:'a',label:'Atlas',flags:['hit']},{id:'z',label:'Zeta'}]}]};
  await page.route('https://cache.test/',route=>route.fulfill({contentType:'text/html',body:viewPage(definition)
    .replace('</head>','<script>CanopyX.configure("cache-lifecycle",{retainedNodeLimit:0});</script></head>')}));
  await page.goto('https://cache.test/');await page.waitForSelector('[data-cx-ready]');
  const retained = await page.evaluate(async()=>{
    const api=document.querySelector('.cx-host').canopyx;
    await api.expandPath(['p'],{expandLast:true,select:false,focus:false,reveal:false});
    api.setFilter({match:node=>(node.flags||[]).includes('hit'),keep:node=>node.id==='p'});
    api.sort('name','desc');
    return api.setSelection(['a']);
  });
  expect(retained).toBe(true);
  await page.evaluate(()=>{const api=document.querySelector('.cx-host').canopyx;api.clearSelection();api.setFilter(null);});
  await nextFrames(page);
  await expect(page.evaluate(()=>document.querySelector('.cx-host').canopyx.setSelection(['a'])))
    .rejects.toThrow('selection node is not loaded: a');
});

for (const method of ['applyCounts','refreshCounts']) test(`${method} releases a collapsed group after its flags stop matching`,async({page})=>{
  await open(page,{limit:0,counts:true}); await expand(page,'a');
  await page.evaluate(()=>{
    const api=document.querySelector('.cx-host').canopyx;
    api.applyCounts({protocol:'canopyx/2',type:'counts',items:[{id:'a0',flags:['hit']},{id:'a1',flags:['hit']}]});
    api.setFilter({match:node=>(node.flags||[]).includes('hit'),keep:node=>node.id==='a'});
  });
  await collapse(page,'a'); await nextFrames(page);
  await page.evaluate(async method=>{
    const api=document.querySelector('.cx-host').canopyx;
    const update={protocol:'canopyx/2',type:'counts',items:[{id:'a0',flags:[]},{id:'a1',flags:[]}]};
    if(method==='applyCounts') api.applyCounts(update);
    else {const pending=api.refreshCounts(['a0','a1']);window.finishCounts(update);await pending;}
  },method);
  await nextFrames(page);
  await expect(page.evaluate(()=>document.querySelector('.cx-host').canopyx.setSelection(['a0'])))
    .rejects.toThrow('selection node is not loaded: a0');
  await expand(page,'a'); expect(await page.evaluate(()=>window.loads.a)).toBe(2);
});

test("state restoration enrolls newly collapsed lazy branches for eviction",async({page})=>{
  await open(page,{limit:0}); await expand(page,"a");
  await page.evaluate(()=>document.querySelector(".cx-host").canopyx.setState({expanded:[]}));
  await nextFrames(page);
  await expect(page.evaluate(()=>document.querySelector(".cx-host").canopyx.setSelection(["a0"])))
    .rejects.toThrow("selection node is not loaded: a0");
  await expand(page,"a"); expect(await page.evaluate(()=>window.loads.a)).toBe(2);
});

test("a retained retired API releases its supplied source without changing caller options",async({page,browserName})=>{
  test.skip(browserName!=="chromium","Source collection requires the Chromium heap profiler.");
  await open(page);
  const unchanged=await page.evaluate(async()=>{
    const host=document.querySelector(".cx-host"),view=host.canopyx.view; host.canopyx.destroy();
    const source={enabled:true,page:async()=>({items:[{id:"leaf",label:"Leaf"}],total:1})};
    const options={view,source,renderers:{name:(_node,element)=>{element.textContent=source.enabled?"Leaf":"Unavailable";return true;}}};
    window.sourceReference=new WeakRef(source);
    const api=window.retiredApi=CanopyX.createTreeGrid(host,options);
    await api.ready; api.setFilter(()=>source.enabled); api.destroy();
    return options.source===source;
  });
  expect(unchanged).toBe(true);
  const profiler=await page.context().newCDPSession(page);
  try {
    await profiler.send("HeapProfiler.collectGarbage");
    expect(await page.evaluate(()=>window.sourceReference.deref()===undefined)).toBe(true);
    expect(await page.evaluate(()=>window.retiredApi.visibleRows())).toEqual([]);
  } finally { await profiler.detach(); }
});

for (const mode of ["restoration","initialization"]) test(`a queued descendant toggle survives eviction during ${mode} replay`,async({page})=>{
  await open(page);
  await page.evaluate(async mode=>{
    const host=document.querySelector(".cx-host"),data=host.canopyx.view; host.canopyx.destroy();
    window.loads={};
    const api=CanopyX.createTreeGrid(host,{view:data,inactiveNodeLimit:0,source:{page:async node=>{
      if (!node) return {items:(mode==="initialization"?["a","e","b","c","d"]:["a","b","c","d","e"])
        .map(id=>({id,label:id,hasChildren:true,expanded:mode==="initialization"&&["a","e","b"].includes(id)})),total:5};
      window.loads[node.id]=(window.loads[node.id]||0)+1;
      if (node.id==="b") return new Promise(resolve=>{window.finishRestoration=resolve;});
      if (node.id==="d") return new Promise(resolve=>{window.finishSlowReplay=resolve;});
      return {items:[{id:node.id+"0",label:node.id+"0",hasChildren:node.id==="a"}],total:1};
    }}});
    if (mode==="initialization") window.pendingRestore=api.ready;
    else {
      await api.ready;
      for (const id of ["a","e"]) await api.expandPath([id],{expandLast:true,select:false,focus:false,reveal:false});
      window.pendingRestore=api.setState({expanded:[["b"]]});
    }
  },mode);
  await page.waitForFunction(()=>typeof window.finishRestoration==="function");
  for (const id of mode==="initialization"?["a","e","d","a0","c"]:["d","a0","c"])
    await page.locator(`[data-cx-id="${id}"] .cx-exp`).click();
  await page.evaluate(()=>window.finishRestoration({items:[{id:"b0",label:"b0"}],total:1}));
  await page.waitForFunction(()=>typeof window.finishSlowReplay==="function"); await nextFrames(page);
  await page.evaluate(async()=>{
    window.finishSlowReplay({items:[{id:"d0",label:"d0"}],total:1}); await window.pendingRestore;
  });
  await nextFrames(page);
  expect(await page.evaluate(()=>window.loads.a0||0)).toBe(1);
  await expect(page.evaluate(()=>document.querySelector(".cx-host").canopyx.setSelection(["e0"])))
    .rejects.toThrow("selection node is not loaded: e0");
});
