import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { viewPage, nextFrames, repo } from "./support.mjs";
import { definition as groupedDefinition, open as openGroups, api } from "./grid-grouping-fixtures.mjs";

const recordView = () => ({ protocol: "canopyx/2", type: "grid", id: "records", label: "Records", source: { kind: "inline" },
  pageSize: 20, selection: "none", search: false,
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "status", title: "Status", kind: "text", sortable: true }],
  rows: [{ id: "a", cells: { name: "Alpha", status: "Active" }, fields: { note: "  =SUM(A1)" } }],
  record: { fields: [{ id: "note", title: "Note" }], header: { status: "status", facts: ["note"] },
    sections: [{ id: "overview", label: "Overview", fields: [] }] } });
const drawer = page => page.locator("dialog.cx-drawer");
async function openView(page, view, setup = "", headers = {}) {
  await page.route("http://canopyx.test/record-group-regressions", route => route.fulfill({ contentType: "text/html", headers,
    body: viewPage(view).replace('<body class="cx-page">', '<body class="cx-page"><script>' + setup + "</script>") }));
  await page.goto("http://canopyx.test/record-group-regressions");
  await page.waitForSelector("[data-cx-ready]"); await page.evaluate(api + ".ready"); await nextFrames(page);
}
async function action(page, name) {
  await drawer(page).getByRole("button", { name: "Record actions" }).click();
  await drawer(page).getByRole("menuitem", { name, exact: true }).click();
}

test("record payloads follow accepted revisions and reject a mismatched response", async ({ page }) => {
  const view = recordView(), rows = view.rows; delete view.rows; view.source = { kind: "host" };
  delete view.record.header; view.record.sections[0].fields = ["note"];
  await openView(page, view, `window.revision = 'r1'; window.requests = []; window.wrongRevision = false;
    const rows = ${JSON.stringify(rows)};
    CanopyX.configure('records', { source: {
      query(query) { return { protocol: 'canopyx/2', type: 'gridPage', view: 'records', revision, offset: query.offset,
        total: rows.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }; },
      record(request) { requests.push(request); return { protocol: 'canopyx/2', type: 'gridRecord', view: request.view, id: request.id,
        revision: wrongRevision ? 'another-revision' : request.revision, fields: { note: 'Details at ' + request.revision } }; }
    } });`);
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Details at r1");
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await page.evaluate("revision = 'r2'; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Details at r2");
  expect(await page.evaluate("requests.map(request => request.revision)")).toEqual(["r1", "r2"]);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await page.evaluate("revision = 'r3'; wrongRevision = true; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator(".cx-record-error")).toContainText("requested record and revision");
  await expect(drawer(page)).not.toContainText("Details at r3");
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await page.evaluate("revision = 'inline'; wrongRevision = false; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Details at inline");
  expect(await page.evaluate("requests.at(-1).revision")).toBe("inline");
});

for (const source of ["host", "URL"]) test(`query-aware tree record payloads follow accepted revisions from a ${source} source`, async ({ page }) => {
  const view = recordView(), node = { ...view.rows[0], label: "Alpha" }; delete view.rows; delete view.record.header;
  view.type = "view"; view.rowHeight = 28; view.roots = []; view.record.sections[0].fields = ["note"];
  let revision = "r1";
  if (source === "URL") {
    delete view.roots;
    view.source = { kind: "remote", queryAware: true, children: "/tree-record-roots?ref={ref}&cursor={cursor}&query={viewQuery}&revision={revision}" };
    await page.route("http://canopyx.test/tree-record-roots?*", route => route.fulfill({ contentType: "application/json",
      body: JSON.stringify({ protocol: "canopyx/2", type: "page", parent: null, offset: 0, items: [node], next: null, revision }) }));
  }
  await openView(page, view, `window.revision = 'r1'; window.recordRequests = []; window.wrongRevision = false; window.omitRevision = false;
    CanopyX.configure('records', {
      ${source === "host" ? `source: { queryAware: true, page: () => ({ items: [${JSON.stringify(node)}], next: null, revision }) },` : ""}
      loadRecord(request) { recordRequests.push(request); return { protocol: 'canopyx/2', type: 'gridRecord', view: request.view, id: request.id,
        ...(!omitRevision ? { revision: wrongRevision ? 'another-revision' : revision } : {}), fields: { note: 'Tree details at ' + revision } }; }
    });`);
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Tree details at r1");
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Tree details at r1");
  expect(await page.evaluate("recordRequests.length")).toBe(1);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  revision = "r2"; await page.evaluate("revision = 'r2'; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Tree details at r2");
  expect(await page.evaluate("recordRequests.map(request => request.revision)")).toEqual(["r1", "r2"]);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  revision = "r3"; await page.evaluate("revision = 'r3'; wrongRevision = true; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator(".cx-record-error")).toContainText("requested record and revision");
  await expect(drawer(page)).not.toContainText("Tree details at r3");
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  revision = "r4"; await page.evaluate("revision = 'r4'; wrongRevision = false; omitRevision = true; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Tree details at r4");
  expect(await page.evaluate("recordRequests.map(request => request.revision)")).toEqual(["r1", "r2", "r3", "r4"]);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  revision = "inline"; await page.evaluate("revision = 'inline'; wrongRevision = true; omitRevision = false; " + api + ".reload()");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator(".cx-record-error")).toContainText("requested record and revision");
  expect(await page.evaluate("recordRequests.at(-1).revision")).toBe("inline");
});

test("inline tree record requests keep revision optional and reuse accepted details", async ({ page }) => {
  const view = recordView(); view.type = "view"; view.rowHeight = 28; view.roots = view.rows.map(row => ({ ...row, label: row.cells.name })); delete view.rows;
  delete view.record.header; view.record.sections[0].fields = ["note"];
  await openView(page, view, `window.recordRequests = []; CanopyX.configure('records', { loadRecord(request) {
    recordRequests.push(request); return { id: request.id, fields: { note: 'Inline details' } };
  } });`);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(api + ".openRecord('a')");
    await expect(drawer(page).locator('dd[data-cx-field="note"]')).toHaveText("Inline details");
    await drawer(page).getByRole("button", { name: "Close record" }).click();
  }
  expect(await page.evaluate("recordRequests")).toEqual([{ protocol: "canopyx/2", type: "gridRecordQuery", view: "records", id: "a" }]);
});

