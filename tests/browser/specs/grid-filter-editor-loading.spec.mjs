import {test,expect} from '@playwright/test';
import {readAsset as read,assetHash as hash,partFixture} from './part-fixture-support.mjs';
const script=read('canopyx-grid.js'),style=read('canopyx-grid.css');
const parts=partFixture('filter-editor','ui-menu','presenters');
const view={protocol:'canopyx/2',type:'grid',id:'lazy-editor',label:'Records',pageSize:50,source:{kind:'inline'},search:true,selection:'multiple',columns:[{id:'name',title:'Name',kind:'text',sortable:true}],rows:[{id:'first',cells:{name:'First'}}]};
for(const mode of ['embedded','plain','hashed','module'])test('editor loads on first use with '+mode+' assets',async({page})=>{
 const errors=[],missing=[];page.on('pageerror',error=>errors.push(error.message));
 const loads=[];let entry=mode==='hashed'?'canopyx-grid.'+hash(script)+'.js':mode==='module'?'canopyx-grid-module.mjs':'canopyx-grid.js';
 await page.route('http://canopyx.test/**',route=>{
  const file=new URL(route.request().url()).pathname.split('/').at(-1);loads.push(file);
  if(file==='page'){
   const inert=mode==='embedded'?parts.payloads:'';
   const runtime=mode==='embedded'?'<script>'+script+'</script>':'<script '+(mode==='module'?'type="module"':'defer')+' src="/assets/'+entry+'"></script>';
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><title>Records</title><style>'+style+'</style>'+runtime+'</head><body><div class="cx-host" data-canopyx-host><script type="application/json" class="cx-config">'+JSON.stringify(view)+'</script></div>'+inert+'</body></html>'});
  }
  if(file===entry)return route.fulfill({contentType:'text/javascript',body:mode==='module'?read(entry):script});
  const asset=parts.files.get(file);
  if(!asset)missing.push(file);
  return route.fulfill(asset||{status:404,body:''});
 });
 await page.goto('http://canopyx.test/page');await page.locator('[data-canopyx-host]').evaluate(host=>host.canopyx.ready);
 expect(loads.filter(file=>file.startsWith('canopyx-filter-editor'))).toEqual([]);
 expect(loads.filter(file=>file.startsWith('canopyx-presenters'))).toEqual([]);
 await page.locator('.cx-grid-filters > summary').click();await expect(page.getByRole('button',{name:'+ Condition',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Menu for Name',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Sort ascending',exact:true})).toBeVisible();
 expect(loads.filter(file=>file.startsWith('canopyx-filter-editor'))).toHaveLength(mode==='embedded'?0:2);
 expect(loads.filter(file=>file.startsWith('canopyx-presenters'))).toHaveLength(mode==='embedded'?0:1);
 expect(missing).toEqual([]);expect(errors).toEqual([]);
 await page.locator('[data-canopyx-host]').evaluate(host=>host.canopyx.destroy());await expect(page.getByRole('menu')).toHaveCount(0);
 expect(errors).toEqual([]);
});
