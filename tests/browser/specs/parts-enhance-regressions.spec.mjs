// Regressions at the public enhancement, compact-data and lazy-mount boundaries. Requests use the existing routed host.
import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { ORIGIN, ready, servePage } from "./enhance-support.mjs";
import { nextFrames, viewPage } from "./support.mjs";

test("canonical server pages expose their records through the enhanced controller", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  await page.route(ORIGIN + "/api/people", route => {
    const query = JSON.parse(route.request().postData());
    return route.fulfill({ json: { protocol: "canopyx/2", type: "gridPage", view: "people", revision: "r1", offset: query.offset,
      total: 1, matched: 1, items: [{ id: "ada", cells: { name: "Ada" } }] } });
  });
  await page.evaluate(async () => { window.grid = await CanopyX.grid("#people", { url: { url: "/api/people", serverSide: true },
    columns: [{ data: "name", type: "text" }] }); });
  await ready(page);
  expect(await page.evaluate(() => ({ rows: grid.getRows(), row: grid.getRow("ada") }))).toEqual({
    rows: [{ id: "ada", cells: { name: "Ada" } }], row: { id: "ada", cells: { name: "Ada" } } });
});

test("plain server records with id and cells fields still follow configured column mappings", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  await page.route(ORIGIN + "/api/people", route => route.fulfill({ json: { total: 1, matched: 1,
    items: [{ id: "ada", name: "Ada", cells: { count: 7 } }] } }));
  await page.evaluate(async () => { window.grid = await CanopyX.grid("#people", { rowId: "id", url: { url: "/api/people", serverSide: true },
    columns: [{ data: "name", type: "text" }, { data: "cells.count", type: "number" }] }); });
  await ready(page);
  await expect(page.locator(".cx-row[data-cx-id='ada']")).toContainText("Ada");
  await expect(page.locator(".cx-row[data-cx-id='ada']")).toContainText("7");
  expect(await page.evaluate(() => grid.getRow("ada"))).toEqual({ id: "ada", name: "Ada", cells: { count: 7 } });
});

test("facet requests include source routing data computed from the accepted query", async ({ page }) => {
  await servePage(page, "<div id='people'></div>", { runtime: "reporting" });
  const requests = [];
  await page.route(ORIGIN + "/api/**", route => {
    const body = JSON.parse(route.request().postData()); requests.push(body);
    const answer = body.type === "gridFacetQuery" ? { protocol: "canopyx/2", type: "gridFacetPage", view: "people", revision: "r1", column: "name",
      search: body.search, includeCurrentFilter: body.includeCurrentFilter, matched: 1, totalValues: 1, truncated: false, items: [{ value: "Ada", count: 1 }] } :
      { protocol: "canopyx/2", type: "gridPage", view: "people", revision: "r1", offset: body.offset, total: 1, matched: 1, items: [{ id: "ada", cells: { name: "Ada" } }] };
    return route.fulfill({ json: answer });
  });
  await page.evaluate(async () => { window.grid = await CanopyX.grid("#people", { searchText: "Ada", url: { url: "/api/query", serverSide: true,
    facetUrl: "/api/facet", data: query => ({ tenant: "north", acceptedSearch: query.search }) },
    columns: [{ data: "name", type: "text" }], view: { reporting: { facetColumns: ["name"] } } }); });
  await ready(page);
  expect(await page.evaluate(() => grid.getFacets("name"))).toMatchObject({ items: [{ value: "Ada", count: 1 }] });
  expect(requests.map(request => [request.type, request.tenant, request.acceptedSearch])).toEqual([
    ["gridQuery", "north", "Ada"], ["gridFacetQuery", "north", "Ada"]]);
});

test("invalid enhancement event handlers restore the original table and allow a retry", async ({ page }) => {
  const table = "<table id='original'><caption>People</caption><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>";
  await servePage(page, table);
  const result = await page.evaluate(async () => {
    const element = document.querySelector("#original"), before = element.outerHTML, errors = [], restored = [];
    for (const on of [null, 1, { draw: "invalid" }]) {
      errors.push(await CanopyX.enhance(element, { on }).then(() => "accepted", error => error.message));
      restored.push(element.isConnected && element.outerHTML === before && !document.querySelector(".cx-enhanced-caption"));
    }
    window.grid = await CanopyX.enhance(element);
    return { errors, restored };
  });
  expect(result.errors).toEqual(["CanopyX: on is an object of handlers by event name.", "CanopyX: on is an object of handlers by event name.",
    "CanopyX: on takes an event name and a function."]);
  expect(result.restored).toEqual([true, true, true]);
  await ready(page);
  await expect(page.locator(".cx-row[data-cx-id]")).toContainText("Ada");
});

