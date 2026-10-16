// A save refreshes local values without replacing the query or page length the reader chose while it was saving.
import { expect, test } from "@playwright/test";
import { ORIGIN, ready, rowIds, servePage } from "./enhance-support.mjs";

const columns = [{ id: "name", title: "Name", kind: "text", sortable: true },
  { id: "amount", title: "Amount", kind: "number", sortable: true, editable: true }];

async function holdSave(page) {
  await page.evaluate(async () => { await grid.setCellValue("a", "amount", 100); window.saving = grid.commitChanges(); });
  await page.waitForFunction(() => grid.getChanges()[0]?.status === "saving");
}

for (const kind of ["records", "table"]) {
  test("a saved local " + kind + " edit keeps a search typed before its debounce expires", async ({ page }) => {
    await servePage(page, kind === "records" ? "<div id='local'></div>" : "<table id='local'><thead><tr><th>Name</th><th>Amount</th></tr></thead>" +
      "<tbody><tr id='a'><td>Printer</td><td>10</td></tr><tr id='b'><td>Scanner</td><td>20</td></tr></tbody></table>");
    await page.evaluate(async ({ kind, columns }) => {
      let release;
      const hold = new Promise(resolve => { release = resolve; }); window.releaseSave = release;
      const options = { pageLength: 2, searchDelayMs: 150, markup: false, view: { columns }, editing: {
        commit: async batch => { await hold; return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view,
          rows: batch.rows.map(row => ({ id: row.id, status: "saved" })) }; } } };
      window.grid = kind === "records" ? await CanopyX.grid("#local", { ...options, rowId: "id",
        columns: [{ data: "name", type: "text" }, { data: "amount", type: "number" }],
        data: [{ id: "a", name: "Printer", amount: 10 }, { id: "b", name: "Scanner", amount: 20 }] }) :
        await CanopyX.enhance("#local", { ...options, columns: [{ id: "name", data: 0, type: "text" }, { id: "amount", data: 1, type: "number" }] });
    }, { kind, columns });
    await ready(page);
    await holdSave(page);
    // Release the host acknowledgement in the same input event turn, before any engine can expire the 150 ms timer.
    await page.evaluate(() => document.querySelector(".cx-search-input").addEventListener("input", () => releaseSave(), { once: true }));
    await page.locator(".cx-search-input").fill("Scanner");
    expect(await page.evaluate(() => saving)).toMatchObject({ ok: true, saved: 1 });
    await expect(page.locator(".cx-search-input")).toHaveValue("Scanner");
    await expect.poll(() => page.evaluate(() => grid.getQuery().search)).toBe("Scanner");
    await expect.poll(() => rowIds(page)).toEqual(["b"]);
    expect(await page.evaluate(() => grid.getPaging().matched)).toBe(1);
  });
}

async function compact(page) {
  await servePage(page, "<div id='local' style='height:440px'></div>");
  let release, requested = false;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(ORIGIN + "/data/rows/*.js", async route => {
    const index = Number(/rows\/(\d)\.js$/.exec(new URL(route.request().url()).pathname)[1]);
    if (index === 1) { requested = true; await held; }
    const rows = index === 0 ? [["a", "Printer", 10], ["b", "Scanner", 20]] : [["c", "Printer C", 30], ["d", "Scanner D", 40]];
    return route.fulfill({ contentType: "text/javascript", body: '(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(["local","rows/' + index + '",' + JSON.stringify(rows) + ']);' });
  });
  await page.evaluate(async columns => {
    let release;
    const hold = new Promise(resolve => { release = resolve; }); window.releaseSave = release;
    window.grid = CanopyX.createDataGrid(document.querySelector("#local"), { searchDelayMs: 0, editing: {
      commit: async batch => { await hold; return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view,
        rows: batch.rows.map(row => ({ id: row.id, status: "saved" })) }; } },
      view: { protocol: "canopyx/2", type: "grid", id: "local", label: "Compact editable rows", selection: "none", search: true,
        source: { kind: "inline" }, presentation: "paged", pageLength: 2, pager: { lengths: [2, 4] }, pageSize: 2, columns,
        rowData: { version: 1, columns: ["name", "amount"], count: 4, ordered: true, chunks: 2, base: "/data/" } } });
    await grid.ready;
  }, columns);
  await expect.poll(() => requested).toBe(true);
  expect(await page.evaluate(() => grid.view.rows.length)).toBe(2);
  return release;
}

