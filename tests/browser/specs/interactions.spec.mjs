import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames, row } from "./support.mjs";

function view() {
  return { protocol:'canopyx/2',type:'view',id:'actions',label:'Records',pageSize:50,selection:'multiple',dragDrop:true,
    contextActions:[{id:'inspect',label:'Inspect record'}],columns:[{id:'name',title:'Name',editable:true,width:400}],
    source:{kind:'inline'},roots:[{id:'a',label:'Atlas',expanded:true,children:[{id:'a0',label:'Planning'}]},{id:'b',label:'Beacon'}] };
}
async function mount(page, options='{}', definition=view()) {
  const html=viewPage(definition).replace('</head>',`<script>CanopyX.configure('actions',${options});</script></head>`)
    .replace('<body class="cx-page">','<body class="cx-page"><main><h1>Records</h1>').replace('</body>','</main></body>');
  await page.route('https://actions.test/',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://actions.test/'); await page.waitForSelector('[data-cx-ready]'); await nextFrames(page);
}

test('host hooks receive immutable proposals and acceptance never changes displayed data',async({page})=>{
  await mount(page,`{onEdit(p,r){window.edit=p;window.context={signal:r.signal instanceof AbortSignal,reason:r.reason};return true},
    onDrop(p){window.drop=p;return true},onAction(p){window.action=p;return false}}`);
  const result=await page.evaluate(async()=>{
    const api=document.querySelector('.cx-host').canopyx;
    const edited=await api.requestEdit('a','name','New name');
    const dropped=await api.requestDrop(['a','a0'],'b','inside');
    const acted=await api.requestAction('b','inspect');
    return {edited,dropped,acted,edit:window.edit,drop:window.drop,action:window.action,context:window.context,
      frozen:[Object.isFrozen(window.edit),Object.isFrozen(window.edit.path),Object.isFrozen(window.drop.nodes[0].path)]};
  });
  expect(result).toEqual({edited:true,dropped:true,acted:false,edit:{nodeId:'a',path:['a'],column:'name',previous:'Atlas',value:'New name'},
    drop:{nodes:[{nodeId:'a',path:['a']}],target:{nodeId:'b',path:['b']},placement:'inside'},
    action:{nodeId:'b',path:['b'],action:'inspect'},context:{signal:true,reason:'api'},frozen:[true,true,true]});
  await expect(row(page,'a')).toContainText('Atlas'); await expect(row(page,'a0')).toBeVisible();
});

test('disabled, missing and cyclic targets never reach host execution',async({page})=>{
  await mount(page,`{onEdit(){window.calls=(window.calls||0)+1;return true},onDrop(){window.calls=(window.calls||0)+1;return true},
    onAction(){window.calls=(window.calls||0)+1;return true},canEdit:n=>n.id!=='b',canDrag:n=>n.id!=='b',isActionEnabled:n=>n.id!=='b'}`);
  expect(await page.evaluate(async()=>{const a=document.querySelector('.cx-host').canopyx;return [
    await a.requestEdit('b','name','x'),await a.requestEdit('a','missing','x'),await a.requestDrop(['a'],'a0'),
    await a.requestDrop(['b'],'a'),await a.requestAction('b','inspect'),await a.requestAction('a','unknown'),window.calls||0]}))
    .toEqual([false,false,false,false,false,false,0]);
});

test('event veto and late eligibility changes prevent execution',async({page})=>{
  await mount(page,`{onEdit(){window.calls=(window.calls||0)+1;return true},canEdit:()=>!window.disabled}`);
  expect(await page.evaluate(async()=>{
    const h=document.querySelector('.cx-host');h.addEventListener('canopyx:beforeedit',()=>{window.disabled=true},{once:true});
    const first=await h.canopyx.requestEdit('a','name','x');window.disabled=false;
    h.addEventListener('canopyx:beforeedit',e=>e.preventDefault(),{once:true});
    return [first,await h.canopyx.requestEdit('a','name','x'),window.calls||0];
  })).toEqual([false,false,0]);
});

test('a nested newer proposal wins without executing the superseded outer proposal',async({page})=>{
  await mount(page,`{onEdit(p){(window.calls||(window.calls=[])).push(p.nodeId);return true}}`);
  expect(await page.evaluate(async()=>{
    const h=document.querySelector('.cx-host');h.addEventListener('canopyx:beforeedit',()=>{window.newer=h.canopyx.requestEdit('b','name','newer')},{once:true});
    const old=await h.canopyx.requestEdit('a','name','old');return [old,await window.newer,window.calls];
  })).toEqual([false,true,['b']]);
});

for(const kind of ['cancel','destroy','replace','counts']) test(`pending host execution settles when the grid ownership changes (${kind})`,async({page})=>{
  await mount(page,`{onEdit(p,r){window.signal=r.signal;return new Promise(resolve=>window.complete=resolve)}}`);
  expect(await page.evaluate(async(kind)=>{
    const api=document.querySelector('.cx-host').canopyx; const pending=api.requestEdit('a','name','x');
    if(kind==='cancel')api.cancelInteraction();else if(kind==='destroy')api.destroy();
    else if(kind==='counts')api.applyCounts({protocol:'canopyx/2',type:'counts',items:[{id:'a',cells:{name:'Replacement'}}]});else await api.reload('a');
    const result=await pending;window.complete(true);
    return {result,aborted:window.signal.aborted,retired:kind==='destroy'?await api.requestAction('a','inspect'):null};
  },kind)).toEqual({result:false,aborted:true,retired:kind==='destroy'?false:null});
});

test('pre-aborted calls skip host hooks, deadlines settle hung hooks and invalid results reject',async({page})=>{
  await mount(page,`{interactionTimeoutMs:20,onEdit(){window.calls=(window.calls||0)+1;return new Promise(()=>{})},onAction(){return undefined}}`);
  expect(await page.evaluate(async()=>{
    const a=document.querySelector('.cx-host').canopyx,c=new AbortController();c.abort();
    const skipped=await a.requestEdit('a','name','x',{signal:c.signal});const calls=window.calls||0;
    const error=await a.requestEdit('a','name','x').catch(e=>e.message);
    const invalid=await a.requestAction('a','inspect').catch(e=>e.message);return {skipped,calls,error,invalid};
  })).toEqual({skipped:false,calls:0,error:'CanopyX: interaction timed out after 20 milliseconds.',
    invalid:'CanopyX: a host interaction hook must return a boolean acceptance result.'});
});

test('Alt+Enter edits through the host while F2 retains cell navigation',async({page})=>{
  await mount(page,`{onEdit(p){window.edit=p;return true}}`);
  await row(page,'a').focus(); await page.keyboard.press('Alt+Enter');
  await expect(page.getByRole('dialog',{name:'Edit Name'})).toBeVisible();
  await page.getByRole('textbox',{name:'Edit Name'}).fill('Updated'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(row(page,'a')).toBeFocused();
  expect(await page.evaluate(()=>window.edit.value)).toBe('Updated'); await expect(row(page,'a')).toContainText('Atlas');
  await page.keyboard.press('F2'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('declined editors remain usable and Escape cancels a pending host request',async({page})=>{
  await mount(page,`{onEdit(p,r){if(window.hang){window.signal=r.signal;return new Promise(()=>{})}return false}}`);
  await row(page,'a').focus(); await page.keyboard.press('Alt+Enter');
  await page.getByRole('textbox',{name:'Edit Name'}).fill('Rejected'); await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox',{name:'Edit Name'})).toBeEnabled();
  await expect(page.locator('.cx-live')).toContainText('declined');
  await page.evaluate(()=>window.hang=true); await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox',{name:'Edit Name'})).toBeDisabled(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>window.signal.aborted)).toBe(true);
});

test('context menus have keyboard navigation and disabled actions never execute',async({page})=>{
  await mount(page,`{onAction(p){window.action=p;return true},isActionEnabled:n=>n.id!=='b'}`);
  await row(page,'b').focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu',{name:'Actions'})).toBeVisible();
  await expect(page.getByRole('menuitem',{name:'Inspect record'})).toBeFocused();
  await expect(page.getByRole('menuitem')).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Enter'); expect(await page.evaluate(()=>window.action)).toBeUndefined();
  await page.keyboard.press('Escape'); await expect(row(page,'b')).toBeFocused();
  await row(page,'a').click({button:'right'}); await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>window.action?.nodeId)).toBe('a');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('keyboard moving proposes a drop without altering selection or row data',async({page})=>{
  await mount(page,`{onDrop(p){window.drop=p;return true}}`);
  await row(page,'a0').focus(); await page.keyboard.press('Control+Shift+x');
  await row(page,'b').focus(); await page.keyboard.press('Control+Shift+v');
  await expect.poll(()=>page.evaluate(()=>window.drop)).toEqual({nodes:[{nodeId:'a0',path:['a','a0']}],target:{nodeId:'b',path:['b']},placement:'inside'});
  expect(await page.evaluate(()=>document.querySelector('.cx-host').canopyx.getSelected().length)).toBe(0);
  await expect(row(page,'a0')).toBeVisible();
});

test('native internal drag sends a host proposal and external drag has no authority',async({page})=>{
  await mount(page,`{onDrop(p){window.drop=p;return true}}`);
  await expect(row(page,'a0')).toHaveAttribute('draggable','true');
  await row(page,'a0').dragTo(row(page,'b'));
  await expect.poll(()=>page.evaluate(()=>window.drop?.nodes[0].nodeId)).toBe('a0');
  await page.evaluate(()=>{window.drop=null;const row=document.querySelector('[data-cx-id="b"]'),transfer=new DataTransfer();
    transfer.setData('text/plain','a');row.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}))});
  expect(await page.evaluate(()=>window.drop)).toBeNull();
});

test('numeric and boolean editors preserve scalar types',async({page})=>{
  const definition=view();definition.columns.push({id:'amount',title:'Amount',editable:true},{id:'enabled',title:'Enabled',editable:true});
  definition.roots[0].cells={amount:12,enabled:true};
  await mount(page,`{onEdit(p){(window.edits||(window.edits=[])).push(p);return true}}`,definition);
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.beginEdit('a','amount'));
  await page.getByRole('spinbutton',{name:'Edit Amount'}).fill('23.5'); await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.beginEdit('a','enabled'));
  await page.getByRole('checkbox',{name:'Edit Enabled'}).uncheck(); await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.edits.map(p=>p.value))).toEqual([23.5,false]);
});

