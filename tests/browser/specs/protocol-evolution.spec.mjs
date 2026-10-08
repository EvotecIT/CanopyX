import { test, expect } from "@playwright/test";
import { openExample, viewPage, nextFrames } from "./support.mjs";

test("executed root and packed sidecars preserve prototype-shaped cell keys and template text", async ({ page }) => {
  await openExample(page, "sidecar-keys/index.html");
  await expect(page.locator('[data-cx-id="root"] [aria-colindex="2"]')).toHaveText("Root ` ${value} <metadata>");
  await expect(page.locator('[data-cx-id="child"] [aria-colindex="2"]')).toHaveText("Child ` ${value} <metadata>");
  const cells = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.visibleRows()
    .map(row => ({ id: row.node.id, own: Object.hasOwn(row.node.cells, "__proto__") })));
  expect(cells).toEqual([{ id: "root", own: true }, { id: "child", own: true }]);
});

test("additive grid document fields load while known invalid fields still reject atomically", async ({ page }) => {
  const future = { futureHint: { version: 3 } };
  const view = { protocol: "canopyx/2", type: "grid", id: "evolution", label: "Protocol evolution", ...future,
    source: { kind: "inline", ...future }, pageSize: 10, selection: "multiple",
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true, ...future },
      { id: "amount", title: "Amount", kind: "number", sortable: true,
        presenter: { kind: "progress", maximum: 100, thresholds: [{ upperBound: 50, tone: "success", ...future }], ...future } },
      { id: "history", title: "History", kind: "text", presenter: { kind: "sparklineLine", ...future } }],
    reporting: { ...future, layout: { name: { minimum: 40, maximum: 1000, ...future } },
      ordering: { name: { text: "natural", ...future } } },
    highlightRules: [{ column: "amount", operator: "ge", values: [1], target: "cell", tone: "success", ...future }],
    query: { ...future, sort: [{ column: "name", direction: "asc", ...future }],
      filters: [{ column: "amount", operator: "ge", values: [1], ...future }],
      filterGroup: { operator: "and", filters: [{ column: "name", operator: "isNotNull", values: [], ...future }],
        groups: [{ operator: "or", filters: [{ column: "amount", operator: "ge", values: [1], ...future }], groups: [], ...future }], ...future } },
    rows: [{ id: "one", ...future, cells: { name: { value: "One", text: "Display one", ...future }, amount: 10,
      history: { value: "Trend", series: [{ period: "Today", value: 1, ...future }], ...future } } }] };
  await page.route("http://canopyx.test/evolution", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/evolution");
  await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
  await expect(page.locator('[data-cx-id="one"]')).toContainText("Display one");
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx, before = api.getQuery();
    try { await api.setQuery({ filters: [{ column: "amount", operator: "ge", values: ["invalid"] }] }); }
    catch (error) { return { rejected: true, unchanged: JSON.stringify(before) === JSON.stringify(api.getQuery()) }; }
    return { rejected: false };
  });
  expect(result).toEqual({ rejected: true, unchanged: true });
});

test("the core grid rejects unknown saved query fields before changing accepted state", async ({ page }) => {
  const view = { protocol: 'canopyx/2', type: 'grid', id: 'strict-state', label: 'Saved state',
    source: { kind: 'inline' }, pageSize: 10, selection: 'none',
    columns: [{ id: 'name', title: 'Name', kind: 'text', sortable: true }], rows: [{ id: 'one', cells: { name: 'One' } }] };
  await page.route('http://canopyx.test/strict-state', route => route.fulfill({ contentType: 'text/html', body: viewPage(view) }));
  await page.goto('http://canopyx.test/strict-state'); await page.waitForSelector('[data-cx-ready]');
  const result = await page.evaluate(async () => {
    const api = document.querySelector('[data-canopyx-host]').canopyx, before = api.getState();
    const failures = [];
    for (const part of ['query', 'sort', 'predicate', 'group', 'nestedPredicate']) {
      const state = structuredClone(before), query = state.query;
      query.sort = [{ column: 'name', direction: 'asc' }];
      query.filters = [{ column: 'name', operator: 'eq', values: ['One'] }];
      query.filterGroup = { operator: 'and', filters: [], groups: [
        { operator: 'or', filters: [{ column: 'name', operator: 'eq', values: ['One'] }], groups: [] }] };
      const item = part === 'query' ? query : part === 'sort' ? query.sort[0] : part === 'predicate' ? query.filters[0] :
        part === 'group' ? query.filterGroup.groups[0] : query.filterGroup.groups[0].filters[0];
      item.futurePolicy = true;
      try { await api.setState(state); failures.push(part); } catch (_) { /* This version cannot restore the new semantics. */ }
    }
    return { failures, unchanged: JSON.stringify(before) === JSON.stringify(api.getState()) };
  });
  expect(result).toEqual({ failures: [], unchanged: true });
});

for (const hosted of [false, true]) test(`malformed predicate operators reject before changing ${hosted ? "hosted" : "inline"} records or saved state`, async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "operator-types", label: "Typed predicates",
    source: { kind: hosted ? "host" : "inline" }, pageSize: 10, selection: "none",
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true }] };
  const rows = [{ id: "one", cells: { name: "One" } }];
  if (!hosted) view.rows = rows;
  const setup = hosted ? `window.requests=[];CanopyX.configure('operator-types',{source:{query(query){requests.push(query);
    return {protocol:'canopyx/2',type:'gridPage',view:'operator-types',revision:'v1',offset:query.offset,total:1,matched:1,items:${JSON.stringify(rows)}};}}});` : "window.requests=[];";
  await page.route("http://canopyx.test/operator-types", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/operator-types"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx, before = api.getState(), requestsBefore = requests.length;
    const failures = [];
    for (const method of ["setQuery", "setState"]) for (const nested of [false, true]) {
      const state = structuredClone(before), predicate = { column: "name", operator: ["eq"], values: ["One"] };
      if (nested) state.query.filterGroup = { operator: "and", filters: [], groups: [{ operator: "or", filters: [predicate], groups: [] }] };
      else state.query.filters = [predicate];
      try { await api[method](method === "setQuery" ? state.query : state); failures.push({ method, nested }); } catch (_) { /* Invalid known values must reject. */ }
    }
    return { failures, unchanged: JSON.stringify(before) === JSON.stringify(api.getState()), requests: requests.length - requestsBefore };
  });
  expect(result).toEqual({ failures: [], unchanged: true, requests: 0 });
  await expect(page.locator('[data-cx-id="one"]')).toContainText("One");
});
