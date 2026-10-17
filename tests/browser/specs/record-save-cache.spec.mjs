// Successful local saves invalidate their own loaded record details while unrelated and hosted snapshots keep their cache.
import { expect, test } from "@playwright/test";
import { ready, servePage } from "./enhance-support.mjs";

async function open(page, { enhanced = false, hold = false, reject = false, hosted = false } = {}) {
  await servePage(page, "<div id='local' style='height:440px'></div>");
  await page.evaluate(async ({ enhanced, hold, reject, hosted }) => {
    window.names = { a: "Original", b: "Other" }; window.loads = []; window.held = []; window.revision = "r1";
    const original = { ...names };
    const columns = [{ id: "name", title: "Name", kind: "text", editable: true }], rows = Object.entries(names).map(([id, name]) => ({ id, cells: { name } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "local", label: "Saved record details", selection: "none", search: true, pageSize: 10,
      source: { kind: "inline" }, columns, rows, record: { source: { kind: "host" }, fields: [{ id: "detail", title: "Detail" }] } };
    const options = { view, loadRecord(request) { loads.push(request.id); const name = hosted && request.revision === "r1" ? original[request.id] : names[request.id], payload = {
      cells: { name }, fields: { detail: "Detail " + name }, row: { id: request.id, cells: { name } } };
      return hold && loads.length === 1 ? new Promise(resolve => held.push(() => resolve(payload))) : payload; },
      editing: { commit(batch) { if (hosted) revision = "r2"; return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view, ...(hosted ? { revision } : {}), rows: batch.rows.map(row => {
        if (reject) return { id: row.id, status: "conflict" }; const name = String(row.values.name).trim(); names[row.id] = name;
        return { id: row.id, status: "saved", cells: { name } }; }) }; } } };
    if (hosted) { view.source = { kind: "host" }; delete view.rows; options.source = { query(request) {
      const items = Object.entries(names).map(([id, name]) => ({ id, cells: { name } }));
      return { protocol: "canopyx/2", type: "gridPage", view: "local", revision, offset: request.offset, total: items.length, matched: items.length, items };
    } }; }
    window.grid = enhanced ? await CanopyX.grid("#local", { ...options, rowId: "id", columns: [{ data: "name", type: "text", editable: true }],
      data: Object.entries(names).map(([id, name]) => ({ id, name })), view: { record: view.record } }) : CanopyX.createDataGrid(document.querySelector("#local"), options);
    await grid.ready;
  }, { enhanced, hold, reject, hosted });
  await ready(page);
}
const detail = page => page.locator("dialog[open] dd[data-cx-field='detail']");
const close = page => page.evaluate(() => document.querySelector("dialog[open]").close());
const save = page => page.evaluate(async () => { await grid.setCellValue("a", "name", " Changed "); return grid.commitChanges(); });

for (const enhanced of [false, true]) test(enhanced ? "successful canonical enhanced saves use the new data revision for record payloads" : "successful canonical inline saves refresh only that record's cached payload", async ({ page }) => {
  await open(page, { enhanced });
  for (const id of ["a", "b"]) { await page.evaluate(id => grid.openRecord(id), id); await expect(detail(page)).toHaveText(id === "a" ? "Detail Original" : "Detail Other"); await close(page); }
  expect(await save(page)).toMatchObject({ ok: true, saved: 1 });
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Changed"); await close(page);
  await page.evaluate(() => grid.openRecord("b")); await expect(detail(page)).toHaveText("Detail Other");
  expect(await page.evaluate(() => loads)).toEqual(enhanced ? ["a", "b", "a", "b"] : ["a", "b", "a"]);
});

test("a rejected inline save retains the unchanged record payload", async ({ page }) => {
  await open(page, { reject: true });
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Original"); await close(page);
  expect(await save(page)).toMatchObject({ ok: false, saved: 0 });
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Original");
  expect(await page.evaluate(() => loads)).toEqual(["a"]);
});

test("a late pre-save inline loader cannot restore the evicted payload", async ({ page }) => {
  await open(page, { hold: true });
  await page.evaluate(() => grid.openRecord("a")); await expect(page.locator(".cx-record-note")).toHaveText("Loading…"); await close(page);
  expect(await save(page)).toMatchObject({ ok: true, saved: 1 });
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Changed");
  await page.evaluate(() => held.forEach(release => release()));
  await expect(detail(page)).toHaveText("Detail Changed");
  expect(await page.evaluate(() => loads)).toEqual(["a", "a"]);
});

test("hosted saves retain the accepted record revision until the host reloads", async ({ page }) => {
  await open(page, { hosted: true });
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Original"); await close(page);
  expect(await save(page)).toMatchObject({ ok: true, saved: 1, revision: "r2" });
  expect(await page.evaluate(() => grid.getQuery().revision)).toBe("r1");
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Original"); await close(page);
  expect(await page.evaluate(() => loads)).toEqual(["a"]);
  await page.evaluate(() => grid.reload());
  await page.evaluate(() => grid.openRecord("a")); await expect(detail(page)).toHaveText("Detail Changed");
  expect(await page.evaluate(() => loads)).toEqual(["a", "a"]);
});
