import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

async function open(page, runtime = "grid") {
  const { script, style } = runtimeAssets(runtime);
  await page.route("http://127.0.0.1:8996/", route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live lifecycle</title><style>' + style + '</style><script>' + script + '</script></head><body class="cx-page"></body></html>' }));
  await page.goto("http://127.0.0.1:8996/");
}

for (const runtime of ["grid", "reporting"]) test(`every lazy live API initializes its own existing or later ${runtime} instance`, async ({ page }) => {
  await open(page, runtime);
  const results = await page.evaluate(async runtime => {
    const operations = ["applyTransaction", "addRows", "updateRows", "removeRows", "setRows", "flushTransactions", "refreshRows", "resort", "poll"];
    const make = async (id, live, disabled = false) => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id, label: id, rowHeight: 34, pageSize: 50,
        selection: "none", search: false, columns: [{ id: "value", title: "Value", kind: "number" }],
        source: { kind: "inline" }, rows: [{ id: "row", cells: { value: 7 } }], ...(runtime === "reporting" ? { reporting: {} } : {}),
        ...(live ? { live: { batchMs: disabled ? 60000 : 0 } } : {}) }, ...(disabled ? { live: false } : {}) });
      await api.ready; return api;
    };
    const existing = [];
    for (const operation of operations) existing.push(await make("before-" + operation, false));
    const active = await make("active", true), out = [];
    for (const order of ["before", "after", "after-disabled"]) for (const [index, operation] of operations.entries()) {
      const api = order === "before" ? existing[index] : await make(order + "-" + operation, order === "after-disabled", order === "after-disabled");
      let error = null, polling = false;
      try {
        if (operation === "applyTransaction") await api.applyTransaction({ update: [{ id: "row", cells: { value: 9 } }] });
        else if (operation === "addRows") await api.addRows([{ id: "new", cells: { value: 9 } }]);
        else if (operation === "updateRows") await api.updateRows([{ id: "row", cells: { value: 9 } }]);
        else if (operation === "removeRows") await api.removeRows(["row"]);
        else if (operation === "setRows") await api.setRows([{ id: "row", cells: { value: 9 } }]);
        else if (operation === "poll") { const poller = await api.poll({ intervalMs: 60000, load: () => [] }); polling = poller.active; poller.stop(); }
        else await api[operation]();
      } catch (caught) { error = caught.message; }
      out.push({ order, operation, error, polling, values: api.view.rows.map(row => row.cells.value), pending: api.getLiveState().pending });
      api.destroy();
    }
    active.destroy(); return out;
  }, runtime);
  expect(results).toHaveLength(27);
  for (const result of results) {
    expect(result.error, result.order + " " + result.operation).toBeNull();
    const values = result.operation === "removeRows" ? [] : result.operation === "addRows" ? [7, 9] :
      ["applyTransaction", "updateRows", "setRows"].includes(result.operation) ? [9] : [7];
    expect(result.values).toEqual(values);
    expect(result.pending).toBe(0);
    expect(result.polling).toBe(result.operation === "poll");
  }
});

for (const scenario of ["manual+manual", "manual+poll", "poll+manual", "manual+update"]) test(`inline loads preserve request order for ${scenario}`, async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
    window.loads = []; window.events = [];
    window.api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "loads", label: "Readings", rowHeight: 34, pageSize: 50,
      selection: "none", search: false, columns: [{ id: "value", title: "Value", kind: "number" }], source: { kind: "inline" }, live: true,
      rows: [{ id: "row", cells: { value: 0 } }] }, live: { load: () => new Promise(resolve => window.loads.push(resolve)) },
      onRowsChanged: event => window.events.push(event) });
    await window.api.ready; window.poller = await window.api.poll({ intervalMs: 60000 });
  });
  try {
    await page.evaluate(scenario => {
      const [first, second] = scenario.split("+"), call = kind => kind === "poll" ? window.poller.refresh() : window.api.refreshRows();
      window.first = call(first);
      window.secondKind = second;
    }, scenario);
    await expect.poll(() => page.evaluate(() => window.loads.length)).toBe(1);
    await page.evaluate(() => { window.second = window.secondKind === "update" ? window.api.updateRows([{ id: "row", cells: { value: 9 } }]) :
      window.secondKind === "poll" ? window.poller.refresh() : window.api.refreshRows(); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => window.loads.length)).toBe(1);
    await page.evaluate(() => { window.loads[0]([{ id: "row", cells: { value: 1 } }]); });
    await page.evaluate(() => window.first);
    if (!scenario.endsWith("update")) {
      await expect.poll(() => page.evaluate(() => window.loads.length)).toBe(2);
      await page.evaluate(() => { window.loads[1]([{ id: "row", cells: { value: 2 } }]); });
    }
    await page.evaluate(() => window.second);
    const result = await page.evaluate(() => ({ value: window.api.view.rows[0].cells.value, sources: window.events.map(event => event.source), pending: window.api.getLiveState().pending }));
    expect(result).toEqual({ value: scenario.endsWith("update") ? 9 : 2, sources: scenario.split("+").map(kind => kind === "manual" ? "refresh" : kind === "update" ? "api" : "poll"), pending: 0 });
  } finally { await page.evaluate(() => { window.poller.stop(); window.api.destroy(); }); }
});

