import { test, expect } from "@playwright/test";
import { read } from "./formatting-support.mjs";
import { viewPage, nextFrames, exampleUrl } from "./support.mjs";

const definition = patch => ({ protocol: "canopyx/2", type: "grid", id: "cx1", label: "Linked records", rowHeight: 36,
  pageSize: 2, selection: "multiple", search: true, rowAction: "details", source: { kind: "inline" },
  columns: [{ id: "name", title: "Record", kind: "text", sortable: true }, { id: "site", title: "Site", kind: "text" },
    { id: "kind", title: "Kind", kind: "text" }],
  rows: patch?.source?.kind === "host" ? undefined : Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, cells: { name: "Record " + i, site: "Berlin", kind: i % 2 ? "Fix" : "Feature" } })), ...patch });
const selected = page => page.evaluate(() => api.getSelection());
const row = (page, index) => page.locator(`.cx-row[data-cx-id="r${index}"]`);
async function mount(page, patch = {}, options = "{}") {
  const html = viewPage(definition(patch)).replace('</head>', '<script>' + read('canopyx-link.js') + '</script></head>').replace('data-canopyx-host ', 'data-canopyx-host id="cx1" ').replace('</body>', `<script>
    window.selects = []; window.links = []; window.actions = [];
    CanopyX.configure("cx1", { ...${options}, linkEvents:true, onRowActivate:e => { actions.push(e.id); return false; } });
    document.getElementById("cx1").addEventListener("canopyx:select", e => selects.push(e.detail.ids));
    document.getElementById("cx1").addEventListener("canopyx:linkchange", e => links.push(e.detail));
    </script></body>`);
  await page.route("http://127.0.0.1/linked-contract", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://127.0.0.1/linked-contract");
  await page.waitForFunction(() => document.getElementById("cx1").canopyx?.ready);
  await page.evaluate(async () => { window.api = document.getElementById("cx1").canopyx; await api.ready; });
}

test("pointer opt-in selects without checkboxes, toggles, extends across source pages and emits link changes", async ({ page }) => {
  await mount(page, { selectOnClick: true });
  expect(await page.evaluate(() => api.selectOnClick)).toBe(true);
  await expect(page.locator('.cx-grid-row-select')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll('[id="cx1"]').length)).toBe(1);
  await row(page, 1).click();
  await expect.poll(() => selected(page)).toEqual(["r1"]);
  await expect(row(page, 1)).toHaveAttribute("aria-selected", "true");
  await row(page, 3).click({ modifiers: ["ControlOrMeta"] });
  await expect.poll(() => selected(page)).toEqual(["r1", "r3"]);
  await row(page, 3).click({ modifiers: ["ControlOrMeta"] });
  await expect.poll(() => selected(page)).toEqual(["r1"]);
  await row(page, 6).click({ modifiers: ["Shift"] });
  await expect.poll(() => selected(page)).toEqual(["r3", "r4", "r5", "r6"]);
  await expect.poll(() => page.evaluate(() => links.at(-1)?.keys)).toEqual(["r3", "r4", "r5", "r6"]);
  expect(await page.evaluate(() => [selects.at(-1), links.at(-1).scope, actions])).toEqual([["r3", "r4", "r5", "r6"], "select", []]);
  await row(page, 6).focus(); await page.keyboard.press("Space");
  await expect.poll(() => selected(page)).toEqual(["r3", "r4", "r5"]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => actions)).toEqual(["r6"]);
});

test("runtime property switches row actions to selection and back while selection none stays disabled", async ({ page }) => {
  await mount(page);
  expect(await page.evaluate(() => api.selectOnClick)).toBe(false);
  await row(page, 0).click();
  expect(await selected(page)).toEqual([]);
  expect(await page.evaluate(() => actions)).toEqual(["r0"]);
  await page.evaluate(() => { api.selectOnClick = true; });
  await row(page, 1).click();
  await expect.poll(() => selected(page)).toEqual(["r1"]);
  await page.evaluate(() => { api.selectOnClick = false; });
  await row(page, 2).click();
  expect(await selected(page)).toEqual(["r1"]);
  expect(await page.evaluate(() => actions)).toEqual(["r0", "r2"]);
  await mount(page, { selectOnClick: true, selection: "none" });
  await row(page, 0).click(); await page.keyboard.press("Space");
  expect(await selected(page)).toEqual([]);
});

test("multi-field chips name fields, honor explicit captions and remove the whole source by keyboard", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => api.setExternalFilter("chart", [{ field:"site", values:["Berlin"] }, { field:"kind", values:["Feature"], sourceLabel:"Release chart" }]));
  const chip = page.locator('.cx-link-chip');
  await expect(chip).toHaveText("Filtered by Release chart: Site: Berlin · Kind: Feature ×");
  await expect(chip).toHaveAccessibleName("Remove the filter from Release chart: Site: Berlin · Kind: Feature");
  await page.evaluate(() => api.setExternalFilter("chart", [{ field:"site", values:["Berlin"], label:"Region: Berlin", sourceLabel:"Release chart" }, { field:"kind", values:["Feature"] }]));
  await expect(chip).toHaveText("Filtered by Release chart: Region: Berlin · Kind: Feature ×");
  await chip.focus(); await page.keyboard.press("Enter");
  await expect(chip).toHaveCount(0);
  expect(await page.evaluate(() => [api.getExternalFilters(), api.getQuery().filters])).toEqual([[], []]);
});

