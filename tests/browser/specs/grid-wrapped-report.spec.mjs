import { test, expect } from "@playwright/test";
import { pinTestFont } from "./visual-font.mjs";
import { mountReportLayout, reportLayoutView, layoutGeometry } from "./report-grid-layout-support.mjs";

test.beforeEach(async ({ page }) => { await pinTestFont(page); });
for (const theme of ["light", "dark"]) test(`five report columns fit 1086 with complete two-line headers in ${theme}`, async ({ page }) => {
  await mountReportLayout(page, { theme, width: 1086 });
  const box = await layoutGeometry(page);
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
  const headers = await page.locator('.cx-hcell :is(.cx-sort,.cx-htext)').evaluateAll(nodes => nodes.map(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width && r.height);
    return { text: node.textContent, title: node.title, width: node.clientWidth, clipped: node.scrollWidth > node.clientWidth + 1,
      lines: new Set(rects.map(r => Math.round(r.top))).size, fits: rects.every(r => r.bottom <= node.getBoundingClientRect().bottom + 1 && r.right <= node.getBoundingClientRect().right + 1) };
  }));
  expect(headers.every(h => !h.clipped && h.fits && h.lines <= 2 && h.title === h.text)).toBe(true);
  expect(headers.some(h => h.lines === 2)).toBe(true);
  expect(box.clippedPills).toBe(0);
});

test("phone identity retains twelve visible characters beside two essential peers and residual disclosure", async ({ page }) => {
  const view = reportLayoutView(); view.reporting.columnReorder = false; view.selection = "none";
  view.columns = [{ id:"name", title:"Record", kind:"text", rowHeader:true, width:240 },
    { id:"days", title:"Days", kind:"number", priority:1 },
    { id:"signal", title:"Signal", kind:"text", priority:1, presenter:{kind:"enum"} },
    ...["owner","evidence"].map(id => ({id,title:id,kind:"text",priority:"optional"}))];
  const name = "Warehouse inventory branch-office production region internal.example.test";
  view.rows = [{id:"a",cells:{name,days:7,signal:{value:"Expires 0-7d",tone:"warning"},owner:"Operations",evidence:"Observed"}}];
  await mountReportLayout(page,{view,width:342,viewport:{width:390,height:844}});
  const row=page.locator('.cx-row[data-cx-id="a"]');
  await expect(row.locator('.cx-cell').first()).toHaveAttribute('title',name);
  const geometry=await row.evaluate(row => {
    const text=row.querySelector('.cx-cell .cx-text'), primary=row.querySelector('.cx-phone-primary') || row.firstElementChild, box=text.getBoundingClientRect();
    const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT);let node,visible=0;
    while(node=walker.nextNode())for(let i=0;i<node.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(r.width && r.right<=box.right+1 && r.bottom<=box.bottom+1)visible++;}
    return {visible,width:row.firstElementChild.getBoundingClientRect().width,grid:document.querySelector('.cx-grid').clientWidth,
      chipOnPrimary:!!primary.querySelector('.cx-hidden-fields'),document:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  expect(geometry.visible).toBeGreaterThanOrEqual(12);
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.grid*.4-1);
  expect(geometry.chipOnPrimary).toBe(false);
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
});

for (const peer of [false,true]) test(`a phone identity wraps to two lines without hidden fields (peer ${peer})`, async ({ page }) => {
  const view=reportLayoutView();view.reporting.columnReorder=false;view.selection="none";
  view.columns=[{id:"name",title:"Record",kind:"text",rowHeader:true},...(peer?[{id:"days",title:"Days",kind:"number",priority:1}]:[])];
  view.rows=[{id:"a",cells:{name:"server-01.branch-office.production-region.internal.example.test",...(peer?{days:7}:{})}}];
  await mountReportLayout(page,{view,width:342,viewport:{width:390,height:844}});
  await expect(page.locator('.cx-phone-fields')).toHaveCount(0);
  const lines=await page.locator('.cx-row .cx-text').first().evaluate(text=>{const r=document.createRange();r.selectNodeContents(text);const b=text.getBoundingClientRect();return [...new Set([...r.getClientRects()].filter(x=>x.bottom<=b.bottom+1).map(x=>Math.round(x.top)))].length;});
  expect(lines).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
