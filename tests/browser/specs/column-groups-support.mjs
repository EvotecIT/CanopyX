// Shared helpers for the column group and cell range tests: a quarterly budget view, and a page served from
// https://budget.test/ with a runtime and its parts as plain files, so a test can declare any view in script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assets = path.join(repo, "CanopyX.Html/Assets");
const read = name => fs.readFileSync(path.join(assets, name), "utf8");

export const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A budget grid: line and team, twelve months under quarters under half years, a total and a date. */
export function budgetView(extra = {}, rowCount = 40) {
  const columns = [{ id: "line", title: "Budget line", kind: "text", sortable: true, rowHeader: true }, { id: "team", title: "Team", kind: "text", sortable: true },
    ...MONTHS.map(id => ({ id, title: id[0].toUpperCase() + id.slice(1), kind: "number", sortable: true })),
    { id: "total", title: "Total", kind: "number", sortable: true }, { id: "reviewed", title: "Reviewed", kind: "datetime" }];
  const quarter = index => ({ id: "q" + (index + 1), title: "Q" + (index + 1), columns: MONTHS.slice(index * 3, index * 3 + 3) });
  const rows = Array.from({ length: rowCount }, (_, r) => {
    const cells = { line: "Line " + String(r).padStart(3, "0"), team: ["Platform", "Product", "Sales"][r % 3] };
    MONTHS.forEach((id, m) => { cells[id] = 1000 + (r * 7 + m * 13) % 50 * 10; });
    cells.total = MONTHS.reduce((sum, id) => sum + cells[id], 0);
    cells.reviewed = "2026-0" + (1 + r % 9) + "-1" + (r % 9) + "T10:30:00Z";
    return { id: rowId(r), cells };
  });
  return { protocol: "canopyx/2", type: "grid", id: "budget", label: "Budget", pageSize: 100, selection: "multiple", search: true, rowHeight: 34,
    source: { kind: "inline" }, columns, rows,
    columnGroups: [{ id: "h1", title: "First half", groups: [quarter(0), quarter(1)] }, { id: "h2", title: "Second half", groups: [quarter(2), quarter(3)] }], ...extra };
}

/** Serves one grid from https://budget.test/ and waits until it is ready; options become the host options (a script literal). */
export async function serveGrid(page, view, { runtime = "canopyx-grid", options = "{}", lang = "en", height = 560, before = "" } = {}) {
  await page.route("https://budget.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><title>Budget</title><style>' +
      read(runtime + ".css") + "body{margin:0;padding:16px}</style><script src=\"/" + runtime + '.js"></script></head><body><script>window.events=[];window.errors=[];' + before +
      "</script><div id=\"host\" style=\"height:" + height + "px\"></div><script>const host=document.getElementById('host');" +
      "host.addEventListener('canopyx:error',e=>errors.push(e.detail.error.message));" +
      "window.api=CanopyX.createDataGrid(host,Object.assign({view:" + JSON.stringify(view) + "}," + options + "));</script></body></html>" });
    if (!fs.existsSync(path.join(assets, file))) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(file) });
  });
  await page.goto("https://budget.test/");
  await page.waitForFunction(() => window.api && document.querySelector("[data-cx-ready]"));
  await page.evaluate(() => window.api.ready);
}

/** The column ids of the bottom header row, in order. */
export const headerColumns = page => page.evaluate(() => [...document.querySelectorAll(".cx-head .cx-hrow:not(.cx-hgroup-row) .cx-hcell")].map(cell => cell.dataset.cxColumn));

/** Each group cell as "id:colspan". */
export const groupSpans = page => page.evaluate(() => [...document.querySelectorAll(".cx-hgroup")].map(cell => cell.dataset.cxGroup + ":" + cell.getAttribute("aria-colspan")));

/** Row ids sort as their positions do (inline rows without a sort keep the order of their ids). */
export const rowId = position => "r" + String(position).padStart(4, "0");

/** A body cell by row position and visible column index. */
export const bodyCell = (page, row, column) => page.locator('.cx-canvas .cx-row[data-cx-id="' + rowId(row) + '"] .cx-cell').nth(column);
