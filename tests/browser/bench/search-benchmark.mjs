// Cold sidecar-search latency and shard requests for the current batching path versus the same runtime with its
// original all-shards-at-once loading loop. Both variants share parsing, validation, matching, ranking and LRU code.
//   node bench/search-benchmark.mjs --pairs 5 --channel msedge --out ../../artifacts/takeover/search-benchmark.json
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
const pairs = Number(option("pairs", "5"));
const channel = option("channel", process.env.CANOPYX_BROWSER_CHANNEL || undefined);
const out = path.resolve(option("out", path.join(here, "..", "bench-results", "search-benchmark.json")));
const runtimePath = path.resolve(option("runtime", path.join(repo, "CanopyX.Html/Assets/canopyx.js")));
const current = fs.readFileSync(runtimePath, "utf8");
const start = current.indexOf("        let stopped = false;\n");
const endMarker = "        return ranked;\n";
const end = current.indexOf(endMarker, start) + endMarker.length;
if (start < 0 || end < endMarker.length || current.indexOf("        let stopped = false;\n", start + 1) >= 0) {
  throw new Error("Expected exactly one batched sidecar-search loop in the selected runtime.");
}
const unbatched = current.slice(0, start) + `        const loaded = await Promise.all(order.map(loadShard));
        for (const shard of loaded) {
          for (const item of shard) {
            const pathKey = JSON.stringify(item.entry.path);
            if (!seen.has(pathKey) && matchesWords(item.words, queryWords)) {
              seen.add(pathKey);
              hits.push(item.entry);
            }
          }
        }
        return rankHits(hits, query, limit);
` + current.slice(end);

const keys = ["ab", ...Array.from({ length: 31 }, (_, i) => "ab." + (i + 2))];
const manifest = { protocol: "canopyx/1", type: "manifest", view: "search-bench", root: "r/0",
  nodeCount: keys.length * 100, pageSize: 100, search: { shards: Object.fromEntries(keys.map(key => [key, 100])) } };
const docs = Object.fromEntries(["dense", "sparse"].map(scenario => [scenario,
  Object.fromEntries(keys.map((key, index) => [key, { protocol: "canopyx/1", type: "searchShard", key,
    entries: Array.from({ length: 100 }, (_, n) => ({ path: [`n${index}-${n}`], label: scenario === "dense" || index === keys.length - 1
      ? `ab xx item ${index}-${n}` : `ab other item ${index}-${n}` })) }]))]));
const median = values => values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
const browser = await chromium.launch({ channel, headless: true });
const results = [];
try {
  for (const cpu of [1, 4]) for (const scenario of ["dense", "sparse"]) for (let pair = 0; pair < pairs; pair++) {
    for (const strategy of pair % 2 ? ["batch", "all"] : ["all", "batch"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      let requests = 0;
      await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body:
        "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>" + (strategy === "all" ? unbatched : current) + "</script></body></html>" }));
      await page.route("https://canopyx.test/data/**", route => {
        requests++;
        const ref = new URL(route.request().url()).pathname.slice("/data/".length, -3);
        const doc = ref === "manifest" ? manifest : docs[scenario][ref.slice(2)];
        if (!doc) throw new Error("Unexpected sidecar reference: " + ref);
        return route.fulfill({ contentType: "application/javascript", body:
          `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify(["search-bench", ref, doc])});` });
      });
      const cdp = await context.newCDPSession(page);
      if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      await page.goto("https://canopyx.test/");
      const value = await page.evaluate(async query => {
        const source = CanopyX.sources.sidecar({ id: "search-bench", source: { kind: "sidecar", base: "/data/" } });
        const start = performance.now();
        const result = await source.search(query, 20);
        return { ms: performance.now() - start, hits: result.hits.length, truncated: result.truncated };
      }, scenario === "dense" ? "ab" : "ab xx");
      if (errors.length || value.hits !== 20) throw new Error(JSON.stringify({ errors, value, cpu, scenario, strategy }));
      results.push({ cpu, scenario, pair, strategy, requests, ...value });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const summary = Object.fromEntries([1, 4].flatMap(cpu => ["dense", "sparse"].map(scenario => [
  `${cpu}x-${scenario}`, Object.fromEntries(["all", "batch"].map(strategy => {
    const values = results.filter(r => r.cpu === cpu && r.scenario === scenario && r.strategy === strategy);
    return [strategy, { medianMs: median(values.map(r => r.ms)), medianRequests: median(values.map(r => r.requests)) }];
  }))
])));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ runtimePath, strategy: "Same runtime; only sidecar loading loop changed for the all-shards baseline.",
  pairs, channel, results, summary }, null, 2));
console.log(JSON.stringify(summary, null, 2));
