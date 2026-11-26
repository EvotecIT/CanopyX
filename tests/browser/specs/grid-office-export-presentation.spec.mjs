import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { viewPage, nextFrames, openGridControl, repo } from "./support.mjs";
import { zipEntry, pdfRuns, pdfFillColours } from "./office-file-support.mjs";

// What the Office export bridge hands OfficeIMO: tones and badges, the columns the reader chose, warnings instead of
// failures for presentation a document cannot keep, and the PDF row limit.
const api = "document.querySelector('[data-canopyx-host]').canopyx";
const office = () => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-office-export.js"), "utf8");
const definition = (extra = {}) => ({ protocol: "canopyx/2", type: "grid", id: "accounts", label: "Accounts", source: { kind: "inline" },
  rowHeight: 28, pageSize: 50, selection: "multiple", search: true, exportFormats: ["xlsx", "pdf"],
  columns: [{ id: "name", title: "Name", kind: "text", width: 200 }, { id: "state", title: "State", kind: "text", width: 120, valueTones: { Locked: "danger" } },
    { id: "age", title: "Age", kind: "number", width: 100 }],
  rows: [{ id: "a", tone: "warning", cells: { name: { value: "Alice", badges: [{ text: "Disabled", tone: "muted" }, { text: "Stale", title: "No sign-in for 90 days" }] }, state: "Active", age: 41 } },
    { id: "b", cells: { name: "Bob", state: "Locked", age: { value: 7, tone: "success" } } }], ...extra });

async function open(page, view) {
  await page.route("http://canopyx.test/office", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/office"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
  await page.addScriptTag({ content: office() });
}
const exportBoth = (page, options = {}) => page.evaluate(async ({ api, options }) => {
  const grid = eval(api), capture = grid.prepareExport({ scope: "all", values: "raw" }), rows = [], result = { files: {}, diagnostics: {} };
  for await (const row of capture.rows()) rows.push(JSON.parse(JSON.stringify(row)));
  for (const format of ["xlsx", "pdf"]) {
    const output = await grid.exportAs(format, { scope: "all", download: false, ...options });
    result.files[format] = [...new Uint8Array(await output.blob.arrayBuffer())];
    result.diagnostics[format] = output.diagnostics.map(item => item.code);
    result.badgeDiagnostics = JSON.parse(JSON.stringify(output.diagnostics));
  }
  return { ...result, rows };
}, { api, options });

for (const reporting of [false, true]) test(`${reporting ? "reporting" : "plain"} grids carry row and cell tones and badges into workbook and PDF fills`, async ({ page }) => {
  await open(page, definition(reporting ? { reporting: {} } : {}));
  const result = await exportBoth(page);
  expect(result.rows[0].tone).toBe("warning");
  expect(result.rows[0].cells.name.badges).toEqual([{ text: "Disabled", tone: "muted" }, { text: "Stale", title: "No sign-in for 90 days" }]);
  expect(result.rows[1].cells.state.tone).toBe("danger");
  expect(result.rows[1].cells.age.tone).toBe("success");
  // Badge pills have no document form: both runtimes report that as a warning on the badge cell and the export still finishes.
  for (const format of ["xlsx", "pdf"]) expect(result.diagnostics[format]).toEqual(["badges"]);
  expect(result.badgeDiagnostics).toEqual([{ code: "badges", columnId: "name", rowId: "a" }]);
  const styles = zipEntry(result.files.xlsx, "xl/styles.xml");
  for (const fill of ["FFF2CC", "FFC7CE", "E2F0D9"]) expect(styles).toContain(fill);
  expect(styles).toContain("9C0006");
  // The badge labels follow the cell's text in both documents.
  const label = "Alice · Disabled · Stale";
  expect(zipEntry(result.files.xlsx, "xl/worksheets/sheet1.xml")).toContain(label);
  expect(pdfRuns(result.files.pdf).map(run => run.text).join(" ")).toContain(label);
  // Fill colours as PDF paints them: warning FFF2CC, danger FFC7CE and success E2F0D9.
  expect(pdfFillColours(result.files.pdf)).toEqual(expect.arrayContaining(["1 0.949 0.8", "1 0.7804 0.8078", "0.8863 0.9412 0.851"]));
});

test("presentation diagnostics stay warnings even when every record repeats one", async ({ page }) => {
  const rows = Array.from({ length: 1200 }, (_, index) => ({ id: "r" + index, className: "host-row",
    cells: { name: { value: "Account " + index, badges: [{ text: "New" }] }, state: { value: "Active", tone: "brand" }, age: index } }));
  await open(page, definition({ reporting: {}, rows, pageSize: 200 }));
  const result = await page.evaluate(async api => {
    const received = [], output = await eval(api).exportAs("xlsx", { scope: "all", download: false, onDiagnostic: item => received.push(item.code) });
    return { size: output.blob.size, received, diagnostics: output.diagnostics.map(item => item.code) };
  }, api);
  expect(result.size).toBeGreaterThan(0);
  expect(result.diagnostics).toHaveLength(1001);
  expect(result.diagnostics.at(-1)).toBe("DIAGNOSTICS_TRUNCATED");
  expect(result.received).toEqual(result.diagnostics);
  expect(new Set(result.diagnostics)).toEqual(new Set(["custom-class", "badges", "UNMAPPED_TONE:brand", "DIAGNOSTICS_TRUNCATED"]));
});

for (const reporting of [false, true]) test(`${reporting ? "reporting" : "plain"} exports keep columns hidden only for a narrow screen and drop chooser-hidden ones`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const columns = ["name", "owner", "region", "state", "notes", "age"].map(id => ({ id, title: id[0].toUpperCase() + id.slice(1), kind: id === "age" ? "number" : "text",
    width: 220, ...(id === "notes" ? { hidden: true } : {}) }));
  await open(page, definition({ columns, rows: [{ id: "a", cells: { name: "Alice", owner: "Ops", region: "North", state: "Active", notes: "x", age: 41 } }],
    ...(reporting ? { reporting: {} } : {}) }));
  const result = await page.evaluate(async api => {
    const grid = eval(api);
    return { shown: [...document.querySelectorAll(".cx-hcell[data-cx-column]")].map(cell => cell.getAttribute("data-cx-column")),
      exported: grid.prepareExport({ scope: "all" }).request.columns.map(column => column.id) };
  }, api);
  expect(result.shown.length).toBeLessThan(5);
  expect(result.exported).toEqual(["name", "owner", "region", "state", "age"]);
});

