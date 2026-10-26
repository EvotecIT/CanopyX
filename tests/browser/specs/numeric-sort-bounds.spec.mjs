// Sort metadata has the same numeric magnitude contract as raw cells and the schema/native writer.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { viewPage, nextFrames, repo } from "./support.mjs";

const base = { protocol: "canopyx/2", type: "grid", id: "sort-bounds", label: "Sort key bounds", source: { kind: "inline" },
  rowHeight: 34, pageSize: 20, selection: "none", search: false,
  columns: [{ id: "name", title: "Name", kind: "text", width: 240, sortable: true }], rows: [] };
const api = "document.querySelector('[data-canopyx-host]').canopyx";

async function open(page) {
  await page.route("http://canopyx.test/canopyx-*", route => {
    const file = path.basename(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", file)) });
  });
  await page.route("http://canopyx.test/sort-bounds", route => route.fulfill({ contentType: "text/html", body: viewPage(base) }));
  await page.goto("http://canopyx.test/sort-bounds");
  await page.evaluate(api + ".ready");
}

test("inline numeric sort keys outside the safe magnitude are dropped instead of collapsing distinct JSON integers", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(base => {
    const collapsed = JSON.parse('[9007199254740993,9007199254740992]');
    const cases = [Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1)].map(sort => {
      const host = document.createElement("div"); document.body.append(host);
      const grid = CanopyX.createDataGrid(host, { view: { ...base, rows: [{ id: "a", cells: { name: { value: "Visible name", sort } } }] } });
      try { return grid.view.rows[0].cells.name; } finally { grid.destroy(); host.remove(); }
    });
    return { collapsed, cases };
  }, base);
  expect(result.collapsed[0]).toBe(result.collapsed[1]);
  expect(result.cases).toEqual([{ value: "Visible name" }, { value: "Visible name" }]);
});

test("custom-source pages drop unsafe numeric sort keys and keep their rows", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const host = document.createElement("div"); document.body.append(host); const errors = []; let sort = Number.MAX_SAFE_INTEGER + 1;
    const grid = CanopyX.createDataGrid(host, { view: { ...base, source: { kind: "host" }, rows: undefined },
      source: { query: query => ({ protocol: "canopyx/2", type: "gridPage", view: base.id, revision: "r1", offset: query.offset, total: 1, matched: 1,
        items: [{ id: "a", cells: { name: { value: "Recovered", sort } } }] }) }, onError: event => errors.push(event.error.message) });
    try { let rejection; const accepted = await grid.ready.catch(error => { rejection = error.message; return false; }); const failed = { accepted, rejection, errors: [...errors], visible: host.querySelectorAll('.cx-row[data-cx-id]').length };
      sort = .75; const recovered = await grid.reload(); return { failed, recovered, errors, rows: grid.getPaging().matched }; }
    finally { grid.destroy(); host.remove(); }
  }, base);
  expect(result.failed.accepted).toBeTruthy(); expect(result.failed.visible).toBe(1);
  expect(result.failed.rejection).toBeUndefined(); expect(result.errors).toEqual([]);
  expect(result.recovered).toBeTruthy(); expect(result.rows).toBe(1);
});

test("compact row chunks drop unsafe numeric sort metadata and attach their rows", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const host = document.createElement("div"); document.body.append(host); const errors = [];
    const grid = CanopyX.createDataGrid(host, { view: { ...base, rows: undefined,
      rowData: { version: 1, columns: ["name"], count: 1, ordered: true, chunks: [[["a", { value: "Unsafe compact row", sort: -(Number.MAX_SAFE_INTEGER + 1) }]]] } },
      onError: event => errors.push(event.error.message) });
    try { const accepted = await grid.ready.catch(error => false); return { accepted: accepted !== false, errors, rows: grid.view.rows.map(row => row.cells.name) }; }
    finally { grid.destroy(); host.remove(); }
  }, base);
  expect(result.accepted).toBe(true); expect(result.rows).toEqual([{ value: "Unsafe compact row" }]);
  expect(result.errors).toEqual([]);
});

