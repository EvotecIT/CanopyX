import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repo } from "./support.mjs";
import { definition, api } from "./grid-grouping-fixtures.mjs";

// Explicit source qualification can assemble this branch with the export owner's pinned sources outside either checkout.
const sourceRoot = process.env.CANOPYX_TEST_SOURCE_ROOT || repo;
const { viewPage, nextFrames } = await import(pathToFileURL(path.join(sourceRoot, "tests/browser/specs/support.mjs")));
const assets = path.join(sourceRoot, "CanopyX.Html/Assets");
async function open(page, reporting = true, calculations = false) {
  const view = definition(); delete view.reporting.detail; view.reporting.groupBy = [];
  view.reporting.pivotable = true;
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }, { column: "status", direction: "asc" }],
    columns: [{ column: "items", direction: "asc" }, { column: "status", direction: "asc" }], values: ["total", "orders"], maxColumns: 3 };
  if (calculations) view.calculatedColumnsEditable = true;
  if (!reporting) delete view.reporting;
  const scripts = ["buckets", "values", "pivot", "calculations"].map(name => fs.readFileSync(path.join(assets, "canopyx-" + name + ".js"), "utf8")).join("\n");
  const setup = ";CanopyX.configure('orders',{onPrint:async event=>{window.printed=event.snapshot},onExport:async event=>{const rows=[];for await(const row of event.capture.rows())rows.push(row);window.hosted={request:event.request,rows}}});";
  await page.route("http://127.0.0.1/pivot-capture", route => route.fulfill({ contentType: "text/html", body:
    viewPage(view).replace("</head>", () => "<script>" + scripts + setup + "</script></head>") }));
  await page.goto("http://127.0.0.1/pivot-capture"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
  return view;
}

test("explicit pivot capture reaches bounded materialization, print hooks and host delivery with physical row counts", async ({ page }) => {
  const view = await open(page), errors = []; page.on("pageerror", error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, accepted = grid.getPivotResult();
    await grid.setPivotCollapsed("rows", accepted.rows.find(node => node.path.length === 1).key, true);
    await grid.setPivotCollapsed("columns", accepted.columns.find(node => node.path.length === 1).key, true);
    await grid.setAggregateShowAs("total", "percentGrandTotal");
    const expected = await grid.getPivotExport(), progress = [];
    const capture = await grid.materializeExport({ scope: "filtered", pivot: true, maxRows: 20, fileName: "Pivot table", onProgress: step => progress.push(step) });
    await grid.print({ scope: "filtered", pivot: true, maxRows: 20 });
    await grid.exportToHost("table", { scope: "filtered", pivot: true });
    return { accepted, expected, capture, progress, printed: window.printed, hosted: window.hosted };
  });
  const { capture, expected } = result;
  expect(capture.request.recordCount).toBe(expected.rows.length); expect(capture.request.recordCount).toBeLessThan(view.rows.length);
  expect(capture.request.matched).toBe(view.rows.length); expect(capture.request.query).toEqual(result.accepted.query);
  expect(capture.rows).toEqual(expected.rows); expect(capture.request.columns).toMatchObject(expected.columns);
  for (const column of capture.request.columns) {
    expect(column.width.unit).toBe("css-px"); expect(column.width.preferred).toBeGreaterThan(0);
    expect(column.width.minimum).toBeGreaterThanOrEqual(0); expect(column.width.minimum).toBeLessThanOrEqual(column.width.preferred);
    expect(column.wrap).toBe(column.kind !== "number"); expect(column.alignment).toBe(column.kind === "number" ? "right" : "left");
  }
  expect(capture.request.pivot).toMatchObject({ definition: expected.definition, rowAxis: expected.rowAxis, columnAxis: expected.columnAxis,
    columnGroups: expected.columnGroups, distinctColumns: expected.distinctColumns, retainedColumns: expected.retainedColumns, columnsLimited: true });
  expect(capture.request.pivot.rows).toBeUndefined(); expect(capture.request.grouping).toBeUndefined(); expect(capture.request.formatRules).toEqual([]);
  expect(result.printed.rows).toEqual(expected.rows); expect(result.hosted.rows).toEqual(expected.rows);
  expect(result.progress.at(-1)).toEqual({ phase: "ready", completed: expected.rows.length, total: expected.rows.length });
  expect(errors).toEqual([]);
});

