// Scroll benchmark for the CanopyX runtime. Scrolls a large expanded tree from top to bottom with mouse-wheel input
// while an animation-frame loop records frame times, optionally under Chrome DevTools CPU throttling.
//
//   node bench/scroll-benchmark.mjs [--runs 5] [--cpu 1,4] [--rows 5000] [--runtime path/to/canopyx.js]
//                                   [--style path/to/canopyx.css] [--channel msedge] [--label name] [--out file.json]
//                                   [--pause-every 6 --pause-ms 700]
//
// Method (same as the D21 spike): a fresh browser per run, viewport 1680 x 950, 500 px wheel steps 16 ms apart, each
// step awaited. Frames over 50 ms and 33 ms, the 95th percentile and the maximum frame time come from a
// requestAnimationFrame loop. After each scroll event, one sample per frame checks three viewport points for a row;
// a point with no row under it counts as a blank sample (a main-thread check: it cannot see compositor checkerboarding).
// Because each wheel step is awaited, a faster runtime finishes sooner and records fewer frames, so the report also
// gives janky frames per 100 wheel steps, which covers the same scroll distance for every runtime.
// With --pause-every, the wheel stops for --pause-ms after every N steps, so work deferred to scroll pauses (the DOM
// order restore) is measured too.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pageHtml, scrollView } from "./fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf("--" + name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const runs = Number(option("runs", "5"));
const cpus = option("cpu", "1,4").split(",").map(Number);
const rows = Number(option("rows", "5000"));
const runtime = path.resolve(option("runtime", path.join(repo, "CanopyX.Html/Assets/canopyx.js")));
const stylesheet = path.resolve(option("style", path.join(repo, "CanopyX.Html/Assets/canopyx.css")));
const channel = option("channel", process.env.CANOPYX_BROWSER_CHANNEL || undefined);
const label = option("label", "current");
const pauseEvery = Number(option("pause-every", "0"));
const pauseMs = Number(option("pause-ms", "700"));
const outDir = path.join(here, "..", "bench-results");
const out = path.resolve(option("out", path.join(outDir, "scroll-" + label + ".json")));

function median(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
}

async function scrollOnce(pageUrl, cpu) {
  const browser = await chromium.launch({ channel: channel, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1680, height: 950 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    if (cpu > 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    }
    await page.goto(pageUrl);
    await page.waitForSelector("[data-cx-ready]", { timeout: 120000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => {
      const grid = document.querySelector(".cx-grid");
      grid.scrollTop = 0;
      window.__frames = [];
      window.__long = [];
      window.__blank = 0;
      window.__samples = 0;
      window.__rec = true;
      const box = grid.getBoundingClientRect();
      const probes = [0.3, 0.6, 0.9].map((y) => [box.left + 80, box.top + box.height * y]);
      let pending = false;
      // Registered after the runtime's own scroll listener, so the sample runs after the runtime rendered.
      grid.addEventListener("scroll", () => {
        if (pending || !window.__rec) {
          return;
        }
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          window.__samples++;
          if (probes.some(([x, y]) => { const hit = document.elementFromPoint(x, y); return !(hit && hit.closest(".cx-row")); })) {
            window.__blank++;
          }
        });
      }, { passive: true });
      let last = performance.now();
      const frame = (ts) => {
        window.__frames.push(ts - last);
        last = ts;
        if (window.__rec) {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame((ts) => { last = ts; requestAnimationFrame(frame); });
      try {
        window.__observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push(e.duration); });
        window.__observer.observe({ type: "longtask" });
      } catch (e) {
        // Long task timing is not available everywhere.
      }
    });
    const box = await page.locator(".cx-grid").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const started = Date.now();
    const startedAt = await page.evaluate(() => performance.now());
    let steps = 0;
    for (;;) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(16);
      steps++;
      if (pauseEvery > 0 && steps % pauseEvery === 0) {
        await page.waitForTimeout(pauseMs);
      }
      if (steps % 20 === 0) {
        const done = await page.evaluate(() => { const g = document.querySelector(".cx-grid"); return g.scrollTop + g.clientHeight >= g.scrollHeight - 2; });
        if (done || Date.now() - started > 180000) {
          break;
        }
      }
    }
    const result = await page.evaluate(({ wheelSteps, startedAt }) => {
      window.__rec = false;
      const frames = window.__frames.slice(2);
      const sorted = frames.slice().sort((a, b) => a - b);
      return {
        rowsInList: document.querySelector(".cx-grid").getAttribute("aria-rowcount") - 1,
        frames: frames.length,
        over50: frames.filter((f) => f > 50).length,
        over33: frames.filter((f) => f > 33.4).length,
        p95: sorted[Math.floor(sorted.length * 0.95)] || null,
        max: sorted[sorted.length - 1] || null,
        blank: window.__blank,
        samples: window.__samples,
        longTasks: window.__long.length,
        durationMs: performance.now() - startedAt,
        wheelSteps: wheelSteps
      };
    }, { wheelSteps: steps, startedAt: startedAt });
    result.errors = errors;
    return result;
  } finally {
    await browser.close();
  }
}

