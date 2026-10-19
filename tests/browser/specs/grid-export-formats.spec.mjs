import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { viewPage, nextFrames, runtimeAssets, openGridControl, openExample, repo } from "./support.mjs";

// Export format providers: registered writers listed in the grid's own Export menu, with its scope picker, progress,
// cancellation and error status, and tree grid captures for the same writers.
const api = "document.querySelector('[data-canopyx-host]').canopyx";
const rows = Array.from({ length: 80 }, (_, i) => ({ id: String(i).padStart(3, "0"),
  cells: { name: i % 2 ? "Archive" : "Source", size: { value: i, text: i + " KiB" }, kind: i % 3 ? "file" : "folder" } }));
const definition = (extra = {}) => ({ protocol: "canopyx/2", type: "grid", id: "records", label: "Records", source: { kind: "inline" },
  rowHeight: 28, pageSize: 20, selection: "multiple", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 180, sortable: true }, { id: "size", title: "Size", kind: "number", width: 100, sortable: true },
    { id: "kind", title: "Kind", kind: "text", width: 100, sortable: true }], rows, ...extra });
// Each fake writer reads the whole capture, as an XLSX or PDF writer would, and records what it received.
const fakeFormats = `window.writes=[];window.errors=[];
window.fakeFormat=(id,label,extension,mime)=>({id,label,extension,mime,async write(capture,context){const rows=[];
  for await(const row of capture.rows())rows.push(row);context.progress(rows.length);
  window.writes.push({id,fileName:context.fileName,format:context.format,request:JSON.parse(JSON.stringify(capture.request)),rows:rows.map(row=>row.id),
    first:rows[0]&&JSON.parse(JSON.stringify(rows[0]))});
  return new Blob([id+':'+rows.map(row=>row.id).join(',')],{type:mime});}});
CanopyX.registerExportFormat(fakeFormat('xlsx','Download Excel','xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
CanopyX.registerExportFormat(fakeFormat('pdf','Download PDF','pdf','application/pdf'));`;

