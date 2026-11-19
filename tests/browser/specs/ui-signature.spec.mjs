import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

async function stroke(page, points) {
  const box = await page.getByRole('img', { name: 'Signature pad' }).boundingBox();
  await page.mouse.move(box.x + points[0][0], box.y + points[0][1]); await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 2 });
  await page.mouse.up();
}

test('a standalone pad draws in the chosen colours, fills a hidden form input and downloads PNG and SVG', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="sign" data-cx-signature data-name="signature" data-ink="#1d4ed8" data-background="#fffbe6" data-colours="true" data-download="contract"></div></form>');
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
  await stroke(page, [[20, 80], [80, 40], [140, 90]]);
  const value = await page.evaluate(() => CanopyX.signature('#sign').getState().value);
  expect(value.svg).toContain('<rect width="100%" height="100%" fill="#fffbe6"/>');
  expect(value.svg).toContain('stroke="#1d4ed8"');
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).get('signature'))).toBe(value.svg);
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  expect(png.suggestedFilename()).toBe('contract.png');
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG' }).click()]);
  expect(svg.suggestedFilename()).toBe('contract.svg');
  await page.getByLabel('Pen colour').evaluate(input => { input.value = '#b91c1c'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect((await page.evaluate(() => CanopyX.signature('#sign').getState().value)).svg).toContain('stroke="#b91c1c"');
});

test('the typed alternative and Clear work by keyboard, and a PNG form value is written on request', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="sign" data-cx-signature data-name="signature" data-format="png"></div></form>');
  await page.getByRole('button', { name: 'Type instead' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ada Lovelace');
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).get('signature'))).toMatch(/^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).get('signature'))).toBe('');
});

test('a stored signature fills the hidden input, survives a pen colour change and is replaced by select', async ({ page }) => {
  const picture = svg => ({ svg, png: 'data:image/png;base64,iVBORw0KGgo=' });
  await openUi(page, '<form id="form"><div id="sign" data-name="signature" data-colours="true"></div></form>');
  await page.evaluate(stored => { window.pad = CanopyX.signature('#sign', { value: stored }); }, picture('<svg id="a"></svg>'));
  await page.evaluate(() => window.pad.ready);
  const submitted = () => page.evaluate(() => new FormData(document.getElementById('form')).get('signature'));
  expect(await submitted()).toBe('<svg id="a"></svg>');
  await page.getByLabel('Pen colour').evaluate(input => { input.value = '#b91c1c'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.evaluate(() => window.pad.getState().value.svg)).toBe('<svg id="a"></svg>');
  await page.evaluate(stored => window.pad.select(stored), picture('<svg id="b"></svg>'));
  expect(await submitted()).toBe('<svg id="b"></svg>');
  await page.evaluate(() => window.pad.select(null));
  expect(await submitted()).toBe('');
});

test('a form reset brings back the starting signature, and a cancelled one keeps it', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="sign" data-cx-signature data-name="signature"></div><button type="reset">Reset</button></form>');
  await page.getByRole('button', { name: 'Type instead' }).click();
  await page.keyboard.type('Ada Lovelace');
  const submitted = () => page.evaluate(() => new FormData(document.getElementById('form')).get('signature'));
  expect(await submitted()).toContain('<svg ');
  await page.evaluate(() => document.getElementById('form').addEventListener('reset', event => event.preventDefault(), { once: true }));
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve)));
  expect(await submitted()).toContain('<svg ');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(submitted).toBe('');
  expect(await page.evaluate(() => CanopyX.signature('#sign').getState().value)).toBeNull();
});

test('destroy removes the hidden input the signature made and keeps a host input', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="made" data-name="made"></div><div id="own" data-name="own"><input type="hidden" name="own" value="kept"></div></form>');
  await page.evaluate(async () => { for (const id of ['#made', '#own']) await CanopyX.signature(id).ready; CanopyX.signature('#made').destroy(); CanopyX.signature('#own').destroy(); });
  expect(await page.evaluate(() => [...new FormData(document.getElementById('form')).keys()])).toEqual(['own']);
});
