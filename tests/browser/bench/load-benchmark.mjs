// Load benchmark for large data: how fast a page with big grids and trees shows its first rows and becomes usable.
// It opens the pages load-fixture.mjs writes (flat grids of 10k, 100k and 1M rows as single files, bundles opened
// from file:// and remote grids against a local mock endpoint; a tree of 100k+ nodes; a report with 24 grids and two
// trees, most of them in hidden tabs or below the fold) in a fresh browser per run, optionally under CPU throttling, and
// reports the median of the runs.
//
//   node bench/load-fixture.mjs --out <folder>
//   node bench/load-benchmark.mjs --fixtures <folder> [--runs 5] [--cpu 1,4] [--cases grid-10000-single,report-single]
//                                 [--channel msedge] [--label name] [--out file.json] [--load-only]
//
// Measures, per run:
//   htmlBytes      the page and the files it loads (bundles: runtime, parts and data files)
//   allRowsMs      for a grid with compact row data, navigation start to the moment every row is decoded
//   parseMs        main-thread JSON.parse time of embedded data (strings of 50,000 characters or more)
//   firstRowsMs    navigation start to the frame after the first data row is in the DOM
//   interactiveMs  the later of: every grid visible at load reports ready, and the end of the last long task before
//                  one quiet second (the main thread is free for input)
//   longTasks      count, total and longest main-thread task over 50 ms until interactive
//   heapMB         JS heap after a forced garbage collection: after load, after scrolling, after sort and search
//   sortMs         a sort by a date column on the complete data, until painted
//   searchMs       the first quick search on the complete data, until painted
// Report pages also measure opening a hidden tab (tabMs) and scrolling to the grids below the fold (belowMs), each
// until their rows are painted.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { remoteRows, folderBytes } from "./load-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
const fixtures = path.resolve(option("fixtures", path.join(here, "..", "bench-results", "load")));
const runs = Number(option("runs", "5"));
const cpus = option("cpu", "1,4").split(",").map(Number);
const channel = option("channel", process.env.CANOPYX_BROWSER_CHANNEL || "msedge");
const label = option("label", "current");
const out = path.resolve(option("out", path.join(fixtures, "load-" + label + ".json")));
const quietMs = Number(option("quiet", "1000"));
const caseTimeout = Number(option("timeout", "600")) * 1000;
const loadOnly = args.includes("--load-only");
const viewport = { width: 1440, height: 900 };

// ---------- cases ----------
function discover() {
  const cases = [];
  for (const entry of fs.readdirSync(fixtures).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    let match;
    if ((match = /^(grid-(\d+)-(?:single|compact|gzip))\.html$/.exec(entry))) cases.push({ name: match[1], kind: "grid", rows: +match[2], file: path.join(fixtures, entry) });
    else if ((match = /^grid-(\d+)-(bundle|bundle-inline|remote)$/.exec(entry))) cases.push({ name: entry, kind: "grid", rows: +match[1], remote: match[2] === "remote", file: path.join(fixtures, entry, "index.html") });
    else if ((match = /^tree-(\d+)-single\.html$/.exec(entry))) cases.push({ name: "tree-" + match[1] + "-single", kind: "tree", rows: +match[1], file: path.join(fixtures, entry) });
    else if ((match = /^tree-bundle$/.exec(entry))) cases.push({ name: "tree-bundle", kind: "tree", file: path.join(fixtures, entry, "index.html") });
    else if ((match = /^(report-[\w-]+)\.html$/.exec(entry))) cases.push({ name: match[1], kind: "report", file: path.join(fixtures, entry) });
  }
  const wanted = option("cases", null);
  return wanted ? cases.filter((item) => wanted.split(",").includes(item.name)) : cases;
}

