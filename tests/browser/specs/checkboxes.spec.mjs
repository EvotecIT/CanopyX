import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames, row, openExample } from "./support.mjs";

function view(mode = "hierarchical", roots = [{ id: "a", label: "Atlas", hasChildren: true }, { id: "b", label: "Beacon", hasChildren: true }]) {
  return { protocol: "canopyx/2", type: "view", id: "checking", label: "Projects", pageSize: 2, selection: "multiple",
    checkboxes: mode, columns: [{ id: "name", title: "Name", width: 400 }], source: { kind: "inline" }, roots };
}

async function mount(page, definition = view(), options = "{}", accessiblePage = false) {
  let html = viewPage(definition).replace("</head>", "<script>CanopyX.configure('checking'," + options + ");</script></head>");
  if (accessiblePage) html = html.replace('<body class="cx-page">','<body class="cx-page"><main><h1>Projects</h1>')
    .replace('</body>','</main></body>').replace('data-cx-theme="light"','data-cx-theme="auto"');
  await page.route("https://checking.test/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://checking.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

const lazy = `{source:{page:async node=>{window.reads=(window.reads||0)+1;return {items:node ?
  [{id:node.id+'0',label:'Planning'},{id:node.id+'1',label:'Delivery'}] :
  [{id:'a',label:'Atlas',hasChildren:true},{id:'b',label:'Beacon',hasChildren:true}],total:2}}}}`;

for (const theme of ['light','dark']) test(`native checkboxes expose checked, mixed and disabled states without axe violations (${theme})`,async({page})=>{
  await page.emulateMedia({colorScheme:theme});
  await mount(page,{...view('hierarchical',[{id:'a',label:'Atlas',expanded:true,children:[{id:'a0',label:'Planning'},{id:'a1',label:'Delivery'}]},
    {id:'b',label:'Beacon'},{id:'c',label:'Cedar'}]),pageSize:3},`{isCheckable:node=>node.id!=='c'}`,true);
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.setCheckIntents([{path:['a'],checked:true},{path:['a','a0'],checked:false}]));
  await nextFrames(page);
  await expect(row(page,'a').getByRole('checkbox')).toHaveAttribute('aria-checked','mixed');
  await expect(row(page,'a1').getByRole('checkbox')).toBeChecked();
  await expect(row(page,'b').getByRole('checkbox')).not.toBeChecked();
  await expect(row(page,'c').getByRole('checkbox')).toBeDisabled();
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
  expect(result.violations.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}))).toEqual([]);
});

test("checking a lazy branch stores intent without loading or selecting it", async ({ page }) => {
  await mount(page, view(), lazy);
  await row(page, "a").locator(".cx-check").click();
  await expect(row(page, "a").locator(".cx-check")).toBeChecked();
  expect(await page.evaluate(() => ({ reads:window.reads, selected:document.querySelector('.cx-host').canopyx.getSelected().length,
    intents:document.querySelector('.cx-host').canopyx.getCheckIntents() }))).toEqual({ reads:1, selected:0, intents:[{path:["a"],checked:true}] });
  await row(page, "a").locator(".cx-exp").click();
  await expect(row(page, "a0").locator(".cx-check")).toBeChecked();
  await row(page, "a0").locator(".cx-check").click();
  await expect(row(page, "a").locator(".cx-check")).toHaveAttribute("aria-checked", "mixed");
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.getCheckIntents())).toEqual([
    {path:["a"],checked:true},{path:["a","a0"],checked:false}]);
});

test("independent checks and native keyboard controls preserve row selection", async ({ page }) => {
  await mount(page, view("independent", [{id:"a",label:"Atlas",expanded:true,children:[{id:"a0",label:"Planning"}]}]));
  await row(page, "a").focus();
  await page.keyboard.press("Space");
  await expect(row(page, "a").locator(".cx-check")).toBeChecked();
  await expect(row(page, "a0").locator(".cx-check")).not.toBeChecked();
  await page.keyboard.press("Control+Space");
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.getSelected().map(n=>n.id))).toEqual(["a"]);
  await page.keyboard.press("F2");
  await expect(row(page, "a").locator(".cx-check")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(row(page, "a").locator(".cx-check")).not.toBeChecked();
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.getSelected().map(n=>n.id))).toEqual(["a"]);
});

