// Plugins (CanopyX.use and the plugins option) and the parts they and the views load (docs/plugins.md): renderers, toolbar
// items, menu entries, events, the lifecycle, requires, and parts that load only when a view needs them.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openExample, nextFrames } from "./support.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assets = path.join(repo, "CanopyX.Html/Assets");
const read = name => fs.readFileSync(path.join(assets, name), "utf8");
const manifest = JSON.parse(read("canopyx-parts.json")).parts;

const gridView = (id, extra = {}) => ({ protocol: "canopyx/2", type: "grid", id, label: "Servers " + id, pageSize: 100, selection: "multiple", search: false,
  source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "load", title: "Load", kind: "number", sortable: true, renderer: "meter" }],
  rows: Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + i, load: (i * 37) % 101 } })), ...extra });
const treeView = (id, extra = {}) => ({ protocol: "canopyx/2", type: "view", id, label: "Sites " + id, rowHeight: 28, pageSize: 100, selection: "multiple",
  columns: [{ id: "name", title: "Name", width: 200, kind: "text" }, { id: "load", title: "Load", width: 160, kind: "number", renderer: "meter" }],
  source: { kind: "inline" }, roots: Array.from({ length: 4 }, (_, i) => ({ id: "s" + i, label: "Site " + i, cells: { load: i * 20 } })), ...extra });

/**
 * Serves a page from https://plugins.test/ with a runtime loaded by its plain file name, so the parts load as plain files
 * beside it; script runs before the views mount. Returns the part files the page requested, in order.
 */
async function serve(page, { runtime = "canopyx-grid", views = [], script = "", missing = [] }) {
  const requested = [];
  await page.route("https://plugins.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plugins</title><style>' + read(runtime + ".css") +
      '</style><script src="/' + runtime + '.js"></script></head><body><script>window.events=[];window.errors=[];' + script + "</script>" +
      views.map(view => '<div class="cx-host" data-canopyx-host style="height:420px" data-view="' + view.id + '"><script type="application/json" class="cx-config">' +
        JSON.stringify(view) + "</script></div>").join("") +
      "<script>document.querySelectorAll('[data-canopyx-host]').forEach(host=>host.addEventListener('canopyx:error',e=>errors.push(e.detail.error.message)));</script></body></html>" });
    if (file === runtime + ".js") return route.fulfill({ contentType: "text/javascript", body: read(file) });
    requested.push(file);
    if (missing.some(name => file.startsWith("canopyx-" + name)) || !fs.existsSync(path.join(assets, file))) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(file) });
  });
  await page.goto("https://plugins.test/");
  if (views.length) await page.waitForSelector("[data-cx-ready]");
  return requested;
}

const meter = `function meter(record, element, context) {
  const id = typeof context.column === "string" ? context.column : context.column.id;
  const span = document.createElement("span"); span.className = "meter"; span.textContent = "meter " + record.cells[id];
  element.appendChild(span); return true;
}`;

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test(`the plugins example draws its renderer, toolbar item, menu entry and status on a grid (${theme}, ${width})`, async ({ page }) => {
    page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
    await page.setViewportSize({ width, height: 800 });
    await openExample(page, theme === "dark" ? "plugins-dark.html" : "plugins.html");
    await expect(page.locator("#plugin-log")).toHaveText("The load-meter plugin started on the grid “Servers”.");
    await expect(page.locator("#plugin-log")).toHaveAttribute("role", "status");
    // Every load cell is drawn by the plugin, one meter a row; the other columns keep the built-in painter.
    await expect(page.locator(".cx-row .load-meter").first()).toBeVisible();
    expect(await page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].every(row => row.querySelectorAll(".load-meter").length === 1))).toBe(true);
    // The toolbar item is a button in the toolbar, reached and run from the keyboard.
    const busiest = page.locator(".cx-toolbar").getByRole("button", { name: "Busiest first" });
    if (width > 640) {
      await busiest.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".cx-row[data-cx-id]").first().locator(".load-meter")).toContainText("100%");
      const box = await busiest.boundingBox(), toolbar = await page.locator(".cx-toolbar").boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(toolbar.x + toolbar.width + 1);
    } else {
      await expect(busiest).toBeAttached();
    }
    // Selection reaches the plugin's event handler; its menu entry clears it.
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setSelection(["server-01"]));
    await expect(page.locator("#plugin-log")).toHaveText(/selected/);
    expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getSelection().length)).toBeGreaterThan(0);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.closeMenus?.());
    await page.locator(".cx-grid-overflow > summary").click();
    await page.locator(".cx-grid-overflow").getByRole("button", { name: "Clear selection" }).click();
    await expect(page.locator("#plugin-log")).toHaveText("Nothing selected");
    expect(page.errors).toEqual([]);
  });
}

