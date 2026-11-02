import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { examples, nextFrames } from './support.mjs';

async function openFonts(page, mode, fontGate) {
  await page.route('http://canopyx.test/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    const file = path.join(examples, 'fonts', relative);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    if (path.extname(file) === '.woff2' && fontGate) await fontGate;
    const type = path.extname(file) === '.woff2' ? 'font/woff2' : path.extname(file) === '.css' ? 'text/css' :
      path.extname(file) === '.js' ? 'text/javascript' : 'text/html';
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });
  await page.goto(`http://canopyx.test/${mode}.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const host = document.querySelector('[data-canopyx-host]');
    if (host) await host.canopyx.ready;
    await document.fonts.ready;
  });
  await nextFrames(page);
}

for (const mode of ['inline', 'plain', 'hashed', 'hosted']) test(`${mode} grids and print load the bundled faces and tabular numbers`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.print = () => {
    window.parent.__printedFonts = {
      family: getComputedStyle(document.body).fontFamily,
      faces: [...document.fonts].map(face => ({ family: face.family.replaceAll('"', ''), status: face.status })),
      sources: document.head.querySelectorAll('[data-font-source]').length,
      numeric: getComputedStyle(document.querySelector('.cx-print-number')).fontVariantNumeric
    };
  }; });
  await openFonts(page, mode);
  const faces = await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family.replaceAll('"', ''), status: face.status })));
  expect(faces).toHaveLength(2);
  expect(faces).toEqual(expect.arrayContaining([
    { family: 'Archivo', status: 'loaded' }, { family: 'JetBrains Mono', status: 'loaded' }
  ]));
  const host = page.locator('[data-canopyx-host]');
  await expect(host).toHaveCSS('font-family', /^Archivo,/);
  expect(await host.evaluate(element => getComputedStyle(element).getPropertyValue('--hfx-font-sans').trim())).toBe('');
  await expect(page.locator('.p-mono').first()).toHaveCSS('font-family', /^"JetBrains Mono",/);
  const number = page.locator('.cx-cell.cx-kind-number').first();
  await expect(number).toHaveCSS('font-variant-numeric', 'tabular-nums');
  const widths = await number.evaluate(element => {
    const probe = document.createElement('span'); element.append(probe);
    probe.textContent = '111111'; const ones = probe.getBoundingClientRect().width;
    probe.textContent = '888888'; const eights = probe.getBoundingClientRect().width;
    probe.remove(); return [ones, eights];
  });
  expect(widths[0]).toBeGreaterThan(0);
  expect(widths[0]).toBeCloseTo(widths[1], 1);
  let release, requested;
  const fontGate = new Promise(resolve => { release = resolve; });
  const stylesheetRequested = new Promise(resolve => { requested = resolve; });
  if (mode !== 'inline') await page.route('**/*', async route => {
    if (route.request().frame() !== page.mainFrame() && route.request().url().includes('canopyx-fonts')) {
      requested(); await fontGate;
    }
    await route.fallback();
  });
  const printing = page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.print({ scope: 'all' }));
  if (mode !== 'inline') {
    await stylesheetRequested;
    expect(await page.evaluate(() => window.__printedFonts)).toBeUndefined();
    release();
  }
  await printing;
  const printed = await page.evaluate(() => window.__printedFonts);
  expect(printed.faces).toContainEqual({ family: 'Archivo', status: 'loaded' });
  expect(printed.faces).toHaveLength(2);
  expect(printed).toMatchObject({ family: expect.stringMatching(/^Archivo,/), sources: 1, numeric: 'tabular-nums' });
  await expect(page.locator('head [data-font-source]')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const outcome of ['cancelled', 'failed']) test(`a ${outcome} print font stylesheet retires its iframe without printing`, async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.parent.__printed = true; }; });
  await openFonts(page, 'hashed');
  let release, requested, completed;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  const finished = new Promise(resolve => { completed = resolve; });
  await page.route('**/*', async route => {
    if (route.request().frame() === page.mainFrame() || !route.request().url().includes('canopyx-fonts')) return route.fallback();
    requested(); await gate;
    await route.fulfill({ status: 404, body: '' }); completed();
  });
  const printing = page.evaluate(async () => {
    window.__fontAbort = new AbortController();
    try { await document.querySelector('[data-canopyx-host]').canopyx.print({ scope: 'all', signal: window.__fontAbort.signal }); return 'printed'; }
    catch (error) { return { name: error.name, message: error.message }; }
  });
  await started;
  if (outcome === 'cancelled') {
    await page.evaluate(() => window.__fontAbort.abort());
    expect(await printing).toMatchObject({ name: 'AbortError' });
  }
  release(); await finished;
  if (outcome === 'failed') expect(await printing).toMatchObject({ message: 'CanopyX: print font stylesheet failed to load.' });
  expect(await page.evaluate(() => window.__printed)).toBeUndefined();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('a failed print font payload rejects without printing or retaining its iframe', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => {
    window.parent.printedFontErrors = [...document.fonts].filter(face => face.status === 'error').map(face => face.family);
  }; });
  await openFonts(page, 'hashed');
  const requests = [];
  await page.route('**/*.woff2', async route => {
    if (route.request().frame() === page.mainFrame()) return route.fallback();
    requests.push(route.request().url());
    await route.fulfill({ status: 404, body: '' });
  });
  const result = await page.evaluate(async () => {
    try { await document.querySelector('[data-canopyx-host]').canopyx.print({ scope: 'all' }); return 'printed'; }
    catch (error) { return error.message; }
  });
  expect(requests.length).toBeGreaterThan(0);
  expect(result, JSON.stringify(await page.evaluate(() => window.printedFontErrors))).toBe('CanopyX: print font failed to load.');
  expect(await page.evaluate(() => window.printedFontErrors)).toBeUndefined();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('a static report with two tables loads one font payload and uses tabular numbers', async ({ page }) => {
  await openFonts(page, 'static-report');
  await expect(page.locator('table')).toHaveCount(2);
  await expect(page.locator('table').first()).toHaveCSS('font-family', /^Archivo,/);
  await expect(page.locator('table').first().locator('tbody tr').first().locator('td').last())
    .toHaveCSS('font-variant-numeric', 'tabular-nums');
  expect(await page.evaluate(() => [...document.fonts].filter(face => face.family.replaceAll('"', '') === 'Archivo' && face.status === 'loaded').length)).toBe(1);
  expect(await page.evaluate(() => [...document.fonts].length)).toBe(2);
});

test('late font loading refreshes column fitting without a manual resize', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const opening = openFonts(page, 'hashed', gate);
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').first()).toBeVisible();
  const widths = () => page.locator('.cx-hcell').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
  const before = await widths();
  release(); await opening;
  const automatic = await widths();
  expect(automatic).not.toEqual(before);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.autoSizeColumns());
  await nextFrames(page);
  expect(await widths()).toEqual(automatic);
});
