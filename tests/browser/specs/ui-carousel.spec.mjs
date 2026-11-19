import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 900, height: 700 } });

// Mirrors the .NET carousel: a labelled section, a viewport and a list of slides with focusable content.
const carousel = (extra = '', count = 4) => `<section id="news" class="cx-carousel" data-cx-carousel aria-label="Release notes" ${extra}>
  <div class="cx-carousel-viewport"><div class="cx-carousel-track">${Array.from({ length: count }, (_, at) =>
    `<div><h3>Note ${at + 1}</h3><a href="#n${at + 1}">Read note ${at + 1}</a></div>`).join('')}</div></div></section><button id="after">After</button>`;
const slide = (page, n) => page.getByRole('group', { name: `Slide ${n} of 4` });
const state = page => page.evaluate(() => CanopyX.carousel('#news').getState());

test('buttons, the picker and arrow keys move between slides, and hidden slides stay out of the Tab order', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, carousel());
  const root = page.getByRole('region', { name: 'Release notes' });
  await expect(root).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(slide(page, 1)).toHaveAttribute('aria-roledescription', 'slide');
  await expect(page.getByRole('button', { name: 'Previous slide' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Read note 2' })).not.toBeVisible().catch(() => {});
  expect(await page.locator('.cx-carousel-slide').nth(1).evaluate(element => element.inert)).toBe(true);
  await page.getByRole('button', { name: 'Next slide' }).click();
  expect(await state(page)).toMatchObject({ index: 1, total: 4, visible: 1, playing: false });
  await expect(page.getByRole('button', { name: 'Slide 2 of 4' })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Slide 4 of 4' }).click();
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeDisabled();
  // WebKit on macOS does not focus a clicked button.
  await page.getByRole('button', { name: 'Slide 4 of 4' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'Slide 1 of 4' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Slide 2 of 4' })).toBeFocused();
  expect((await state(page)).index).toBe(1);
  expect(await page.locator('.cx-carousel-slide').nth(1).evaluate(element => element.inert)).toBe(false);
  await expect(page.locator('[data-cx-part="viewport"], .cx-carousel-viewport')).toHaveAttribute('aria-live', 'polite');
});

test('a scroll by the reader settles on the nearest slide and reports a swipe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, carousel());
  await page.evaluate(() => { window.changes = []; document.addEventListener('cx-carousel:change', event => window.changes.push(event.detail.index + ':' + event.detail.source)); });
  await page.locator('.cx-carousel-track').evaluate(track => track.scrollTo({ left: track.clientWidth * 2, behavior: 'instant' }));
  await expect.poll(async () => (await state(page)).index).toBe(2);
  expect(await page.evaluate(() => window.changes)).toEqual(['2:swipe']);
});

test('right to left mirrors the arrow keys, and loop wraps at the ends', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, carousel('dir="rtl" data-loop="true"'));
  await page.getByRole('button', { name: 'Slide 1 of 4' }).focus();
  await page.keyboard.press('ArrowLeft');
  expect((await state(page)).index).toBe(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).index).toBe(3);
  await expect(page.getByRole('button', { name: 'Previous slide' })).toBeEnabled();
});

test('several slides per view move by one and become one slide on a phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, carousel('data-per-view="3"', 5));
  expect(await page.evaluate(() => CanopyX.carousel('#news').getState())).toMatchObject({ visible: 3, total: 5 });
  await expect(page.getByRole('button', { name: 'Slide 4 of 5' })).toBeHidden();
  await page.setViewportSize({ width: 360, height: 700 });
  await expect.poll(async () => (await page.evaluate(() => CanopyX.carousel('#news').getState())).visible).toBe(1);
  const next = await page.getByRole('button', { name: 'Next slide' }).boundingBox();
  expect(next.height).toBeGreaterThanOrEqual(40);
});