test("the plugins example draws its renderer and toolbar item on a tree", async ({ page }) => {
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 800 });
  await openExample(page, "plugins-tree.html");
  await expect(page.locator('.cx-row[data-cx-id="site-0"] .load-meter')).toBeVisible();
  await expect(page.locator(".cx-toolbar").getByRole("button", { name: "Busiest first" })).toBeVisible();
  await page.locator(".cx-grid-overflow > summary").click();
  await expect(page.locator(".cx-grid-overflow").getByRole("button", { name: "Clear selection" })).toBeVisible();
  await expect(page.locator("#plugin-log")).toHaveText("The load-meter plugin started on the tree “Sites”.");
  expect(page.errors).toEqual([]);
});

test("plugins start in requires order after the parts they require, and the grid's ready waits for them", async ({ page }) => {
  const requested = await serve(page, { views: [gridView("ordered")], script: `
    window.order = [];
    CanopyX.use({ name: "base", init() { order.push("base"); } });
    CanopyX.use({ name: "dependent", requires: ["base", "export"], init: () => new Promise(resolve => setTimeout(() => {
      order.push("dependent:" + performance.getEntriesByType("resource").some(entry => entry.name.includes("canopyx-export"))); resolve(); }, 80)) });` });
  expect(requested).toContain("canopyx-export.js");
  const result = await page.evaluate(async () => { await document.querySelector("[data-canopyx-host]").canopyx.ready; return order; });
  expect(result).toEqual(["base", "dependent:true"]);
});

test("a grid's own plugin replaces a page plugin of the same name, and its export formats stay on that grid", async ({ page }) => {
  await serve(page, { views: [gridView("first"), gridView("second")], script: `
    window.inits = [];
    CanopyX.use({ name: "audit", init: ({ view }) => inits.push("page:" + view.id) });
    const format = { id: "plugin-json", label: "Plugin JSON", extension: "json", write: () => new Blob(["{}"]) };
    CanopyX.configure("first", { plugins: [{ name: "audit", exportFormats: [format], init: ({ view }) => inits.push("own:" + view.id) }] });` });
  const result = await page.evaluate(async () => {
    const [first, second] = [...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx);
    await Promise.all([first.ready, second.ready]);
    const own = await first.exportAs("plugin-json", { scope: "all", download: false }).then(result => result.fileName);
    const other = await second.exportAs("plugin-json", { scope: "all", download: false }).then(() => "exported", error => error.message);
    return { inits: inits.sort(), own, other };
  });
  expect(result).toEqual({ inits: ["own:first", "page:second"], own: "first.json", other: "CanopyX: export format 'plugin-json' is not available." });
});

test("a failing plugin is reported as the grid's error while the grid and its other plugins work", async ({ page }) => {
  await serve(page, { views: [gridView("failing")], script: `
    window.started = [];
    CanopyX.use({ name: "broken", init() { throw new Error("broken plugin"); } });
    CanopyX.use({ name: "healthy", init() { started.push("healthy"); } });` });
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready;
    return { errors, started, rows: document.querySelectorAll(".cx-row").length };
  });
  expect(result.errors).toEqual(["broken plugin"]);
  expect(result.started).toEqual(["healthy"]);
  expect(result.rows).toBeGreaterThan(0);
});

