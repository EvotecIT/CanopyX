import { test, expect } from '@playwright/test';
import { viewPage, nextFrames, openGridControl } from './support.mjs';
import { pinTestFont } from './visual-font.mjs';

// One long identifier and ten short context/count fields, as in a connection-probe grid.
const titles = ['Target', 'Site', 'State', 'Last 24 h', 'Last result', 'Latency (ms)',
  'TCP open', 'TCP failing', 'UDP open', 'UDP failing', 'Last error'];
function probes() {
  return { protocol: 'canopyx/2', type: 'grid', id: 'fit-priority', label: 'Probe details',
    source: { kind: 'inline' }, density: 'compact', rowHeight: 32, pageSize: 100, selection: 'single',
    columns: titles.map((title, i) => ({ id: 'c' + i, title, kind: i >= 5 && i <= 9 ? 'number' : 'text', sortable: true,
      priority: i === 0 || i === 2 ? 'essential' : i === 1 || i === 10 ? 'optional' : 'normal',
      ...(i === 0 ? { rowHeader: true, presenter: { kind: 'identifier', mono: true } } : {}) })),
    rows: Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i, cells: Object.fromEntries([
      'branch-controller-' + i + '.example.net', 'North', 'Up', '10/10', 'Passed', 12, 5, 0, 3, 0, 'None'
    ].map((value, i) => ['c' + i, value])) })) };
}

// Check the painted caption, including the second line, rather than relying on a width guessed by the fitter.
function captions(grid) {
  return [...grid.querySelectorAll('.cx-hcell')].flatMap(cell => {
    const label = cell.querySelector('.cx-htext'), box = label.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(label);
    return [...range.getClientRects()].filter(rect => rect.width && (rect.left < box.left - .6 || rect.right > box.right + .6 ||
      rect.bottom > box.bottom + .6)).map(() => cell.getAttribute('aria-label'));
  });
}