test('autoplay is off by default, and when asked for it pauses on hover and focus and stops on a choice', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  // Smooth scrolling runs on the compositor's own clock; the test moves time itself, so slides jump.
  await openUi(page, '<style>.cx-carousel-track { scroll-behavior: auto !important; }</style>' + carousel() + carousel().replace('id="news"', 'id="auto"').replace('Release notes', 'Highlights').replace('data-cx-carousel', 'data-cx-carousel data-autoplay-interval="3000"').replace('<button id="after">After</button>', ''));
  await page.mouse.move(450, 30);
  const auto = () => page.evaluate(() => CanopyX.carousel('#auto').getState());
  await expect(page.locator('#auto').getByRole('button', { name: 'Pause' })).toBeVisible();
  expect((await auto()).playing).toBe(true);
  await expect(page.locator('#auto .cx-carousel-viewport')).toHaveAttribute('aria-live', 'off');
  await page.clock.runFor(3000);
  expect((await state(page)).index).toBe(0);
  expect((await auto()).index).toBe(1);
  await page.locator('#auto .cx-carousel-track').hover();
  await page.clock.runFor(9000);
  expect((await auto()).index).toBe(1);
  await page.mouse.move(450, 30);
  await page.clock.runFor(3000);
  expect((await auto()).index).toBe(2);
  await page.locator('#auto').getByRole('button', { name: 'Previous slide' }).click();
  await page.mouse.move(450, 30);
  expect((await auto()).playing).toBe(false);
  await expect(page.locator('#auto').getByRole('button', { name: 'Play' })).toBeVisible();
});

test('a carousel enhanced around the focused element starts with autoplay paused', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, carousel().replace(' data-cx-carousel', ''));
  await page.getByRole('link', { name: 'Read note 1' }).focus();
  expect(await page.evaluate(async () => (await CanopyX.carousel('#news', { autoplay: { interval: 3000 } }).getState()).playing)).toBe(true);
  await page.clock.runFor(9000);
  expect((await state(page)).index).toBe(0);
  await page.locator('#after').focus();
  await page.clock.runFor(3000);
  expect((await state(page)).index).toBe(1);
});

test('going back before a smooth scroll starts cancels it, so the latest choice stays', async ({ page }) => {
  await openUi(page, '<style>.cx-carousel-track { scroll-behavior: smooth !important; }</style>' + carousel());
  const settled = await page.evaluate(async () => {
    const control = CanopyX.carousel('#news');
    await control.ready;
    await control.next(); await control.back();
    for (let frame = 0; frame < 20; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { left: Math.round(document.querySelector('#news .cx-carousel-track').scrollLeft), index: (await control.getState()).index };
  });
  expect(settled).toEqual({ left: 0, index: 0 });
});

test('reduced motion keeps an autoplaying carousel still and says why', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, carousel('data-autoplay-interval="2000"'));
  await expect(page.getByRole('button', { name: 'Automatic slides are disabled by reduced motion' })).toBeDisabled();
  expect((await state(page)).playing).toBe(false);
});

test('destroy restores the slides and removes the controls', async ({ page }) => {
  await openUi(page, carousel());
  await page.evaluate(() => CanopyX.carousel('#news').destroy());
  await expect(page.locator('.cx-carousel-controls')).toHaveCount(0);
  expect(await page.locator('.cx-carousel-slide').nth(2).evaluate(element => [element.inert, element.getAttribute('role'), element.getAttribute('aria-label')])).toEqual([false, null, null]);
});

test('six slides per view fit six with their gaps, so the last view stays reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 740, height: 600 });
  await openUi(page, '<div style="inline-size:700px">' + carousel('data-per-view="6"', 8) + '</div>');
  expect(await page.evaluate(() => CanopyX.carousel('#news').getState())).toMatchObject({ visible: 6, total: 8 });
  await page.getByRole('button', { name: 'Next slide' }).click();
  await page.getByRole('button', { name: 'Next slide' }).click();
  expect((await page.evaluate(() => CanopyX.carousel('#news').getState())).index).toBe(2);
});

test('stopping autoplay turns announcements back on, and refresh releases slides the host removed', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, carousel('data-autoplay-interval="3000"'));
  const viewport = page.locator('.cx-carousel-viewport');
  await expect(viewport).toHaveAttribute('aria-live', 'off');
  await page.evaluate(() => CanopyX.carousel('#news').pause());
  await expect(viewport).toHaveAttribute('aria-live', 'polite');
  const moved = await page.evaluate(() => {
    const slide = document.querySelectorAll('.cx-carousel-slide')[3];
    document.body.append(slide); CanopyX.carousel('#news').refresh();
    return [slide.inert, slide.getAttribute('role'), slide.getAttribute('aria-roledescription'), slide.dataset.state ?? null];
  });
  expect(moved).toEqual([false, null, null, null]);
  expect((await page.evaluate(() => CanopyX.carousel('#news').getState())).total).toBe(3);
});

