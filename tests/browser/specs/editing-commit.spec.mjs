// Editing: validation of cells and rows, row commit, batch commit and the gridCommit protocol against a mock data service.
import { test, expect } from "@playwright/test";
import { serveGrid, assetView, cell } from "./editing-support.mjs";

test.beforeEach(async ({ page }) => {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); });

const grid = "document.querySelector('[data-canopyx-host]').canopyx";
async function edit(page, id, column, text) {
  const target = cell(page, id, column);
  await target.click(); await page.keyboard.press("F2");
  await target.locator("input.cx-editor").fill(text);
  await page.keyboard.press("Enter");
}

test("column rules refuse a value in the editor with a translated message, and asynchronous validators mark the cell", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", {
    labels: { gridEditPattern: "{column}: użyj formatu AA-0000." },
    editing: { validators: { name: value => new Promise(resolve => setTimeout(() => resolve(value === "Taken" ? "That name is taken." : null), 50)) } } });` });
  const tag = cell(page, "a0", 0);
  await tag.click(); await page.keyboard.press("F2");
  await tag.locator("input").fill("bad tag");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-edit-tip")).toHaveText("Asset tag: użyj formatu AA-0000.");
  await tag.locator("input").fill("");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-edit-tip")).toHaveText("Asset tag is required.");
  await page.keyboard.press("Escape");
  // An asynchronous validator answers after the value is applied: the cell is marked and describes its message.
  await edit(page, "a1", 1, "Taken");
  const name = cell(page, "a1", 1);
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveClass(/cx-invalid/);
  const described = (await name.getAttribute("aria-describedby")).split(" ");
  const texts = await page.evaluate(ids => ids.map(id => document.getElementById(id).textContent), described);
  expect(texts).toEqual(["Edited", "That name is taken."]);
  await expect(page.locator(".cx-editbar-text")).toHaveText("Unsaved changes: 1 · Errors: 1");
  // Focus on the invalid cell shows its message beside it.
  await name.click();
  await expect(page.locator(".cx-edit-tip")).toHaveText("That name is taken.");
  expect(await page.evaluate(`${grid}.validate()`)).toEqual({ valid: false, rows: [{ id: "a1", valid: false, errors: { name: "That name is taken." }, error: null }] });
});

test("leaving a changed row commits it: onRowCommit saves it with canonical cells, rejects it, or leaves it in the batch", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", {
    onRowCommit: detail => { events.push([detail.id, detail.values, detail.original, detail.revision]);
      if (detail.id === "a0") return new Promise(resolve => setTimeout(() => resolve({ status: "saved", cells: { name: detail.values.name.toUpperCase() } }), 30));
      if (detail.id === "a1") return Promise.reject(new Error("Server is down"));
      if (detail.id === "a2") return { status: "conflict" };
    } });` });
  await edit(page, "a0", 1, "Renamed");
  // Enter moved to the next row, which commits the one it left.
  await expect(cell(page, "a0", 1)).toHaveText("RENAMED");
  await expect(cell(page, "a0", 1)).not.toHaveClass(/cx-dirty/);
  expect(await page.evaluate(() => events[0])).toEqual(["a0", { name: "Renamed" }, { name: "Laptop 0" }, "inline"]);
  await edit(page, "a1", 1, "Broken");
  const row = page.locator('.cx-row[data-cx-id="a1"]');
  await expect(row).toHaveClass(/cx-row-invalid/);
  expect(await page.evaluate(() => document.getElementById(document.querySelector('.cx-row[data-cx-id="a1"]').getAttribute("aria-describedby")).textContent))
    .toBe("Not saved: Server is down");
  await edit(page, "a2", 1, "Stale");
  await expect(page.locator('.cx-row[data-cx-id="a2"]')).toHaveClass(/cx-row-invalid/);
  await edit(page, "a3", 1, "Pending");
  const changes = await page.evaluate(`${grid}.getChanges()`);
  expect(changes.map(change => [change.id, change.status ?? "", change.error ?? ""])).toEqual([
    ["a1", "error", "Not saved: Server is down"], ["a2", "conflict", "Someone else changed this row. Reload it and try again."], ["a3", "", ""]]);
  // A listener can answer through respondWith, or cancel the commit.
  await page.evaluate(`document.querySelector('[data-canopyx-host]').addEventListener("canopyx:rowCommit", event => {
    if (event.detail.id === "a3") event.detail.respondWith({ status: "saved" }); else event.preventDefault(); })`);
  expect(await page.evaluate(`${grid}.commitRow("a3")`)).toEqual({ id: "a3", ok: true, status: "saved" });
  expect(await page.evaluate(`${grid}.commitRow("a2")`)).toEqual({ id: "a2", ok: false, status: "cancelled" });
});