test('translated editor and action controls have no axe violations',async({page})=>{
  const definition={...view(),labels:{editValue:'Edytuj {column}',saveEdit:'Zapisz',cancelEdit:'Anuluj',actions:'Akcje'}};
  await mount(page,`{onEdit:()=>true,onAction:()=>true,onDrop:()=>true}`,definition);
  await row(page,'a').focus(); await page.keyboard.press('Alt+Enter');
  await expect(page.getByRole('dialog',{name:'Edytuj Name'})).toBeVisible();
  const analyze=async()=>expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']).analyze()).violations
    .map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await analyze(); await page.getByRole('button',{name:'Anuluj'}).click(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu',{name:'Akcje'})).toBeVisible(); await analyze();
});

test('accepted cell updates close an editor instead of retaining a stale draft',async({page})=>{
  await mount(page,`{onEdit:()=>true}`);
  await row(page,'a').focus();await page.keyboard.press('Alt+Enter');
  await page.getByRole('textbox',{name:'Edit Name'}).fill('Stale draft');
  await page.evaluate(()=>document.querySelector('.cx-host').canopyx.applyCounts({protocol:'canopyx/2',type:'counts',items:[{id:'a',cells:{name:'Fresh value'}}]}));
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(row(page,'a')).toContainText('Fresh value');
});

test('accepted saved state closes interaction controls and cancels pending host work',async({page})=>{
  await mount(page,`{onEdit(p,r){window.signal=r.signal;return new Promise(()=>{})}}`);
  await row(page,'a').focus();await page.keyboard.press('Alt+Enter');await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox',{name:'Edit Name'})).toBeDisabled();
  expect(await page.evaluate(async()=>{const api=document.querySelector('.cx-host').canopyx;return api.setState(api.getState())})).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>window.signal.aborted)).toBe(true);
});