test("record exports retain header-only fields and protect spreadsheet formulas", async ({ page }) => {
  await openView(page, recordView(), `window.copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { copied.push(text); return Promise.resolve(); } } });`);
  await page.evaluate(api + ".openRecord('a')");
  await action(page, "Copy values");
  await expect.poll(() => page.evaluate("copied[0]")).toContain("Status\tActive");
  await action(page, "Copy as JSON");
  await expect.poll(() => page.evaluate("copied.length")).toBe(2);
  const data = JSON.parse(await page.evaluate("copied[1]"));
  expect(data.fields.filter(field => field.id === "status")).toEqual([expect.objectContaining({ text: "Active" })]);
  expect(data.fields.filter(field => field.id === "note")).toEqual([expect.objectContaining({ text: "  =SUM(A1)" })]);
  const [download] = await Promise.all([page.waitForEvent("download"), action(page, "Export CSV")]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  expect(csv).toContain('"","Status","Active"');
  expect(csv).toContain('"","Note","\'  =SUM(A1)"');
});

test("record printing awaits async sections and disposes cancelled renderers", async ({ page }) => {
  const view = recordView(); view.record.sections[0].renderer = "chart";
  await openView(page, view, `window.printed = []; window.disposals = 0;
    CanopyX.configure('records', { recordSections: { chart: async (record, element, context) => {
      if (!context.print) return;
      window.printContext = context; await new Promise(resolve => { window.finishChart = resolve; });
      const chart = document.createElement('p'); chart.textContent = 'Completed chart of ' + record.id; element.appendChild(chart);
      context.onDispose(() => disposals++);
    } }, onRecordPrint(detail) { printed.push(detail.element.textContent); detail.dispose(); return false; } });`);
  await page.evaluate(api + ".openRecord('a')");
  await action(page, "Print record");
  await expect.poll(() => page.evaluate("typeof finishChart")).toBe("function");
  expect(await page.evaluate("printed")).toEqual([]);
  await page.evaluate("finishChart()");
  await expect.poll(() => page.evaluate("printed")).toEqual([expect.stringContaining("Completed chart of a")]);
  await expect(page.locator(".cx-record-print")).toHaveCount(0);
  expect(await page.evaluate("disposals")).toBe(1);
  await page.evaluate("finishChart = null"); await action(page, "Print record");
  await expect.poll(() => page.evaluate("typeof finishChart")).toBe("function");
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await expect(page.locator(".cx-record-print")).toHaveCount(0);
  expect(await page.evaluate("printContext.signal.aborted")).toBe(true);
  await page.evaluate("finishChart()");
  await expect.poll(() => page.evaluate("disposals")).toBe(2);
  expect(await page.evaluate("printed.length")).toBe(1);
});

test("changing record tabs releases nested views and late custom resources", async ({ page }) => {
  const view = recordView();
  view.record.fields.push({ id: "related", title: "Related records" });
  view.rows[0].fields.related = { records: { columns: [{ id: "name", title: "Name" }], rows: [{ id: "b", cells: { name: "Beta" } }] } };
  view.record.sections = [{ id: "related", label: "Related", renderer: "slow", fields: ["related"] }, { id: "notes", label: "Notes", fields: ["note"] }];
  view.record.tabs = [{ id: "related", label: "Related", sections: ["related"] }, { id: "notes", label: "Notes", sections: ["notes"] }];
  await openView(page, view, `window.disposals = 0;
    CanopyX.configure('records', { recordSections: { slow: async (record, element, context) => {
      window.tabContext = context; await new Promise(resolve => { window.finishSection = resolve; });
      context.onDispose(() => disposals++);
    } } });`);
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator(".cx-record-nested[data-cx-ready]")).toHaveCount(1);
  await page.evaluate("window.nestedHost = document.querySelector('.cx-record-nested')");
  await drawer(page).getByRole("tab", { name: "Notes", exact: true }).click();
  expect(await page.evaluate("tabContext.signal.aborted")).toBe(true);
  expect(await page.evaluate("nestedHost.canopyx === undefined")).toBe(true);
  await page.evaluate("finishSection()");
  await expect.poll(() => page.evaluate("disposals")).toBe(1);
  await expect(drawer(page).getByRole("tab", { name: "Notes", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("record sources reject multiple structured members instead of choosing one", async ({ page }) => {
  const view = recordView(); delete view.record.header; view.record.sections[0].fields = ["note"];
  await openView(page, view, `CanopyX.configure('records', { loadRecord: request => ({ id: request.id,
    fields: { note: { items: ['one'], events: [{ summary: 'another' }] } } }) });`);
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator(".cx-record-error")).toContainText("at most one structured value");
  await expect(drawer(page).locator(".cx-record-chips")).toHaveCount(0);
});

test("grouping keeps first-column aggregates and clears collapse keys after regrouping", async ({ page }) => {
  const view = groupedDefinition(); view.reporting.groupBy = [{ column: "region", direction: "asc" }];
  view.rows.forEach(row => { row.cells.region = "Open"; row.cells.status = "Open"; });
  await openGroups(page, view);
  await expect(page.locator(".cx-grid-group").first().locator(".cx-hidden-aggregates")).toContainText("Order count 48");
  await page.evaluate(api + ".setGroupCollapsed(" + JSON.stringify((await page.evaluate(api + ".getSummary()")).groups[0].key) + ", true)");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(0);
  await page.evaluate(api + ".setGroupBy([{ column: 'status', direction: 'asc' }])");
  expect(await page.evaluate(api + ".getCollapsedGroups()")).toEqual([]);
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
});

for (const depth of [1, 2]) test(`phone group totals use cell navigation and preserve row keys with ${depth} grouping levels`, async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const view = groupedDefinition(); view.reporting.groupBy.length = depth;
  // Cell navigation needs a second cell even when the platform font makes fewer columns fit.
  view.columns[1].priority = "essential";
  await openGroups(page, view);
  const heading = page.locator(".cx-grid-group").first(), toggle = heading.locator(".cx-grid-group-toggle");
  const selection = heading.locator(".cx-grid-group-select"), totals = heading.locator(".cx-hidden-aggregates");
  expect(await page.locator(".cx-grid-group").evaluateAll(rows => rows.flatMap(row => [...row.querySelectorAll("button,input,a[href]")]
    .filter(control => control.tabIndex >= 0)))).toEqual([]);
  await heading.focus(); await page.keyboard.press("F2"); await expect(toggle).toBeFocused();
  await page.keyboard.press("ArrowRight"); await expect(selection).toBeFocused();
  await page.keyboard.press("ArrowRight"); await expect(totals).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog.cx-reporting-text");
  await expect(dialog).toBeVisible(); await expect(dialog.locator("h4")).toContainText("Region:");
  await expect(dialog.locator("pre")).toHaveText("Order\nOrders: 12\nAmount\nTotal amount: 6,568 · Average amount: 547.333");
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(totals).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const plain = heading.getByRole("gridcell").nth(1); await expect(plain).toBeFocused();
  await page.keyboard.press("Enter"); await expect(plain).toBeFocused(); await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft"); await expect(totals).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(selection).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(toggle).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(heading).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight"); await expect(toggle).toHaveAttribute("aria-expanded", "true");
  if (depth === 2) {
    await page.keyboard.press("ArrowRight"); await expect(page.locator(".cx-grid-group").nth(1)).toBeFocused();
    await heading.focus();
  }
  // macOS WebKit uses Option+Tab to include native buttons when Keyboard Navigation is off.
  await nextFrames(page); await page.keyboard.press(process.platform === "darwin" && browserName === "webkit" ? "Alt+Tab" : "Tab");
  const visibleSummary = page.locator(".cx-summary-row .cx-aggregate-button");
  await expect(visibleSummary).toBeFocused();
  await page.keyboard.press("Enter"); await expect(dialog.locator("h4")).toHaveText("Order");
  await expect(dialog.locator("pre")).toHaveText("Orders: 48");
  await page.keyboard.press("Escape"); await expect(visibleSummary).toBeFocused();
  await page.keyboard.press(process.platform === "darwin" && browserName === "webkit" ? "Alt+Tab" : "Tab");
  const summary = page.locator(".cx-summary-row .cx-hidden-aggregates");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter"); await expect(dialog.locator("h4")).toHaveText("Query totals");
  await page.keyboard.press("Escape"); await expect(summary).toBeFocused();
});

test("group controls finish held pointer actions across a public refresh", async ({ page }) => {
  await openGroups(page);
  const heading = page.locator(".cx-grid-group").first(), toggle = heading.locator(".cx-grid-group-toggle");
  const heldRefresh = async control => {
    await control.click({ trial: true }); const box = await control.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.evaluate(api + ".refresh()"); await nextFrames(page); await page.mouse.up();
  };
  await heldRefresh(toggle); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const selection = heading.locator(".cx-grid-group-select");
  await selection.click(); await expect.poll(() => page.evaluate(api + ".getSelection().length")).toBe(12);
  await expect(selection).toBeChecked();
  await selection.click(); await expect.poll(() => page.evaluate(api + ".getSelection().length")).toBe(0);
  await expect(selection).not.toBeChecked();
  await heldRefresh(heading.locator(".cx-hidden-aggregates"));
  await expect(page.locator("dialog.cx-reporting-text h4")).toContainText("Region: East");
});

test("declared grouping without groupable does not offer or accept header grouping drops", async ({ page }) => {
  const view = groupedDefinition(); view.reporting.groupable = false; view.reporting.groupBy = [{ column: "region", direction: "asc" }];
  await openGroups(page, view);
  await page.locator('[data-cx-column-menu="customer"]').click();
  await expect(page.getByRole("menuitem", { name: "Group by this column", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const handle = page.locator('[data-cx-column="customer"] .cx-column-move'), bar = page.locator(".cx-groupbar");
  const from = await handle.boundingBox(), to = await bar.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 10, { steps: 4 }); await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 6 }); await page.mouse.up();
  expect((await page.evaluate(api + ".getGroupBy()")).map(level => level.column)).toEqual(["region"]);
});

test("option-only detail grids remain usable after another grid loads grouping", async ({ page }) => {
  await openGroups(page);
  await page.evaluate(async () => {
    const host = document.body.appendChild(document.createElement("div")); host.id = "plain-details";
    window.plain = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "plain", label: "Plain", source: { kind: "inline" }, pageSize: 20, selection: "none",
      columns: [{ id: "name", title: "Name", kind: "text" }], rows: [{ id: "a", cells: { name: "Alpha" } }] },
      detail: { render(row, element) { element.textContent = "Details of " + row.id; } } });
    await plain.ready; await plain.expandDetail("a");
  });
  await expect(page.locator("#plain-details .cx-detail-body")).toHaveText("Details of a");
});