test("element canopyx exposes enhanced methods and destroy restores the table", async ({ page }) => {
  await servePage(page, "<table id='original'><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>");
  expect(await page.evaluate(async () => {
    const table = document.querySelector("#original"), before = table.outerHTML;
    const controller = await CanopyX.enhance(table); await controller.ready;
    const host = document.querySelector("[data-canopyx-mounted]"), exposed = host.canopyx;
    const rows = exposed.getRows?.(); exposed.destroy();
    const restored = table.isConnected && table.outerHTML === before;
    const replacement = await CanopyX.enhance(table); await replacement.ready; replacement.destroy();
    return { same: exposed === controller, rows, restored, recreated: replacement !== controller };
  })).toEqual({ same: true, rows: [["Ada"]], restored: true, recreated: true });
});

test("zero row spans carry body values only to the end of their row group", async ({ page }) => {
  await servePage(page, "<table id='spans'><thead><tr><th>Group</th><th>Name</th></tr></thead>" +
    "<tbody><tr><td rowspan='0'>A</td><td>one</td></tr><tr><td>two</td></tr></tbody>" +
    "<tbody><tr><td>B</td><td>three</td></tr></tbody></table>");
  await page.evaluate(async () => { window.grid = await CanopyX.enhance("#spans"); });
  await ready(page);
  expect(await page.evaluate(() => grid.getRows())).toEqual([["A", "one"], ["A", "two"], ["B", "three"]]);
  expect(await page.evaluate(() => grid.view.rows.map(row => Object.values(row.cells).map(cell => typeof cell === "object" ? cell.value : cell))))
    .toEqual([["A", "one"], ["A", "two"], ["B", "three"]]);
});

test("shared URL state restores All rows and keeps later additions on that page", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  const result = await page.evaluate(async () => {
    const create = () => CanopyX.grid("#people", { data: [{ name: "Ada" }, { name: "Grace" }, { name: "Alan" }], pageLength: 2, stateSave: { url: "query" } });
    let grid = await create(); await grid.ready;
    // State persistence is debounced; the public state event follows the stored URL update.
    const saved = new Promise(resolve => {
      const persisted = ({ state }) => { if (state.paging?.allRows) { grid.off("state", persisted); resolve(); } };
      grid.on("state", persisted);
    });
    await grid.setPageLength("all"); await saved;
    const shared = JSON.parse(new URL(location.href).searchParams.get("people"));
    grid.destroy(); sessionStorage.clear(); grid = await create(); await grid.ready;
    const restored = grid.getState().paging;
    await grid.addRows([{ name: "Katherine" }]);
    return { shared, restored, length: grid.getPaging().pageLength, pages: grid.getPaging().pageCount };
  });
  expect(result.shared).toMatchObject({ a: true });
  expect(result.restored).toMatchObject({ allRows: true });
  expect(result).toMatchObject({ length: 4, pages: 1 });
});

test("automatic type renderers run once per record and their inferred values are reused", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  expect(await page.evaluate(async () => {
    const calls = [];
    const grid = await CanopyX.grid("#people", { data: [{ size: 1 }, { size: 2 }], columns: [{ data: "size", type: "auto",
      render(value, purpose, record, meta) { if (purpose === "type") { calls.push(meta.row); return calls.length; } return value; } }] });
    await grid.ready;
    return { calls, kind: grid.view.columns[0].kind, values: grid.view.rows.map(row => row.cells.size.value) };
  })).toEqual({ calls: [0, 1], kind: "number", values: [1, 2] });
});

test("impossible ISO calendar dates stay text while a real leap day infers datetime", async ({ page }) => {
  await servePage(page, "<div id='dates'></div>");
  expect(await page.evaluate(async () => {
    const grid = await CanopyX.grid("#dates", { data: [{ impossible: "2026-02-31", nonLeap: "2026-02-29", leap: "2024-02-29T12:30:00+02:00" }],
      columns: [{ data: "impossible" }, { data: "nonLeap" }, { data: "leap" }] });
    await grid.ready; return grid.view.columns.map(column => column.kind);
  })).toEqual(["text", "text", "datetime"]);
});

const compactView = rowData => ({ protocol: "canopyx/2", type: "grid", id: "compact", label: "Compact", pageSize: 50,
  selection: "none", search: false, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "size", title: "Size", kind: "number" }],
  source: { kind: "inline" }, ...(rowData === undefined ? {} : { rowData: { version: 1, ...rowData } }) });

