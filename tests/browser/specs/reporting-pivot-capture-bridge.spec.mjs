// The optional producer is a boundary fake; metadata and routing run through the actual reporting source.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { repo } from "./support.mjs";

function bridge(producer = true) {
  const columns = Object.freeze([{ id: "axis", title: "Group", kind: "text" }, { id: "pivot-value", title: "Share", kind: "number" }]);
  const descriptor = Object.freeze({ definition: Object.freeze({ rows: ["region"] }), columnsLimited: false });
  const rows = [{ id: "prefix", outlineLevel: 0, summary: true, collapsed: true, hidden: false,
    cells: { axis: { value: "North", text: "North" }, "pivot-value": { value: 0.5, text: "50%", mode: "percentOfGrandTotal", numberFormat: "0.00%" } } }];
  const request = Object.freeze({ pivot: descriptor, columns, formatRules: Object.freeze([]), scope: "filtered",
    query: Object.freeze({ search: "accepted" }), revision: "accepted-1", recordCount: 1, matched: 7, values: "raw", timeZone: "utc" });
  const calls = { ordinary: 0, producer: 0, recordFormatting: 0 };
  class DataGrid {
    constructor() { this.lang = "en-US"; this.view = { id: "orders" }; this.columns = [{ id: "original", title: "Original", kind: "text" }]; }
    prepareExport(options) { calls.ordinary++; return { request: { scope: options.scope, columns: this.columns, recordCount: 1, timeZone: "utc" } }; }
    exportText() {}
    getFormatRules() { return [{ id: "original-rule", column: "original" }]; }
    async *exportRows(final, signal) {
      this.enumerated = final; this.signal = signal;
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (final.pivot && final.pivot !== descriptor) throw new Error("Lost frozen capture identity");
      yield* rows;
    }
  }
  const reporting = { captureExport() { calls.recordFormatting++; }, exportColumn(grid, column) {
    if (!column) throw new Error("Projected column looked up in original records"); return column;
  } };
  if (producer !== false) reporting.preparePivotExport = (grid, options) => {
    calls.producer++; reporting.producerOptions = options;
    return producer === "unavailable" ? null : { request, rows() { throw new Error("Use the request-bound grid iterator"); } };
  };
  const context = vm.createContext({ DataGrid, GRID_REPORTING: reporting, gridFreeze: Object.freeze,
    requireIdentifier() {}, gridExportSignal: (signal, options) => AbortSignal.any([signal, options?.signal].filter(Boolean)) });
  vm.runInContext(fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx.reporting.source/65-reporting-export-delivery.js"), "utf8"), context);
  return { grid: new DataGrid(), request, rows, calls, producerOptions: () => reporting.producerOptions };
}

test("explicit pivot capture retains projected columns, frozen identity and physical-row progress", async () => {
  const { grid, request, rows, calls, producerOptions } = bridge(), progress = [];
  const result = grid.prepareExport({ pivot: true, scope: "filtered", fileName: "Accepted table", locale: "de-de", onProgress: item => progress.push(item) });
  expect(producerOptions()).toMatchObject({ locale: "de-DE", timeZone: "utc" });
  expect(result.request.pivot).toBe(request.pivot);
  expect(result.request.columns).toBe(request.columns);
  expect(result.request).toMatchObject({ fileName: "Accepted table", locale: "de-DE", revision: "accepted-1", recordCount: 1, matched: 7, formatRules: [] });
  expect(Object.isFrozen(result.request)).toBe(true);
  const actual = []; for await (const row of result.rows()) actual.push(row);
  expect(actual).toEqual(rows); expect(grid.enumerated).toBe(result.request);
  expect(progress.map(item => [item.phase, item.completed, item.total])).toEqual([["reading", 0, 1], ["generating", 1, 1]]);
  expect(calls).toEqual({ ordinary: 0, producer: 1, recordFormatting: 0 });
});

test("ordinary captures retain their column and formatting path without invoking the pivot producer", () => {
  const { grid, calls } = bridge();
  for (const pivot of [undefined, false]) {
    const result = grid.prepareExport({ scope: "filtered", ...(pivot === undefined ? {} : { pivot }) });
    expect(result.request.columns[0].id).toBe("original");
    expect(result.request.formatRules[0].id).toBe("original-rule");
  }
  expect(calls).toEqual({ ordinary: 2, producer: 0, recordFormatting: 2 });
});

test("explicit pivot capture never falls back when its producer is missing or unavailable", () => {
  for (const producer of [false, "unavailable"]) {
    const { grid, calls } = bridge(producer);
    expect(() => grid.prepareExport({ pivot: true, scope: "filtered" })).toThrow(/pivot.*capture/i);
    expect(calls.ordinary).toBe(0);
  }
});

test("pivot captures reuse metadata validation and forward enumeration cancellation", async () => {
  const { grid } = bridge();
  for (const [options, error] of [[{ fileName: "../table" }, /safe basename/], [{ timeZone: "elsewhere" }, /time zone/], [{ onProgress: true }, /callback/]])
    expect(() => grid.prepareExport({ pivot: true, scope: "filtered", ...options })).toThrow(error);
  const controller = new AbortController(), result = grid.prepareExport({ pivot: true, scope: "filtered" });
  controller.abort();
  const error = await result.rows({ signal: controller.signal }).next().then(() => null, error => error.name);
  expect(error).toBe("AbortError");
  expect(grid.signal.aborted).toBe(true);
});

test("pivot producer receives validated presentation settings before formatting its table", () => {
  const { grid, calls, producerOptions } = bridge();
  for (const options of [{ locale: "!invalid" }, { timeZone: "elsewhere" }])
    expect(() => grid.prepareExport({ pivot: true, scope: "filtered", ...options })).toThrow();
  expect(calls.producer).toBe(0);
  grid.local = true;
  grid.prepareExport({ pivot: true, scope: "filtered" });
  expect(producerOptions()).toMatchObject({ locale: "en-US", timeZone: "local" });
  grid.prepareExport({ pivot: true, scope: "filtered", timeZone: "utc" });
  expect(producerOptions().timeZone).toBe("utc");
});
