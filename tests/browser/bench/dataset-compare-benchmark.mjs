// Opt-in N4.1 browser measurement; not discovered by normal correctness CI.
// From tests/browser:
//   node bench/dataset-compare-benchmark.mjs --rows 100000 --runs 3 --cpu 1,4 --out bench-results/dataset-compare.json
// Both modes receive identical already-joined rows, including change endpoints. Ordinary omits view.compare
// and the beforeAfter presenter and applies the equivalent status predicate through setQuery. Compare uses
// the optional part and setOnlyChanges. This does not time the C# dataset join.
// Each pair alternates mode order; each sample uses fresh Chromium. Create -> ready includes lazy parts.
// Fixture construction and correctness probes are untimed. Heap samples are observed, without forced GC.
// docs/large-data.md and specs/large-data-performance.spec.mjs set an 8000 ms navigation -> first-row
// budget for 100k row objects at 4x. Our create -> paint interval excludes navigation/input construction,
// so that budget is reference context, not an equivalent measured gate. No new timing threshold is imposed.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assets = path.join(repo, "CanopyX.Html/Assets");
const args = process.argv.slice(2), options = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!["--rows", "--runs", "--cpu", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i]))
    throw new Error("Usage: node bench/dataset-compare-benchmark.mjs [--rows 100000] [--runs 3] [--cpu 1,4] [--out file.json]");
  options.set(args[i], args[i + 1]);
}
const rows = Number(options.get("--rows") || 100000), runs = Number(options.get("--runs") || 3);
const cpus = (options.get("--cpu") || "1,4").split(",").map(Number);
if (!Number.isSafeInteger(rows) || rows < 10 || rows > 1000000 || rows % 10 || !Number.isSafeInteger(runs) || runs < 1 || runs > 20 ||
    !cpus.length || new Set(cpus).size !== cpus.length || cpus.some(cpu => ![1, 4].includes(cpu)))
  throw new Error("Rows must be a multiple of 10 from 10 to 1000000; runs 1..20; CPU rates 1 and/or 4.");
const out = path.resolve(options.get("--out") || path.join(repo, "tests/browser/bench-results/dataset-compare.json"));
const origin = "https://dataset-compare-benchmark.test", viewport = { width: 1440, height: 900 };
// Freeze each served asset within this invocation so both modes consume the same bytes.
const assetText = new Map();
const read = name => {
  if (!assetText.has(name)) assetText.set(name, fs.readFileSync(path.join(assets, name), "utf8"));
  return assetText.get(name);
};
const framePair = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const median = values => values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

