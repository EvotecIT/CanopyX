// Signature fields (docs/flow.md#signatures): drawing with a pointer, Undo and Clear, a typed name for keyboard readers, and the
// { svg, png } answer.
import { test, expect } from '@playwright/test';
import { openFieldFlow } from './flow-page-support.mjs';

const signature = (extra = {}) => [{ id: 'signature', type: 'signature', label: 'Signature', ...extra }];
const open = (page, extra) => openFieldFlow(page, signature(extra), { parts: ['flow-signature'] });
const value = page => page.evaluate(() => window.flow.getValues().signature ?? null);

async function stroke(page, points) {
  const pad = page.getByRole('img', { name: 'Signature pad' });
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + points[0][0], box.y + points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 2 });
  await page.mouse.up();
}

test('strokes become an SVG and a PNG answer; Undo removes the last and Clear all of them', async ({ page }) => {
  await open(page, { required: true });
  await expect(page.getByRole('group', { name: 'Signature' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await stroke(page, [[20, 80], [60, 40], [100, 90], [140, 50]]);
  await stroke(page, [[160, 100], [220, 100]]);
  const drawn = await value(page);
  expect(drawn.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="160" viewBox="0 0 \d+ 160">/);
  expect(drawn.svg.match(/<path /g)).toHaveLength(2);
  expect(drawn.svg).toContain('Q');
  expect(drawn.png).toMatch(/^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await value(page)).svg.match(/<path /g)).toHaveLength(1);
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await value(page)).toBeNull();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.cx-flow-error').first()).toHaveText('Signature is required.');
});

test('a reader who cannot draw types their name, and the review page says it is signed', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Type instead' }).focus();
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Type your full name' });
  await expect(name).toBeFocused();
  await page.keyboard.type('Ada <Lovelace>');
  const typed = await value(page);
  expect(typed.svg).toContain('>Ada &lt;Lovelace&gt;</text>');
  expect(typed.png).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByRole('button', { name: 'Draw instead' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.cx-flow-review')).toContainText('Signed');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect.poll(() => page.evaluate(() => Object.keys(window.submitted[0]?.signature || {}))).toEqual(['svg', 'png']);
});

test('a stored signature shows until it is cleared, and the document refuses a default or a parameter', async ({ page }) => {
  const stored = { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', png: 'data:image/png;base64,iVBORw0KGgo=' };
  await openFieldFlow(page, signature(), { parts: ['flow-signature'], extra: { initial: { signature: stored } } });
  expect(await value(page)).toEqual(stored);
  await expect(page.getByRole('button', { name: 'Clear' })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await value(page)).toBeNull();
  const errors = await page.evaluate(async () => Promise.all([{ parameter: 'Signature' }, { default: { svg: '<svg ></svg>', png: 'data:image/png;base64,AA' } }].map(extra =>
    CanopyX.createFlow(document.createElement('div'), { flow: { kind: 'flow', version: 1, id: 'x', title: 'X', steps: [{ id: 's', title: 'S', fields: [{ id: 'a', type: 'signature', label: 'A', ...extra }] }] } })
      .ready.then(() => 'ready', error => error.message))));
  expect(errors).toEqual(['CanopyX: field a is a signature, which has no parameter and no default.', 'CanopyX: field a is a signature, which has no parameter and no default.']);
});

test('a replacement stroke over a stored signature shows while it is drawn', async ({ page }) => {
  const blank = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await openFieldFlow(page, signature(), { parts: ['flow-signature'], extra: { initial: { signature: { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', png: blank } } } });
  const pad = page.getByRole('img', { name: 'Signature pad' });
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60); await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 60, { steps: 6 });
  const inked = await pad.evaluate(canvas => {
    const ratio = canvas.width / canvas.getBoundingClientRect().width, row = canvas.getContext('2d').getImageData(0, Math.round(60 * ratio) - 2, canvas.width, 5).data;
    return row.some((value, at) => at % 4 === 3 && value > 0);
  });
  await page.mouse.up();
  expect(inked).toBe(true);
});

test('a long typed name shrinks to fit a narrow pad in the SVG and the PNG', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await open(page);
  await page.getByRole('button', { name: 'Type instead' }).click();
  await page.getByRole('textbox', { name: 'Type your full name' }).fill('Maximilian Alexander von Hohenzollern-Sigmaringen');
  const typed = await value(page);
  const size = Number(/font-size="(\d+)"/.exec(typed.svg)[1]);
  const width = Number(/width="(\d+)"/.exec(typed.svg)[1]);
  expect(size).toBeLessThan(36);
  // The text, drawn at that size, fits between the 16 px margins.
  const drawn = await page.evaluate(([text, size]) => { const context = document.createElement('canvas').getContext('2d');
    context.font = "italic " + size + "px 'Segoe Script','Brush Script MT','Snell Roundhand',cursive"; return context.measureText(text).width; }, ['Maximilian Alexander von Hohenzollern-Sigmaringen', size]);
  expect(drawn).toBeLessThanOrEqual(width - 32 + 1);
});

test('strokes drawn on a wide pad stay whole after the pad narrows', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await open(page);
  await stroke(page, [[20, 80], [300, 60], [600, 90]]);
  await page.setViewportSize({ width: 360, height: 700 });
  await expect.poll(() => page.getByRole('img', { name: 'Signature pad' }).evaluate(pad => pad.getBoundingClientRect().width)).toBeLessThan(400);
  await stroke(page, [[20, 120], [100, 120]]);
  const width = Number(/width="(\d+)"/.exec((await value(page)).svg)[1]);
  expect(width).toBeGreaterThanOrEqual(600);
});
