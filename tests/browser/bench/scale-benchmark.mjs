// Scale benchmark: directory-shaped views at five sizes, written by the examples app with the writers' default choices.
//
//   dotnet run --project CanopyX.Examples -c Release -- <folder> --scale [--tiers 50,500,5000,50000,500000]
//   node bench/scale-benchmark.mjs --fixtures <folder>/scale [--runs 3] [--cpu 1] [--cases users-50000,groups-500000-bundle]
//                                  [--channel chromium] [--label before] [--out file.json] [--timeout 600]
//
// Cases (from the file names ScaleExample writes):
//   users-<n>            user inventory, 20 columns, single file (row objects up to 5,000 rows, then compact or gzip row data)
//   users-<n>-bundle     the same grid as a bundle: index.html, assets and row files, opened from file://
//   users-wide<w>-<n>    the user inventory with <w> columns
//   computers-<n>        computer inventory, 14 columns, single file
//   groups-<n>           group membership tree of n nodes, single file; groups-<n>-bundle the same tree as a bundle
//   matrix-<n>           policy by server matrix, scaled with the tier up to the matrix's cell limit
//   changes-<n>          change list of n/10 items, up to the list's item limit
//
// Measures, per run, in a fresh browser (1440 x 900):
//   bytes        the page and every file beside it
//   firstMs      navigation start to the frame after the view reports ready and shows a row
//   allRowsMs    a grid with row data: until every row is decoded
//   longestMs    the longest main-thread task until then; decodeLongestMs the longest after the first rows show
//   <operation>LongestMs   the longest main-thread task while each operation below ran (searchLongestMs for search)
//   sortMs, filterMs, groupMs, searchMs   each operation until painted (grids; trees and matrices where they have it)
//   expandMs     trees: opening the largest group (up to 5,000 members) until painted
//   fps, jank    frames per second and frames over 50 ms while wheel-scrolling for about two seconds
//   heapMB       JS heap after load and after the operations, after a forced garbage collection
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
const fixtures = path.resolve(option("fixtures", path.join(here, "..", "bench-results", "scale")));
const runs = Number(option("runs", "3"));
const cpus = option("cpu", "1").split(",").map(Number);
const channel = option("channel", process.env.CANOPYX_BROWSER_CHANNEL || "chromium");
const label = option("label", "current");
const out = path.resolve(option("out", path.join(fixtures, "scale-" + label + ".json")));
const caseTimeout = Number(option("timeout", "600")) * 1000;
const viewport = { width: 1440, height: 900 };

function folderBytes(folder) {
  let total = 0;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    total += entry.isDirectory() ? folderBytes(full) : fs.statSync(full).size;
  }
  return total;
}

function discover() {
  const cases = [];
  for (const entry of fs.readdirSync(fixtures)) {
    const match = /^(users|users-wide\d+|computers|groups|matrix|changes)-(\d+)(-bundle)?(\.html)?$/.exec(entry);
    if (!match || !!match[3] === !!match[4]) continue;
    const name = entry.replace(/\.html$/, ""), bundle = !!match[3];
    const kind = match[1] === "groups" ? "tree" : match[1] === "matrix" ? "matrix" : match[1] === "changes" ? "changes" : "grid";
    const file = bundle ? path.join(fixtures, entry, "index.html") : path.join(fixtures, entry);
    cases.push({ name, kind, family: match[1], tier: +match[2], bundle, file, bytes: bundle ? folderBytes(path.join(fixtures, entry)) : fs.statSync(file).size });
  }
  const order = ["users", "users-bundle", "computers", "users-wide100", "users-wide150", "groups", "groups-bundle", "matrix", "changes"];
  const rank = (c) => order.indexOf(c.family + (c.bundle ? "-bundle" : ""));
  cases.sort((a, b) => a.tier - b.tier || rank(a) - rank(b));
  const wanted = option("cases", null);
  return wanted ? cases.filter((item) => wanted.split(",").includes(item.name)) : cases;
}

function instrument() {
  const t = window.__cxScale = { long: [], first: null, allRows: null };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) t.long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch (e) { /* not available */ }
  const check = () => {
    const host = document.querySelector("[data-cx-ready]");
    if (t.first == null && host && host.querySelector("[role=row] [role=gridcell], [role=row] [role=rowheader], .cx-row[data-cx-id], .cx-change-item, [data-cx-item]")) {
      t.first = -1;
      requestAnimationFrame(() => requestAnimationFrame(() => { t.first = performance.now(); }));
    }
    const view = document.querySelector("[data-canopyx-mounted]")?.canopyx?.view;
    if (t.allRows == null && t.first != null && (!view || !view.rowData || view.rows.length >= view.rowData.count)) t.allRows = performance.now();
    if (t.first == null || t.allRows == null) setTimeout(check, 10);
  };
  check();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};

