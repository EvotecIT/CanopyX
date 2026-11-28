import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openUi } from './ui-support.mjs';

const overlay = (kind, id, body = '<label>Record name<input value="Example"></label>', extra = '') =>
  `<button id="${id}-trigger" aria-controls="${id}" aria-expanded="false">Open ${id}</button>
  <dialog id="${id}" class="cx-${kind}" data-cx-${kind} data-cx-trigger="${id}-trigger" data-side="end" data-size="md" aria-labelledby="${id}-title" ${extra}>
    <header data-cx-part="header"><h2 id="${id}-title">${id} settings</h2><button class="cx-overlay-close" data-cx-close aria-label="Close"></button></header>
    <div data-cx-part="body">${body}</div><footer data-cx-part="footer"><button data-cx-cancel>Cancel</button><button>Save</button></footer>
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
    // The phone sheet slides in; a click aimed at #cycle mid-slide lands on whatever moved under the point.
    await page.locator('#rapid').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    await page.locator('#cycle').click();
    // Observe the real queued native event before checking the replacement opening. Opening an open overlay keeps it open.
    await expect.poll(() => page.evaluate(() => window.queuedCloses)).toBe(sequence === 'open/open' ? 0 : 1);
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

for (const ratio of [1, 2]) test.describe(`device pixel ratio ${ratio}`, () => {
  test.use({ deviceScaleFactor: ratio });
  test('an anchored popover opens on whole device pixels next to a fractional trigger', async ({ page }) => {
    await openUi(page, `<div style="padding:13.37px 0 0 27.41px">${popover}</div>`);
    await page.locator('#help-trigger').click();
    await expect(page.locator('#help')).toBeVisible();
    const edges = await page.locator('#help').evaluate(async element => {
      // Measured after the opening animation, whose scale would move the edges.
      await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
      const box = element.getBoundingClientRect(), ratio = devicePixelRatio;
      return [box.left * ratio, box.top * ratio];
    });
    for (const edge of edges) expect(Math.abs(edge - Math.round(edge))).toBeLessThan(0.01);
  });
});

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

test('overlays, menus and tooltips consume shared chrome roles', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const menu = `<button id="actions-trigger">Actions</button>
    <div id="actions" class="cx-menu" data-cx-menu data-cx-trigger="actions-trigger" role="menu" popover="manual" hidden>
      <button class="cx-menu-item" role="menuitem" tabindex="-1">Inspect record</button></div>`;
  for (const hosted of [false, true]) {
    const roles = hosted ? 'style="--hfx-radius-overlay:19px;--hfx-elevation-2:0 4px 12px rgb(1,2,3);--hfx-color-surface:#e6f0fa;--hfx-color-text:#123456;--hfx-color-border-strong:#456789;--hfx-type-small-size:15px;--hfx-type-small-line:1.6;--hfx-space-2:9px;--hfx-space-3:13px"' : '';
    const tooltip = '<button id="tip-trigger">Report format</button><div id="tip" class="cx-tooltip" data-cx-tooltip data-cx-trigger="tip-trigger" role="tooltip" hidden>Choose a report format</div>';
    await openUi(page, `<section ${roles}>${overlay('dialog', 'record')}${overlay('drawer', 'details')}${popover}${menu}${tooltip}</section>`);
    for (const [id, radius] of [['record', '10px'], ['details', '0px'], ['help', '10px'], ['actions', '10px'], ['tip', '10px']]) {
      await page.locator(`#${id}-trigger`).click();
      const surface = page.locator(`#${id}`);
      await expect(surface).toBeVisible();
      await expect(surface).toHaveCSS('border-radius', hosted && id !== 'details' ? '19px' : radius);
      await expect(surface).toHaveCSS('box-shadow', hosted ? 'rgb(1, 2, 3) 0px 4px 12px 0px' :
        'rgba(22, 24, 28, 0.05) 0px 1px 2px 0px, rgba(22, 24, 28, 0.18) 0px 6px 18px -10px');
      if (id === 'tip') {
        await expect(surface).toHaveCSS('background-color', hosted ? 'rgb(230, 240, 250)' : 'rgb(255, 255, 255)');
        await expect(surface).toHaveCSS('color', hosted ? 'rgb(18, 52, 86)' : 'rgb(22, 24, 28)');
        await expect(surface).toHaveCSS('border', hosted ? '1px solid rgb(69, 103, 137)' : '1px solid rgb(205, 208, 213)');
        await expect(surface).toHaveCSS('font-size', hosted ? '15px' : '13px');
        await expect.poll(() => surface.evaluate(element => parseFloat(getComputedStyle(element).lineHeight))).toBeCloseTo(hosted ? 24 : 18.2, 4);
        await expect(surface).toHaveCSS('padding', hosted ? '9px 13px' : '8px 12px');
      }
      await page.keyboard.press('Escape');
      await expect(surface).toBeHidden();
    }
  }
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

