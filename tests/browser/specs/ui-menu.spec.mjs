import { test, expect } from '@playwright/test';
import { uiPage, openUi } from './ui-support.mjs';

// Matches CanopyMenu.ToHtmlFragment(), including nested data-cx-menu roots.
const markup = `<button id="actions-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="actions">Actions</button>
<div id="actions" class="cx-menu" data-cx-menu role="menu" aria-labelledby="actions-trigger" data-cx-trigger="actions-trigger" data-placement="bottom-start" data-state="closed" popover="manual" hidden>
  <div class="cx-menu-group-label" role="presentation">View</div>
  <button class="cx-menu-item" role="menuitem" data-item-id="alpha" tabindex="-1"><span class="cx-menu-label">Alpha</span><kbd>Ctrl+A</kbd></button>
  <button class="cx-menu-item" role="menuitem" data-item-id="locked" aria-disabled="true" data-state="disabled" tabindex="-1"><span class="cx-menu-label">Locked</span></button>
  <button class="cx-menu-item" role="menuitemcheckbox" data-item-id="details" aria-checked="false" tabindex="-1"><span class="cx-menu-icon" aria-hidden="true"></span><span class="cx-menu-label">Details</span></button>
  <div class="cx-menu-separator" role="separator"></div>
  <button class="cx-menu-item" role="menuitemradio" data-item-id="compact" aria-checked="true" tabindex="-1"><span class="cx-menu-icon" aria-hidden="true">✓</span><span class="cx-menu-label">Compact</span></button>
  <button class="cx-menu-item" role="menuitemradio" data-item-id="comfortable" aria-checked="false" tabindex="-1"><span class="cx-menu-icon" aria-hidden="true"></span><span class="cx-menu-label">Comfortable</span></button>
  <button id="export-item" class="cx-menu-item" role="menuitem" data-item-id="export" aria-haspopup="menu" aria-expanded="false" aria-controls="export-menu" tabindex="-1"><span class="cx-menu-label">Export</span><span class="cx-menu-chevron" aria-hidden="true">›</span></button>
  <div id="export-menu" class="cx-menu" data-cx-menu role="menu" data-cx-trigger="export-item" aria-labelledby="export-item" data-placement="right" popover="manual" hidden>
    <button class="cx-menu-item" role="menuitem" data-item-id="csv" tabindex="-1"><span class="cx-menu-label">CSV</span></button>
    <button class="cx-menu-item" role="menuitem" data-item-id="json" tabindex="-1"><span class="cx-menu-label">JSON</span></button>
  </div>
  <button class="cx-menu-item" role="menuitem" data-item-id="remove" data-danger="true" tabindex="-1"><span class="cx-menu-label">Remove</span></button>
</div><button id="after">After menu</button>`;

const menuInit = `window.selected = []; window.checkStates = [];
window.menu = CanopyX.menu(document.querySelector('#actions'), { onSelect: item => {
  window.selected.push(item.id); if (item.checked !== undefined) window.checkStates.push(item.checked);
} });`;

async function stopClock(page) {
  await page.clock.install({ time: new Date('2026-10-23T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-23T12:00:01Z'));
}

test('menu trigger keys, wrapping, disabled focus and typeahead follow APG', async ({ page }) => {
  await openUi(page, markup, menuInit);
  const trigger = page.getByRole('button', { name: 'Actions', exact: true });
  await trigger.focus(); await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Remove' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Alpha' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Locked' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#actions')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.selected)).toEqual([]);
  await page.keyboard.press('End'); await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem', { name: 'Alpha' })).toBeFocused();
  await page.keyboard.press('c');
  await expect(page.getByRole('menuitemradio', { name: 'Compact', exact: true })).toBeFocused();
  await page.keyboard.press('c');
  await expect(page.getByRole('menuitemradio', { name: 'Comfortable' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('menuitem', { name: 'Alpha' })).toBeFocused();
});

