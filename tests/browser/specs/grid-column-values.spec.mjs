import { test, expect } from "@playwright/test";
import { runtimeAssets, nextFrames, openExample } from "./support.mjs";
import { mountReportLayout, reportLayoutView, layoutGeometry } from "./report-grid-layout-support.mjs";

function valueView() {
  const view = reportLayoutView();
  view.id = "column-values"; view.selection = "none"; view.reporting = { grouping: { column: "state", direction: "asc" } };
  view.columns = [{ id: "name", title: "Record", kind: "text" },
    { id: "state", title: "State", kind: "text", sortable: true, valueLabels: { fail: "Needs review", pass: "Verified" },
      valueOrder: ["fail", "pass"], valueTones: { fail: "warning", pass: "success" }, presenter: { kind: "enum" } },
    { id: "days", title: "Days", kind: "number", numericTones: [
      { operator: "below", value: 0, tone: "danger", label: "Overdue" },
      { operator: "atMost", value: 14, tone: "warning", label: "Review soon" },
      { operator: "atLeast", value: 30, tone: "success", label: "Time available" }] }];
  view.rows = [
    { id: "a", cells: { name: "Record A", state: "pass", days: 40 } },
    { id: "b", cells: { name: "Record B", state: "fail", days: -1 } },
    { id: "c", cells: { name: "Record C", state: "other", days: 14 } },
    { id: "d", cells: { name: "Record D", state: null, days: null } }];
  return view;
}

test("category labels reach cells, groups, drawer and exports while raw predicates and keys stay intact", async ({ page }) => {
  const view = valueView();
  await mountReportLayout(page, { view });
  await expect(page.locator('.cx-grid-group-text').first()).toHaveText("Needs review");
  await expect(page.locator('[data-cx-id="b"] .p-pill')).toHaveText("Needs review");
  const data = await page.evaluate(async () => {
    const capture = api().prepareExport({ scope: "all", columns: ["state", "days"] });
    const rows = []; for await (const row of capture.rows()) rows.push(row);
    return rows;
  });
  expect(data.find(row => row.id === "b").cells.state).toMatchObject({ value: "fail", text: "Needs review" });
  expect(data.find(row => row.id === "b").cells.days).toMatchObject({ value: -1, text: "-1", tone: "danger" });
  await page.evaluate(() => api().openDetails("b"));
  await expect(page.locator('.cx-drawer dd[data-cx-field="state"]')).toContainText("Needs review");
  await expect(page.locator('.cx-drawer dd[data-cx-field="days"]')).toContainText("Overdue");
});

test("self-contained record-only identifier and wrap fields render without column presenters", async ({ page }) => {
  const errors = [], requests = []; page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  await openExample(page, 'report-grid-record-fields.html');
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
  expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.view.columns.some(column => column.presenter || column.wrap))).toBe(false);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.openDetails('one'));
  await expect(page.locator('.cx-drawer dd[data-cx-field="identifier"] .p-mono')).toHaveText('record-only-identifier');
  await expect(page.locator('.cx-drawer dd[data-cx-field="observation"] .cx-wrapped-text')).toContainText('A record-only observation');
  await expect(page.locator('.cx-drawer dd[data-cx-field="observation"] .cx-wrapped-text')).toHaveCSS('-webkit-line-clamp', '3');
  expect(requests.filter(url => !url.endsWith('report-grid-record-fields.html'))).toEqual([]);
  expect(errors).toEqual([]);
});

