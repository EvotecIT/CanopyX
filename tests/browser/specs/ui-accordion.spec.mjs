import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { openUi, uiPage } from './ui-support.mjs';
import { repo } from './support.mjs';

test.use({ viewport: { width: 1000, height: 800 } });

// Mirrors the public .NET markup contract: heading buttons, panels by aria-controls and no premature hiding.
function accordion(id = 'help', extra = '', entries = [
  { id: 'start', label: 'Start', open: true }, { id: 'usage', label: 'Usage', badge: 'New' },
  { id: 'locked', label: 'Locked', disabled: true }, { id: 'audit', label: 'Audit' }
]) {
  return `<div id="${id}" class="cx-accordion cx-accordion--default" data-cx-accordion ${extra}>${entries.map(item => `
    <section class="cx-accordion-item" data-hfx-part="accordion-item">
      <div class="cx-accordion-header"><h3 class="cx-accordion-heading"><button type="button" class="cx-accordion-trigger" id="${id}-trigger-${item.id}"
        data-accordion-id="${item.id}" aria-controls="${id}-panel-${item.id}" aria-expanded="${!!item.open}" ${item.disabled ? 'aria-disabled="true"' : ''}>
        <span class="cx-accordion-label">${item.label}</span>${item.badge ? `<span class="cx-accordion-badge">${item.badge}</span>` : ''}
        <span class="cx-accordion-indicator" aria-hidden="true"></span></button></h3></div>
      <div class="cx-accordion-panel" id="${id}-panel-${item.id}" role="region" aria-labelledby="${id}-trigger-${item.id}">${item.body ?? `<p>${item.label} content</p>`}</div>
    </section>`).join('')}</div>`;
}
const start = page => page.getByRole('button', { name: 'Start' });
const usage = page => page.getByRole('button', { name: 'Usage New' });