async function once(cpu, mode) {
  const hostBefore = os.cpus().map(core => core.times), startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  let context, cdp, page, version;
  const errors = [], requested = [];
  try {
    version = browser.version();
    context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(180000);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url()); requested.push(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<title>100k dataset comparison</title><style>' + read("canopyx-grid.css") + '</style><script src="/canopyx-grid.js"></script></head>' +
        '<body><div id="compare" style="height:650px"></div></body></html>' });
      const file = url.pathname.slice(1);
      if (path.basename(file) !== file || !/^canopyx-[a-z-]+\.(js|css|json)$/.test(file) || !fs.existsSync(path.join(assets, file)))
        return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: file.endsWith("css") ? "text/css" : file.endsWith("json") ? "application/json" : "text/javascript", body: read(file) });
    });
    await page.goto(origin + "/");
    // Build deterministic, already-compared data before either timing or CPU throttling.
    const fixture = await page.evaluate(async ({ count, mode }) => {
      window.compareView = { protocol: "canopyx/2", type: "grid", id: "compare-100k", label: "Compared inventory",
        source: { kind: "inline" }, rowHeight: 32, pageSize: 100, search: true, selection: "multiple",
        columns: [{ id: "change", title: "Change", kind: "text", width: 130 },
          { id: "name", title: "Item", kind: "text", rowHeader: true, width: 260, sortable: true },
          { id: "amount", title: "Amount", kind: "number", width: 180, presenter: { kind: "change", beforeAfter: true } }],
        compare: { statusColumn: "change", counts: { added: 0, removed: 0, changed: count / 10, unchanged: count * 9 / 10 },
          columns: { amount: count / 10 }, onlyChanges: false },
        rows: Array.from({ length: count }, (_, i) => ({ id: "r" + String(i).padStart(6, "0"), cells: {
          change: i % 10 === 0 ? "changed" : "unchanged", name: "Item " + String(i).padStart(6, "0"),
          amount: i % 10 === 0 ? { value: i + 1, changes: [{ name: "Amount", before: i, after: i + 1, kind: "number" }] } : i
        } })) };
      if (mode === "ordinary") {
        delete compareView.compare;
        compareView.columns.forEach(column => delete column.presenter);
      }
      window.applyComparisonFilter = enabled => {
        if (mode === "compare") return compareGrid.setOnlyChanges(enabled);
        const query = compareGrid.getQuery(), filters = (query.filters || []).filter(filter =>
          !(filter.column === "change" && filter.operator === "ne" && filter.values?.length === 1 && filter.values[0] === "unchanged"));
        if (enabled) filters.push({ column: "change", operator: "ne", values: ["unchanged"] });
        return compareGrid.setQuery({ ...query, offset: 0, cursor: undefined, revision: undefined, filters });
      };
      window.hasComparisonFilter = () => mode === "compare" ? compareGrid.getOnlyChanges() :
        compareGrid.getQuery().filters.some(filter => filter.column === "change" && filter.operator === "ne" && filter.values[0] === "unchanged");
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(compareView.rows)));
      return { rowCount: count, changedRows: compareView.rows.filter(row => row.cells.change === "changed").length,
        rowsSha256: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join(""),
        shape: "Identical keyed joined rows: text status/name; amount scalar or value+changes wrapper. Ordinary has no view.compare or presenters.",
        amountSum: compareView.rows.reduce((sum, row) => sum + (typeof row.cells.amount === "number" ? row.cells.amount : row.cells.amount.value), 0) };
    }, { count: rows, mode });
    assert.equal(fixture.changedRows, rows / 10, "fixture has exactly ten percent changed rows");
    cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    const memory = async () => {
      const { metrics } = await cdp.send("Performance.getMetrics"), values = Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
      return { usedBytes: values.JSHeapUsedSize, totalBytes: values.JSHeapTotalSize };
    };
    const heapBefore = await memory();
    const create = await page.evaluate(async () => {
      const start = performance.now();
      window.compareGrid = CanopyX.createDataGrid(document.getElementById("compare"), { view: compareView });
      await compareGrid.ready;
      const readyMs = performance.now() - start;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { readyMs, paintedMs: performance.now() - start };
    });
    const heapReady = await memory();
    const count = () => page.evaluate(() => compareGrid.prepareExport({ scope: "filtered" }).request.recordCount);
    assert.equal(await count(), rows, "initial query includes all joined rows");
    const toggle = enabled => page.evaluate(async enabled => {
      const start = performance.now(); await applyComparisonFilter(enabled);
      const queryMs = performance.now() - start;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { queryMs, paintedMs: performance.now() - start };
    }, enabled);
    const onlyChanges = await toggle(true), heapChanges = await memory();
    assert.equal(await count(), rows / 10, "only-changes includes exactly ten percent");
    assert.equal(await page.evaluate(() => hasComparisonFilter()), true);
    const changedIds = await page.locator(".cx-row[data-cx-id]").evaluateAll(elements => elements.map(element => element.dataset.cxId));
    assert.ok(changedIds.length > 0 && changedIds.every(id => Number(id.slice(1)) % 10 === 0), "painted keys identify changed rows");
    const restore = await toggle(false), heapRestored = await memory();
    assert.equal(await count(), rows, "disabling only-changes restores all rows");
    assert.equal(await page.evaluate(() => hasComparisonFilter()), false);
    // An independently computed ten-record search near the tail proves search and only-changes compose.
    const first = rows - 10, prefix = "Item " + String(first).padStart(6, "0").slice(0, -1);
    await page.evaluate(search => compareGrid.setQuery({ search }), prefix);
    assert.equal(await count(), 10, "tail search matches ten stable keys");
    await page.evaluate(() => applyComparisonFilter(true));
    await page.evaluate(framePair);
    assert.equal(await count(), 1, "tail search intersects only-changes");
    const tailIds = await page.locator(".cx-row[data-cx-id]").evaluateAll(elements => elements.map(element => element.dataset.cxId));
    assert.deepEqual(tailIds, ["r" + String(first).padStart(6, "0")]);
    await page.evaluate(() => applyComparisonFilter(false));
    assert.equal(await count(), 10, "toggle preserves search");
    assert.equal(await page.evaluate(() => compareGrid.getQuery().search), prefix);
    assert.deepEqual(errors, [], "browser errors");
    assert.ok(requested.every(url => new URL(url).origin === origin), "no external data/model requests");
    assert.equal(requested.some(url => new URL(url).pathname === "/canopyx-compare.js"), mode === "compare", "ordinary baseline does not load the compare part");
    const mounted = await page.evaluate(() => ({ rows: document.querySelectorAll(".cx-row[data-cx-id]").length, nodes: document.getElementsByTagName("*").length }));
    const hostAfter = os.cpus().map(core => core.times);
    const hostTotal = times => times.reduce((sum, core) => sum + Object.values(core).reduce((a, b) => a + b, 0), 0);
    const totalCpuMs = hostTotal(hostAfter) - hostTotal(hostBefore), idleCpuMs = hostAfter.reduce((sum, core, i) => sum + core.idle - hostBefore[i].idle, 0);
    return { mode, fixture, browser: version, startedAt,
      hostBusyPercent: totalCpuMs ? 100 * (1 - idleCpuMs / totalCpuMs) : null,
      create, onlyChanges, restore, heap: { before: heapBefore, ready: heapReady, changes: heapChanges, restored: heapRestored },
      mountedAfterProbe: mounted, correctness: { initial: rows, onlyChanges: rows / 10, restored: rows, tailSearch: 10, tailChanges: tailIds },
      requestedAssets: requested.filter(url => new URL(url).pathname !== "/") };
  } finally {
    // Only this sample's API, CDP session, context and browser are ours. Close all of them on success or failure.
    try { if (page && !page.isClosed()) await page.evaluate(() => window.compareGrid?.destroy()); }
    finally {
      try { if (cdp) await cdp.detach(); }
      finally { try { if (context) await context.close(); } finally { await browser.close(); } }
    }
  }
}

