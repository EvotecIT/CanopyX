// Synthetic large-data fixtures for the load benchmark (load-benchmark.mjs): flat grids of any size, a tree of more
// than 100,000 nodes and a report page with many grids and trees, written the way CanopyX.Html writes single-file pages
// and bundles. The data is generic and deterministic, so runs on different machines compare, and it is streamed to
// disk, so a million rows never become one string in this process.
//
//   node bench/load-fixture.mjs --out <folder> [--rows 10000,100000,1000000]
//
// Page shapes:
//   single   one HTML file: the runtime, its stylesheet and the inert part payloads inline, the view and rows in the
//            fragment's configuration script.
//   bundle   index.html with the runtime and parts as files under assets/, opened from file://.
//   remote   a grid with a host source whose query() asks a local HTTP endpoint (served by the benchmark).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, "../../..");
const assets = path.join(repo, "CanopyX.Html/Assets");

/** A small linear congruential generator, so the fixture does not depend on Math.random. */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const WORDS = ["alpha", "bravo", "cedar", "delta", "ember", "fjord", "garnet", "harbor", "indigo", "juniper", "kestrel", "lumen",
  "meadow", "nectar", "onyx", "prairie", "quartz", "raven", "summit", "tundra", "umber", "violet", "willow", "xenon", "yarrow", "zephyr"];
const CATEGORIES = ["Hardware", "Software", "Service", "License", "Facility", "Vehicle", "Network", "Storage", "Printer", "Phone", "Furniture", "Other"];
const STATUSES = [["Active", "success"], ["Pending", "warning"], ["Retired", "muted"], ["Faulty", "danger"]];
const REGIONS = ["North", "South", "East", "West", "Central", "Coastal", "Highlands", "Islands"];

/** The twelve columns of the flat grid fixture: text, enum-like text with tones, dates and numbers. */
export function gridColumns() {
  return [
    { id: "name", title: "Name", kind: "text", sortable: true, rowHeader: true },
    { id: "category", title: "Category", kind: "text", sortable: true },
    { id: "status", title: "Status", kind: "text", sortable: true },
    { id: "owner", title: "Owner", kind: "text", sortable: true },
    { id: "region", title: "Region", kind: "text", sortable: true },
    { id: "created", title: "Created", kind: "datetime", sortable: true },
    { id: "modified", title: "Modified", kind: "datetime", sortable: true },
    { id: "size", title: "Size", kind: "number", sortable: true },
    { id: "count", title: "Items", kind: "number", sortable: true },
    { id: "score", title: "Score", kind: "number", sortable: true },
    { id: "version", title: "Version", kind: "text", sortable: true },
    { id: "notes", title: "Notes", kind: "text", sortable: true }
  ];
}

const pad = (value, width) => String(value).padStart(width, "0");
function isoDate(next, year) {
  return year + "-" + pad(1 + Math.floor(next() * 12), 2) + "-" + pad(1 + Math.floor(next() * 28), 2) + "T" + pad(Math.floor(next() * 24), 2) + ":" + pad(Math.floor(next() * 60), 2) + ":00Z";
}

/** Row i of a grid: the id and its cells keyed by column id, in the shape the C# writer writes. */
export function gridRow(i, next) {
  const status = STATUSES[Math.floor(next() * STATUSES.length)];
  const words = 3 + Math.floor(next() * 6), notes = [];
  for (let w = 0; w < words; w++) notes.push(WORDS[Math.floor(next() * WORDS.length)]);
  const cells = {
    name: "Item " + pad(i, 7) + " " + WORDS[i % WORDS.length],
    category: CATEGORIES[Math.floor(next() * CATEGORIES.length)],
    status: { value: status[0], tone: status[1] },
    owner: "user" + Math.floor(next() * 500),
    region: REGIONS[Math.floor(next() * REGIONS.length)],
    created: isoDate(next, 2020 + Math.floor(next() * 4)),
    modified: isoDate(next, 2024 + Math.floor(next() * 3)),
    size: Math.floor(next() * 1000000),
    count: Math.floor(next() * 5000),
    score: Math.round(next() * 10000) / 100,
    version: Math.floor(next() * 5) + "." + Math.floor(next() * 20) + "." + Math.floor(next() * 100)
  };
  if (next() >= 0.3) cells.notes = notes.join(" ");
  return { id: "r" + pad(i, 7), cells };
}

