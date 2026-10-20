import { test, expect } from "@playwright/test";
import { field } from "./flow-support.mjs";
import { mountContract as mount } from "./flow-contract-support.mjs";

test("missing edit values stay empty instead of silently acquiring create defaults", async ({ page }) => {
  await mount(page, [
    { id: "count", type: "number", label: "Count", default: 7, path: "count" },
    { id: "flag", type: "toggle", label: "Flag", default: true, path: "flag" }
  ], `({onSubmit: detail => {window.__proposal=detail;return {status:"saved"};}})`, {});
  await field(page, "flag").locator("input").focus();
  await field(page, "flag").locator("input").press("Tab");
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({count:null,flag:null});
  await page.evaluate(() => window.__api.submit());
  expect(await page.evaluate(() => ({mode:window.__proposal.mode,patch:window.__proposal.patch,changes:window.__proposal.changes}))).toEqual({mode:"edit",patch:[],changes:[]});
});

test("read-only shared number and lookup editors ignore keyboard changes", async ({ page }) => {
  await mount(page, [
    { id: "count", type: "number", label: "Count", default: 7, readOnly:true },
    { id: "owner", type: "lookup", label: "Owner", default: "a", readOnly:true, options:[{value:"a",label:"Alex"},{value:"b",label:"Blair"}] }
  ]);
  await field(page,"count").locator("input").press("ArrowUp");
  await field(page,"count").locator("input").press("Tab");
  await field(page,"owner").locator("input").press("ArrowDown");
  await field(page,"owner").locator("input").press("Enter");
  await field(page,"owner").locator("input").press("Tab");
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({count:7,owner:"a"});
  await expect(field(page,"count").locator("input")).toHaveValue("7");
  await expect(field(page,"owner").locator("input")).toHaveValue("Alex");
});

test("a valid duration remains valid when its seconds exceed six digits", async ({ page }) => {
  await mount(page,[{id:"window",type:"duration",label:"Window",default:"P12D",units:["seconds"]}]);
  await field(page,"window").locator("input").press("Tab");
  expect(await page.evaluate(() => window.__api.validate())).toMatchObject({valid:true,errors:[]});
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({window:"P12D"});
});

for (const value of ['({nested:true})', '[["nested"]]', '1n', 'Number.MAX_SAFE_INTEGER+1']) test(`an editor cannot submit an out-of-contract value ${value}`, async ({ page }) => {
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await mount(page,[{id:"custom",type:"custom",editor:"custom",label:"Custom"}],
    `({editors:{custom:{create:()=>({element:document.createElement("input"),getValue:()=>${value}})}},onSubmit:()=>{window.__submitted=true;return {status:"saved"};}})`);
  await field(page,"custom").locator("input").fill("changed");
  expect(await page.evaluate(() => window.__api.validate())).toMatchObject({valid:false});
  expect(await page.evaluate(() => window.__api.submit())).toBeNull();
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({custom:null});
  expect(await page.evaluate(() => !!window.__submitted)).toBe(false);
  expect(errors).toEqual([]);
});

test("a pasted list cannot exceed the 1000-item contract", async ({ page }) => {
  await mount(page,[{id:"items",type:"list",label:"Items"}]);
  await field(page,"items").locator("input").fill("Existing");
  await field(page,"items").locator(".cx-flow-list-add").click();
  await field(page,"items").locator("input").last().evaluate(input=>{
    const clipboardData=new DataTransfer();clipboardData.setData("text/plain",Array.from({length:1000},(_,i)=>"Item "+i).join("\n"));
    const paste=new Event("paste",{bubbles:true,cancelable:true});
    Object.defineProperty(paste,"clipboardData",{value:clipboardData});
    input.dispatchEvent(paste);
  });
  expect(await page.evaluate(() => window.__api.validate())).toMatchObject({valid:false});
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({items:["Existing"]});
});

for (const type of ["list","multiChoice"]) test(`null ${type} initial values do not permit null defaults`, async ({ page }) => {
  await expect(mount(page,[{id:"items",type,label:"Items",default:null,...(type==="multiChoice"?{options:[{value:"a"}]}:{})}])).rejects.toThrow(/default/);
});

test("unsafe numeric options are rejected instead of rounding an identifier", async ({ page }) => {
  await expect(mount(page,[{id:"choice",type:"choice",label:"Choice",options:[{value:9007199254740992}]}])).rejects.toThrow(/option value/);
});

const steps = [
  {id:"one",title:"First",fields:[{id:"name",type:"text",label:"Name",required:true,default:"valid"}]},
  {id:"two",title:"Second",fields:[{id:"note",type:"text",label:"Note"}]},
  {id:"three",title:"Last",type:"info"}
];

test("select options with a disabled reason cannot be chosen with the keyboard", async ({ page }) => {
  await mount(page, [{ id: "choice", type: "select", label: "Choice", default: "a", options: [
    { value: "a", label: "Available" }, { value: "b", label: "Unavailable", disabledReason: "Not supported" }, { value: "c", label: "Other" }
  ] }]);
  const select = field(page, "choice").locator("select");
  await expect(select.locator('option[value="1"]')).toBeDisabled();
  await select.press("ArrowDown"); await select.press("Tab");
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ choice: "c" });
});

test("lookup suggestions exclude options with a disabled reason", async ({ page }) => {
  await mount(page, [{ id: "choice", type: "lookup", label: "Choice", options: [
    { value: "a", label: "Available" }, { value: "b", label: "Unavailable", disabledReason: "Not supported" }
  ] }]);
  const input = field(page, "choice").getByRole("combobox");
  await input.fill("Unavailable");
  await expect(page.locator(".cx-editor-note")).toHaveText("No matches");
  await expect(page.getByRole("option", { name: "Unavailable", exact: true })).toHaveCount(0);
  await input.press("Tab");
  expect(await page.evaluate(() => window.__api.validate())).toMatchObject({ valid: false });
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ choice: null });
});

for(const source of ["api","typing"]) test(`changing a completed answer through ${source} locks later linear steps`,async({page})=>{
  await mount(page,[],"({})",undefined,{steps});
  await page.evaluate(()=>window.__api.next());await page.evaluate(()=>window.__api.back());
  if(source==="api")await page.evaluate(()=>window.__api.setValues({name:""}));
  else {await field(page,"name").locator("input").fill("");await field(page,"name").locator("input").press("Tab");}
  await page.evaluate(()=>window.__api.goTo("three"));
  expect(await page.evaluate(()=>window.__api.getStep())).toBe("one");
});

test("host errors without a review page open and describe the first affected step",async({page})=>{
  await mount(page,[],`({onSubmit:()=>({status:"error",fieldErrors:{name:"Choose another name"}})})`,undefined,{steps});
  await page.evaluate(()=>window.__api.next());await page.evaluate(()=>window.__api.next());
  await page.evaluate(()=>window.__api.submit());
  expect(await page.evaluate(()=>window.__api.getStep())).toBe("one");
  await expect(page.locator(".cx-flow-stage .cx-flow-summary")).toContainText("Choose another name");
  await expect(page.locator(".cx-flow-stage .cx-flow-summary")).toBeFocused();
});
