import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {repo} from './support.mjs';
const read=name=>fs.readFileSync(path.join(repo,'CanopyX.Html/Assets',name),'utf8');
const script=read('canopyx-grid.js'),style=read('canopyx-grid.css'),editor=read('canopyx-filter-editor.js'),editorStyle=read('canopyx-filter-editor.css');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,16);
const version=editor.match(/version\s*:\s*"([a-f0-9]{16})"/)[1];
const view={protocol:'canopyx/2',type:'grid',id:'lazy-editor',label:'Records',pageSize:50,source:{kind:'inline'},search:true,selection:'multiple',columns:[{id:'name',title:'Name',kind:'text',sortable:true}],rows:[{id:'first',cells:{name:'First'}}]};
for(const mode of ['embedded','plain','hashed','module'])test('editor loads on first use with '+mode+' assets',async({page})=>{
 const loads=[];let entry=mode==='hashed'?'canopyx-grid.'+hash(script)+'.js':mode==='module'?'canopyx-grid-module.mjs':'canopyx-grid.js';
 await page.route('http://canopyx.test/**',route=>{
  const file=new URL(route.request().url()).pathname.split('/').at(-1);loads.push(file);
  if(file==='page'){
   const inert=mode==='embedded'?'<script type="application/x-canopyx-filter-editor" data-cx-version="'+version+'">'+editor+'</script><script type="application/x-canopyx-filter-style" data-cx-version="'+version+'">'+editorStyle+'</script>':'';
   const runtime=mode==='embedded'?'<script>'+script+'</script>':'<script '+(mode==='module'?'type="module"':'defer')+' src="/assets/'+entry+'"></script>';
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><title>Records</title><style>'+style+'</style>'+runtime+'</head><body><div class="cx-host" data-canopyx-host><script type="application/json" class="cx-config">'+JSON.stringify(view)+'</script></div>'+inert+'</body></html>'});
  }
  const contents=file===entry?mode==='module'?read(entry):script:file==='canopyx-filter-editor.js'||file===`canopyx-filter-editor.${hash(editor)}.js`?editor:editorStyle;
  return route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:contents});
 });
 await page.goto('http://canopyx.test/page');await page.locator('[data-canopyx-host]').evaluate(host=>host.canopyx.ready);
 expect(loads.filter(file=>file.startsWith('canopyx-filter-editor'))).toEqual([]);
 await page.locator('.cx-grid-filters > summary').click();await expect(page.getByRole('button',{name:'+ Condition',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Menu for Name',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Sort ascending',exact:true})).toBeVisible();
 expect(loads.filter(file=>file.startsWith('canopyx-filter-editor'))).toHaveLength(mode==='embedded'?0:2);
 await page.locator('[data-canopyx-host]').evaluate(host=>host.canopyx.destroy());await expect(page.getByRole('menu')).toHaveCount(0);
});