test("compact descriptors keep encoding version one and reject missing or unknown versions", async ({ page }) => {
  await servePage(page, "<div id='compact'></div>");
  const results = await page.evaluate(async view => {
    const errors = [];
    for (const version of [undefined, 2]) {
      const api = CanopyX.createDataGrid(document.querySelector("#compact"), { view: { ...view, rowData: { ...view.rowData, version } } });
      errors.push(await api.ready.then(() => "accepted", error => error.message)); api.destroy();
    }
    return errors;
  }, compactView({ columns: ["name", "size"], count: 1, chunks: [[["ada", "Ada", 7]]] }));
  expect(results).toEqual(["CanopyX: invalid grid rowData.", "CanopyX: invalid grid rowData."]);
});

test("compact host chunks preserve invalid numeric values until validation rejects them", async ({ page }) => {
  await servePage(page, "<div id='compact'></div>");
  const results = await page.evaluate(async view => {
    const errors = [];
    for (const value of [NaN, Infinity, undefined]) {
      const api = CanopyX.createDataGrid(document.querySelector("#compact"), { view: { ...view,
        rowData: { version: 1, columns: ["name", "size"], count: 1, chunks: [[["bad", "Bad", value]]] } } });
      errors.push(await api.ready.then(() => "accepted", error => error.message)); api.destroy();
    }
    return errors;
  }, compactView({}));
  expect(results).toEqual(["CanopyX: numeric grid cells need finite values within the safe integer magnitude.",
    "CanopyX: numeric grid cells need finite values within the safe integer magnitude.", "CanopyX: compact grid cells cannot be undefined; use null for an empty cell."]);
});

for (const encoding of ["json", "gzip"]) {
  test("decoded embedded row scripts release their encoded text after success (" + encoding + ")", async ({ page }) => {
    const rows = JSON.stringify([["ada", "Ada", 7]]), text = encoding === "gzip" ? gzipSync(rows).toString("base64") : rows;
    const view = compactView({ columns: ["name", "size"], count: 1, chunks: 1, ...(encoding === "gzip" ? { encoding } : {}) });
    const html = viewPage(view).replace("</script></div>", '</script><script type="application/x-canopyx-rows">' + text + "</script></div>");
    await page.route(ORIGIN + "/embedded", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto(ORIGIN + "/embedded");
    await page.waitForSelector(".cx-row[data-cx-id]");
    expect(await page.evaluate(async () => {
      const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready;
      return { rows: api.view.rows, text: document.querySelector('script[type="application/x-canopyx-rows"]').textContent };
    })).toEqual({ rows: [{ id: "ada", cells: { name: "Ada", size: 7 } }], text: "" });
  });
}

test("destroying a grid during a sidecar read prevents decoding the returned chunk", async ({ page }) => {
  await servePage(page, "<div id='compact'></div>");
  let requested = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(ORIGIN + "/data/rows/0.js", async route => {
    requested = true; await gate;
    await route.fulfill({ contentType: "text/javascript", body: '(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(["compact","rows/0",[["ada","Ada",7]]]);window.sidecarReturned=true;' });
  });
  await page.evaluate(view => {
    window.api = CanopyX.createDataGrid(document.querySelector("#compact"), { view }); api.ready.catch(() => {});
  }, compactView({ columns: ["name", "size"], count: 1, chunks: 1, base: "/data/" }));
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => api.destroy()); release();
  await page.waitForFunction(() => window.sidecarReturned);
  await nextFrames(page);
  expect(await page.evaluate(() => api.view.rows)).toEqual([]);
});

for (const width of [390, 1400]) {
  test("lazy mounting waits until half a viewport height beyond the fold (width " + width + ")", async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const view = { ...compactView(undefined), rows: [{ id: "ada", cells: { name: "Ada", size: 7 } }] };
    const html = viewPage(view).replace('<div class="cx-host" data-canopyx-host', '<div class="cx-host" data-cx-mount="visible" data-canopyx-host')
      .replace("<body", '<body style="margin:0"').replace('<div class="cx-host"', '<div style="height:1250px"></div><div class="cx-host"');
    await page.route(ORIGIN + "/visible", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto(ORIGIN + "/visible");
    await nextFrames(page);
    expect(await page.locator("[data-canopyx-mounted]").count()).toBe(0);
    await page.evaluate(() => scrollTo(0, 100));
    await page.waitForSelector(".cx-row[data-cx-id]");
    await expect(page.locator(".cx-row[data-cx-id='ada']")).toContainText("Ada");
  });
}
