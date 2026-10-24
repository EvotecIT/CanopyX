import { test, expect } from "@playwright/test";
import { mountReportLayout, reportLayoutView } from "./report-grid-layout-support.mjs";
import { viewPage } from "./support.mjs";

test("explicit blank plain and presenter cells remain blank while absent values keep the missing marker", async ({ page }) => {
  const view = reportLayoutView(); view.selection = "none"; view.reporting = {};
  const kinds = ["plain", "identifier", "longText", "state", "missing"];
  view.columns = [{ id: "name", title: "Record", kind: "text" }, ...kinds.map(kind => ({
    id: kind, title: kind, kind: "text", ...(kind === "plain" ? {} : { presenter: { kind } }), width: 140, fixed: true, alwaysVisible: true
  }))];
  view.rows = ["blank", "missing"].map(id => ({ id, cells: { name: id,
    ...Object.fromEntries(kinds.map(kind => [kind, id === "blank" ? { value: null, text: "" } : null])) } }));
  await mountReportLayout(page, { view });
  for (let index = 0; index < kinds.length; index++) {
    const cell = page.locator(`[data-cx-id="blank"] .cx-cell[aria-colindex="${index + 2}"]`);
    await expect(cell).toHaveText(""); await expect(cell.locator(".p-missing")).toHaveCount(0);
    const missing = page.locator(`[data-cx-id="missing"] .cx-cell[aria-colindex="${index + 2}"]`);
    await expect(missing).toHaveText("—");
    if (kinds[index] === "plain") await expect(missing).toHaveClass(/p-missing/);
    else await expect(missing.locator(".p-missing")).toHaveText("—");
  }
  await page.evaluate(() => api().openDetails("blank"));
  for (const kind of kinds) await expect(page.locator(`.cx-drawer dd[data-cx-field="${kind}"]`)).toHaveText("");
  await page.keyboard.press("Escape"); await page.evaluate(() => api().openDetails("missing"));
  for (const kind of kinds) await expect(page.locator(`.cx-drawer dd[data-cx-field="${kind}"] .p-missing`)).toHaveText("—");
});

test("category labels precede empty cell text in plain cells presenters drawers and raw exports", async ({ page }) => {
  const view = reportLayoutView(); view.selection = "none"; view.reporting = {};
  const kinds = ["plain", "identifier", "longText", "state", "missing"];
  view.columns = [{ id: "name", title: "Record", kind: "text" }, ...kinds.map(kind => ({
    id: kind, title: kind, kind: "text", ...(kind === "plain" ? {} : { presenter: { kind } }),
    ...(kind === "longText" ? { wrap: true, maxLines: 2 } : {}),
    valueLabels: { fail: "Needs review" }, width: 140, fixed: true, alwaysVisible: true
  }))];
  view.rows = [{ id: "a", cells: { name: "Record", ...Object.fromEntries(kinds.map(kind => [kind, { value: "fail", text: "" }])) } }];
  await mountReportLayout(page, { view });
  for (let index = 0; index < kinds.length; index++)
    await expect(page.locator(`[data-cx-id="a"] .cx-cell[aria-colindex="${index + 2}"]`)).toHaveText("Needs review");
  await page.evaluate(() => api().openDetails("a"));
  for (const kind of kinds) await expect(page.locator(`.cx-drawer dd[data-cx-field="${kind}"]`)).toHaveText("Needs review");
  const exported = await page.evaluate(async () => { for await (const row of api().prepareExport({ scope: "filtered", raw: true }).rows()) return row.cells; });
  for (const kind of kinds) expect(exported[kind]).toMatchObject({ value: "fail", text: "Needs review" });
});

test("tree cells and shared record scalar fallbacks retain category labels and explicit blanks", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "view", id: "reading-tree", label: "Records", rowHeight: 32,
    source: { kind: "inline" }, columns: [{ id: "name", title: "Record", kind: "text", width: 220 },
      { id: "state", title: "State", kind: "text", width: 180, valueLabels: { fail: "Needs review" } }],
    record: { hideEmpty: false, fields: [{ id: "extra", title: "Extra" }, { id: "absent", title: "Absent" }] },
    roots: [{ id: "a", label: "Record", cells: { state: { value: "fail", text: "" } }, fields: { extra: { value: null, text: "" } } },
      { id: "blank", label: "Blank", cells: { state: { value: null, text: "" } } }] };
  await page.route("http://canopyx.test/reading-tree", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/reading-tree"); await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator('[data-cx-id="a"] .cx-cell[aria-colindex="2"]')).toHaveText("Needs review");
  await expect(page.locator('[data-cx-id="blank"] .cx-cell[aria-colindex="2"]')).toHaveText("");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.openDetails("a"));
  await expect(page.locator('.cx-drawer dd[data-cx-field="state"]')).toHaveText("Needs review");
  await expect(page.locator('.cx-drawer dd[data-cx-field="extra"]')).toHaveText("");
  await expect(page.locator('.cx-drawer dd[data-cx-field="extra"] .p-missing')).toHaveCount(0);
  await expect(page.locator('.cx-drawer dd[data-cx-field="absent"] .p-missing')).toHaveText("—");
  view.record.hideEmpty = true;
  await page.reload(); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.openDetails("a"));
  await expect(page.locator('.cx-drawer dd[data-cx-field="state"]')).toHaveText("Needs review");
  await expect(page.locator('.cx-drawer dd[data-cx-field="extra"]')).toHaveCount(0);
});