test("path exceptions survive inactive eviction and a fresh wrapper", async ({ page }) => {
  await mount(page, view(), lazy.replace("{source:", "{inactiveNodeLimit:0,source:"));
  await page.evaluate(() => document.querySelector('.cx-host').canopyx.setCheckIntents([{path:['a'],checked:true},{path:['a','a0'],checked:false}]));
  await row(page, "a").locator(".cx-exp").click();
  await expect(row(page, "a0").locator(".cx-check")).not.toBeChecked();
  await row(page, "a").locator(".cx-exp").click();
  await row(page, "b").click();
  await nextFrames(page);
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.getCheckState('a0'))).toBeNull();
  await row(page, "a").locator(".cx-exp").click();
  await expect(row(page, "a0").locator(".cx-check")).not.toBeChecked();
  await expect(row(page, "a1").locator(".cx-check")).toBeChecked();
  expect(await page.evaluate(() => window.reads)).toBe(3);
});

test("host vetoes are atomic and a nested newer checking proposal wins", async ({ page }) => {
  await mount(page, view("independent", [{id:"a",label:"Atlas"},{id:"b",label:"Beacon"}]),
    `{beforeCheck(node,intents){if(window.veto)return false;if(node&&node.id==='a'&&!window.nested){window.nested=true;document.querySelector('.cx-host').canopyx.setChecked('b',true)}}}`);
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.setChecked('a',true))).toBe(false);
  await expect(row(page, "a").locator(".cx-check")).not.toBeChecked();
  await expect(row(page, "b").locator(".cx-check")).toBeChecked();
  expect(await page.evaluate(() => {window.veto=true;return document.querySelector('.cx-host').canopyx.setCheckIntents([])})).toBe(false);
  await expect(row(page, "b").locator(".cx-check")).toBeChecked();
});

test("checking eligibility leaves a disabled node focusable and event vetoes preserve state", async ({ page }) => {
  await mount(page, view("independent", [{id:"a",label:"Atlas"},{id:"b",label:"Beacon"}]), `{isCheckable:node=>node.id!=='a'}`);
  await expect(row(page, "a").locator(".cx-check")).toBeDisabled();
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.setChecked('a',true))).toBe(false);
  await row(page, "a").focus();
  await expect(row(page, "a")).toBeFocused();
  expect(await page.evaluate(() => {const host=document.querySelector('.cx-host');host.addEventListener('canopyx:beforecheck',e=>e.preventDefault());return host.canopyx.setChecked('b',true)})).toBe(false);
  await expect(row(page, "b").locator(".cx-check")).not.toBeChecked();
});

test("saved checking rules restore without reads and malformed rules change nothing", async ({ page }) => {
  await mount(page, view(), lazy);
  expect(await page.evaluate(async () => {const api=document.querySelector('.cx-host').canopyx;window.saved=api.getState();window.saved.checkIntents=[{path:['a','a0'],checked:true}];return api.setState(window.saved)})).toBe(true);
  await expect(row(page, "a").locator(".cx-check")).toHaveAttribute("aria-checked", "mixed");
  expect(await page.evaluate(() => window.reads)).toBe(1);
  expect(await page.evaluate(async () => {const api=document.querySelector('.cx-host').canopyx;return api.setState({...api.getState(),checkIntents:[{path:['a','a'],checked:true}]})})).toBe(false);
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.getCheckIntents())).toEqual([{path:["a","a0"],checked:true}]);
  await row(page, "a").locator(".cx-exp").click();
  await expect(row(page, "a0").locator(".cx-check")).toBeChecked();
});

test("partial pages never promote a checked child to an unseen whole branch", async ({ page }) => {
  await mount(page, view(), `{source:{page:async(node,ref)=>!node?{items:[{id:'a',label:'Atlas',hasChildren:true}],total:1}:
    ref==='more'?{items:[{id:'a1',label:'Delivery'}],total:2}:{items:[{id:'a0',label:'Planning'}],total:2,next:'more'}}}`);
  await row(page, "a").locator(".cx-exp").click();
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.setChecked('a0',true))).toBe(true);
  await expect(row(page, "a").locator(".cx-check")).toHaveAttribute("aria-checked", "mixed");
  await page.evaluate(() => document.querySelector('.cx-host').canopyx.loadMore('a'));
  await expect(row(page, "a1").locator(".cx-check")).not.toBeChecked();
  await page.evaluate(() => document.querySelector('.cx-host').canopyx.setChecked('a1',true));
  expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.getCheckIntents())).toEqual([{path:["a"],checked:true}]);
  await expect(row(page, "a").locator(".cx-check")).toBeChecked();
});

