// Export benchmark: writes CSV, XLSX and PDF from a flat grid of N directory-style records (a host source that pages rows on
// demand, so the grid holds no copy of them) through exportAs, the path the Export menu uses. Each run gets a fresh browser.
// It reports the time to the finished Blob, the file size, the JavaScript heap peak (sampled every 10 ms, so a sample
// cannot land inside a long task), the longest main-thread gap seen by a 10 ms timer, long tasks (over 50 ms), progress
// reports, and, with --cancel, how long a cancelled export takes to settle once it has read a fifth of the rows.
//
//   node bench/export-benchmark.mjs [--rows 50,500,5000,50000,500000] [--formats csv,xlsx,pdf] [--cpu 1] [--cancel] [--out file.json]
//   node bench/export-benchmark.mjs --bundle [--formats csv,xlsx,pdf]   (the largest generated bundle example, all nodes)
//   --text-csv measures CSV through toCsv (the text API, limited to 1,000,000 rows) instead of exportAs("csv").
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeAssets } from "../specs/support.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf("--" + name); return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback; };
const tiers = option("rows", "50,500,5000,50000,500000").split(",").map(Number);
const formats = option("formats", "csv,xlsx,pdf").split(",");
const cpu = Number(option("cpu", "1")), cancel = args.includes("--cancel"), bundle = args.includes("--bundle"), textCsv = args.includes("--text-csv");
const examples = process.env.CANOPYX_EXAMPLES ? path.resolve(process.env.CANOPYX_EXAMPLES) : path.join(repo, "CanopyX.Examples/bin/Release/net10.0/output");
const out = path.resolve(option("out", path.join(here, "..", "bench-results", bundle ? "export-bundle.json" : "export.json")));
const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");

// Directory-style records: names, account names, a flag, timestamps, numbers and a distinguished name.
const view = {
  protocol: "canopyx/2", type: "grid", id: "users", label: "Users", source: { kind: "host" }, pageSize: 500, rowHeight: 28, selection: "multiple", exportFormats: ["xlsx", "pdf"],
  columns: [
    { id: "name", title: "Name", kind: "text", width: 200 }, { id: "sam", title: "Account", kind: "text", width: 140 },
    { id: "enabled", title: "Enabled", kind: "text", width: 90 }, { id: "logon", title: "Last logon", kind: "datetime", width: 170 },
    { id: "age", title: "Password age (days)", kind: "number", width: 120 }, { id: "groups", title: "Groups", kind: "number", width: 90 },
    { id: "department", title: "Department", kind: "text", width: 140 }, { id: "dn", title: "Distinguished name", kind: "text", width: 320 }
  ]
};
const setup = rows => `window.__rows=${rows};
CanopyX.configure('users',{source:{async query(query){
  const departments=['Finance','Sales','Engineering','Operations','Legal','Support'],count=window.__rows,from=query.offset,to=Math.min(count,from+query.limit),items=[];
  for(let i=from;i<to;i++){const d=departments[i%6];items.push({id:'u'+i,cells:{name:'User '+i,sam:'user'+i,enabled:i%7?'Yes':'No',
    logon:new Date(Date.UTC(2026,0,1)+i*60000).toISOString(),age:i%400,groups:i%23,department:d,dn:'CN=User '+i+',OU='+d+',OU=Accounts,DC=corp,DC=example,DC=com'}});}
  return {protocol:'canopyx/2',type:'gridPage',view:'users',revision:'r1',offset:from,total:count,matched:count,items};
}}});`;

function page(rows) {
  const { script, style } = runtimeAssets("grid");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Export benchmark</title><style>" + style + "</style><script>" + script +
    "\n" + asset("canopyx-office-export.js") + "</script><script>" + setup(rows) + "</script></head><body class=\"cx-page\"><div class=\"cx-host\" style=\"height:600px\" data-canopyx-host>" +
    "<script type=\"application/json\" class=\"cx-config\">" + JSON.stringify(view) + "</script></div></body></html>";
}

