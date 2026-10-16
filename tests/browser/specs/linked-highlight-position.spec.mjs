// Linked scrolling uses positions in the complete accepted result, including large local datasets.
import { test, expect } from "@playwright/test";
import { serveGrid } from "./editing-support.mjs";
import { ready, servePage } from "./enhance-support.mjs";
import { nextFrames } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const row = (page, id) => page.locator(`.cx-row[data-cx-id="${id}"]`);
const id = index => "r" + String(index).padStart(6, "0");

function largeView(compact) {
  const rows = Array.from({ length: 100000 }, (_, index) => ({ id: id(index), cells: {
    name: "Record " + index, rank: index, group: index % 2 ? "Excluded" : "Included" } }));
  const view = { protocol: "canopyx/2", type: "grid", id: "linked-position", label: "Linked records", pageSize: 100,
    selection: "multiple", search: true, source: { kind: "inline" },
    query: { sort: [{ column: "rank", direction: "desc" }], filters: [{ column: "group", operator: "eq", values: ["Included"] }] },
    columns: [{ id: "name", title: "Name", kind: "text", width: 200 },
      { id: "rank", title: "Rank", kind: "number", width: 120, sortable: true },
      { id: "group", title: "Group", kind: "text", width: 140 }], rows };
  if (compact) {
    view.rowData = { version: 1, count: rows.length, columns: ["name", "rank", "group"], chunks: [] };
    for (let offset = 0; offset < rows.length; offset += 1000)
      view.rowData.chunks.push(rows.slice(offset, offset + 1000).map(row => [row.id, row.cells.name, row.cells.rank, row.cells.group]));
    delete view.rows;
  }
  return view;
}

test.beforeEach(({ page }) => {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") page.pageErrors.push(message.text()); });
});
test.afterEach(({ page }) => { expect(page.pageErrors).toEqual([]); });

for (const compact of [false, true]) test(`linked scrolling finds the accepted position beyond 10000 ${compact ? "compact" : "ordinary"} inline rows`, async ({ page }) => {
  await page.setViewportSize({ width: compact ? 390 : 1400, height: 900 });
  await serveGrid(page, { view: largeView(compact) });
  expect(await page.evaluate(`${api}.getQuery().filters`)).toEqual([{ column: "group", operator: "eq", values: ["Included"] }]);
  const search = page.getByRole("searchbox");
  await search.focus();
  // A normal loaded target and an explicitly disabled scroll keep their existing behavior.
  expect(await page.evaluate(`${api}.setHighlight(['r099998'])`)).toBe(1);
  await expect(row(page, "r099998")).toHaveAttribute("data-cx-linked", "true");
  expect(await page.evaluate(`${api}.getState().scrollTop`)).toBe(0);
  await page.evaluate(`${api}.setHighlight(['r000000'], { scroll: false })`);
  expect(await page.evaluate(`${api}.getState().scrollTop`)).toBe(0);
  // This record is last in the 50,000 accepted rows, despite being first in the original input.
  expect(await page.evaluate(`${api}.setHighlight(['r000000'])`)).toBe(1);
  await expect(row(page, "r000000")).toHaveAttribute("data-cx-linked", "true");
  await expect(row(page, "r000000")).toHaveAttribute("aria-rowindex", "50001");
  expect(await page.evaluate(`${api}.getState().scrollTop`)).toBeGreaterThan(10000);
  await expect(search).toBeFocused();
  // A cached later target must not hide an earlier accepted target that has not been loaded.
  await page.evaluate(`${api}.setHighlight(['r000000', 'r020000'])`);
  await expect(row(page, "r020000")).toHaveAttribute("data-cx-linked", "true");
  await expect(row(page, "r020000")).toHaveAttribute("aria-rowindex", "40001");
  await expect(search).toBeFocused();
  const target = await row(page, "r020000").boundingBox(), viewport = await page.locator(".cx-grid").boundingBox();
  expect(target.y).toBeGreaterThanOrEqual(viewport.y);
  expect(target.y + target.height).toBeLessThanOrEqual(viewport.y + viewport.height);
  await page.screenshot({ path: test.info().outputPath("linked-position.png") });
  const beforeMissing = await page.evaluate(`${api}.getState().scrollTop`);
  await page.evaluate(`${api}.setHighlight(['r099999', 'missing'])`);
  expect(await page.evaluate(`${api}.getState().scrollTop`)).toBe(beforeMissing);
  expect(await page.evaluate(`${api}.getHighlight()`)).toEqual(["r099999", "missing"]);
});

