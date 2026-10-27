import { test, expect } from "@playwright/test";
import { api, definition, drawer, certificate } from "./record-panel-fixtures.mjs";
import { viewPage, openExample, exampleUrl } from "./support.mjs";

// A page whose grid's record details load on demand: the rows carry no fields, the host answers gridRecordQuery documents.
// mode: "loader" (the loadRecord option) or "hosted" (a host source with query and record, as a remote protocol client has).
function onDemandPage(mode, extra = "") {
  const view = definition();
  const records = Object.fromEntries(view.rows.map(row => [row.id, row.fields]));
  view.rows.forEach(row => delete row.fields);
  view.record.source = { kind: "host" };
  // The related list carries two rows of five; Load more asks for the rest.
  for (const id of Object.keys(records)) records[id].related.records = { ...records[id].related.records, rows: records[id].related.records.rows.slice(0, 2), total: 5, pageSize: 2 };
  const rows = view.rows;
  if (mode === "hosted") { view.source = { kind: "host" }; delete view.rows; }
  const page = viewPage(view);
  const script = `<script>
window.requests = []; window.failures = 0;
const records = ${JSON.stringify(records)}, rows = ${JSON.stringify(rows)};
function answer(request, options) {
  window.requests.push(request);
  if (options.signal.aborted) throw new DOMException("cancelled", "AbortError");
  if (window.failures > 0) { window.failures--; return Promise.reject(new Error("record service unavailable")); }
  const base = { protocol: "canopyx/2", type: "gridRecord", view: request.view, id: request.id };
  if (request.field) {
    const page = Array.from({ length: Math.min(request.limit, 5 - request.offset) }, (_, n) => ({ id: "x" + (request.offset + n), cells: { cn: "extra" + (request.offset + n) + ".example.test", status: "Valid" } }));
    return new Promise(resolve => setTimeout(() => resolve({ ...base, fields: { [request.field]: { records: { columns: [], rows: page, total: 5 } } } }), 20));
  }
  const fields = records[request.id];
  if (!fields) return Promise.resolve(null);
  return new Promise(resolve => {
    const complete = () => resolve({ ...base, fields, ...(request.row ? { row: rows.find(row => row.id === request.id) } : {}) });
    if (window.holdRecord) window.releaseRecord = () => { window.holdRecord = false; complete(); };
    else setTimeout(complete, 20);
  });
}
const source = { query(query) { const matched = rows.filter(row => row.cells.cn.value.includes(query.search)), items = matched.slice(query.offset, query.offset + query.limit);
  return { protocol: "canopyx/2", type: "gridPage", view: "certificates", revision: "r7", offset: query.offset, total: rows.length, matched: matched.length, items }; },
  record: answer };
CanopyX.configure("certificates", ${mode === "hosted" ? "{ source }" : "{ loadRecord: answer }"});
${extra}
</script>`;
  return page.replace("<body class=\"cx-page\">", "<body class=\"cx-page\">" + script);
}
async function openOnDemand(page, mode, extra) {
  await page.route("http://canopyx.test/records.html", route => route.fulfill({ contentType: "text/html", body: onDemandPage(mode, extra) }));
  await page.goto("http://canopyx.test/records.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
}

test("a host mutation reloads one cached record without changing the grid revision", async ({ page }) => {
  await openOnDemand(page, "loader", "window.changeRecord = () => { records.c001.thumbprint = 'Reloaded evidence'; };");
  await page.evaluate(api + ".openRecord('c001')");
  await drawer(page).getByRole("tab",{name:"Fields",exact:true}).click();
  await expect(drawer(page).getByText("A1B2C3D4E5F60001", {exact:true})).toBeVisible();
  await drawer(page).getByRole("button",{name:"Close",exact:true}).click();
  const before = await page.evaluate(() => window.requests.length);
  await page.evaluate(() => window.changeRecord());
  await page.evaluate(api + ".openRecord('c001')");
  expect(await page.evaluate(() => window.requests.length)).toBe(before);
  await page.evaluate(api + ".openRecord('c001', {reload:true})");
  await drawer(page).getByRole("tab",{name:"Fields",exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(before + 1);
  await expect(drawer(page).getByText("Reloaded evidence", {exact:true})).toBeVisible();
});

for (const mode of ["loader", "hosted"]) test("load on demand (" + mode + "): the drawer shows the row at once and the record's fields when they arrive", async ({ page }) => {
  await openOnDemand(page, mode, "window.holdRecord = true;");
  await page.evaluate(api + ".openDetails('c001')");
  await expect(drawer(page).locator(".cx-record-note")).toHaveText("Loading…");
  await expect(drawer(page).locator(".cx-record-status")).toHaveText("Expiring");
  await expect(drawer(page).locator('dd[data-cx-field="team"]')).toHaveCount(0);
  await page.evaluate("window.releaseRecord()");
  await expect(drawer(page).locator('dd[data-cx-field="team"]')).toHaveText("Platform");
  await expect(drawer(page).locator(".cx-record-note")).toHaveCount(0);
  const request = await page.evaluate("window.requests[0]");
  expect(request).toEqual(mode === "hosted" ? { protocol: "canopyx/2", type: "gridRecordQuery", view: "certificates", id: "c001", revision: "r7" } :
    { protocol: "canopyx/2", type: "gridRecordQuery", view: "certificates", id: "c001" });
  // A record loads once; stepping back to it reads the cache.
  await drawer(page).locator("h4").focus();
  await page.keyboard.press("ArrowDown");
  await expect(drawer(page).locator('dd[data-cx-field="team"]')).toHaveText("Platform");
  await page.keyboard.press("ArrowUp");
  await expect(drawer(page).locator("h4")).toHaveText("host1.example.test");
  expect(await page.evaluate("window.requests.map(request => request.id)")).toEqual(["c001", "c002"]);
});

test("a failed load says so with Retry; the next attempt succeeds", async ({ page }) => {
  await openOnDemand(page, "loader", "window.failures = 1;");
  const errors = page.evaluate(() => new Promise(resolve => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:error", event => resolve(event.detail.error.message), { once: true })));
  await page.evaluate(api + ".openDetails('c001')");
  const note = drawer(page).locator(".cx-record-error");
  await expect(note).toContainText("Could not load the record details: record service unavailable");
  await expect(note).toHaveAttribute("role", "alert");
  await note.getByRole("button", { name: "Retry" }).click();
  await expect(drawer(page).locator('dd[data-cx-field="team"]')).toHaveText("Platform");
  expect(await errors).toBeTruthy();
});

test("a collection pages past what it carries: Load more asks for the field's next rows", async ({ page }) => {
  await openOnDemand(page, "loader");
  await page.evaluate(api + ".openDetails('c001')");
  await drawer(page).getByRole("tab", { name: "Related" }).click();
  const block = drawer(page).locator('.cx-record-block-b[data-cx-field="related"]');
  await expect(block.locator(".cx-record-count")).toHaveText("2 of 5");
  await block.getByRole("button", { name: "Load more" }).click();
  await expect(drawer(page).locator('.cx-record-block-b[data-cx-field="related"] .cx-record-count')).toHaveText("4 of 5");
  expect(await page.evaluate("window.requests.at(-1)")).toEqual({ protocol: "canopyx/2", type: "gridRecordQuery", view: "certificates", id: "c001", field: "related", offset: 2, limit: 2 });
  await drawer(page).locator('.cx-record-block-b[data-cx-field="related"]').getByRole("button", { name: "Load more" }).click();
  await expect(drawer(page).locator('.cx-record-block-b[data-cx-field="related"] .cx-record-nested .cx-row[data-cx-id]')).toHaveCount(5);
  await expect(drawer(page).locator('.cx-record-block-b[data-cx-field="related"]').getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("a record outside the loaded rows opens through the source ({ row: true }), as a deep link does", async ({ page }) => {
  await openOnDemand(page, "hosted");
  await page.evaluate(api + ".setQuery({ search: 'host1.' })");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  await page.evaluate(api + ".openRecord('c011')");
  await expect(drawer(page).locator("h4")).toHaveText("host5.example.test");
  expect(await page.evaluate("window.requests.find(request => request.row)")).toMatchObject({ id: "c011", row: true });
});

test("record packs beside a single-file page load from file:// when a drawer opens", async ({ page }) => {
  const scripts = [];
  page.on("request", request => { if (request.url().includes("/records/")) scripts.push(request.url()); });
  await openExample(page, "certificate-sidecar/index.html");
  await page.locator('.cx-row[data-cx-id="cert-0007"]').click();
  await expect(drawer(page).locator("h4")).toHaveText("app7.example.com");
  await drawer(page).getByRole("tab", { name: "Issuance" }).click();
  await expect(drawer(page).locator('dd[data-cx-field="authority"]')).toHaveText("Example Public CA");
  expect(page.url()).toMatch(/^file:/);
  // One pack holds many records: the next record of the same pack needs no new file.
  const packs = await page.evaluate(() => [...document.scripts].length);
  expect(packs).toBeGreaterThan(0);
});

for (const [name, base] of [["query", "records?version/"], ["fragment", "records#archive/"], ["empty", ""]])
test("record sidecar base: " + name + " is rejected before loading a script", async ({ page }) => {
  const view = definition({}, 1), requests = [];
  view.record.source = { kind: "sidecar", base, shards: 1 };
  delete view.rows[0].fields;
  await page.route("http://canopyx.test/**", route => {
    if (route.request().resourceType() === "document") return route.fulfill({ contentType: "text/html", body: viewPage(view) });
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto("http://canopyx.test/records.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  const error = page.evaluate(() => new Promise(resolve => document.querySelector("[data-canopyx-host]")
    .addEventListener("canopyx:error", event => resolve(event.detail.error.message), { once: true })));
  await page.evaluate(api + ".openDetails('c000')");
  const message = await error;
  expect(requests).toEqual([]);
  expect(message).toContain("record sidecar base must be a non-empty folder path without a query or fragment");
  await expect(drawer(page).locator("h4")).toHaveText("host0.example.test");
});

for (const [name, base] of [["relative spaces and Unicode", "record packs/Łódź/"], ["absolute web folder", "https://packs.test/archive/"]])
test("record sidecar base: " + name + " loads and retries a missing pack", async ({ page }) => {
  const view = definition({}, 1), requests = [], url = new URL(base + "r0.js", "http://canopyx.test/records.html").href;
  view.record.source = { kind: "sidecar", base, shards: 1 };
  delete view.rows[0].fields;
  await page.route(url, route => {
    requests.push(route.request().url());
    if (requests.length === 1) return route.abort();
    return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["certificates", "r0", ${JSON.stringify({
      protocol: "canopyx/2", type: "gridRecordPack", view: "certificates", records: [{ id: "c000", fields: { team: "Loaded team" } }]
    })}]);` });
  });
  await page.route("http://canopyx.test/records.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/records.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  await page.evaluate(api + ".openDetails('c000')");
  const error = drawer(page).locator(".cx-record-error");
  await expect(error).toContainText("Sidecar file is missing: r0");
  await error.getByRole("button", { name: "Retry" }).click();
  await expect(drawer(page).locator('dd[data-cx-field="team"]')).toHaveText("Loaded team");
  expect(requests).toEqual([url, url]);
});

test("the inline example embeds every record's fields, the sidecar page none", async () => {
  const fs = await import("node:fs");
  const inline = fs.readFileSync(new URL(exampleUrl("certificate-inventory.html")), "utf8"), sidecar = fs.readFileSync(new URL(exampleUrl("certificate-sidecar/index.html")), "utf8");
  expect(inline).toContain("\"thumbprint\":");
  expect(sidecar).not.toContain("\"thumbprint\":");
  expect(sidecar).toContain("\"source\":{\"kind\":\"sidecar\",\"base\":\"records/\",\"shards\":16}");
  // Pages carry the record panel part only when a view uses it.
  expect(inline).toContain("application/x-canopyx-record-panel");
  expect(fs.readFileSync(new URL(exampleUrl("orders-by-region.html")), "utf8")).not.toContain("application/x-canopyx-record-panel");
});

test("certificate() fixtures stay consistent", () => {
  expect(certificate(1, 12).cells.cn.value).toBe("host1.example.test");
});