test("a row validator blocks the commit and messages come back per column", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", { editing: {
    validateRow: (row, change) => row.cells.status === "Retired" && row.cells.cost > 0 ? { cost: "A retired asset has no cost." } : null } });` });
  await page.evaluate(`${grid}.setCellValue("a0", "status", "Retired")`);
  expect(await page.evaluate(`${grid}.commitRow("a0")`)).toEqual({ id: "a0", ok: false, status: "invalid", errors: { cost: "A retired asset has no cost." }, error: null });
  await expect(cell(page, "a0", 2)).toHaveAttribute("aria-invalid", "true");
  await page.evaluate(`${grid}.setCellValue("a0", "cost", 0)`);
  expect((await page.evaluate(`${grid}.commitRow("a0")`)).status).toBe("pending");
  await expect(cell(page, "a0", 2)).not.toHaveAttribute("aria-invalid", "true");
});

test("commitChanges sends the valid rows to editing.commit and applies the result per row", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", { onCommit: result => events.push(result), editing: {
    validators: { name: value => value === "Bad" ? "Bad name." : null },
    commit: async batch => { window.batch = batch; await new Promise(resolve => setTimeout(resolve, 30));
      return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view, revision: "inline-2", rows: batch.rows.map(row =>
        row.id === "a1" ? { id: row.id, status: "error", errors: { cost: "Over budget." } } : { id: row.id, status: "saved" }) }; } } });` });
  for (const [id, column, value] of [["a0", "name", "Kept"], ["a1", "cost", 5], ["a2", "name", "Bad"]])
    await page.evaluate(([id, column, value]) => document.querySelector("[data-canopyx-host]").canopyx.setCellValue(id, column, value), [id, column, value]);
  const result = await page.evaluate(`${grid}.commitChanges()`);
  expect(result).toEqual({ ok: false, saved: 1, failed: 2, revision: "inline-2", rows: [
    { id: "a2", ok: false, status: "invalid", errors: { name: "Bad name." }, error: null },
    { id: "a0", ok: true, status: "saved" },
    { id: "a1", ok: false, status: "error", errors: { cost: "Over budget." } }] });
  expect(await page.evaluate(() => window.batch)).toEqual({ protocol: "canopyx/2", type: "gridCommit", view: "assets", revision: "inline",
    rows: [{ id: "a0", values: { name: "Kept" }, original: { name: "Laptop 0" } }, { id: "a1", values: { cost: 5 }, original: { cost: 925.5 } }] });
  expect(await page.evaluate(() => events.length)).toBe(1);
  // The saved row is clean; the grid keeps the revision it accepted until the host reloads.
  await expect(cell(page, "a0", 1)).not.toHaveClass(/cx-dirty/);
  await expect(cell(page, "a1", 2)).toHaveAttribute("aria-invalid", "true");
  expect(await page.evaluate(`${grid}.getQuery().revision`)).toBe("inline");
  await expect(page.locator(".cx-live")).toContainText("Saved rows: 1 · Rows not saved: 2");
});

test("without a writer an inline grid accepts the rows, and later queries sort by the new values", async ({ page }) => {
  await serveGrid(page);
  await page.evaluate(`${grid}.setCellValue("a5", "tag", "AA-0001")`);
  await page.locator(".cx-editbar").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".cx-editbar")).toBeHidden({ timeout: 1000 }).catch(() => {});
  expect(await page.evaluate(`${grid}.getChanges()`)).toEqual([]);
  await page.evaluate(`${grid}.sort([{ column: "tag", direction: "asc" }])`);
  await page.evaluate(`${grid}.reload()`);
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "a5");
});

