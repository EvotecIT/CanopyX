import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 1000, height: 700 } });

// Mirrors the .NET region: a toast written into the page is read and shown through the queue.
const region = (extra = '', items = '') => `<section id="notices" class="cx-toasts" data-cx-toasts ${extra}><ol class="cx-toasts-list">${items}</ol></section>
  <button id="outside">Outside</button>`;
const toast = page => page.locator('.cx-toast');
// A paused clock moves only when the test says so, so timeouts are checked without waiting or timing.
const pauseClock = async page => { await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000); };
const announcer = (page, live = 'polite') => page.locator(`[data-cx-part="announcer"][aria-live="${live}"]`);

test('a written toast shows with its tone in words, and a timeout closes it after the clock passes', async ({ page }) => {
  await pauseClock(page);
  await openUi(page, region('data-timeout="4000"', '<li class="cx-toast" data-tone="success" data-toast-id="saved"><strong class="cx-toast-title">Saved</strong><p class="cx-toast-message">Settings stored.</p></li>'));
  await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible();
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toHaveAttribute('data-tone', 'success');
  await expect(toast(page)).toContainText('Success: SavedSettings stored.');
  await expect(announcer(page).locator('p')).toHaveText('Success: Saved: Settings stored.');
  await page.clock.runFor(3999);
  await expect(toast(page)).toHaveCount(1);
  await page.clock.runFor(2);
  await expect(toast(page)).toHaveCount(0);
});

