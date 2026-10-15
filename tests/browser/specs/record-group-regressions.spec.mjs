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
  await expect(page.locator(".cx-grid-group").first().locator(".cx-grid-group-aggregates")).toContainText("Order count 48");
  await page.evaluate(api + ".setGroupCollapsed(" + JSON.stringify((await page.evaluate(api + ".getSummary()")).groups[0].key) + ", true)");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(0);
  await page.evaluate(api + ".setGroupBy([{ column: 'status', direction: 'asc' }])");
  expect(await page.evaluate(api + ".getCollapsedGroups()")).toEqual([]);
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
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
