import { test, expect } from '@playwright/test';
import { runtimeAssets, nextFrames } from './support.mjs';

for (const reporting of [false, true]) for (const action of ['focus', 'move', 'destroy']) {
  test(`ready focus survives the first fitted frame (${reporting ? 'reporting' : 'ordinary'}, ${action})`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const view = { protocol: 'canopyx/2', type: 'grid', id: 'ready-focus', label: 'Records', pageSize: 100,
      selection: 'single', source: { kind: 'inline' }, columns: [{ id: 'name', title: 'Name', kind: 'text' }],
      rows: [{ id: 'a', cells: { name: 'Alpha' } }], ...(reporting ? { reporting: {} } : {}) };
    const { script, style } = runtimeAssets(reporting ? 'reporting' : 'grid');
    const html = `<!doctype html><style>${style}#host{width:600px;height:320px}</style><script>${script}</script>
      <button id="outside">Outside</button><button id="later">Later</button><div id="host"></div><script>
      document.querySelector('#outside').focus();const api=CanopyX.createDataGrid(document.querySelector('#host'),{view:${JSON.stringify(view)}});
      window.requested=api.ready.then(()=>{api.focus();if('${action}'==='move')document.querySelector('#later').focus();if('${action}'==='destroy')api.destroy();});
      </script>`;
    await page.route('http://canopyx.test/ready-focus', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://canopyx.test/ready-focus');
    await page.evaluate(() => window.requested); await nextFrames(page); await nextFrames(page);
    if (action === 'focus') await expect(page.locator('.cx-row').first()).toBeFocused();
    else await expect(page.locator(action === 'move' ? '#later' : '#outside')).toBeFocused();
    if (action === 'destroy') await expect(page.locator('.cx-grid')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