for (const configured of [false, true]) test(`boolean and string category identities stay distinct (${configured})`, async ({ page }) => {
  const view = valueView(); view.columns = view.columns.slice(0, 2);
  view.reporting.facetColumns = ['state'];
  const column = view.columns[1]; delete column.presenter; delete column.valueLabels; delete column.valueOrder; delete column.valueTones;
  if (configured) { column.valueLabels = { true: 'String true' }; column.valueTones = { true: 'danger' }; column.valueOrder = ['true', 'false']; }
  view.rows = [{ id: 'boolean', cells: { name: 'Boolean', state: true } }, { id: 'string', cells: { name: 'String', state: 'true' } }, { id: 'other', cells: { name: 'Other', state: 'z' } }];
  await mountReportLayout(page, { view });
  await expect(page.locator('[data-cx-id="boolean"] .cx-cell[aria-colindex="2"]')).toHaveText('Yes');
  await expect(page.locator('[data-cx-id="boolean"] .cx-cell[aria-colindex="2"]')).not.toHaveClass(/cx-tone-danger/);
  await expect(page.locator('[data-cx-id="string"] .cx-cell[aria-colindex="2"]')).toHaveText(configured ? 'String true' : 'true');
  const facets = await page.evaluate(() => api().getFacets('state'));
  expect(facets.items).toHaveLength(3); expect(facets.items.every(item => item.count === 1)).toBe(true);
  if (configured) {
    expect(facets.items.map(item => item.value)).toEqual(['true', true, 'z']);
    await expect(page.locator('.cx-grid-group-text')).toHaveText(['String true', 'Yes', 'z']);
  }
  for (const value of [true, 'true']) {
    await page.evaluate(value => api().setQuery({ ...api().getQuery(), filters: [{ column: 'state', operator: 'eq', values: [value] }] }), value);
    await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(1);
    await expect(page.locator('.cx-row[data-cx-id]')).toHaveAttribute('data-cx-id', typeof value === 'boolean' ? 'boolean' : 'string');
  }
});

test("standalone grid category sorting and filter choices use raw tokens with authored display labels", async ({ page }) => {
  const view = valueView(); delete view.reporting;
  view.query = { sort: [{ column: "state", direction: "asc" }] };
  await mountReportLayout(page, { view, assets: runtimeAssets("grid") });
  await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(4);
  expect(await page.locator('.cx-row[data-cx-id]').evaluateAll(rows => rows.map(row => row.dataset.cxId))).toEqual(["b", "a", "c", "d"]);
  await page.locator('[data-cx-column-menu="state"]').click();
  await page.getByRole("menuitem", { name: /Filter/ }).click();
  await expect(page.locator('.cx-facet-value')).toContainText(["Needs review", "Verified", "other", "—"]);
  await page.evaluate(() => api().setQuery({ ...api().getQuery(), filters: [{ column: "state", operator: "eq", values: ["fail"] }] }));
  await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(1);
  await expect(page.locator('.cx-row[data-cx-id]')).toHaveAttribute("data-cx-id", "b");
});

test("numeric thresholds use first match, color plain text and export numbers without rule words", async ({ page }) => {
  const view = valueView(); delete view.reporting;
  await mountReportLayout(page, { view, assets: runtimeAssets("grid") });
  const overdue = page.locator('[data-cx-id="b"] .cx-cell[aria-colindex="3"]');
  await expect(overdue).toHaveAttribute("title", "Overdue");
  await expect(overdue).toHaveClass(/cx-tone-danger/);
  await expect(overdue.locator('.p-pill,.p-state')).toHaveCount(0);
  const csv = await page.evaluate(() => api().toCsv({ scope: "all", columns: ["days"] }));
  expect(csv).toContain("-1\r\n"); expect(csv).not.toContain("Overdue"); expect(csv).not.toContain("Review soon");
});

test("wrapped text limits measure mixed rows and expose complete text", async ({ page }) => {
  const view = reportLayoutView(); view.rowHeight = "auto"; view.selection = "none";
  view.columns = [{ id: "name", title: "Record", kind: "text", width: 160 },
    { id: "notes", title: "Notes", kind: "text", fixed: true, width: 220, wrap: true, maxLines: 3, tooltip: "auto" }];
  view.rows = [{ id: "short", cells: { name: "Short", notes: "One line" } },
    { id: "long", cells: { name: "Long", notes: "An observation with long wrapped text and complete detail. ".repeat(6) } }];
  await mountReportLayout(page, { view }); await nextFrames(page); await nextFrames(page);
  const short = await page.locator('[data-cx-id="short"]').boundingBox(), long = await page.locator('[data-cx-id="long"]').boundingBox();
  expect(long.height).toBeGreaterThan(short.height + 20);
  const text = page.locator('[data-cx-id="long"] .cx-wrapped-text');
  expect(await text.evaluate(node => node.clientHeight / parseFloat(getComputedStyle(node).lineHeight))).toBeCloseTo(3, 0);
  await expect(text).toHaveAttribute("title", view.rows[1].cells.notes);
  expect((await layoutGeometry(page)).scrollHeight).toBeLessThanOrEqual((await layoutGeometry(page)).clientHeight);
});

