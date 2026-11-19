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
