// Search benchmark over written bundles, opened from disk like a report on a file share. For each scenario it reports
// the size of the search index next to the pages, and the time from running a query to a painted, expanded hit:
//   cold  the first query on a fresh page: index files and the pages on the hit's path load from disk
//   warm  the same query and hit again on that page: everything it needs is already loaded
// plus the files and bytes the cold query loaded and the heap the page retains after it.
//
//   dotnet run --project CanopyX.Examples -c Release                      (the examples: bundle/)
//   dotnet run --project CanopyX.Examples -c Release -- --search-bench    (the benchmark bundles: deep/ and directory/)
//   dotnet run --project CanopyX.Examples -c Release -- --pack-bench      (the packed catalog: catalog/, 380,000 rows)
//   node bench/search-benchmark.mjs --runs 5 --cpu 1,4
//
// Options: --examples <folder>, --bench <folder>, and --pack <folder> point at other outputs (for a before/after comparison),
// --channel msedge uses an installed browser, --out <file> writes the raw samples as JSON.
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
const examples = path.resolve(option("examples", path.join(repo, "CanopyX.Examples/bin/Release/net10.0/output")));
const bench = path.resolve(option("bench", path.join(repo, "CanopyX.Examples/bin/Release/net10.0/search-bench")));
const pack = path.resolve(option("pack", path.join(repo, "CanopyX.Examples/bin/Release/net10.0/pack-bench")));
const out = option("out", null);

const scenarios = [
  { name: "examples: quarterly review", page: path.join(examples, "bundle/index.html"), query: "quarterly review" },
  { name: "deep: quarterly report 17", page: path.join(bench, "deep/index.html"), query: "quarterly report 17" },
  { name: "directory: firewall policy 0022", page: path.join(bench, "directory/index.html"), query: "firewall policy 0022" },
  { name: "directory: workstations", page: path.join(bench, "directory/index.html"), query: "workstations" },
  // The packed catalog: services by product and tier (spread over the tree), releases, and people in access lists.
  { name: "catalog: identity gateway", page: path.join(pack, "catalog/index.html"), query: "identity gateway" },
  { name: "catalog: release 3 security", page: path.join(pack, "catalog/index.html"), query: "release 3 security" },
  { name: "catalog: dana.levi", page: path.join(pack, "catalog/index.html"), query: "dana.levi" }
];

const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

/** Total size and file count of the folders under a bundle's data folder, split into index and pages. */
function bundleSize(page) {
  const data = path.join(path.dirname(page), "data");
  const result = { indexBytes: 0, indexFiles: 0, pageBytes: 0, pageFiles: 0 };
  for (const view of fs.readdirSync(data, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const folder of fs.readdirSync(path.join(data, view.name), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const index = folder.name === "s" || folder.name === "e" || folder.name === "q";
      for (const file of fs.readdirSync(path.join(data, view.name, folder.name), { recursive: true, withFileTypes: true })) {
        if (file.isFile()) {
          result[index ? "indexBytes" : "pageBytes"] += fs.statSync(path.join(file.parentPath, file.name)).size;
          result[index ? "indexFiles" : "pageFiles"]++;
        }
      }
    }
  }
  return result;
}

/** Runs a query and expands the tree to its last hit; returns the milliseconds until the next painted frame. */
function searchToExpandedHit(page, query) {
  return page.evaluate(async (query) => {
    const api = document.querySelector(".cx-host").canopyx;
    const started = performance.now();
    const result = await api.search(query);
    const searched = performance.now();
    if (!result.hits.length) throw new Error("No hits for '" + query + "'.");
    const node = await api.expandPath(result.hits[result.hits.length - 1].path);
    if (!node) throw new Error("The last hit for '" + query + "' did not expand.");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ms: performance.now() - started, searchMs: searched - started, hits: result.hits.length, total: result.total };
  }, query);
}

async function heapBytes(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize;
}

const browser = await chromium.launch({ channel, headless: true });
const samples = [];
try {
  for (const scenario of scenarios) {
    if (!fs.existsSync(scenario.page)) {
      console.log(scenario.name + ": skipped, " + scenario.page + " is missing");
      continue;
    }
    const size = bundleSize(scenario.page);
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
        await page.goto(pathToFileURL(scenario.page).href);
        await page.waitForSelector("[data-cx-ready]");
        const cdp = await context.newCDPSession(page);
        const heapBefore = await heapBytes(cdp);
        if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        loaded.length = 0;
        const cold = await searchToExpandedHit(page, scenario.query);
        const coldFiles = loaded.length;
        const coldBytes = loaded.reduce((sum, bytes) => sum + bytes, 0);
        const warm = await searchToExpandedHit(page, scenario.query);
        if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        const heapAfter = await heapBytes(cdp);
        if (errors.length) throw new Error(scenario.name + ": " + errors.join("; "));
        samples.push({ scenario: scenario.name, cpu, run, ...size, coldMs: cold.ms, coldSearchMs: cold.searchMs, warmMs: warm.ms, warmSearchMs: warm.searchMs,
          coldFiles, coldBytes, heapBytes: heapAfter - heapBefore, hits: cold.hits, total: cold.total });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const mb = (bytes) => (bytes / 1048576).toFixed(1) + " MB";
const kb = (bytes) => Math.round(bytes / 1024) + " KB";
const rows = [];
for (const scenario of scenarios) {
  for (const cpu of cpus) {
    const group = samples.filter((sample) => sample.scenario === scenario.name && sample.cpu === cpu);
    if (!group.length) continue;
    const of = (key) => median(group.map((sample) => sample[key]));
    rows.push({
      scenario: scenario.name, cpu: cpu + "x",
      index: mb(group[0].indexBytes) + " / " + group[0].indexFiles + " files", pages: mb(group[0].pageBytes) + " / " + group[0].pageFiles + " files",
      "cold ms": of("coldMs").toFixed(1), "cold search ms": of("coldSearchMs").toFixed(1), "warm ms": of("warmMs").toFixed(1), "warm search ms": of("warmSearchMs").toFixed(1),
      "cold load": of("coldFiles") + " files / " + kb(of("coldBytes")), "heap": kb(of("heapBytes")), hits: group[0].hits + " of " + (group[0].total == null ? "many" : group[0].total)
    });
  }
}
console.table(rows);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify({ runs, cpus, channel, examples, bench, rows, samples }, null, 2));
}
