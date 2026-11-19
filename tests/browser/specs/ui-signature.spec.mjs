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
  const picture = svg => ({ svg, png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAAoCAYAAAC7HLUcAAAAbUlEQVR42u3TQREAAAjDsKmZf0F4AQNIyCMGetdMu8AvIoBBwCBgEDAIGAQMAgYBg4BBAIOAQcAgYBAwCBgEDAIGAYOAQYQAg4BBwCBgEDAIGAQMAgYBgwAGAYOAQcAgYBAwCBgEDAIGAYMAnwPZW0auqC3XMwAAAABJRU5ErkJggg==' });
  await openUi(page, '<form id="form"><div id="sign" data-name="signature" data-colours="true"></div></form>');
  await page.evaluate(stored => { window.pad = CanopyX.signature('#sign', { value: stored }); }, picture('<svg id="a"></svg>'));
  await page.evaluate(() => window.pad.ready);
  const submitted = () => page.evaluate(() => new FormData(document.getElementById('form')).get('signature'));
  expect(await submitted()).toBe('<svg id="a"></svg>');
  // The stored picture (a red block, drawn at half its pixel size like an exported PNG) is drawn, and still drawn after the colour changes.
  const centre = () => page.locator('#sign canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(20 * (devicePixelRatio || 1), canvas.height / 2, 1, 1).data]);
  await expect.poll(centre).toEqual([220, 38, 38, 255]);
  await page.getByLabel('Pen colour').evaluate(input => { input.value = '#b91c1c'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.evaluate(() => window.pad.getState().value.svg)).toBe('<svg id="a"></svg>');
  expect(await centre()).toEqual([220, 38, 38, 255]);
  await page.evaluate(stored => window.pad.select(stored), picture('<svg id="b"></svg>'));
  expect(await submitted()).toBe('<svg id="b"></svg>');
  await page.evaluate(() => window.pad.select(null));
  expect(await submitted()).toBe('');
});

test('select or clear during a stroke cancels it, so releasing the pointer keeps the new value', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="sign" data-name="signature"></div></form>');
  await page.evaluate(() => { window.pad = CanopyX.signature('#sign'); return window.pad.ready; });
  const box = await page.getByRole('img', { name: 'Signature pad' }).boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 3 });
  await page.evaluate(() => window.pad.select(null));
  await page.mouse.move(box.x + 120, box.y + 50, { steps: 2 });
  await page.mouse.up();
  expect(await page.evaluate(async () => (await window.pad.getState()).value)).toBeNull();
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).get('signature'))).toBe('');
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 3 });
  await page.evaluate(() => window.pad.clear());
  await page.mouse.up();
  expect(await page.evaluate(async () => (await window.pad.getState()).value)).toBeNull();
  // The Clear button, pressed from the keyboard mid-stroke, cancels the stroke the same way.
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 3 }); await page.mouse.up();
  await page.mouse.move(box.x + 20, box.y + 60); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 80, { steps: 3 });
  await page.getByRole('button', { name: 'Clear' }).evaluate(button => button.click());
  await page.mouse.up();
  expect(await page.evaluate(async () => (await window.pad.getState()).value)).toBeNull();
});

test('a pad under a scaled ancestor keeps ink under the pointer, and a 300 pixel pad gets its full height', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, '<div style="transform: scale(0.5); transform-origin: 0 0; width: 600px"><div id="sign"></div></div><div style="width: 300px"><div id="narrow"></div></div>');
  await page.evaluate(() => Promise.all([(window.pad = CanopyX.signature('#sign')).ready, CanopyX.signature('#narrow').ready]));
  const box = await page.locator('#sign canvas').boundingBox();
  await page.mouse.move(box.x + 50, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 40, { steps: 3 }); await page.mouse.up();
  const start = await page.evaluate(async () => (await window.pad.getState()).value.svg.match(/M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/).slice(1).map(Number));
  // The pad's border makes its box a little larger than the drawing, so a pixel either way is fine.
  expect(Math.abs(start[0] - 100)).toBeLessThanOrEqual(2);
  expect(Math.abs(start[1] - 80)).toBeLessThanOrEqual(2);
  expect(await page.locator('#narrow canvas').evaluate(canvas => canvas.height / (devicePixelRatio || 1))).toBe(160);
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
  // A select() straight after form.reset() wins over the restore the reset queued.
  await page.evaluate(() => { document.getElementById('form').reset(); CanopyX.signature('#sign').select({ svg: '<svg id="kept"></svg>', png: 'data:image/png;base64,AA' }); });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  expect(await submitted()).toBe('<svg id="kept"></svg>');
  // A select() the pad refuses leaves the queued reset in charge.
  await page.evaluate(() => { document.getElementById('form').reset(); try { CanopyX.signature('#sign').select({}); } catch { } });
  await expect.poll(submitted).toBe('');
});

test('a typed name whose picture the browser cannot export is not published', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="sign" data-cx-signature data-name="signature"></div></form>');
  // A canvas past the browser's size limit exports "data:,"; the stub makes every export do that.
  await page.evaluate(() => { HTMLCanvasElement.prototype.toDataURL = () => 'data:,'; });
  await page.getByRole('button', { name: 'Type instead' }).click();
  await page.keyboard.type('Ada');
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).get('signature'))).toBe('');
  expect(await page.evaluate(() => CanopyX.signature('#sign').getState().value)).toBeNull();
});

test('destroy removes the hidden input the signature made and keeps a host input', async ({ page }) => {
  await openUi(page, '<form id="form"><div id="made" data-name="made"></div><div id="own" data-name="own"><input type="hidden" name="own" value="kept"></div></form>');
  await page.evaluate(async () => { for (const id of ['#made', '#own']) await CanopyX.signature(id).ready; CanopyX.signature('#made').destroy(); CanopyX.signature('#own').destroy(); });
  expect(await page.evaluate(() => [...new FormData(document.getElementById('form')).keys()])).toEqual(['own']);
});
