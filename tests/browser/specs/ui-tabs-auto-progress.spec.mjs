import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 1280, height: 900 } });

// The optional attributes are the CanopyTabsAutoProgress builder contract.
const markup = (attributes = '') => `<div id="sections" class="cx-tabs cx-tabs--underline" data-cx-tabs ${attributes}>
  <div class="cx-tablist" role="tablist" aria-label="Sections" aria-orientation="horizontal">
  ${['first', 'locked', 'second', 'third'].map((id, index) => `<button type="button" class="cx-tab" role="tab"
    id="sections-tab-${id}" data-tab-id="${id}" aria-controls="sections-panel-${id}" aria-selected="${index === 0}"
    tabindex="${index === 0 ? 0 : -1}" ${id === 'locked' ? 'aria-disabled="true"' : ''}>
    <span class="cx-tab-label">${id}</span></button>`).join('')}</div>
  ${['first', 'locked', 'second', 'third'].map(id => `<section class="cx-tabpanel" id="sections-panel-${id}"
    role="tabpanel" aria-labelledby="sections-tab-${id}" tabindex="0"><h3 class="cx-tabpanel-heading">${id}</h3>
    <p>${id} content</p></section>`).join('')}</div><button id="outside">Outside</button>`;

const init = options => `window.sections = CanopyX.tabs('#sections', ${options});`;
const selected = page => page.evaluate(() => sections.getSelected());
// Switches reduced motion once the emulated value is in effect, then lets a running timer see it for a frame or two.
async function switchMotion(page, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce');
  await page.clock.runFor(50);
}
async function releasePointerAndFocus(page) {
  await page.mouse.move(1200, 800);
  await page.locator('#outside').focus();
}

test('declarative autoProgress supports visible keyboard Pause/Play on wide and phone layouts', async ({ page }) => {
  await page.clock.install(); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openUi(page, markup('data-auto-progress-interval="2000" data-auto-progress-pause-on-hover="true" data-auto-progress-pause-on-focus="true"'), init('{}'));
  await releasePointerAndFocus(page); await page.clock.runFor(2100); expect(await selected(page)).toBe('second');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await expect(pause).toBeVisible(); await pause.focus(); await page.keyboard.press('Enter');
  await releasePointerAndFocus(page); await page.clock.runFor(5000); expect(await selected(page)).toBe('second');
  await page.setViewportSize({ width: 240, height: 844 }); await page.clock.runFor(50);
  const play = page.getByRole('button', { name: 'Play', exact: true }); await expect(play).toBeVisible();
  await play.focus(); await page.keyboard.press('Space'); await page.locator('#outside').focus();
  await page.mouse.move(230, 800); await page.clock.runFor(2100); expect(await selected(page)).toBe('third');
});

test('initial and dynamic reduced motion block advancement and require explicit Play after changing back', async ({ page }) => {
  await page.clock.install(); await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, markup(), init('{ autoProgress: { interval: 2000, pauseOnHover: false, pauseOnFocus: false } }'));
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeDisabled();
  await expect(play).toHaveAttribute('aria-description', 'Automatic tabs are disabled by reduced motion');
  await page.clock.runFor(10000); expect(await selected(page)).toBe('first');
  await page.getByRole('tab', { name: 'third', exact: true }).click(); expect(await selected(page)).toBe('third');
  await switchMotion(page, 'no-preference'); await expect(play).toBeEnabled();
  await page.clock.runFor(5000); expect(await selected(page)).toBe('third');
  await play.click(); await page.clock.runFor(2100); expect(await selected(page)).toBe('first');
  await switchMotion(page, 'reduce'); await expect(play).toBeDisabled();
  await page.clock.runFor(10000); expect(await selected(page)).toBe('first');
  await expect(page.locator('.cx-tabs-progress')).toBeHidden();
});

