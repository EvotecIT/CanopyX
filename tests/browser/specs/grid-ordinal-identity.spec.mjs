import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const definition = (extra = {}) => ({ protocol: "canopyx/2", type: "grid", id: "attempts", label: "Attempts",
  rowIdentity: "ordinal", source: { kind: "inline" }, rowHeight: 28, pageSize: 50,
  selection: "multiple", search: true, stateKey: "attempts", rowAction: "details",
  columns: [{ id: "message", title: "Message", kind: "text", sortable: true }, { id: "count", title: "Count", kind: "number", sortable: true }],
  rows: [{ id: "0", cells: { message: "Retry", count: 3 } }, { id: "1", cells: { message: "Retry", count: 1 } }, { id: "2", cells: { message: "Completed", count: 2 } }], ...extra });

async function open(page, view = definition(), source = "") {
  let html = viewPage(view);
  if (source) html = html.replace("data-canopyx-host", "data-manual-host").replace("</body>",
    "<script>window.api=CanopyX.createDataGrid(document.querySelector('.cx-host'),{view:" + JSON.stringify(view) + ",source:" + source + "});</script></body>");
  await page.route("http://canopyx.test/ordinal", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/ordinal");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => { window.api ||= document.querySelector(".cx-host").canopyx; await api.ready; });
  await nextFrames(page);
}

test("ordinal records keep source identity through sort, filter, export and drawer", async ({ page }) => {
  await open(page);
  await page.evaluate(() => api.sort([{ column: "count", direction: "asc" }]));
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "1");
  await page.evaluate(() => api.setQuery({ filters: [{ column: "message", operator: "eq", values: ["Retry"] }], sort: [{ column: "count", direction: "asc" }] }));
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  const csv = await page.evaluate(() => api.toCsv({ scope: "filtered" }));
  expect(csv).toContain("Retry"); expect(csv).not.toContain("Completed");
  await page.evaluate(() => api.openDetails("1"));
  await expect(page.locator(".cx-drawer")).toBeVisible();
  await expect(page.locator(".cx-drawer")).toContainText("Retry");
});

test("ordinal saved views omit selection and reject selection replay before changing the query", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.setSelection(["1"]); api.saveView("Counts");
    const state = api.getState(), query = api.getQuery();
    let diagnostic;
    try { await api.setState({ ...state, selection: ["1"] }); } catch (error) { diagnostic = error.message; }
    return { selection: api.getSelection(), state, queryUnchanged: JSON.stringify(query) === JSON.stringify(api.getQuery()), diagnostic,
      stored: JSON.parse(sessionStorage.getItem("cx:grid:attempts:attempts")) };
  });
  expect(result.selection).toEqual(["1"]);
  expect(result.state.selection).toEqual([]);
  expect(result.stored.views[0].state.selection).toEqual([]);
  expect(result.queryUnchanged).toBe(true);
  expect(result.diagnostic).toContain("replaying saved selections requires stable row keys");
});

test("ordinal live updates fail both before and after another grid loads the live part", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => api.updateRows([{ id: "0", cells: { count: 4 } }]).catch(error => error.message))).toContain("stable row keys");
  await page.evaluate(async () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const keyed = CanopyX.createDataGrid(host, { view: { ...api.view, id: "keyed", rowIdentity: "stableKey", stateKey: undefined } });
    await keyed.ready; await keyed.updateRows([{ id: "0", cells: { count: 4 } }]); keyed.destroy(); host.remove();
  });
  const failures = await page.evaluate(() => Promise.all([
    api.applyTransaction({ update: [{ id: "0", cells: { count: 4 } }] }),
    api.addRows([{ id: "3", cells: { message: "New", count: 4 } }]),
    api.updateRows([{ id: "0", cells: { count: 4 } }]), api.removeRows(["0"])
  ].map(promise => promise.catch(error => error.message))));
  expect(failures).toEqual(Array(4).fill(expect.stringContaining("stable row keys")));
  expect(await page.evaluate(() => api.toCsv({ scope: "all" }))).toContain("Retry");
});

test("resetting ordinal columns retains current snapshot selection", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => { api.setSelection(["1"]); api.setColumnWidth("message", 333); await api.resetColumns(); return api.getSelection(); });
  expect(result).toEqual(["1"]);
});

test("ordinal hosted snapshots clear local selection when the revision changes", async ({ page }) => {
  const rows = JSON.stringify(definition().rows);
  await open(page, definition({ source: { kind: "host" }, rows: undefined }),
    "{query:q=>({protocol:'canopyx/2',type:'gridPage',view:q.view,revision:window.revision||'v1',offset:q.offset,total:3,matched:3,items:" + rows + ".slice(q.offset,q.offset+q.limit)})}");
  await page.evaluate(async () => { api.setSelection(["1"]); await api.reload(); });
  expect(await page.evaluate(() => api.getSelection())).toEqual(["1"]);
  await page.evaluate(async () => { window.revision = "v2"; await api.reload(); });
  expect(await page.evaluate(() => api.getSelection())).toEqual([]);
});

test("read-only ordinal grids keep navigation and drawers without selection controls", async ({ page }) => {
  await open(page, definition({ selection: "none", reporting: { headerFilters: true } }));
  await expect(page.locator(".cx-header-check, .cx-row-check")).toHaveCount(0);
  await page.locator('.cx-row[data-cx-id="1"]').click();
  await expect(page.locator(".cx-drawer")).toBeVisible();
  expect(await page.evaluate(() => api.getSelection())).toEqual([]);
});

for (const controls of [false, true]) test(`ordinal reporting saved views restore presentation across revisions with selection controls ${controls}`, async ({ page }) => {
  const rows = JSON.stringify(definition().rows);
  await open(page, definition({ source: { kind: "host" }, rows: undefined, selection: controls ? "multiple" : "none",
    reporting: { headerFilters: true, selectionControls: controls } }),
    "{query:q=>({protocol:'canopyx/2',type:'gridPage',view:q.view,revision:window.revision||'v1',offset:q.offset,total:3,matched:3,items:" + rows + ".slice(q.offset,q.offset+q.limit)})}");
  const result = await page.evaluate(async controls => {
    api.setColumnWidth("message", 333); api.setTimeZone("local"); api.saveView("Wide");
    api.setColumnWidth("message", 180); api.setTimeZone("utc");
    if (controls) api.setSelection(["1"]);
    window.revision = "v2"; await api.applySavedView("Wide");
    return { width: api.getState().columns.find(column => column.id === "message").width,
      timeZone: api.getTimeZone(), selection: api.getSelection(), revision: api.getQuery().revision };
  }, controls);
  expect(result).toEqual({ width: 333, timeZone: "local", selection: [], revision: "v2" });
});