const metrics = {
  readyMs: sample => sample.create.readyMs, paintedMs: sample => sample.create.paintedMs,
  onlyChangesMs: sample => sample.onlyChanges.queryMs, onlyChangesPaintedMs: sample => sample.onlyChanges.paintedMs,
  restoreMs: sample => sample.restore.queryMs, restorePaintedMs: sample => sample.restore.paintedMs,
  heapReadyBytes: sample => sample.heap.ready.usedBytes, heapChangesBytes: sample => sample.heap.changes.usedBytes,
  heapRestoredBytes: sample => sample.heap.restored.usedBytes,
  heapGrowthBytes: sample => sample.heap.ready.usedBytes - sample.heap.before.usedBytes
};
const summarize = samples => Object.fromEntries(Object.entries(metrics).map(([key, pick]) => [key, median(samples.map(pick))]));
const overhead = (ordinary, compared) => Object.fromEntries(Object.keys(metrics).map(key => [key, {
  ordinary: ordinary[key], compare: compared[key], delta: compared[key] - ordinary[key],
  ratio: ordinary[key] > 0 ? compared[key] / ordinary[key] : null,
  percent: ordinary[key] > 0 ? 100 * (compared[key] - ordinary[key]) / ordinary[key] : null
}]));
const report = { schemaVersion: 2, at: new Date().toISOString(), rows, changedFraction: 0.1, runs, cpus, viewport,
  method: "Identical already-joined inline rows; ordinary omits view.compare/presenters and filters via setQuery; compare uses setOnlyChanges. Fresh browser per sample; alternating pair order. Create-to-ready includes lazy parts; observed heap without forced GC. Overhead is compare minus ordinary; signed losses and gains are retained.",
  budgetReference: { source: "docs/large-data.md#opt-in-load-benchmarks", implementation: "tests/browser/specs/large-data-performance.spec.mjs:FIRST_ROWS_OBJECTS_MS",
    rows: 100000, cpu: 4, thresholdMs: 8000, metric: "navigation-to-first-row paint for the row-object single-file fixture",
    evaluation: "reference-only", reason: "This three-column fixture times create-to-ready/paint after navigation and row construction. It does not measure the established full-load interval. No established compare-overhead or toggle threshold; no new threshold is inferred." },
  machine: { cpu: os.cpus()[0]?.model.trim(), cores: os.cpus().length, memoryBytes: os.totalmem(), platform: process.platform,
    osRelease: os.release(), node: process.version, scheduling: "Inherited normal host scheduling; no affinity, priority or power-plan changes." }, results: {} };
let activeSample;
try {
  for (const cpu of cpus) {
    const result = report.results[cpu + "x"] = { ordinary: { samples: [] }, compare: { samples: [] }, pairs: [] };
    for (let run = 0; run < runs; run++) {
      const order = run % 2 ? ["compare", "ordinary"] : ["ordinary", "compare"], pair = {};
      for (const mode of order) {
        activeSample = { cpu, run: run + 1, mode };
        const sample = await once(cpu, mode); pair[mode] = sample; result[mode].samples.push(sample);
        console.log(`${cpu}x run ${run + 1}/${runs} ${mode}: ready ${sample.create.readyMs.toFixed(1)} ms; filter ${sample.onlyChanges.queryMs.toFixed(1)} ms; restore ${sample.restore.queryMs.toFixed(1)} ms`);
      }
      assert.deepEqual(pair.ordinary.fixture, pair.compare.fixture, "paired modes consume byte-identical joined rows");
      result.pairs.push({ run: run + 1, order, overhead: overhead(summarize([pair.ordinary]), summarize([pair.compare])) });
    }
    for (const mode of ["ordinary", "compare"]) result[mode].median = summarize(result[mode].samples);
    result.overhead = overhead(result.ordinary.median, result.compare.median);
    console.log(`${cpu}x median overhead: ready ${result.overhead.readyMs.delta.toFixed(1)} ms (${result.overhead.readyMs.percent?.toFixed(1)}%); filter ${result.overhead.onlyChangesMs.delta.toFixed(1)} ms (${result.overhead.onlyChangesMs.percent?.toFixed(1)}%)`);
  }
} catch (error) {
  report.failure = { ...activeSample, message: error.message, stack: error.stack };
  throw error;
} finally {
  // Preserve every completed sample and any failure, including partial pairs.
  report.assets = Object.fromEntries([...assetText].map(([name, text]) => [name, { bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") }]));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log("Written " + out);
}