test("failed plugin requirements suppress dependents while unrelated plugins start", async ({ page }) => {
  await serve(page, { views: [gridView("dependency-failure")], script: `
    window.started = []; window.afterFailure = [];
    CanopyX.use({ name: "broken", async init() { throw new Error("broken plugin"); } });
    CanopyX.use({ name: "dependent", requires: ["broken"], events: { select: () => afterFailure.push("dependent") }, init() { started.push("dependent"); } });
    CanopyX.use({ name: "transitive", requires: ["dependent"], events: { select: () => afterFailure.push("transitive") }, init() { started.push("transitive"); } });
    CanopyX.use({ name: "healthy", events: { select: () => afterFailure.push("healthy") }, init() { started.push("healthy"); } });` });
  await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready; api.setSelection(["r0"]); });
  expect(await page.evaluate(() => started)).toEqual(["healthy"]);
  expect(await page.evaluate(() => afterFailure)).toEqual(["healthy"]);
  expect(await page.evaluate(() => errors)).toEqual(["broken plugin", "CanopyX: plugin 'dependent' requires failed plugin 'broken'.", "CanopyX: plugin 'transitive' requires failed plugin 'dependent'."]);
});

test("per-view plugin replacements start after the remaining page plugins", async ({ page }) => {
  await serve(page, { views: [gridView("replacement-order")], script: `
    window.order = [];
    CanopyX.use({ name: "first", init: () => order.push("page:first") });
    CanopyX.use({ name: "second", init: () => order.push("page:second") });
    CanopyX.configure("replacement-order", { plugins: [{ name: "first", init: () => order.push("view:first") }] });` });
  expect(await page.evaluate(async () => { await document.querySelector("[data-canopyx-host]").canopyx.ready; return order; })).toEqual(["page:second", "view:first"]);
});

test("page plugin formats respect later registration and disposal on existing grids", async ({ page }) => {
  await serve(page, { views: [gridView("format-disposal")], script: `
    window.disposePlugin = CanopyX.use({ name: "page-format", exportFormats: [{ id: "audit", label: "Audit", extension: "txt", write: () => new Blob(["plugin"]) }] });` });
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready;
    const text = () => api.exportAs("audit", { scope: "all", download: false }).then(result => result.blob.text());
    const before = await text();
    const disposeFormat = CanopyX.registerExportFormat({ id: "audit", label: "Replacement", extension: "txt", write: () => new Blob(["replacement"]) });
    const replaced = await text(); disposePlugin(); const afterPlugin = await text(); disposeFormat();
    return { before, replaced, afterPlugin, afterFormat: await text().catch(error => error.message) };
  });
  expect(result).toEqual({ before: "plugin", replaced: "replacement", afterPlugin: "replacement", afterFormat: "CanopyX: export format 'audit' is not available." });
});

test("plugin names use own manifest entries and ambiguous menu handlers fail at registration", async ({ page }) => {
  await serve(page, { views: [], script: "window.order = [];" });
  const result = await page.evaluate(async view => {
    let missing, ambiguous;
    try { CanopyX.createDataGrid(document.body.appendChild(document.createElement("div")), { view, plugins: [{ name: "missing-constructor", requires: ["constructor"] }] }); }
    catch (error) { missing = error.message; }
    try { CanopyX.use({ name: "ambiguous", menuItems: [{ label: "Both", run() {}, render() {} }] }); }
    catch (error) { ambiguous = error.message; }
    const dispose = CanopyX.use({ name: "constructor", init: () => order.push("constructor") });
    const api = CanopyX.createDataGrid(document.body.appendChild(document.createElement("div")), { view,
      plugins: [{ name: "dependent-constructor", requires: ["constructor"], init: () => order.push("dependent") }] });
    await api.ready; api.destroy(); dispose();
    return { missing, ambiguous, order };
  }, gridView("manifest-own"));
  expect(result).toEqual({ missing: "CanopyX: plugin 'missing-constructor' requires 'constructor', which is neither a plugin nor a part.",
    ambiguous: "CanopyX: invalid plugin 'ambiguous'.", order: ["constructor", "dependent"] });
});

