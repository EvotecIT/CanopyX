// Local enhancement owns every row, although its page-order source is supplied to the underlying grid.
import { expect, test } from "@playwright/test";
import { ORIGIN, ready, rowIds, servePage } from "./enhance-support.mjs";
import { nextFrames } from "./support.mjs";

const columns = [{ data: "name", title: "Name", type: "text" }, { data: "amount", title: "Amount", type: "number" }];
const records = [{ id: "a", name: "Printer A", amount: 10 }, { id: "b", name: "Printer B", amount: 20 }];
const rules = [{ id: "bar", column: "amount", style: { bar: { minimum: 0, tone: "info" } } },
  { id: "scale", column: "amount", style: { scale: { stops: [{ type: "min", tone: "success" }, { type: "max", tone: "danger" }] } } }];

async function open(page, kind, extra = {}) {
  const body = kind === "table" ? "<table id='local'><thead><tr><th>Name</th><th>Amount</th></tr></thead><tbody>" +
    records.map(row => "<tr id='" + row.id + "'><td>" + row.name + "</td><td>" + row.amount + "</td></tr>").join("") + "</tbody></table>" : "<div id='local'></div>";
  await servePage(page, body);
  await page.evaluate(async ({ kind, columns, records, extra }) => {
    const settings = { columns, pageLength: 1, rowId: "id", markup: false, ...extra };
    // Table mappings read cell positions; later setData/addRows use arrays with an extra ID field outside those columns.
    if (kind === "table") { settings.columns = columns.map((column, index) => ({ ...column, id: column.data, data: index })); settings.rowId = row => row[2]; }
    window.localRecords = rows => kind === "table" ? rows.map(({ id, name, amount }) => [name, amount, id]) : rows;
    window.grid = kind === "table" ? await CanopyX.enhance("#local", settings) : await CanopyX.grid("#local", { ...settings, data: records });
  }, { kind, columns, records, extra });
  await ready(page);
}

const barWidth = page => page.locator(".cx-row[data-cx-id='a'] .cx-fmt-bar").evaluate(element => element.style.getPropertyValue("--cx-fmt-w"));

for (const kind of ["records", "table"]) {
  test("local " + kind + " formatting recomputes bounds after replacement, addition and removal", async ({ page }) => {
    await open(page, kind, { pageLength: 5, view: { formatRules: rules } });
    await expect.poll(() => barWidth(page)).toBe("50.0%");
    await page.evaluate(() => grid.setData(localRecords([{ id: "a", name: "Printer A", amount: 10 }, { id: "b", name: "Printer B", amount: 100 }])));
    await nextFrames(page);
    await expect.poll(() => barWidth(page)).toBe("10.0%");
    const scale = await page.locator(".cx-row[data-cx-id='a'] .cx-fmt-scale").evaluate(element => element.style.getPropertyValue("--cx-fmt-scale"));
    await page.evaluate(() => grid.addRows(localRecords([{ id: "c", name: "Printer C", amount: 200 }, { id: "d", name: "Printer D", amount: -100 }])));
    await expect.poll(() => barWidth(page)).toBe("5.0%");
    await expect.poll(() => page.locator(".cx-row[data-cx-id='a'] .cx-fmt-scale").evaluate(element => element.style.getPropertyValue("--cx-fmt-scale"))).not.toBe(scale);
    await page.evaluate(() => grid.removeRows(["b", "c", "d"]));
    await expect.poll(() => barWidth(page)).toBe("100.0%");
  });

  test("local " + kind + " accepted edits update cached sort order and filtered membership", async ({ page }) => {
    await open(page, kind, { view: { columns: [{ id: "name", title: "Name", kind: "text", sortable: true },
      { id: "amount", title: "Amount", kind: "number", sortable: true, editable: true }] }, order: [["amount", "asc"]] });
    await page.evaluate(async () => { await grid.setCellValue("a", "amount", 100); await grid.commitChanges(); });
    await expect.poll(() => rowIds(page)).toEqual(["b"]);
    await page.evaluate(() => grid.nextPage());
    await expect.poll(() => rowIds(page)).toEqual(["a"]);
    await page.evaluate(() => grid.setQuery({ ...grid.getQuery(), filters: [{ column: "amount", operator: "lt", values: [150] }], offset: 0, revision: undefined }));
    await page.evaluate(async () => { await grid.setCellValue("b", "amount", 200); await grid.commitChanges(); });
    await expect.poll(() => rowIds(page)).toEqual(["a"]);
    expect(await page.evaluate(() => grid.getPaging().matched)).toBe(1);
    await page.evaluate(() => grid.reload());
    await expect.poll(() => rowIds(page)).toEqual(["a"]);
  });

  test("local " + kind + " highlight count includes unloaded pages and follows data changes", async ({ page }) => {
    await open(page, kind, { searchText: "Printer", view: { searchHighlight: true } });
    await page.evaluate(() => grid.setSearchHighlight(true));
    await expect.poll(() => page.evaluate(() => grid.getMatches())).toMatchObject({ total: 2, complete: true });
    await page.evaluate(() => grid.addRows(localRecords(Array.from({ length: 104 }, (_, i) => ({ id: "p" + i, name: "Printer " + i, amount: i })))));
    await expect.poll(() => page.evaluate(() => grid.getMatches())).toMatchObject({ total: 106, complete: true });
    await page.evaluate(() => grid.previousMatch());
    await expect(page.locator(".cx-row[data-cx-id='p103'] mark.cx-hit-current")).toHaveText("Printer");
    expect(await page.evaluate(() => grid.getMatches())).toMatchObject({ total: 106, current: 106, complete: true });
    await page.evaluate(() => grid.removeRows(["p103"]));
    await expect.poll(() => page.evaluate(() => grid.getMatches())).toMatchObject({ total: 105, complete: true });
  });
}

