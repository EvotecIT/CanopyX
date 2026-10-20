// Column-count measurement for flat grids (TODO "Measure realistic 50/100/200-column fixtures before implementing column
// virtualization"). Mounts a grid with N number columns and a text identity column, then records the first paint, the
// mounted cells and DOM nodes, and frame times while scrolling down and sideways, optionally under CPU throttling.
//
//   node bench/columns-benchmark.mjs [--columns 10,50,100,200] [--rows 5000] [--runs 3] [--cpu 1,4] [--steps 60]
//                                    [--runtime path/to/canopyx-grid.js] [--style path/to/canopyx-grid.css] [--out file.json]
//
// Method: as the scroll benchmark (bench/scroll-benchmark.mjs): a fresh browser per run, viewport 1680 x 950, 500 px wheel
// steps 16 ms apart and awaited, frame times from a requestAnimationFrame loop. The sideways pass wheels 400 px per step.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pageHtml } from "./fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf("--" + name); return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback; };
const counts = option("columns", "10,50,100,200").split(",").map(Number);
const rows = Number(option("rows", "5000")), runs = Number(option("runs", "3")), steps = Number(option("steps", "60"));
const cpus = option("cpu", "1,4").split(",").map(Number);
const runtime = path.resolve(option("runtime", path.join(repo, "CanopyX.Html/Assets/canopyx-grid.js")));
const stylesheet = path.resolve(option("style", path.join(repo, "CanopyX.Html/Assets/canopyx-grid.css")));
const out = path.resolve(option("out", path.join(here, "..", "bench-results", "columns.json")));
const viewport = { width: 1680, height: 950 };
const median = values => { const sorted = values.filter(value => typeof value === "number").sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };

function view(columns) {
  return { protocol: "canopyx/2", type: "grid", id: "wide", label: "Wide grid", rowHeight: 28, pageSize: 200, selection: "single", search: false,
    columns: [{ id: "name", title: "Device", kind: "text", width: 180, rowHeader: true },
      ...Array.from({ length: columns }, (_, c) => ({ id: "m" + c, title: "Metric " + c, kind: "number", width: 96 }))],
    source: { kind: "inline" }, rows: Array.from({ length: rows }, (_, r) => ({ id: String(r), cells: Object.assign({ name: "device-" + String(r).padStart(5, "0") },
      ...Array.from({ length: columns }, (_, c) => ({ ["m" + c]: (r * 31 + c * 17) % 1000 }))) })) };
}

async function frames(page, wheel) {
  await page.evaluate(() => {
    window.__frames = []; window.__rec = true; let last = performance.now();
    const frame = time => { window.__frames.push(time - last); last = time; if (window.__rec) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  for (let step = 0; step < steps; step++) { await wheel(); await page.waitForTimeout(16); }
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    window.__rec = false; const sorted = window.__frames.slice().sort((a, b) => a - b);
    return { frames: sorted.length, over33: sorted.filter(f => f > 33.4).length, over50: sorted.filter(f => f > 50).length, p95: sorted[Math.floor(sorted.length * 0.95)] || 0, max: sorted[sorted.length - 1] || 0 };
  });
}

async function once(url, cpu) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    const started = Date.now();
    await page.goto(url);
    await page.waitForSelector(".cx-row[data-cx-id]", { timeout: 120000 });
    const firstRows = Date.now() - started;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mounted = await page.evaluate(() => ({ cells: document.querySelectorAll(".cx-row .cx-cell").length, rows: document.querySelectorAll(".cx-row[data-cx-id]").length, nodes: document.getElementsByTagName("*").length,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }));
    const box = await page.locator(".cx-grid").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const down = await frames(page, () => page.mouse.wheel(0, 500));
    const sideways = await frames(page, () => page.mouse.wheel(400, 0));
    if (errors.length) throw new Error(errors.join("; "));
    return { firstRows, ...mounted, down, sideways };
  } finally { await browser.close(); }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const script = fs.readFileSync(runtime, "utf8"), style = fs.readFileSync(stylesheet, "utf8");
const report = { at: new Date().toISOString(), rows, runs, steps, runtime, viewport, machine: { cpu: os.cpus()[0].model.trim(), cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1073741824) }, results: {} };
for (const columns of counts) {
  const file = path.join(path.dirname(out), "columns-" + columns + ".html");
  fs.writeFileSync(file, pageHtml(script, style, view(columns)));
  for (const cpu of cpus) {
    const all = [];
    for (let run = 0; run < runs; run++) all.push(await once(pathToFileURL(file).href, cpu));
    const pick = select => median(all.map(select));
    report.results[columns + "@" + cpu] = { runs: all, median: { firstRows: pick(r => r.firstRows), cells: pick(r => r.cells), rows: pick(r => r.rows), nodes: pick(r => r.nodes), heap: pick(r => r.heap),
      downP95: pick(r => r.down.p95), downOver33: pick(r => r.down.over33), downOver50: pick(r => r.down.over50), sidewaysP95: pick(r => r.sideways.p95), sidewaysOver33: pick(r => r.sideways.over33), sidewaysOver50: pick(r => r.sideways.over50) } };
    const m = report.results[columns + "@" + cpu].median;
    process.stdout.write(columns + " columns, " + cpu + "x: first rows " + m.firstRows + " ms, " + m.cells + " cells in " + m.rows + " rows, " + m.nodes + " nodes, down p95 " + m.downP95.toFixed(1) + " ms (" + m.downOver50 + " over 50), sideways p95 " + m.sidewaysP95.toFixed(1) + " ms (" + m.sidewaysOver50 + " over 50)\n");
  }
  fs.rmSync(file);
}
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("\n| Columns | CPU | First rows (ms) | Mounted cells | DOM nodes | Heap (MB) | Down p95 (ms) | Down over 50 ms | Sideways p95 (ms) | Sideways over 50 ms |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [key, value] of Object.entries(report.results)) {
  const [columns, cpu] = key.split("@"), m = value.median;
  console.log("| " + columns + " | " + cpu + "x | " + m.firstRows + " | " + m.cells + " | " + m.nodes + " | " + m.heap + " | " + m.downP95.toFixed(1) + " | " + m.downOver50 + " | " + m.sidewaysP95.toFixed(1) + " | " + m.sidewaysOver50 + " |");
}
console.log("\nWritten " + out);