test("detail cleanup registered after collapse runs immediately", async ({ page }) => {
  const view = groupedDefinition(); view.reporting = {}; delete view.rows[0].detail;
  await openGroups(page, view, `window.disposals = 0; CanopyX.configure('orders', { detail: {
    async render(row, element, context) { window.detailContext = context; await new Promise(resolve => { window.finishDetail = resolve; });
      context.onDispose(() => disposals++); }
  } });`);
  await page.evaluate(api + ".expandDetail('o000'); undefined");
  await expect.poll(() => page.evaluate("typeof finishDetail")).toBe("function");
  await page.evaluate(api + ".collapseDetail('o000')");
  expect(await page.evaluate("detailContext.signal.aborted")).toBe(true);
  await page.evaluate("finishDetail()");
  await expect.poll(() => page.evaluate("disposals")).toBe(1);
  await expect(page.locator('.cx-detail-row[data-cx-detail="o000"]')).toHaveCount(0);
});

test("detail HTML and record icons respect sanitation and Trusted Types", async ({ page, browserName }) => {
  const view = recordView(); view.reporting = { detail: {} }; view.rows[0].detail = { type: "html", html: "<em>payload markup</em>" };
  await openView(page, view, `window.sanitized = []; CanopyX.configure('records', {
    sanitizeHtml(html, context) { sanitized.push({ html, kind: context.kind }); const text = document.createElement('p');
      text.textContent = 'Sanitized ' + (html.includes('payload') ? 'payload' : 'host'); return text; }
  });`, browserName === "chromium" ? { "Content-Security-Policy": "require-trusted-types-for 'script'; trusted-types canopyx" } : {});
  await page.evaluate(api + ".expandDetail('a')");
  await expect(page.locator('.cx-detail-row[data-cx-detail="a"] .cx-detail-body')).toHaveText("Sanitized payload");
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).getByRole("button", { name: "Record actions" })).toBeVisible();
  expect(await page.evaluate("sanitized")).toEqual([{ html: "<em>payload markup</em>", kind: "detail" }]);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await page.evaluate(async () => {
    const host = document.body.appendChild(document.createElement("div")); host.id = "html-details";
    const view = { protocol: "canopyx/2", type: "grid", id: "html-detail", label: "HTML", source: { kind: "inline" }, pageSize: 20, selection: "none",
      columns: [{ id: "name", title: "Name", kind: "text" }], rows: [{ id: "b", cells: { name: "Beta" } }] };
    window.htmlGrid = CanopyX.createDataGrid(host, { view, detail: { html: () => "<b>host markup</b>" },
      sanitizeHtml(html, context) { sanitized.push({ html, kind: context.kind }); return "<p>Sanitized host</p>"; } });
    await htmlGrid.ready; await htmlGrid.expandDetail("b");
  });
  await expect(page.locator("#html-details .cx-detail-body")).toHaveText("Sanitized host");
  expect(await page.evaluate("sanitized.at(-1)")).toEqual({ html: "<b>host markup</b>", kind: "detail" });
});