test("canonical theme roles take precedence and legacy-only themes keep their computed colors", async ({ page }) => {
  await mount(page);
  const colors = () => page.evaluate(() => {
    const host = document.getElementById('cx1'), style = getComputedStyle(host);
    return [style.backgroundColor, style.color, style.borderTopColor, getComputedStyle(host.querySelector('.cx-grid-query-summary')).color];
  });
  await page.evaluate(() => {
    const s = document.getElementById('cx1').style;
    for (const [name, value] of Object.entries({ surface:'#f0f1f2', text:'#123456', border:'#765432', 'text-muted':'#345678' })) s.setProperty('--hfx-color-' + name, value);
  });
  const legacy = ["rgb(240, 241, 242)", "rgb(18, 52, 86)", "rgb(118, 84, 50)", "rgb(52, 86, 120)"];
  expect(await colors()).toEqual(legacy);
  await page.evaluate(() => {
    const s = document.getElementById('cx1').style;
    for (const [name, value] of Object.entries({ 'surface-card':'#fffaf0', 'text-primary':'#102030', 'surface-line':'#8090a0', 'text-secondary':'#405060' })) s.setProperty('--hfx-color-' + name, value);
  });
  const canonical = ["rgb(255, 250, 240)", "rgb(16, 32, 48)", "rgb(128, 144, 160)", "rgb(64, 80, 96)"];
  expect(await colors()).toEqual(canonical);
  await page.evaluate(() => {
    const s = document.getElementById('cx1').style;
    for (const name of ['surface','text','border','text-muted']) s.removeProperty('--hfx-color-' + name);
  });
  expect(await colors()).toEqual(canonical);
  await nextFrames(page);
});

test("generated hosts carry the range reader for runtime pointer opt-in and removable multi-field chips", async ({ page }) => {
  await page.goto(exampleUrl('linked-views.html'));
  await page.waitForFunction(() => document.getElementById('linked-services')?.canopyx);
  await page.evaluate(() => document.getElementById('linked-services').canopyx.ready);
  await page.getByRole('button', { name:'Berlin · Healthy', exact:true }).click();
  const chip = page.locator('#linked-services .cx-link-chip');
  await expect(chip).toHaveText('Filtered by Service chart: Site: Berlin · Status: Healthy ×');
  await chip.click(); await expect(chip).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById('linked-services').canopyx.view.selectOnClick)).toBeUndefined();
  const rows = page.locator('#linked-services .cx-row[data-cx-id]');
  await rows.nth(0).click(); await rows.nth(3).click({ modifiers:['Shift'] });
  await expect.poll(() => page.evaluate(() => document.getElementById('linked-services').canopyx.getSelection())).toEqual(['svc-00', 'svc-01', 'svc-02', 'svc-03']);
});


test("a query shape change retires the pointer range anchor", async ({ page }) => {
  await mount(page, { selectOnClick:true });
  await row(page, 9).click();
  await page.evaluate(() => api.setQuery({ ...api.getQuery(), search:"Record 1" }));
  await row(page, 11).click({ modifiers:["Shift"] });
  await expect.poll(() => selected(page)).toEqual(["r11"]);
});

test("host pointer ranges respect newer selection and pending queries", async ({ page }) => {
  await mount(page, { selectOnClick:true, source:{ kind:"host" }, pageSize:100 }, `{
    source:{ async query(query) {
      const items = Array.from({ length:12 }, (_, i) => ({ id:"r" + i, cells:{ name:"Record " + i, site:"Berlin", kind:"Feature" } }));
      if (window.holdRange) { window.heldCalls = (window.heldCalls || 0) + 1; window.rangeStarted = true; await new Promise(resolve => window.finishRange = resolve); }
      return { protocol:"canopyx/2", type:"gridPage", view:query.view, revision:"v1", total:12, matched:12,
        offset:query.offset, items:items.slice(query.offset, query.offset + query.limit) };
    } }
  }`);
  await row(page, 1).click();
  await page.evaluate(() => { window.holdRange = true; });
  await row(page, 6).click({ modifiers:["Shift"] });
  await page.waitForFunction(() => window.rangeStarted);
  await page.evaluate(() => { api.setSelection(["r0"]); window.holdRange = false; finishRange(); });
  await nextFrames(page);
  expect(await selected(page)).toEqual(["r0"]);
  await row(page, 1).click();
  await page.evaluate(() => { window.holdRange = true; window.rangeStarted = false; window.pendingQueryPromise = api.setQuery({ ...api.getQuery(), search:"next" }); });
  await page.waitForFunction(() => window.rangeStarted);
  await row(page, 6).click({ modifiers:["Shift"] });
  await nextFrames(page);
  expect(await page.evaluate(() => window.heldCalls)).toBe(2);
  expect(await selected(page)).toEqual(["r1"]);
  await page.evaluate(async () => { window.holdRange = false; finishRange(); await window.pendingQueryPromise; });
});

test("reporting query selection preserves exclusions with pointer opt-in", async ({ page }) => {
  await mount(page, { selectOnClick:true, reporting:{ selectionControls:true } });
  await page.evaluate(() => api.selectAllMatching());
  await row(page, 2).click({ modifiers:["ControlOrMeta"] });
  expect(await page.evaluate(() => api.getSelectionDescriptor())).toMatchObject({ kind:"query", excludedIds:["r2"] });
});
