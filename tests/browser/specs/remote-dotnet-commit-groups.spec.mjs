import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { repo, nextFrames } from "./support.mjs";

// End to end against the fleet sample's editable page (/edit: gridCommit through POST /commit, saved to SQLite) and its
// two-level grouped page (/by-site-os: groupBy levels and nested gridSummary documents). The browser side of both comes
// from the editing and grouping parts; a runtime without them skips the tests that need them. Set CANOPYX_REMOTE_SAMPLE
// to a FleetInventory.dll to test another build.
const candidates = [process.env.CANOPYX_REMOTE_SAMPLE,
  ...["Release", "Debug"].map(configuration => path.join(repo, "samples/FleetInventory/bin", configuration, "net10.0/FleetInventory.dll"))].filter(Boolean);
const sample = candidates.find(file => fs.existsSync(file));
const api = "document.querySelector('[data-canopyx-host]').canopyx";
const rows = 5000;
let server, base, folder, parts = { editing: false, grouping: false };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.skip(!sample, "The fleet sample is not built: " + candidates.join(", "));
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer().once("error", reject).listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "canopyx-commit-groups-e2e-"));
  base = "http://127.0.0.1:" + port;
  server = spawn("dotnet", [sample, "--urls", base, "--database", path.join(folder, "fleet.db"), "--rows", String(rows)],
    { cwd: path.dirname(sample), stdio: "ignore", env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Production", DOTNET_NOLOGO: "1" } });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { if ((await fetch(base + "/api/machines-edit/view")).ok) break; } catch { }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("The fleet sample did not start.");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  // Single-file pages carry the parts their grids need; a runtime without the editing or grouping part has none to carry.
  parts = { editing: (await (await fetch(base + "/edit")).text()).includes("application/x-canopyx-editing"),
    grouping: (await (await fetch(base + "/by-site-os")).text()).includes("application/x-canopyx-grouping") };
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  if (folder) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
});

test.beforeEach(async ({ page }) => {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); });

