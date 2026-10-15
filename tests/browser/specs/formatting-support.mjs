// Pages for the conditional formatting tests: a grid view mounted on the grid or reporting runtime with every part it can
// load preloaded (the formatting part and the rule editor among them), served by the test through page.route.
import fs from "node:fs";
import path from "node:path";
import { repo, runtimeAssets } from "./support.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
export const read = name => fs.readFileSync(path.join(assets, name), "utf8");

export function formattingPage(view, { theme = "light", script = "" } = {}) {
  const base = runtimeAssets(view.reporting ? "reporting" : "grid");
  const style = base.style + "\n" + read("canopyx-formatting.css") + "\n" + read("canopyx-format-editor.css");
  const parts = read("canopyx-formatting.js") + "\n" + read("canopyx-format-editor.js");
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Formatting test</title><style>" +
    style + "body{margin:0}main{padding:12px 16px}</style><script>" + base.script + "\n" + parts + "</script>" + (script ? "<script>" + script + "</script>" : "") +
    "</head><body class=\"cx-page\"><main><h1 style=\"font:600 18px system-ui;margin:0 0 8px\">" + view.label + "</h1><div class=\"cx-host\" data-canopyx-host data-cx-theme=\"" + theme +
    "\" style=\"height:560px\"><script type=\"application/json\" class=\"cx-config\">" + json + "</script></div></main></body></html>";
}

/** The generic server health grid of the example: status, CPU, memory, latency, last check-in and region. */
export function healthView(count = 40, extra = {}) {
  const statuses = ["Healthy", "Healthy", "Healthy", "Degraded", "Healthy", "Down", "Healthy", "Maintenance"];
  const regions = ["North", "South", "East", "West"];
  const rows = Array.from({ length: count }, (_, i) => ({ id: "srv-" + String(i).padStart(5, "0"), cells: {
    name: "server-" + String(i).padStart(3, "0"), status: statuses[i % statuses.length], cpu: (i * 37) % 101, memory: (i * 53) % 97 + 2,
    latency: 12 + (i * 29) % 480, checked: new Date(Date.UTC(2026, 9, 15, 12) - ((i * 7) % 30) * 3600000 * 24).toISOString(), region: regions[i % regions.length] } }));
  return { protocol: "canopyx/2", type: "grid", id: "health", label: "Server health", pageSize: 200, selection: "multiple", search: true, rowHeight: 34,
    columns: [{ id: "name", title: "Server", kind: "text", sortable: true, width: 160 }, { id: "status", title: "Status", kind: "text", sortable: true, width: 150 },
      { id: "cpu", title: "CPU %", kind: "number", sortable: true, width: 150 }, { id: "memory", title: "Memory %", kind: "number", sortable: true, width: 120 },
      { id: "latency", title: "Latency (ms)", kind: "number", sortable: true, width: 140 }, { id: "checked", title: "Last check-in", kind: "datetime", sortable: true, width: 190 },
      { id: "region", title: "Region", kind: "text", sortable: true, width: 110 }],
    source: { kind: "inline" }, rows,
    formatting: { legend: true, editor: true },
    formatRules: [
      { id: "down", label: "Server down", description: "Server is down", target: "row", when: { operator: "and", filters: [{ column: "status", operator: "eq", values: ["Down"] }] }, style: { tone: "danger" } },
      { id: "degraded", label: "Degraded", column: "status", when: { operator: "or", filters: [{ column: "status", operator: "in", values: ["Degraded", "Maintenance"] }] }, style: { tone: "warning" } },
      { id: "cpu", label: "CPU load", column: "cpu", style: { bar: { minimum: 0, maximum: 100, tone: "info" } } },
      { id: "cpu-hot", label: "CPU above 90%", column: "cpu", when: { operator: "and", filters: [{ column: "cpu", operator: "gt", values: [90] }] }, style: { tone: "danger", emphasis: "text", icon: "up" } },
      { id: "latency", label: "Latency", column: "latency", style: { scale: { stops: [{ type: "min", tone: "success" }, { type: "percent", value: 50, tone: "warning" }, { type: "max", tone: "danger" }] } } },
      { id: "stale", label: "No check-in for 14 days", column: "checked", when: { operator: "and", filters: [{ column: "checked", operator: "lt", values: ["2026-10-01T12:00:00Z"] }] }, style: { tone: "muted", cue: "stale" } }
    ], ...extra };
}
