import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { repo, examples } from './support.mjs';

let server, address;
test.beforeAll(async () => {
  const html = fs.readFileSync(path.join(examples, 'ui-primitives.html'), 'utf8');
  const tokens = fs.readFileSync(path.join(repo, 'tests/fixtures/hfx-role-host.css'), 'utf8');
  server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    const standalone = new URL(request.url, 'http://127.0.0.1').searchParams.has('standalone');
    response.end(standalone ? html : html.replace('</head>', '<style>' + tokens + '</style><script>document.documentElement.dataset.galleryHostThemes="true";</script></head>'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  address = 'http://127.0.0.1:' + server.address().port + '/ui-primitives.html';
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('the standalone gallery offers working fallback appearance controls without host palettes', async ({ page }) => {
  await page.goto(address + '?standalone=1&mode=dark');
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'true');
  await expect(page.locator('#gallery-theme')).toHaveCount(1);
  await expect(page.locator('#gallery-theme')).toBeHidden();
  const dark = await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(dark);
  expect(await page.locator('#sections').evaluate(element => getComputedStyle(element).getPropertyValue('--hfx-color-surface').trim())).toBe('');
});

const surfaces = { evotec: ['#ffffff', '#16181c'], neutral: ['#ffffff', '#181818'], slate: ['#ffffff', '#141b26'], warm: ['#fffdf9', '#1c1814'], contrast: ['#ffffff', '#0a0a0a'] };
for (const style of Object.keys(surfaces)) for (const mode of ['light', 'dark']) {
  test(`typed UI gallery renders ${style} ${mode} with accessible names and states`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(address + '?style=' + style + '&mode=' + mode);
    await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'true');
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    await expect(page.locator('html')).toHaveAttribute('data-hfx-style', style);
    expect(await page.locator('#sections').evaluate(el => getComputedStyle(el).getPropertyValue('--hfx-color-surface').trim())).toBe(surfaces[style][mode === 'dark' ? 1 : 0]);
    await expect(page.locator('#sections [role="tab"]').first()).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['deferred', 'tour']) {
      await expect(page.locator('#' + id + ' > .cx-tablist')).toBeVisible();
      await expect(page.locator('#' + id + ' > .cx-tabs-phone-picker')).toBeHidden();
    }
    await expect(page.locator('#more-sections > .cx-tablist')).toBeVisible();
    await expect(page.locator('#more-sections .cx-tabs-more .cx-picker-trigger')).toBeVisible();
    const tourCard = page.locator('.gallery-card').filter({ has: page.locator('#tour') });
    await expect(tourCard.locator('#guard-selection')).toBeVisible();
    const play = page.locator('#tour .cx-tabs-play');
    expect(await play.evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
    expect(await play.evaluate(el => getComputedStyle(el, '::before').content)).not.toMatch(/^(none|normal|"")$/);
    const staticCard = page.locator('.gallery-card').filter({ has: page.getByRole('heading', { name: 'Static and report views', exact: true }) });
    const verticalCard = page.locator('.gallery-card').filter({ has: page.getByRole('heading', { name: 'Vertical review', exact: true }) });
    expect((await staticCard.boundingBox()).height).toBeLessThan((await verticalCard.boundingBox()).height - 40);
    expect(errors).toEqual([]);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations).toEqual([]);
    const folder = process.env.CANOPYX_UI_REVIEW_FRAMES || info.outputPath('frames');
    fs.mkdirSync(folder, { recursive: true });
    if (style === 'evotec') {
      await page.locator('.gallery-card').filter({ has: page.locator('#deferred') }).screenshot({ path: path.join(folder, `1440-${mode}-deferred-tabs.png`) });
      await page.locator('.gallery-card').filter({ has: page.locator('#more-sections') }).screenshot({ path: path.join(folder, `1440-${mode}-more-tabs.png`) });
      await tourCard.screenshot({ path: path.join(folder, `1440-${mode}-tour.png`) });
      await staticCard.screenshot({ path: path.join(folder, `1440-${mode}-static-report.png`) });
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(folder, `1440-${style}-${mode}-gallery.png`), fullPage: true });
    await page.screenshot({ path: path.join(folder, `1440-${style}-${mode}.png`) });
    for (const [id, kind] of [['edit-workspace', 'dialog'], ['record-details', 'drawer'], ['view-options', 'popover'], ['record-actions', 'menu'], ['shortcut-help', 'tooltip']]) {
      const trigger = page.locator('#' + id + '-trigger'), popup = page.locator('#' + id);
      if (kind === 'tooltip') await trigger.focus(); else await trigger.click();
      await expect(popup).toBeVisible();
      await popup.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
      expect(await popup.evaluate(el => getComputedStyle(el).colorScheme)).toBe(mode);
      expect(await popup.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1; }), kind + ' fits the viewport after its entry motion').toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: path.join(folder, `1440-${style}-${mode}-${kind}.png`) });
      await page.keyboard.press('Escape'); await expect(popup).not.toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('the phone gallery uses the shared pickers and exposes its drawer as a sheet', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(address + '?style=evotec&mode=dark');
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'true');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  if (await pause.isVisible()) await pause.click();
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  await expect(page.locator('#sections > .cx-tabs-phone-picker .cx-picker-trigger')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const folder = process.env.CANOPYX_UI_REVIEW_FRAMES || info.outputPath('frames');
  fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, '390-dark-gallery.png'), fullPage: true });
  await page.screenshot({ path: path.join(folder, '390-dark.png') });
  await page.locator('#record-details-trigger').click();
  await expect(page.locator('#record-details')).toBeVisible();
  await page.locator('#record-details').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  expect(await page.locator('#record-details').evaluate(el => el.matches(':modal'))).toBe(true);
  const spacing = await page.locator('#record-details').evaluate(el => {
    const title = el.querySelector('[data-hfx-part="title"]').getBoundingClientRect();
    const body = el.querySelector('[data-hfx-part="body"]');
    const header = el.querySelector('[data-hfx-part="header"]');
    return { gap: body.firstElementChild.getBoundingClientRect().top - title.bottom,
      header: [header.getBoundingClientRect().height, getComputedStyle(header).paddingBlock, getComputedStyle(header).minBlockSize],
      body: [getComputedStyle(body).paddingBlockStart, getComputedStyle(body.firstElementChild).marginBlockStart] };
  });
  expect(spacing.gap, JSON.stringify(spacing)).toBeLessThanOrEqual(24);
  await page.screenshot({ path: path.join(folder, '390-dark-drawer.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#record-details-trigger')).toBeFocused();
  expect(errors).toEqual([]);
});

test('forced colors retain tab selection, menu checks and keyboard focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(address + '?style=contrast&mode=dark');
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'true');
  const tab = page.locator('#sections [role="tab"]').first();
  await tab.focus(); await expect(tab).toHaveAttribute('aria-selected', 'true');
  expect(await tab.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThan(0);
  await page.locator('#record-actions-trigger').click();
  const checked = page.locator('#record-actions [data-item-id="show-details"]');
  await expect(checked).toHaveAttribute('aria-checked', 'true');
  expect(await checked.locator('.cx-menu-icon').evaluate(el => getComputedStyle(el, '::before').content)).not.toMatch(/^(none|normal|"")$/);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
  const folder = process.env.CANOPYX_UI_REVIEW_FRAMES || info.outputPath('frames'); fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, '1440-forced-colors.png') });
});