test("pivot captures retain the complete frozen table across presentation changes and enforce bounds and cancellation", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const captured = grid.prepareExport({ scope: "filtered", pivot: true, locale: "de-de", timeZone: "utc" });
    await grid.setPivot(false);
    const first = [], second = [];
    for await (const row of captured.rows()) first.push(row);
    for await (const row of captured.rows()) second.push(row);
    const controller = new AbortController(), iterator = captured.rows({ signal: controller.signal });
    await iterator.next(); controller.abort();
    const cancellation = await iterator.next().then(() => "continued", error => error.name);
    return { request: captured.request, first, second, cancellation, frozen: Object.isFrozen(captured.request.pivot) && Object.isFrozen(first[0].cells) };
  });
  expect(result.first).toEqual(result.second); expect(result.first).toHaveLength(result.request.recordCount);
  expect(result.request.locale).toBe("de-DE"); expect(result.request.timeZone).toBe("utc"); expect(result.cancellation).toBe("AbortError"); expect(result.frozen).toBe(true);
  const total = result.request.columns.find(column => column.grandTotal && column.aggregate === "total"), grand = result.first.find(row => row.grandTotal);
  expect(grand.cells[total.id].text).toBe(new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grand.cells[total.id].value));
  await page.evaluate(api + ".setPivot({rows:[{column:'region',direction:'asc'},{column:'status',direction:'asc'}],columns:[{column:'items',direction:'asc'}],values:['total']})");
  const bounded = await page.evaluate(api + ".materializeExport({scope:'filtered',pivot:true,maxRows:1}).then(()=>null,error=>error.message)");
  expect(bounded).toMatch(/row bound/);
});

test("record defaults stay explicit and unsupported pivot captures cannot silently export records", async ({ page }) => {
  const view = await open(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, rows = [], errors = [];
    const records = grid.prepareExport({ scope: "filtered" }); for await (const row of records.rows()) rows.push(row);
    for (const options of [{ pivot: "true" }, { pivot: true, scope: "all" }, { pivot: true, scope: "selected" }, { pivot: true, columns: ["region"] }, { pivot: true, values: "other" }]) {
      try { grid.prepareExport({ scope: "filtered", ...options }); errors.push("accepted"); } catch (error) { errors.push(error.message); }
    }
    await grid.setPivot(false);
    try { grid.prepareExport({ scope: "filtered", pivot: true }); errors.push("accepted"); } catch (error) { errors.push(error.message); }
    return { count: rows.length, request: records.request, errors };
  });
  expect(result.count).toBe(view.rows.length); expect(result.request.pivot).toBeUndefined(); expect(result.errors).toHaveLength(6);
  expect(result.errors.every(message => message !== "accepted")).toBe(true);
  await open(page, false);
  expect(await page.evaluate("(()=>{try{" + api + ".prepareExport({scope:'filtered',pivot:true});return 'accepted'}catch(error){return error.message}})()")).toMatch(/pivot.*bridge/i);
});

test("a later calculation revision stops a captured table iterator before another row is delivered", async ({ page }) => {
  await open(page, true, true);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, capture = grid.prepareExport({ scope: "filtered", pivot: true });
    const iterator = capture.rows(); await iterator.next();
    await grid.setCalculatedColumns([{ id: "tax", title: "Tax", kind: "number", expression: "[amount] * 0.2" }]);
    const error = await iterator.next().then(() => "continued", error => error.message);
    const fresh = await grid.materializeExport({ scope: "filtered", pivot: true, maxRows: 20 });
    return { error, before: capture.request.revision, after: fresh.request.revision, count: fresh.rows.length };
  });
  expect(result.error).toMatch(/revision|calculated/); expect(result.after).not.toBe(result.before); expect(result.count).toBe(17);
});

test("capture time-zone overrides change datetime labels while preserving typed axis identities", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Europe/Warsaw" });
  try {
    const page = await context.newPage(); await open(page);
    const result = await page.evaluate(async () => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx;
      await grid.setPivot({ rows: [{ column: "placed", direction: "asc" }], columns: [], values: ["total"] });
      const utc = await grid.materializeExport({ scope: "filtered", pivot: true, maxRows: 100, locale: "en-GB", timeZone: "utc" });
      const local = await grid.materializeExport({ scope: "filtered", pivot: true, maxRows: 100, locale: "en-GB", timeZone: "local" });
      return { utc, local };
    });
    expect(result.utc.rows[0].cells.axis.text).toMatch(/00:00/);
    expect(result.local.rows[0].cells.axis.text).toMatch(/01:00/);
    expect(result.local.request.pivot.rowAxis).toEqual(result.utc.request.pivot.rowAxis);
    expect(result.local.rows[0].axisKey).toBe(result.utc.rows[0].axisKey);
  } finally { await context.close(); }
});
