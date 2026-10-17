import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const drawer = page => page.locator("dialog.cx-drawer");
const goodRow = id => ({ id, cells: { name: "Recovered record", count: 7 } });
const invalidRows = [
  ["array cells", id => ({ id, cells: [] }), "invalid flat row fields"],
  ["undeclared column", id => ({ id, cells: { name: "Malformed record", unknown: "hidden" } }), "undeclared grid column unknown"],
  ["malformed wrapper", id => ({ id, cells: { name: { value: "Malformed record", text: 123 } } }), "malformed grid cell"]
];
const definition = () => ({ protocol: "canopyx/2", type: "grid", id: "row-boundary", label: "Record row boundary",
  source: { kind: "host" }, pageSize: 20, rowHeight: 34, selection: "none", search: false,
  columns: [{ id: "name", title: "Name", kind: "text" }, { id: "count", title: "Count", kind: "number" }],
  record: { fields: [{ id: "note", title: "Note" }] } });

async function open(page, row, transport = "host", tree = false) {
  const view = definition(), requests = [];
  const recordsOf = rows => rows.map(row => ({ id: row.id, row, fields: { note: "Loaded details" } }));
  let records = recordsOf([row]);
  if (tree) {
    view.type = "view"; view.source = { kind: "inline" };
    view.roots = [{ id: "a", label: "Tree record", cells: { count: 7 } }];
  }
  if (transport === "sidecar") view.record.source = { kind: "sidecar", base: "record-packs/", shards: 1 };
  await page.route("http://canopyx.test/record-packs/r0.js", route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar ||= []).push(["row-boundary", "r0", ${JSON.stringify({
      protocol: "canopyx/2", type: "gridRecordPack", view: "row-boundary", records
    })}]);` });
  });
  const setup = `window.recordRow = ${JSON.stringify(row)}; window.requests = []; window.errors = [];
    const host = document.querySelector('[data-canopyx-host]');
    host.addEventListener('canopyx:error', event => errors.push(event.detail.error.message));
    CanopyX.configure('row-boundary', {
      ${!tree ? `source: { query: query => ({ protocol: 'canopyx/2', type: 'gridPage', view: 'row-boundary', revision: 'r1', offset: query.offset,
        total: 1, matched: 1, items: [{ id: 'a', cells: { name: 'Loaded record', count: 1 } }] }) },` : ""}
      ${transport !== "sidecar" ? `loadRecord: request => { requests.push(request); return { protocol: 'canopyx/2', type: 'gridRecord', view: request.view, id: request.id,
        row: { ...recordRow, id: request.id }, fields: { note: 'Loaded details' } }; }` : ""}
    });`;
  await page.route("http://canopyx.test/record-row-boundary", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("</body>", `<script>${setup}</script></body>`) }));
  await page.goto("http://canopyx.test/record-row-boundary");
  await page.waitForSelector("[data-cx-ready]"); await page.evaluate(api + ".ready"); await nextFrames(page);
  return { requests, setRows: rows => { records = recordsOf(rows); } };
}

for (const [name, makeRow, message] of invalidRows) {
  test(`unloaded record rows reject ${name} before opening a drawer`, async ({ page }) => {
    const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
    await open(page, makeRow("b"));
    const error = await page.evaluate(api + ".openRecord('b').then(() => null, error => error.message)");
    expect(error).toContain(message);
    await expect(drawer(page)).toHaveCount(0);
    expect(await page.evaluate("requests[0]")).toMatchObject({ id: "b", row: true, revision: "r1" });
    await page.evaluate("recordRow = " + JSON.stringify(goodRow("b")) + "; " + api + ".openRecord('b')");
    await expect(drawer(page).locator("h4")).toHaveText("Recovered record");
    await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Loaded details");
    expect(pageErrors).toEqual([]);
  });

  for (const transport of ["host", "sidecar"]) test(`${transport} record payloads report ${name} through the record error and Retry UI`, async ({ page }) => {
    const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
    const pack = await open(page, makeRow("a"), transport);
    await page.evaluate(api + ".openRecord('a')");
    await expect(drawer(page).locator(".cx-record-note:not(.cx-record-error)")).toHaveCount(0);
    const error = drawer(page).locator(".cx-record-error");
    await expect(error).toHaveCount(1);
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toContainText(message);
    await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveCount(0);
    expect(await page.evaluate("errors")).toEqual([expect.stringContaining(message)]);
    if (transport === "host") await page.evaluate("recordRow = " + JSON.stringify(goodRow("a")));
    else pack.setRows([goodRow("a")]);
    await error.getByRole("button", { name: "Retry" }).click();
    await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Loaded details");
    await expect(error).toHaveCount(0);
    if (transport === "host") expect(await page.evaluate("requests.length")).toBe(2);
    else expect(pack.requests).toHaveLength(2);
    expect(pageErrors).toEqual([]);
  });
}

test("valid shared record packs are reused and only a rejected pack reloads", async ({ page }) => {
  const pack = await open(page, goodRow("a"), "sidecar");
  pack.setRows([goodRow("a"), goodRow("b"), { id: "c", cells: [] }]);
  for (const id of ["a", "b"]) {
    await page.evaluate(api + ".openRecord(" + JSON.stringify(id) + ")");
    await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Loaded details");
    await drawer(page).getByRole("button", { name: "Close record" }).click();
  }
  expect(pack.requests).toHaveLength(1);
  expect(await page.evaluate(api + ".openRecord('c').then(() => null, error => error.message)")).toContain("invalid flat row fields");
  await expect(drawer(page)).toHaveCount(0);
  pack.setRows([goodRow("a"), goodRow("b"), goodRow("c")]);
  await page.evaluate(api + ".openRecord('c')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Loaded details");
  expect(pack.requests).toHaveLength(2);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  // The earlier accepted record keeps its own payload even though another record invalidated their shared pack.
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Loaded details");
  expect(pack.requests).toHaveLength(2);
});

test("tree record payloads retain node cell semantics and load their fields", async ({ page }) => {
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  // Tree cells retain their existing untyped display contract; the loaded node supplies its identity label.
  await open(page, { id: "a", label: "Tree record", cells: { count: "seven" } }, "host", true);
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator("h4")).toHaveText("Tree record");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Loaded details");
  await expect(drawer(page).locator(".cx-record-error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