test('single-open sections follow the ARIA accordion keyboard pattern', async ({ page }) => {
  await openUi(page, accordion());
  await expect(page.getByRole('region', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Usage New' })).toBeHidden();

  await start(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(usage(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(usage(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(start(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Start' })).toBeHidden();
  await page.keyboard.press('Space');
  await expect(usage(page)).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('ArrowDown');
  const locked = page.getByRole('button', { name: 'Locked' });
  await expect(locked).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(locked).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Audit' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(start(page)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Audit' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(start(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(usage(page)).toBeFocused();
});

test('a nested accordion owns its keys and single-open rule', async ({ page }) => {
  const inner = accordion('inner', '', [{ id: 'one', label: 'One', open: true }, { id: 'two', label: 'Two' }]);
  await openUi(page, accordion('outer', '', [{ id: 'host', label: 'Host', open: true, body: inner }, { id: 'other', label: 'Other' }]));
  await page.getByRole('button', { name: 'One' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Two' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'One' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Host' })).toHaveAttribute('aria-expanded', 'true');
});

test('open sections come back from the address before remembered state, and both beat the markup', async ({ page }) => {
  const markup = accordion('help', 'data-multiple="true" data-hash="true" data-remember="help-page"');
  await openUi(page, markup);
  await usage(page).click();
  await page.getByRole('button', { name: 'Audit' }).click();
  await expect(page).toHaveURL(/#help=start&help=usage&help=audit$/);

  await page.evaluate(() => history.replaceState(null, '', location.pathname));
  await page.reload();
  await page.evaluate(() => Promise.all(CanopyX.mountUi(document).map(api => api.ready)));
  await expect.poll(() => page.evaluate(() => CanopyX.accordion('#help').getOpen())).toEqual(['start', 'usage', 'audit']);

  await page.goto(page.url().split('#')[0] + '#help=audit');
  await page.reload();
  await page.evaluate(() => Promise.all(CanopyX.mountUi(document).map(api => api.ready)));
  await expect.poll(() => page.evaluate(() => CanopyX.accordion('#help').getOpen())).toEqual(['audit']);

  await page.evaluate(() => { location.hash = 'help=usage'; });
  await expect(usage(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Audit' })).toHaveAttribute('aria-expanded', 'false');
});

test('each section of a multiple accordion loads on its own, and closing aborts only its own loader', async ({ page }) => {
  const deferred = [{ id: 'first', label: 'First', body: '<template><p>First body</p></template>' }, { id: 'second', label: 'Second', body: '<template><p>Second body</p></template>' }];
  await openUi(page, accordion('help', '', deferred), `
    window.signals = {}; window.resolvers = {};
    window.help = CanopyX.accordion('#help', { multiple: true, loader: (item, signal) => {
      window.signals[item.id] = signal;
      return new Promise(resolve => { window.resolvers[item.id] = () => resolve('<p>' + item.label + ' loaded</p>'); });
    } });`);
  const first = page.getByRole('button', { name: 'First' }), second = page.getByRole('button', { name: 'Second' });
  await first.click(); await second.click();
  await expect(page.getByRole('region', { name: 'First' }).getByRole('status')).toBeVisible();
  await expect(page.getByRole('region', { name: 'First' })).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => window.signals.first.aborted)).toBe(false);

  await page.evaluate(() => window.resolvers.second());
  await expect(page.getByRole('region', { name: 'Second' })).toContainText('Second loaded');
  await expect(page.getByRole('region', { name: 'First' })).toHaveAttribute('aria-busy', 'true');

  await first.click();
  expect(await page.evaluate(() => window.signals.first.aborted)).toBe(true);
  await page.evaluate(() => { const stale = window.resolvers.first; stale(); });
  await first.click();
  await page.evaluate(() => window.resolvers.first());
  await expect(page.getByRole('region', { name: 'First' })).toContainText('First loaded');
  await expect(page.getByRole('region', { name: 'First' })).not.toHaveAttribute('aria-busy', 'true');
});

test('a failed section offers Retry, and a refused change keeps focus on its heading', async ({ page }) => {
  await openUi(page, accordion(), `
    let tries = 0;
    window.help = CanopyX.accordion('#help', {
      sections: [{ id: 'usage', loader: async () => { if (!tries++) throw new Error('Not reachable'); return '<p>Reached</p>'; } }],
      beforeChange: (from, to) => to.id !== 'audit'
    });`);
  await usage(page).click();
  const region = page.getByRole('region', { name: 'Usage New' });
  await expect(region.getByRole('alert')).toHaveText('Not reachable');
  await region.getByRole('button', { name: 'Retry' }).click();
  await expect(region).toContainText('Reached');

  const audit = page.getByRole('button', { name: 'Audit' });
  await audit.focus(); await page.keyboard.press('Enter');
  await expect(audit).toHaveAttribute('aria-expanded', 'false');
  await expect(audit).toBeFocused();
  await expect(usage(page)).toHaveAttribute('aria-expanded', 'true');
});

test('filtering reads the header, hides without closing, and Escape restores', async ({ page }) => {
  await openUi(page, accordion('help', 'data-search="true" data-search-debounce="0"'));
  const box = page.getByRole('searchbox', { name: 'Filter sections' });
  await box.fill('usage or "audit"');
  await expect(usage(page)).toBeVisible();
  await expect(start(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Audit' })).toBeVisible();
  await box.fill('new -usage');
  await expect(page.getByRole('status')).toHaveText('No matching sections');
  await box.press('Escape');
  await expect(start(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Start' })).toBeVisible();
  await expect(page.locator('.cx-accordion-empty')).toBeEmpty();

  await page.evaluate(() => CanopyX.accordion('#help').filter('audit or usage'));
  await page.getByRole('button', { name: 'Usage New' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Audit' })).toBeFocused();
});

test('copying a title and using a header action leave the section as it was', async ({ page }) => {
  const markup = accordion().replace('</h3>', '</h3><div class="cx-accordion-actions"><button type="button">Run</button></div>');
  await openUi(page, markup, `CanopyX.accordion('#help', { copyTitle: true });
    document.addEventListener('copy', () => { window.copied = document.activeElement.value; });`);
  await page.getByRole('button', { name: 'Run' }).first().click();
  await expect(start(page)).toHaveAttribute('aria-expanded', 'true');
  const copy = page.getByRole('button', { name: 'Copy title' }).nth(1);
  await copy.click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(usage(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.copied)).toBe('Usage');
});

for (const kind of ['tree', 'grid']) {
  test(`a ${kind} in a closed sliding section fills the panel when it opens`, async ({ page }) => {
    const asset = name => fs.readFileSync(path.join(repo, 'CanopyX.Html/Assets', name), 'utf8');
    const records = Array.from({ length: 40 }, (_, index) => ({ id: 'r' + index, label: 'Record ' + index, cells: { name: 'Record ' + index, owner: 'Team' } }));
    const view = JSON.stringify({ protocol: 'canopyx/2', type: kind === 'tree' ? 'view' : 'grid', id: 'contained', label: 'Contained', source: { kind: 'inline' }, rowHeight: 28, pageSize: 100, selection: 'single',
      columns: [{ id: 'name', title: 'Name', kind: 'text', width: 180 }, { id: 'owner', title: 'Owner', kind: 'text', width: 100 }],
      ...(kind === 'tree' ? { roots: records } : { rows: records.map(({ label, ...row }) => row) }) });
    const body = accordion('help', 'data-transition="slide"', [{ id: 'first', label: 'First', open: true },
      { id: 'data', label: 'Data', body: '<div id="host" style="height:320px"></div>' }]);
    const html = uiPage(body, `window.contained = CanopyX.accordion('#help').ready.then(() =>
      CanopyX.${kind === 'tree' ? 'createTreeGrid' : 'createDataGrid'}(document.querySelector('#host'), { view: ${view} }).ready);`)
      .replace(asset('canopyx.js'), () => asset('canopyx-grid.js')).replace(asset('canopyx.css'), () => asset('canopyx-grid.css'));
    await page.route('http://canopyx.test/ui', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://canopyx.test/ui');
    await page.evaluate(() => window.contained);
    await expect(page.locator('#host')).toBeHidden();

    await page.getByRole('button', { name: 'Data' }).click();
    await expect(page.locator('#host .cx-row').first()).toBeVisible();
    await expect.poll(() => page.locator('.cx-accordion-panel').nth(1).evaluate(panel => panel.getAnimations().length)).toBe(0);
    const size = await page.evaluate(() => {
      const panel = document.querySelector('#help-panel-data'), host = document.querySelector('#host'), grid = host.querySelector('.cx-grid');
      const style = getComputedStyle(panel);
      return { host: host.getBoundingClientRect().width, content: panel.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
        grid: { width: grid.getBoundingClientRect().width, height: grid.getBoundingClientRect().height }, rows: host.querySelectorAll('.cx-row').length };
    });
    expect(Math.abs(size.host - size.content)).toBeLessThan(1);
    expect(Math.abs(size.grid.width - size.content)).toBeLessThan(3);
    expect(size.grid.height).toBeGreaterThan(200);
    expect(size.rows).toBeGreaterThan(5);
    await expect(page.locator('#host .cx-row').last()).toBeVisible();
  });
}

test('the slim entry point runs components without the tree runtime', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://canopyx.test/**', route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    requests.push(name);
    if (name === 'ui') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>Slim</title><link rel="stylesheet" href="canopyx-ui.css">
      <script src="canopyx-ui.js"></script><body>${accordion()}<button id="open">Open</button>
      <aside id="panel" hidden>Drawer body</aside></body></html>` });
    return route.fulfill({ path: path.join(repo, 'CanopyX.Html/Assets', name) });
  });
  await page.goto('http://canopyx.test/ui');
  await usage(page).click();
  await expect(page.getByRole('region', { name: 'Usage New' })).toBeVisible();
  expect(await page.evaluate(() => [typeof CanopyX.createTreeGrid, typeof CanopyX.accordion, typeof CanopyX.drawer])).toEqual(['undefined', 'function', 'function']);
  expect(requests).toContain('canopyx-ui-accordion.js');
  expect(requests).not.toContain('canopyx-ui-picker.js');
  expect(requests).not.toContain('canopyx.js');
  expect(errors).toEqual([]);
});