test('checkbox toggles stay open and radios select exclusively before closing', async ({ page }) => {
  await openUi(page, markup, menuInit);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  const check = page.getByRole('menuitemcheckbox', { name: 'Details' });
  await check.focus(); await page.keyboard.press('Space');
  await expect(check).toHaveAttribute('aria-checked', 'true');
  await expect(check).toHaveAttribute('data-state', 'selected');
  await expect(page.locator('#actions')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(check).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('menuitemradio', { name: 'Comfortable' }).click();
  await expect(page.locator('#actions')).toBeHidden();
  await expect(page.locator('[data-item-id="compact"]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-item-id="comfortable"]')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => window.selected)).toEqual(['details', 'details', 'comfortable']);
  await expect.poll(() => page.evaluate(() => window.checkStates)).toEqual([true, false, true]);
});

for (const rtl of [false, true]) {
  test(`submenu arrows and Escape dismiss one shared stack level${rtl ? ' in RTL' : ''}`, async ({ page }) => {
    await openUi(page, `<div dir="${rtl ? 'rtl' : 'ltr'}">${markup}</div>`, menuInit);
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.locator('#export-item').focus();
    await page.keyboard.press(rtl ? 'ArrowLeft' : 'ArrowRight');
    await expect(page.getByRole('menuitem', { name: 'CSV', exact: true })).toBeFocused();
    await page.keyboard.press(rtl ? 'ArrowRight' : 'ArrowLeft');
    await expect(page.locator('#export-menu')).toBeHidden();
    await expect(page.locator('#export-item')).toBeFocused();
    await page.keyboard.press(rtl ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator('#export-menu')).toBeHidden();
    await expect(page.locator('#actions')).toBeVisible();
    await expect(page.locator('#export-item')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
  });
}

test('submenu actions close the entire menu and return to the root trigger', async ({ page }) => {
  await openUi(page, markup, menuInit);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.locator('#export-item').focus(); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#actions')).toBeHidden(); await expect(page.locator('#export-menu')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.selected)).toEqual(['csv']);
});

test('Tab leaves the menu from its trigger in both directions', async ({ page, browserName }) => {
  // WebKit on macOS reaches buttons with Alt+Tab, as Safari does without Full Keyboard Access.
  const tab = process.platform === 'darwin' && browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await openUi(page, `<button id="before">Before menu</button>${markup}`, menuInit);
  const trigger = page.getByRole('button', { name: 'Actions', exact: true });
  await trigger.click(); await page.keyboard.press(tab);
  await expect(page.locator('#actions')).toBeHidden(); await expect(page.locator('#after')).toBeFocused();
  await trigger.click(); await page.keyboard.press('Shift+' + tab);
  await expect(page.locator('#actions')).toBeHidden(); await expect(page.locator('#before')).toBeFocused();
});

test('hover waits 150ms and safe triangle preserves the submenu on diagonal travel', async ({ page }) => {
  await openUi(page, markup, menuInit);
  await stopClock(page);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.locator('#export-item').hover(); await page.clock.runFor(149);
  await expect(page.locator('#export-menu')).toBeHidden();
  await page.clock.runFor(1); await expect(page.locator('#export-menu')).toBeVisible();
  const parent = await page.locator('#export-item').boundingBox(), child = await page.locator('#export-menu').boundingBox();
  await page.mouse.move(parent.x + parent.width - 40, parent.y + parent.height / 2);
  // Cross a real sibling item inside the triangle towards the submenu's near edge.
  await page.mouse.move(parent.x + parent.width - 2, parent.y + parent.height + 2);
  await page.clock.runFor(150);
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.mouse.move(child.x + child.width / 2, child.y + child.height / 2);
  await page.clock.runFor(150);
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Remove' }).hover();
  await page.clock.runFor(150);
  await expect(page.locator('#export-menu')).toBeHidden();
});

test('refresh binds new entries and destroy removes trigger handlers and overlays', async ({ page }) => {
  await openUi(page, markup, menuInit);
  await page.evaluate(() => {
    const item = document.createElement('button'); item.setAttribute('role', 'menuitem');
    item.dataset.itemId = 'beta'; item.textContent = 'Beta'; document.querySelector('#actions').append(item);
    window.menu.refresh();
  });
  await page.getByRole('button', { name: 'Actions', exact: true }).click(); await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Beta' })).toBeFocused();
  await page.evaluate(() => window.menu.destroy());
  await expect(page.locator('#actions')).toBeHidden();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.locator('#actions')).toBeHidden();
});

