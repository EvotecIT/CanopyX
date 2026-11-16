// Scale budgets (docs/large-data.md#directory-sized-reports): a groupable reporting grid of 500,000 directory-shaped rows,
// built in the page, sorted by a date column, filtered, grouped and searched at normal speed in Chromium. Each operation is
// timed until painted and printed for pull requests. The budgets leave room for slower runners; a regression to comparing
// rows by reading and parsing their cells in every comparison takes the sort past its budget (about 2.5 s on a workstation).
import { expect, test } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

const ROWS = 500000;
const SORT_MS = 1500;
const FILTER_MS = 1000;
const GROUP_MS = 2000;
const SEARCH_MS = 2000;

function build(rows) {
  const words = ["alpha", "bravo", "cedar", "delta", "ember", "fjord", "garnet", "harbor", "indigo", "juniper", "kestrel", "lumen"];
  const departments = ["Finance", "Sales", "Engineering", "Support", "Legal", "Marketing", "Operations", "Research"];
  let state = 7;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const pad = (value, width) => String(value).padStart(width, "0");
  const date = (from, years) => (from + Math.floor(next() * years)) + "-" + pad(1 + Math.floor(next() * 12), 2) + "-" + pad(1 + Math.floor(next() * 28), 2) +
    "T" + pad(Math.floor(next() * 24), 2) + ":" + pad(Math.floor(next() * 60), 2) + ":00Z";
  const data = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const first = words[Math.floor(next() * words.length)], last = words[Math.floor(next() * words.length)], sam = first[0] + last + i;
    data[i] = { id: "u" + pad(i, 7), cells: { sam, upn: sam + "@ad.example.test", enabled: next() > 0.12 ? "Enabled" : "Disabled",
      department: departments[Math.floor(next() * departments.length)], lastLogon: date(2024, 3), created: date(2010, 15), groups: Math.floor(next() * 60) } };
  }
  const host = document.createElement("div");
  host.style.height = "640px"; document.body.appendChild(host);
  const grid = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "users", label: "Users", rowHeight: 32, pageSize: 200,
    selection: "multiple", search: true, source: { kind: "inline" }, reporting: { groupable: true, responsive: true },
    columns: [{ id: "sam", title: "Account", kind: "text", sortable: true, rowHeader: true }, { id: "upn", title: "User principal name", kind: "text", sortable: true },
      { id: "enabled", title: "Enabled", kind: "text", sortable: true }, { id: "department", title: "Department", kind: "text", sortable: true },
      { id: "lastLogon", title: "Last logon", kind: "datetime", sortable: true }, { id: "created", title: "Created", kind: "datetime", sortable: true },
      { id: "groups", title: "Groups", kind: "number", sortable: true }],
    rows: data } });
  window.__grid = grid;
  return grid.ready.then(() => true);
}

test.describe("scale budgets", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Timed against the Chromium engine.");
  test.setTimeout(240000);

  test("a groupable grid of " + ROWS.toLocaleString("en-US") + " rows sorts, filters, groups and searches within budget", { tag: "@benchmark" }, async ({ page }) => {
    const { script, style } = runtimeAssets("reporting");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent("<!DOCTYPE html><html><head><style>" + style + "</style><script>" + script + "</script></head><body class=\"cx-page\"></body></html>");
    await page.evaluate(build, ROWS);
    const timed = (body) => page.evaluate(async (source) => {
      const started = performance.now();
      await new Function("api", "return (async () => { " + source + " })();")(window.__grid);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Math.round(performance.now() - started);
    }, body);
    const sort = await timed("await api.sort([{ column: 'lastLogon', direction: 'desc' }]);");
    // The newest logon leads after the descending sort (ties by identity).
    const order = await page.evaluate(() => {
      const newest = window.__grid.view.rows.reduce((best, row) => !best || row.cells.lastLogon > best.cells.lastLogon ? row : best, null);
      const shown = [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex"));
      return { expected: newest.id, first: shown[0].getAttribute("data-cx-id"), rows: window.__grid.view.rows.length };
    });
    const filter = await timed("await api.setQuery({ filters: [{ column: 'enabled', operator: 'eq', values: ['Disabled'] }] });");
    const group = await timed("await api.setQuery({ filters: [] }); await api.setGroupBy([{ column: 'department', direction: 'asc' }]);");
    const search = await timed("await api.setGroupBy([]); await api.setQuery({ search: 'kestrel' });");
    console.log(ROWS + " rows: sort " + sort + " ms, filter " + filter + " ms, group " + group + " ms, search " + search + " ms");
    expect(order.rows).toBe(ROWS);
    expect(order.first).toBe(order.expected);
    expect(sort).toBeLessThanOrEqual(SORT_MS);
    expect(filter).toBeLessThanOrEqual(FILTER_MS);
    expect(group).toBeLessThanOrEqual(GROUP_MS);
    expect(search).toBeLessThanOrEqual(SEARCH_MS);
  });
});
