// Large data: fragments that mount when they come into view, compact row data decoded chunk by chunk (in host scripts, in
// the document, gzip-compressed or in a bundle's sidecar files), first windows before the last chunk, and failures.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, repo, runtimeAssets, viewPage } from "./support.mjs";

const read = (file) => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", file), "utf8");
const columns = [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "size", title: "Size", kind: "number", sortable: true }];
const compactView = (rowData, extra) => Object.assign({ protocol: "canopyx/2", type: "grid", id: "compact", label: "Compact rows", rowHeight: 32, pageSize: 50,
  selection: "multiple", search: true, columns, source: { kind: "inline" }, rowData: { version: 1, ...rowData } }, extra);
const chunk = (from, to) => Array.from({ length: to - from }, (_, i) => ["r" + String(from + i).padStart(5, "0"), "Item " + (from + i), (from + i) % 97]);
const ids = (page) => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex")).map((row) => row.getAttribute("data-cx-id")));

async function openReport(page) {
  await page.goto(exampleUrl("large/report.html"));
  await page.waitForFunction(() => document.querySelectorAll("[data-cx-ready]").length >= 2);
  await nextFrames(page);
}

test("report fragments mount when they come into view, open, print or are mounted by the host", async ({ page }) => {
  await openReport(page);
  const mounted = () => page.evaluate(() => [...document.querySelectorAll("[data-canopyx-mounted]")].map((host) => host.querySelector(".cx-grid").getAttribute("aria-label")));
  expect(await mounted()).toEqual(["Section 1 assets", "Section 2 assets"]);
  // Configuration still works for a fragment that has not mounted yet.
  expect(await page.evaluate(() => { CanopyX.configure("section-9", { searchDelayMs: 0 })(); return true; })).toBe(true);
  // Opening a tab mounts its grids within reach of the viewport (half a window height beyond it); its fourth grid, further
  // down, and the grids of other tabs stay unparsed.
  await page.getByRole("tab", { name: "Section 3" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("#panel-2 [data-canopyx-host]")].slice(0, 3).every((host) => host.querySelector(".cx-row[data-cx-id]")));
  expect(await page.evaluate(() => [...document.querySelectorAll("#panel-2 [data-canopyx-host]")].map((host) => host.hasAttribute("data-canopyx-mounted")))).toEqual([true, true, true, false]);
  expect((await mounted()).length).toBe(5);
  // Scrolling to the end mounts the grids below the fold.
  await page.evaluate(() => document.querySelector("main > section:last-of-type [data-canopyx-host]:last-of-type").scrollIntoView());
  await page.waitForFunction(() => document.querySelectorAll("main > section:last-of-type [data-canopyx-mounted]").length >= 1);
  // A host can mount a waiting fragment at once.
  const forced = await page.evaluate(() => { const host = document.querySelector("#panel-5 [data-canopyx-host]"); const created = CanopyX.mount(host); return [created.length, !!host.canopyx]; });
  expect(forced).toEqual([1, true]);
  // Printing mounts every fragment still waiting.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  expect(await page.evaluate(() => document.querySelectorAll('[data-cx-mount="visible"]:not([data-canopyx-mounted])').length)).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll("[data-canopyx-host]").length)).toBe(24);
});