test("recycled checkbox rows expose their own state and an outline preserves current intent", async ({ page }) => {
  const roots = Array.from({length:300}, (_,i)=>({id:'row-'+i,label:'Record '+i}));
  const definition = view("independent", roots); definition.pageSize=1000;
  definition.checkIntents=[{path:['row-0'],checked:true},{path:['row-299'],checked:true}];
  await mount(page, definition);
  await expect(row(page, "row-0").locator(".cx-check")).toBeChecked();
  await page.locator('.cx-grid').evaluate(grid=>grid.scrollTop=grid.scrollHeight);
  await expect(row(page, "row-299").locator(".cx-check")).toBeChecked();
  await expect(row(page, "row-298").locator(".cx-check")).not.toBeChecked();
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.setChecked('row-299',false));
  const outline = await page.evaluate(()=>document.querySelector('.cx-host').canopyx.toOutline());
  expect(outline).toContain('aria-label="Record 299" aria-checked="false"');
  expect(outline).toContain('aria-label="Record 0" aria-checked="true"');
  expect(outline).not.toContain('<input');
  expect(outline).not.toContain('<script');
});

test('checkbox and icon order stays consistent when virtual rows reuse different icons',async({page})=>{
  const roots=Array.from({length:300},(_,i)=>({id:'row-'+i,label:'Record '+i,icon:i<150?'one':'two'}));
  const definition={...view('independent',roots),pageSize:1000,icons:{one:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/></svg>',
    two:'<svg viewBox="0 0 16 16"><rect width="12" height="12"/></svg>'}};
  await mount(page,definition);
  const order=element=>Array.from(element.querySelector('.cx-tree').children).filter(e=>e.matches('.cx-icon,.cx-check')).map(e=>e.className);
  const initial=await row(page,'row-0').evaluate(order);
  await page.locator('.cx-grid').evaluate(grid=>grid.scrollTop=grid.scrollHeight);
  await expect(row(page,'row-299')).toBeVisible();
  expect(await row(page,'row-299').evaluate(order)).toEqual(initial);
  await page.locator('.cx-grid').evaluate(grid=>grid.scrollTop=0);
  await expect(row(page,'row-0')).toBeVisible();
  expect(await row(page,'row-0').evaluate(order)).toEqual(initial);
});

for(const checked of [true,false]) test(`checking rules reject a repeated path with checked=${checked}`,async({page})=>{
  await mount(page,view('independent',[{id:'a',label:'Atlas'}]));
  expect(await page.evaluate(checked=>{
    try {document.querySelector('.cx-host').canopyx.setCheckIntents([{path:['a'],checked:true},{path:['a'],checked}]);return 'accepted'}
    catch(error){return error.message}
  },checked)).toContain('duplicate');
  await expect(row(page,'a').getByRole('checkbox')).not.toBeChecked();
});

test("a veto that disables its target cannot commit, and an async veto fails before changing checks", async ({ page }) => {
  await mount(page, view("independent", [{id:'a',label:'Atlas'}]),
    `{isCheckable:()=>!window.locked,beforeCheck(){window.locked=true}}`);
  expect(await page.evaluate(()=>document.querySelector('.cx-host').canopyx.setChecked('a',true))).toBe(false);
  await expect(row(page, 'a').locator('.cx-check')).not.toBeChecked();
  await page.evaluate(()=>{document.querySelector('.cx-host').canopyx.destroy();CanopyX.unconfigure('checking');const host=document.querySelector('.cx-host');
    window.api=CanopyX.createTreeGrid(host,{view:JSON.parse(host.querySelector('.cx-config').textContent),beforeCheck:()=>Promise.resolve(false)})});
  await page.evaluate(()=>window.api.ready);
  expect(await page.evaluate(()=>{try{window.api.setChecked('a',true);return ''}catch(error){return error.message}})).toContain('synchronously');
  expect(await page.evaluate(()=>window.api.getCheckIntents())).toEqual([]);
});

