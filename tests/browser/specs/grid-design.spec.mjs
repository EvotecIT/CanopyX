import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

async function mount(page, view, options = {}, runtime = "grid") {
  const {script,style} = runtimeAssets(runtime);
  await page.setContent("<!doctype html><html lang='en'><head><title>Grid design</title><style>" + style + "</style></head><body><main><div id='host' data-cx-theme='light'></div></main></body></html>");
  await page.addScriptTag({content:script});
  await page.evaluate(async ({view,options}) => { window.grid = CanopyX.createDataGrid(document.querySelector('#host'), {view,...options}); await grid.ready; }, {view,options});
}
const base = {protocol:"canopyx/2",type:"grid",id:"design",label:"Records",pageSize:100,selection:"multiple",search:true,
  source:{kind:"inline"},columns:[{id:"name",title:"Name",kind:"text",width:220,sortable:true}],rows:[{id:"r1",cells:{name:"First record"}}]};

test("density supplies default row sizes and preserves explicit dimensions", async ({page}) => {
  for (const [density,height,padding] of [["compact",28,8],["default",34,12],["comfortable",42,14]]) {
    await mount(page,{...base,density});
    await expect(page.locator('.cx-row')).toHaveCSS('height',height + 'px');
    await expect(page.locator('.cx-row .cx-cell')).toHaveCSS('padding-left',padding + 'px');
    await page.evaluate(() => grid.destroy());
  }
  await mount(page,{...base,density:"comfortable",rowHeight:29});
  await expect(page.locator('.cx-row')).toHaveCSS('height','29px');
});

export { mount, base };
