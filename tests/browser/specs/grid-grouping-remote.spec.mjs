import { test, expect } from "@playwright/test";
import { api, definition, open, orders } from "./grid-grouping-fixtures.mjs";

// A mock server for the multi-level remote protocol (docs/data-protocol.md, "Flat groups and complete-query totals"): it reads
// gridQuery.groupBy, orders records by the levels (by value, or by a group aggregate), applies the remaining sorts inside the
// innermost groups, and answers gridSummary requests with nested groups whose keys carry their outer groups' keys.
const data = orders(600);
const compareValues = (a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
function aggregates(rows) {
  const amounts = rows.map(row => row.cells.amount);
  return { total: amounts.reduce((sum, value) => sum + value, 0), average: amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : null, orders: rows.length };
}
function ordered(query) {
  const search = query.search.toLowerCase();
  let rows = data.filter(row => !search || row.cells.order.toLowerCase().includes(search) || row.cells.customer.toLowerCase().includes(search));
  const levels = query.groupBy || [], rest = query.sort.filter(sort => !levels.some(level => level.column === sort.column));
  const within = (a, b) => { for (const sort of rest) { const result = compareValues(a.cells[sort.column], b.cells[sort.column]); if (result) return sort.direction === "desc" ? -result : result; } return compareValues(a.id, b.id); };
  const arrange = (list, depth) => {
    if (depth === levels.length) return list.sort(within);
    const level = levels[depth], buckets = new Map();
    for (const row of list) { const value = row.cells[level.column]; if (!buckets.has(value)) buckets.set(value, []); buckets.get(value).push(row); }
    const groups = [...buckets.entries()].map(([value, list]) => ({ value, list, aggregate: level.aggregate ? aggregates(list)[level.aggregate] : null }));
    groups.sort((a, b) => level.aggregate ? (level.direction === "desc" ? compareValues(b.aggregate, a.aggregate) : compareValues(a.aggregate, b.aggregate)) || compareValues(a.value, b.value)
      : (level.direction === "desc" ? -1 : 1) * compareValues(a.value, b.value));
    return groups.flatMap(group => arrange(group.list, depth + 1));
  };
  return arrange(rows, 0);
}
function summary(query, broken) {
  const rows = ordered(query), levels = query.groupBy || [];
  const build = (start, end, depth, parent) => {
    const groups = [], column = levels[depth].column;
    for (let offset = start; offset < end;) {
      let last = offset + 1; const value = rows[offset].cells[column];
      while (last < end && rows[last].cells[column] === value) last++;
      const key = (parent ? parent + "/" : "") + column + ":" + value;
      const group = { key, value, offset, count: last - offset, aggregates: aggregates(rows.slice(offset, last)) };
      if (depth + 1 < levels.length && !(broken && depth === 0)) group.groups = build(offset, last, depth + 1, key);
      groups.push(group); offset = last;
    }
    return groups;
  };
  return { protocol: "canopyx/2", type: "gridSummary", view: query.view, revision: "mock-1", query, matched: rows.length,
    aggregates: aggregates(rows), groups: levels.length ? build(0, rows.length, 0, "") : [] };
}

const hostView = () => { const view = definition(); delete view.rows; view.source = { kind: "host" }; view.pageSize = 50; delete view.reporting.detail; return view; };
const setup = `CanopyX.configure('orders', { source: {
  query: (query, { signal }) => fetch('/api/query', { method: 'POST', body: JSON.stringify(query), signal }).then(response => response.json()),
  summary: (query, { signal }) => fetch('/api/summary', { method: 'POST', body: JSON.stringify(query), signal }).then(response => response.json()) } });`;

async function serve(page, state) {
  await page.route("http://canopyx.test/api/**", async route => {
    const query = JSON.parse(route.request().postData()), kind = route.request().url().endsWith("/summary") ? "summary" : "query";
    state.requests.push({ kind, query });
    if (kind === "summary") return route.fulfill({ contentType: "application/json", body: JSON.stringify(summary(query, state.broken)) });
    const rows = ordered(query);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "mock-1",
      offset: query.offset, total: data.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }) });
  });
}

test("a hosted grid sends its levels in every request and accepts the server's nested groups", async ({ page }) => {
  const state = { requests: [], broken: false }; await serve(page, state);
  await open(page, hostView(), setup);
  const first = state.requests.find(request => request.kind === "summary").query;
  expect(first.groupBy).toEqual([{ column: "region", direction: "asc" }, { column: "status", direction: "asc" }]);
  expect(first.sort.slice(0, 2).map(sort => sort.column)).toEqual(["region", "status"]);
  expect(state.requests.filter(request => request.kind === "query").every(request => request.query.groupBy.length === 2)).toBe(true);
  const result = await page.evaluate(api + ".getSummary()");
  expect(result.groups[0].groups[0].key).toBe("region:East/status:Closed");
  await expect(page.locator(".cx-grid-group").first()).toContainText("East");
  // Pages further down belong to their groups; the grid checks every record against the summary.
  await page.evaluate(api + ".scrollToRow(590)");
  await expect(page.locator('.cx-row[data-cx-id]').last()).toBeVisible();
  expect(state.requests.filter(request => request.kind === "summary")).toHaveLength(1);
});

test("groups ordered by an aggregate come back ordered by the server; inconsistent nesting is refused", async ({ page }) => {
  const state = { requests: [], broken: false }; await serve(page, state);
  await open(page, hostView(), setup);
  await page.evaluate(api + ".setGroupBy([{ column: 'region', direction: 'desc', aggregate: 'total' }, { column: 'status', direction: 'asc' }])");
  const totals = (await page.evaluate(api + ".getSummary()")).groups.map(group => group.aggregates.total);
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
  expect(state.requests.at(-1).query.groupBy[0]).toEqual({ column: "region", direction: "desc", aggregate: "total" });
  const before = await page.evaluate(api + ".getSummary()");
  state.broken = true;
  const failure = await page.evaluate(api + ".setQuery({ ...document.querySelector('[data-canopyx-host]').canopyx.getQuery(), search: 'SO-1' }).then(() => '', error => error.message)");
  expect(failure).toContain("lists its inner groups");
  await expect(page.locator(".cx-grid-notice")).toBeVisible();
  expect(await page.evaluate(api + ".getSummary()")).toEqual(before);
});