async function open(page, url) {
  await page.goto(base + url);
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
}
const post = (page, path, body, headers = {}) => page.evaluate(async ({ path, body, headers }) => {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}, { path, body, headers });
/** A body cell by row id and column id, through the header's column index. */
async function cell(page, id, column) {
  const index = await page.locator('.cx-hcell[data-cx-column="' + column + '"]').getAttribute("aria-colindex");
  return page.locator('.cx-row[data-cx-id="' + id + '"] [aria-colindex="' + index + '"]');
}
async function edit(page, id, column, text) {
  const target = await cell(page, id, column);
  await target.click();
  await page.keyboard.press("F2");
  const editor = target.locator(".cx-editor");
  if (await editor.evaluate(element => element.tagName === "SELECT")) await editor.selectOption(text);
  else { await editor.fill(text); }
  await page.keyboard.press("Enter");
}
const save = async page => {
  const answer = page.waitForResponse(response => response.url().endsWith("/api/machines-edit/commit"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return (await answer).json();
};

test("saves edits through the commit endpoint, answers canonical cells and reloads at the new revision", async ({ page }) => {
  test.skip(!parts.editing, "The runtime has no editing part (feature/editing, #69).");
  await open(page, "/edit");
  const id = await page.locator(".cx-row[data-cx-id]").first().getAttribute("data-cx-id");
  const before = await page.evaluate(api => eval(api).getQuery().revision, api);
  await edit(page, id, "cores", "48");
  await edit(page, id, "memory", "96.5");
  await expect(page.locator(".cx-editbar-text")).toHaveText("Unsaved changes: 1");
  expect((await page.evaluate(api => eval(api).getChanges(), api)).map(change => [change.id, change.values])).toEqual([[id, { cores: 48, memory: 96.5 }]]);
  const queries = [];
  page.on("request", request => { if (request.url().endsWith("/api/machines-edit/query")) queries.push(JSON.parse(request.postData())); });
  const result = await save(page);
  expect(result.type).toBe("gridCommitResult");
  expect(result.rows).toEqual([{ id, status: "saved", cells: { cores: 48, memory: { value: 96.5, text: "96.5" } } }]);
  expect(result.revision).not.toBe(before);
  // The grid read pages at a revision the commit replaced; the remote script reloads it at the new one.
  await expect.poll(() => page.evaluate(api => eval(api).getQuery().revision, api)).toBe(result.revision);
  expect(queries.some(query => query.revision === undefined || query.revision === null)).toBe(true);
  await expect(await cell(page, id, "cores")).toHaveText("48");
  await expect(await cell(page, id, "memory")).toHaveText("96.5");
  await expect(await cell(page, id, "cores")).not.toHaveClass(/cx-dirty/);
});

for (const mixed of [false, true]) {
  test(`reloads after ${mixed ? "mixed" : "successful"} saves when the commit answer has no revision`, async ({ page }) => {
    await open(page, "/edit");
    const ids = await page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.slice(0, 2).map(row => row.dataset.cxId));
    const values = await Promise.all(ids.map(async id => Number((await (await cell(page, id, "memory")).textContent()).replace(/,/g, "")) + 1));
    const before = await page.evaluate(api => eval(api).getQuery().revision, api), queries = [];
    page.on("request", request => { if (request.url().endsWith("/api/machines-edit/query")) queries.push(JSON.parse(request.postData())); });
    await page.route("**/api/machines-edit/commit", async route => {
      const batch = route.request().postDataJSON();
      // A per-row writer may save one row and reject another. Only the saved row reaches the real sample's writer.
      const response = await route.fetch({ data: mixed ? { ...batch, rows: batch.rows.slice(0, 1) } : batch });
      const result = await response.json(); delete result.revision;
      if (mixed) result.rows.push({ id: batch.rows[1].id, status: "error", error: "The second row was not saved." });
      await route.fulfill({ response, json: result });
    });
    const result = await page.evaluate(async ({ api, ids, values, mixed }) => {
      const grid = eval(api); await grid.setCellValue(ids[0], "memory", values[0]);
      if (mixed) await grid.setCellValue(ids[1], "memory", values[1]);
      return grid.commitChanges();
    }, { api, ids, values, mixed });
    expect(result).toMatchObject({ saved: 1, failed: mixed ? 1 : 0 });
    expect(result.revision).toBeUndefined();
    await expect.poll(() => page.evaluate(api => eval(api).getQuery().revision, api)).not.toBe(before);
    expect(queries).toHaveLength(1); expect(queries[0].revision).toBeUndefined();
    expect(await page.evaluate(api => eval(api).getChanges().map(change => [change.id, change.status]), api))
      .toEqual(mixed ? [[ids[1], "error"]] : []);
    await expect(await cell(page, ids[0], "memory")).toHaveText(values[0].toFixed(1));
  });
}

for (const outcome of [{ saved: false, revision: false }, { saved: false, revision: true }, { saved: true, revision: true }]) {
  test(`keeps the accepted snapshot after ${outcome.saved ? "saved" : "failed"} rows with ${outcome.revision ? "the same" : "no"} revision`, async ({ page }) => {
    await open(page, "/edit");
    const id = await page.locator(".cx-row[data-cx-id]").first().getAttribute("data-cx-id");
    const before = await page.evaluate(api => eval(api).getQuery().revision, api), queries = [];
    page.on("request", request => { if (request.url().endsWith("/api/machines-edit/query")) queries.push(request.url()); });
    await page.route("**/api/machines-edit/commit", route => route.fulfill({ json: {
      protocol: "canopyx/2", type: "gridCommitResult", view: "machines-edit", ...(outcome.revision ? { revision: before } : {}),
      rows: [{ id, status: outcome.saved ? "saved" : "error", ...(!outcome.saved ? { error: "Not saved." } : {}) }]
    } }));
    const result = await page.evaluate(async ({ api, id }) => {
      const grid = eval(api); await grid.setCellValue(id, "memory", 107); return grid.commitChanges();
    }, { api, id });
    await nextFrames(page);
    expect(result).toMatchObject({ saved: outcome.saved ? 1 : 0, failed: outcome.saved ? 0 : 1 });
    expect(queries).toEqual([]); expect(await page.evaluate(api => eval(api).getQuery().revision, api)).toBe(before);
    expect(await page.evaluate(api => eval(api).hasChanges(), api)).toBe(!outcome.saved);
  });
}

test("reports a failed automatic post-save reload once and retries without an unhandled rejection", async ({ page }) => {
  // Register a real host callback before the adapter-configured view mounts.
  await page.route("**/edit", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("</head>", `<script>
      window.reloadErrors = []; window.reloadCallbacks = []; window.reloadRejections = [];
      document.addEventListener("canopyx:error", event => reloadErrors.push(event.detail.error.message), true);
      addEventListener("unhandledrejection", event => reloadRejections.push(event.reason.message));
      CanopyX.configure("machines-edit", { onError: event => reloadCallbacks.push(event.error.message) });
      </script></head>`) });
  });
  await open(page, "/edit");
  const before = await page.evaluate(api => eval(api).getQuery().revision, api);
  await page.route("**/api/machines-edit/query", route => route.fulfill({ status: 503, json: { message: "Refresh temporarily unavailable." } }));
  const result = await page.evaluate(async api => {
    const grid = eval(api), id = document.querySelector(".cx-row[data-cx-id]").dataset.cxId;
    await grid.setCellValue(id, "memory", 109); return grid.commitChanges();
  }, api);
  expect(result.saved).toBe(1);
  await expect(page.locator(".cx-grid-notice")).toContainText("Refresh temporarily unavailable.");
  await nextFrames(page);
  expect(await page.evaluate(() => ({ errors: reloadErrors, callbacks: reloadCallbacks, rejections: reloadRejections })))
    .toEqual({ errors: ["Refresh temporarily unavailable."], callbacks: ["Refresh temporarily unavailable."], rejections: [] });
  await page.unroute("**/api/machines-edit/query");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => page.evaluate(api => eval(api).getQuery().revision, api)).not.toBe(before);
  await expect(page.locator(".cx-grid-notice")).not.toBeVisible();
});