for (const change of ["search", "filters-sort", "page-length"]) {
  test("a saved compact edit keeps a newer pending " + change + " query while remaining chunks decode", async ({ page }) => {
    const release = await compact(page);
    try {
      await holdSave(page);
      if (change === "search") await page.locator(".cx-search-input").fill("Scanner");
      else {
        await page.evaluate(() => { window.querying = grid.setQuery({ ...grid.getQuery(), revision: undefined,
          filters: [{ column: "amount", operator: "ge", values: [20] }], sort: [{ column: "amount", direction: "desc" }] }).catch(error => error.name); });
        if (change === "page-length") await page.evaluate(() => { window.paging = grid.setPageLength(4).catch(error => error.name); });
      }
      await expect(page.getByRole("grid")).toHaveAttribute("aria-busy", "true");
      await page.evaluate(() => releaseSave());
      await page.waitForFunction(() => !grid.hasChanges());
      // A fresh result still needs the held chunk. A save must not replace the decoder with its partial prefix.
      await expect(page.getByRole("grid")).toHaveAttribute("aria-busy", "true");
      if (change === "search") await expect(page.locator(".cx-search-input")).toHaveValue("Scanner");
      release();
      expect(await page.evaluate(() => saving)).toMatchObject({ ok: true, saved: 1 });
      expect(await page.evaluate(() => grid.view.rows.length)).toBe(4);
      if (change === "search") {
        expect(await page.evaluate(() => grid.getQuery().search)).toBe("Scanner");
        await expect.poll(() => rowIds(page)).toEqual(["b", "d"]);
        expect(await page.evaluate(() => grid.getPaging().matched)).toBe(2);
      } else {
        expect(await page.evaluate(() => ({ sort: grid.getQuery().sort, filters: grid.getQuery().filters }))).toEqual({
          sort: [{ column: "amount", direction: "desc" }], filters: [{ column: "amount", operator: "ge", values: [20] }] });
        await expect.poll(() => rowIds(page)).toEqual(change === "page-length" ? ["a", "d", "c", "b"] : ["a", "d"]);
        expect(await page.evaluate(() => grid.getPaging().pageLength)).toBe(change === "page-length" ? 4 : 2);
      }
      // The completed compact owner must also forget its old sorted result when another saved value changes it.
      await page.evaluate(async () => { await grid.setCellValue("b", "amount", 200); await grid.commitChanges(); });
      if (change !== "search") await expect.poll(() => rowIds(page)).toEqual(change === "page-length" ? ["b", "a", "d", "c"] : ["b", "a"]);
    } finally { release(); }
  });
}

test("a host-owned inline source keeps its newer request and receives no automatic save refresh", async ({ page }) => {
  await servePage(page, "<div id='local' style='height:440px'></div>");
  await page.evaluate(async columns => {
    let save, query;
    const saveHold = new Promise(resolve => { save = resolve; }), queryHold = new Promise(resolve => { query = resolve; });
    window.releaseSave = save; window.releaseQuery = query; window.requested = [];
    const rows = [{ id: "a", cells: { name: "Printer", amount: 10 } }, { id: "b", cells: { name: "Scanner", amount: 20 } }];
    window.grid = CanopyX.createDataGrid(document.querySelector("#local"), { searchDelayMs: 0,
      view: { protocol: "canopyx/2", type: "grid", id: "local", label: "Host-owned inline", selection: "none", search: true,
        source: { kind: "inline" }, rows: [], pageSize: 2, columns },
      source: { async query(request) { requested.push(request.search); if (request.search) await queryHold;
        const items = rows.filter(row => !request.search || row.cells.name.includes(request.search));
        return { protocol: "canopyx/2", type: "gridPage", view: "local", revision: "r1", offset: request.offset,
          total: rows.length, matched: items.length, items }; } },
      editing: { async commit(batch) { await saveHold; return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view,
        rows: batch.rows.map(row => ({ id: row.id, status: "saved" })) }; } } });
    await grid.ready;
  }, columns);
  await holdSave(page);
  await page.locator(".cx-search-input").fill("Scanner");
  await page.evaluate(() => releaseSave());
  expect(await page.evaluate(() => saving)).toMatchObject({ ok: true, saved: 1 });
  expect(await page.evaluate(() => requested)).toEqual(["", "Scanner"]);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => releaseQuery());
  await expect.poll(() => rowIds(page)).toEqual(["b"]);
  await expect(page.locator(".cx-search-input")).toHaveValue("Scanner");
});
