import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openUi } from './ui-support.mjs';

const overlay = (kind, id, body = '<label>Record name<input value="Example"></label>', extra = '') =>
  `<button id="${id}-trigger" aria-controls="${id}" aria-expanded="false">Open ${id}</button>
  <dialog id="${id}" class="cx-${kind}" data-cx-${kind} data-cx-trigger="${id}-trigger" data-side="end" data-size="md" aria-labelledby="${id}-title" ${extra}>
    <header data-hfx-part="header"><h2 id="${id}-title">${id} settings</h2><button class="cx-overlay-close" data-cx-close aria-label="Close"></button></header>
    <div data-hfx-part="body">${body}</div><footer data-hfx-part="footer"><button data-cx-cancel>Cancel</button><button>Save</button></footer>
  </dialog>`;

test('dialog traps focus, restores its trigger and keeps the document scroll state', async ({ page }) => {
  await openUi(page, overlay('dialog', 'record') + '<button id="after">After dialog</button>');
  await page.evaluate(() => document.documentElement.style.overflow = 'auto');
  await page.getByRole('button', { name: 'Open record' }).click();
  const dialog = page.getByRole('dialog', { name: 'record settings' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await dialog.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open record' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('auto');
});

for (const width of [1440, 390]) test(`drawer has the correct modality at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openUi(page, overlay('drawer', 'details') + '<button id="outside">Outside drawer</button>');
  await page.getByRole('button', { name: 'Open details' }).click();
  const drawer = page.getByRole('dialog', { name: 'details settings' });
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate(el => el.matches(':modal'))).toBe(width === 390);
  if (width === 1440) {
    await page.locator('#outside').focus(); await expect(page.locator('#outside')).toBeFocused();
  } else {
    await expect(drawer).toHaveAttribute('data-phone', 'true');
    expect(await drawer.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(width);
  }
  await page.keyboard.press('Escape'); await expect(drawer).not.toBeVisible();
});

test('a drawer changes to a modal sheet when its container narrows', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:900px">${overlay('drawer', 'details')}</div>`);
  await page.locator('#details').evaluate(el => {
    document.documentElement.style.overflow = 'auto';
    window.drawerCloses = 0; window.drawerNativeCloses = 0;
    document.addEventListener('close', event => { if (event.target === el) window.drawerNativeCloses++; }, true);
    el.addEventListener('close', () => window.drawerCloses++);
  });
  await page.getByRole('button', { name: 'Open details' }).click();
  await page.locator('#container').evaluate(el => el.style.width = '390px');
  const drawer = page.locator('#details');
  await expect(drawer).toHaveAttribute('data-phone', 'true');
  await expect.poll(() => drawer.evaluate(el => el.matches(':modal'))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.drawerNativeCloses)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  expect(await page.evaluate(() => window.drawerCloses)).toBe(0);
  await page.locator('#container').evaluate(el => el.style.width = '900px');
  await expect(drawer).toHaveAttribute('data-phone', 'false');
  await expect.poll(() => drawer.evaluate(el => el.matches(':modal'))).toBe(false);
  await expect.poll(() => page.evaluate(() => window.drawerNativeCloses)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('auto');
  expect(await page.evaluate(() => window.drawerCloses)).toBe(0);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.drawerCloses)).toBe(1);
});