test("a PDF above the row limit refuses up front and points to the workbook", async ({ page }) => {
  await open(page, definition());
  await page.evaluate(async api => {
    const host = document.querySelector("[data-canopyx-host]"), view = JSON.parse(JSON.stringify(eval(api).view));
    view.source = { kind: "host" }; delete view.rows;
    eval(api).destroy(); host.replaceChildren(); host.style.height = "450px";
    window.reads = 0;
    const grid = CanopyX.createDataGrid(host, { view, source: { query(query) {
      window.reads++;
      return { protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "large", offset: query.offset, total: 20001, matched: 20001,
        items: Array.from({ length: Math.min(query.limit, 20001 - query.offset) }, (_, index) => ({ id: "r" + (query.offset + index),
          cells: { name: "Account " + (query.offset + index), state: "Active", age: index } })) };
    } } });
    await grid.ready;
  }, api);
  const message = "PDF export holds up to 20,000 rows. Use the Excel workbook (.xlsx) for larger exports.";
  const refused = await page.evaluate(async api => {
    const before = window.reads;
    try { await eval(api).exportAs("pdf", { scope: "all", download: false }); return "exported"; }
    catch (error) { return { message: error.message, reads: window.reads - before }; }
  }, api);
  expect(refused).toEqual({ message, reads: 0 });
  await openGridControl(page, "export");
  const panel = page.locator(".cx-grid-export .cx-grid-panel");
  await panel.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText(message);
  await expect(panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true })).toBeEnabled();
});