test("ten phone cards fit their complete card anatomy within a 3200px host", async ({ page }) => {
  const view = reportLayoutView(); view.selection = "none";
  view.layout = { mode: "cards", modes: ["cards", "fit"] };
  view.rows = Array.from({ length: 10 }, (_, i) => ({ ...view.rows[i % 3], id: "card" + i }));
  await mountReportLayout(page, { view, width: 342, viewport: { width: 390, height: 844 } });
  await page.locator('.cx-host').evaluate(host => { host.style.height = "3200px"; host.style.maxHeight = "3200px"; });
  await nextFrames(page); await nextFrames(page);
  await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(10);
  await expect.poll(() => page.locator('.cx-grid').evaluate(grid => grid.scrollHeight <= grid.clientHeight + 1)).toBe(true);
  const box = await layoutGeometry(page);
  expect(box.bottom).toBeLessThanOrEqual(box.visibleBottom + 1);
  expect(await page.locator('.cx-host').evaluate(host => host.getBoundingClientRect().height)).toBeLessThanOrEqual(3200);
});

for (const configured of [false, true]) test(`case-distinct category facets and filters opt in (${configured})`, async ({ page }) => {
  const view = valueView();
  view.reporting = { facetColumns: ["state"], grouping: { column: "state", direction: "asc" } };
  const column = view.columns[1]; delete column.valueLabels; delete column.valueOrder; delete column.valueTones;
  if (configured) { column.valueLabels = { A: "Upper category", a: "Lower category" }; column.valueOrder = ["a", "A"]; }
  view.rows = [{ id: "upper", cells: { name: "Upper", state: "A", days: 1 } }, { id: "lower", cells: { name: "Lower", state: "a", days: 2 } }];
  await mountReportLayout(page, { view });
  const facet = await page.evaluate(() => api().getFacets("state"));
  expect(facet.items.map(item => [item.value, item.count])).toEqual(configured ? [["a", 1], ["A", 1]] : [["A", 2]]);
  if (configured) await expect(page.locator('.cx-grid-group-text')).toHaveText(["Lower category", "Upper category"]);
  for (const operator of ["eq", "in"]) {
    await page.evaluate(operator => api().setQuery({ ...api().getQuery(), filters: [{ column: "state", operator, values: ["A"] }] }), operator);
    await expect(page.locator('.cx-row[data-cx-id]')).toHaveCount(configured ? 1 : 2);
    if (configured) await expect(page.locator('.cx-row[data-cx-id]')).toHaveAttribute("data-cx-id", "upper");
  }
});

for (const hosted of [false, true]) test(`wrapped identifier and action presenters grow mixed rows (host source ${hosted})`, async ({ page }) => {
  const view = reportLayoutView(); view.id = "host-wrapping"; view.rowHeight = 28;
  if (!hosted) view.autoRowHeight = true;
  view.selection = "none"; view.reporting = {};
  view.columns = [{ id: "name", title: "Name", kind: "text", width: 250, fixed: true, wrap: true, maxLines: 2,
    tooltip: "auto", presenter: { kind: "identifier", mono: true } },
    { id: "action", title: "Action", kind: "text", width: 300, fixed: true, wrap: true, maxLines: 2, presenter: { kind: "longText" } }];
  const name = "gateway-01.eu-west.service.example / customer-facing delivery and recovery";
  const action = "Review the complete observation with the regional service owner, confirm the next maintenance window, and retain the verification evidence.";
  view.rows = [{ id: "long", cells: { name, action } }, { id: "short", cells: { name: "Short", action: "Observe" } }];
  const assets = runtimeAssets("reporting");
  if (hosted) {
    assets.script += `\nCanopyX.configure('host-wrapping',{source:{query(q){const rows=${JSON.stringify(view.rows)};return {protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'host-1',offset:q.offset,total:rows.length,matched:rows.length,items:rows.slice(q.offset,q.offset+q.limit)};}}});`;
    view.source = { kind: "host" }; delete view.rows;
  }
  await mountReportLayout(page, { view, assets }); await nextFrames(page); await nextFrames(page);
  const short = await page.locator('[data-cx-id="short"]').boundingBox(), long = await page.locator('[data-cx-id="long"]').boundingBox();
  expect(long.height).toBeGreaterThan(short.height + 12);
  for (const selector of [".p-mono", '.cx-cell[aria-colindex="2"] .cx-wrapped-text']) {
    const text = page.locator('[data-cx-id="long"] ' + selector).first();
    expect(await text.evaluate(node => node.clientHeight / parseFloat(getComputedStyle(node).lineHeight))).toBeCloseTo(2, 0);
    await expect(text).toHaveAttribute("title", selector === ".p-mono" ? name : action);
  }
});

