import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";

async function mount(page, hosted, paged = true) {
  const rows = [{ id: "a", cells: { name: "Alpha", amount: 10 } }, { id: "b", cells: { name: "Beta", amount: 20 } }];
  const view = { protocol: "canopyx/2", type: "grid", id: "live-totals", label: "Live totals", pageSize: 2,
    pageLength: 2, presentation: paged ? "paged" : "continuous", selection: "none", live: {},
    source: { kind: hosted ? "host" : "inline" }, ...(hosted ? {} : { rows }),
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "amount", title: "Amount", kind: "number", sortable: true }],
    footers: ["page", "all"].map(scope => ({ id: scope, label: scope, scope, aggregates: [{ id: "sum", column: "amount", operation: "sum", label: "Sum" }] })) };
  const setup = `window.version=1;window.broken=false;window.held=false;window.requested=false;window.release=null;
    window.options=${hosted ? `{source:{query:async q=>{
      const version=window.version;const rows=[{id:"a",cells:{name:"Alpha",amount:10}},{id:"b",cells:{name:"Beta",amount:version===1?20:30}}].filter(row=>!q.search||row.cells.name.includes(q.search));
      if(window.held){window.requested=true;await new Promise(resolve=>window.release=resolve);}
      const items=rows.slice(q.offset,q.offset+q.limit);if(window.broken&&items.length>1)items[1].id=items[0].id;
      const sum=window.broken?999:rows.reduce((total,row)=>total+row.cells.amount,0);
      return {protocol:"canopyx/2",type:"gridPage",view:"live-totals",revision:"r"+version,offset:q.offset,total:2,matched:rows.length,items,footerValues:{page:{sum},all:{sum}}};
    }}}` : "{}"};`;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("https://footer-live.test/**", route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name) return route.fulfill({ body: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", path.basename(name))), contentType: name.endsWith("css") ? "text/css" : "text/javascript" });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live totals</title><link rel="stylesheet" href="/canopyx-grid.css"><script src="/canopyx-grid.js"></script></head><body><div id="grid" style="height:500px"></div><script>' + setup +
      'window.api=CanopyX.createDataGrid(document.querySelector("#grid"),{view:' + JSON.stringify(view) + ',...window.options});</script></body></html>' });
  });
  await page.goto("https://footer-live.test/");
  await page.evaluate(() => api.ready);
  expect(errors).toEqual([]);
}

for (const hosted of [false, true]) for (const paged of [false, true]) test("live footer acceptance " + (hosted ? "hosted" : "inline") + " " + (paged ? "paged" : "continuous"), async ({ page }) => {
  await mount(page, hosted, paged);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 30");
  if (hosted) await page.evaluate(async () => { window.version=2; await api.refreshRows(); });
  else await page.evaluate(() => api.updateRows([{ id: "b", cells: { amount: 30 } }]));
  await expect(page.locator('[data-cx-id="b"]')).toContainText("30");
  for (const scope of ["page", "all"]) await expect(page.locator('[data-cx-footer="' + scope + '"]')).toContainText("Sum: 40");
  await page.evaluate(() => api.setColumnVisible("amount", false));
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 40");
});

test("failed live refresh preserves accepted rows and totals", async ({ page }) => {
  await mount(page, true);
  expect(await page.evaluate(async () => { version=2;broken=true;try {await api.refreshRows();return false;}catch{return true;} })).toBe(true);
  await expect(page.locator('[data-cx-id="b"]')).toContainText("20");
  await page.evaluate(() => api.setColumnVisible("amount", false));
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 30");
});

test("a superseded live refresh cannot replace newer query totals", async ({ page }) => {
  await mount(page, true);
  await page.evaluate(() => { version=2;held=true;window.refresh=api.refreshRows().catch(()=>{}); });
  await expect.poll(() => page.evaluate(() => requested)).toBe(true);
  await page.evaluate(async () => { version=3;held=false;await api.setQuery({search:"Beta"}); });
  await page.evaluate(async () => { release();await window.refresh; });
  await expect(page.locator('[data-cx-id="a"]')).toHaveCount(0);
  await expect(page.locator('[data-cx-footer="all"]')).toContainText("Sum: 30");
  expect(await page.evaluate(() => api.getLiveState().revision)).toBe("r3");
});