// A drawer the host creates with options; the declarative mount leaves it alone.
const reader = `<button id="first">Record 1</button><button id="second">Record 2</button>
  <dialog id="reader" class="cx-drawer" data-side="end" aria-labelledby="reader-title">
    <header data-cx-part="header"><h2 id="reader-title">Record</h2><button class="cx-overlay-close" data-cx-close>Close</button></header>
    <div data-cx-part="body"></div></dialog>`;
const openReader = async (page, options = '{}', before = '') => {
  await openUi(page, reader, `${before} window.reader = CanopyX.drawer('#reader', ${options});`);
  await page.evaluate(() => window.reader.ready);
};

test('opening an open drawer swaps its content and focus return without closing it', async ({ page }) => {
  await openReader(page);
  await page.evaluate(() => {
    window.closes = 0; document.querySelector('#reader').addEventListener('cx-drawer:close', () => window.closes++);
    window.reader.open({ content: '<p>First record</p>', returnFocus: document.querySelector('#first') });
    window.reader.open({ content: '<p>Second record</p>', returnFocus: document.querySelector('#second') });
  });
  await expect(page.locator('#reader')).toContainText('Second record');
  await page.evaluate(() => window.reader.setContent('<p>Second record, edited</p>'));
  await expect(page.locator('#reader')).toContainText('Second record, edited');
  expect(await page.evaluate(() => window.closes)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#reader')).not.toBeVisible();
  await expect(page.locator('#second')).toBeFocused();
});

test('a drawer loader shows a busy body, abandons a superseded record and retries a failure', async ({ page }) => {
  await openReader(page);
  const drawer = page.locator('#reader');
  await page.evaluate(() => { window.signals = []; window.reader.open({ loader: signal => { window.signals.push(signal); return new Promise(() => {}); } }); });
  await expect(drawer).toHaveAttribute('aria-busy', 'true');
  await expect(drawer.getByRole('status')).toHaveText('Loading…');
  await page.evaluate(() => {
    window.attempts = 0;
    window.reader.open({ loader: async () => { if (++window.attempts === 1) throw new Error('Record unavailable'); return '<p>Loaded record</p>'; } });
  });
  await expect(drawer.getByRole('alert')).toHaveText('Record unavailable');
  expect(await page.evaluate(() => [window.signals[0].aborted, document.querySelector('#reader').hasAttribute('aria-busy')])).toEqual([true, false]);
  await drawer.getByRole('button', { name: 'Retry' }).click();
  await expect(drawer).toContainText('Loaded record');
  expect(await page.evaluate(() => [window.attempts, window.reader.getState().loading])).toEqual([2, false]);
});

test('a drawer with an address pushes it on open, closes on Back and reopens on Forward', async ({ page }) => {
  await openReader(page, '{}', `history.replaceState({ host: 1 }, '', '#overview');`);
  const drawer = page.locator('#reader');
  await page.evaluate(() => window.reader.open({ content: '<p>Record 7</p>', history: { url: '#record-7' } }));
  expect(await page.evaluate(() => [location.hash, history.state.cxOverlay])).toEqual(['#record-7', 'reader']);
  await page.goBack();
  await expect(drawer).not.toBeVisible();
  expect(await page.evaluate(() => [location.hash, history.state])).toEqual(['#overview', { host: 1 }]);
  await page.goForward();
  await expect(drawer).toContainText('Record 7');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#overview');
});

test('a page opened on a drawer address opens the drawer, and Back returns to the page without it', async ({ page, browserName }) => {
  await openReader(page, `{ history: { url: '#record-3', base: location.pathname }, loader: async () => '<p>Record 3</p>' }`,
    `history.replaceState(null, '', '#record-3');`);
  await expect(page.locator('#reader')).toContainText('Record 3');
  // Firefox adds no history entry for a push made without the reader's interaction, so there Back leaves the page.
  if (browserName === 'firefox') { expect(await page.evaluate(() => location.hash)).toBe('#record-3'); return; }
  await page.goBack();
  await expect(page.locator('#reader')).not.toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('record navigation shows Previous, Next and the position, and stops at the ends', async ({ page }) => {
  await openReader(page, '{ records: direction => window.steps.push(direction) }', 'window.steps = [];');
  const drawer = page.locator('#reader');
  await page.evaluate(() => window.reader.open({ content: '<p>Record</p>', position: { current: 1, total: 3 } }));
  await expect(drawer.locator('[data-cx-part="records"]')).toHaveText('1 of 3');
  await expect(drawer.getByRole('button', { name: 'Previous record' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('ArrowUp');
  await drawer.getByRole('button', { name: 'Next record' }).click();
  await page.keyboard.press('ArrowDown');
  await page.evaluate(() => window.reader.open({ position: { current: 3, total: 3 } }));
  await expect(drawer.locator('[data-cx-part="records"]')).toHaveText('3 of 3');
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => window.steps)).toEqual([1, 1]);
});

test('the close button keeps its label hidden under a host stylesheet that restyles buttons', async ({ page }) => {
  await openReader(page, '{}', `document.head.insertAdjacentHTML('beforeend', '<style>button { font: inherit; }</style>');`);
  await page.evaluate(() => window.reader.open({ content: '<p>Record</p>' }));
  expect(await page.locator('#reader .cx-overlay-close').evaluate(element => getComputedStyle(element).fontSize)).toBe('0px');
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
  // Axe sees the modal dialog once its entrance fade has finished, not while it is still transparent.
  await page.locator('#accessible').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
});

// Close and cancel buttons close the nearest overlay around them, or the one a data-cx-close names by id. Each row opens the
// overlays it names in order, dismisses one way, and checks which stay open and where the focus lands.
const closablePopover = (id, body = "") => `<button id="${id}-trigger" aria-controls="${id}" aria-haspopup="dialog" aria-expanded="false">Open ${id}</button>
  <div id="${id}" class="cx-popover" data-cx-popover data-cx-trigger="${id}-trigger" role="dialog" aria-labelledby="${id}-title" popover="manual" hidden>
    <h2 id="${id}-title">${id} settings</h2>${body}<button data-cx-close aria-label="Close">Close</button><button data-cx-cancel>Cancel</button>
    <button data-cx-close="${id}">Close by id</button></div>`;
// Two drawers on opposite sides, so the top one does not cover the lower one's buttons.
const SIBLINGS = (left = '', right = '') => overlay('drawer', 'left', left).replace('data-side="end"', 'data-side="start"') + overlay('drawer', 'right', right);
const SHADOW = `const host = document.getElementById("shadow-host"), root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<dialog id="shadowed" aria-labelledby="shadowed-title"><h2 id="shadowed-title">shadowed settings</h2><button data-cx-cancel>Cancel</button></dialog>';
  window.mounted = CanopyX.dialog(root.getElementById("shadowed")); return window.mounted.ready.then(() => window.mounted.open());`;
// Rows: markup, setup (page script run first), open (overlays opened by their triggers in order; scriptOpen activates the
// triggers without a pointer press, which would dismiss the top drawer as an outside press), dismiss ({ in, button } presses
// the button, { key } presses a key, { in, button, enter } focuses the button and presses Enter, { request } calls
// requestClose() on an overlay, { script } runs a page script, { press } presses and releases the pointer on a button without
// relying on its click, or on another role's element; without in, the button is found in the page), afterOpen (page script run after opening), closed and stays (overlays hidden or visible afterwards), focus (the focused element) and holds (a page expression that must be true; data-state is "closed" only after an opening closed).
const DISMISSALS = [
  { name: 'Close on a dialog nested in a drawer', markup: overlay('drawer', 'outer', overlay('dialog', 'inner')), open: ['outer', 'inner'],
    dismiss: { in: 'inner', button: 'Close' }, closed: ['inner'], stays: ['outer'], focus: 'inner-trigger' },
  { name: 'Cancel on a dialog nested in a drawer', markup: overlay('drawer', 'outer', overlay('dialog', 'inner')), open: ['outer', 'inner'],
    dismiss: { in: 'inner', button: 'Cancel' }, closed: ['inner'], stays: ['outer'], focus: 'inner-trigger' },
  { name: 'Escape on a dialog nested in a drawer', markup: overlay('drawer', 'outer', overlay('dialog', 'inner')), open: ['outer', 'inner'],
    dismiss: { key: 'Escape' }, closed: ['inner'], stays: ['outer'], focus: 'inner-trigger' },
  { name: 'Close on a popover nested in a drawer', markup: overlay('drawer', 'outer', closablePopover('pop')), open: ['outer', 'pop'],
    dismiss: { in: 'pop', button: 'Close' }, closed: ['pop'], stays: ['outer'], focus: 'pop-trigger' },
  { name: 'Cancel on a popover nested in a drawer', markup: overlay('drawer', 'outer', closablePopover('pop')), open: ['outer', 'pop'],
    dismiss: { in: 'pop', button: 'Cancel' }, closed: ['pop'], stays: ['outer'], focus: 'pop-trigger' },
  { name: 'a close that names its popover by id', markup: overlay('drawer', 'outer', closablePopover('pop')), open: ['outer', 'pop'],
    dismiss: { in: 'pop', button: 'Close by id' }, closed: ['pop'], stays: ['outer'], focus: 'pop-trigger' },
  { name: 'a close in a nested dialog that names the outer drawer', open: ['outer', 'inner'],
    markup: overlay('drawer', 'outer', overlay('dialog', 'inner', '<button data-cx-close="outer">Close the drawer</button>')),
    dismiss: { in: 'inner', button: 'Close the drawer' }, closed: ['outer'], stays: [] },
  { name: 'a close whose id names no overlay closes the nearest one', markup: overlay('drawer', 'outer', '<button data-cx-close="nowhere">Close missing</button>'),
    open: ['outer'], dismiss: { in: 'outer', button: 'Close missing' }, closed: ['outer'], stays: [] },
  { name: 'a close whose id names a plain element closes the nearest one', open: ['outer'],
    markup: overlay('drawer', 'outer', '<p id="note">A note.</p><button data-cx-close="note">Close note</button>'),
    dismiss: { in: 'outer', button: 'Close note' }, closed: ['outer'], stays: [] },
  { name: 'Cancel inside a host wrapper that stops click propagation', markup: '<div id="wrap">' + overlay('drawer', 'outer') + '</div>',
    setup: 'document.getElementById("wrap").addEventListener("click", event => event.stopPropagation());',
    open: ['outer'], dismiss: { in: 'outer', button: 'Cancel' }, closed: ['outer'], stays: [] },
  { name: 'a pressed close in the lower drawer that names the top one', markup: SIBLINGS('<button data-cx-close="right">Close the right drawer</button>'),
    open: ['left', 'right'], scriptOpen: true, dismiss: { in: 'left', button: 'Close the right drawer' }, closed: ['right'], stays: ['left'] },
  { name: 'Cancel on a plain dialog mounted from code', mounted: 'plain', open: [],
    markup: '<dialog id="plain" aria-labelledby="plain-title"><h2 id="plain-title">plain settings</h2><button data-cx-cancel>Cancel</button></dialog>',
    dismiss: { in: 'plain', button: 'Cancel' }, closed: ['plain'], stays: [] },
  { name: 'a pressed named close in the page toolbar closes its drawer', markup: overlay('drawer', 'outer') + '<button data-cx-close="outer">Close from the page</button>',
    open: ['outer'], dismiss: { button: 'Close from the page' }, closed: ['outer'], stays: [] },
  { name: 'Enter on a named close in the page toolbar closes its drawer', markup: overlay('drawer', 'outer') + '<button data-cx-close="outer">Close from the page</button>',
    open: ['outer'], dismiss: { button: 'Close from the page', enter: true }, closed: ['outer'], stays: [] },
  { name: 'a host that destroys a nested popover from its close event keeps the drawer open', markup: overlay('drawer', 'outer', closablePopover('pop')),
    setup: 'document.getElementById("pop").addEventListener("cx-popover:close", () => CanopyX.popover("#pop").destroy());',
    open: ['outer', 'pop'], dismiss: { in: 'pop', button: 'Close' }, closed: ['pop'], stays: ['outer'] },
  { name: 'a cancel event that bubbles from a file input leaves the nested popover open', open: ['outer', 'pop'],
    markup: overlay('drawer', 'outer', '<input type="file" id="upload" aria-label="Upload">' + closablePopover('pop')),
    dismiss: { script: 'document.getElementById("upload").dispatchEvent(new Event("cancel", { bubbles: true }));' }, closed: [], stays: ['outer', 'pop'] },
  { name: 'a named close in a page toolbar that stops click propagation still closes its drawer', open: ['outer'],
    markup: overlay('drawer', 'outer') + '<div id="toolbar"><button data-cx-close="outer">Close from the page</button></div>',
    setup: 'document.getElementById("toolbar").addEventListener("click", event => event.stopPropagation());',
    dismiss: { button: 'Close from the page' }, closed: ['outer'], stays: [] },
  { name: 'a press on a disabled named close outside the drawer dismisses it as an outside press', open: ['outer'],
    markup: overlay('drawer', 'outer') + '<button data-cx-close="outer" disabled>Close from the page</button>',
    dismiss: { press: 'Close from the page' }, closed: ['outer'], stays: [] },
  { name: 'Close on a drawer also closes its popover triggered from a shadow root inside it', open: ['outer'],
    markup: overlay('drawer', 'outer', '<div id="trigger-host"></div><div id="shadow-pop" class="cx-popover" role="dialog" aria-label="Shadow popover" hidden><p>Popover</p></div>'),
    afterOpen: `const root = document.getElementById("trigger-host").attachShadow({ mode: "open" }); root.innerHTML = '<button>Open shadow popover</button>';
      window.pop = CanopyX.popover(document.getElementById("shadow-pop"), { trigger: root.querySelector("button") });
      return window.pop.ready.then(() => window.pop.open());`, opened: 'shadow-pop',
    dismiss: { in: 'outer', button: 'Close' }, closed: ['outer', 'shadow-pop'], stays: [] },
  { name: 'a self-named close in one of two same-id drawers from separate shadow roots closes its own drawer', open: [],
    markup: '<div id="first-host"></div><div id="second-host"></div>',
    setup: `const drawers = ["first", "second"].map(name => {
        const root = document.getElementById(name + "-host").attachShadow({ mode: "open" });
        root.innerHTML = '<div id="dup" class="cx-drawer" role="dialog" aria-label="' + name + ' drawer" data-side="' + (name === "first" ? "start" : "end") + '"><button data-cx-close="dup">Close ' + name + '</button></div>';
        return CanopyX.drawer(root.getElementById("dup"));
      });
      return Promise.all(drawers.map(drawer => drawer.ready)).then(() => drawers.forEach(drawer => drawer.open()));`,
    dismiss: { button: 'Close second' }, closedLabels: ['second drawer'], staysLabels: ['first drawer'] },
  { name: 'a click event dispatched again after reopening still closes the drawer', open: ['outer'], markup: overlay('drawer', 'outer'),
    dismiss: { script: `const cancel = document.querySelector("#outer [data-cx-cancel]"), click = new MouseEvent("click", { bubbles: true });
      cancel.dispatchEvent(click); document.getElementById("outer-trigger").click(); cancel.dispatchEvent(click);` }, closed: ['outer'], stays: [] },
  { name: 'a close in a nested shadow root naming its enclosing shadow drawer leaves a same-id page drawer open', open: [],
    markup: '<div id="dup" class="cx-drawer" role="dialog" aria-label="page drawer" data-side="end"><p>Page drawer</p></div><div id="first-host"></div>',
    setup: `const outer = document.getElementById("first-host").attachShadow({ mode: "open" });
      outer.innerHTML = '<div id="dup" class="cx-drawer" role="dialog" aria-label="shadow drawer" data-side="start"><div id="inner-host"></div></div>';
      const inner = outer.getElementById("inner-host").attachShadow({ mode: "open" });
      inner.innerHTML = '<dialog id="nested" aria-label="nested dialog"><button data-cx-close="dup">Close the shadow drawer</button></dialog>';
      const views = [CanopyX.drawer(document.getElementById("dup")), CanopyX.drawer(outer.getElementById("dup")), CanopyX.dialog(inner.getElementById("nested"))];
      return Promise.all(views.map(view => view.ready)).then(() => views.forEach(view => view.open()));`,
    // Enter, not a press: a press inside an overlay in a shadow root reads as outside it, as before (the follow-up issue).
    dismiss: { button: 'Close the shadow drawer', enter: true }, closedLabels: ['shadow drawer', 'nested dialog'], staysLabels: ['page drawer'] },
  { name: 'a press on a form field named matches outside the drawer dismisses it as an outside press', open: ['outer'],
    markup: overlay('drawer', 'outer') + '<form><input name="matches" aria-label="Matches"></form>',
    dismiss: { press: 'Matches', role: 'textbox' }, closed: ['outer'], stays: [] },
  { name: 'a click event dispatched again in a shadow root after reopening still closes the dialog', markup: '<div id="shadow-host"></div>', setup: SHADOW, open: [],
    dismiss: { script: `const cancel = document.getElementById("shadow-host").shadowRoot.querySelector("[data-cx-cancel]"), click = new MouseEvent("click", { bubbles: true });
      cancel.dispatchEvent(click); window.mounted.open(); cancel.dispatchEvent(click);` }, closed: ['shadowed'], stays: [] },
  { name: 'Close on a drawer closes its nested dialog in a form whose outside control is named parentNode', open: ['outer', 'inner'],
    setup: 'document.addEventListener("submit", event => event.preventDefault());',
    markup: overlay('drawer', 'outer', '<form id="named-form">' + overlay('dialog', 'inner') + '</form>') + '<input form="named-form" name="parentNode" aria-label="Parent">',
    dismiss: { script: 'document.querySelector("#outer > header [data-cx-close]").click();' }, closed: ['inner', 'outer'] },
  { name: 'Close on a drawer closes its nested dialog in a form whose own control is named parentNode', open: ['outer', 'inner'], scriptOpen: true,
    setup: 'document.addEventListener("submit", event => event.preventDefault());',
    // Read from the page: the test runner's own locators walk parentNode and loop on such a form.
    markup: overlay('drawer', 'outer', '<form><input name="parentNode" aria-label="Parent">' + overlay('dialog', 'inner') + '</form>'),
    dismiss: { script: 'document.querySelector("#outer > header [data-cx-close]").click();' }, holds: '!document.getElementById("inner").open && !document.getElementById("outer").open' },
  { name: 'a close slotted into a drawer in a closed shadow root closes that drawer, not a same-id page drawer', open: [],
    markup: '<div id="dup" class="cx-drawer" role="dialog" aria-label="page drawer" data-side="end"><p>Page drawer</p></div><div id="slot-host"><button data-cx-close="dup">Close slotted</button></div>',
    setup: `const root = document.getElementById("slot-host").attachShadow({ mode: "closed" });
      root.innerHTML = '<dialog id="dup" class="cx-drawer" aria-label="shadow drawer" data-side="start"><slot></slot></dialog>';
      window.page = CanopyX.drawer(document.getElementById("dup")); window.shadowDrawer = CanopyX.drawer(window.shadowElement = root.getElementById("dup"));
      return Promise.all([page.ready, shadowDrawer.ready]).then(() => { page.open(); shadowDrawer.open(); });`,
    dismiss: { button: 'Close slotted' }, staysLabels: ['page drawer'], holds: 'window.shadowElement.dataset.state === "closed"' },
  { name: 'Cancel on a dialog in a same-origin frame mounted through the page closes it', open: [], markup: '<iframe id="frame" title="Frame"></iframe>',
    setup: `const frame = document.getElementById("frame").contentDocument;
      frame.body.innerHTML = '<dialog id="framed" aria-label="framed dialog"><button data-cx-cancel>Cancel</button></dialog>';
      window.framed = CanopyX.dialog(frame.getElementById("framed")); return framed.ready.then(() => framed.open());`,
    dismiss: { script: 'document.getElementById("frame").contentDocument.querySelector("[data-cx-cancel]").click();' }, holds: 'document.getElementById("frame").contentDocument.getElementById("framed").dataset.state === "closed"' },
  { name: 'a press on a close naming a closed drawer outside the open one dismisses it as an outside press', open: ['outer'],
    markup: overlay('drawer', 'outer') + overlay('drawer', 'other') + '<button data-cx-close="other">Close other</button>',
    dismiss: { press: 'Close other' }, closed: ['outer'], stays: [] },
  { name: 'a click event dispatched again in a shadow root after its button moved deeper still closes the dialog', markup: '<div id="shadow-host"></div>', setup: SHADOW, open: [],
    dismiss: { script: `const cancel = document.getElementById("shadow-host").shadowRoot.querySelector("[data-cx-cancel]"), click = new MouseEvent("click", { bubbles: true });
      cancel.dispatchEvent(click); window.mounted.open(); const wrap = document.createElement("span"); cancel.before(wrap); wrap.append(cancel); cancel.dispatchEvent(click);` },
    closed: ['shadowed'], stays: [] },
  { name: 'a form-backed drawer with a field named getRootNode mounts and Cancel closes it', open: [],
    // Driven from the page: the test runner's own locators call getRootNode and would read the field.
    markup: '<form id="fd" class="cx-drawer" role="dialog" aria-label="form drawer" data-side="end" hidden><input name="getRootNode" aria-label="Root"><button type="button" data-cx-cancel>Cancel</button></form>',
    setup: 'window.fd = CanopyX.drawer(document.getElementById("fd")); return fd.ready.then(() => fd.open());',
    dismiss: { script: 'document.querySelector("#fd [data-cx-cancel]").click();' }, holds: 'document.getElementById("fd").dataset.state === "closed"' },
  { name: 'a click event dispatched again in a shadow root after its dialog moved out of a wrapper still closes it', markup: '<div id="shadow-host"></div>', open: [],
    setup: SHADOW.replace("root.innerHTML = '<dialog", "root.innerHTML = '<div><dialog").replace("</dialog>';", "</dialog></div>';"),
    dismiss: { script: `const root = document.getElementById("shadow-host").shadowRoot, cancel = root.querySelector("[data-cx-cancel]"), click = new MouseEvent("click", { bubbles: true });
      cancel.dispatchEvent(click); root.append(root.getElementById("shadowed")); window.mounted.open(); cancel.dispatchEvent(click);` }, closed: ['shadowed'], stays: [] },
  { name: 'Enter on a named close in a shadow toolbar whose root has a same-id heading closes the page drawer', open: ['outer'],
    markup: overlay('drawer', 'outer') + '<div id="tool-host"></div>', opened: 'outer-title',
    afterOpen: `const root = document.getElementById("tool-host").attachShadow({ mode: "open" });
      root.innerHTML = '<h2 id="outer">Heading</h2><button data-cx-close="outer">Close from the shadow toolbar</button>';`,
    dismiss: { button: 'Close from the shadow toolbar', enter: true }, closedLabels: ['outer settings'] },
  { name: 'Cancel slotted into a drawer through a slot a closed shadow root forwards closes the drawer', open: [],
    markup: '<div id="forward-host"><button data-cx-cancel>Cancel forwarded</button></div>',
    setup: `const closed = document.getElementById("forward-host").attachShadow({ mode: "closed" });
      closed.innerHTML = '<div id="inner-host"><slot></slot></div>';
      const open = closed.getElementById("inner-host").attachShadow({ mode: "open" });
      open.innerHTML = '<dialog id="forwarded" aria-label="forwarded drawer"><slot></slot></dialog>';
      window.forwardedElement = open.getElementById("forwarded"); window.forwarded = CanopyX.drawer(forwardedElement);
      return forwarded.ready.then(() => forwarded.open());`,
    dismiss: { script: 'document.querySelector("#forward-host [data-cx-cancel]").click();' }, holds: 'window.forwardedElement.dataset.state === "closed"' },
  { name: 'Cancel slotted into a dialog in a closed shadow root that its host removes on close leaves the popover around it open', open: ['pop'],
    markup: closablePopover('pop', '<div id="torn-host"><button data-cx-cancel>Cancel slotted</button></div>'), opened: 'pop',
    afterOpen: `const root = document.getElementById("torn-host").attachShadow({ mode: "closed" });
      root.innerHTML = '<dialog id="torn" aria-label="torn dialog"><slot></slot></dialog>';
      const element = root.getElementById("torn"), dialog = CanopyX.dialog(element);
      element.addEventListener("cx-dialog:close", () => { window.tornRemoved = true; dialog.destroy(); element.remove(); });
      return dialog.ready.then(() => dialog.open());`,
    dismiss: { button: 'Cancel slotted', enter: true }, stays: ['pop'], holds: 'window.tornRemoved === true' },
  { name: 'Enter on Cancel in a dialog mounted from code in a shadow root', markup: '<div id="shadow-host"></div>', setup: SHADOW, open: [],
    dismiss: { in: 'shadowed', button: 'Cancel', enter: true }, closed: ['shadowed'], stays: [] }
];
for (const row of DISMISSALS) test(`dismissal: ${row.name}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openUi(page, row.markup);
  if (row.setup) await page.evaluate(script => new Function(script)(), row.setup);
  // An overlay that lives in a shadow root is found through its host.
  const surface = id => id === 'shadow-drawer' ? page.locator('#slot-host').locator('#shadow-drawer') : page.locator('#' + id);
  if (row.mounted) await page.evaluate(id => { window.mounted = CanopyX.dialog('#' + id); return window.mounted.ready.then(() => window.mounted.open()); }, row.mounted);
  for (const id of row.open) {
    const trigger = page.locator('#' + id + '-trigger');
    if (row.scriptOpen) await trigger.evaluate(element => element.click()); else await trigger.click();
    await expect(surface(id)).toBeVisible();
  }
  if (row.afterOpen) { await page.evaluate(script => new Function(script)(), row.afterOpen); await expect(page.locator('#' + (row.opened || 'shadowed'))).toBeVisible(); }
  const { dismiss } = row;
  if (dismiss.key) await page.keyboard.press(dismiss.key);
  else if (dismiss.script) await page.evaluate(script => new Function(script)(), dismiss.script);
  else if (dismiss.press) {
    // A real press without a click: the disabled button produces no activation.
    const box = await page.getByRole(dismiss.role || 'button', { name: dismiss.press, exact: true }).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.up();
  }
  else if (dismiss.request) await surface(dismiss.request).evaluate(element => element.requestClose());
  else {
    const button = (dismiss.in ? surface(dismiss.in) : page).getByRole('button', { name: dismiss.button, exact: true }).first();
    if (dismiss.enter) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
  }
  for (const id of row.closed || []) await expect(surface(id)).toBeHidden();
  for (const id of row.stays || []) await expect(surface(id)).toBeVisible();
  for (const label of row.closedLabels || []) await expect(page.getByRole('dialog', { name: label })).toBeHidden();
  for (const label of row.staysLabels || []) await expect(page.getByRole('dialog', { name: label })).toBeVisible();
  if (row.focus) await expect(page.locator('#' + row.focus)).toBeFocused();
  if (row.holds) expect(await page.evaluate(expression => new Function('return ' + expression)(), row.holds)).toBe(true);
});