test("post-save reload keeps a newer pending query and retires only its superseded request", async ({ page }) => {
  await open(page, "/edit");
  const before = await page.evaluate(api => eval(api).getQuery().revision, api);
  let releaseCommit, releaseQuery;
  const heldCommit = new Promise(resolve => { releaseCommit = resolve; }), heldQuery = new Promise(resolve => { releaseQuery = resolve; });
  let committed = false, queryHeld = false; const queries = [];
  await page.route("**/api/machines-edit/commit", async route => {
    const response = await route.fetch(); committed = true; await heldCommit;
    await route.fulfill({ response });
  });
  await page.route("**/api/machines-edit/query", async route => {
    const query = route.request().postDataJSON(); queries.push(query);
    if (!queryHeld) { queryHeld = true; await heldQuery; await route.continue().catch(() => {}); }
    else await route.continue();
  });
  try {
    await page.evaluate(async api => {
      const grid = eval(api), id = document.querySelector(".cx-row[data-cx-id]").dataset.cxId;
      await grid.setCellValue(id, "memory", 113); window.postSave = grid.commitChanges();
    }, api);
    await expect.poll(() => committed).toBe(true);
    await page.evaluate(api => { window.pendingSort = eval(api).sort([{ column: "name", direction: "desc" }]).catch(error => error.name); }, api);
    await expect.poll(() => queryHeld).toBe(true); releaseCommit();
    expect((await page.evaluate(() => postSave)).saved).toBe(1);
    await expect.poll(() => page.evaluate(api => eval(api).getQuery().revision, api)).not.toBe(before);
    expect(await page.evaluate(api => eval(api).getQuery().sort, api)).toEqual([{ column: "name", direction: "desc" }]);
    expect(await page.evaluate(() => pendingSort)).toBe("AbortError");
    expect(queries).toHaveLength(2); expect(queries.every(query => query.sort[0].direction === "desc" && query.revision === undefined)).toBe(true);
  } finally { releaseCommit(); releaseQuery(); }
});

for (const cancel of ["caller", "destroy"]) {
  test(`a ${cancel === "caller" ? "caller-cancelled" : "destroyed"} save does not schedule a post-save reload`, async ({ page }) => {
    await open(page, "/edit");
    let release, reached = false; const held = new Promise(resolve => { release = resolve; }), queries = [];
    await page.route("**/api/machines-edit/commit", async route => { reached = true; await held; await route.abort().catch(() => {}); });
    page.on("request", request => { if (request.url().endsWith("/api/machines-edit/query")) queries.push(request.url()); });
    try {
      await page.evaluate(async api => {
        const grid = eval(api), id = document.querySelector(".cx-row[data-cx-id]").dataset.cxId;
        await grid.setCellValue(id, "memory", 127); window.saveController = new AbortController();
        window.cancelledSave = grid.commitChanges({ signal: saveController.signal });
      }, api);
      await expect.poll(() => reached).toBe(true);
      await page.evaluate(({ api, cancel }) => cancel === "caller" ? saveController.abort() : eval(api).destroy(), { api, cancel });
      expect(await page.evaluate(() => cancelledSave)).toMatchObject({ saved: 0, failed: 1 });
      await nextFrames(page); expect(queries).toEqual([]);
    } finally { release(); }
  });
}