test("a failed part stylesheet retries after its script has registered", async ({ page }) => {
  let styles = 0;
  await serve(page, { views: [], script: 'CanopyX.use({ name: "loader", init(context) { window.loadTestPart = context.part; } });' });
  await page.route("https://plugins.test/canopyx-editing.css", route => ++styles === 1 ? route.fulfill({ status: 503, body: "" }) : route.fulfill({ contentType: "text/css", body: read("canopyx-editing.css") }));
  const result = await page.evaluate(async view => {
    const host = Object.assign(document.body.appendChild(document.createElement("div")), { style: "height:300px" });
    const api = CanopyX.createDataGrid(host, { view }); await api.ready;
    const first = await loadTestPart("editing").then(() => "loaded", error => error.message);
    await loadTestPart("editing"); return first;
  }, gridView("retry-css"));
  expect(result).toContain("stylesheet unavailable");
  expect(styles).toBe(2);
});

test("destroy runs once, aborts the plugin signal and removes its event subscriptions", async ({ page }) => {
  await serve(page, { views: [gridView("lifecycle")], script: `
    window.calls = [];
    CanopyX.use({ name: "watcher", events: { select: () => calls.push("select") },
      init(context) { window.pluginContext = context; context.signal.addEventListener("abort", () => calls.push("abort")); },
      destroy(context) { calls.push("destroy:" + context.kind); } });` });
  const result = await page.evaluate(async () => {
    const host = document.querySelector("[data-canopyx-host]"), api = host.canopyx; await api.ready;
    api.setSelection(["r1"]);
    const frozen = Object.isFrozen(pluginContext) && pluginContext.api === api && pluginContext.element === host;
    api.destroy();
    host.dispatchEvent(new CustomEvent("canopyx:select", { detail: {} }));
    api.destroy();
    return { calls, frozen };
  });
  // The destroy hook was registered before init added its own listener.
  expect(result).toEqual({ calls: ["select", "destroy:grid", "abort"], frozen: true });
});