const region = `<div id="region"><button data-row="one">Record one</button><a href="#destination">Record link</a>
<label>Query<input value="Editable"></label><span id="selection">Selected content</span></div>`;
const contextInit = `window.calls = []; window.choices = [];
window.disposeContext = CanopyX.contextMenu('[data-row]', (event, element) => {
  window.calls.push([event.type, element.dataset.row]);
  return [{ id: 'inspect', label: 'Inspect ' + element.textContent, badge: '3' },
    { id: 'toggle', label: 'Show details', checked: false }, { id: 'locked', label: 'Locked action', disabled: true }];
}, { onSelect: item => window.choices.push(item.id) });
window.disposeContext.ready.then(() => { window.contextReady = true; });`;

test('delegated context menus use the current matched element and keyboard anchor', async ({ page }) => {
  await openUi(page, region, contextInit); await page.waitForFunction(() => window.contextReady);
  await page.evaluate(() => {
    const row = document.createElement('button'); row.dataset.row = 'two'; row.textContent = 'Record two';
    document.querySelector('#region').append(row);
  });
  await page.getByRole('button', { name: 'Record two' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Inspect Record two 3' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.choices)).toEqual(['inspect']);
  const row = page.getByRole('button', { name: 'Record one' });
  await row.focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Inspect Record one 3' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(row).toBeFocused();
  await row.dispatchEvent('keydown', { key: 'ContextMenu', bubbles: true });
  await expect(page.getByRole('menuitem', { name: 'Inspect Record one 3' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.calls)).toEqual([['contextmenu', 'two'], ['keydown', 'one'], ['keydown', 'one']]);
});

test('a right-click that selects the word under the pointer, as on macOS, still opens the menu and drops that selection', async ({ page }) => {
  await openUi(page, region, contextInit + `
    // macOS selects the word under the pointer when the secondary button goes down, before contextmenu.
    document.addEventListener('mousedown', event => {
      if (event.button !== 2) return;
      const range = document.createRange(); range.selectNodeContents(event.target);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });`);
  await page.waitForFunction(() => window.contextReady);
  await page.getByRole('button', { name: 'Record one' }).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Inspect Record one 3' })).toBeFocused();
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
  // Text the user had selected before the press still keeps the browser's own menu.
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('#selection'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.getByRole('button', { name: 'Record one' }).click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('context menus preserve links, editable controls, selected text and Shift right-click', async ({ page }) => {
  await openUi(page, region, `window.disposeContext = CanopyX.contextMenu(document.querySelector('#region'), [{ id: 'custom', label: 'Custom action' }]);
    window.disposeContext.ready.then(() => window.contextReady = true);`);
  await page.waitForFunction(() => window.contextReady);
  const outcomes = await page.evaluate(() => {
    const fire = (target, shiftKey = false) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, shiftKey });
      target.dispatchEvent(event); return event.defaultPrevented;
    };
    const result = [fire(document.querySelector('a')), fire(document.querySelector('input')), fire(document.querySelector('[data-row]'), true)];
    const range = document.createRange(); range.selectNodeContents(document.querySelector('#selection'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    result.push(fire(document.querySelector('[data-row]'))); getSelection().removeAllRanges(); return result;
  });
  expect(outcomes).toEqual([false, false, false, false]);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('context disposer removes delegated listeners and restores target attributes', async ({ page }) => {
  await openUi(page, region, contextInit); await page.waitForFunction(() => window.contextReady);
  const row = page.getByRole('button', { name: 'Record one' });
  await row.click({ button: 'right' }); await expect(page.getByRole('menu')).toBeVisible();
  await page.evaluate(() => window.disposeContext());
  await expect(page.getByRole('menu')).toHaveCount(0); await expect(row).not.toHaveAttribute('aria-controls');
  await row.click({ button: 'right' }); await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(1);
});

test('touch long-press opens the same menu in a modal bottom sheet at 500ms', async ({ page }) => {
  await openUi(page, region, contextInit); await page.waitForFunction(() => window.contextReady);
  await stopClock(page);
  const row = page.getByRole('button', { name: 'Record one' });
  await row.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 20, clientY: 20, bubbles: true });
  await page.clock.runFor(499); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.getByRole('dialog')).toHaveAttribute('data-side', 'bottom');
  await expect(page.getByRole('dialog')).toHaveJSProperty('open', true);
  await expect(page.getByRole('menuitem', { name: 'Inspect Record one 3' })).toBeFocused();
  await page.getByRole('menuitemcheckbox', { name: 'Show details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden(); await expect(row).toBeFocused();
});

for (const cancel of ['pointermove', 'pointerup', 'pointercancel', 'scroll']) {
  test(`touch ${cancel} cancels the pending long-press`, async ({ page }) => {
    await openUi(page, region, contextInit); await page.waitForFunction(() => window.contextReady);
    await stopClock(page); const row = page.getByRole('button', { name: 'Record one' });
    await row.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 20, clientY: 20, bubbles: true });
    await page.clock.runFor(300);
    await row.dispatchEvent(cancel, { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 20, bubbles: true });
    await page.clock.runFor(500); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(0);
  });
}

test('shared phone picker keeps badges and radios and delegates selection to its host', async ({ page }) => {
  // Exercise the helper through its real tabs consumer; UI_TOOLS stays private.
  const tabs = `<div id="sections" class="cx-tabs" data-cx-tabs style="inline-size:220px">
    <div role="tablist" aria-label="Sections">
      <button class="cx-tab" id="tab-a" role="tab" data-tab-id="a" aria-controls="panel-a" aria-selected="true"><span class="cx-tab-label">Overview</span></button>
      <button class="cx-tab" id="tab-b" role="tab" data-tab-id="b" aria-controls="panel-b" aria-selected="false"><span class="cx-tab-label">Checks</span><span class="cx-tab-badge">3</span></button>
      <button class="cx-tab" id="tab-c" role="tab" data-tab-id="c" aria-controls="panel-c" aria-selected="false" aria-disabled="true"><span class="cx-tab-label">Locked</span></button>
    </div><section id="panel-a" role="tabpanel" aria-labelledby="tab-a">Overview content</section>
    <section id="panel-b" role="tabpanel" aria-labelledby="tab-b">Checks content</section>
    <section id="panel-c" role="tabpanel" aria-labelledby="tab-c">Locked content</section></div>`;
  await openUi(page, tabs);
  const picker = page.locator('.cx-tabs-phone-picker');
  await expect(picker).toBeVisible(); await expect(picker).toHaveAttribute('data-hfx-part', 'picker');
  await picker.getByRole('button').click();
  await expect(page.getByRole('menuitemradio', { name: 'Overview', exact: true })).toHaveAttribute('aria-checked', 'true');
  const locked = page.getByRole('menuitemradio', { name: 'Locked', exact: true });
  await locked.focus(); await page.keyboard.press('Enter'); await expect(locked).toBeFocused();
  await page.getByRole('menuitemradio', { name: 'Checks 3' }).click();
  await expect(picker.getByRole('button')).toHaveAttribute('aria-label', 'Section Checks 3');
  await expect(picker.locator('.cx-picker-badge')).toHaveText('3');
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toBeVisible();
});

for (const forcedColors of ['none', 'active']) {
  test(`menu item radii stay nonnegative with zero overlay radius in forced colors ${forcedColors}`, async ({ page }) => {
    await page.emulateMedia({ forcedColors });
    await openUi(page, markup, menuInit);
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    const item = page.getByRole('menuitem', { name: 'Alpha' });
    for (const radius of ['', 'var(--hfx-radius-none)']) {
      await page.locator('#actions').evaluate((menu, value) => {
        if (value) menu.style.setProperty('--hfx-radius-overlay', value);
        else menu.style.removeProperty('--hfx-radius-overlay');
      }, radius);
      const corners = await item.evaluate(element => {
        const style = getComputedStyle(element);
        return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].map(value => Number.parseFloat(value));
      });
      for (const corner of corners) {
        expect(Number.isFinite(corner)).toBe(true);
        expect(corner).toBeGreaterThanOrEqual(0);
      }
    }
  });
}

test('menu overlays are omitted from print output', async ({ page }) => {
  await page.setContent(await uiPage(markup));
  await page.evaluate(() => CanopyX.menu(document.querySelector('#actions')).ready);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.locator('#actions')).toBeVisible();
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('#actions')).toBeHidden();
});