test('reduced motion aborts a pending automatic guard without a late commit', async ({ page }) => {
  await page.clock.install(); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openUi(page, markup(), init(`{ autoProgress: { interval: 2000, pauseOnHover: false, pauseOnFocus: false },
    beforeChange: (from, to, signal) => new Promise(resolve => { window.guardSignal = signal; window.resolveGuard = resolve; }) }`));
  await page.clock.runFor(2100); await expect.poll(() => page.evaluate(() => !!window.guardSignal)).toBe(true);
  await switchMotion(page, 'reduce');
  await expect.poll(() => page.evaluate(() => guardSignal.aborted)).toBe(true);
  await page.evaluate(() => resolveGuard(true)); await page.clock.runFor(5000);
  expect(await selected(page)).toBe('first');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

for (const mode of ['hover', 'focus']) {
  test(`autoProgress defaults suspend on ${mode} and resume without catch-up`, async ({ page }) => {
    await page.clock.install(); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openUi(page, markup(), init('{ autoProgress: { interval: 2000 } }'));
    await releasePointerAndFocus(page); await page.clock.runFor(500);
    if (mode === 'hover') await page.getByRole('tab', { name: 'first', exact: true }).hover();
    else await page.locator('#sections-panel-first').focus();
    await page.clock.runFor(6000); expect(await selected(page)).toBe('first');
    await releasePointerAndFocus(page); await page.clock.runFor(500); expect(await selected(page)).toBe('first');
    await page.clock.runFor(1200); expect(await selected(page)).toBe('second');
  });
}

for (const choice of ['first', 'locked']) {
  test(`user selection of ${choice} stops progression even after leaving focus`, async ({ page }) => {
    await page.clock.install(); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openUi(page, markup(), init('{ autoProgress: { interval: 2000 } }'));
    await page.getByRole('tab', { name: choice, exact: true }).focus();
    await page.keyboard.press('Enter');
    await releasePointerAndFocus(page); await page.clock.runFor(6000);
    expect(await selected(page)).toBe('first'); await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
}

test('manual selection supersedes an automatic deferred load and destroy releases the timer', async ({ page }) => {
  await page.clock.install(); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openUi(page, markup(), init(`{ autoProgress: { interval: 2000, pauseOnHover: false, pauseOnFocus: false },
    tabs: [{ id: 'second', deferred: true, loader: (item, signal) => new Promise(resolve => {
      window.loadSignal = signal; window.resolveLoad = resolve;
    }) }] }`));
  await page.clock.runFor(2100); await expect.poll(() => page.evaluate(() => !!window.loadSignal)).toBe(true);
  await page.evaluate(() => sections.select('third')); expect(await page.evaluate(() => loadSignal.aborted)).toBe(true);
  await page.evaluate(() => resolveLoad('<p>Stale automatic content</p>')); await page.clock.runFor(6000);
  expect(await selected(page)).toBe('third'); await expect(page.getByText('Stale automatic content')).toHaveCount(0);
  await page.evaluate(() => sections.destroy()); await page.clock.runFor(6000);
  await expect(page.locator('.cx-tabs-play,.cx-tabs-progress')).toHaveCount(0);
  await expect(page.locator('#sections-panel-first')).toBeVisible();
});

test('localized reduced-motion control uses host labels without changing content labels', async ({ page }) => {
  await switchMotion(page, 'reduce');
  await openUi(page, markup(), init(`{ autoProgress: { interval: 2000 }, labels: {
    tabsPause: 'Wstrzymaj', tabsPlay: 'Odtwórz',
    tabsMotionDisabled: 'Automatyczne przełączanie kart jest wyłączone przy ograniczeniu ruchu'
  } }`));
  const play = page.getByRole('button', { name: 'Odtwórz', exact: true });
  await expect(play).toBeVisible(); await expect(play).toBeDisabled();
  await expect(play).toHaveAttribute('aria-description', 'Automatyczne przełączanie kart jest wyłączone przy ograniczeniu ruchu');
  await expect(page.getByRole('tab', { name: 'first', exact: true })).toBeVisible();
});