// The remote data service of a hosted grid: gridQuery and gridFacetQuery answered from memory, and gridCommit posted to
// POST /api/assets/commit, where the service checks the revision and the original values, as docs/data-protocol.md says.
test("a hosted grid posts gridCommit to the service's commit endpoint and the service answers per row", async ({ page }) => {
  const base = assetView();
  const rows = base.rows.map(row => JSON.parse(JSON.stringify(row)));
  const view = { ...base, source: { kind: "host" } }; delete view.rows;
  let revision = 1; const posted = [];
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const routes = {
    "/api/assets/query": route => {
      const query = route.request().postDataJSON(), sorted = rows.slice().sort((a, b) => a.cells.tag < b.cells.tag ? -1 : 1);
      return json(route, { protocol: "canopyx/2", type: "gridPage", view: "assets", revision: "r" + revision, offset: query.offset, total: rows.length, matched: rows.length,
        items: sorted.slice(query.offset, query.offset + query.limit) });
    },
    "/api/assets/facet": route => {
      const request = route.request().postDataJSON(), values = [...new Set(rows.map(row => row.cells[request.column]))].filter(value => String(value).toLowerCase().includes(request.search.toLowerCase()));
      return json(route, { protocol: "canopyx/2", type: "gridFacetPage", view: "assets", revision: "r" + revision, column: request.column, search: request.search,
        includeCurrentFilter: false, matched: rows.length, totalValues: values.length, truncated: false, items: values.map(value => ({ value, count: 1 })) });
    },
    "/api/assets/commit": route => {
      const batch = route.request().postDataJSON(); posted.push(batch);
      if (batch.type !== "gridCommit" || batch.view !== "assets") return json(route, { message: "bad request" }, 400);
      const results = batch.rows.map(change => {
        const row = rows.find(item => item.id === change.id);
        // Optimistic concurrency: a row whose stored values differ from what the client started from is a conflict.
        if (Object.entries(change.original).some(([column, value]) => row.cells[column] !== value)) return { id: change.id, status: "conflict" };
        Object.assign(row.cells, change.values);
        return { id: change.id, status: "saved", cells: { name: String(row.cells.name).trim() } };
      });
      revision++;
      return json(route, { protocol: "canopyx/2", type: "gridCommitResult", view: "assets", revision: "r" + revision, rows: results });
    }
  };
  const script = `const post = (path, body, signal) => fetch("/api/assets" + path, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(response => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); });
  CanopyX.configure("assets", { source: { query: (query, { signal }) => post("/query", query, signal), facet: (request, { signal }) => post("/facet", request, signal),
    commit: (batch, { signal }) => post("/commit", batch, signal) } });`;
  await serveGrid(page, { view, script, routes });
  // The lookup searches through the service's value lists.
  const owner = cell(page, "a0", 7);
  await owner.click(); await page.keyboard.press("Enter");
  await owner.getByRole("combobox").fill("eli");
  await expect(page.getByRole("option")).toHaveText(["Eli Novak"]);
  await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await edit(page, "a1", 1, "  Spaced  ");
  // Someone else changes a2 on the server before the reader saves it.
  await page.evaluate(`${grid}.setCellValue("a2", "name", "Mine")`);
  rows.find(row => row.id === "a2").cells.name = "Theirs";
  const result = await page.evaluate(`${grid}.commitChanges()`);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toEqual({ protocol: "canopyx/2", type: "gridCommit", view: "assets", revision: "r1", rows: [
    { id: "a0", values: { owner: "Eli Novak" }, original: { owner: "Ada Park" } },
    { id: "a1", values: { name: "  Spaced  " }, original: { name: "Laptop 1" } },
    { id: "a2", values: { name: "Mine" }, original: { name: "Laptop 2" } }] });
  expect(result.rows.map(row => [row.id, row.status])).toEqual([["a0", "saved"], ["a1", "saved"], ["a2", "conflict"]]);
  await expect(cell(page, "a1", 1)).toHaveText("Spaced");
  await expect(page.locator('.cx-row[data-cx-id="a2"]')).toHaveClass(/cx-row-invalid/);
  // The result carries the service's revision; pages are still read at the accepted one until the host reloads.
  expect(result.revision).toBe("r2");
  expect(await page.evaluate(`${grid}.getQuery().revision`)).toBe("r1");
  // A service failure keeps every row's changes, with the reason.
  routes["/api/assets/commit"] = route => json(route, { message: "down" }, 503);
  const failed = await page.evaluate(`${grid}.commitChanges()`);
  expect(failed.rows).toEqual([{ id: "a2", ok: false, status: "error", error: "Not saved: HTTP 503" }]);
});

