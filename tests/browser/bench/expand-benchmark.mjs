// Expand benchmark over the packing benchmark bundle (CanopyX.Examples --pack-bench), opened from disk like a report
// on a file share. It reports the size of the bundle, and for a fresh page: the time to the first painted rows and
// the time from asking for a node's children to a painted frame, with the data files and bytes each step loaded.
//   first rows       navigation to the first painted row (manifest and the first top-level page)
//   open region      the first page of a long child list (1,000 services)
//   open service     one service: its five sections
//   open section     its releases
//   open release     the detail table of one release
//   deep service     a service far down the long list, reached by path like a deep link or a search hit
// Every step after the first is cold: nothing it needs was loaded before, unless the bundle packs it next to data an
// earlier step already read.
//
//   dotnet run --project CanopyX.Examples -c Release -- --pack-bench
//   node bench/expand-benchmark.mjs --runs 5 --cpu 1,4
//
// Options: --bundle <folder> points at another bundle folder (for a before/after comparison), --channel msedge uses
// an installed browser, --out <file> writes the raw samples as JSON.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
const runs = Number(option("runs", "5"));
const cpus = option("cpu", "1,4").split(",").map(Number);
const channel = option("channel", process.env.CANOPYX_BROWSER_CHANNEL || undefined);
const bundle = path.resolve(option("bundle", path.join(repo, "CanopyX.Examples/bin/Release/net10.0/pack-bench/catalog")));
const out = option("out", null);
const pageFile = path.join(bundle, "index.html");

const steps = [
  { name: "open region", path: ["region-1"] },
  { name: "open service", path: ["region-1", "svc-1-0003"] },
  { name: "open section", path: ["region-1", "svc-1-0003", "svc-1-0003/releases"] },
  { name: "open release", path: ["region-1", "svc-1-0003", "svc-1-0003/releases", "svc-1-0003/releases/2"] },
  { name: "deep service", path: ["region-3", "svc-3-0870"] }
];

const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

/** File count and bytes of a bundle's data folder, split into the search index and the pages. */
function bundleSize() {
  const data = path.join(bundle, "data");
  const result = { files: 0, bytes: 0, indexFiles: 0, indexBytes: 0 };
  for (const file of fs.readdirSync(data, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const size = fs.statSync(path.join(file.parentPath, file.name)).size;
    const folder = path.relative(data, file.parentPath).split(path.sep)[1];
    result.files++;
    result.bytes += size;
    if (folder === "s" || folder === "e") {
      result.indexFiles++;
      result.indexBytes += size;
    }
  }
  return result;
}

if (!fs.existsSync(pageFile)) {
  throw new Error("Bundle page missing: " + pageFile + ". Run CanopyX.Examples --pack-bench, or pass --bundle.");
}

const size = bundleSize();
const browser = await chromium.launch({ channel, headless: true });
const samples = [];
try {
  for (const cpu of cpus) {
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const loaded = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/data/") && url.endsWith(".js")) {
          const file = fileURLToPath(url);
          loaded.push(fs.existsSync(file) ? fs.statSync(file).size : 0);
        }
      });
      const cdp = await context.newCDPSession(page);
      if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      const started = Date.now();
      await page.goto(pathToFileURL(pageFile).href);
      await page.waitForSelector(".cx-row[data-cx-id]");
      const sample = { cpu, run, "first rows": { ms: Date.now() - started, files: loaded.length, bytes: loaded.reduce((sum, bytes) => sum + bytes, 0) } };
      await page.waitForSelector("[data-cx-ready]");
      for (const step of steps) {
        loaded.length = 0;
        const ms = await page.evaluate(async (ids) => {
          const api = document.querySelector(".cx-host").canopyx;
          const begin = performance.now();
          const node = await api.expandPath(ids, { expandLast: true, select: false, focus: false });
          if (!node) throw new Error("The path did not expand: " + ids.join(" > "));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return performance.now() - begin;
        }, step.path);
        sample[step.name] = { ms, files: loaded.length, bytes: loaded.reduce((sum, bytes) => sum + bytes, 0) };
      }
      if (errors.length) throw new Error(errors.join("; "));
      samples.push(sample);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log("bundle: " + size.files + " files, " + (size.bytes / 1048576).toFixed(1) + " MB (search index " + size.indexFiles + " files, " + (size.indexBytes / 1048576).toFixed(1) + " MB)");
const rows = [];
for (const name of ["first rows"].concat(steps.map((step) => step.name))) {
  const row = { step: name };
  for (const cpu of cpus) {
    const group = samples.filter((sample) => sample.cpu === cpu);
    row[cpu + "x ms"] = median(group.map((sample) => sample[name].ms)).toFixed(1);
    row.load = median(group.map((sample) => sample[name].files)) + " files / " + Math.round(median(group.map((sample) => sample[name].bytes)) / 1024) + " KB";
  }
  rows.push(row);
}
console.table(rows);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify({ runs, cpus, channel, bundle, size, rows, samples }, null, 2));
}