test('hover and focus pause the timeout without catching up, and Escape dismisses the focused toast', async ({ page }) => {
  await pauseClock(page);
  await openUi(page, region('data-timeout="1000"'));
  const id = await page.evaluate(() => CanopyX.notify({ message: 'Report queued' }));
  expect(id).toMatch(/^cx-toast-/);
  await page.clock.runFor(600);
  await toast(page).hover();
  await page.clock.runFor(5000);
  await expect(toast(page)).toHaveCount(1);
  await page.mouse.move(5, 5);
  await page.clock.runFor(399);
  await expect(toast(page)).toHaveCount(1);
  await page.locator('#outside').focus();
  await page.getByRole('button', { name: 'Dismiss' }).focus();
  await page.clock.runFor(5000);
  await expect(toast(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(toast(page)).toHaveCount(0);
  await expect(page.locator('#outside')).toBeFocused();
});

test('the queue shows at most max toasts, counts the rest and fills in as toasts close', async ({ page }) => {
  await openUi(page, region('data-max="2"'));
  const controller = await page.evaluate(() => {
    const region = CanopyX.toasts('#notices');
    for (const name of ['one', 'two', 'three', 'four']) region.show({ id: name, message: name, timeout: 0 });
    return region.getState();
  });
  expect(controller).toEqual({ visible: ['one', 'two'], queued: ['three', 'four'] });
  await expect(page.locator('.cx-toasts-more')).toHaveText('2 more');
  await toast(page).first().getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast(page)).toHaveText(['Information: two', 'Information: three']);
  await expect(page.locator('.cx-toasts-more')).toHaveText('1 more');
  await page.evaluate(() => CanopyX.toasts('#notices').clear());
  await expect(toast(page)).toHaveCount(0);
  await expect(page.locator('.cx-toasts-more')).toBeHidden();
});

test('a toast with the same id updates in place, and danger toasts stay and speak assertively', async ({ page }) => {
  await pauseClock(page);
  await openUi(page, region());
  await page.evaluate(() => CanopyX.notify({ id: 'sync', title: 'Sync', message: 'Running…', timeout: 0 }));
  await page.evaluate(() => CanopyX.notify({ id: 'sync', tone: 'danger', title: 'Sync', message: 'Failed: access denied' }));
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toHaveAttribute('data-tone', 'danger');
  await expect(announcer(page, 'assertive').locator('p')).toHaveText('Error: Sync: Failed: access denied');
  await page.clock.runFor(60000);
  await expect(toast(page)).toHaveCount(1);
});

test('actions call the host, close the toast and can be cancelled; links suit server-pushed toasts', async ({ page }) => {
  await openUi(page, region());
  await page.evaluate(() => {
    window.events = [];
    document.addEventListener('cx-toasts:action', event => { window.events.push(event.detail.action); if (event.detail.action === 'keep') event.preventDefault(); });
    document.addEventListener('cx-toasts:close', event => window.events.push(event.detail.reason));
    CanopyX.notify({ id: 'deleted', message: 'Row deleted', actions: [{ id: 'keep', label: 'Keep' }, { id: 'undo', label: 'Undo', onSelect: detail => window.events.push('undo:' + detail.id) }] });
    CanopyX.notify({ id: 'report', message: 'Report ready', actions: [{ label: 'Open', href: '#report' }] });
  });
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(toast(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(toast(page)).toHaveCount(1);
  expect(await page.evaluate(() => window.events)).toEqual(['keep', 'undo', 'undo:deleted', 'action']);
  await expect(page.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '#report');
});

test('host tones read their colour from the theme, and bad input is refused', async ({ page }) => {
  await openUi(page, region(), `document.documentElement.style.setProperty('--hfx-color-status-high-fg', 'rgb(200, 0, 100)');`);
  await page.evaluate(() => CanopyX.notify({ tone: 'high', message: 'Severity high' }));
  await expect(toast(page)).toContainText('Notice: Severity high');
  expect(await toast(page).evaluate(element => getComputedStyle(element).borderInlineStartColor)).toBe('rgb(200, 0, 100)');
  const errors = await page.evaluate(async () => {
    const region = CanopyX.toasts('#notices'); await region.ready;
    return [{ tone: 'Red', message: 'x' }, {}, { message: 'x', actions: [1, 2, 3, 4] }, { message: 'x', timeout: -1 }].map(input => {
      try { region.show(input); return 'shown'; } catch (error) { return error.message; }
    });
  });
  expect(errors).toEqual(['CanopyX: unknown toast tone.', 'CanopyX: a toast needs message.', 'CanopyX: a toast has at most three actions.',
    'CanopyX: toast timeout must be a whole number from 0 to 600000.']);
});

test('the region joins an open modal dialog so its toasts stay usable, then goes back', async ({ page }) => {
  await openUi(page, region() + '<dialog id="modal"><button id="inside">Inside</button></dialog>');
  await page.evaluate(() => document.getElementById('modal').showModal());
  await page.evaluate(() => CanopyX.notify({ message: 'Saved while editing', timeout: 0 }));
  await expect(page.locator('#modal .cx-toasts')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.evaluate(() => document.getElementById('modal').close());
  await expect(page.locator('main > .cx-toasts')).toHaveCount(1);
});

test('notify creates a region when the page has none, in the page language and direction', async ({ page }) => {
  await openUi(page, '<p>Report</p>', `document.documentElement.dir = 'rtl';`);
  await page.evaluate(() => CanopyX.notify({ message: 'Ready', timeout: 0, labels: {} }));
  const region = page.locator('body > .cx-toasts');
  await expect(region).toHaveAttribute('data-position', 'bottom-end');
  const box = await region.boundingBox();
  expect(box.x).toBeLessThan(100);
});

test('a phone keeps toasts inside the screen with room to tap Dismiss', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openUi(page, region('data-position="top-center"'));
  await page.evaluate(() => CanopyX.notify({ message: 'A longer message that wraps on a narrow screen', timeout: 0 }));
  const box = await toast(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  const close = await page.getByRole('button', { name: 'Dismiss' }).boundingBox();
  expect(close.height).toBeGreaterThanOrEqual(32);
});

test('a visible toast joins a modal dialog that opens after it, and HTML content is announced as its text', async ({ page }) => {
  await openUi(page, region() + '<dialog id="modal"><button id="inside">Inside</button></dialog>');
  await page.evaluate(() => CanopyX.notify({ tone: 'danger', content: '<strong>Backup failed</strong> on <em>srv01</em>' }));
  await expect(announcer(page, 'assertive').locator('p')).toHaveText('Error: Backup failed on srv01');
  await page.evaluate(() => document.getElementById('modal').showModal());
  await expect(page.locator('#modal .cx-toasts')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast(page)).toHaveCount(0);
});

test('an update that changes only the content is announced again, and generated ids skip the ones the page wrote', async ({ page }) => {
  await openUi(page, region('', '<li class="cx-toast"><p class="cx-toast-message">First</p></li><li class="cx-toast" data-toast-id="cx-toast-1"><p class="cx-toast-message">Second</p></li>'));
  expect(await page.evaluate(() => CanopyX.toasts('#notices').getState().visible.length)).toBe(2);
  await page.evaluate(() => { const region = CanopyX.toasts('#notices'); region.show({ id: 'job', content: '<b>Step 1</b>', timeout: 0 }); region.show({ id: 'job', content: '<b>Step 2</b>', timeout: 0 }); });
  await expect(announcer(page).locator('p').last()).toHaveText('Information: Step 2');
});

test('an update keeps focus on the same control, and the region follows the modal opened last and comes back when it is removed', async ({ page }) => {
  await openUi(page, region() + '<dialog id="a"><p>A</p></dialog><dialog id="b"><p>B</p></dialog>');
  await page.evaluate(() => CanopyX.notify({ id: 'job', message: 'Step 1', actions: [{ id: 'stop', label: 'Stop', close: false }] }));
  await page.getByRole('button', { name: 'Stop' }).focus();
  await page.evaluate(() => CanopyX.notify({ id: 'job', message: 'Step 2', actions: [{ id: 'stop', label: 'Stop', close: false }] }));
  await expect(page.getByRole('button', { name: 'Stop' })).toBeFocused();
  await page.evaluate(() => { document.getElementById('b').showModal(); document.getElementById('a').showModal(); });
  await expect(page.locator('#a .cx-toasts')).toHaveCount(1);
  await page.evaluate(() => { document.getElementById('a').remove(); });
  await expect(page.locator('#b .cx-toasts')).toHaveCount(1);
  await page.evaluate(() => { document.getElementById('b').remove(); });
  await expect(page.locator('main > .cx-toasts')).toHaveCount(1);
  await expect(toast(page)).toHaveCount(1);
});

test('rewriting the open attribute of an open modal does not move the region to it', async ({ page }) => {
  await openUi(page, region() + '<dialog id="a"><p>A</p></dialog><dialog id="b"><p>B</p></dialog>');
  await page.evaluate(() => CanopyX.notify({ message: 'Kept', timeout: 0 }));
  await page.evaluate(() => { document.getElementById('a').showModal(); document.getElementById('b').showModal(); });
  await expect(page.locator('#b .cx-toasts')).toHaveCount(1);
  await page.evaluate(() => document.getElementById('a').setAttribute('open', ''));
  await page.evaluate(() => CanopyX.notify({ message: 'Again', timeout: 0 }));
  await expect(page.locator('#b .cx-toasts')).toHaveCount(1);
});