// ---------- remote mock: a gridPage endpoint over rows held in memory ----------
const fold = (value) => String(value).toLowerCase();
const scalar = (cell) => cell && typeof cell === "object" ? cell.value : cell;
function serveRemote(folder, rows) {
  const data = remoteRows(rows), cache = new Map();
  const text = data.map((row) => Object.values(row.cells).map((cell) => fold(scalar(cell) ?? "")).join(" "));
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  const server = http.createServer((request, response) => {
    if (request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => body += chunk);
      request.on("end", () => {
        const query = JSON.parse(body), key = JSON.stringify([query.search, query.sort]);
        let ordered = cache.get(key);
        if (!ordered) {
          const words = fold(query.search || "").split(/\s+/).filter(Boolean);
          ordered = data.map((row, i) => i).filter((i) => words.every((word) => text[i].includes(word)));
          for (const sort of [...(query.sort || [])].reverse()) {
            const sign = sort.direction === "desc" ? -1 : 1;
            ordered.sort((a, b) => { const x = scalar(data[a].cells[sort.column]), y = scalar(data[b].cells[sort.column]); return x == null ? 1 : y == null ? -1 : x < y ? -sign : x > y ? sign : 0; });
          }
          cache.set(key, ordered);
        }
        const items = ordered.slice(query.offset, query.offset + query.limit).map((i) => data[i]);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "r1", offset: query.offset, total: data.length, matched: ordered.length, items }));
      });
      return;
    }
    const file = path.join(folder, decodeURIComponent(new URL(request.url, "http://x").pathname).replace(/^\/+/, "") || "index.html");
    if (!file.startsWith(folder) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: "http://127.0.0.1:" + server.address().port + "/index.html" })));
}