/** The grid document without its rows; rows follow as "rows":[...]. */
export function gridView(id, label, rows, extra) {
  return Object.assign({ protocol: "canopyx/2", type: "grid", id, label, rowHeight: 34, pageSize: 200, selection: "multiple", search: true,
    columns: gridColumns(), source: { kind: "inline" } }, extra || {});
}

/** JSON as the C# writer escapes it for a script element: <, > and & as \u sequences. */
export const htmlJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/** Streams text to a file with back-pressure-free synchronous writes in large blocks. */
export class Sink {
  constructor(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); this.fd = fs.openSync(file, "w"); this.buffer = []; this.size = 0; this.total = 0; }
  write(text) { this.buffer.push(text); this.size += text.length; if (this.size > 4 << 20) this.flush(); return this; }
  flush() { if (this.buffer.length) { const chunk = this.buffer.join(""); fs.writeSync(this.fd, chunk); this.total += Buffer.byteLength(chunk); this.buffer = []; this.size = 0; } }
  close() { this.flush(); fs.closeSync(this.fd); return this.total; }
}

/** Writes rows [0, count) as a JSON array of row objects, the format of the grid document's rows. */
export function writeObjectRows(sink, count, seed) {
  const next = random(seed);
  sink.write("[");
  for (let i = 0; i < count; i++) sink.write((i ? "," : "") + htmlJson(gridRow(i, next)));
  sink.write("]");
}