for (const width of [1024, 390]) test(`a hidden grid fits its captions before the first visible paint at ${width}px`, async ({ page }) => {
  await pinTestFont(page); await page.setViewportSize({ width, height: 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Resize delivery precedes paint. Read after the runtime's callback, not in the earlier animation-frame phase.
  await page.addInitScript(({ check }) => {
    window.visibleFits = [];
    // Embedded hosts may observe an ancestor before the hidden grid becomes visible.
    document.addEventListener('DOMContentLoaded', () => new ResizeObserver(() => {}).observe(document.body));
    const inspect = new Function('grid', 'return (' + check + ')(grid)'), Native = ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback) {
        super((entries, observer) => {
          callback(entries, observer);
          for (const { target, contentRect } of entries) if (target.matches('.cx-grid') && contentRect.width && target.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
            window.visibleFits.push(inspect(target));
        });
      }
    };
  }, { check: captions.toString() });
  const view = probes(); view.columns.forEach(column => column.width = 40);
  const html = viewPage(view).replace('<div class="cx-host"', '<section id="panel" hidden><div class="cx-host"').replace('</body>', '</section></body>');
  await page.route('http://canopyx.test/fit-priority', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/fit-priority');
  await page.waitForSelector('[data-cx-ready]', { state: 'attached' });
  await page.evaluate(() => { document.querySelector('#panel').hidden = false; });
  await expect.poll(() => page.evaluate(() => window.visibleFits.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.visibleFits.flat()), 'every visible resize delivery must leave complete captions for paint').toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [1440, 1280, 1024, 390]) test(`eleven-column probe headers remain complete and settle at ${width}px`, async ({ page }) => {
  await pinTestFont(page);
  await page.setViewportSize({ width, height: 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Observe every painted, ready frame, including the first query and observer delivery.
  await page.addInitScript(({ check }) => {
    window.captionFailures = []; window.fitFrames = 0;
    const inspect = new Function('grid', 'return (' + check + ')(grid)');
    function frame() {
      const grid = document.querySelector('[data-cx-ready] .cx-grid[aria-busy="false"]');
      if (grid?.checkVisibility({ visibilityProperty: true, opacityProperty: true })) { window.fitFrames++; window.captionFailures.push(...inspect(grid)); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, { check: captions.toString() });
  const html = viewPage(probes()).replace('</head>', '<style>body.cx-page>.cx-host{width:calc(100% - .333333px);height:420px}</style></head>');
  await page.route('http://canopyx.test/fit-priority', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/fit-priority');
  await page.waitForSelector('[data-cx-ready] .cx-grid[aria-busy="false"]');
  await page.evaluate(() => document.fonts.ready); await nextFrames(page);
  const result = await page.locator('.cx-grid').evaluate(grid => new Promise(resolve => {
    const signature = () => JSON.stringify([grid.clientWidth, grid.clientHeight, grid.scrollWidth, grid.scrollHeight,
      [...grid.querySelectorAll('.cx-hcell')].map(cell => cell.getBoundingClientRect().width)]);
    let previous = signature(), changes = 0, frames = 0;
    let start;
    function sample() {
      start ??= performance.now();
      const next = signature(); if (performance.now() - start > 500) { frames++; if (next !== previous) changes++; }
      previous = next;
      if (performance.now() - start < 1500 || frames < 10) requestAnimationFrame(sample);
      else resolve({ changes, frames, captions: window.captionFailures, painted: window.fitFrames,
        shown: [...grid.querySelectorAll('.cx-hcell')].map(cell => cell.dataset.cxColumn),
        scroll: grid.scrollWidth, width: grid.clientWidth });
    }
    requestAnimationFrame(sample);
  }));
  expect(result.painted).toBeGreaterThan(1); expect(result.frames).toBeGreaterThan(1);
  expect(result.captions, 'no ready frame may squeeze or clamp a header').toEqual([]);
  expect(result.changes, 'the layout must stop changing after the initial fit').toBe(0);
  expect(result.shown).toContain('c0'); expect(result.shown).toContain('c2');
  // Optional fields move out before essential captions are squeezed or the grid starts scrolling.
  if (result.scroll > result.width + 1) expect(result.shown).not.toContain('c10');
  if (result.shown.length < 11) {
    await openGridControl(page, 'columns');
    await expect(page.locator('.cx-grid-column-choice')).toHaveCount(11);
  }
  expect(errors).toEqual([]);
});

test('surplus follows measured content rather than the identifier or column order', async ({ page }) => {
  await pinTestFont(page);
  const view = probes();
  view.columns = view.columns.slice(0, 3).map(column => ({ ...column, presenter: undefined, priority: 'essential' }));
  view.columns.push({ id: 'count', title: 'Count', kind: 'number', priority: 'essential' });
  view.rows.forEach(row => row.cells = { c0: 'short-id', c1: 'A much longer descriptive value needing reading space', c2: 'Up', count: 42 });
  const html = viewPage(view).replace('</head>', '<style>body.cx-page>.cx-host{width:900px;height:420px}</style></head>');
  await page.route('http://canopyx.test/fit-priority', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/fit-priority');
  await page.waitForSelector('[data-cx-ready] .cx-grid[aria-busy="false"]'); await nextFrames(page);
  const measure = () => page.locator('.cx-hcell').evaluateAll(cells => Object.fromEntries(cells.map(cell => [cell.dataset.cxColumn, cell.getBoundingClientRect().width])));
  const wide = await measure();
  await page.locator('[data-canopyx-host]').evaluate(host => host.style.width = '700px'); await nextFrames(page); await nextFrames(page);
  const narrow = await measure(), identityGrowth = wide.c0 - narrow.c0, longGrowth = wide.c1 - narrow.c1;
  expect(identityGrowth).toBeGreaterThan(0);
  expect(longGrowth, 'the longer content must receive the larger share of added width').toBeGreaterThan(identityGrowth * 2);
  expect(wide.c0).toBeLessThan(wide.c1);
  expect(wide.count, 'fixed-format numbers must not receive automatic surplus').toBe(narrow.count);
});

for (const reporting of [false, true]) for (const width of [700, 1200]) test(`capped flex shares remaining width across text columns (${reporting ? 'reporting' : 'ordinary'}, ${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = probes();
  if (reporting) view.reporting = { columnReorder: false };
  view.columns = [150, 1000, 200].map((maxWidth, i) => ({ id: 'c' + i, title: ['Name', 'Description', 'Note'][i],
    kind: 'text', priority: 'essential', width: 100, autoSize: 'none', maxWidth, ...(i === 0 ? { rowHeader: true, flex: 1 } : {}) }));
  view.rows.forEach(row => row.cells = { c0: 'A', c1: 'B', c2: 'C' });
  const html = viewPage(view).replace('</head>', `<style>body.cx-page>.cx-host{width:${width}px;height:420px}</style></head>`);
  await page.route('http://canopyx.test/fit-cap', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/fit-cap');
  await page.waitForSelector('[data-cx-ready] .cx-grid[aria-busy="false"]'); await nextFrames(page); await nextFrames(page);
  const fit = await page.locator('.cx-grid').evaluate(grid => ({ available: grid.clientWidth,
    widths: [...grid.querySelectorAll('.cx-hcell')].map(cell => cell.getBoundingClientRect().width),
    row: grid.querySelector('.cx-hrow').getBoundingClientRect().width }));
  expect(fit.widths[0]).toBe(150);
  expect(fit.widths[1]).toBeGreaterThan(100);
  expect(fit.widths[1]).toBeLessThanOrEqual(1000);
  expect(fit.widths[2]).toBeLessThanOrEqual(200);
  expect(Math.abs(fit.row - fit.available)).toBeLessThanOrEqual(1);
});

for (const reporting of [false, true]) test(`fixed context columns scroll instead of collapsing in ${reporting ? 'reporting' : 'ordinary'} grids`, async ({ page }) => {
  const view = probes();
  if (reporting) view.reporting = { columnReorder: true };
  view.columns = view.columns.slice(0, 2).map((column, i) => ({ ...column, fixed: true, width: i ? 500 : 300, priority: i ? 'normal' : 'essential' }));
  view.rows.forEach(row => row.cells = { c0: row.cells.c0, c1: row.cells.c1 });
  await page.setViewportSize({ width: 1024, height: 900 });
  const html = viewPage(view).replace('</head>', '<style>body.cx-page>.cx-host{width:min(720px,100%);height:420px}</style></head>');
  await page.route('http://canopyx.test/fit-priority', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/fit-priority');
  await page.waitForSelector('[data-cx-ready] .cx-grid[aria-busy="false"]');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 }); await nextFrames(page); await nextFrames(page);
    await expect(page.locator('.cx-hcell')).toHaveCount(2);
    const geometry = await page.locator('.cx-grid').evaluate(grid => ({ scroll: grid.scrollWidth, width: grid.clientWidth,
      columns: [...grid.querySelectorAll('.cx-hcell')].map(cell => cell.getBoundingClientRect().width) }));
    expect(geometry.columns).toEqual([300, 500]);
    expect(geometry.scroll).toBeGreaterThan(geometry.width);
  }
});

test('phone captions include selection, reorder and active filter touch targets in their minimum', async ({ page }) => {
  await pinTestFont(page); await page.setViewportSize({ width: 390, height: 844 });
  const view = probes(); view.selection = 'multiple'; view.reporting = { columnReorder: true, selectionControls: true };
  view.columns = [view.columns[0], view.columns[2]];
  Object.assign(view.columns[0], { title: 'Record', presenter: undefined, minWidth: 160, maxWidth: 320 });
  view.rows.forEach(row => row.cells = { c0: 'Record 0', c2: 'Up' });
  const html = viewPage(view);
  await page.route('http://canopyx.test/fit-priority', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/fit-priority');
  await page.waitForSelector('[data-cx-ready] .cx-grid[aria-busy="false"]'); await nextFrames(page);
  for (const query of [{}, { filters: [{ column: 'c0', operator: 'eq', values: ['Record 0'] }] }]) {
    await page.evaluate(query => document.querySelector('[data-canopyx-host]').canopyx.setQuery(query), query);
    await nextFrames(page);
    expect(await page.locator('.cx-grid').evaluate(captions)).toEqual([]);
  }
});