test("a compact single-file grid shows what the row objects show", async ({ page }) => {
  // grid-100k.html is written with the default format (Auto), which compresses 100,000 rows; the objects page asks for objects.
  const results = [], formats = [];
  for (const name of ["large/grid-100k.html", "large/grid-100k-objects.html"]) {
    await page.goto(exampleUrl(name));
    formats.push(await page.evaluate(() => { const config = JSON.parse(document.querySelector(".cx-config").textContent);
      return config.rowData ? { rowData: config.rowData.encoding || "json", version: "version" in config.rowData, scripts: document.querySelectorAll("script[type=\"application/x-canopyx-rows\"]").length } : { rows: config.rows.length }; }));
    await page.waitForSelector(".cx-row[data-cx-id]");
    const result = await page.evaluate(async () => {
      const api = document.querySelector("[data-canopyx-host]").canopyx, grid = document.querySelector(".cx-grid");
      await api.ready;
      const first = grid.getAttribute("aria-rowcount");
      await api.sort([{ column: "modified", direction: "desc" }, { column: "name", direction: "asc" }]);
      const sorted = [...document.querySelectorAll(".cx-row[data-cx-id]")].slice(0, 5).map((row) => row.textContent);
      await api.setQuery({ search: "kestrel quartz", filters: [{ column: "status", operator: "eq", values: ["Faulty"] }] });
      return { first, sorted, matched: grid.getAttribute("aria-rowcount"), rows: api.view.rows.length };
    });
    results.push(result);
  }
  expect(formats).toEqual([{ rowData: "gzip", version: true, scripts: 20 }, { rows: 100000 }]);
  expect(results[0].first).toBe("100001");
  expect(results[0].rows).toBe(100000);
  expect(results[0]).toEqual(results[1]);
});

test("a gzip bundle loads its rows from sidecar files on file://", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(exampleUrl("large/bundle/index.html"));
  await page.waitForSelector(".cx-row[data-cx-id]");
  const state = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    await api.setQuery({ search: "Asset 0099999" });
    return { matched: document.querySelector(".cx-grid").getAttribute("aria-rowcount"), id: document.querySelector(".cx-row[data-cx-id]").getAttribute("data-cx-id"), rows: api.view.rows.length,
      scripts: document.querySelectorAll('script[type="application/x-canopyx-rows"]').length };
  });
  expect(state).toEqual({ matched: "2", id: "a0099999", rows: 100000, scripts: 0 });
  expect(errors).toEqual([]);
});

test("the first windows of ordered rows paint before the last chunk arrives; other queries wait for it", async ({ page }) => {
  const view = compactView({ columns: ["name", "size"], count: 300, ordered: true, base: "data/", chunks: 3 });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const sidecar = (index) => "(self.CanopyXSidecar = self.CanopyXSidecar || []).push([\"compact\",\"rows/" + index + "\",String.raw`" + JSON.stringify(chunk(index * 100, index * 100 + 100)) + "`]);";
  await page.route("http://canopyx.test/**", async (route) => {
    const file = new URL(route.request().url()).pathname;
    if (file === "/") return route.fulfill({ contentType: "text/html", body: viewPage(view) });
    const index = Number(/rows\/(\d)\.js$/.exec(file)?.[1]);
    if (index === 2) await held;
    return route.fulfill({ contentType: "text/javascript", body: sidecar(index) });
  });
  // The held file keeps the load event waiting, so wait for the document only.
  await page.goto("http://canopyx.test/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cx-row[data-cx-id]");
  // The first window needs only the first chunk; the second one follows in a later task, and the third is held back.
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]").canopyx.view.rows.length === 200);
  const early = await page.evaluate(() => ({ count: document.querySelector(".cx-grid").getAttribute("aria-rowcount"), rows: document.querySelector("[data-canopyx-host]").canopyx.view.rows.length }));
  expect(early).toEqual({ count: "301", rows: 200 });
  expect((await ids(page))[0]).toBe("r00000");
  const sorted = page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.sort([{ column: "size", direction: "desc" }]).then(() => document.querySelector("[data-canopyx-host]").canopyx.view.rows.length));
  await page.waitForTimeout(150);
  expect(await page.locator(".cx-grid").getAttribute("aria-busy")).toBe("true");
  release();
  expect(await sorted).toBe(300);
  await nextFrames(page);
  // size = index % 97: the largest values (96) are rows 96 and 193 and 290, in identity order.
  expect((await ids(page)).slice(0, 3)).toEqual(["r00096", "r00193", "r00290"]);
});
test("a failed row data file can be retried and decodes from the start", async ({ page }) => {
  const view = compactView({ columns: ["name", "size"], count: 200, ordered: true, base: "data/", chunks: 2 }, { search: false });
  // The second file fails twice: in the decoding after the first window (which no query waits for, so the next query starts a new one)
  // and in the decoding the sort starts; the retry then succeeds.
  let failures = 2;
  await page.route("http://canopyx.test/**", (route) => {
    const file = new URL(route.request().url()).pathname;
    if (file === "/") return route.fulfill({ contentType: "text/html", body: viewPage(view) });
    const index = Number(/rows\/(\d)\.js$/.exec(file)?.[1]);
    if (index === 1 && failures-- > 0) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: "text/javascript", body: "(self.CanopyXSidecar = self.CanopyXSidecar || []).push([\"compact\",\"rows/" + index + "\",String.raw`" +
      JSON.stringify(chunk(index * 100, index * 100 + 100)) + "`]);" });
  });
  await page.goto("http://canopyx.test/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cx-row[data-cx-id]");
  // The first window came from the first file; a sort needs the second, which is missing again.
  const failed = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.sort([{ column: "size", direction: "desc" }]).then(() => "sorted", (error) => error.message));
  expect(failed).toContain("Sidecar file is missing: rows/1");
  const retried = await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; await api.retry(); return [api.view.rows.length, api.getQuery().sort]; });
  expect(retried).toEqual([200, [{ column: "size", direction: "desc" }]]);
});