// ---------- compact row data (CanopyGridRowData): arrays in column order, in chunks, optionally gzip and base64 ----------
const COLUMN_IDS = gridColumns().map((column) => column.id);
/** A compact row: [id, cells in column order], without trailing empty cells. Fixture ids are already in ordinal order. */
export function compactRow(row) {
  const cells = COLUMN_IDS.map((id) => row.cells[id] ?? null);
  while (cells.length && cells[cells.length - 1] === null) cells.pop();
  return [row.id, ...cells];
}
/** Calls emit(text, index) for each chunk of rows [0, count); returns the number of chunks. */
export function writeCompactChunks(count, seed, chunkSize, gzip, emit) {
  const next = random(seed);
  let index = 0;
  for (let start = 0; start < count; start += chunkSize, index++) {
    const rows = [];
    for (let i = start; i < Math.min(count, start + chunkSize); i++) rows.push(compactRow(gridRow(i, next)));
    const json = htmlJson(rows).replace(/`/g, "\\u0060").replace(/\$\{/g, "\\u0024{");
    emit(gzip ? zlib.gzipSync(Buffer.from(json, "utf8"), { level: 6 }).toString("base64") : json, index);
  }
  return index;
}
/** The rowData descriptor that takes the place of rows in the grid document. */
export function rowData(count, chunks, gzip, base) {
  return Object.assign({ columns: COLUMN_IDS, count, ordered: true }, gzip ? { encoding: "gzip" } : {}, base ? { base } : {}, { chunks });
}
export const CHUNK_ROWS = 5000;

// ---------- runtime assets, as CanopyX.Html embeds or writes them ----------
const read = (file) => fs.readFileSync(path.join(assets, file), "utf8");
export const PARTS = JSON.parse(read("canopyx-parts.json")).parts;
export function runtimeFiles(runtime) {
  const stem = runtime === "grid" ? "canopyx-grid" : runtime === "reporting" ? "canopyx-reporting" : "canopyx";
  return { script: stem + ".js", style: stem + ".css" };
}
/** The inert payload markup of a part (CanopyHtmlPart.Markup). */
export function partMarkup(name) {
  const part = PARTS.find((item) => item.name === name);
  return (part.style ? "<script type=\"application/x-canopyx-" + name + "-style\" data-cx-version=\"" + part.version + "\">" + read(part.style) + "</script>" : "")
    + "<script type=\"application/x-canopyx-" + name + "\" data-cx-version=\"" + part.version + "\">" + read(part.script) + "</script>";
}
/** The parts a single-file fragment of a view kind carries (CanopyHtmlAssets.GetRequiredParts). */
export const viewParts = (kind) => kind === "grid" ? ["filter-editor", "export"] : ["tree-tools", "export"];

/** Opens a page as page.html does; head holds the runtime inline (single-file modes) or as files. Returns the sink, before </head>. */
export function openPage(file, title, runtime, mode, assetBase) {
  const sink = new Sink(file), files = runtimeFiles(runtime);
  sink.write("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    + "<meta name=\"color-scheme\" content=\"light\">\n<title>" + title + "</title>\n");
  if (SINGLE_FILE.includes(mode)) sink.write("<style>\n" + read(files.style) + "</style>\n<script>\n" + read(files.script) + "</script>\n");
  else sink.write("<link rel=\"stylesheet\" href=\"" + assetBase + files.style + "\">\n<script src=\"" + assetBase + files.script + "\" defer></script>\n");
  return sink;
}
/** Copies the runtime and every part beside a bundle page under their plain names. */
export function writeBundleAssets(folder, runtime) {
  fs.mkdirSync(folder, { recursive: true });
  const files = runtimeFiles(runtime);
  for (const file of [files.script, files.style, ...PARTS.flatMap((part) => [part.script, part.style].filter(Boolean))]) fs.copyFileSync(path.join(assets, file), path.join(folder, file));
}
export const hostOpen = (height, attributes) => "<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"light\"" + (attributes || "") + (height ? " style=\"height:" + height + "\"" : "") + ">";

// Single-file modes: rows as objects in the document (single), as compact chunks in scripts (compact), or gzip-compressed (gzip).
// Bundles: rows in compact sidecar files (bundle), or the older shape with objects inline and only the runtime as files (bundle-inline).
export const SINGLE_FILE = ["single", "compact", "gzip"];
/** Writes a grid's host element: the configuration and, for compact modes, its row scripts or sidecar files. */
function writeGridHost(sink, view, count, seed, mode, height, attributes, bundleFolder) {
  sink.write(hostOpen(height, attributes) + "<script type=\"application/json\" class=\"cx-config\">");
  if (mode === "single" || mode === "bundle-inline") {
    sink.write(htmlJson(view).slice(0, -1) + ",\"rows\":");
    writeObjectRows(sink, count, seed);
    sink.write("}</script>");
  } else if (mode === "bundle") {
    const base = "data/" + view.id + "/";
    fs.mkdirSync(path.join(bundleFolder, base, "rows"), { recursive: true });
    const chunks = writeCompactChunks(count, seed, CHUNK_ROWS, false, (text, index) => fs.writeFileSync(path.join(bundleFolder, base, "rows", index + ".js"),
      "(self.CanopyXSidecar = self.CanopyXSidecar || []).push([" + JSON.stringify(view.id) + ",\"rows/" + index + "\",String.raw`" + text + "`]);\n"));
    sink.write(htmlJson(Object.assign({}, view, { rowData: rowData(count, chunks, false, base) })) + "</script>");
  } else {
    const scripts = [], chunks = writeCompactChunks(count, seed, CHUNK_ROWS, mode === "gzip", (text) => scripts.push(text));
    sink.write(htmlJson(Object.assign({}, view, { rowData: rowData(count, chunks, mode === "gzip") })) + "</script>");
    for (const text of scripts) sink.write("<script type=\"application/x-canopyx-rows\">" + text + "</script>");
  }
  sink.write("</div>");
}

/** One flat grid page with n rows in one of the modes above. Returns the bytes of the page and its files. */
export function writeGridPage(folder, rows, mode) {
  const name = "grid-" + rows + "-" + mode, single = SINGLE_FILE.includes(mode), file = single ? path.join(folder, name + ".html") : path.join(folder, name, "index.html");
  if (!single) writeBundleAssets(path.join(folder, name, "assets"), "grid");
  const sink = openPage(file, "Grid of " + rows + " rows", "grid", mode, "assets/");
  sink.write("</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n");
  writeGridHost(sink, gridView("inventory", "Inventory", rows), rows, 20261015, mode, "640px", "", single ? null : path.join(folder, name));
  if (single) for (const part of viewParts("grid").concat(mode === "single" ? [] : ["data"])) sink.write(partMarkup(part));
  sink.write("\n</main>\n</body>\n</html>\n");
  return { file, bytes: sink.close() + (single ? 0 : folderBytes(path.join(folder, name)) - fs.statSync(file).size) };
}

/** The remote page: a hosted grid whose source asks POST /query on the serving origin. */
export function writeRemotePage(folder, rows) {
  const file = path.join(folder, "grid-" + rows + "-remote", "index.html");
  writeBundleAssets(path.join(folder, "grid-" + rows + "-remote", "assets"), "grid");
  const sink = openPage(file, "Remote grid of " + rows + " rows", "grid", "bundle", "assets/");
  const view = gridView("inventory", "Inventory", rows, { source: { kind: "host" } });
  // A deferred script after the runtime runs before DOMContentLoaded, so the source is configured before the mount.
  sink.write("<script src=\"remote-config.js\" defer></script>\n</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n");
  sink.write(hostOpen("640px") + "<script type=\"application/json\" class=\"cx-config\">" + htmlJson(view) + "</script></div>\n</main>\n</body>\n</html>\n");
  sink.close();
  fs.writeFileSync(path.join(folder, "grid-" + rows + "-remote", "remote-config.js"), "CanopyX.configure('inventory', { source: { query: function (q, o) {\n"
    + "  return fetch('query', { method: 'POST', body: JSON.stringify(q), signal: o.signal }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });\n} } });\n");
  return { file, bytes: fs.statSync(file).size + folderBytes(path.join(folder, "grid-" + rows + "-remote", "assets")) };
}

/** The rows of the remote grid, in memory for the mock endpoint. */
export function remoteRows(rows) {
  const next = random(20261015), all = new Array(rows);
  for (let i = 0; i < rows; i++) all[i] = gridRow(i, next);
  return all;
}

// ---------- tree ----------
const TREE_COLUMNS = [
  { id: "name", title: "Name", width: 360, kind: "text", sortable: true },
  { id: "size", title: "Size", width: 110, kind: "number", sortable: true },
  { id: "modified", title: "Modified", width: 170, kind: "datetime", sortable: true },
  { id: "owner", title: "Owner", width: 130, kind: "text" },
  { id: "type", title: "Type", width: 120, kind: "text" }
];
/** A tree of shares, folders and files: shares x folders x files nodes, plus the folders and shares. */
export function writeTreeNodes(sink, shares, folders, files) {
  const next = random(4242);
  sink.write("[");
  for (let s = 0; s < shares; s++) {
    sink.write((s ? "," : "") + "{\"id\":\"s" + s + "\",\"label\":\"Share " + WORDS[s % WORDS.length] + " " + s + "\",\"kind\":\"share\",\"children\":[");
    for (let f = 0; f < folders; f++) {
      sink.write((f ? "," : "") + "{\"id\":\"s" + s + "/f" + f + "\",\"label\":\"Folder " + WORDS[(s + f) % WORDS.length] + " " + f + "\",\"kind\":\"folder\",\"children\":[");
      for (let i = 0; i < files; i++) {
        const node = { id: "s" + s + "/f" + f + "/" + i, label: WORDS[Math.floor(next() * WORDS.length)] + " report " + i + ".xlsx", kind: "file",
          cells: { size: Math.floor(next() * 5000000), modified: isoDate(next, 2024 + Math.floor(next() * 3)), owner: "user" + Math.floor(next() * 500), type: "Workbook" } };
        sink.write((i ? "," : "") + htmlJson(node));
      }
      sink.write("]}");
    }
    sink.write("]}");
  }
  sink.write("]");
}
export function treeView(id) {
  return { protocol: "canopyx/2", type: "view", id, label: "Files", rowHeight: 28, pageSize: 500, selection: "single",
    columns: TREE_COLUMNS, search: { minLength: 2, maxResults: 50 }, source: { kind: "inline" } };
}
export function writeTreePage(folder, shares, folders, files) {
  const nodes = shares * (1 + folders * (1 + files)), file = path.join(folder, "tree-" + nodes + "-single.html");
  const sink = openPage(file, "Tree of " + nodes + " nodes", "tree", "single");
  sink.write("</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n");
  sink.write(hostOpen("640px") + "<script type=\"application/json\" class=\"cx-config\">" + htmlJson(treeView("files")).slice(0, -1) + ",\"roots\":");
  writeTreeNodes(sink, shares, folders, files);
  sink.write("}</script></div>");
  for (const part of viewParts("tree")) sink.write(partMarkup(part));
  sink.write("\n</main>\n</body>\n</html>\n");
  return { file, bytes: sink.close(), nodes };
}

// ---------- report page: many grids and trees, most hidden in tabs or below the fold ----------
/** Grid sizes of the report: 24 grids, 30,750 rows in all, like a large report with many sections. */
export const REPORT_GRIDS = [4000, 250, 750, 1500, 3000, 400, 1250, 600, 2000, 350, 1000, 450, 2500, 300, 900, 1750, 500, 1100, 3500, 200, 800, 1400, 650, 1600];
export const REPORT_TABS = 6;
/**
 * Writes the report page, one HTML file: a tab strip whose first tab shows two grids, the other five tabs hidden with
 * display:none (three or four grids each), and four grids and two trees below the fold after the tabs. mode is the row
 * format of the grids (single: objects, compact or gzip); lazy marks every host data-cx-mount="visible".
 */
export function writeReportPage(file, options) {
  const { lazy, mode } = Object.assign({ mode: "single", lazy: false }, options);
  const sink = openPage(file, "Report with many grids", "grid", mode, "assets/");
  sink.write("<style>.tabs{display:flex;gap:4px;margin:8px 0}.tabs button{padding:6px 12px}.tab{display:none}.tab.on{display:block}.cx-host{margin:0 0 16px}</style>\n");
  sink.write("<script>function showTab(n){document.querySelectorAll('.tab').forEach(function(t,i){t.classList.toggle('on',i===n);});}</script>\n");
  sink.write("</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n<h1>Report</h1><p>Summary of the sections below.</p><div class=\"tabs\">");
  for (let t = 0; t < REPORT_TABS; t++) sink.write("<button type=\"button\" onclick=\"showTab(" + t + ")\">Section " + (t + 1) + "</button>");
  sink.write("</div>");
  let grid = 0, rows = 0;
  const parts = new Set(), attributes = lazy ? " data-cx-mount=\"visible\"" : "";
  const carry = (names) => { for (const part of names) if (!parts.has(part)) { parts.add(part); sink.write(partMarkup(part)); } };
  const writeGrid = (height) => {
    const count = REPORT_GRIDS[grid];
    writeGridHost(sink, gridView("g" + grid, "Section grid " + (grid + 1), count), count, 1000 + grid, mode, height, attributes);
    carry(viewParts("grid").concat(mode === "single" ? [] : ["data"]));
    rows += count; grid++;
  };
  // 20 grids in tabs: 2 in the first, then 4, 4, 3, 4, 3.
  const perTab = [2, 4, 4, 3, 4, 3];
  for (let t = 0; t < REPORT_TABS; t++) {
    sink.write("<section class=\"tab" + (t === 0 ? " on" : "") + "\">");
    for (let g = 0; g < perTab[t]; g++) writeGrid("420px");
    sink.write("</section>");
  }
  sink.write("<div style=\"height:1600px\"><p>Further notes push the remaining sections below the fold.</p></div>");
  while (grid < REPORT_GRIDS.length) writeGrid("420px");
  for (let t = 0; t < 2; t++) {
    sink.write(hostOpen("420px", attributes) + "<script type=\"application/json\" class=\"cx-config\">" + htmlJson(treeView("t" + t)).slice(0, -1) + ",\"roots\":");
    writeTreeNodes(sink, 3, 20, 40);
    sink.write("}</script></div>");
    carry(viewParts("tree"));
  }
  sink.write("\n</main>\n</body>\n</html>\n");
  return { file, bytes: sink.close(), grids: REPORT_GRIDS.length, trees: 2, rows: rows + 2 * 3 * (1 + 20 * 41) };
}
export function folderBytes(folder) {
  let total = 0;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    total += entry.isDirectory() ? folderBytes(full) : fs.statSync(full).size;
  }
  return total;
}

// Command line: writes the fixtures into --out. --modes picks the grid page shapes (default: every current one; the
// baseline of docs/large-data.md used single,bundle-inline,remote), --reports the report pages (single, lazy, lazy-compact).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1]; };
  const out = path.resolve(option("out", path.join(here, "..", "bench-results", "load")));
  const modes = option("modes", "single,compact,gzip,bundle,remote").split(",");
  for (const rows of option("rows", "10000,100000,1000000").split(",").map(Number)) {
    for (const mode of modes) console.log(JSON.stringify(mode === "remote" ? writeRemotePage(out, rows) : writeGridPage(out, rows, mode)));
  }
  if (option("tree", "yes") === "yes") console.log(JSON.stringify(writeTreePage(out, 10, 100, 100)));
  for (const report of option("reports", "single,lazy,lazy-compact").split(",").filter(Boolean)) {
    console.log(JSON.stringify(writeReportPage(path.join(out, "report-" + report + ".html"), { lazy: report.startsWith("lazy"), mode: report.endsWith("compact") ? "compact" : "single" })));
  }
}