test('a native close also releases the controller stack and scroll lock', async ({ page }) => {
  await openUi(page, overlay('dialog', 'native'));
  await page.getByRole('button', { name: 'Open native' }).click();
  await page.locator('#native').evaluate(el => el.close());
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
  await page.getByRole('button', { name: 'Open native' }).click();
  await expect(page.locator('#native')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#native')).not.toBeVisible();
});

for (const method of ['native', 'controller']) test(`a nested ${method} dialog close keeps its outer modal and scroll lock`, async ({ page }) => {
  await openUi(page, overlay('dialog', 'outer', overlay('dialog', 'inner')));
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'auto';
    window.outerCloses = 0; window.innerCloses = 0;
    document.querySelector('#outer').addEventListener('cx-dialog:close', event => { if (event.target.id === 'outer') window.outerCloses++; });
    document.querySelector('#inner').addEventListener('close', () => window.innerCloses++);
  });
  await page.locator('#outer-trigger').click();
  await page.locator('#inner-trigger').click();
  await page.evaluate(method => method === 'native' ? document.querySelector('#inner').close() : CanopyX.dialog('#inner').close(), method);
  await expect.poll(() => page.evaluate(() => window.innerCloses)).toBe(1);
  await expect(page.locator('#inner')).not.toBeVisible();
  await expect(page.locator('#outer')).toBeVisible();
  expect(await page.locator('#outer').evaluate(el => el.matches(':modal'))).toBe(true);
  expect(await page.evaluate(() => ({ closes: window.outerCloses, overflow: document.documentElement.style.overflow }))).toEqual({ closes: 0, overflow: 'hidden' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#outer')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('auto');
});

for (const kind of ['dialog', 'drawer']) for (const sequence of ['open/open', 'close/open', 'native-close/open']) {
  test(`${kind} retains its new opening after queued ${sequence} close events`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openUi(page, overlay(kind, 'rapid', '<label>Name<input></label><button id="cycle">Reopen</button>'));
    await page.evaluate(({ kind, sequence }) => {
      document.documentElement.style.overflow = 'auto';
      const api = CanopyX[kind]('#rapid'), element = api.element;
      window.queuedCloses = 0; window.hostCloses = 0; window.nativeDismissals = 0;
      document.addEventListener('close', event => { if (event.target === element) window.queuedCloses++; }, true);
      element.addEventListener('close', () => window.hostCloses++);
      element.addEventListener(`cx-${kind}:close`, event => { if (event.detail.reason === 'native') window.nativeDismissals++; });
      document.querySelector('#cycle').addEventListener('click', () => {
        if (sequence === 'close/open') api.close();
        else if (sequence === 'native-close/open') element.close();
        else api.open();
        api.open();
      });
    }, { kind, sequence });
    await page.locator('#rapid-trigger').click();
    await page.locator('#cycle').click();
    // Observe the real queued native event before checking the replacement opening.
    await expect.poll(() => page.evaluate(() => window.queuedCloses)).toBe(sequence === 'open/open' ? 2 : 1);
    await expect(page.locator('#rapid')).toBeVisible();
    await expect(page.locator('#rapid')).toHaveAttribute('data-state', 'open');
    expect(await page.locator('#rapid').evaluate(el => el.matches(':modal'))).toBe(true);
    expect(await page.evaluate(() => ({ host: window.hostCloses, native: window.nativeDismissals, overflow: document.documentElement.style.overflow })))
      .toEqual({ host: 0, native: 0, overflow: 'hidden' });
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.hostCloses)).toBe(1);
    await expect(page.locator('#rapid')).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('auto');
  });
}

const popover = `<button id="help-trigger">Settings help</button><div id="help" class="cx-popover" data-cx-popover data-cx-trigger="help-trigger" role="dialog" aria-labelledby="help-title" hidden>
  <h2 id="help-title">Settings help</h2><button>First choice</button><button>Last choice</button></div><button id="next">Next control</button>`;