test("cards retain their fixed geometry when the table opts into automatic wrapped rows", async ({ page }) => {
  const view = reportLayoutView(); view.autoRowHeight = true; view.selection = "none";
  view.layout = { mode: "cards", modes: ["cards", "fit"] };
  view.columns[1].wrap = true; view.columns[1].maxLines = 3;
  view.rows.forEach(row => row.cells.group = "A long observation with a complete explanation and supporting evidence. ".repeat(3));
  await mountReportLayout(page, { view, width: 342, viewport: { width: 390, height: 844 } });
  await expect(page.locator('.cx-row.cx-auto-row')).toHaveCount(0);
  const geometry = await page.locator('.cx-row .cx-wrapped-text').evaluateAll(nodes => nodes.map(node => {
    const cell = node.closest('.cx-cell'), box = cell.getBoundingClientRect(), text = node.getBoundingClientRect();
    const label = getComputedStyle(cell, "::before"), line = parseFloat(getComputedStyle(node).lineHeight);
    return { clamp: getComputedStyle(node).webkitLineClamp, lines: text.height / line,
      labelHeight: parseFloat(label.height), labelLine: parseFloat(label.lineHeight),
      contained: text.top >= box.top + parseFloat(label.lineHeight) && text.bottom <= box.bottom + 1 };
  }));
  expect(geometry.length).toBeGreaterThan(0);
  expect(geometry.every(item => item.clamp === "2" && item.contained && Math.abs(item.lines - 2) < .05 && item.labelHeight >= item.labelLine - .5)).toBe(true);
});

for (const kind of [undefined, "identifier", "longText", "missing", "link"]) test(`column tones reach built-in text presenters (${kind || "automatic wrapped"}) and respect host renderers`, async ({ page }) => {
  const view = valueView(); delete view.reporting; view.rows = [view.rows[1]];
  for (const column of view.columns.slice(1)) {
    column.wrap = true; column.maxLines = 2;
    if (kind) column.presenter = { kind: kind === "link" && column.kind === "number" ? "identifier" : kind }; else delete column.presenter;
  }
  await mountReportLayout(page, { view });
  for (const [index, tone, text] of [[2, "warning", "Needs review"], [3, "danger", "-1"]]) {
    const cell = page.locator(`[data-cx-id="b"] .cx-cell[aria-colindex="${index}"]`);
    await expect(cell.locator('.cx-wrapped-text')).toHaveText(text);
    const colors = await cell.evaluate((element, tone) => {
      const probe = document.createElement('span'); probe.style.color = `var(--cx-tone-${tone})`; element.appendChild(probe);
      const expected = getComputedStyle(probe).color; probe.remove();
      return { expected, actual: getComputedStyle(element.querySelector('.cx-wrapped-text')).color };
    }, tone);
    expect(colors.actual).toBe(colors.expected);
    await expect(cell.locator('.p-pill,.p-state')).toHaveCount(0);
  }
  await expect(page.locator('[data-cx-id="b"] .cx-cell[aria-colindex="3"]')).toHaveAttribute('title', 'Overdue');
  await expect(page.locator('[data-cx-id="b"] .cx-cell[aria-colindex="3"] .cx-wrapped-text')).toHaveAttribute('title', 'Overdue');
  await page.evaluate(() => api().openDetails('b'));
  await expect(page.locator('.cx-drawer dd[data-cx-field="days"]')).toContainText('Overdue');
  await page.evaluate(async () => {
    const host = document.querySelector('[data-canopyx-host]'), view = api().view;
    api().destroy(); host.replaceChildren();
    host.canopyx = CanopyX.createDataGrid(host, { view, renderers: { days(row, element) {
      element.textContent = 'Host ' + row.cells.days; element.style.color = 'rgb(1, 2, 3)'; element.title = 'Host owns this'; return true;
    } } });
    await host.canopyx.ready;
  });
  const custom = page.locator('[data-cx-id="b"] .cx-cell[aria-colindex="3"]');
  await expect(custom).toHaveText('Host -1'); await expect(custom).toHaveAttribute('title', 'Host owns this');
  await expect(custom).toHaveCSS('color', 'rgb(1, 2, 3)');
  const csv = await page.evaluate(() => api().toCsv({ scope: 'all', columns: ['days'] }));
  expect(csv).toContain('-1\r\n'); expect(csv).not.toContain('Host'); expect(csv).not.toContain('Overdue');
});