for (const operation of ["load", "replacement"]) for (const pendingQuery of [false, true]) test(`${operation} preserves a same-turn later update${pendingQuery ? " while a query settles" : ""}`, async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async ({ operation, pendingQuery }) => {
    const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
    const loads = [], api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "barrier", label: "Readings", rowHeight: 34, pageSize: 50,
      selection: "none", search: true, columns: [{ id: "value", title: "Value", kind: "number", sortable: true }], source: { kind: "inline" }, live: true,
      rows: [{ id: "row", cells: { value: 0 } }] }, live: { load: () => new Promise(resolve => loads.push(resolve)) } });
    await api.ready;
    try {
      let settled = !pendingQuery;
      const query = pendingQuery ? api.setQuery({ ...api.getQuery(), sort: [{ column: "value", direction: "desc" }] }).then(() => { settled = true; }) : Promise.resolve();
      const queryPending = !settled, first = operation === "load" ? api.refreshRows() : api.setRows([{ id: "row", cells: { value: 1 } }]);
      const later = api.updateRows([{ id: "row", cells: { value: 9 } }]), pendingWhenQueued = api.getLiveState().pending;
      let valueWhileLoading = null;
      if (operation === "load") {
        while (!loads.length) await new Promise(resolve => setTimeout(resolve, 1));
        valueWhileLoading = api.view.rows[0].cells.value;
        loads[0]([{ id: "row", cells: { value: 1 } }]);
      }
      await Promise.all([query, first, later]);
      return { queryPending, pendingWhenQueued, valueWhileLoading, final: api.view.rows[0].cells.value, pending: api.getLiveState().pending };
    } finally { api.destroy(); }
  }, { operation, pendingQuery });
  expect(result).toEqual({ queryPending: pendingQuery, pendingWhenQueued: 1, valueWhileLoading: operation === "load" ? 0 : null, final: 9, pending: 0 });
});

for (const installed of [true, false]) test(`destroyed ${installed ? "installed" : "lazy"} live methods return rejected promises`, async ({ page }) => {
  await open(page);
  const methods = ["refreshRows", "resort", "flushTransactions", "setRows", "applyTransaction", "poll"], results = [];
  for (const [index, method] of methods.entries()) {
    // A fresh document keeps each lazy case on its own first public live call.
    if (index) await page.reload();
    results.push(await page.evaluate(async ({ installed, method }) => {
      const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
      const api = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "destroyed", label: "Readings", rowHeight: 34, pageSize: 50,
        selection: "none", search: false, columns: [{ id: "value", title: "Value", kind: "number" }], source: { kind: "inline" },
        rows: [{ id: "row", cells: { value: 0 } }], ...(installed ? { live: true } : {}) } });
      await api.ready; api.destroy();
      let value, synchronous = null, rejection = null, handled = false;
      try {
        value = method === "setRows" ? api.setRows([]) : method === "applyTransaction" ? api.applyTransaction({ update: [{ id: "row", cells: { value: 1 } }] }) :
          method === "poll" ? api.poll({ intervalMs: 60000, load: () => [] }) : api[method]();
      } catch (error) { synchronous = error.name; }
      const returnedPromise = !!value && typeof value.then === "function" && typeof value.catch === "function";
      if (returnedPromise) await value.then(result => result?.stop?.()).catch(error => { handled = true; rejection = error.name; });
      return { method, returnedPromise, synchronous, rejection, handled };
    }, { installed, method }));
  }
  expect(results).toEqual(methods.map(method => ({ method, returnedPromise: true, synchronous: null, rejection: "AbortError", handled: true })));
});