// ---------- in-page instrumentation ----------
function instrument() {
  const t = window.__cxBench = { parse: 0, parseCount: 0, long: [], firstRowsDom: null, firstRowsPaint: null, ready: [], allRows: null };
  // A grid with compact row data keeps decoding after its first rows: note when its last row is in.
  const rowsTimer = setInterval(() => {
    const view = document.querySelector("[data-canopyx-mounted]")?.canopyx?.view;
    if (view && (!view.rowData || view.rows.length >= view.rowData.count)) { if (view.rowData) t.allRows = performance.now(); clearInterval(rowsTimer); }
  }, 20);
  const parse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const started = performance.now();
    try { return parse.call(this, text, reviver); } finally {
      if (typeof text === "string" && text.length >= 50000) { t.parse += performance.now() - started; t.parseCount++; }
    }
  };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) t.long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch (e) { /* not available */ }
  const seen = new WeakSet();
  const observer = new MutationObserver(() => {
    if (t.firstRowsDom == null && document.querySelector(".cx-row[data-cx-id]")) {
      t.firstRowsDom = performance.now();
      requestAnimationFrame(() => { t.firstRowsPaint = performance.now(); });
    }
    for (const host of document.querySelectorAll("[data-cx-ready]")) if (!seen.has(host)) { seen.add(host); t.ready.push(performance.now()); }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cx-id", "data-cx-ready"] });
}

const median = (values) => {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function heap(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const value = (name) => (metrics.find((m) => m.name === name) || {}).value;
  return { heapMB: value("JSHeapUsedSize") / 1048576, nodes: value("Nodes") };
}

/** Runs body(api) in the page for the given host and returns the milliseconds until the frame after it settles. */
function timed(page, selector, body) {
  return page.evaluate(async ([selector, source]) => {
    const api = document.querySelector(selector).canopyx;
    const run = new Function("api", "return (async () => { " + source + " })();");
    const started = performance.now();
    await run(api);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - started;
  }, [selector, body]);
}

/** Waits until every host the case expects is ready and no long task ended within quietMs. */
async function settle(page, expectedReady, started) {
  for (;;) {
    const state = await page.evaluate(() => ({ now: performance.now(), long: window.__cxBench.long, ready: window.__cxBench.ready.slice(), firstRows: window.__cxBench.firstRowsPaint }));
    const lastEnd = state.long.reduce((end, [start, duration]) => Math.max(end, start + duration), 0);
    if (state.ready.length >= expectedReady && state.firstRows != null && state.now - Math.max(lastEnd, state.ready[expectedReady - 1]) >= quietMs) {
      const readyAt = state.ready[expectedReady - 1];
      const until = Math.max(readyAt, lastEnd, state.firstRows);
      const tasks = state.long.filter(([start]) => start <= until);
      return { interactiveMs: until, readyMs: readyAt, longTasks: tasks.length, longTaskMs: tasks.reduce((sum, [, d]) => sum + d, 0), longestTaskMs: tasks.reduce((max, [, d]) => Math.max(max, d), 0) };
    }
    if (Date.now() - started > caseTimeout) throw new Error("timed out waiting for the page to settle");
    await sleep(200);
  }
}

async function runOnce(item, cpu, url) {
  const browser = await chromium.launch({ channel: channel === "chromium" ? undefined : channel, headless: true, args: ["--js-flags=--max-old-space-size=8192"] });
  const started = Date.now();
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(caseTimeout);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let crashed = false;
    page.on("crash", () => { crashed = true; });
    await page.addInitScript(instrument);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await page.goto(url, { waitUntil: "commit", timeout: caseTimeout });
    const expectedReady = item.kind === "report" ? 2 : 1;
    await page.waitForFunction(() => window.__cxBench && window.__cxBench.firstRowsPaint != null, null, { timeout: caseTimeout, polling: 100 });
    const result = await settle(page, expectedReady, started);
    Object.assign(result, await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      return { firstRowsMs: window.__cxBench.firstRowsPaint, firstRowsDomMs: window.__cxBench.firstRowsDom, parseMs: window.__cxBench.parse, parseCount: window.__cxBench.parseCount,
        domContentLoadedMs: nav.domContentLoadedEventEnd, loadMs: nav.loadEventEnd, mountedHosts: document.querySelectorAll("[data-canopyx-mounted]").length };
    }));
    // Row data keeps decoding after the first rows: the time all rows are in, for pages whose grid carries rowData.
    await page.waitForFunction(() => { const view = document.querySelector("[data-canopyx-mounted]")?.canopyx?.view; return !view?.rowData || window.__cxBench.allRows != null; },
      null, { timeout: caseTimeout, polling: 100 });
    result.allRowsMs = await page.evaluate(() => window.__cxBench.allRows);
    const load = await heap(cdp);
    result.heapLoadMB = load.heapMB; result.domNodes = load.nodes;
    const first = "[data-canopyx-host]";
    if (loadOnly) return result;
    if (item.kind === "grid") {
      // Scroll through the result in 20 jumps, each painted.
      await page.evaluate(async () => {
        const grid = document.querySelector(".cx-data-grid .cx-grid");
        for (let step = 1; step <= 20; step++) {
          grid.scrollTop = (grid.scrollHeight - grid.clientHeight) * step / 20;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        grid.scrollTop = 0;
      });
      await sleep(300);
      result.heapScrollMB = (await heap(cdp)).heapMB;
      result.sortMs = await timed(page, first, "await api.sort([{ column: 'modified', direction: 'desc' }]);");
      result.searchMs = await timed(page, first, "await api.setQuery({ search: 'kestrel' });");
      result.heapSearchMB = (await heap(cdp)).heapMB;
    } else if (item.kind === "tree") {
      result.sortMs = await timed(page, first, "await api.sort('size', 'desc');");
      // The examples bundle (tree-bundle) holds file shares with budget workbooks; the synthetic tree holds reports.
      const term = item.name === "tree-bundle" ? "budget" : "kestrel report";
      result.searchMs = await timed(page, first, "const hits = await api.search(" + JSON.stringify(term) + ", 50); if (!hits || !hits.hits || !hits.hits.length) throw new Error('no hits');");
      result.heapSearchMB = (await heap(cdp)).heapMB;
    } else if (item.kind === "report") {
      // Opening the fourth tab: until each of its grids shows painted rows.
      result.tabMs = await page.evaluate(async () => {
        const started = performance.now();
        document.querySelectorAll(".tabs button")[3].click();
        const tab = document.querySelectorAll(".tab")[3];
        await new Promise((resolve) => { const check = () => { const hosts = tab.querySelectorAll("[data-canopyx-host]"); if ([...hosts].every((h) => h.querySelector(".cx-row[data-cx-id]"))) resolve(); else requestAnimationFrame(check); }; check(); });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      });
      result.belowMs = await page.evaluate(async () => {
        const started = performance.now(), hosts = [...document.querySelectorAll("main > [data-canopyx-host]")];
        hosts[hosts.length - 1].scrollIntoView();
        await new Promise((resolve) => { const check = () => { const visible = hosts.filter((h) => { const r = h.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }); if (visible.length && visible.every((h) => h.querySelector(".cx-row[data-cx-id]"))) resolve(); else requestAnimationFrame(check); }; check(); });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      });
      result.heapAfterMB = (await heap(cdp)).heapMB;
    }
    if (crashed) throw new Error("renderer crashed");
    if (errors.length) result.errors = errors;
    return result;
  } finally {
    await browser.close();
  }
}