fs.mkdirSync(outDir, { recursive: true });
const pageFile = path.join(outDir, "scroll-" + label + ".html");
fs.writeFileSync(pageFile, pageHtml(fs.readFileSync(runtime, "utf8"), fs.readFileSync(stylesheet, "utf8"), scrollView(5, Math.ceil(rows / 5))));
const pageUrl = pathToFileURL(pageFile).href;
const report = { label: label, pauseEvery: pauseEvery, pauseMs: pauseEvery ? pauseMs : 0, runtime: runtime, channel: channel || "chromium", at: new Date().toISOString(), machine: { cpu: os.cpus()[0].model.trim(), logicalCores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1073741824), os: os.type() + " " + os.release() }, results: {} };
for (const cpu of cpus) {
  const all = [];
  for (let run = 0; run < runs; run++) {
    const result = await scrollOnce(pageUrl, cpu);
    all.push(result);
    process.stdout.write(label + " cpu" + cpu + " run " + (run + 1) + ": frames " + result.frames + ", over 50 ms " + result.over50 + ", over 33 ms " + result.over33 + ", p95 " + (result.p95 || 0).toFixed(1) + " ms, blank " + result.blank + "/" + result.samples + (result.errors.length ? ", errors " + result.errors.join("; ") : "") + "\n");
  }
  report.results["cpu" + cpu] = {
    runs: all,
    median: {
      frames: median(all.map((r) => r.frames)),
      over50: median(all.map((r) => r.over50)),
      over33: median(all.map((r) => r.over33)),
      over50Per100Steps: median(all.map((r) => (100 * r.over50) / r.wheelSteps)),
      over33Per100Steps: median(all.map((r) => (100 * r.over33) / r.wheelSteps)),
      over50Share: median(all.map((r) => r.over50 / r.frames)),
      p95: median(all.map((r) => r.p95)),
      max: median(all.map((r) => r.max)),
      blank: median(all.map((r) => r.blank)),
      samples: median(all.map((r) => r.samples)),
      longTasks: median(all.map((r) => r.longTasks)),
      durationMs: median(all.map((r) => r.durationMs))
    }
  };
}
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("\n| CPU | Scroll time (ms) | Frames | Over 50 ms | Over 50 ms per 100 steps | Share over 50 ms | Over 33 ms | Over 33 ms per 100 steps | p95 (ms) | Max (ms) | Blank samples |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const cpu of cpus) {
  const m = report.results["cpu" + cpu].median;
  console.log("| " + cpu + "x | " + Math.round(m.durationMs) + " | " + m.frames + " | " + m.over50 + " | " + m.over50Per100Steps.toFixed(1) + " | " + (m.over50Share * 100).toFixed(1) + "% | " + m.over33 + " | " + m.over33Per100Steps.toFixed(1) + " | " + m.p95.toFixed(1) + " | " + m.max.toFixed(1) + " | " + m.blank + " of " + m.samples + " |");
}
console.log("\nWritten " + out);