test("tree drawer cleanup registered after async setup runs after repaint and close", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "view", id: "tree-lifetime", label: "Tree lifetime", rowHeight: 28, pageSize: 20, selection: "none",
    source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "status", title: "Status", kind: "text" }],
    roots: [{ id: "a", label: "Alpha", cells: { status: "Active" } }, { id: "b", label: "Beta", cells: { status: "Idle" } }] };
  await openView(page, view, `window.drawerSetups = []; CanopyX.configure('tree-lifetime', { renderers: {
    status(node, element, context) {
      if (!element.matches('dd')) return false;
      element.textContent = node.cells.status;
      const setup = { context, disposed: 0 }; drawerSetups.push(setup);
      setup.ready = (async () => {
        await new Promise(resolve => { setup.finish = resolve; });
        context.onDispose(() => setup.disposed++);
      })();
      return true;
    }
  } });`);
  await page.evaluate(api + ".openDetails('a')");
  await expect(drawer(page).locator('dd[data-cx-field="status"]')).toHaveText("Active");
  await drawer(page).getByRole("button", { name: "Next record", exact: true }).click();
  await expect(drawer(page).locator('dd[data-cx-field="status"]')).toHaveText("Idle");
  expect(await page.evaluate("drawerSetups[0].context.signal.aborted")).toBe(true);
  await page.evaluate(async () => { drawerSetups[0].finish(); await drawerSetups[0].ready; });
  expect(await page.evaluate("drawerSetups[0].disposed")).toBe(1);
  await drawer(page).getByRole("button", { name: "Close record details", exact: true }).click();
  await expect(drawer(page)).toHaveCount(0);
  expect(await page.evaluate("drawerSetups[1].context.signal.aborted")).toBe(true);
  await page.evaluate(async () => { drawerSetups[1].finish(); await drawerSetups[1].ready; });
  expect(await page.evaluate("drawerSetups.map(setup => setup.disposed)")).toEqual([1, 1]);
});

