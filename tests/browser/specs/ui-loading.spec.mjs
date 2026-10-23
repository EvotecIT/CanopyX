import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

const tabs = `<div id="late" data-cx-tabs><div role="tablist" aria-label="Late sections">
  <button id="late-a" role="tab" data-tab-id="a" aria-controls="late-panel-a" aria-selected="true">First</button>
  <button id="late-b" role="tab" data-tab-id="b" aria-controls="late-panel-b" aria-selected="false">Second</button></div>
  <section id="late-panel-a" role="tabpanel" aria-labelledby="late-a"><h3>First</h3><p>First content</p></section>
  <section id="late-panel-b" role="tabpanel" aria-labelledby="late-b"><h3>Second</h3><p>Second content</p></section></div>`;

test('UI payloads remain inert until a component is requested', async ({ page }) => {
  await openUi(page, '<h1>Report</h1><p>No interactive controls yet.</p>');
  expect(await page.evaluate(() => CanopyX.mountUi(document).length)).toBe(0);
  expect(await page.locator('head style').count()).toBe(1);
  expect(await page.locator('script[type="application/x-canopyx-ui-tabs"]').count()).toBe(1);
  await page.evaluate(markup => {
    document.querySelector('main').insertAdjacentHTML('beforeend', markup);
    window.late = CanopyX.tabs('#late');
  }, tabs);
  await page.evaluate(() => window.late.ready);
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Second', exact: true })).toBeVisible();
  expect(await page.locator('head style').count()).toBeGreaterThan(1);
});

test('destroying a controller before lazy initialization releases its marker and permits a fresh instance', async ({ page }) => {
  await openUi(page, '<h1>Report</h1>');
  const result = await page.evaluate(async markup => {
    document.querySelector('main').insertAdjacentHTML('beforeend', markup);
    const first = CanopyX.tabs('#late'); first.destroy();
    const error = await first.ready.then(() => null, error => error.name);
    const marker = document.querySelector('#late').getAttribute('data-cx-fallback-mode');
    const second = CanopyX.tabs('#late'); await second.ready; await second.select('b');
    return { error, marker, reused: second === first, selected: second.getSelected() };
  }, tabs);
  expect(result).toEqual({ error: 'AbortError', marker: null, reused: false, selected: 'b' });
  await expect(page.getByRole('tabpanel', { name: 'Second', exact: true })).toBeVisible();
});

test('component destruction restores readable panels and removes only its own interaction state', async ({ page }) => {
  await openUi(page, tabs, `window.late=CanopyX.tabs('#late');`);
  await page.evaluate(async () => { await window.late.select('b'); window.late.destroy(); window.late.destroy(); });
  await expect(page.locator('#late-panel-a')).toBeVisible();
  await expect(page.locator('#late-panel-b')).toBeVisible();
  expect(await page.locator('#late').getAttribute('data-cx-fallback-mode')).toBeNull();
  await page.locator('#late-a').click();
  await expect(page.locator('#late-panel-b')).toBeVisible();
});

test('a phone picker clones the rendered tab icon without moving it out of its wide tab', async ({ page }) => {
  const markup = tabs.replace('>First</button>', '><span data-icon="folder" aria-hidden="true"></span>First</button>')
    .replaceAll('<button ', '<button style="min-inline-size:220px" ');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openUi(page, markup, `window.late=CanopyX.tabs('#late',{renderIcon(name){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.dataset.name=name;icon.setAttribute('width','16');icon.setAttribute('height','16');return icon;}});`);
  await expect(page.locator('#late-a svg[data-name="folder"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(page.locator('#late > .cx-tabs-phone-picker .cx-picker-icon svg[data-name="folder"]')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#late-a svg[data-name="folder"]')).toBeVisible();
});
