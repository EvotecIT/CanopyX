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
      filterGroup: { operator: "and", filters: [{ column: "name", operator: "isNotNull", values: [], ...future }], groups: [], ...future } },
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