test("an unloaded record rejects unsafe numeric sort metadata before opening its drawer", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const host = document.createElement("div"); document.body.append(host); let sort = Number.MAX_SAFE_INTEGER + 1;
    const grid = CanopyX.createDataGrid(host, { view: { ...base, rows: [{ id: "a", cells: { name: "Loaded" } }], record: { source: { kind: "host" }, fields: [{ id: "note", title: "Note" }] } },
      loadRecord: request => ({ protocol: "canopyx/2", type: "gridRecord", view: request.view, id: request.id,
        row: { id: request.id, cells: { name: { value: "Recovered record", sort } } }, fields: { note: "Details" } }) });
    try { await grid.ready; const error = await grid.openRecord("b").then(() => null, error => error.message); const dialogs = document.querySelectorAll("dialog.cx-drawer[open]").length;
      sort = .5; await grid.openRecord("b"); return { error, dialogs, recovered: document.querySelector("dialog.cx-drawer h4")?.textContent }; }
    finally { grid.destroy(); host.remove(); }
  }, base);
  expect(result.error).toContain("safe integer magnitude"); expect(result.dialogs).toBe(0); expect(result.recovered).toBe("Recovered record");
});

test("record collection rows drop unsafe numeric sort metadata and still render their nested records", async ({ page }) => {
  await open(page);
  await page.evaluate(async base => {
    const host = document.createElement("div"); document.body.append(host); const errors = [];
    const grid = CanopyX.createDataGrid(host, { view: { ...base, rows: [{ id: "a", cells: { name: "Loaded" } }], record: { source: { kind: "host" }, fields: [{ id: "related", title: "Related" }] } },
      loadRecord: request => ({ protocol: "canopyx/2", type: "gridRecord", view: request.view, id: request.id,
        fields: { related: { records: { columns: base.columns, rows: [{ id: "b", cells: { name: { value: "Unsafe related row", sort: Number.MAX_SAFE_INTEGER + 1 } } }] } } } }),
      onError: event => errors.push(event.error.message) });
    window.collectionProbe = { grid, host, errors };
    await grid.ready; await grid.openRecord("a");
  }, base);
  try {
    await expect.poll(() => page.evaluate(() => collectionProbe.errors.length > 0 || !!document.querySelector("dialog.cx-drawer")?.textContent.includes("Unsafe related row"))).toBe(true);
    const result = await page.evaluate(() => ({ errors: collectionProbe.errors,
      unsafeRendered: !!document.querySelector("dialog.cx-drawer")?.textContent.includes("Unsafe related row") }));
    expect(result.errors).toEqual([]); expect(result.unsafeRendered).toBe(true);
  } finally { await page.evaluate(() => { collectionProbe.grid.destroy(); collectionProbe.host.remove(); }); }
});

test("writer canonical cells reject unsafe numeric sort metadata without acknowledging the draft", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const host = document.createElement("div"); document.body.append(host); let sort = Number.MAX_SAFE_INTEGER + 1;
    const grid = CanopyX.createDataGrid(host, { view: { ...base, columns: base.columns.map(column => ({ ...column, editable: true })), rows: [{ id: "a", cells: { name: "Original" } }] },
      editing: { drawer: "never", commit: batch => ({ protocol: "canopyx/2", type: "gridCommitResult", view: batch.view,
        rows: [{ id: "a", status: "saved", cells: { name: { value: "Canonical", sort } } }] }) } });
    try { await grid.ready; await grid.setCellValue("a", "name", "Draft"); const failed = await grid.commitChanges();
      const retained = { stored: grid.view.rows[0].cells.name, changes: grid.getChanges() }; sort = .25;
      const recovered = await grid.commitChanges(); return { failed, retained, recovered, stored: grid.view.rows[0].cells.name, changes: grid.getChanges() }; }
    finally { grid.destroy(); host.remove(); }
  }, base);
  expect(result.failed.saved).toBe(0); expect(result.failed.failed).toBe(1); expect(result.failed.rows[0].error).toContain("safe integer magnitude");
  expect(result.retained.stored).toBe("Original"); expect(result.retained.changes[0].values).toEqual({ name: "Draft" });
  expect(result.recovered.saved).toBe(1); expect(result.stored).toEqual({ value: "Canonical", sort: .25 }); expect(result.changes).toEqual([]);
});

