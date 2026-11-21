// Shared datasets (docs/datasets.md): several grids read one dataset's rows by reference. The rows are read, decoded and
// validated once; each view keeps its own query; a change goes through the dataset and every view follows at its place.
import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

const ORIGIN = "http://canopyx.test";
const COLUMNS = [{ id: "region", kind: "text" }, { id: "amount", kind: "number" }];
const ROWS = Array.from({ length: 6 }, (_, i) => ({ id: "o" + i, cells: { region: i % 2 ? "South" : "North", amount: i * 10 } }));
const grid = (id, source = { kind: "inline", dataset: "orders" }, columns = [{ id: "region", title: "Region", kind: "text", rowHeader: true, sortable: true },
  { id: "amount", title: "Amount", kind: "number", sortable: true }]) =>
  ({ protocol: "canopyx/2", type: "grid", id, label: id, rowHeight: 32, pageSize: 50, selection: "none", search: true, source, columns });
const json = value => JSON.stringify(value).replace(/</g, "\\u003c");

function html(dataset, views, { chunks = [], script = "" } = {}) {
  const { script: runtime, style } = runtimeAssets("reporting");
  const element = dataset ? `<div class="cx-dataset" data-cx-dataset="${dataset.id}" hidden><script type="application/json" class="cx-config">${json({ protocol: "canopyx/2", type: "dataset", ...dataset })}</script>` +
    chunks.map(text => `<script type="application/x-canopyx-rows">${text}</script>`).join("") + "</div>" : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Datasets</title><style>${style}</style><script>${runtime}</script></head><body>` +
    `<script>${script}</script>${element}` + views.map(view => `<div class="cx-host" data-canopyx-host id="${view.id}" data-cx-height="320px">` +
    `<script type="application/json" class="cx-config">${json(view)}</script></div>`).join("") + "</body></html>";
}
async function open(page, body) {
  page.errors = [];
  page.on("pageerror", error => page.errors.push(error.message));
  await page.route(ORIGIN + "/page", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto(ORIGIN + "/page");
}
const ids = (page, host) => page.locator(`#${host} .cx-row[data-cx-id]`).evaluateAll(rows => rows.map(row => row.dataset.cxId));
const api = host => `document.getElementById(${JSON.stringify(host)}).canopyx`;

test("two grids read one dataset, each with its own query, and the page sees the rows once", async ({ page }) => {
  await open(page, html({ id: "orders", columns: COLUMNS, rows: ROWS }, [grid("list"), grid("by-region")]));
  await expect.poll(() => ids(page, "list")).toEqual(["o0", "o1", "o2", "o3", "o4", "o5"]);
  await expect.poll(() => ids(page, "by-region")).toHaveLength(6);
  await page.evaluate(`${api("list")}.setQuery({ sort: [{ column: "amount", direction: "desc" }] })`);
  await page.evaluate(`${api("by-region")}.setQuery({ search: "south" })`);
  await expect.poll(() => ids(page, "list")).toEqual(["o5", "o4", "o3", "o2", "o1", "o0"]);
  await expect.poll(() => ids(page, "by-region")).toEqual(["o1", "o3", "o5"]);
  expect(await page.evaluate(() => [CanopyX.dataset("orders").getRows().length, CanopyX.dataset("orders").views().length])).toEqual([6, 2]);
  expect(await page.evaluate(`${api("list")}.getQuery().revision`)).toBe("dataset-1");
  expect(page.errors).toEqual([]);
});

test("compact chunks are decoded once for every view and their text is released", async ({ page }) => {
  const compact = ROWS.map(row => [row.id, row.cells.region, row.cells.amount]);
  await open(page, html({ id: "orders", columns: COLUMNS, rowData: { version: 1, columns: ["region", "amount"], count: 6, chunks: 2 } }, [grid("list"), grid("other")],
    { chunks: [JSON.stringify(compact.slice(0, 4)), JSON.stringify(compact.slice(4))] }));
  await expect.poll(() => ids(page, "list")).toHaveLength(6);
  await expect.poll(() => ids(page, "other")).toHaveLength(6);
  expect(await page.locator('.cx-dataset script[type="application/x-canopyx-rows"]').evaluateAll(scripts => scripts.map(script => script.textContent))).toEqual(["", ""]);
});

test("an address is read once for every view; refresh and setRows reach every view at its place", async ({ page }) => {
  let reads = 0, count = 6;
  await page.route(ORIGIN + "/data/orders.json", route => { reads++; return route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ rows: Array.from({ length: count }, (_, i) => ({ id: "o" + i, cells: { region: "North", amount: i } })) }) }); });
  const paged = { ...grid("paged"), presentation: "paged", pageLength: 2 };
  await open(page, html({ id: "orders", columns: COLUMNS, url: "data/orders.json" }, [grid("list"), paged]));
  await expect.poll(() => ids(page, "list")).toHaveLength(6);
  await expect.poll(() => ids(page, "paged")).toEqual(["o0", "o1"]);
  expect(reads).toBe(1);
  await page.evaluate(`${api("paged")}.setQuery({ ...${api("paged")}.getQuery(), offset: 2 })`);
  await expect.poll(() => ids(page, "paged")).toEqual(["o2", "o3"]);
  count = 8;
  await page.evaluate(() => CanopyX.dataset("orders").refresh());
  expect(reads).toBe(2);
  await expect.poll(() => ids(page, "list")).toHaveLength(8);
  await expect.poll(() => page.evaluate(`${api("paged")}.getQuery().offset`)).toBe(2);
  expect(await page.evaluate(`${api("list")}.getQuery().revision`)).toBe("dataset-2");
  await page.evaluate(() => CanopyX.dataset("orders").setRows([{ id: "x", cells: { region: "West", amount: 1 } }]));
  await expect.poll(() => ids(page, "list")).toEqual(["x"]);
  await expect.poll(() => ids(page, "paged")).toEqual(["x"]);
});