for (const kind of ["grid", "tree"]) for (const input of ["pointer", "keyboard"]) test(`${kind} record repaint fallback keeps the title focus treatment after ${input} input`, async ({ page }) => {
  const view = recordView(); view.record.sections[0].renderer = "temporary";
  if (kind === "tree") { view.type = "view"; view.rowHeight = 28; view.roots = view.rows.map(row => ({ ...row, label: row.cells.name })); delete view.rows; }
  await openView(page, view, `CanopyX.configure('records', {
    loadRecord: request => new Promise(resolve => { window.finishRecord = () => resolve({ id: request.id, fields: { note: 'Loaded' } }); }),
    recordSections: { temporary(record, element, context) { if (context.payload) return;
      const button = document.createElement('button'); button.type = 'button'; button.id = 'temporary-action'; button.textContent = 'Temporary action'; element.appendChild(button);
    } }
  });`);
  await page.evaluate(api + ".openRecord('a')");
  const button = drawer(page).getByRole("button", { name: "Temporary action", exact: true });
  await button.click(); await button.focus();
  if (input === "keyboard") await page.keyboard.press("Shift");
  await page.evaluate("finishRecord()");
  const title = drawer(page).locator("h4");
  await expect(title).toBeFocused();
  const ring = () => title.evaluate(element => element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none");
  await expect.poll(ring).toBe(input === "keyboard");
});

test("formatting loaded after a drawer opens updates that drawer and subsequent rule changes", async ({ page }) => {
  const view = recordView(); delete view.record.header; view.record.sections[0].fields = ["status", "note"];
  await page.route("http://canopyx.test/canopyx-formatting.js", route => route.fulfill({
    contentType: "text/javascript", path: path.join(repo, "CanopyX.Html/Assets/canopyx-formatting.js") }));
  await page.route("http://canopyx.test/canopyx-formatting.css", route => route.fulfill({
    contentType: "text/css", path: path.join(repo, "CanopyX.Html/Assets/canopyx-formatting.css") }));
  await openView(page, view); await page.evaluate(api + ".openRecord('a')");
  const field = drawer(page).locator('dd[data-cx-field="status"]');
  const warning = [{ id: "late", column: "status", style: { tone: "warning", icon: "star" } }];
  const danger = [{ id: "late", column: "status", style: { tone: "danger", icon: "cross" } }];
  await page.evaluate(rules => document.querySelector("[data-canopyx-host]").canopyx.setFormatRules(rules), warning);
  await expect(field).toHaveClass(/cx-fmt-fill/);
  await expect(field.locator(".cx-fmt-icon")).toHaveText("★");
  await page.evaluate(rules => document.querySelector("[data-canopyx-host]").canopyx.setFormatRules(rules), danger);
  await expect(field.locator(".cx-fmt-icon")).toHaveText("✕");
  await page.evaluate(api + ".setFormatRules([])");
  await expect(field).not.toHaveClass(/cx-fmt-fill/); await expect(field.locator(".cx-fmt-icon")).toHaveCount(0);
  await page.evaluate(rules => document.querySelector("[data-canopyx-host]").canopyx.setFormatRules(rules), danger);
  await drawer(page).getByRole("button", { name: "Close record" }).click();
  await page.evaluate(api + ".openRecord('a')");
  await expect(drawer(page).locator('dd[data-cx-field="status"] .cx-fmt-icon')).toHaveText("✕");
});
