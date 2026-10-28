import { test, expect } from "@playwright/test";
import { exampleUrl, nextFrames } from "./support.mjs";

async function plan(page, settings={}) {
  await page.setViewportSize({width:settings.viewport||1440,height:900}); await page.goto(exampleUrl("plan.html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await page.evaluate(async config => {
    const host=document.querySelector("[data-canopyx-host]"), old=host.canopyx, view=JSON.parse(JSON.stringify(old.view)), state=old.getState();old.destroy();
    host.style.height=(config.height||360)+"px";host.style.maxHeight="none";host.style.width=(config.width||1200)+"px";view.autoHeight=config.autoHeight??false;
    if(config.resources) for(let i=0;i<config.resources;i++) view.calendar.resources.view.roots.push({id:"extra-"+i,label:"Resource "+i});
    if(config.tasks) { const sample=view.rows[0];view.rows=Array.from({length:config.tasks},(_,i)=>({id:"task-"+i,cells:{...sample.cells,title:"Task "+i,owner:["platform","validation","operations"][i%3]}}));view.plan.dependencies=[]; }
    if(config.collapsed) view.calendar.resources.view.roots=[{id:"all",label:"All teams",children:view.calendar.resources.view.roots}];
    if(config.popover) view.calendar.details="popover";
    window.boundaryApi=CanopyX.createDataGrid(host,{view});await window.boundaryApi.ready;
    if(config.collapsed) await window.boundaryApi.setState({...window.boundaryApi.getState(),calendar:{...state.calendar,collapsed:["all"]}});
  },settings);await nextFrames(page);
}

test("a bounded large plan keeps a resource viewport and builds no desktop phone agenda",async({page})=>{
  await plan(page,{height:360,resources:500});
  const size=await page.evaluate(()=>({height:document.querySelector("[data-canopyx-host]").getBoundingClientRect().height,lanes:document.querySelectorAll(".cx-tl-lane").length,agenda:document.querySelectorAll(".cx-plan-agenda-title").length}));
  expect(size.height).toBeLessThanOrEqual(361);expect(size.lanes).toBeLessThan(30);expect(size.agenda).toBe(0);
});

test("a narrow embedded plan chooses its agenda and bounds the mounted task page",async({page})=>{
  await plan(page,{width:390,height:400,tasks:300});
  await expect(page.locator(".cx-plan")).toBeHidden();await expect(page.locator(".cx-plan-agenda")).toBeVisible();
  expect(await page.locator(".cx-plan-agenda-title").count()).toBeLessThanOrEqual(50);
  expect(await page.locator("[data-canopyx-host]").evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(401);
  await expect(page.locator(".cx-plan-agenda-next")).toBeEnabled();await page.locator(".cx-plan-agenda-next").click();
  await expect(page.locator(".cx-plan-agenda-position")).toContainText("2");
});

test("embedded path direction follows its host width",async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto(exampleUrl("path.html"));await page.waitForFunction(()=>document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(async()=>{const host=document.querySelector("[data-canopyx-host]");await host.canopyx.ready;host.style.width="390px";});await nextFrames(page);
  await expect.poll(()=>page.locator(".cx-path-hops").first().evaluate(el=>getComputedStyle(el).flexDirection)).toBe("column");
  const shaft=await page.locator(".cx-path-hop + .cx-path-hop").first().evaluate(el=>{const s=getComputedStyle(el,"::before");return {w:parseFloat(s.width),h:parseFloat(s.height)};});expect(shaft.h).toBeGreaterThan(shaft.w);
});

test("phone details popovers return focus to the visible agenda task",async({page})=>{
  await plan(page,{viewport:390,width:360,height:640,popover:true});
  const title=page.locator(".cx-plan-agenda-title").first();await title.click();await expect(page.locator(".cx-cal-details")).toBeVisible();
  await page.keyboard.press("Escape");await expect(title).toBeFocused();
});

test("collapsed resource groups can be expanded from the phone agenda",async({page})=>{
  await plan(page,{viewport:390,width:360,height:640,collapsed:true});
  const group=page.getByRole("button",{name:"All teams",exact:true});await expect(group).toHaveAttribute("aria-expanded","false");
  await group.click();await expect(page.locator(".cx-plan-agenda-title").first()).toBeVisible();
});

test("a fitted plan follows a desktop resize without a breakpoint switch",async({page})=>{
  await plan(page,{width:1000,height:500});await page.evaluate(()=>document.querySelector("[data-canopyx-host]").style.width="1300px");
  await expect.poll(()=>page.evaluate(()=>{const axis=document.querySelector(".cx-tl-canvas"),main=document.querySelector(".cx-tl-main");return Math.abs(axis.getBoundingClientRect().width-main.clientWidth);})).toBeLessThanOrEqual(2);
});

test("phone task conflict labels include outgoing dependencies",async({page})=>{
  await plan(page,{viewport:390,width:360,height:1000});await expect(page.locator('[data-cx-plan-record="verify"]').locator("..")).toContainText("Conflict");
});

for(const size of [{width:900,height:320,viewport:1440},{width:360,height:500,viewport:390}]) test("bounded matrix playback keeps its tail reachable at "+size.width,async({page})=>{
  await page.setViewportSize({width:size.viewport,height:900});await page.goto(exampleUrl("time-matrix-dark.html"));await page.waitForFunction(()=>document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(async config=>{
    const host=document.querySelector("[data-canopyx-host]"),old=host.canopyx;await old.ready;const frame=JSON.parse(JSON.stringify(old.view));old.destroy();
    delete frame.timeSlider;frame.rows.items=Array.from({length:80},(_,i)=>({id:"row-"+i,label:"Service "+i}));const cells=frame.cells[0];frame.cells=Array.from({length:80},()=>cells);
    const view={...frame,timeSlider:{initial:0,snapshots:[{at:"2026-10-25T10:00:00Z",label:"Snapshot",view:frame}]}};
    host.style.width=config.width+"px";host.style.height=config.height+"px";host.style.maxHeight=config.height+"px";window.boundaryMatrix=CanopyX.createMatrix(host,{view});await window.boundaryMatrix.ready;
  },size);await nextFrames(page);
  const bounds=await page.evaluate(()=>{const host=document.querySelector("[data-canopyx-host]"),scroll=host.querySelector(".cx-mx-scroll"),a=host.getBoundingClientRect(),b=scroll.getBoundingClientRect();return {height:a.height,bottom:b.bottom,hostBottom:a.bottom};});
  expect(bounds.height).toBeLessThanOrEqual(size.height+1);expect(bounds.bottom).toBeLessThanOrEqual(bounds.hostBottom+1);
  await page.evaluate(()=>window.boundaryMatrix.focusCell("row-79",window.boundaryMatrix.view.columns.items[0].id));
  await expect(page.getByRole("rowheader",{name:"Service 79",exact:true})).toBeVisible();
});