async function open(page, view = definition(), setup = "", runtime) {
  let html = viewPage(view);
  if (runtime) html = html.replace(/<script>[\s\S]*?<\/script>/, () => "<script>" + runtimeAssets(runtime).script + "</script>");
  await page.route("http://canopyx.test/formats", route => route.fulfill({ contentType: "text/html", body: html.replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/formats"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
const menuButtons = page => page.locator(".cx-grid-export .cx-grid-panel button:not([hidden])");

for (const reporting of [false, true]) test("format providers join the " + (reporting ? "reporting" : "ordinary") + " Export menu and respect each scope, sort, order and visibility", async ({ page }) => {
  await open(page, definition(reporting ? { reporting: {} } : {}), fakeFormats + "CanopyX.configure('records',{onError:event=>window.errors.push(event.error.message)});");
  await page.evaluate(async api => { const grid = eval(api);
    grid.setColumnOrder(["size", "name", "kind"]); grid.setColumnVisible("kind", false);
    await grid.setQuery({ search: "Archive", sort: [{ column: "size", direction: "desc" }] }); grid.setSelection(["003", "010", "079"]); }, api);
  await openGridControl(page, "export");
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download Excel", "Download PDF", "Copy"]);
  const expected = {
    filtered: Array.from({ length: 40 }, (_, i) => String(79 - 2 * i).padStart(3, "0")),
    selected: ["079", "010", "003"],
    all: Array.from({ length: 80 }, (_, i) => String(79 - i).padStart(3, "0"))
  };
  for (const scope of ["filtered", "selected", "all"]) {
    await page.locator(".cx-grid-export").getByRole("combobox").selectOption(scope);
    for (const [label, id] of [["Download Excel", "xlsx"], ["Download PDF", "pdf"]]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: label, exact: true }).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe((reporting ? "canopyx-records." : "records.") + id);
      expect(fs.readFileSync(await file.path(), "utf8")).toBe(id + ":" + expected[scope].join(","));
      const write = await page.evaluate(() => window.writes.at(-1));
      expect(write.id).toBe(id); expect(write.format).toBe(id); expect(write.request.scope).toBe(scope);
      expect(write.request.columns.map(column => column.id)).toEqual(["size", "name"]);
      expect(write.request.query.sort).toEqual([{ column: "size", direction: "desc" }]);
      expect(write.request.recordCount).toBe(expected[scope].length);
      expect(write.rows).toEqual(expected[scope]);
      expect(Object.keys(write.first.cells)).toEqual(["size", "name"]);
      expect(write.first.cells.size.value).toBe(Number(expected[scope][0]));
      expect(write.first.cells.size.text).toBe(Number(expected[scope][0]) + " KiB");
    }
  }
  await expect(page.locator(".cx-grid-delivery-status")).toHaveText("");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("a slow provider shows progress, can be cancelled from the menu, and is not bound by the request deadline", async ({ page }) => {
  // The export timeout outlasts every assertion made while the slow writer runs, in the slowest engine and under full-suite
  // load as well (4 s; the grid-wide timeout check below waits for it once).
  await open(page, definition(), `window.errors=[];CanopyX.registerExportFormat({id:'slow',label:'Download slow',extension:'bin',async write(capture,{signal,progress}){
    let count=0;for await(const row of capture.rows())count++;progress(count);window.slowStarted=true;
    await new Promise((resolve,reject)=>{window.release=resolve;signal.addEventListener('abort',()=>{window.slowAborted=signal.reason&&signal.reason.name;reject(signal.reason);});});
    return new Blob(['done']);}});
    CanopyX.registerExportFormat({id:'deaf',label:'Download deaf',extension:'bin',write:()=>new Promise(()=>{})});
    CanopyX.configure('records',{requestTimeoutMs:50,exportTimeoutMs:4000,onExport:()=>new Promise(resolve=>setTimeout(resolve,200)),onError:event=>window.errors.push(event.error.message)});`);
  await openGridControl(page, "export");
  const panel = page.locator(".cx-grid-export .cx-grid-panel");
  await page.getByRole("button", { name: "Download slow", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.slowStarted)).toBe(true);
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText("80 of 80 records");
  await expect(panel.locator("progress")).toBeVisible();
  expect(await panel.locator("progress").evaluate(meter => [meter.value, meter.max])).toEqual([80, 80]);
  await expect(panel.getByRole("combobox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeDisabled();
  // Longer than the 50 ms request deadline: the writer has its own safety timeout.
  await page.waitForTimeout(250);
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText("80 of 80 records");
  await page.getByRole("button", { name: "Cancel export", exact: true }).click();
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText("Export cancelled");
  expect(await page.evaluate(() => window.slowAborted)).toBe("AbortError");
  await expect(panel.locator("progress")).toBeHidden(); await expect(page.getByRole("button", { name: "Cancel export", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Download slow", exact: true })).toBeEnabled();
  // A writer that ignores its signal still settles when cancelled.
  await page.getByRole("button", { name: "Download deaf", exact: true }).click();
  await page.getByRole("button", { name: "Cancel export", exact: true }).click();
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText("Export cancelled");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
  // The safety timeout is configurable per call (and per grid with exportTimeoutMs).
  const timing = await page.evaluate(async api => { const grid = eval(api);
    const started = performance.now(), slow = grid.exportAs("slow", { scope: "all", download: false });
    await new Promise(resolve => setTimeout(resolve, 120)); window.release(); const result = await slow;
    const timedOut = await grid.exportAs("deaf", { scope: "all", timeoutMs: 80 }).then(() => null, error => error.message);
    const invalid = await grid.exportAs("deaf", { scope: "all", timeoutMs: 0 }).then(() => null, error => error.message);
    const gridTimeout = await grid.exportAs("deaf", { scope: "all" }).then(() => null, error => error.message);
    // The host export hook is a writer too: 200 ms outlasts the 50 ms request deadline, not the export timeout.
    const hosted = await grid.exportToHost("xlsx", { scope: "all" }).then(() => "done", error => error.message);
    const hostedTimeout = await grid.exportToHost("xlsx", { scope: "all", timeoutMs: 100 }).then(() => null, error => error.message);
    return { size: result.blob.size, name: result.fileName, elapsed: performance.now() - started, timedOut, invalid, gridTimeout, hosted, hostedTimeout }; }, api);
  expect(timing.size).toBe(4); expect(timing.name).toBe("records.bin"); expect(timing.elapsed).toBeGreaterThan(100);
  expect(timing.timedOut).toBe("CanopyX: export timed out.");
  expect(timing.invalid).toBe("CanopyX: invalid export timeout.");
  expect(timing.gridTimeout).toBe("CanopyX: export timed out."); expect(timing.hosted).toBe("done");
  expect(timing.hostedTimeout).toBe("CanopyX: operation timed out.");
});

test("a provider failure surfaces in the menu status and the error event without leaving the menu busy", async ({ page }) => {
  await open(page, definition({ reporting: {} }), `window.errors=[];
    CanopyX.registerExportFormat({id:'broken',label:'Download broken',extension:'xlsx',write:async capture=>{for await(const row of capture.rows())break;throw new Error('Workbook writer failed.');}});
    CanopyX.registerExportFormat({id:'empty',label:'Download empty',extension:'pdf',write:()=>'not a blob'});
    CanopyX.registerExportFormat({id:'weird',label:'Download weird',extension:'pdf',write:()=>Promise.reject(undefined)});
    CanopyX.registerExportFormat({id:'odd',label:'Download odd',extension:'txt',async write(capture,{progress}){for await(const row of capture.rows());progress();progress(-1);progress(1.5);progress('7');progress(500);
      for await(const row of capture.rows());progress(3);return new Uint8Array([111,107]);}});
    CanopyX.configure('records',{onError:event=>window.errors.push(event.error.message)});`);
  await openGridControl(page, "export");
  const status = page.locator(".cx-grid-export .cx-grid-delivery-status");
  await page.getByRole("button", { name: "Download broken", exact: true }).click();
  await expect(status).toHaveText("Workbook writer failed.");
  await expect(page.getByRole("button", { name: "Download broken", exact: true })).toBeEnabled();
  await expect(page.locator(".cx-grid-export progress")).toBeHidden();
  await page.getByRole("button", { name: "Download empty", exact: true }).click();
  await expect(status).toHaveText("CanopyX: export format 'empty' must write a Blob.");
  await page.getByRole("button", { name: "Download weird", exact: true }).click();
  await expect(status).toHaveText("CanopyX: export format 'weird' failed: undefined");
  expect(await page.evaluate(() => window.errors)).toEqual(["Workbook writer failed.", "CanopyX: export format 'empty' must write a Blob.", "CanopyX: export format 'weird' failed: undefined"]);
  // Progress only advances, with record counts; bytes become a Blob of the format's type.
  const odd = await page.evaluate(async api => { const seen = [];
    const result = await eval(api).exportAs("odd", { scope: "filtered", download: false, onProgress: progress => seen.push(progress.phase + ":" + progress.completed + "/" + progress.total) });
    return { seen, text: await result.blob.text(), type: result.blob.type }; }, api);
  expect(odd.seen).toEqual(["reading:0/80", "generating:80/80", "ready:80/80"]);
  expect(odd.text).toBe("ok"); expect(odd.type).toBe("application/octet-stream");
  // CSV keeps working after a failed provider.
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("canopyx-records.csv"); await expect(status).toHaveText("");
});

test("formats register globally, per grid and as declared view IDs, and invalid formats are rejected", async ({ page }) => {
  await open(page, definition({ exportFormats: ["pdf", "missing"] }), fakeFormats);
  await openGridControl(page, "export");
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download PDF", "Copy"]);
  const result = await page.evaluate(async api => {
    const grid = eval(api), errors = [];
    for (const format of [null, { id: "csv", label: "CSV", extension: "csv", write() {} }, { id: "Bad", label: "X", extension: "x", write() {} },
      { id: "ok", label: " ", extension: "x", write() {} }, { id: "ok", label: "X", extension: "x.y", write() {} }, { id: "ok", label: "X", extension: "x" },
      { id: "ok", label: "X", extension: "x", showInMenu: "false", write() {} }])
      try { CanopyX.registerExportFormat(format); errors.push(null); } catch (error) { errors.push(error.message); }
    const dispose = CanopyX.registerExportFormat(fakeFormat("later", "Download later", "txt", "text/plain"));
    const missing = await grid.exportAs("xlsx", { scope: "all" }).then(() => null, error => error.message);
    const scope = (() => { try { grid.exportAs("pdf", {}); return null; } catch (error) { return error.message; } })();
    const result = await grid.exportAs("pdf", { scope: "all", download: false });
    dispose();
    return { errors, missing, scope, type: result.blob.type, name: result.fileName, format: result.format, modules: typeof CanopyX.registerExportFormat };
  }, api);
  expect(result.errors).toEqual(Array(7).fill("CanopyX: invalid export format."));
  expect(result.missing).toBe("CanopyX: export format 'xlsx' is not available.");
  expect(result.scope).toBe("CanopyX: explicit export scope required.");
  expect(result).toMatchObject({ type: "application/pdf", name: "records.pdf", format: "pdf", modules: "function" });
  // A host option wins over the view's declared IDs and can carry its own provider objects.
  await open(page, definition({ exportFormats: ["pdf"] }), fakeFormats + "CanopyX.configure('records',{exportFormats:['xlsx',fakeFormat('own','Download own','own','text/plain'),{...fakeFormat('private','Host export','txt','text/plain'),showInMenu:false}]});");
  await openGridControl(page, "export");
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download Excel", "Download own", "Copy"]);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download own", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("records.own");
  const privateExport = await page.evaluate(async api => {
    const result = await eval(api).exportAs("private", { scope: "all", download: false });
    return { text: await result.blob.text(), format: result.format };
  }, api);
  expect(privateExport).toEqual({ text: "private:" + rows.map(row => row.id).join(","), format: "private" });
  // A writer that names its file returns a File.
  const named = await page.evaluate(async api => { CanopyX.registerExportFormat({ id: "named", label: "Named", extension: "txt", write: () => new File(["named"], "Quarterly report.txt", { type: "text/plain" }) });
    const grid = eval(api), result = await grid.exportAs("named", { scope: "all", download: false }).catch(error => error.message); return result.fileName || result; }, api);
  expect(named).toBe("CanopyX: export format 'named' is not available.");
  // Formats registered after the menu was first drawn appear when it opens again.
  await page.evaluate(() => CanopyX.registerExportFormat(fakeFormat("pdf2", "Download late", "pdf", "application/pdf")));
  await page.locator(".cx-grid-export > summary").click(); await page.locator(".cx-grid-export > summary").click();
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download Excel", "Download own", "Copy"]);
  await open(page, definition(), fakeFormats + "CanopyX.registerExportFormat(fakeFormat('late','Download late','txt','text/plain'));");
  await openGridControl(page, "export"); await page.evaluate(() => CanopyX.registerExportFormat(fakeFormat("later", "Download later", "txt", "text/plain")));
  await page.locator(".cx-grid-export > summary").click(); await page.locator(".cx-grid-export > summary").click();
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download Excel", "Download PDF", "Download late", "Download later", "Copy"]);
  // Declared IDs are validated with the view.
  await page.route("http://canopyx.test/invalid", route => route.fulfill({ contentType: "text/html", body: viewPage(definition({ exportFormats: ["pdf", "pdf"] })) }));
  await page.goto("http://canopyx.test/invalid");
  await expect(page.locator("[data-cx-error]")).toHaveAttribute("data-cx-error", "CanopyX: exportFormats lists unique format IDs.");
});

const tree = (extra = {}) => ({ protocol: "canopyx/2", type: "view", id: "files", label: "Files", selection: "multiple", source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text" }, { id: "size", title: "Size", kind: "number" }, { id: "owner", title: "Owner", kind: "text", hidden: true }],
  roots: [
    { id: "a", label: "Alpha", expanded: true, cells: { size: { value: 30, text: "30 KiB", tone: "warning" }, owner: "ana" }, children: [
      { id: "a1", label: "Alpha one", cells: { size: 10, owner: "bo" } },
      { id: "a2", label: "Alpha two", cells: { size: 20, owner: "cy" }, children: [{ id: "a2x", label: "Deep", cells: { size: 5, owner: "di" } }] }] },
    { id: "b", label: "Beta", cells: { size: 7, owner: "ed" }, children: [{ id: "b1", label: "Beta one", cells: { size: 7, owner: "fa" } }] }], ...extra });

for (const [name, view, runtime] of [["ordinary", definition()], ["reporting", definition({ reporting: {} })],
  ["tree", tree(), "interactive"], ["tree on grid", tree(), "grid"]])
test("hidden providers remain callable while default and visible providers stay in the Export menu (" + name + ")", async ({ page }) => {
  await open(page, view, fakeFormats + `
    CanopyX.registerExportFormat({...fakeFormat('hidden','Host-only export','txt','text/plain'),showInMenu:false});
    CanopyX.registerExportFormat({...fakeFormat('visible','Visible export','txt','text/plain'),showInMenu:true});`, runtime);
  await openGridControl(page, "export");
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download Excel", "Download PDF", "Visible export", ...(view.type === "grid" ? ["Copy"] : [])]);
  await expect(page.getByRole("button", { name: "Host-only export", exact: true })).toHaveCount(0);
  const result = await page.evaluate(async api => {
    const grid = eval(api), hidden = await grid.exportAs("hidden", { scope: "all", values: "raw", download: false });
    return { format: hidden.format, text: await hidden.blob.text(), write: window.writes.at(-1) };
  }, api);
  const expected = view.type === "grid" ? rows.map(row => row.id) : ["a", "a1", "a2", "a2x", "b", "b1"];
  expect(result.format).toBe("hidden"); expect(result.text).toBe("hidden:" + expected.join(","));
  expect(result.write.request.values).toBe("raw"); expect(result.write.rows).toEqual(expected);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Visible export", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
  await expect(page.locator(".cx-grid-export .cx-grid-delivery-status")).toHaveText("");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

for (const runtime of ["interactive", "grid"]) test("tree grids capture visible rows with level and path and write them through providers (" + runtime + " runtime)", async ({ page }) => {
  await open(page, tree(), fakeFormats, runtime);
  const result = await page.evaluate(async api => {
    const grid = eval(api), visible = grid.prepareExport(), collect = async capture => { const out = []; for await (const row of capture.rows()) out.push(row); return out; };
    const records = await collect(visible);
    grid.setSelection(["a2x", "b1", "a"]);
    const selected = await collect(grid.prepareExport({ scope: "selected", columns: ["owner", "name"] }));
    const errors = [];
    for (const options of [{ scope: "filtered" }, { values: "html" }, { columns: ["missing"] }, { columns: ["name", "name"] }])
      try { grid.prepareExport(options); errors.push(null); } catch (error) { errors.push(error.message); }
    const written = await grid.exportAs("xlsx", { download: false });
    const cancelled = new AbortController(), pending = collect(grid.prepareExport({ signal: cancelled.signal })); cancelled.abort();
    return { request: visible.request, records, selected: selected.map(row => [row.id, row.level, row.path.join("/"), row.cells.owner.text, row.cells.name.text]),
      errors, written: await written.blob.text(), name: written.fileName, write: window.writes.at(-1), cancelled: await pending.then(() => null, error => error.name),
      frozen: Object.isFrozen(records[0]) && Object.isFrozen(records[0].cells) };
  }, api);
  expect(result.request).toMatchObject({ kind: "tree", scope: "visible", presentation: "text", values: "display", recordCount: 4, timeZone: "utc" });
  expect(result.request.columns).toEqual([{ id: "name", title: "Name", kind: "text" }, { id: "size", title: "Size", kind: "number" }]);
  expect(result.records.map(row => [row.id, row.level, row.path])).toEqual([["a", 1, ["a"]], ["a1", 2, ["a", "a1"]], ["a2", 2, ["a", "a2"]], ["b", 1, ["b"]]]);
  expect(result.records[0].cells).toEqual({ name: { value: "Alpha", text: "Alpha" }, size: { value: 30, text: "30 KiB", tone: "warning" } });
  expect(result.selected).toEqual([["a", 1, "a", "ana", "Alpha"], ["a2x", 3, "a/a2/a2x", "di", "Deep"], ["b1", 2, "b/b1", "fa", "Beta one"]]);
  expect(result.errors).toEqual(["CanopyX: invalid tree export.", "CanopyX: invalid tree export.", "CanopyX: invalid export columns.", "CanopyX: invalid export columns."]);
  expect(result.written).toBe("xlsx:a,a1,a2,b"); expect(result.name).toBe("files.xlsx");
  expect(result.write.request.kind).toBe("tree"); expect(result.cancelled).toBe("AbortError"); expect(result.frozen).toBe(true);
});

test("the ordinary tree runtime exports through its tree tools part", async ({ page }) => {
  await open(page, tree(), fakeFormats, "tree");
  const result = await page.evaluate(async api => {
    const grid = eval(api), all = [];
    for await (const row of grid.prepareExport({ scope: "all" }).rows()) all.push([row.id, row.level, row.path.join("/")]);
    const written = await grid.exportAs("xlsx", { scope: "all", download: false });
    return { all, written: await written.blob.text() };
  }, api);
  // All rows reads the whole inline tree, collapsed branches included, in tree order.
  expect(result.all).toEqual([["a", 1, "a"], ["a1", 2, "a/a1"], ["a2", 2, "a/a2"], ["a2x", 3, "a/a2/a2x"], ["b", 1, "b"], ["b1", 2, "b/b1"]]);
  expect(result.written).toBe("xlsx:a,a1,a2,a2x,b,b1");
});

// The export part loads on first use, like the filter editor, from an inline payload, plain files, hashed files or the module.
const read = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8").replace(/\r\n/g, "\n");
const hash = value => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
for (const mode of ["embedded", "plain", "hashed", "module"]) test("the export part loads on first use with " + mode + " assets", async ({ page }) => {
  const script = read("canopyx-grid.js"), style = read("canopyx-grid.css"), part = read("canopyx-export.js");
  const version = part.match(/version\s*:\s*"([a-f0-9]{16})"/)[1], loads = [];
  const entry = mode === "hashed" ? "canopyx-grid." + hash(script) + ".js" : mode === "module" ? "canopyx-grid-module.mjs" : "canopyx-grid.js";
  const view = definition();
  await page.route("http://canopyx.test/**", route => {
    const file = new URL(route.request().url()).pathname.split("/").at(-1); loads.push(file);
    if (file === "page") {
      const inert = mode === "embedded" ? '<script type="application/x-canopyx-export" data-cx-version="' + version + '">' + part + "</script>" : "";
      const runtime = mode === "embedded" ? "<script>" + script + "</script>" : "<script " + (mode === "module" ? 'type="module"' : "defer") + ' src="/assets/' + entry + '"></script>';
      const register = mode === "module" ? '<script type="module">import { registerExportFormat } from "/assets/canopyx-grid-module.mjs";registerExportFormat({id:"xlsx",label:"Download Excel",extension:"xlsx",write:()=>new Blob(["x"])});window.registered=true;</script>' : "";
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Records</title><style>' + style + "</style>" + runtime + register +
        '</head><body><div class="cx-host" data-canopyx-host data-cx-mount="manual"><script type="application/json" class="cx-config">' + JSON.stringify(view) + "</script></div>" + inert + "</body></html>" });
    }
    const contents = file === entry ? mode === "module" ? read(entry) : script : file === "canopyx-export.js" || file === "canopyx-export." + hash(part) + ".js" ? part : null;
    return contents === null ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ contentType: "text/javascript", body: contents });
  });
  await page.goto("http://canopyx.test/page");
  await page.waitForFunction(mode => window.CanopyX && (mode !== "module" || window.registered), mode);
  await page.evaluate(() => CanopyX.mount());
  await page.locator("[data-canopyx-host]").evaluate(host => host.canopyx.ready);
  expect(loads.filter(file => file.startsWith("canopyx-export"))).toEqual([]);
  if (mode !== "module") await page.evaluate(() => CanopyX.registerExportFormat({ id: "xlsx", label: "Download Excel", extension: "xlsx", write: () => new Blob(["x"]) }));
  await page.locator(".cx-grid-export > summary").click();
  await expect(page.getByRole("button", { name: "Download Excel", exact: true })).toBeVisible();
  expect(loads.filter(file => file.startsWith("canopyx-export"))).toHaveLength(mode === "embedded" ? 0 : 1);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download Excel", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("records.xlsx");
});

// The Export menu with formats and its scope picker, in both themes at desktop and phone widths.
for (const theme of ["light", "dark"]) for (const width of [1440, 390]) test("the Export menu with formats fits " + theme + " at " + width + " pixels", async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await open(page, definition({ reporting: {} }), fakeFormats + "CanopyX.registerExportFormat({...fakeFormat('hidden','Host-only export','txt','text/plain'),showInMenu:false});");
  await page.locator("[data-canopyx-host]").evaluate((host, theme) => host.setAttribute("data-cx-theme", theme), theme);
  await openGridControl(page, "export");
  const panel = page.locator(".cx-grid-export .cx-grid-panel");
  await expect(panel.getByRole("combobox")).toBeVisible();
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download Excel", "Download PDF", "Copy"]);
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  for (const button of await menuButtons(page).all()) {
    const bounds = await button.boundingBox(); expect(bounds.width).toBeGreaterThan(40); expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  const colors = await panel.evaluate(element => [getComputedStyle(element).backgroundColor, getComputedStyle(element.querySelector("button")).color]);
  expect(colors[0]).not.toBe(colors[1]);
  const evidence = process.env.CANOPYX_EVIDENCE_DIR;
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "export-menu-formats-" + theme + "-" + width + ".png") });
    await panel.getByRole("combobox").focus();
    await page.screenshot({ path: path.join(evidence, "export-menu-scope-" + theme + "-" + width + ".png"), clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 60), width: Math.min(width - Math.max(0, box.x - 16), box.width + 32), height: box.height + 80 } });
  }
});

test("the export formats example lists its page writers in the menu and exports its tree", async ({ page }) => {
  await openExample(page, "export-formats.html");
  await openGridControl(page, "export");
  await expect(menuButtons(page)).toHaveText(["Download CSV", "Download JSON", "Download Markdown", "Copy"]);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const file = await download; expect(file.suggestedFilename()).toBe("canopyx-export-formats.json");
  const records = JSON.parse(fs.readFileSync(await file.path(), "utf8"));
  expect(records).toHaveLength(250); expect(records[0]).toEqual({ id: "service-000", name: "Service 0", state: "Healthy", latency: 0 });
  await openExample(page, "export-formats-tree-dark.html");
  const tree = page.waitForEvent("download"); await page.getByRole("button", { name: "Export visible rows as Markdown", exact: true }).click();
  const markdown = fs.readFileSync(await (await tree).path(), "utf8").trim().split("\n");
  expect(markdown).toHaveLength(12);
  expect(markdown.slice(0, 4)).toEqual(["| Name | Size |", "| --- | ---: |", "| Folder 0 | 0 KiB |", "| \u00a0\u00a0File 0 | 0 KiB |"]);
});

test("a writer that returns a File names the download", async ({ page }) => {
  await open(page, definition(), "CanopyX.registerExportFormat({id:'named',label:'Download named',extension:'txt',write:()=>new File(['named'],'Quarterly report.txt',{type:'text/plain'})});");
  await openGridControl(page, "export");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download named", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Quarterly report.txt");
  expect(await page.evaluate(async api => (await eval(api).exportAs("named", { scope: "all", download: false })).fileName, api)).toBe("Quarterly report.txt");
});

