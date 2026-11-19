import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 1000, height: 700 } });

const image = (fill, width = 800, height = 600) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`);
// Mirrors the .NET gallery: links to the full items around thumbnails, with figure captions; content and frames by type.
function gallery(extra = '') {
  return `<div id="photos" class="cx-gallery" data-cx-lightbox ${extra}><ul class="cx-gallery-list">
    <li class="cx-gallery-item"><figure><a class="cx-gallery-link" data-lightbox-item href="${image('red')}"><img src="${image('red', 80, 60)}" alt="Server room"></a><figcaption>Rack A after the move</figcaption></figure></li>
    <li class="cx-gallery-item"><figure><a class="cx-gallery-link" data-lightbox-item href="${image('green')}" data-caption="Cooling"><img src="${image('green', 80, 60)}" alt="Cooling unit"></a></figure></li>
    <li class="cx-gallery-item"><figure><a class="cx-gallery-link" data-lightbox-item href="#details" data-lightbox-type="content"><img src="${image('blue', 80, 60)}" alt="Details"></a></figure></li>
  </ul><template id="details"><h3>Inventory</h3><p>Twelve servers.</p></template></div><button id="after">After</button>`;
}
const viewer = page => page.getByRole('dialog');

test('a link opens its item in a modal viewer that moves with keys and returns focus', async ({ page }) => {
  await openUi(page, gallery());
  await page.getByRole('link', { name: 'Cooling unit' }).click();
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page)).toHaveAccessibleName('Cooling');
  await expect(viewer(page).locator('[data-cx-part="position"]')).toHaveText('2 of 3');
  await expect(viewer(page).getByRole('img', { name: 'Cooling unit' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(viewer(page).getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(viewer(page).getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(viewer(page).locator('[data-cx-part="position"]')).toHaveText('3 of 3');
  await page.keyboard.press('Home');
  await expect(viewer(page)).toHaveAccessibleName('Rack A after the move');
  await expect(viewer(page).getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toBeHidden();
  await expect(page.getByRole('link', { name: 'Cooling unit' })).toBeFocused();
});

test('loop wraps, right to left swaps the arrows, and changes are reported', async ({ page }) => {
  await openUi(page, gallery('data-loop="true" dir="rtl"'));
  await page.evaluate(() => { window.changes = []; document.addEventListener('cx-lightbox:change', event => window.changes.push(event.detail.index + ':' + event.detail.source)); });
  await page.getByRole('link', { name: 'Server room' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(viewer(page).locator('[data-cx-part="position"]')).toHaveText('3 of 3');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer(page).locator('[data-cx-part="position"]')).toHaveText('1 of 3');
  expect(await page.evaluate(() => window.changes)).toEqual(['0:link', '2:navigation', '0:navigation']);
});

test('zoom steps with keys and buttons, pans by scrolling, and resets on the next item', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, gallery());
  await page.getByRole('link', { name: 'Server room' }).click();
  const picture = viewer(page).getByRole('img', { name: 'Server room' });
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate(element => element.complete && element.naturalWidth)).toBe(800);
  const fitted = await picture.boundingBox();
  await expect(viewer(page).getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect(viewer(page).locator('[data-cx-part="zoom"]')).toHaveText('200%');
  const zoomed = await picture.boundingBox();
  expect(Math.round(zoomed.width)).toBe(Math.round(fitted.width * 2));
  const stage = viewer(page).locator('[data-cx-part="stage"]');
  await expect(stage).toHaveAttribute('tabindex', '0');
  expect(await stage.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  // While zoomed the arrows belong to panning, not to moving between items.
  await page.keyboard.press('ArrowRight');
  await expect(viewer(page).locator('[data-cx-part="position"]')).toHaveText('1 of 3');
  await viewer(page).getByRole('button', { name: 'Fit to screen' }).click();
  await expect(viewer(page).locator('[data-cx-part="zoom"]')).toHaveText('100%');
  await picture.dblclick();
  await expect(viewer(page).locator('[data-cx-part="zoom"]')).toHaveText('200%');
  await viewer(page).getByRole('button', { name: 'Next' }).click();
  await expect(viewer(page).locator('[data-cx-part="zoom"]')).toHaveText('100%');
  expect(await page.evaluate(() => CanopyX.lightbox('#photos').getState())).toEqual({ open: true, index: 1, total: 3, zoom: 1 });
});

test('a swipe moves between items and a broken image says so', async ({ page }) => {
  await openUi(page, '<div id="viewer"></div>');
  await page.evaluate(([one]) => CanopyX.lightbox('#viewer', { items: [{ src: one, alt: 'One' }, { src: 'data:image/png;base64,broken', alt: 'Two', caption: 'Missing file' }] }).open(0), [image('red')]);
  const stage = viewer(page).locator('[data-cx-part="stage"]');
  const box = await stage.boundingBox();
  await stage.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: box.x + 300, clientY: box.y + 100, button: 0 });
  await stage.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: box.x + 100, clientY: box.y + 110, button: 0 });
  await expect(viewer(page)).toHaveAccessibleName('Missing file');
  await expect(viewer(page).locator('.cx-overlay-error')).toHaveText('This item could not be loaded');
  await expect(viewer(page).getByRole('button', { name: 'Zoom in' })).toBeHidden();
});

test('frames and host content open from items, and modified clicks keep the link', async ({ page }) => {
  await openUi(page, gallery());
  await page.evaluate(() => CanopyX.lightbox('#photos').ready);
  const opened = await page.getByRole('link', { name: 'Server room' }).evaluate(link => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    link.addEventListener('click', inner => inner.preventDefault(), { once: true });
    link.dispatchEvent(event);
    return document.querySelector('.cx-lightbox').open;
  });
  expect(opened).toBe(false);
  await openUi(page, '<div id="viewer"></div>');
  await page.evaluate(() => {
    const node = document.createElement('p'); node.textContent = 'Host node';
    CanopyX.lightbox('#viewer', { items: [{ id: 'note', content: node, caption: 'Note' }, { id: 'page', type: 'frame', src: 'about:blank', caption: 'Manual' }] }).open('page');
  });
  await expect(viewer(page).locator('iframe')).toHaveAttribute('title', 'Manual');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer(page).getByText('Host node')).toBeVisible();
});

test('a phone shows the viewer full screen with large step buttons', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  // The opening animation scales the dialog; reduced motion shows its final size at once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, gallery());
  await page.getByRole('link', { name: 'Server room' }).click();
  const box = await viewer(page).boundingBox();
  expect(Math.round(box.width)).toBe(360);
  const next = await viewer(page).getByRole('button', { name: 'Next' }).boundingBox();
  expect(next.height).toBeGreaterThanOrEqual(40);
});

test('keys typed into host content stay with it, and opening another item moves the focus return', async ({ page }) => {
  await openUi(page, '<div id="viewer"></div><button id="first">First</button><button id="second">Second</button>');
  await page.evaluate(() => {
    const field = document.createElement('label'); field.innerHTML = 'Count <input id="count">';
    window.viewer = CanopyX.lightbox('#viewer', { items: [{ content: field, caption: 'Form' }, { content: 'Other', caption: 'Other' }] });
    return window.viewer.ready.then(() => window.viewer.open(0, { returnFocus: document.getElementById('first') }));
  });
  await page.locator('#count').fill('');
  await page.locator('#count').pressSequentially('10-2+0=');
  await expect(page.locator('#count')).toHaveValue('10-2+0=');
  await page.keyboard.press('ArrowRight');
  await expect(viewer(page)).toHaveAccessibleName('Form');
  await page.evaluate(() => window.viewer.open(1, { returnFocus: document.getElementById('second') }));
  await page.keyboard.press('Escape');
  await expect(page.locator('#second')).toBeFocused();
});

test('script addresses are refused in items however they are written', async ({ page }) => {
  await openUi(page, '<div id="viewer"></div>');
  const errors = await page.evaluate(() => ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'vbscript:x'].map(src => {
    try { CanopyX.lightbox(document.body.appendChild(document.createElement('div')), { items: [{ type: 'frame', src }] }); return 'ok'; } catch (error) { return error.message; }
  }));
  const settled = await page.evaluate(async () => Promise.all(['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'vbscript:x'].map(src =>
    CanopyX.lightbox(document.body.appendChild(document.createElement('div')), { items: [{ type: 'frame', src }] }).ready.then(() => 'ready', error => error.message))));
  expect(errors).toEqual(['ok', 'ok', 'ok', 'ok']);
  expect(new Set(settled)).toEqual(new Set(['CanopyX: lightbox item 0 has a script address.']));
});

test('focus stays in the viewer when Next becomes disabled, and a text-only link names its item', async ({ page }) => {
  await openUi(page, `<div id="docs" data-cx-lightbox><a data-lightbox-item href="about:blank" data-lightbox-type="frame"><span class="cx-gallery-label">Installation manual</span></a>
    <a data-lightbox-item href="about:blank" data-lightbox-type="frame"><span class="cx-gallery-label">Release notes</span></a></div>`);
  await page.getByRole('link', { name: 'Installation manual' }).click();
  await expect(viewer(page)).toHaveAccessibleName('Installation manual');
  await viewer(page).getByRole('button', { name: 'Next' }).focus();
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toHaveAccessibleName('Release notes');
  await expect(viewer(page).locator('iframe')).toHaveAttribute('title', 'Release notes');
  expect(await page.evaluate(() => document.querySelector('.cx-lightbox').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await expect(viewer(page)).toHaveAccessibleName('Installation manual');
});

test('focus stays in the viewer when a zoom button disables, and dragging a slider in content does not swipe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, gallery());
  await page.getByRole('link', { name: 'Server room' }).click();
  await expect.poll(() => viewer(page).getByRole('img', { name: 'Server room' }).evaluate(element => element.complete && element.naturalWidth)).toBe(800);
  await page.keyboard.press('+');
  await viewer(page).getByRole('button', { name: 'Fit to screen' }).focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.querySelector('.cx-lightbox').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(viewer(page).locator('[data-cx-part="position"]')).toHaveText('2 of 3');
  await openUi(page, '<div id="viewer"></div>');
  await page.evaluate(() => { const range = document.createElement('input'); range.type = 'range'; range.setAttribute('aria-label', 'Level');
    CanopyX.lightbox('#viewer', { items: [{ content: range, caption: 'Form' }, { content: 'Other', caption: 'Other' }] }).open(0); });
  const slider = await viewer(page).getByRole('slider', { name: 'Level' }).boundingBox();
  await page.mouse.move(slider.x + 5, slider.y + slider.height / 2); await page.mouse.down();
  await page.mouse.move(slider.x + slider.width - 5, slider.y + slider.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(viewer(page)).toHaveAccessibleName('Form');
});

test('video items play with a poster, autoplay muted, stop when left, and YouTube embeds without cookies', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Player</p>' }));
  await page.route('**/clip.mp4', route => route.fulfill({ status: 404 }));
  await openUi(page, `<div class="cx-gallery" data-cx-lightbox><ul class="cx-gallery-list">
    <li><a data-lightbox-item href="clip.mp4" data-lightbox-type="video" data-poster="${image('gray')}" data-autoplay="true" data-caption="Rack tour">Rack tour</a></li>
    <li><a data-lightbox-item href="https://youtu.be/aqz-KE-bpKQ?t=5" data-lightbox-type="youtube" data-caption="Keynote">Keynote</a></li>
    <li><a data-lightbox-item href="aqz-KE-bpKQ" data-lightbox-type="youtube" data-autoplay="true">Bare id</a></li></ul></div>`);
  await page.getByRole('link', { name: 'Rack tour' }).click();
  const video = viewer(page).locator('video');
  await expect(video).toHaveAttribute('aria-label', 'Rack tour');
  expect(await video.evaluate(element => [element.controls, element.muted, element.autoplay, element.poster.startsWith('data:image/svg')])).toEqual([true, true, true, true]);
  await expect(viewer(page).getByRole('button', { name: 'Zoom in' })).toBeHidden();
  await page.evaluate(() => { window.left = document.querySelector('.cx-lightbox video'); });
  await page.keyboard.press('ArrowRight');
  const frame = viewer(page).locator('iframe');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0');
  await expect(frame).toHaveAttribute('title', 'Keynote');
  expect(await page.evaluate(() => [window.left.paused, window.left.hasAttribute('src')])).toEqual([true, false]);
  await page.keyboard.press('ArrowRight');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0&autoplay=1&mute=1');
  const refused = await page.evaluate(() => CanopyX.lightbox(document.body.appendChild(document.createElement('div')),
    { items: [{ type: 'youtube', src: 'https://example.com/watch?v=aqz-KE-bpKQ' }] }).ready.then(() => 'ready', error => error.message));
  expect(refused).toBe('CanopyX: lightbox item 0 is not a YouTube address.');
});