test("use validates plugins, refuses a second registration of a name and returns a disposer", async ({ page }) => {
  await serve(page, { views: [] });
  const result = await page.evaluate(() => {
    const attempt = action => { try { action(); return "ok"; } catch (error) { return error.message; } };
    const dispose = CanopyX.use({ name: "once" });
    const host = () => Object.assign(document.body.appendChild(document.createElement("div")), { style: "height:300px" });
    const view = { protocol: "canopyx/2", type: "grid", id: "v" + Math.random().toString(36).slice(2), label: "V", pageSize: 100, selection: "single", search: false,
      source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text" }], rows: [] };
    const results = [
      attempt(() => CanopyX.use({ name: "once" })),
      attempt(() => CanopyX.use({ name: "Bad Name" })),
      attempt(() => CanopyX.use({ name: "hooks", init: "no" })),
      attempt(() => CanopyX.use({ name: "views", views: ["matrix"] })),
      attempt(() => CanopyX.use({ name: "renderers", cellRenderers: { x: 1 } })),
      attempt(() => CanopyX.use({ name: "formats", exportFormats: [{ id: "csv" }] })),
      attempt(() => CanopyX.use({ name: "export" })),
      attempt(() => CanopyX.use({ name: "items", toolbarItems: [{ label: "No handler" }] })),
      attempt(() => CanopyX.use({ name: "entries", menuItems: [{ run() {} }] })),
      attempt(() => CanopyX.createDataGrid(host(), { view, plugins: [{ name: "needs", requires: ["nothing-like-this"] }] })),
      attempt(() => CanopyX.createDataGrid(host(), { view: { ...view, id: "loop" }, plugins: [{ name: "a", requires: ["b"] }, { name: "b", requires: ["a"] }] }))
    ];
    dispose();
    results.push(attempt(() => CanopyX.use({ name: "once" })));
    return results;
  });
  expect(result).toEqual(["CanopyX: plugin 'once' is already registered.", "CanopyX: invalid plugin 'Bad Name'.", "CanopyX: invalid plugin 'hooks'.",
    "CanopyX: invalid plugin 'views'.", "CanopyX: invalid plugin 'renderers'.", "CanopyX: invalid export format.",
    "CanopyX: invalid plugin 'export'.", "CanopyX: invalid plugin 'items'.", "CanopyX: invalid plugin 'entries'.",
    "CanopyX: plugin 'needs' requires 'nothing-like-this', which is neither a plugin nor a part.", "CanopyX: plugin 'a' requires itself.", "ok"]);
});

test("a host renderer wins over a plugin renderer, and an unregistered renderer name keeps the built-in painter", async ({ page }) => {
  const view = gridView("renderers", { columns: [{ id: "name", title: "Name", kind: "text", renderer: "meter" }, { id: "load", title: "Load", kind: "number", renderer: "missing" }] });
  await serve(page, { views: [view], script: meter + `
    CanopyX.use({ name: "meter", cellRenderers: { meter } });
    CanopyX.configure("renderers", { renderers: { name: (row, element) => { element.textContent = "host " + row.cells.name; } } });` });
  await expect(page.locator('.cx-row[data-cx-id="r1"]')).toContainText("host Server 1");
  await expect(page.locator('.cx-row[data-cx-id="r1"]')).toContainText("37");
  expect(await page.locator(".meter").count()).toBe(0);
});

test("plugin renderers, toolbar items and menu entries work on a tree runtime", async ({ page }) => {
  await serve(page, { runtime: "canopyx", views: [treeView("tree")], script: meter + `
    CanopyX.use({ name: "meter", views: ["tree"], cellRenderers: { meter },
      toolbarItems: [{ label: "Select all", run: ({ api }) => api.selectAll({ scope: "visible" }) }],
      menuItems: [{ label: "Count", run: ({ nodes }) => events.push(nodes.length) }] });
    CanopyX.use({ name: "grids-only", views: ["grid"], init: () => events.push("grid plugin") });` });
  await expect(page.locator('.cx-row[data-cx-id="s2"] .meter')).toHaveText("meter 40");
  await page.locator(".cx-toolbar").getByRole("button", { name: "Select all" }).click();
  await page.locator(".cx-grid-overflow > summary").click();
  await page.locator(".cx-grid-overflow").getByRole("button", { name: "Count" }).click();
  await expect.poll(() => page.evaluate(() => window.events)).toEqual([4]);
});

test("a part's requires load and install before it", async ({ page }) => {
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  const version = name => manifest.find(part => part.name === name).version;
  const view = gridView("history", { columns: [{ id: "name", title: "Name", kind: "text" }, { id: "trend", title: "Trend", kind: "text", presenter: { kind: "statusStrip" } }],
    rows: [{ id: "r0", cells: { name: "One", trend: { value: "Healthy", series: [{ period: "Day 1", tone: "success" }] } } }] });
  await serve(page, { views: [], script: `
    window.installs = [];
    CanopyX.registerPart("export", { version: "${version("export")}", install: () => installs.push("export") });
    CanopyX.registerPart("history", { version: "${version("history")}", requires: ["export"], install: () => installs.push("history") });` });
  const installs = await page.evaluate(async view => {
    const host = Object.assign(document.body.appendChild(document.createElement("div")), { style: "height:300px" });
    await CanopyX.createDataGrid(host, { view }).ready;
    return installs;
  }, view);
  expect(installs).toEqual(["export", "history"]);
  expect(page.errors).toEqual([]);
});

test("the links part loads only for deep links, and a tree whose links part cannot load keeps its rows and reports it", async ({ page }) => {
  const plain = await serve(page, { runtime: "canopyx", views: [treeView("plain")] });
  expect(plain.filter(file => file.startsWith("canopyx-links"))).toEqual([]);
  await page.unrouteAll();
  const linked = await serve(page, { runtime: "canopyx", views: [treeView("linked", { deepLink: true })], missing: ["links"] });
  expect(linked).toContain("canopyx-links.js");
  await expect(page.locator('.cx-row[data-cx-id="s1"]')).toBeVisible();
  await nextFrames(page);
  expect(await page.evaluate(() => window.errors)).toContain("CanopyX: deep links script unavailable.");
});

test("a deep link written by the links part survives selection on a file-loaded runtime", async ({ page }) => {
  const requested = await serve(page, { runtime: "canopyx", views: [treeView("linking", { deepLink: true })] });
  expect(requested).toContain("canopyx-links.js");
  await page.locator('.cx-row[data-cx-id="s2"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#cx.linking=s2");
});

test("the search part loads on a sidecar source's first query that has a word of two units", async ({ page }) => {
  const docs = {
    manifest: { protocol: "canopyx/2", type: "manifest", view: "index", root: "r/0", search: { entryCount: 1, entryFiles: [0], kinds: [], shards: { ab: 1 } } },
    "s/k-ab": { protocol: "canopyx/2", type: "searchShard", key: "ab", words: ["abacus"], postings: [[0]] },
    "e/0": { protocol: "canopyx/2", type: "searchEntries", first: 0, stem: [], entries: [[-1, 0, "a", 0, "Abacus"]] }
  };
  const requested = await serve(page, { runtime: "canopyx", views: [treeView("tree")] });
  await page.route("https://plugins.test/data/**", route => {
    const ref = new URL(route.request().url()).pathname.slice(6, -3);
    return route.fulfill({ contentType: "text/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify(["index", ref, docs[ref]])});` });
  });
  expect(requested.filter(file => file.startsWith("canopyx-search"))).toEqual([]);
  const result = await page.evaluate(async () => {
    const source = CanopyX.sources.sidecar({ id: "index", source: { kind: "sidecar", base: "/data/" } });
    const short = await source.search("a", 10).then(() => "found", error => error.code);
    const hits = (await source.search("abac", 10)).hits.map(hit => hit.label);
    const again = (await source.search("abacus", 10)).hits.length;
    return { short, hits, again };
  });
  expect(result).toEqual({ short: "too-short", hits: ["Abacus"], again: 1 });
  expect(requested.filter(file => file.startsWith("canopyx-search"))).toEqual(["canopyx-search.js"]);
});

test("every plugin hears the grid's events from its creation, even while an earlier plugin is still starting", async ({ page }) => {
  await serve(page, { views: [gridView("early")], script: `
    window.heard = [];
    CanopyX.use({ name: "slow", init: () => new Promise(resolve => setTimeout(resolve, 300)) });
    CanopyX.use({ name: "listener", requires: ["export"], events: { query: event => heard.push(event.detail.query ? "query" : "?") } });` });
  const heard = await page.evaluate(async () => { await document.querySelector("[data-canopyx-host]").canopyx.ready; return heard; });
  expect(heard[0]).toBe("query");
});

test("a grid's own plugin format replaces a page format with the same id on that grid only", async ({ page }) => {
  await serve(page, { views: [gridView("own"), gridView("plain")], script: `
    CanopyX.registerExportFormat({ id: "text", label: "Page text", extension: "txt", write: () => new Blob(["page"]) });
    CanopyX.configure("own", { plugins: [{ name: "local-text", exportFormats: [{ id: "text", label: "Own text", extension: "log", write: () => new Blob(["own"]) }] }] });` });
  const names = await page.evaluate(async () => {
    const [own, plain] = [...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx);
    await Promise.all([own.ready, plain.ready]);
    return [(await own.exportAs("text", { scope: "all", download: false })).fileName, (await plain.exportAs("text", { scope: "all", download: false })).fileName];
  });
  expect(names).toEqual(["own.log", "plain.txt"]);
});

test("an address that names a row opens it through the file-loaded links part", async ({ page }) => {
  await page.route("https://plugins.test/**", route => route.fallback());
  const view = treeView("opened", { deepLink: true, roots: [{ id: "s0", label: "Site 0", children: [{ id: "s0a", label: "Server A" }, { id: "s0b", label: "Server B" }] }] });
  const requested = [];
  await page.route("https://plugins.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Links</title><style>' + read("canopyx.css") +
      '</style><script src="/canopyx.js"></script></head><body><div class="cx-host" data-canopyx-host style="height:420px"><script type="application/json" class="cx-config">' +
      JSON.stringify(view) + "</script></div></body></html>" });
    requested.push(file);
    return fs.existsSync(path.join(assets, file)) ? route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(file) }) : route.fulfill({ status: 404, body: "" });
  });
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  await page.goto("https://plugins.test/#cx.opened=s0/s0b");
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator('.cx-row[data-cx-id="s0b"]')).toHaveAttribute("aria-selected", "true");
  expect(requested).toContain("canopyx-links.js");
  expect(page.errors).toEqual([]);
});