test("bounded long text keeps two reading lines and complete text in the record drawer", async ({ page }, testInfo) => {
  const view = reportLayoutView(); view.selection = "none"; view.reporting = {}; view.autoRowHeight = true;
  view.columns = [{ id: "name", title: "Record", kind: "text" },
    { id: "notes", title: "Observation", kind: "text", width: 260, fixed: true, wrap: true, maxLines: 2, presenter: { kind: "longText" } }];
  const text = "Review the complete observation and retain the verification evidence. ".repeat(15);
  view.rows = [{ id: "record", cells: { name: "Record", notes: text } }];
  await mountReportLayout(page, { view });
  const row = page.locator('[data-cx-id="record"]');
  await expect(row.locator(".cx-presenter-expand")).toHaveCount(0);
  const preview = row.locator(".cx-wrapped-text"); await expect(preview).toHaveText(text);
  const lines = await preview.evaluate(node => node.clientHeight / parseFloat(getComputedStyle(node).lineHeight));
  expect(lines).toBeGreaterThan(1.5); expect(lines).toBeLessThanOrEqual(2.1);
  await page.evaluate(() => api().openDetails("record"));
  const full = page.locator('.cx-drawer dd[data-cx-field="notes"] .cx-wrapped-text');
  await expect(full).toHaveText(text);
  expect(await full.evaluate(node => node.clientHeight / parseFloat(getComputedStyle(node).lineHeight))).toBeGreaterThan(4);
  await expect(page.locator(".cx-drawer .cx-presenter-expand")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("complete-record.png") });
});

test("record-only wrapped fields retain their authored preview limit", async ({ page }) => {
  const view = reportLayoutView(); view.selection = "none"; view.reporting = {};
  view.columns = [{ id: "name", title: "Record", kind: "text" }];
  view.record = { fields: [{ id: "observation", title: "Observation", wrap: true, maxLines: 3 }] };
  view.rows = [{ id: "a", cells: { name: "Record" }, fields: { observation: "A record-only observation with complete supporting evidence. ".repeat(8) } }];
  await mountReportLayout(page, { view });
  await page.evaluate(() => api().openDetails("a"));
  await expect(page.locator('.cx-drawer dd[data-cx-field="observation"] .cx-wrapped-text')).toHaveCSS("-webkit-line-clamp", "3");
});

for (const width of [1440, 390]) test(`padded headers keep full descriptions and at most two label lines at ${width}px`, async ({ page }, testInfo) => {
  const view = reportLayoutView(); view.selection = "none"; view.reporting = {};
  const description = "Full explanation of the latest successful verification and its collection time";
  view.columns = [{ id: "name", title: "Latest successful verification", headerDescription: description,
    kind: "text", width: 190, fixed: true, sortable: true, alwaysVisible: true },
    { id: "detail", title: "Collection time", headerDescription: "Complete collection timestamp", kind: "text", width: 140, fixed: true, alwaysVisible: true }];
  view.rows = [{ id: "a", cells: { name: "Verified", detail: "Recently" } }];
  await mountReportLayout(page, { view, width: width - 48, viewport: { width, height: 900 } });
  const header = page.locator('.cx-hcell[data-cx-column="name"]');
  await expect(header).toHaveAttribute("title", description); await expect(header).toHaveAttribute("aria-description", description);
  await expect(header.locator(".cx-sort")).toHaveAttribute("title", description);
  const geometry = await header.locator(".cx-htext").evaluate(node => ({
    lines: node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight),
    clamp: getComputedStyle(node).webkitLineClamp
  }));
  expect(geometry.clamp).toBe("2"); expect(geometry.lines).toBeLessThanOrEqual(2.1);
  await expect(page.locator('.cx-hcell[data-cx-column="detail"] .cx-htext')).toHaveAttribute("title", "Complete collection timestamp");
  await page.screenshot({ path: testInfo.outputPath("padded-header.png") });
});