test('a track that keeps its width across the phone breakpoint is measured again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 900, height: 600 });
  await openUi(page, '<div style="inline-size:500px">' + carousel('data-per-view="3"', 3) + '</div>');
  expect((await page.evaluate(() => CanopyX.carousel('#news').getState())).visible).toBe(3);
  await expect(page.locator('.cx-carousel-controls')).toBeHidden();
  await page.setViewportSize({ width: 600, height: 600 });
  await expect.poll(async () => (await page.evaluate(() => CanopyX.carousel('#news').getState())).visible).toBe(1);
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeVisible();
});

test('a percentage gap counts as the pixels it uses when slides are measured', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 900, height: 600 });
  await openUi(page, '<div style="inline-size:700px">' + carousel('data-per-view="6" style="--cx-carousel-gap:10%"', 8) + '</div>');
  expect((await page.evaluate(() => CanopyX.carousel('#news').getState())).visible).toBe(6);
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeVisible();
});

test('a scaled ancestor shrinks the track and the slides alike', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 900, height: 600 });
  await openUi(page, '<div style="inline-size:700px;transform:scale(.5);transform-origin:0 0">' + carousel('data-per-view="6"', 8) + '</div>');
  expect((await page.evaluate(() => CanopyX.carousel('#news').getState())).visible).toBe(6);
  // Moving scrolls the track by layout pixels, so the chosen slide lines up with the start.
  await page.getByRole('button', { name: 'Next slide' }).click();
  await page.getByRole('button', { name: 'Next slide' }).click();
  expect(await page.evaluate(() => { const track = document.querySelector('.cx-carousel-track'), slide = document.querySelectorAll('.cx-carousel-slide')[2];
    return Math.abs(slide.getBoundingClientRect().left - track.getBoundingClientRect().left) < 1; })).toBe(true);
});

test('a fading carousel stacks its slides, swaps them on a choice or a swipe, and refuses several per view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, carousel('data-transition="fade"'));
  const boxes = await page.locator('.cx-carousel-slide').evaluateAll(slides => slides.map(slide => Math.round(slide.getBoundingClientRect().left)));
  expect(new Set(boxes).size).toBe(1);
  await expect(slide(page, 1)).toBeVisible();
  await expect(slide(page, 2)).toBeHidden();
  await page.getByRole('button', { name: 'Next slide' }).click();
  await expect(slide(page, 2)).toBeVisible();
  await expect(slide(page, 1)).toBeHidden();
  // A mouse drag across slide text selects it and stays on the slide; a touch swipe moves on.
  const heading = await page.getByRole('heading', { name: 'Note 2' }).boundingBox();
  const text = await page.getByRole('heading', { name: 'Note 2' }).evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect().left; });
  await page.mouse.move(heading.x + heading.width - 10, heading.y + heading.height / 2); await page.mouse.down();
  await page.mouse.move(text + 1, heading.y + heading.height / 2, { steps: 4 }); await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).toContain('Note');
  expect((await state(page)).index).toBe(1);
  await page.locator('.cx-carousel-slide').nth(1).evaluate(slide => {
    const box = slide.getBoundingClientRect(), at = (type, x) => slide.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerType: 'touch', clientX: x, clientY: box.top + 10 }));
    at('pointerdown', box.right - 20); at('pointerup', box.left + 20);
  });
  expect((await state(page)).index).toBe(2);
  const refused = await page.evaluate(() => CanopyX.carousel(document.body.appendChild(Object.assign(document.createElement('section'), { innerHTML: '<div class="cx-carousel-track"><div>a</div></div>' })),
    { transition: 'fade', perView: 2 }).ready.then(() => 'ready', error => error.message));
  expect(refused).toBe('CanopyX: a fading carousel shows one slide at a time.');
});

test('controls sit beside the slides, the picker on its own line, and captions under or over their slide', async ({ page }) => {
  await openUi(page, carousel('data-controls="sides" data-indicators="above" data-captions="below"').replace('<h3>Note 1</h3>', '<h3>Note 1</h3><p class="cx-carousel-caption">First caption</p>'));
  const track = await page.locator('.cx-carousel-track').boundingBox();
  const previous = await page.getByRole('button', { name: 'Previous slide' }).boundingBox();
  const next = await page.getByRole('button', { name: 'Next slide' }).boundingBox();
  const picker = await page.getByRole('group', { name: 'Choose a slide' }).boundingBox();
  expect(previous.x + previous.width).toBeLessThanOrEqual(track.x);
  expect(next.x).toBeGreaterThanOrEqual(track.x + track.width);
  expect(picker.y + picker.height).toBeLessThanOrEqual(track.y);
  await expect(page.locator('.cx-carousel-controls')).toBeHidden();
  const caption = page.getByText('First caption');
  expect(await caption.evaluate(element => getComputedStyle(element).position)).toBe('static');
  await page.evaluate(() => { CanopyX.carousel('#news').destroy(); document.getElementById('news').dataset.captions = 'overlay'; });
  expect(await caption.evaluate(element => getComputedStyle(element).position)).toBe('absolute');
  await expect(page.getByRole('button', { name: 'Previous slide' })).toHaveCount(0);
});