test("trees on a grid runtime and export methods load the export part on demand", async ({ page }) => {
  const script = read("canopyx-grid.js"), style = read("canopyx-grid.css"), part = read("canopyx-export.js"), loads = [];
  const fragment = view => '<div class="cx-host" data-canopyx-host><script type="application/json" class="cx-config">' + JSON.stringify(view) + "</script></div>";
  await page.route("http://canopyx.test/**", route => {
    const file = new URL(route.request().url()).pathname.split("/").at(-1); loads.push(file);
    if (file === "page") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Mixed</title><style>' + style +
      '</style><script defer src="/assets/canopyx-grid.js"></script></head><body>' + fragment(tree()) + fragment(definition()) + "</body></html>" });
    const tools = file.startsWith("canopyx-tree-tools") ? read(file) : null;
    return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: file === "canopyx-grid.js" ? script : file === "canopyx-export.js" ? part : tools ?? "" });
  });
  await page.goto("http://canopyx.test/page"); await page.waitForFunction(() => document.querySelectorAll("[data-cx-ready]").length === 2);
  const parts = () => loads.filter(file => file.startsWith("canopyx-export"));
  expect(parts()).toEqual([]);
  const result = await page.evaluate(async () => {
    CanopyX.registerExportFormat({ id: "lines", label: "Lines", extension: "txt", async write(capture) { const ids = []; for await (const row of capture.rows()) ids.push(row.id); return new Blob([ids.join(",")]); } });
    const [tree, grid] = [...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx);
    const exported = await tree.exportAs("lines", { download: false });
    const csv = await grid.toCsv({ scope: "all", maxRows: 100 });
    return { tree: await exported.blob.text(), rows: csv.trim().split("\r\n").length };
  });
  expect(result).toEqual({ tree: "a,a1,a2,b", rows: 81 });
  expect(parts()).toEqual(["canopyx-export.js"]);
});