test("an inline definition with a configured host source does not fetch unseen highlight rows", async ({ page }) => {
  const view = largeView(false);
  await serveGrid(page, { view, script: `window.requests=[]; CanopyX.configure('linked-position',{source:{query(query){
    requests.push({offset:query.offset,limit:query.limit});
    const items=Array.from({length:Math.min(query.limit,50000-query.offset)},(_,index)=>{
      const rank=99998-2*(query.offset+index);return {id:'r'+String(rank).padStart(6,'0'),cells:{name:'Record '+rank,rank,group:'Included'}};});
    return {protocol:'canopyx/2',type:'gridPage',view:'linked-position',revision:'host',offset:query.offset,total:100000,matched:50000,items};
  }}});` });
  const before = await page.evaluate(() => window.requests.slice());
  expect(await page.evaluate(`${api}.setHighlight(['r000000'])`)).toBe(1);
  expect(await page.evaluate(() => window.requests)).toEqual(before);
  expect(await page.evaluate(`${api}.getState().scrollTop`)).toBe(0);
  expect(await page.evaluate(`${api}.getHighlight()`)).toEqual(["r000000"]);
});

test("an enhanced local grid finds highlight positions across its complete accepted result", async ({ page }) => {
  await servePage(page, '<div id="records"></div>');
  await page.evaluate(() => CanopyX.grid("#records", { id: "enhanced-position", paging: false, height: "520px", rowId: "id",
    columns: [{ data: "name", title: "Name", type: "text" }, { data: "rank", title: "Rank", type: "number" }],
    order: [[1, "desc"]], data: Array.from({ length: 100000 }, (_, index) => ({ id: "r" + String(index).padStart(6, "0"), name: "Record " + index, rank: index }))
  }).then(controller => { window.grid = controller; }));
  await ready(page);
  expect(await page.evaluate(() => grid.setHighlight(["r000000"]))).toBe(1);
  await expect(row(page, "r000000")).toHaveAttribute("data-cx-linked", "true");
  await expect(row(page, "r000000")).toHaveAttribute("aria-rowindex", "100001");
  expect(await page.evaluate(() => grid.getState().scrollTop)).toBeGreaterThan(10000);
});

for (const action of ["highlight", "query", "destroy", "navigation", "scroll"])
  test(`a compact highlight lookup yields to later ${action} ownership`, async ({ page }) => {
    const view = largeView(false);
    delete view.rows;
    view.query = {};
    view.rowData = { version: 1, count: 20000, columns: ["name", "rank", "group"], ordered: true, base: "data/", chunks: 2 };
    let release, requested = false;
    const held = new Promise(resolve => { release = resolve; });
    const routes = Object.fromEntries([0, 1].map(index => [`/data/rows/${index}.js`, async route => {
      if (index) { requested = true; await held; }
      const rows = Array.from({ length: 10000 }, (_, offset) => {
        const rank = index * 10000 + offset;
        return [id(rank), "Record " + rank, rank, "Included"];
      });
      return route.fulfill({ contentType: "text/javascript", body:
        `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(["linked-position","rows/${index}",${JSON.stringify(rows)}]);` });
    }]));
    const mounted = serveGrid(page, { view, routes, waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector('[data-cx-ready="true"]');
      await mounted;
      await expect.poll(() => requested).toBe(true);
      // Preload the optional link part before the deliberately deferred lookup starts.
      await page.evaluate(`${api}.setHighlight(['r000000'], { scroll: false })`);
      await page.evaluate(`${api}.clearHighlight()`);
      await page.evaluate(`window.pendingHighlight=${api}.setHighlight(['r019999']); void 0`);
      await nextFrames(page);
      let expectedTop = 0;
      if (action === "highlight") await page.evaluate(`${api}.setHighlight(['r000002'])`);
      if (action === "query") await page.evaluate(`window.pendingQuery=${api}.setQuery({search:'Record 1'}); void 0`);
      if (action === "destroy") await page.evaluate(`${api}.destroy()`);
      if (action === "navigation") {
        await page.evaluate(`${api}.scrollToRow(200)`);
        expectedTop = await page.evaluate(`${api}.getState().scrollTop`);
      }
      if (action === "scroll") {
        await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = 1000; grid.dispatchEvent(new Event("scroll")); });
        expectedTop = await page.evaluate(`${api}.getState().scrollTop`);
      }
      release();
      await mounted;
      await page.evaluate(() => window.pendingHighlight);
      if (action === "query") {
        await page.evaluate(() => window.pendingQuery);
        expect(await page.evaluate(`${api}.getQuery().search`)).toBe("Record 1");
      }
      if (action === "destroy") await expect(page.locator(".cx-grid")).toHaveCount(0);
      else {
        expect(await page.evaluate(`${api}.getState().scrollTop`)).toBe(expectedTop);
        if (action === "highlight") expect(await page.evaluate(`${api}.getHighlight()`)).toEqual(["r000002"]);
      }
    } finally { release(); await mounted.catch(() => {}); }
  });