test("refuses values the server checks again, columns that are not editable and oversized batches", async ({ page }) => {
  test.skip(!parts.editing, "The runtime has no editing part (feature/editing, #69).");
  await open(page, "/edit");
  const revision = await page.evaluate(api => eval(api).getQuery().revision, api);
  const invalid = await post(page, "/api/machines-edit/commit", { protocol: "canopyx/2", type: "gridCommit", view: "machines-edit", revision, rows: [
    { id: "2", values: { cores: 0, name: "Bad Name", os: "Plan 9" }, original: { cores: 16, name: "x", os: "Windows" } },
    { id: "3", values: { memory: 10 }, original: { memory: 9 } }] });
  expect(invalid.status).toBe(200);
  expect(invalid.body.rows[0]).toEqual({ id: "2", status: "error", errors: {
    cores: "Cores must be at least 1.", name: "Use 1 to 40 lowercase letters, digits and hyphens.", os: "Choose Operating system from the list." } });
  expect(invalid.body.rows[1].status).toBe("saved");
  const forbidden = await post(page, "/api/machines-edit/commit", { revision, rows: [{ id: "2", values: { team: "Data" }, original: { team: "Edge" } }] });
  expect(forbidden).toEqual({ status: 400, body: { error: "columnNotEditable", message: "The column cannot be edited on this endpoint." } });
  const large = await post(page, "/api/machines-edit/commit", { revision, rows: Array.from({ length: 101 }, (_, i) => ({ id: String(i + 1), values: { memory: 1 }, original: { memory: 1 } })) });
  expect(large.status).toBe(400);
  expect(large.body.error).toBe("limitExceeded");
  const readOnly = await post(page, "/api/machines/commit", { revision, rows: [{ id: "2", values: { memory: 1 }, original: { memory: 1 } }] });
  expect([404, 405]).toContain(readOnly.status);
});

test("shows a conflict when another user changed the row, and saves untouched rows of a stale batch", async ({ page }) => {
  test.skip(!parts.editing, "The runtime has no editing part (feature/editing, #69).");
  await open(page, "/edit");
  const ids = await page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.slice(3, 5).map(row => row.getAttribute("data-cx-id")));
  const [changed, untouched] = ids;
  await edit(page, changed, "memory", "77");
  await edit(page, untouched, "model", "Tower");
  // The page's demonstration plays another user: it changes the first machine's memory (and more) and the revision.
  await page.evaluate(id => eval("document.querySelector('[data-canopyx-host]').canopyx").setSelection([id]), changed);
  await page.getByRole("button", { name: "Simulate another user's change" }).click();
  await expect(page.locator("#fleet-status")).toContainText("Another user changed machine " + changed);
  const result = await save(page);
  const byId = Object.fromEntries(result.rows.map(row => [row.id, row]));
  expect(byId[changed]).toEqual({ id: changed, status: "conflict", error: "Someone else changed this row. Reload it and try again." });
  expect(byId[untouched].status).toBe("saved");
  // The grid applies the answer after the response arrives; WebKit reports the response before the page has read it.
  await expect.poll(async () => (await page.evaluate(api => eval(api).getChanges(), api)).map(change => [change.id, change.status])).toEqual([[changed, "conflict"]]);
  await expect(page.locator('.cx-row[data-cx-id="' + changed + '"]')).toHaveClass(/cx-row-invalid/);
  // The stored memory is the other user's, not the reader's.
  const memory = await page.evaluate(async id => {
    const page = await fetch("/api/machines-edit/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 50 }) }).then(r => r.json());
    return page.items.find(item => item.id === id).cells.memory.value;
  }, changed);
  expect(memory).not.toBe(77);
});

test("edits and saves at phone width", async ({ page }) => {
  test.skip(!parts.editing, "The runtime has no editing part (feature/editing, #69).");
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/edit");
  const row = page.locator(".cx-row[data-cx-id]").nth(6);
  const id = await row.getAttribute("data-cx-id");
  await page.evaluate(({ api, id }) => eval(api).setCellValue(id, "cores", 4), { api, id });
  const result = await save(page);
  expect(result.rows).toEqual([{ id, status: "saved", cells: { cores: 4 } }]);
});

