// Scroll benchmark for the matrix view: the 150 by 150 and 400 by 400 example matrices (CanopyX.Examples, output/large/),
// scrolled down, sideways and diagonally with mouse-wheel input while an animation-frame loop records frame times,
// optionally under Chrome DevTools CPU throttling. Method as bench/scroll-benchmark.mjs: a fresh browser per run, viewport
// 1680 x 950, wheel steps 16 ms apart and awaited; blank samples count viewport points that show no cell after a scroll.
//
//   node bench/matrix-benchmark.mjs [--sizes 150,400] [--runs 3] [--cpu 1,4] [--steps 40] [--out file.json]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf("--" + name); return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback; };
const sizes = option("sizes", "150,400").split(",").map(Number), runs = Number(option("runs", "3")), steps = Number(option("steps", "40"));
const cpus = option("cpu", "1,4").split(",").map(Number);
const examples = process.env.CANOPYX_EXAMPLES ? path.resolve(process.env.CANOPYX_EXAMPLES) : path.join(repo, "CanopyX.Examples/bin/Release/net10.0/output");
const out = path.resolve(option("out", path.join(here, "..", "bench-results", "matrix.json")));
const viewport = { width: 1680, height: 950 };
const median = values => { const sorted = values.filter(value => typeof value === "number").sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };

async function pass(page, dx, dy) {
  await page.evaluate(() => {
    const scroll = document.querySelector(".cx-mx-scroll"), box = scroll.getBoundingClientRect();
    window.__frames = []; window.__rec = true; window.__blank = 0; window.__samples = 0;
    const probes = [[0.5, 0.4], [0.7, 0.6], [0.9, 0.8]].map(([x, y]) => [box.left + box.width * x, box.top + box.height * y]);
    let last = performance.now(), pending = false;
    const frame = time => { window.__frames.push(time - last); last = time; if (window.__rec) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    scroll.onscroll = () => {
      if (pending || !window.__rec) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; window.__samples++; if (probes.some(([x, y]) => !document.elementFromPoint(x, y)?.closest(".cx-mx-cell,.cx-mx-row"))) window.__blank++; });
    };
  });
  for (let step = 0; step < steps; step++) { await page.mouse.wheel(dx, dy); await page.waitForTimeout(16); }
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    window.__rec = false; const sorted = window.__frames.slice().sort((a, b) => a - b);
    return { frames: sorted.length, over33: sorted.filter(f => f > 33.4).length, over50: sorted.filter(f => f > 50).length, p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      max: sorted[sorted.length - 1] || 0, blank: window.__blank, samples: window.__samples,
      // Cells are drawn on canvas tiles: the cells mounted are the tiles' widths over the cell width.
      cells: Math.round([...document.querySelectorAll(".cx-mx-row canvas")].reduce((sum, canvas) => sum + parseFloat(canvas.style.width || "0"), 0) / parseFloat(getComputedStyle(document.querySelector(".cx-matrix")).getPropertyValue("--mx-cell-w"))) };
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
    await page.goto(url);
    await page.waitForSelector("[data-cx-ready]", { timeout: 120000 });
    const ready = await page.evaluate(() => performance.now());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const box = await page.locator(".cx-mx-scroll").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const down = await pass(page, 0, 500), sideways = await pass(page, 400, 0);
    await page.locator(".cx-mx-scroll").evaluate(scroll => { scroll.scrollTop = 0; scroll.scrollLeft = 0; });
    const diagonal = await pass(page, 300, 300);
    if (errors.length) throw new Error(errors.join("; "));
    return { ready, down, sideways, diagonal };
  } finally { await browser.close(); }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const report = { at: new Date().toISOString(), runs, steps, viewport, machine: { cpu: os.cpus()[0].model.trim(), cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1073741824) }, results: {} };
for (const size of sizes) {
  const url = pathToFileURL(path.join(examples, "large", "matrix-" + size + ".html")).href;
  for (const cpu of cpus) {
    const all = [];
    for (let run = 0; run < runs; run++) all.push(await once(url, cpu));
    const pick = select => median(all.map(select));
    const m = { ready: pick(r => r.ready) };
    for (const kind of ["down", "sideways", "diagonal"]) for (const field of ["p95", "over33", "over50", "blank", "samples", "cells", "max"]) m[kind + "." + field] = pick(r => r[kind][field]);
    report.results[size + "@" + cpu] = { runs: all, median: m };
    process.stdout.write(size + "x" + size + ", " + cpu + "x: ready " + Math.round(m.ready) + " ms; down p95 " + m["down.p95"].toFixed(1) + " (" + m["down.over50"] + " over 50, blank " + m["down.blank"] + "/" + m["down.samples"] +
      "); sideways p95 " + m["sideways.p95"].toFixed(1) + " (" + m["sideways.over50"] + "); diagonal p95 " + m["diagonal.p95"].toFixed(1) + " (" + m["diagonal.over50"] + "); cells " + m["down.cells"] + "\n");
  }
}
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("\n| Matrix | CPU | Ready (ms) | Mounted cells | Down p95 / over 50 ms | Sideways p95 / over 50 ms | Diagonal p95 / over 50 ms | Blank samples |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [key, value] of Object.entries(report.results)) {
  const [size, cpu] = key.split("@"), m = value.median;
  console.log("| " + size + " × " + size + " | " + cpu + "x | " + Math.round(m.ready) + " | " + m["down.cells"] + " | " + m["down.p95"].toFixed(1) + " / " + m["down.over50"] + " | " +
    m["sideways.p95"].toFixed(1) + " / " + m["sideways.over50"] + " | " + m["diagonal.p95"].toFixed(1) + " / " + m["diagonal.over50"] + " | " + (m["down.blank"] + m["sideways.blank"] + m["diagonal.blank"]) + " |");
}
console.log("\nWritten " + out);