test("rows given while an address is read again are not replaced by that read's answer", async ({ page }) => {
  let hold = null;
  await page.route(ORIGIN + "/data/orders.json", async route => {
    if (hold) await hold;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ rows: ROWS }) });
  });
  await open(page, html({ id: "orders", columns: COLUMNS, url: "data/orders.json" }, [grid("list")]));
  await expect.poll(() => ids(page, "list")).toHaveLength(6);
  let release; hold = new Promise(resolve => release = resolve);
  await page.evaluate(() => { window.refreshed = CanopyX.dataset("orders").refresh(); });
  await page.evaluate(() => CanopyX.dataset("orders").setRows([{ id: "x", cells: { region: "West", amount: 1 } }]));
  release();
  await page.evaluate(() => window.refreshed);
  expect(await page.evaluate(() => CanopyX.dataset("orders").getRows().map(row => row.id))).toEqual(["x"]);
  await expect.poll(() => ids(page, "list")).toEqual(["x"]);
});

test("views never write into the shared rows, and a column the dataset types otherwise is refused", async ({ page }) => {
  const retyped = grid("retyped", undefined, [{ id: "amount", title: "Amount", kind: "text" }]);
  await open(page, html({ id: "orders", columns: COLUMNS, rows: ROWS }, [grid("list"), retyped]));
  await expect.poll(() => ids(page, "list")).toHaveLength(6);
  const refused = await page.evaluate(`${api("list")}.addRows([{ id: "new", cells: { region: "West", amount: 1 } }]).then(() => "added", error => error.message)`);
  expect(refused).toContain("shared dataset orders");
  // A per-view loader would replace the shared rows as well.
  const polled = await page.evaluate(`${api("list")}.poll({ intervalMs: 1000, load: async () => [] }).then(() => "polling", error => error.message)`);
  expect(polled).toContain("shared dataset orders");
  // A loader in the grid's own live options is refused when live updates start, and no poll runs it.
  const started = await page.evaluate(view => new Promise(resolve => {
    const host = Object.assign(document.createElement("div"), { style: "height:200px" }); document.body.append(host);
    const api = CanopyX.createDataGrid(host, { view, live: { pollMs: 250, load: async () => [] },
      onError: detail => resolve({ message: detail.error.message, polling: api.getLiveState().polling }) });
  }), grid("polled"));
  expect(started).toEqual({ message: expect.stringContaining("shared dataset orders"), polling: false });
  await expect(page.locator("#retyped")).toContainText("has another kind than in dataset orders");
  expect(await page.evaluate(() => CanopyX.dataset("orders").getRows().length)).toBe(6);
});

test("a hosted dataset's one source answers every view's own queries", async ({ page }) => {
  const script = `window.asked = []; CanopyX.defineDataset({ id: "machines", kind: "host", source: { query: async query => {
    window.asked.push(query.view);
    const items = ${JSON.stringify(ROWS)}.slice(query.offset, query.offset + query.limit);
    return { protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "r1", offset: query.offset, total: 6, matched: 6, items };
  } } });`;
  await open(page, html(null, [grid("a", { kind: "host", dataset: "machines" }), grid("b", { kind: "host", dataset: "machines" })], { script }));
  await expect.poll(() => ids(page, "a")).toHaveLength(6);
  await expect.poll(() => ids(page, "b")).toHaveLength(6);
  expect([...new Set(await page.evaluate(() => window.asked))].sort()).toEqual(["a", "b"]);
  expect(await page.evaluate(() => CanopyX.dataset("machines").ready().then(() => CanopyX.dataset("machines").views().length))).toBe(2);
});

test("a hosted grid destroyed before the part attaches it is not one of the dataset's views", async ({ page }) => {
  const script = `CanopyX.defineDataset({ id: "machines", kind: "host", source: { query: async query =>
    ({ protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "r1", offset: 0, total: 0, matched: 0, items: [] }) } });`;
  await open(page, html(null, [], { script }));
  const views = await page.evaluate(async view => {
    const host = Object.assign(document.createElement("div"), { style: "height:200px" }); document.body.append(host);
    CanopyX.createDataGrid(host, { view }).destroy();
    CanopyX.createDataGrid(host, { view });
    const dataset = CanopyX.dataset("machines");
    await dataset.ready();
    return dataset.views().length;
  }, grid("a", { kind: "host", dataset: "machines" }));
  expect(views).toBe(1);
});