test("chunks in the document decode row tones, classes and empty cells as row objects do", async ({ page }) => {
  const rows = [[{ id: "a", tone: "warning", className: "flagged" }, "Alpha", 3], ["b", "Beta"], ["c", null, 1]];
  const view = compactView({ columns: ["name", "size"], count: 3, chunks: [rows.slice(0, 2), JSON.stringify(rows.slice(2))] });
  await page.route("http://canopyx.test/doc", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/doc");
  await page.waitForSelector(".cx-row[data-cx-id]");
  const state = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    await api.ready;
    return { rows: api.view.rows, flagged: document.querySelector('.cx-row[data-cx-id="a"]').classList.contains("flagged") };
  });
  expect(state.rows).toEqual([{ id: "a", cells: { name: "Alpha", size: 3 }, tone: "warning", className: "flagged" }, { id: "b", cells: { name: "Beta" } }, { id: "c", cells: { size: 1 } }]);
  expect(state.flagged).toBe(true);
});

test("formatting bars over compact row data take their bounds from every row, not the first chunk", async ({ page }) => {
  const { formattingPage } = await import("./formatting-support.mjs");
  const rows = Array.from({ length: 20 }, (_, index) => ["r" + String(index).padStart(2, "0"), "Item " + index, index < 10 ? index : 100 * (index - 9)]);
  const view = { ...compactView({ columns: ["name", "size"], count: 20, ordered: true, chunks: [rows.slice(0, 10), rows.slice(10)] }),
    formatRules: [{ id: "size", label: "Size", column: "size", style: { bar: { tone: "info" } } }] };
  await page.route("http://canopyx.test/bars", (route) => route.fulfill({ contentType: "text/html", body: formattingPage(view) }));
  await page.goto("http://canopyx.test/bars");
  await page.waitForSelector(".cx-row[data-cx-id]");
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.view.rows.length)).toBe(20);
  // 9 of a range from 0 to 1,000: under one percent, where the first chunk alone (0 to 9) would fill the bar.
  await expect.poll(() => page.evaluate(() => document.querySelector('.cx-row[data-cx-id="r09"] .cx-fmt-bar')?.style.getPropertyValue("--cx-fmt-w"))).toBe("0.9%");
});

test("version one row data remains readable with unknown optional members", async ({ page }) => {
  // The strict schema refuses unknown members; tolerant runtime readers keep known version-one semantics.
  const view = compactView({ columns: ["name"], count: 2, chunks: [[["a", "Alpha"], ["b", "Beta"]]], future: { kind: "x" } });
  await page.route("http://canopyx.test/unknown", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/unknown");
  await page.waitForSelector(".cx-row[data-cx-id]");
  expect(await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready; return api.view.rows.map(row => row.id); })).toEqual(["a", "b"]);
});