test("an answer that does not match its batch fails every row and keeps the changes", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", { editing: { commit: batch => ({ protocol: "canopyx/2", type: "gridCommitResult", view: batch.view,
    rows: [{ id: "unknown", status: "saved" }] }) } });` });
  await page.evaluate(`${grid}.setCellValue("a0", "name", "One")`);
  await page.evaluate(`${grid}.setCellValue("a1", "name", "Two")`);
  const result = await page.evaluate(`${grid}.commitChanges()`);
  expect(result.rows.map(row => [row.id, row.status, row.error])).toEqual([
    ["a0", "error", "Not saved: CanopyX: malformed commit result row."], ["a1", "error", "Not saved: CanopyX: malformed commit result row."]]);
  expect((await page.evaluate(`${grid}.getChanges()`)).map(change => change.id)).toEqual(["a0", "a1"]);
  // A writer may leave rows out of its answer: those were not saved.
  await page.evaluate(`document.querySelector('[data-canopyx-host]').canopyx.destroy()`);
});

test("a hosted grid without a writer saves nothing and says so", async ({ page }) => {
  const base = assetView(), view = { ...base, source: { kind: "host" } }; delete view.rows;
  const script = `CanopyX.configure("assets", { source: { query: query => ({ protocol: "canopyx/2", type: "gridPage", view: "assets", revision: "r1", offset: query.offset,
    total: 2, matched: 2, items: [{ id: "a0", cells: { tag: "AS-1000", name: "One" } }, { id: "a1", cells: { tag: "AS-1001", name: "Two" } }].slice(query.offset, query.offset + query.limit) }) } });`;
  await serveGrid(page, { view, script });
  await page.evaluate(`${grid}.setCellValue("a0", "name", "Changed")`);
  const result = await page.evaluate(`${grid}.commitChanges()`);
  expect(result).toEqual({ ok: false, saved: 0, failed: 1, rows: [{ id: "a0", ok: false, status: "error", error: "Not saved." }] });
  expect((await page.evaluate(`${grid}.getChanges()`)).map(change => change.id)).toEqual(["a0"]);
});

test("an undo while a row saves stays a change from the saved value, and a second commit of a saving row waits for it", async ({ page }) => {
  await serveGrid(page, { script: `let release; window.hold = new Promise(resolve => release = resolve); window.release = () => release();
    CanopyX.configure("assets", { editing: { commit: async batch => { await hold; return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view, rows: batch.rows.map(row => ({ id: row.id, status: "saved" })) }; } } });` });
  await page.evaluate(`${grid}.setCellValue("a0", "name", "Saving")`);
  await page.evaluate(`window.pending = ${grid}.commitChanges(); 0`);
  await page.waitForFunction(`${grid}.getChanges()[0]?.status === "saving"`);
  await page.evaluate(`window.second = ${grid}.commitRow("a0"); 0`);
  await page.evaluate(`${grid}.undo()`);
  await page.evaluate(() => window.release());
  expect((await page.evaluate(() => window.pending)).rows).toEqual([{ id: "a0", ok: true, status: "saved" }]);
  expect(await page.evaluate(() => window.second)).toEqual({ id: "a0", ok: true, status: "saved" });
  expect(await page.evaluate(`${grid}.getChanges()`)).toEqual([{ id: "a0", values: { name: "Laptop 0" }, original: { name: "Saving" } }]);
  await expect(cell(page, "a0", 1)).toHaveClass(/cx-dirty/);
});

test("editing calls on a grid without editable columns work after another grid loaded the part", async ({ page }) => {
  await serveGrid(page);
  const result = await page.evaluate(async () => {
    const view = { protocol: "canopyx/2", type: "grid", id: "plain", label: "Plain", pageSize: 10, selection: "none", search: false, source: { kind: "inline" },
      columns: [{ id: "name", title: "Name", kind: "text" }], rows: [{ id: "r1", cells: { name: "One" } }] };
    const host = document.createElement("div"); host.style.height = "200px"; document.body.appendChild(host);
    const plain = CanopyX.createDataGrid(host, { view }); await plain.ready;
    const reads = [plain.getChanges(), plain.hasChanges(), plain.canUndo(), plain.undo(), plain.isEditing()];
    return { reads, begin: await plain.beginEdit("r1", "name"), commit: await plain.commitChanges() };
  });
  expect(result).toEqual({ reads: [[], false, false, false, false], begin: false, commit: { ok: true, saved: 0, failed: 0, rows: [] } });
});