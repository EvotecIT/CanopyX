// Before/after table of two load-benchmark.mjs reports. Each case of the second report is compared with the case of the
// first that delivered the same data before: a compact, compressed or bundled grid with the single-file grid of row objects
// of the same size (a bundle with the bundle of the first report when it has one), a report page with report-single.
//
//   node bench/load-compare.mjs before.json after.json [--cpu 4] [--metrics firstRowsMs,interactiveMs,...]
import fs from "node:fs";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
const [beforeFile, afterFile] = args.filter((arg, i) => !arg.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
const before = JSON.parse(fs.readFileSync(beforeFile, "utf8")), after = JSON.parse(fs.readFileSync(afterFile, "utf8"));
const cpus = option("cpu", "1,4").split(",");
const metrics = option("metrics", "htmlBytes,firstRowsMs,interactiveMs,allRowsMs,longestTaskMs,heapLoadMB,sortMs,searchMs").split(",");
const titles = { htmlBytes: "Size", firstRowsMs: "First rows", interactiveMs: "Interactive", allRowsMs: "All rows decoded", parseMs: "Parse", longTasks: "Long tasks", longestTaskMs: "Longest task",
  heapLoadMB: "Heap", heapScrollMB: "Heap after scroll", heapSearchMB: "Heap after search", sortMs: "First sort", searchMs: "First search", tabMs: "Open tab", belowMs: "Below fold", mountedHosts: "Mounted" };

function previous(name) {
  if (before.cases[name]) return name;
  const grid = /^grid-(\d+)-/.exec(name);
  if (grid) return "grid-" + grid[1] + "-single";
  if (name.startsWith("report-")) return "report-single";
  return null;
}
const format = (metric, value) => value == null ? "-" : metric === "htmlBytes" ? (value / 1048576).toFixed(1) + " MB" : metric.endsWith("MB") ? Math.round(value) + " MB" :
  metric === "mountedHosts" || metric === "longTasks" ? String(Math.round(value)) : Math.round(value) + " ms";
// Row objects are complete when the first rows paint, so their "all rows" time is the first-rows time; hosted grids never hold all rows.
function value(entry, cpu, metric, name) {
  if (metric === "htmlBytes") return entry.htmlBytes;
  const median = entry.results["cpu" + cpu]?.median;
  if (!median || median.failed === median.runs) return null;
  return metric === "allRowsMs" && median.allRowsMs == null ? (/remote|tree|report/.test(name) ? null : median.firstRowsMs) : median[metric];
}

for (const cpu of cpus) {
  console.log("\n#### " + cpu + "x CPU\n");
  console.log("| Case | Compared with | " + metrics.map((metric) => titles[metric] || metric).join(" | ") + " |");
  console.log("| --- | --- | " + metrics.map(() => "---").join(" | ") + " |");
  for (const [name, entry] of Object.entries(after.cases)) {
    const base = previous(name), old = base && before.cases[base];
    const failed = (item) => item && item.results["cpu" + cpu] && item.results["cpu" + cpu].median.failed === item.results["cpu" + cpu].median.runs;
    const cells = metrics.map((metric) => {
      const now = value(entry, cpu, metric, name), was = old ? value(old, cpu, metric, base) : null;
      if (failed(entry)) return "failed";
      return (old ? (failed(old) ? "failed" : format(metric, was)) + " → " : "") + format(metric, now);
    });
    console.log("| " + name + " | " + (base || "-") + " | " + cells.join(" | ") + " |");
  }
}