test("serves two grouping levels with nested summaries, aggregate order and distinct counts", async ({ page }) => {
  test.skip(!parts.grouping, "The runtime has no grouping part (feature/grouping-master-detail, #72).");
  const summaries = [];
  page.on("request", request => { if (request.url().endsWith("/api/machines-by-site-os/summary")) summaries.push(JSON.parse(request.postData())); });
  await open(page, "/by-site-os");
  const summary = await page.evaluate(api => eval(api).getSummary(), api);
  expect(summary.query.groupBy).toEqual([{ column: "site", direction: "desc", aggregate: "machines" }, { column: "os", direction: "asc" }]);
  expect(summaries.at(-1).groupBy).toEqual(summary.query.groupBy);
  const sites = summary.groups;
  // Busiest sites first; the missing site is its own last-ordered group only when its count says so.
  for (let i = 1; i < sites.length; i++) expect(sites[i - 1].aggregates.machines).toBeGreaterThanOrEqual(sites[i].aggregates.machines);
  const keys = new Set();
  let offset = 0;
  for (const site of sites) {
    expect(site.offset).toBe(offset);
    let inner = site.offset;
    for (const group of site.groups) {
      expect(group.offset).toBe(inner);
      expect(group.key.startsWith("2:")).toBe(true);
      expect(group.groups).toBeUndefined();
      inner += group.count;
      keys.add(group.key);
    }
    expect(inner).toBe(site.offset + site.count);
    keys.add(site.key);
    offset += site.count;
  }
  expect(offset).toBe(rows);
  expect(keys.size).toBe(sites.length + sites.reduce((total, site) => total + site.groups.length, 0));
  expect(summary.aggregates.models).toBe(7);
  // A treegrid: headings carry their level, records follow the innermost heading.
  await expect(page.locator('[role="treegrid"]')).toHaveCount(1);
  await expect(page.locator('.cx-row[aria-level="1"]').first()).toBeVisible();
  await expect(page.locator('.cx-row[aria-level="2"]').first()).toBeVisible();
});

test("regroups at runtime through groupBy and keeps pages inside their groups", async ({ page }) => {
  test.skip(!parts.grouping, "The runtime has no grouping part (feature/grouping-master-detail, #72).");
  await open(page, "/by-site-os");
  await page.evaluate(api => eval(api).setGroupBy([{ column: "online", direction: "desc" }, { column: "model", direction: "asc", aggregate: "memory" }]), api);
  await expect.poll(() => page.evaluate(api => eval(api).getSummary()?.query.groupBy?.[0]?.column, api)).toBe("online");
  const summary = await page.evaluate(api => eval(api).getSummary(), api);
  expect(summary.groups.map(group => group.value)).toEqual([true, false]);
  for (const online of summary.groups) {
    const totals = online.groups.map(group => group.aggregates.memory);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  }
  // Every loaded record lies in the groups the summary gives its position.
  const check = await page.evaluate(async ({ api, summary }) => {
    const grid = eval(api);
    const response = await fetch("/api/machines-by-site-os/query", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...grid.getQuery(), offset: 0, limit: 1000 }) });
    const page = await response.json();
    let wrong = 0;
    for (const online of summary.groups) for (const model of online.groups)
      for (let i = model.offset; i < Math.min(model.offset + model.count, page.items.length); i++) {
        const cells = page.items[i].cells;
        if (cells.online !== online.value || cells.model !== model.value) wrong++;
      }
    return { wrong, read: page.items.length };
  }, { api, summary });
  expect(check).toEqual({ wrong: 0, read: 1000 });
  const ungrouped = await page.evaluate(api => eval(api).setGroupBy([]).then(() => eval(api).getSummary()), api);
  expect(ungrouped.groups).toEqual([]);
});

test("collapses a heading from the keyboard", async ({ page }) => {
  test.skip(!parts.grouping, "The runtime has no grouping part (feature/grouping-master-detail, #72).");
  await open(page, "/by-site-os");
  const heading = page.locator('.cx-row[aria-level="1"]').first();
  await heading.focus();
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(heading).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(api => eval(api).getCollapsedGroups().length, api)).toBe(1);
});