// Runs in the page: samples the heap and timer gaps, then exports (or cancels after a fifth of the records).
async function measure({ format, cancelAt, tree, textCsv }) {
  const host = document.querySelector("[data-canopyx-host]"), grid = host.canopyx;
  if (tree) grid.opts.exportFormats = ["xlsx", "pdf"];
  const longTasks = []; const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
  observer.observe({ type: "longtask" });
  let peak = performance.memory.usedJSHeapSize, last = performance.now(), gap = 0;
  const base = peak, timer = setInterval(() => { const now = performance.now(); gap = Math.max(gap, now - last); last = now; peak = Math.max(peak, performance.memory.usedJSHeapSize); }, 10);
  const controller = new AbortController(); let progress = 0, completed = 0, cancelledAt = null;
  const started = performance.now();
  const onProgress = value => {
    progress++; completed = value.completed;
    if (cancelAt && cancelledAt === null && value.completed >= cancelAt) { cancelledAt = performance.now(); controller.abort(); }
  };
  const result = await (format === "csv" && textCsv ? grid.toCsv({ scope: "all", maxRows: 1000000, signal: controller.signal, onProgress }).then(text => ({ blob: new Blob([text]), diagnostics: [] })) :
    grid.exportAs(format, { scope: "all", download: false, timeoutMs: 3600000, signal: controller.signal, onProgress }))
    .then(value => ({ bytes: value.blob.size, diagnostics: value.diagnostics.length }), error => ({ error: error.name + ": " + error.message }));
  const ended = performance.now();
  clearInterval(timer); observer.disconnect();
  return { ...result, ms: Math.round(ended - started), settleMs: cancelledAt === null ? null : Math.round(ended - cancelledAt), progress, completed,
    heapBaseMB: +(base / 1048576).toFixed(1), heapPeakMB: +(peak / 1048576).toFixed(1), maxGapMs: Math.round(gap),
    longTasks: longTasks.length, longestTaskMs: Math.round(Math.max(0, ...longTasks)) };
}

async function once(target, format, options) {
  const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tab = await context.newPage(); const errors = []; tab.on("pageerror", error => errors.push(error.message)); tab.on("crash", () => errors.push("renderer crashed")); tab.on("console", message => message.type() === "error" && errors.push(message.text().split("\n")[0]));
    if (cpu > 1) await (await context.newCDPSession(tab)).send("Emulation.setCPUThrottlingRate", { rate: cpu });
    if (target.html) {
      await tab.route("http://canopyx.test/export", route => route.fulfill({ contentType: "text/html", body: target.html }));
      await tab.goto("http://canopyx.test/export");
    } else await tab.goto(target.url);
    await tab.waitForSelector("[data-cx-ready]", { timeout: 300000, state: "attached" }).catch(error => { throw new Error("Not ready: " + errors.join("; ") + " " + error.message); });
    // The lazy writer parts load before the clock starts, so the numbers measure writing only.
    await tab.evaluate(async ({ format, textCsv }) => { const grid = document.querySelector("[data-canopyx-host]").canopyx;
      if (grid.opts && !grid.view.exportFormats) grid.opts.exportFormats = ["xlsx", "pdf"];
      // An empty selection loads the writer and writes a file with headings only.
      const warm = { scope: "selected", maxRows: 1 };
      await (format === "csv" && textCsv ? grid.toCsv(warm) : grid.exportAs(format, { ...warm, download: false })).catch(() => {});
      window.gc?.(); }, { format, textCsv });
    const result = await tab.evaluate(measure, { format, textCsv, ...options });
    return { ...result, errors };
  } finally { await browser.close(); }
}

const results = [];
const row = (label, format, result) => {
  results.push({ label, format, ...result });
  console.log([label.padEnd(10), format.padEnd(5), result.error || (result.ms + " ms").padStart(10), result.bytes ? (result.bytes / 1048576).toFixed(1).padStart(7) + " MB" : "",
    "heap " + result.heapBaseMB + "→" + result.heapPeakMB + " MB", "gap " + result.maxGapMs + " ms", "long " + result.longTasks + "/" + result.longestTaskMs + " ms",
    "progress " + result.progress, result.settleMs === null ? "" : "cancel settled in " + result.settleMs + " ms at " + result.completed].join("  "));
};
console.log("Chromium, " + os.cpus()[0].model + ", CPU slowdown " + cpu + "x");
if (bundle) {
  const url = pathToFileURL(path.join(examples, "bundle/index.html")).href;
  for (const format of formats) row("bundle", format, await once({ url }, format, { tree: true }));
} else {
  for (const rows of tiers) for (const format of formats) {
    row(String(rows), format, await once({ html: page(rows) }, format, {}));
    if (cancel && rows >= 50000) row(rows + " ✕", format, await once({ html: page(rows) }, format, { cancelAt: rows / 5 }));
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ cpu, results }, null, 2) + "\n");
console.log("Wrote " + out);