test("gzip chunks in host scripts inflate before they are parsed", async ({ page }) => {
  const compressed = await page.evaluate(async (text) => {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, JSON.stringify(chunk(0, 120)));
  const view = compactView({ columns: ["name", "size"], count: 120, ordered: true, encoding: "gzip", chunks: 1 });
  const body = viewPage(view).replace("</script></div>", "</script><script type=\"application/x-canopyx-rows\">" + compressed + "</script></div>");
  await page.route("http://canopyx.test/gzip", (route) => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/gzip");
  await page.waitForSelector(".cx-row[data-cx-id]");
  expect(await page.locator(".cx-grid").getAttribute("aria-rowcount")).toBe("121");
  expect(await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; await api.setQuery({ search: "Item 119" }); return api.view.rows.length; })).toBe(120);
  expect(await page.locator(".cx-grid").getAttribute("aria-rowcount")).toBe("2");
});

for (const [name, rowData, message] of [
  ["a script count that does not match", { columns: ["name"], count: 2, chunks: 2 }, "row data scripts"],
  ["rows out of their declared order", { columns: ["name"], count: 2, ordered: true, chunks: [[["b", "B"], ["a", "A"]]] }, "identity order"],
  ["a duplicate identity in a later chunk", { columns: ["name"], count: 2, chunks: [[["a", "A"]], [["a", "again"]]] }, "duplicate grid row ID"],
  ["fewer rows than declared", { columns: ["name"], count: 3, chunks: [[["a", "A"], ["b", "B"]]] }, "not 3"],
  ["an undeclared column", { columns: ["owner"], count: 0, chunks: [] }, "invalid grid rowData"]
]) {
  test("row data with " + name + " fails the query with a retry", async ({ page }) => {
    const view = compactView(rowData, { search: false });
    await page.route("http://canopyx.test/bad", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/bad");
    await expect(page.locator(".cx-grid-notice")).toContainText(message);
  });
}

test("rows and rowData together, or rowData on a host grid, are rejected when the grid is created", async ({ page }) => {
  await page.setContent("<!doctype html><html lang=\"en\"><head><title>x</title><script>" + runtimeAssets("grid").script + "</script></head><body></body></html>");
  const errors = await page.evaluate((view) => ["both", "host"].map((kind) => {
    try {
      CanopyX.createDataGrid(document.body.appendChild(document.createElement("div")), { view: kind === "both" ? { ...view, rows: [] } : { ...view, source: { kind: "host" } }, source: kind === "host" ? { query() {} } : undefined });
      return "created";
    } catch (error) { return error.message; }
  }), compactView({ columns: ["name"], count: 0, chunks: [] }));
  expect(errors).toEqual(["CanopyX: invalid grid rowData.", "CanopyX: invalid grid rowData."]);
});

test("a view parsed from the page keeps its rows; a host's view is copied", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "owned", label: "Owned", rowHeight: 32, pageSize: 50, selection: "none", search: false, columns,
    source: { kind: "inline" }, rows: chunk(0, 3).map(([id, name, size]) => ({ id, cells: { name, size } })) };
  await page.route("http://canopyx.test/owned", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/owned");
  await page.waitForSelector(".cx-row[data-cx-id]");
  const copied = await page.evaluate((definition) => {
    const host = document.body.appendChild(document.createElement("div"));
    const api = CanopyX.createDataGrid(host, { view: definition });
    definition.rows[0].cells.name = "Changed by the host";
    return api.view.rows[0].cells.name;
  }, view);
  expect(copied).toBe("Item 0");
  // The row data part registers itself like every part, and the grid entry point does not carry its decoder.
  expect(read("canopyx-data.js")).toContain('push(["data",part])');
  expect(read("canopyx-grid.js")).not.toContain("inflateRows");
});