test("safe numeric sort boundaries and finite fractions retain their numeric ordering", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const host = document.createElement("div"); document.body.append(host);
    const grid = CanopyX.createDataGrid(host, { view: { ...base, rows: [Number.MAX_SAFE_INTEGER, .125, -Number.MAX_SAFE_INTEGER, -.5, 0].map((sort, index) =>
      ({ id: "r" + index, cells: { name: { value: "Rank " + index, sort } } })) } });
    try { await grid.ready; const orders = [];
      for (const direction of ["asc", "desc"]) { await grid.setQuery({ sort: [{ column: "name", direction }] }); const rows = []; for await (const row of grid.prepareExport({ scope: "all" }).rows()) rows.push(row.id); orders.push(rows); }
      return orders;
    } finally { grid.destroy(); host.remove(); }
  }, base);
  expect(result).toEqual([["r2", "r3", "r4", "r1", "r0"], ["r0", "r1", "r4", "r3", "r2"]]);
  await nextFrames(page);
});

test("text and ISO date sort keys retain their supported meaning", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const orders = [];
    for (const kind of ["text", "datetime"]) {
      const host = document.createElement("div"); document.body.append(host);
      const keys = kind === "text" ? ["Zulu", "Alpha"] : ["2026-10-04T10:00:00.001Z", "2026-10-04T10:00:00.000Z"];
      const grid = CanopyX.createDataGrid(host, { view: { ...base, columns: base.columns.map(column => ({ ...column, kind })), rows: keys.map((sort, index) =>
        ({ id: "r" + index, cells: { name: { value: kind === "text" ? "Visible " + index : "2026-10-04T12:00:00.000Z", sort } } })) } });
      try { await grid.ready; await grid.setQuery({ sort: [{ column: "name", direction: "asc" }] }); const rows = []; for await (const row of grid.prepareExport({ scope: "all" }).rows()) rows.push(row.id); orders.push(rows); }
      finally { grid.destroy(); host.remove(); }
    }
    return orders;
  }, base);
  expect(result).toEqual([["r1", "r0"], ["r1", "r0"]]);
});

test("inline and hosted trees ignore unsafe numeric sort keys and retain raw-value ordering", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async base => {
    const orders = [];
    for (const hosted of [false, true]) {
      const host = document.createElement("div"); document.body.append(host);
      const roots = [{ id: "a", label: "Alpha", cells: { name: { value: "Alpha", sort: Number.MAX_SAFE_INTEGER + 1 } } },
        { id: "z", label: "Zulu", cells: { name: { value: "Zulu", sort: -(Number.MAX_SAFE_INTEGER + 1) } } },
        { id: "b", label: "Beta", cells: { name: { value: "Beta", sort: { unsupported: true } } } }];
      const tree = CanopyX.createTreeGrid(host, { view: { ...base, type: "view", rows: undefined, roots },
        ...(hosted ? { source: { page: () => ({ items: roots, next: null }) } } : {}) });
      try { await tree.ready; await tree.sort("name", "asc"); orders.push(tree.visibleRows().map(row => row.node.id));
        await tree.sort("name", "desc"); orders.push(tree.visibleRows().map(row => row.node.id)); }
      finally { tree.destroy(); host.remove(); }
    }
    return orders;
  }, base);
  expect(result).toEqual([["a", "b", "z"], ["z", "b", "a"], ["a", "b", "z"], ["z", "b", "a"]]);
});

test("safe numeric guards retain fractions and repair nonnumeric or nonfinite raw values", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(base => ["1", "many", NaN, Infinity, -Infinity, .125, -.125, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER].map(value => {
    const host = document.createElement("div"); document.body.append(host);
    const grid = CanopyX.createDataGrid(host, { view: { ...base, columns: base.columns.map(column => ({ ...column, kind: "number" })), rows: [{ id: "a", cells: { name: value } }] } });
    try { return grid.view.rows[0].cells.name; } finally { grid.destroy(); host.remove(); }
  }), base);
  // A numeric string becomes its number, other text keeps showing, and a nonfinite number shows nothing.
  expect(result).toEqual([1, { value: null, text: "many" }, null, null, null, .125, -.125, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]);
});