// ---------- main ----------
const cases = discover();
if (!cases.length) throw new Error("No fixtures in " + fixtures + "; run load-fixture.mjs first.");
const report = { label, channel, at: new Date().toISOString(), runs, quietMs, viewport,
  machine: { cpu: os.cpus()[0].model.trim(), logicalCores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1073741824), os: os.type() + " " + os.release() }, cases: {} };
const write = () => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); };
for (const item of cases) {
  let served = null, url = pathToFileURL(item.file).href;
  if (item.remote) { served = await serveRemote(path.dirname(item.file), item.rows); url = served.url; }
  const bytes = item.file.endsWith("index.html") ? folderBytes(path.dirname(item.file)) : fs.statSync(item.file).size;
  const entry = report.cases[item.name] = { kind: item.kind, rows: item.rows, htmlBytes: bytes, results: {} };
  try {
    for (const cpu of cpus) {
      const all = [];
      for (let run = 0; run < runs; run++) {
        let result;
        try { result = await runOnce(item, cpu, url); } catch (error) { result = { failed: String(error.message || error).split("\n")[0] }; }
        all.push(result);
        process.stdout.write(item.name + " cpu" + cpu + " run " + (run + 1) + ": " + (result.failed ? "FAILED " + result.failed :
          "first rows " + Math.round(result.firstRowsMs) + " ms, interactive " + Math.round(result.interactiveMs) + " ms, parse " + Math.round(result.parseMs) + " ms, long " + result.longTasks + "/" + Math.round(result.longestTaskMs) + " ms, heap " + Math.round(result.heapLoadMB) + " MB") + "\n");
        if (result.failed && run === 0 && /timed out|crash/i.test(result.failed)) break;
      }
      const ok = all.filter((r) => !r.failed), keys = new Set(ok.flatMap((r) => Object.keys(r)));
      const summary = { runs: all.length, failed: all.length - ok.length, failures: [...new Set(all.filter((r) => r.failed).map((r) => r.failed))] };
      for (const key of keys) if (key !== "errors") summary[key] = median(ok.map((r) => r[key]));
      entry.results["cpu" + cpu] = { median: summary, runs: all };
      write();
    }
  } finally {
    if (served) served.server.close();
  }
}
write();

const f = (value, digits = 0) => value == null ? "-" : Number(value).toFixed(digits);
console.log("\n| Case | Size | CPU | First rows | Interactive | Parse | Long tasks (count / longest) | Heap load / scroll / search (MB) | Sort | Search | Other |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [name, entry] of Object.entries(report.cases)) for (const [cpu, { median: m }] of Object.entries(entry.results)) {
  console.log("| " + name + " | " + f(entry.htmlBytes / 1048576, 1) + " MB | " + cpu.slice(3) + "x | " + (m.failed === m.runs ? "failed: " + m.failures.join("; ") + " | | | | | | | |" :
    f(m.firstRowsMs) + " ms | " + f(m.interactiveMs) + " ms | " + f(m.parseMs) + " ms | " + f(m.longTasks) + " / " + f(m.longestTaskMs) + " ms | " +
    f(m.heapLoadMB) + " / " + f(m.heapScrollMB ?? m.heapAfterMB) + " / " + f(m.heapSearchMB) + " | " + f(m.sortMs) + " ms | " + f(m.searchMs) + " ms | " +
    (m.tabMs != null ? "tab " + f(m.tabMs) + " ms, below " + f(m.belowMs) + " ms, mounted " + f(m.mountedHosts) : "") + (m.failed ? " (" + m.failed + " failed)" : "") + " |"));
}
console.log("\nWritten " + out);
