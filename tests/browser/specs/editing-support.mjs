// Shared fixtures for the editing tests: a page served from https://editing.test/ with the grid runtime loaded by its plain
// file name, so the editing part (and the filter editor it requires) load as plain files beside it, as on a real site.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const assets = path.join(repo, "CanopyX.Html/Assets");
export const read = name => fs.readFileSync(path.join(assets, name), "utf8");

/** A generic asset register: every editor type, with validation. */
export function assetView(extra = {}, columns = {}) {
  const statuses = ["In use", "In stock", "Repair", "Retired"], owners = ["Ada Park", "Ben Ortiz", "Chen Wu", "Dana Kim", "Eli Novak"];
  return {
    protocol: "canopyx/2", type: "grid", id: "assets", label: "Asset register", pageSize: 100, selection: "multiple", search: true,
    source: { kind: "inline" }, timeZone: "utc", query: { sort: [{ column: "tag", direction: "asc" }] },
    columns: [
      { id: "tag", title: "Asset tag", kind: "text", width: 120, sortable: true, editable: true,
        validation: { required: true, pattern: "[A-Z]{2}-\\d{4}" }, ...columns.tag },
      { id: "name", title: "Name", kind: "text", width: 220, sortable: true, editable: true, validation: { required: true, maxLength: 40 }, ...columns.name },
      { id: "cost", title: "Cost", kind: "number", width: 110, sortable: true, editable: true, editor: { type: "number", min: 0, max: 100000, step: 0.01 }, ...columns.cost },
      { id: "purchased", title: "Purchased", kind: "datetime", width: 170, sortable: true, editable: true, editor: "date", ...columns.purchased },
      { id: "checked", title: "Last check", kind: "datetime", width: 170, editable: true, editor: "datetime", ...columns.checked },
      { id: "status", title: "Status", kind: "text", width: 120, editable: true, editor: { type: "select", options: statuses }, ...columns.status },
      { id: "insured", title: "Insured", kind: "text", width: 90, editable: true, editor: "toggle", ...columns.insured },
      { id: "owner", title: "Owner", kind: "text", width: 150, editable: true, editor: { type: "lookup" }, ...columns.owner },
      { id: "site", title: "Site", kind: "text", width: 120 }
    ],
    rows: Array.from({ length: 40 }, (_, i) => ({ id: "a" + i, cells: {
      tag: "AS-" + String(1000 + i), name: "Laptop " + i, cost: 900 + i * 25.5,
      purchased: new Date(Date.UTC(2024, i % 12, 1 + (i % 27))).toISOString(), checked: new Date(Date.UTC(2026, 9, 1 + (i % 14), 9, 30)).toISOString(),
      status: statuses[i % statuses.length], insured: i % 3 !== 0, owner: owners[i % owners.length], site: ["Warsaw", "Berlin", "Madrid"][i % 3] } })),
    ...extra
  };
}

/**
 * Serves one grid page. script runs before the view mounts (CanopyX.configure, plugins); routes adds handlers of other
 * paths (a mock data service). Returns the part files the page requested.
 */
export async function serveGrid(page, { view = assetView(), script = "", height = 520, routes = {}, theme = "light", lang = "en" } = {}) {
  const requested = [];
  await page.route("https://editing.test/**", async route => {
    const url = new URL(route.request().url()), file = url.pathname.slice(1);
    if (routes[url.pathname]) return routes[url.pathname](route);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Editing</title>' +
      '<style>' + read("canopyx-grid.css") + "body{margin:0;padding:16px;background:" + (theme === "dark" ? "#16181c" : "#fff") + "}</style>" +
      '<script src="/canopyx-grid.js"></script></head><body><script>window.events=[];window.errors=[];' + script + "</script>" +
      '<div class="cx-host" data-canopyx-host data-cx-theme="' + theme + '" style="height:' + height + 'px"><script type="application/json" class="cx-config">' +
      JSON.stringify(view).replace(/</g, "\\u003c") + "</script></div>" +
      "<script>document.querySelector('[data-canopyx-host]').addEventListener('canopyx:error',e=>errors.push(e.detail.error.message));</script></body></html>" });
    requested.push(file);
    if (!fs.existsSync(path.join(assets, file))) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(file) });
  });
  await page.goto("https://editing.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready.catch(() => {}));
  return requested;
}

/** The cell of a row and column, by the column's position among the visible columns. */
export function cell(page, id, column) {
  return page.locator('.cx-row[data-cx-id="' + id + '"]').locator(".cx-cell").nth(column);
}