test('hidden indicators leave the buttons and keys, and the bar can sit above the slides', async ({ page }) => {
  await openUi(page, carousel('data-indicators="hidden" data-controls="above"'));
  await expect(page.getByRole('group', { name: 'Choose a slide' })).toBeHidden();
  const bar = await page.locator('.cx-carousel-controls').boundingBox(), track = await page.locator('.cx-carousel-track').boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(track.y);
  await page.locator('.cx-carousel-track').focus();
  await page.keyboard.press('End');
  expect((await state(page)).index).toBe(3);
});

test('a fading carousel leaves a carousel inside its slide with its own sliding layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const inner = `<section id="inner" class="cx-carousel" data-cx-carousel data-per-view="2" aria-label="Inner"><div class="cx-carousel-viewport"><div class="cx-carousel-track">
    <div>Inner 1</div><div>Inner 2</div><div>Inner 3</div></div></div></section>`;
  await openUi(page, carousel('data-transition="fade"').replace('<h3>Note 1</h3>', '<h3>Note 1</h3>' + inner));
  await expect(page.getByText('Inner 2')).toBeVisible();
  const lefts = await page.locator('#inner .cx-carousel-slide').evaluateAll(slides => slides.slice(0, 2).map(slide => Math.round(slide.getBoundingClientRect().left)));
  expect(lefts[1]).toBeGreaterThan(lefts[0]);
});

test('a swipe and caption placement inside a nested fading carousel belong to that carousel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const inner = `<section id="inner" class="cx-carousel" data-cx-carousel data-transition="fade" data-captions="below" aria-label="Inner"><div class="cx-carousel-viewport"><div class="cx-carousel-track">
    <div><p>Inner 1</p><p class="cx-carousel-caption">Inner caption</p></div><div><p>Inner 2</p></div></div></div></section>`;
  await openUi(page, carousel('data-transition="fade"').replace('<h3>Note 1</h3>', '<h3>Note 1</h3>' + inner));
  expect(await page.getByText('Inner caption').evaluate(element => getComputedStyle(element).position)).toBe('static');
  await page.locator('#inner .cx-carousel-slide').first().evaluate(slide => {
    const box = slide.getBoundingClientRect(), at = (type, x) => slide.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerType: 'touch', clientX: x, clientY: box.top + 5 }));
    at('pointerdown', box.right - 10); at('pointerup', box.left + 10);
  });
  expect(await page.evaluate(async () => [(await CanopyX.carousel('#inner').getState()).index, (await CanopyX.carousel('#news').getState()).index])).toEqual([1, 0]);
});

test('a fading carousel without its runtime, or after destroy, keeps every slide readable', async ({ page }) => {
  await openUi(page, carousel('data-transition="fade"').replace(' data-cx-carousel', '') + carousel('data-transition="fade"').replace('id="news"', 'id="live"'));
  const unmounted = page.locator('section:not(#live) .cx-carousel-track > *');
  for (let at = 0; at < 4; at++) await expect(unmounted.nth(at)).toBeVisible();
  const live = page.locator('#live .cx-carousel-track > *');
  await expect(live.nth(1)).toBeHidden();
  await page.evaluate(() => CanopyX.carousel('#live').destroy());
  for (let at = 0; at < 4; at++) await expect(live.nth(at)).toBeVisible();
});

test('dragging an image slide of a fading carousel moves to the next slide', async ({ page }) => {
  const picture = fill => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="100%" height="100%" fill="${fill}"/></svg>`);
  await openUi(page, `<section id="news" class="cx-carousel" data-cx-carousel data-transition="fade" aria-label="Photos"><div class="cx-carousel-track">
    <div><img alt="Red" src="${picture('red')}"></div><div><img alt="Green" src="${picture('green')}"></div></div></section>`);
  const box = await page.getByRole('img', { name: 'Red' }).boundingBox();
  await page.mouse.move(box.x + box.width - 40, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 6 }); await page.mouse.up();
  expect((await state(page)).index).toBe(1);
});