test('Tab exits an anchored popover into the surrounding form', async ({ page }) => {
  await openUi(page, popover);
  await page.locator('#help-trigger').click();
  await page.getByRole('button', { name: 'Last choice' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#help')).not.toBeVisible();
  await expect(page.locator('#next')).toBeFocused();
  await page.locator('#help-trigger').click();
  await page.getByRole('button', { name: 'First choice' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#help-trigger')).toBeFocused();
});

test('Escape closes a nested popover before its dialog and retains modal scroll locking', async ({ page }) => {
  await openUi(page, overlay('dialog', 'outer', popover));
  await page.getByRole('button', { name: 'Open outer' }).click();
  await page.locator('#help-trigger').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help')).not.toBeVisible(); await expect(page.locator('#outer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  await expect(page.locator('#help-trigger')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#outer')).not.toBeVisible();
});

test('a tooltip survives pointer movement while focused and Escape dismisses it without reopening', async ({ page }) => {
  await openUi(page, '<button id="tip-trigger" aria-describedby="existing">Report format</button><span id="existing">Format options</span><div id="tip" class="cx-tooltip" data-cx-tooltip data-cx-trigger="tip-trigger" role="tooltip" hidden>Choose a report format</div>');
  await page.locator('#tip-trigger').focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.mouse.move(1200, 800);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.locator('#tip-trigger')).toHaveAttribute('aria-describedby', 'existing tip');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).not.toBeVisible();
  await expect(page.locator('#tip-trigger')).toBeFocused();
  await page.evaluate(() => {
    const added = document.createElement('span'); added.id = 'added'; added.textContent = 'Host description'; document.body.append(added);
    document.querySelector('#tip-trigger').setAttribute('aria-describedby', 'existing tip added');
    CanopyX.tooltip('#tip').destroy();
  });
  await expect(page.locator('#tip-trigger')).toHaveAttribute('aria-describedby', 'existing added');
});

test('body-mounted overlays retain scoped dark roles and restore component-owned values on destroy', async ({ page }) => {
  await openUi(page, `<section data-theme="dark" style="color-scheme:dark;--hfx-color-surface-raised:#172338;--hfx-color-text:#f7f9ff;--hfx-radius-overlay:19px">${popover}</section>`);
  await page.locator('#help-trigger').click();
  const popup = page.locator('#help');
  await expect(popup).toHaveCSS('background-color', 'rgb(23, 35, 56)');
  await expect(popup).toHaveCSS('color', 'rgb(247, 249, 255)');
  await expect(popup).toHaveCSS('border-radius', '19px');
  expect(await popup.evaluate(el => getComputedStyle(el).colorScheme)).toBe('dark');
  await page.evaluate(() => CanopyX.popover('#help').destroy());
  expect(await popup.evaluate(el => el.parentElement.tagName)).toBe('SECTION');
  expect(await popup.evaluate(el => el.style.getPropertyValue('--hfx-color-surface-raised'))).toBe('');
});

for (const kind of ['popover', 'tooltip']) for (const authored of [false, true]) {
  test(`${kind} retains scoped RTL and restores ${authored ? 'authored' : 'absent'} direction on close and destroy`, async ({ page }) => {
    const attributes = authored ? 'dir="auto" style="direction:inherit !important;text-align:start"' : '';
    await openUi(page, `<section id="rtl-scope" dir="rtl" style="direction:rtl"><button id="rtl-trigger">Help</button>
      <div id="rtl-overlay" class="cx-${kind}" data-cx-${kind} data-cx-trigger="rtl-trigger" role="${kind === 'tooltip' ? 'tooltip' : 'dialog'}" aria-label="Help" ${attributes} hidden>
        Help text${kind === 'popover' ? '<button>Choice</button>' : ''}</div></section>`);
    const popup = page.locator('#rtl-overlay');
    const directionState = () => popup.evaluate(el => ({ dir: el.getAttribute('dir'), direction: el.style.getPropertyValue('direction'),
      priority: el.style.getPropertyPriority('direction'), align: el.style.textAlign }));
    const before = await directionState();
    for (const action of ['close', 'destroy']) {
      await page.evaluate(kind => CanopyX[kind]('#rtl-overlay').open(), kind);
      await expect(popup).toBeVisible();
      expect(await popup.evaluate(el => el.parentElement.tagName)).toBe('MAIN');
      await expect(popup).toHaveCSS('direction', 'rtl');
      await expect(popup).toHaveAttribute('dir', 'rtl');
      await page.evaluate(({ kind, action }) => CanopyX[kind]('#rtl-overlay')[action](), { kind, action });
      await expect(popup).not.toBeVisible();
      expect(await popup.evaluate(el => el.parentElement.id)).toBe('rtl-scope');
      expect(await directionState()).toEqual(before);
    }
  });
}

for (const kind of ['popover', 'tooltip']) test(`${kind} preserves author direction changes made while portalled`, async ({ page }) => {
  await openUi(page, `<section id="rtl-scope" dir="rtl"><button id="rtl-trigger">Help</button>
    <div id="rtl-overlay" data-cx-${kind} data-cx-trigger="rtl-trigger" role="${kind === 'tooltip' ? 'tooltip' : 'dialog'}" aria-label="Help" hidden>Help text</div></section>`);
  for (const action of ['close', 'destroy']) {
    await page.evaluate(kind => CanopyX[kind]('#rtl-overlay').open(), kind);
    await expect(page.locator('#rtl-overlay')).toHaveCSS('direction', 'rtl');
    await page.evaluate(({ kind, action }) => {
      const element = document.querySelector('#rtl-overlay');
      element.setAttribute('dir', 'ltr'); element.style.setProperty('direction', 'ltr', 'important');
      CanopyX[kind]('#rtl-overlay')[action]();
    }, { kind, action });
    await expect(page.locator('#rtl-overlay')).toHaveAttribute('dir', 'ltr');
    expect(await page.locator('#rtl-overlay').evaluate(el => [el.style.direction, el.style.getPropertyPriority('direction'), el.parentElement.id]))
      .toEqual(['ltr', 'important', 'rtl-scope']);
    if (action === 'close') await page.locator('#rtl-overlay').evaluate(el => { el.removeAttribute('dir'); el.style.removeProperty('direction'); });
  }
});

test('dialog cancellation can be prevented and destroy still releases its modal resources', async ({ page }) => {
  await openUi(page, overlay('dialog', 'guarded'), `window.dialogApi=CanopyX.dialog('#guarded');document.querySelector('#guarded').addEventListener('cx-dialog:cancel',event=>event.preventDefault());`);
  await page.getByRole('button', { name: 'Open guarded' }).click();
  await page.keyboard.press('Escape'); await expect(page.locator('#guarded')).toBeVisible();
  await page.evaluate(() => window.dialogApi.destroy());
  await expect(page.locator('#guarded')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
});

test('dialog structure and focus states pass accessibility checks', async ({ page }) => {
  await openUi(page, overlay('dialog', 'accessible'));
  await page.getByRole('button', { name: 'Open accessible' }).click();
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
});