async function heap(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return (metrics.find((m) => m.name === "JSHeapUsedSize") || {}).value / 1048576;
}

/** Runs body(api) in the page; the milliseconds until the frame after it settles, and its longest main-thread task. */
function timed(page, body) {
  return page.evaluate(async (source) => {
    const host = document.querySelector("[data-cx-ready]"), api = host.canopyx;
    const run = new Function("api", "host", "return (async () => { " + source + " })();");
    const started = performance.now();
    await run(api, host);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ended = performance.now();
    // Long tasks are reported after they end; a short wait lets the last one arrive.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const longest = window.__cxScale.long.filter(([start, duration]) => start + duration >= started && start <= ended).reduce((max, [, duration]) => Math.max(max, duration), 0);
    return { ms: ended - started, longest };
  }, body);
}

/** Wheel-scrolls the view's scroller for 40 steps and records frame times. */
async function scroll(page) {
  const box = await page.evaluate(() => {
    const host = document.querySelector("[data-cx-ready]");
    const scroller = [host, ...host.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    if (!scroller) return null;
    const rect = scroller.getBoundingClientRect();
    window.__frames = [];
    let last = performance.now();
    window.__recording = true;
    const loop = (now) => { window.__frames.push(now - last); last = now; if (window.__recording) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return { x: rect.left + Math.min(200, rect.width / 2), y: rect.top + Math.min(200, rect.height / 2) };
  });
  if (!box) return { fps: null, jank: null };
  await page.mouse.move(box.x, box.y);
  const started = Date.now();
  for (let step = 0; step < 40; step++) { await page.mouse.wheel(0, 400); await sleep(16); }
  const elapsed = Date.now() - started;
  const frames = await page.evaluate(() => { window.__recording = false; return window.__frames.slice(1); });
  return { fps: frames.length / (elapsed / 1000), jank: frames.filter((f) => f > 50).length, worstFrameMs: Math.max(0, ...frames) };
}

const OPERATIONS = {
  grid: [
    ["sortMs", "await api.sort([{ column: 'lastLogon', direction: 'desc' }]);"],
    ["filterMs", "await api.setQuery({ filters: [{ column: 'enabled', operator: 'eq', values: ['Disabled'] }] });"],
    ["groupMs", "await api.setQuery({ filters: [] }); if (api.setGroupBy) await api.setGroupBy([{ column: api.view.columns.some((c) => c.id === 'department') ? 'department' : 'os', direction: 'asc' }]);"],
    ["searchMs", "if (api.setGroupBy) await api.setGroupBy([]); await api.setQuery({ search: 'kestrel' });"]
  ],
  tree: [
    ["expandMs", "await api.expandPath(['g0'], { expandLast: true });"],
    ["sortMs", "await api.sort('name', 'desc');"],
    ["searchMs", "const hits = await api.search('kestrel', 30); if (!hits || !hits.hits || !hits.hits.length) throw new Error('no hits');"]
  ],
  matrix: [
    ["sortMs", "api.sort('rows', '#total', 'desc');"],
    ["filterMs", "api.setAttentionOnly(true);"],
    ["searchMs", "api.setAttentionOnly(false); api.setSearch('kestrel');"]
  ],
  changes: [
    ["filterMs", "api.setState({ flaggedOnly: true });"],
    ["searchMs", "api.setState({ flaggedOnly: false, kinds: ['modified'] });"]
  ]
};

async function runOnce(item, cpu) {
  const browser = await chromium.launch({ channel: channel === "chromium" ? undefined : channel, headless: true, args: ["--js-flags=--max-old-space-size=8192"] });
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
    await page.goto(pathToFileURL(item.file).href, { waitUntil: "commit", timeout: caseTimeout });
    await page.waitForFunction(() => window.__cxScale && window.__cxScale.first > 0 && window.__cxScale.allRows != null, null, { timeout: caseTimeout, polling: 50 });
    const result = await page.evaluate(() => {
      const t = window.__cxScale, until = Math.max(t.first, t.allRows);
      const tasks = t.long.filter(([start]) => start <= until);
      // Decoding runs after the first rows show; the tasks before them are the first layout.
      const decoding = t.long.filter(([start, d]) => start + d >= t.first && start <= t.allRows);
      return { firstMs: t.first, allRowsMs: t.allRows, longestMs: tasks.reduce((max, [, d]) => Math.max(max, d), 0), longTasks: tasks.length,
        decodeLongestMs: decoding.reduce((max, [, d]) => Math.max(max, d), 0),
        domNodes: document.getElementsByTagName("*").length };
    });
    result.heapLoadMB = await heap(cdp);
    // Trees scroll after their largest group is open (the first operation); the other views scroll as they load.
    const operations = OPERATIONS[item.kind];
    for (const [index, [key, body]] of operations.entries()) {
      if (index === (item.kind === "tree" ? 1 : 0)) Object.assign(result, await scroll(page));
      try { const timing = await timed(page, body); result[key] = timing.ms; result[key.replace(/Ms$/, "LongestMs")] = timing.longest; } catch (error) { result[key + "Error"] = String(error.message || error).split("\n")[0]; }
    }
    result.heapAfterMB = await heap(cdp);
    if (crashed) throw new Error("renderer crashed");
    if (errors.length) result.errors = errors.slice(0, 3);
    return result;
  } finally {
    await browser.close();
  }
}

const cases = discover();
if (!cases.length) throw new Error("No scale fixtures in " + fixtures + "; run the examples app with --scale first.");
const report = { label, channel, at: new Date().toISOString(), runs, viewport,
  machine: { cpu: os.cpus()[0].model.trim(), logicalCores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1073741824), os: os.type() + " " + os.release() }, cases: {} };
