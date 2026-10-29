import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const hfxCss = fs.readFileSync(path.join(repo, "tests/fixtures/hfx-role-host.css"), "utf8");
const DARK = { surface: "rgb(22, 24, 28)", text: "rgb(242, 243, 245)" };
const LIGHT = { surface: "rgb(255, 255, 255)", text: "rgb(22, 24, 28)" };
const grid = () => ({ protocol: "canopyx/2", type: "grid", id: "edges", label: "Token edge records",
  source: { kind: "inline" }, rowHeight: 34, pageSize: 20, selection: "none",
  columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true }, { id: "state", title: "State", kind: "text" }],
  rows: [{ id: "one", cells: { name: "One record", state: "Ready" } }, { id: "two", cells: { name: "Two records", state: "Waiting" } }] });

// Only the grid entry point is eager: optional views and facets load their shipped parts over HTTP.
async function mount(page, create, view, { scope = "", host = "", css = "", hfx = false } = {}) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://canopyx.test/assets/*", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ contentType: name.endsWith(".css") ? "text/css" : "text/javascript", body: asset(name) });
  });
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Token edges</title>
    <link rel="stylesheet" href="/assets/canopyx-grid.css"><style>${hfx ? hfxCss : ""}\n${css}</style>
    <script src="/assets/canopyx-grid.js"></script></head><body>
    <section id="scope" ${scope}><div id="host" ${host}></div></section></body></html>`;
  await page.route("http://canopyx.test/edges", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/edges");
  await page.evaluate(async ({ create, view }) => {
    window.api = CanopyX[create](document.getElementById("host"), { view });
    await window.api.ready;
  }, { create, view });
  await nextFrames(page);
  expect(errors).toEqual([]);
}

async function palette(element, expected) {
  await expect(element).toHaveCSS("color-scheme", "dark");
  await expect(element).toHaveCSS("background-color", expected.surface);
  await expect(element).toHaveCSS("color", expected.text);
}


test('persistent facets follow live host mode, accent and density on desktop and in the phone sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const view = grid(); view.facets = { columns: ['state'] };
  await mount(page, 'createDataGrid', view, { hfx: true, scope: 'data-hfx-style="evotec" data-hfx-mode="dark" data-hfx-density="compact"' });
  const panel = page.getByRole('complementary', { name: 'Refine' });
  await expect(panel).toHaveCSS('background-color', DARK.surface);
  await page.locator('#scope').evaluate(el => { el.dataset.hfxMode = 'light'; el.dataset.hfxDensity = 'comfortable'; });
  await expect(panel).toHaveCSS('background-color', LIGHT.surface); await expect(panel).toHaveCSS('color', LIGHT.text);
  await expect(panel).toHaveCSS('--hfx-control-height-md', '36px');
  expect(await panel.evaluate(el => el.style.getPropertyValue('--hfx-color-surface'))).toBe('');
  await page.locator('#host').evaluate(el => { el.style.setProperty('--hfx-color-accent', 'rgb(155,77,202)'); });
  await expect(panel.getByRole('checkbox').first()).toHaveCSS('accent-color', 'rgb(155, 77, 202)');
  await page.locator('#host').evaluate(el => el.style.removeProperty('--hfx-color-accent'));
  await expect(panel.getByRole('checkbox').first()).toHaveCSS('accent-color', 'rgb(17, 119, 111)');
  await page.locator('#scope').evaluate(el => { el.dataset.hfxStyle = 'contrast'; el.dataset.hfxMode = 'dark'; el.dataset.hfxDensity = 'compact'; });
  await expect(panel).toHaveCSS('background-color', 'rgb(10, 10, 10)');
  await page.setViewportSize({ width: 390, height: 844 }); await expect(panel).toBeHidden();
  await page.locator('.cx-facets-open').click(); const sheet = page.getByRole('dialog', { name: 'Refine' });
  await expect(sheet).toBeVisible(); await expect(panel).toHaveCSS('background-color', 'rgb(10, 10, 10)');
  await page.locator('#scope').evaluate(el => { el.dataset.hfxStyle = 'evotec'; el.dataset.hfxMode = 'light'; el.dataset.hfxDensity = 'comfortable'; });
  await expect(sheet).toHaveCSS('background-color', LIGHT.surface); await expect(panel).toHaveCSS('background-color', LIGHT.surface);
  await expect(sheet).toHaveAttribute('data-hfx-density', 'comfortable');
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0);
  expect(await page.locator('.cx-facets').evaluate(el => el.style.getPropertyValue('--hfx-color-surface'))).toBe('');
  await page.locator('.cx-facets-open').click(); await expect(page.getByRole('dialog', { name: 'Refine' })).toHaveCSS('background-color', LIGHT.surface);
});

test('density changes remeasure fitting like a freshly mounted grid at the same width and query', async ({ page }) => {
  const view = grid(); view.rowHeight = 40;
  view.columns = [{ id: 'name', title: 'Record', kind: 'text', rowHeader: true }, { id: 'state', title: 'Total', kind: 'number', priority: 'essential' }, { id: 'other', title: 'Additional note', kind: 'text', priority: 'optional' }];
  view.rows = Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, cells: { name: 'Workspace configuration and resource capacity ' + i, state: 123456789, other: 'Reference ' + i } }));
  await mount(page, 'createDataGrid', view, { hfx: true, scope: 'data-hfx-style="evotec" data-hfx-mode="light" data-hfx-density="compact"', css: '#scope{width:720px}#host,.reference-host{width:720px;height:320px}' });
  const query = await page.evaluate(() => JSON.stringify(api.getQuery()));
  for (const density of ['comfortable', 'compact']) {
    await page.locator('#scope').evaluate((el, density) => { el.dataset.hfxDensity = density; }, density);
    await expect(page.locator('#host .cx-canvas .cx-row').first()).toHaveCSS('height', density === 'compact' ? '32px' : '40px');
    const expected = await page.evaluate(async view => {
      const host = document.createElement('div'); host.className = 'reference-host'; document.getElementById('scope').append(host);
      const reference = CanopyX.createDataGrid(host, { view }); await reference.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const sizes = [...host.querySelectorAll('.cx-hcell')].map(el => [el.dataset.cxColumn, Math.round(el.getBoundingClientRect().width)]);
      reference.destroy(); host.remove(); return sizes;
    }, view);
    await expect.poll(async () => {
      const actual = await page.locator('#host .cx-hcell').evaluateAll(cells => cells.map(el => [el.dataset.cxColumn, Math.round(el.getBoundingClientRect().width)]));
      return actual.length === expected.length && actual.every((item, index) => item[0] === expected[index][0] && Math.abs(item[1] - expected[index][1]) <= 1);
    }).toBe(true);
    expect(await page.evaluate(() => JSON.stringify(api.getQuery()))).toBe(query);
  }
});

test('a fixed HFX dark host prints its generated tree outline on light paper', async ({ page }) => {
  const view = { ...grid(), type: 'view', roots: grid().rows.map(row => ({ ...row, label: row.cells.name })) };
  const html = viewPage(view).replace('data-canopyx-host data-cx-theme="light"', 'data-canopyx-host').replace('<html lang="en">', '<html lang="en" data-hfx-style="evotec" data-hfx-mode="dark">').replace('<head>', `<head><style>${hfxCss}</style>`);
  await page.route('http://canopyx.test/paper', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/paper'); await page.waitForSelector('[data-cx-ready]'); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
  const host = page.locator('[data-canopyx-host]'); await expect(host).toHaveCSS('background-color', DARK.surface);
  await page.emulateMedia({ media: 'print' }); await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(host).toHaveCSS('background-color', LIGHT.surface); await expect(host).toHaveCSS('color', LIGHT.text);
  const outline = page.locator('.cx-outline-table'); await expect(outline).toBeVisible(); await expect(outline).toHaveCSS('color', LIGHT.text);
  expect(await host.evaluate(el => el.style.getPropertyValue('--hfx-color-text'))).toBe('');
});

test('the script-free themed static fallback prints readable table and header colours under HFX dark roles', async ({ page }) => {
  const html = `<!DOCTYPE html><html lang="en" data-hfx-style="evotec" data-hfx-mode="dark"><head><title>Static paper</title><style>${asset('canopyx.css')}\n${hfxCss}</style></head><body><main class="cx-static"><table style="color:var(--hfx-color-text);background:var(--hfx-color-surface)"><caption style="background:var(--hfx-color-surface)">Records</caption><thead><tr><th style="color:var(--hfx-color-text-secondary);background:var(--hfx-color-surface-sunken)">Record</th></tr></thead><tbody><tr><td>One record</td></tr></tbody></table></main></body></html>`;
  await page.route('http://canopyx.test/static-paper', route => route.fulfill({ contentType: 'text/html', body: html })); await page.goto('http://canopyx.test/static-paper');
  await expect(page.locator('table')).toHaveCSS('background-color', DARK.surface); await page.emulateMedia({ media: 'print' });
  for (const el of [page.locator('main'), page.locator('table'), page.locator('th'), page.locator('td')]) { await expect(el).toHaveCSS('background-color', LIGHT.surface); await expect(el).toHaveCSS('color', LIGHT.text); }
  await expect(page.locator('script')).toHaveCount(0);
});

for (const trigger of ['data-theme', 'data-cx-theme', 'data-hfx-mode', 'data-bs-theme', 'data-hfx-theme', 'data-hfx-tokens']) {
  test(`persistent standalone facets follow ${trigger} changes on desktop and in an open phone sheet`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const view = grid(); view.facets = { columns: ['state'] };
    await mount(page, 'createDataGrid', view, { scope: `${trigger}="dark"` });
    const panel = page.locator('.cx-facets'), host = page.locator('#host');
    await expect(panel).toHaveCSS('background-color', DARK.surface);
    await page.locator('#scope').evaluate((el, trigger) => el.setAttribute(trigger, 'light'), trigger);
    await expect(host).toHaveCSS('color-scheme', 'light'); await expect(panel).toHaveCSS('background-color', LIGHT.surface);
    await page.setViewportSize({ width: 390, height: 844 }); await expect(panel).toBeHidden(); await page.locator('.cx-facets-open').click();
    const sheet = page.getByRole('dialog', { name: 'Refine' }); await expect(sheet).toHaveCSS('background-color', LIGHT.surface);
    await page.locator('#scope').evaluate((el, trigger) => el.setAttribute(trigger, 'dark'), trigger);
    await expect(host).toHaveCSS('color-scheme', 'dark'); await expect(panel).toHaveCSS('background-color', DARK.surface); await expect(sheet).toHaveCSS('background-color', DARK.surface);
    expect(await host.evaluate(el => el.style.getPropertyValue('--hfx-color-surface'))).toBe('');
    await page.evaluate(() => api.destroy()); await expect(sheet).toHaveCount(0); await expect(panel).toHaveCount(0);
  });
}
