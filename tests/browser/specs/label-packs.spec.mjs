import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import axe from 'axe-core';
import polish, { staticLabels as polishStatic } from '../../../JavaScript/locales/pl.mjs';
import german, { staticLabels as germanStatic } from '../../../JavaScript/locales/de.mjs';
import spanish, { staticLabels as spanishStatic } from '../../../JavaScript/locales/es.mjs';
import french, { staticLabels as frenchStatic } from '../../../JavaScript/locales/fr.mjs';
import italian, { staticLabels as italianStatic } from '../../../JavaScript/locales/it.mjs';
import { repo, viewPage, nextFrames, openExample } from './support.mjs';

const packs = [['pl',polish,polishStatic],['de',german,germanStatic],['es',spanish,spanishStatic],['fr',french,frenchStatic],['it',italian,italianStatic]];
const canonical = JSON.parse(fs.readFileSync(path.join(repo,'CanopyX/Views/Locales/labels.json'),'utf8'));
const wire = name => name[0].toLowerCase()+name.slice(1);
for (const [language,labels,staticLabels] of packs) {
  test(`${language} pack covers every browser and static label and preserves host overrides`,async({page})=>{
    const all = {...labels,...staticLabels}, index = packs.findIndex(pack=>pack[0]===language);
    expect(Object.keys(all).sort()).toEqual(Object.keys(canonical).map(wire).sort());
    for (const [name,values] of Object.entries(canonical)) expect(all[wire(name)]).toBe(values[index]);
    expect(Object.isFrozen(labels)&&Object.isFrozen(staticLabels)).toBe(true);
    const view = {protocol:'canopyx/2',type:'grid',id:'translated',label:'Host inventory',source:{kind:'inline'},
      selection:'multiple',search:true,rowHeight:28,pageSize:20,presentation:'paged',pageLength:5,
      labels,reporting:{headerFilters:true,selectionControls:true,filterGroups:true},
      columns:[{id:'name',title:'Host column',kind:'text',sortable:true}],rows:Array.from({length:12},(_,i)=>({id:'r'+i,cells:{name:'Host record '+i}}))};
    const classic = fs.readFileSync(path.join(repo,`CanopyX.Html/Assets/canopyx-labels-${language}.js`),'utf8');
    const html = viewPage(view).replace('<body class="cx-page">','<body class="cx-page"><main><h1>Host inventory</h1>')
      .replace('</body>','</main></body>').replace('lang="en"',`lang="${language}"`).replace('</head>',
      `<script>${classic}\nCanopyX.configure('translated',{labels:{...CanopyXLocales.${language}.labels,gridCopy:'Host copy'}});</script></head>`);
    await page.route('http://canopyx.test/translated',route=>route.fulfill({contentType:'text/html',body:html}));
    await page.goto('http://canopyx.test/translated');await page.waitForSelector('[data-cx-ready]');await nextFrames(page);
    // The editing part brings its gridEdit… labels; the runtime defines the rest.
    const runtimeNames = await page.evaluate(()=>Object.keys(CanopyX.labels));
    const partNames = Object.keys(labels).filter(name=>!runtimeNames.includes(name));
    expect(Object.keys(labels).filter(name=>runtimeNames.includes(name)).sort()).toEqual(runtimeNames.sort());
    const editing = fs.readFileSync(path.join(repo,'CanopyX.Html/Assets/canopyx-editing.js'),'utf8');
    expect(partNames.length).toBeGreaterThan(0);
    for (const name of partNames) { expect(name).toMatch(/^gridEdit[A-Z]/); expect(editing).toContain(name+':"'); }
    expect(await page.evaluate(code=>CanopyXLocales[code],language)).toEqual({labels,staticLabels});
    await expect(page.getByPlaceholder(labels.searchPlaceholder,{exact:true})).toBeVisible();
    await expect(page.locator('.cx-grid-columns > summary')).toHaveText(labels.columns);
    await expect(page.getByRole('button',{name:labels.gridNextPage,exact:true})).toBeVisible();
    await page.locator('.cx-grid-columns > summary').click();
    await expect(page.getByRole('button',{name:labels.gridResetColumns,exact:true})).toBeVisible();
    await page.locator('.cx-grid-columns > summary').click();
    await page.locator('.cx-grid-export > summary').click();
    await expect(page.getByRole('button',{name:'Host copy',exact:true})).toBeVisible();
    await page.locator('.cx-grid-export > summary').click();
    await page.addScriptTag({content:axe.source});
    expect(await page.evaluate(async()=> (await axe.run(document)).violations)).toEqual([]);
  });
  test(`${language} .NET example uses the complete pack in a compact portable page`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await openExample(page,`localized-grid-${language}.html`);
    await expect(page.getByPlaceholder(labels.searchPlaceholder,{exact:true})).toBeVisible();
    await page.locator('.cx-header-check').click();await expect(page.getByRole('button',{name:labels.gridSelectPage,exact:true})).toBeVisible();
    await page.getByRole('button',{name:labels.gridSelectPage,exact:true}).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cx-grid-row-select').first()).toBeChecked();
    await page.getByRole('button',{name:labels.gridNextPage,exact:true}).click();await nextFrames(page);
    await expect(page.getByRole('spinbutton',{name:labels.gridPageNumber,exact:true})).toHaveValue('2');
    expect(await page.evaluate(()=>document.querySelector('.cx-grid').clientHeight)).toBeGreaterThan(100);
    await page.addScriptTag({content:axe.source});
    expect(await page.evaluate(async()=> (await axe.run(document)).violations)).toEqual([]);
  });
}