const write = () => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); };
for (const item of cases) {
  const entry = report.cases[item.name] = { kind: item.kind, tier: item.tier, bytes: item.bytes, results: {} };
  for (const cpu of cpus) {
    const all = [];
    for (let run = 0; run < runs; run++) {
      let result;
      try { result = await runOnce(item, cpu); } catch (error) { result = { failed: String(error.message || error).split("\n")[0] }; }
      all.push(result);
      process.stdout.write(item.name + " cpu" + cpu + " run " + (run + 1) + ": " + (result.failed ? "FAILED " + result.failed :
        "first " + Math.round(result.firstMs) + " ms, all " + Math.round(result.allRowsMs) + " ms, heap " + Math.round(result.heapLoadMB) + " MB, fps " + Math.round(result.fps)) + "\n");
      if (result.failed) break;
    }
    const ok = all.filter((r) => !r.failed), keys = new Set(ok.flatMap((r) => Object.keys(r)));
    const summary = { runs: all.length, failed: all.length - ok.length, failures: [...new Set(all.filter((r) => r.failed).map((r) => r.failed))] };
    for (const key of keys) {
      if (key === "errors") summary.errors = ok.find((r) => r.errors)?.errors;
      else if (key.endsWith("Error")) summary[key] = ok.find((r) => r[key])?.[key];
      else summary[key] = median(ok.map((r) => r[key]));
    }
    entry.results["cpu" + cpu] = summary;
    write();
  }
}
write();

const f = (value, digits = 0) => value == null ? "-" : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const mb = (bytes) => bytes >= 1048576 ? f(bytes / 1048576, 1) + " MB" : f(bytes / 1024) + " KB";
for (const tier of [...new Set(Object.values(report.cases).map((c) => c.tier))]) {
  console.log("\n**" + f(tier) + "**\n\n| View | Size | First render | All rows | Longest task | Sort | Filter | Group or expand | Search | Scroll fps (frames > 50 ms) | Heap load / after |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const [name, entry] of Object.entries(report.cases)) {
    if (entry.tier !== tier) continue;
    for (const m of Object.values(entry.results)) {
      if (m.failed === m.runs) { console.log("| " + name + " | " + mb(entry.bytes) + " | failed: " + m.failures.join("; ") + " | | | | | | | | |"); continue; }
      const ms = (key) => m[key + "Error"] ? "error" : m[key] == null ? "-" : f(m[key]) + " ms";
      console.log("| " + name + " | " + mb(entry.bytes) + " | " + ms("firstMs") + " | " + ms("allRowsMs") + " | " + ms("longestMs") + " | " + ms("sortMs") + " | " + ms("filterMs") + " | " +
        (m.expandMs != null || m.expandMsError ? ms("expandMs") : ms("groupMs")) + " | " + ms("searchMs") + (m.searchLongestMs != null ? " (task " + f(m.searchLongestMs) + ")" : "") + " | " + f(m.fps) + " (" + f(m.jank) + ") | " + f(m.heapLoadMB) + " / " + f(m.heapAfterMB) + " MB |");
    }
  }
}
console.log("\nWritten " + out);
