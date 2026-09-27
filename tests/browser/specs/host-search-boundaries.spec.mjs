import { expect, test } from "@playwright/test";
import { viewPage, nextFrames, repo } from "./support.mjs";
import path from "node:path";
const view = { protocol: "canopyx/1", type: "view", id: "boundaries", label: "Boundaries", columns: [{ id: "name", title: "Name", width: 400 }], source: { kind: "inline" }, roots: [{ id: "one", label: "Alpha Beta" }] };
async function open(page, data = view, options = "{}") {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(data).replace("</body>", `<script>window.api=CanopyX.createTreeGrid(document.querySelector('.cx-host'),Object.assign({view:JSON.parse(document.querySelector('.cx-config').textContent)},${options}));</script></body>`) }));
  await page.goto("https://canopyx.test/#other=keep"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
test.beforeEach(({ page }) => { page.errors = []; page.on("pageerror", e => page.errors.push(e.message)); });
test.afterEach(({ page }) => expect(page.errors).toEqual([]));

for (const query of [undefined, null, "different"]) test(`remote search rejects echoed query ${query}`, async ({ page }) => {
  await page.route("https://canopyx.test/search?*", r => r.fulfill({ json: { protocol: "canopyx/1", type: "search", query, hits: [{ path: ["one"], label: "Alpha Beta" }] } }));
  await open(page, { ...view, source: { kind: "remote", children: "/page?ref={ref}&cursor={cursor}", search: "/search?q={query}&limit={limit}" } }, `{source: {page: async()=>({items:[]})}}`);
  const result = await page.evaluate(async () => { try { await CanopyX.sources.remote({source:{search:"/search?q={query}&limit={limit}"}}).search("alpha",20); return null; } catch(e) { return e.message; } });
  expect(result).toContain("query");
});

test("sidecar short words require an indexed prefix before loading files", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => { const s=CanopyX.sources.sidecar({id:"short",source:{base:"/absent/"}}); try { await s.search("a b",20); return null; } catch(e) { return e.message; } });
  expect(result).toContain("two");
});

test("throwing selection hook leaves selection and deep link consistent", async ({ page }) => {
  await open(page, { ...view, deepLink: true }, `{onSelect(){throw new Error("host failure");}}`);
  expect(await page.evaluate(async () => {try { await api.expandPath(["one"]); } catch(e){return e.message;}})).toBe("host failure");
  await expect(page.locator('[data-cx-id="one"]')).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => location.hash)).toContain("cx.boundaries=one");
});

test("opening a loaded parent processes deferred lazy defaults", async ({ page }) => {
  await open(page, { ...view, roots: undefined }, `{source:{page:async node=>({items:node?[{id:"child",label:"Child"}]:[{id:"parent",label:"Parent",children:[{id:"lazy",label:"Lazy",hasChildren:true,expanded:true,ref:"lazy"}]}],next:null})}}`);
  await page.evaluate(() => api.expandPath(["parent"], {expandLast:true}));
  // The public path opener must honor the same declarative defaults as a row toggle.
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await expect(page.locator('[data-cx-id="child"]')).toBeVisible();
});

for (const total of [0, undefined]) test(`terminal empty lazy page becomes a leaf (${total})`, async ({ page }) => {
  await open(page, { ...view, roots: undefined }, `{source:{page:async node=>node?({items:[],next:null,total:${total}}):({items:[{id:"lazy",label:"Lazy",ref:"lazy",hasChildren:true}],next:null})}}`);
  await page.locator('[data-cx-id="lazy"] .cx-exp').click();
  await expect(page.locator('[data-cx-id="lazy"] .cx-exp')).toHaveClass(/cx-leaf/);
  await expect(page.locator('[data-cx-id="lazy"]')).not.toHaveAttribute("aria-expanded");
});

for (const semantic of [true,false]) test(`search option ${semantic?"semantic":"pointer"} click selects once`, async ({ page }) => {
  await open(page, { ...view, search: { minLength:2, maxResults:20, placeholder:"Search" } }, `{onSelect(){window.selections=(window.selections||0)+1;}}`);
  await page.getByRole("combobox").fill("alpha"); await expect(page.getByRole("option")).toHaveCount(1);
  if(semantic) await page.getByRole("option").evaluate(el=>el.click()); else await page.getByRole("option").click();
  await expect(page.locator('[data-cx-id="one"]')).toHaveAttribute("aria-selected","true");
  expect(await page.evaluate(()=>window.selections)).toBe(1);
  if(semantic) await page.screenshot({path:path.join(repo,"artifacts/takeover/eleventh-search-click.png")});
});

for(const queued of [true,false]) test(`sidecar pair identity is unambiguous (${queued?"queued":"pending"})`, async({page})=>{
  await open(page);
  const result=await page.evaluate(async queued=>{
    const entries=[["a\nb","c",{protocol:"canopyx/1",type:"page",parent:null,offset:0,items:[{id:"first",label:"First"}]}],["a","b\nc",{protocol:"canopyx/1",type:"page",parent:null,offset:0,items:[{id:"second",label:"Second"}]}]];
    const sources=entries.map(([id,ref],i)=>{CanopyXSidecar.push([id,"manifest",{protocol:"canopyx/1",type:"manifest",root:ref}]);return CanopyX.sources.sidecar({id,source:{base:"/pair"+i+"/"}});});
    if(queued) entries.forEach(e=>CanopyXSidecar.push(e));
    const pending=sources.map(s=>s.page(null,null));
    if(!queued){await new Promise(r=>setTimeout(r,0));entries.forEach(e=>CanopyXSidecar.push(e));}
    return (await Promise.all(pending)).map(p=>p.items[0].id);
  },queued);
  expect(result).toEqual(["first","second"]);
});

for(const id of ["\u0000","line\nbreak","quote\"","emoji😀"]) test(`toolbar controls preserve exact identifier ${JSON.stringify(id)}`,async({page})=>{
  await open(page,{...view,columns:[...view.columns,{id,title:"Extra",width:100}],filters:[{id,label:"Only flagged",flag:"yes"}],roots:[{id:"one",label:"Alpha Beta",flags:["yes"]}]});
  const checked=await page.evaluate(id=>{api.setFilterActive(id,true);api.setColumnVisible(id,false);return [document.querySelector('[data-cx-filter]').checked,document.querySelector('[data-cx-column][type=checkbox]').checked];},id);
  expect(checked).toEqual([true,false]);
});

test("non-tree callback receives a fresh complete grid cell",async({page})=>{
  await open(page,{...view,columns:[...view.columns,{id:"extra",title:"Extra",width:200}],roots:[{id:"one",label:"Alpha Beta",cells:{extra:"Value"}}]},`{renderCell(node,id,el){if(id!=="extra")return false; window.shapes=(window.shapes||[]).concat([[el.tagName,el.getAttribute("role"),el.getAttribute("aria-colindex"),el.hasAttribute("data-old")]]);el.setAttribute("data-old","yes");el.classList.add("host-cell");el.textContent="Host value";return true;}}`);
  await page.evaluate(()=>api.sort("name","asc")); await nextFrames(page);
  expect(await page.evaluate(()=>window.shapes)).toEqual([["DIV","gridcell","2",false],["DIV","gridcell","2",false]]);
  await expect(page.locator('.cx-cell.host-cell')).toHaveText("Host value");
  await page.screenshot({path:path.join(repo,"artifacts/takeover/eleventh-host-cell.png")});
});
