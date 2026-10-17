import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = (hosted = false, batchMs = 0) => ({ protocol: "canopyx/2", type: "grid", id: "integrity", label: "Readings", rowHeight: 34,
  pageSize: 50, selection: "multiple", search: true, live: { batchMs },
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "amount", title: "Amount", kind: "number", sortable: true }],
  source: { kind: hosted ? "host" : "inline" }, ...(hosted ? {} : { rows: [{ id: "a", cells: { name: "Alpha", amount: 7 } }, { id: "b", cells: { name: "Beta", amount: 8 } }] }) });

async function open(page, hosted = false, batchMs = 0) {
  const html = viewPage(view(hosted, batchMs)).replace("</head>", `<script>
    window.loadAnswer = null;
    CanopyX.configure("integrity", { live: { load: () => window.loadAnswer }, ${hosted ? `source: { query: query => ({ protocol: "canopyx/2", type: "gridPage", view: "integrity", revision: "r1", offset: query.offset,
      total: 1, matched: 1, items: [{ id: "a", cells: { name: "Alpha", amount: 7 } }] }) }` : ""} });
    </script></head>`);
  await page.route("http://127.0.0.1:8997/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://127.0.0.1:8997/");
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
}

test("nonfinite live values reject atomically through transactions, replacement and load", async ({ page }) => {
  await open(page);
  const outcomes = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx, initial = JSON.stringify(api.view.rows), out = [];
    const cases = [
      ["add NaN", () => api.addRows([{ id: "c", cells: { amount: NaN } }])],
      ["update Infinity", () => api.updateRows([{ id: "a", cells: { amount: Infinity } }])],
      ["replacement negative Infinity", () => api.setRows([{ id: "a", cells: { amount: -Infinity } }])],
      ["decorated value", () => api.updateRows([{ id: "a", cells: { amount: { value: NaN, text: "unknown" } } }])],
      ["decorated sort", () => api.updateRows([{ id: "a", cells: { amount: { value: 9, sort: Infinity } } }])],
      ["mixed transaction", () => api.applyTransaction({ remove: ["b"], add: [{ id: "c", cells: { amount: 9 } }], update: [{ id: "a", cells: { amount: NaN } }] })],
      ["array load", () => { window.loadAnswer = [{ id: "a", cells: { amount: Infinity } }]; return api.refreshRows(); }],
      ["transaction load", () => { window.loadAnswer = { update: [{ id: "a", cells: { amount: -Infinity } }] }; return api.refreshRows(); }]
    ];
    for (const [name, call] of cases) {
      await api.setRows(JSON.parse(initial));
      let error = "";
      try { await call(); } catch (caught) { error = caught.message; }
      out.push({ name, rejected: error.startsWith("CanopyX:"), unchanged: JSON.stringify(api.view.rows) === initial });
    }
    return out;
  });
  expect(outcomes).toHaveLength(8);
  expect(outcomes).toEqual(outcomes.map(({ name }) => ({ name, rejected: true, unchanged: true })));
});

test("an invalid change leaves an earlier batch intact and owned replacements ignore caller mutation", async ({ page }) => {
  await open(page, false, 60000);
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    const queued = api.updateRows([{ id: "a", cells: { amount: 11 } }]);
    let invalid = false;
    const refused = Promise.resolve().then(() => api.updateRows([{ id: "a", cells: { amount: NaN } }])).catch(() => { invalid = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    await api.flushTransactions(); await Promise.all([queued, refused]);
    const preserved = api.view.rows.find(row => row.id === "a").cells.amount;
    const rows = [{ id: "a", cells: { name: "Replacement", amount: 19 } }], replacing = api.setRows(rows);
    rows[0].cells.amount = 29;
    while (!api.getLiveState().pending) await new Promise(resolve => setTimeout(resolve, 0));
    await api.flushTransactions(); await replacing;
    return { invalid, preserved, replacement: api.view.rows[0].cells.amount };
  });
  expect(result).toEqual({ invalid: true, preserved: 11, replacement: 19 });
});

test("hosted no-op pushes distinguish loaded rows from missing identities", async ({ page }) => {
  await open(page, true);
  const results = await page.evaluate(async () => {
    const element = document.querySelector("[data-canopyx-host]"), api = element.canopyx;
    let events = 0; element.addEventListener("canopyx:rowsChanged", () => events++);
    const repeated = await api.updateRows([{ id: "a", cells: { amount: 7 } }, { id: "missing", cells: { amount: 7 } }]);
    const changed = await api.updateRows([{ id: "a", cells: { amount: 9 } }]);
    const cleared = await api.updateRows([{ id: "a", cells: { amount: null } }]);
    const empty = await api.updateRows([{ id: "a", cells: { amount: null } }]);
    return { repeated, changed, cleared, empty, events };
  });
  expect(results.repeated).toMatchObject({ updated: [], missing: ["missing"] });
  expect(results.changed).toMatchObject({ updated: ["a"], missing: [] });
  expect(results.cleared).toMatchObject({ updated: ["a"], missing: [] });
  expect(results.empty).toMatchObject({ updated: [], missing: [] });
  expect(results.events).toBe(2);
});