test("restore reports accepted checking state and rejects a change while lazy restoration is pending", async ({ page }) => {
  await mount(page, view(), lazy.replace("async node=>{", "async node=>{if(node&&window.waitChildren)await new Promise(resolve=>window.releaseChildren=resolve);"));
  await page.evaluate(()=>{const host=document.querySelector('.cx-host'), api=host.canopyx;window.notifications=[];
    host.addEventListener('canopyx:check',e=>window.notifications.push(e.detail.reason));window.waitChildren=true;
    window.restored=api.setState({...api.getState(),expanded:[['a']],checkIntents:[{path:['a'],checked:true}]})});
  await expect.poll(()=>page.evaluate(()=>typeof window.releaseChildren)).toBe('function');
  expect(await page.evaluate(()=>document.querySelector('.cx-host').canopyx.setChecked('b',true))).toBe(false);
  await page.evaluate(()=>window.releaseChildren());
  expect(await page.evaluate(()=>window.restored)).toBe(true);
  await expect(row(page, 'a0').locator('.cx-check')).toBeChecked();
  expect(await page.evaluate(()=>window.notifications)).toEqual(['restore']);
});

test('checking a complete filtered page does not claim siblings hidden by its server query',async({page})=>{
  const definition={...view('hierarchical',[]),filters:[{id:'flagged',label:'Flagged',flag:'hit'}]};
  await mount(page,definition,`{source:{queryAware:true,page:async(node,cursor,request)=>{
    const filtered=request.query.filters.length>0;
    return {items:node ? [{id:'a0',label:'Planning',flags:['hit']},...(filtered?[]:[{id:'a1',label:'Delivery'}])] :
      [{id:'a',label:'Atlas',hasChildren:true}],total:node?(filtered?1:2):1,next:null,revision:'records-1'};
  }}}`);
  const result=await page.evaluate(async()=>{
    const api=document.querySelector('.cx-host').canopyx;
    await api.setFilterActive('flagged',true);
    await api.expandPath(['a'],{expandLast:true,select:false,focus:false,reveal:false});
    api.setChecked('a0',true);const intents=api.getCheckIntents();
    await api.setFilterActive('flagged',false);
    return {intents,chosen:api.getCheckState('a0'),hidden:api.getCheckState('a1')};
  });
  expect(result).toEqual({intents:[{path:['a','a0'],checked:true}],chosen:true,hidden:false});
});

for(const kind of ['more','error','detail']) test(`Space keeps the core ${kind} row action in a checkbox view`,async({page})=>{
  if(kind==='more') await mount(page,{...view('hierarchical',[{id:'a',label:'Atlas'},{id:'b',label:'Beacon'}]),pageSize:1});
  else if(kind==='error') await mount(page,view('independent',[]),`{source:{page:async()=>{
    if(!window.retried){window.retried=true;throw new Error('Unavailable')}
    return {items:[{id:'b',label:'Beacon'}],total:1};
  }}}`);
  else await mount(page,view('hierarchical',[{id:'detail',label:'Details',detail:{type:'html',height:2,html:'<p>Details</p>'}}]));
  const target=kind==='detail'?row(page,'detail'):page.locator('[data-cx-status="'+kind+'"]');
  await target.focus();await page.keyboard.press('Space');
  if(kind==='detail') expect(await page.evaluate(()=>document.querySelector('.cx-host').canopyx.getSelected().map(node=>node.id))).toEqual(['detail']);
  else await expect(row(page,'b')).toBeVisible();
});

test('accepted checking presentation notifies even when a user query cancels the remaining restore',async({page})=>{
  const definition={...view('hierarchical',[]),columns:[{id:'name',title:'Name',width:300,sortable:true}]};
  await mount(page,definition,`{onCheck:(node,intents,context)=>{(window.checkNotifications||=[]).push({intents,reason:context.reason})},
    source:{queryAware:true,page:async(node,cursor,request)=>{
      if(cursor){window.restorePathStarted=true;return new Promise(()=>{})}
      return {items:[{id:'a',label:'Atlas'}],next:request.query.sort?null:'more',revision:'records-1'};
    }}}`);
  await page.evaluate(()=>{
    const host=document.querySelector('.cx-host'),api=host.canopyx,saved=api.getState();window.checkEvents=[];
    host.addEventListener('canopyx:check',event=>window.checkEvents.push(event.detail.intents));
    saved.selection=[['missing']];saved.checkIntents=[{path:['a'],checked:true}];window.checkRestoration=api.setState(saved);
  });
  await page.waitForFunction(()=>window.restorePathStarted);
  const result=await page.evaluate(async()=>{
    const api=document.querySelector('.cx-host').canopyx;await api.sort('name','desc');
    return {restored:await window.checkRestoration,intents:api.getCheckIntents(),notifications:window.checkNotifications||[],events:window.checkEvents};
  });
  const intents=[{path:['a'],checked:true}];
  expect(result).toEqual({restored:false,intents,notifications:[{intents,reason:'restore'}],events:[intents]});
});