for (const kind of ["native", "url"]) {
  test("local " + kind + " saved edits accept new result counts before further paging", async ({ page }) => {
    await servePage(page, "<div id='local' style='height:420px'></div>");
    if (kind === "url") await page.route(ORIGIN + "/data", route => route.fulfill({ json: records }));
    await page.evaluate(async ({ kind, columns, records }) => {
      const declared = [{ id: "name", title: "Name", kind: "text" }, { id: "amount", title: "Amount", kind: "number", editable: true }],
        query = { filters: [{ column: "amount", operator: "lt", values: [50] }] };
      window.grid = kind === "url" ? await CanopyX.grid("#local", { url: "/data", rowId: "id", pageLength: 1, columns,
        view: { columns: declared, query } }) : CanopyX.createDataGrid(document.querySelector("#local"), {
        view: { protocol: "canopyx/2", type: "grid", id: "local", label: "Local", pageSize: 1, selection: "none", search: true,
          source: { kind: "inline" }, presentation: "paged", pageLength: 1, columns: declared, query,
          rows: records.map(({ id, name, amount }) => ({ id, cells: { name, amount } })) } });
      await grid.ready;
    }, { kind, columns, records });
    expect(await page.evaluate(() => grid.getPaging().matched)).toBe(2);
    await page.evaluate(async () => { await grid.setCellValue("a", "amount", 100); await grid.commitChanges(); });
    expect(await page.evaluate(() => grid.getPaging().matched)).toBe(1);
    await expect.poll(() => rowIds(page)).toEqual(["b"]);
    await page.evaluate(() => grid.nextPage());
    await expect.poll(() => rowIds(page)).toEqual(["b"]);
  });
}

test("host-owned inline sources count only loaded rows and compute formatting from those rows", async ({ page }) => {
  await servePage(page, "<div id='host' style='height:420px'></div>");
  await page.evaluate(async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: "p" + i, cells: { name: "Printer " + i, amount: (i + 1) * 10 } }));
    window.grid = CanopyX.createDataGrid(document.querySelector("#host"), {
      view: { protocol: "canopyx/2", type: "grid", id: "host", label: "Host rows", selection: "none", search: true, pageSize: 2,
        presentation: "paged", pageLength: 2, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "amount", title: "Amount", kind: "number" }],
        source: { kind: "inline" }, rows: [], searchHighlight: true, formatRules: [{ id: "bar", column: "amount", style: { bar: { minimum: 0, tone: "info" } } }], query: { search: "Printer" } },
      source: { query(query) { return { protocol: "canopyx/2", type: "gridPage", view: "host", revision: "r1", offset: query.offset,
        total: rows.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }; } }
    });
    await grid.ready; await grid.setSearchHighlight(true);
  });
  await expect.poll(() => page.evaluate(() => grid.getMatches())).toMatchObject({ total: 2, complete: false });
  await expect(page.locator(".cx-row[data-cx-id='p0'] .cx-fmt-bar")).toHaveCSS("--cx-fmt-w", "50.0%");
});