test('a failed restoration query never applies or reports its proposed checking rules',async({page})=>{
  const intents=[{path:['a'],checked:true}];
  const definition={...view('hierarchical',[]),checkIntents:intents,filters:[{id:'flagged',label:'Flagged',flag:'hit'}]};
  await mount(page,definition,`{onCheck:()=>{window.checkNotifications=(window.checkNotifications||0)+1},
    source:{queryAware:true,page:async(node,cursor,request)=>{
      if(request.query.filters.length)throw new Error('Query unavailable');
      return {items:[{id:'a',label:'Atlas'}],next:null,revision:'records-1'};
    }}}`);
  const result=await page.evaluate(async()=>{
    const api=document.querySelector('.cx-host').canopyx,saved=api.getState();
    saved.filters=['flagged'];saved.checkIntents=[];
    const error=await api.setState(saved).then(()=>null,error=>error.message);
    return {error,intents:api.getCheckIntents(),notifications:window.checkNotifications||0};
  });
  expect(result).toEqual({error:'Query unavailable',intents,notifications:0});
});

for(const action of ['replace','destroy']) test(`a filter callback can ${action} a restoration before its checking presentation commits`,async({page})=>{
  const definition={...view('hierarchical',[{id:'a',label:'Atlas',flags:['hit']},{id:'b',label:'Beacon',flags:['hit']}]),
    filters:[{id:'flagged',label:'Flagged',flag:'hit'}]};
  await mount(page,definition,`{onCheck:(node,intents)=>{(window.checkNotifications||=[]).push(intents)}}`);
  const result=await page.evaluate(async action=>{
    const host=document.querySelector('.cx-host'),api=host.canopyx;
    host.addEventListener('canopyx:filter',()=>{
      if(action==='destroy'){api.destroy();return}
      const newer=api.getState();newer.checkIntents=[{path:['b'],checked:true}];window.newerCheckRestore=api.setState(newer);
    },{once:true});
    const older=api.getState();older.filters=['flagged'];older.checkIntents=[{path:['a'],checked:true}];
    const accepted=await api.setState(older);if(window.newerCheckRestore)await window.newerCheckRestore;
    return {accepted,intents:api.getCheckIntents(),notifications:window.checkNotifications||[]};
  },action);
  const intents=action==='replace'?[{path:['b'],checked:true}]:[];
  expect(result).toEqual({accepted:false,intents,notifications:action==='replace'?[intents]:[]});
  if(action==='replace') {
    await expect(row(page,'b').getByRole('checkbox')).toBeChecked();
    await expect(row(page,'a').getByRole('checkbox')).not.toBeChecked();
  }
});

test("the generated project checklist loads pages and restores its saved checks", async ({ page }) => {
  await openExample(page, 'checkboxes.html');
  await expect(row(page, 'atlas').locator('.cx-check')).toHaveAttribute('aria-checked','mixed');
  await row(page, 'atlas').locator('.cx-exp').click();
  await expect(row(page, 'atlas-0').locator('.cx-check')).not.toBeChecked();
  await expect(row(page, 'atlas-1').locator('.cx-check')).toBeChecked();
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.loadMore('atlas'));
  expect(await page.evaluate(()=>document.querySelector('.cx-host').canopyx.getCheckState('atlas-99'))).toBe(true);
  await page.getByRole('button',{name:'Save view',exact:true}).click();
  await page.getByRole('button',{name:'Clear checks',exact:true}).click();
  await expect(row(page,'atlas').locator('.cx-check')).not.toBeChecked();
  await page.getByRole('button',{name:'Restore view',exact:true}).click();
  await expect(row(page,'atlas').locator('.cx-check')).toHaveAttribute('aria-checked','mixed');
});
