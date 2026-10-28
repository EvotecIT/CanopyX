import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 1280, height: 900 } });

// Public tab/step markup, with enough wide labels to force the More picker.
function navigation(kind = 'tabs', bodies = [], selected = 0, count = 3) {
  const entries = Array.from({ length: count }, (_, i) => ({ id: 's' + i, label: 'Section ' + i }));
  const tabs = kind === 'tabs';
  return `<div id="view" class="${tabs ? 'cx-tabs' : 'cx-stepper-host'}" data-cx-${kind} data-print="all" data-mode="interactive">
    <${tabs ? 'div' : 'ol'} class="${tabs ? 'cx-tablist' : 'cx-stepper'}" ${tabs ? 'role="tablist"' : ''} aria-label="Sections">
    ${entries.map((item, i) => tabs
      ? `<button type="button" role="tab" class="cx-tab" style="min-width:180px" id="tab-${item.id}" data-tab-id="${item.id}"
          aria-controls="panel-${item.id}" aria-selected="${i === selected}"><span class="cx-tab-label">${item.label}</span></button>`
      : `<li class="cx-step" data-step-id="${item.id}" data-state="${i === selected ? 'current' : 'upcoming'}" ${i === selected ? 'aria-current="step"' : ''}>
          <span class="cx-step-marker">${i + 1}</span><span class="cx-step-label">${item.label}</span></li>`).join('')}
    </${tabs ? 'div' : 'ol'}>
    ${entries.map((item, i) => `<section id="panel-${item.id}" class="${tabs ? 'cx-tabpanel' : 'cx-step-panel'}"
      ${tabs ? `role="tabpanel" aria-labelledby="tab-${item.id}"` : `aria-labelledby="heading-${item.id}"`}>
      <h3 id="heading-${item.id}" class="cx-tabpanel-heading" data-hfx-part="title">${item.label}</h3>
      ${bodies[i] ?? `<p>Body ${i}</p>`}</section>`).join('')}</div>`;
}

const init = (kind, options = '{}', extra = '') => `window.api = CanopyX.${kind}('#view', ${options}); ${extra}`;
const triggerFor = variant => variant === 'more' ? '.cx-tabs-more .cx-picker-trigger'
  : variant === 'phone-tabs' ? '.cx-tabs-phone-picker .cx-picker-trigger' : '.cx-stepper-phone .cx-picker-trigger';
async function openPicker(page, variant) {
  const trigger = page.locator(triggerFor(variant));
  await expect(trigger).toBeVisible(); await trigger.click();
  return page.locator('#' + await trigger.getAttribute('aria-controls'));
}
async function choose(page, variant, index) {
  const menu = await openPicker(page, variant);
  await menu.getByRole('menuitemradio', { name: 'Section ' + index, exact: true }).click();
}
async function pickerFixture(page, variant, beforeChange) {
  const kind = variant === 'phone-stepper' ? 'stepper' : 'tabs';
  const selected = variant === 'more' ? 6 : 0;
  await openUi(page, `<div style="width:${variant === 'more' ? 700 : 390}px">${navigation(kind, [], selected, variant === 'more' ? 8 : 3)}</div>`,
    init(kind, `{ linear: false, collapse: '${variant === 'more' ? 'none' : 'picker'}', overflow: 'menu', beforeChange: ${beforeChange} }`));
  return selected;
}

for (const variant of ['phone-tabs', 'phone-stepper', 'more']) {
  for (const outcome of ['event-cancel', 'guard-false', 'guard-reject']) {
    test(`${variant} picker restores the committed choice after ${outcome}`, async ({ page }) => {
      const selected = await pickerFixture(page, variant, outcome === 'event-cancel' ? 'undefined'
        : `(_from, to) => new Promise((resolve, reject) => { (window.guards ||= {})[to.id] = { resolve, reject }; })`);
      if (outcome === 'event-cancel') await page.evaluate(() => document.querySelector('#view').addEventListener(
        'cx-' + (document.querySelector('#view').hasAttribute('data-cx-tabs') ? 'tabs' : 'stepper') + ':beforechange', event => event.preventDefault()));
      const target = variant === 'more' ? 7 : 1;
      await choose(page, variant, target);
      const menu = await openPicker(page, variant);
      await expect(menu.getByRole('menuitemradio', { name: 'Section ' + selected, exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(menu.getByRole('menuitemradio', { name: 'Section ' + target, exact: true })).toHaveAttribute('aria-checked', 'false');
      if (outcome !== 'event-cancel') {
        await page.evaluate(({ target, outcome }) => outcome === 'guard-false'
          ? guards['s' + target].resolve(false) : guards['s' + target].reject(new Error('Leave rejected')), { target, outcome });
      }
      expect(await page.evaluate(() => api.getSelected())).toBe('s' + selected);
      await expect(page.locator('#panel-s' + selected)).toBeVisible();
      await expect(menu.getByRole('menuitemradio', { name: 'Section ' + selected, exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(menu.getByRole('menuitemradio', { name: 'Section ' + target, exact: true })).toHaveAttribute('data-state', '');
    });
  }
  test(`${variant} picker keeps the latest committed choice after an older guard settles`, async ({ page }) => {
    await pickerFixture(page, variant,
      `(_from, to) => new Promise(resolve => { (window.guards ||= {})[to.id] = resolve; })`);
    const older = variant === 'more' ? 5 : 1, newer = variant === 'more' ? 7 : 2;
    await choose(page, variant, older); await choose(page, variant, newer);
    await page.evaluate(newer => guards['s' + newer](true), newer);
    await expect(page.locator('#panel-s' + newer)).toBeVisible();
    await page.evaluate(older => guards['s' + older](false), older);
    const menu = await openPicker(page, variant);
    await expect(menu.getByRole('menuitemradio', { name: 'Section ' + newer, exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: 'Section ' + older, exact: true })).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => api.getSelected())).toBe('s' + newer);
  });
}

for (const kind of ['tabs', 'stepper']) {
  test(`${kind} unvisited remote print replaces fallback while preserving headings state and live nodes`, async ({ page }) => {
    const collection = kind === 'tabs' ? 'tabs' : 'steps';
    await openUi(page, navigation(kind, ['<label>Live<input id="live" value="Current"></label>',
      '<p id="fallback">Load details</p><label>Fallback note<input id="fallback-note" value="Original"></label><button id="recovery" type="button">Try recovery</button>']),
    init(kind, `{ linear: false, ${collection}: [{ id: 's1', loader: async () => {
      window.remoteLoads = (window.remoteLoads || 0) + 1; return '<p>Prepared remote details</p>';
    } }] }`));
    await page.getByRole('textbox', { name: 'Live' }).fill('Live edit');
    const before = await page.evaluate(() => {
      window.live = document.querySelector('#live'); window.fallback = document.querySelector('#fallback');
      window.note = document.querySelector('#fallback-note'); window.recovery = document.querySelector('#recovery');
      window.heading = document.querySelector('#heading-s1'); window.stateLine = document.querySelector('#panel-s1 .cx-step-print-state');
      if (stateLine) stateLine.textContent = 'Awaiting review';
      note.value = 'Unsaved fallback'; window.recoveries = 0; recovery.addEventListener('click', () => recoveries++);
      return api.getState?.() ?? api.getSelected();
    });
    expect(await page.evaluate(() => window.remoteLoads || 0)).toBe(0);
    await page.evaluate(async () => { await api.preparePrint(); await api.preparePrint(); });
    expect(await page.evaluate(() => remoteLoads)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    const panel = page.locator('#panel-s1');
    await expect(panel.getByText('Prepared remote details', { exact: true })).toBeVisible();
    await expect(page.locator('#fallback')).toBeHidden();
    await expect(page.locator('#fallback-note')).toBeHidden();
    await expect(page.locator('#recovery')).toBeHidden();
    await expect(panel.getByRole('heading', { name: 'Section 1', exact: true })).toBeVisible();
    if (kind === 'stepper') await expect(panel.locator('.cx-step-print-state')).toBeVisible();
    expect(await panel.locator('p:visible').allTextContents()).toEqual(kind === 'stepper'
      ? ['Awaiting review', 'Prepared remote details'] : ['Prepared remote details']);
    expect(await page.evaluate(() => api.getState?.() ?? api.getSelected())).toEqual(before);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('.cx-navigation-print')).toHaveCount(0);
    await expect(page.locator('#panel-s0')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Live' })).toHaveValue('Live edit');
    expect(await page.evaluate(() => ({ live: live === document.querySelector('#live'),
      fallback: fallback === document.querySelector('#fallback'), note: note === document.querySelector('#fallback-note'),
      recovery: recovery === document.querySelector('#recovery'), heading: heading === document.querySelector('#heading-s1'),
      state: !stateLine || stateLine === document.querySelector('#panel-s1 .cx-step-print-state') })))
      .toEqual({ live: true, fallback: true, note: true, recovery: true, heading: true, state: true });
    expect(await page.evaluate(() => api.getState?.() ?? api.getSelected())).toEqual(before);
    // Reveal the unvisited screen fallback directly; navigation would replace it with a live load.
    await panel.evaluate(element => { element.hidden = false; });
    await expect(page.locator('#fallback')).toBeVisible();
    await expect(page.locator('#fallback-note')).toHaveValue('Unsaved fallback');
    await page.locator('#recovery').click();
    expect(await page.evaluate(() => ({ remoteLoads, recoveries }))).toEqual({ remoteLoads: 1, recoveries: 1 });
  });

  test(`${kind} beforeprint materializes unvisited templates without changing live forms or selection`, async ({ page }) => {
    await openUi(page, navigation(kind, ['<label>Live<input id="live" value="Initial"></label>',
      '<template><p>Unvisited template</p></template>']), init(kind, `{ linear: false }`));
    await page.getByRole('textbox', { name: 'Live' }).fill('Preserved');
    const before = await page.evaluate(kind => {
      window.live = document.querySelector('#live'); window.inputEvents = 0; live.addEventListener('input', () => inputEvents++);
      window.changes = 0; document.querySelector('#view').addEventListener('cx-' + kind + ':change', () => changes++);
      return api.getState?.() ?? api.getSelected();
    }, kind);
    await expect(page.locator('#panel-s1 .cx-navigation-print')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.getByText('Unvisited template', { exact: true })).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByText('Unvisited template', { exact: true })).toBeVisible();
    await expect(page.locator('#panel-s0')).toBeVisible();
    expect(await page.evaluate(() => api.getState?.() ?? api.getSelected())).toEqual(before);
    expect(await page.evaluate(() => ({ same: live === document.querySelector('#live'), changes }))).toEqual({ same: true, changes: 0 });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('.cx-navigation-print')).toHaveCount(0);
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('textbox', { name: 'Live' }).fill('Still live');
    expect(await page.evaluate(() => inputEvents)).toBe(1);
    await page.evaluate(async () => { await api.select('s1'); });
    await expect(page.getByText('Unvisited template', { exact: true })).toBeVisible();
    await expect(page.locator('#panel-s1 .cx-navigation-body')).toHaveCount(1);
  });

  test(`${kind} preparePrint loads all required bodies and preserves disposed keepAlive false content`, async ({ page }) => {
    const collection = kind === 'tabs' ? 'tabs' : 'steps';
    await openUi(page, navigation(kind, ['<label>Live<input id="live" value="Current"></label>']), init(kind, `{
      linear: false, keepAlive: false, ${collection}: [
        { id: 's1', loader: () => { (window.calls ||= []).push('s1'); return '<label>Prior<input value="Original"></label><select aria-label="Choice"><option>A</option><option>B</option></select>'; } },
        { id: 's2', loader: (_item, signal) => { (window.calls ||= []).push('s2'); window.printSignal = signal; return new Promise(resolve => { window.loadedPrint = resolve; }); } }
      ] }`));
    expect(await page.evaluate(() => window.calls || [])).toEqual([]);
    await page.evaluate(async () => { await api.select('s1'); });
    await page.getByRole('textbox', { name: 'Prior' }).fill('Retained for print');
    await page.getByRole('combobox', { name: 'Choice' }).selectOption({ label: 'B' });
    await page.evaluate(async () => { await api.select('s0'); window.live = document.querySelector('#live'); });
    await expect(page.locator('#panel-s1 .cx-navigation-body')).toBeEmpty();
    const before = await page.evaluate(() => api.getState?.() ?? api.getSelected());
    await page.evaluate(() => { window.printing = Promise.all([api.preparePrint(), api.preparePrint()]); });
    await expect.poll(() => page.evaluate(() => window.calls)).toEqual(['s1', 's2']);
    await expect(page.locator('#panel-s1 .cx-navigation-print input')).toHaveValue('Retained for print');
    await expect(page.locator('#panel-s1 .cx-navigation-print select')).toHaveValue('B');
    await page.evaluate(async () => { loadedPrint('<p>Remote print body</p>'); await printing; });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByText('Remote print body', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => api.getState?.() ?? api.getSelected())).toEqual(before);
    expect(await page.evaluate(() => live === document.querySelector('#live'))).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('.cx-navigation-print')).toHaveCount(0);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(async () => { await api.select('s1'); });
    await expect(page.getByRole('textbox', { name: 'Prior' })).toHaveValue('Original');
    expect(await page.evaluate(() => calls)).toEqual(['s1', 's2', 's1']);
  });
}

test('More cancellation leaves all choices unchecked when the committed tab is outside the menu', async ({ page }) => {
  await openUi(page, `<div style="width:700px">${navigation('tabs', [], 0, 8)}</div>`,
    init('tabs', `{ collapse: 'none', overflow: 'menu', beforeChange: async () => false }`));
  await choose(page, 'more', 7);
  const menu = await openPicker(page, 'more');
  await expect(menu.locator('[aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator('.cx-tabs-more .cx-picker-trigger')).toHaveText(/More/);
  await expect(page.locator('#panel-s0')).toBeVisible();
  expect(await page.evaluate(() => api.getSelected())).toBe('s0');
});

test('selected print prepares only the selected panel and the factory proxy waits for initialization', async ({ page }) => {
  await openUi(page, navigation('tabs', ['<template><p>Selected template</p></template>',
    '<template><p>Hidden template</p></template>']), init('tabs', `{ print: 'selected', tabs: [
      { id: 's2', loader: () => { window.unexpectedLoad = true; return '<p>Inactive remote</p>'; } }
    ] }`, 'window.prepared = api.preparePrint();'));
  expect(await page.evaluate(async () => { await prepared; return api.getSelected(); })).toBe('s0');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Selected template', { exact: true })).toBeVisible();
  await expect(page.locator('#panel-s1')).toBeHidden();
  await expect(page.locator('#panel-s1 .cx-navigation-print')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.unexpectedLoad)).toBe(false);
});

test('afterprint aborts pending preparation and late results cannot retire a newer print or live load', async ({ page }) => {
  await openUi(page, navigation(), init('tabs', `{ tabs: [{ id: 's1', loader: (_item, signal) => new Promise(resolve => {
    (window.loads ||= []).push({ signal, resolve });
  }) }] }`));
  await page.evaluate(() => { window.oldPrint = api.preparePrint().then(() => 'ready', error => error.name); });
  await expect.poll(() => page.evaluate(() => window.loads?.length)).toBe(1);
  await page.evaluate(() => { window.dispatchEvent(new Event('afterprint')); window.newPrint = api.preparePrint(); });
  expect(await page.evaluate(() => oldPrint)).toBe('AbortError');
  await expect.poll(() => page.evaluate(() => loads.length)).toBe(2);
  expect(await page.evaluate(() => loads[0].signal.aborted)).toBe(true);
  await page.evaluate(async () => { loads[0].resolve('<p>Stale print</p>'); loads[1].resolve('<p>Current print</p>'); await newPrint; });
  await expect(page.getByText('Stale print', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Current print', { exact: true })).toHaveCount(1);
  await page.evaluate(() => { window.navigating = api.select('s1'); });
  await expect.poll(() => page.evaluate(() => loads.length)).toBe(3);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#panel-s1')).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => loads[2].signal.aborted)).toBe(false);
  await page.evaluate(async () => { loads[2].resolve('<p>Live result</p>'); await navigating; });
  await expect(page.getByText('Live result', { exact: true })).toBeVisible();
});

test('destroy rejects print readiness promptly and late print content cannot affect a replacement controller', async ({ page }) => {
  await openUi(page, navigation(), init('tabs', `{ tabs: [{ id: 's1', loader: (_item, signal) => {
    window.printSignal = signal; return new Promise(resolve => { window.latePrint = resolve; });
  } }] }`));
  await page.evaluate(() => { window.printing = api.preparePrint().then(() => 'ready', error => error.name); });
  await expect.poll(() => page.evaluate(() => !!window.latePrint)).toBe(true);
  await page.evaluate(async () => { api.destroy(); window.api = CanopyX.tabs('#view', {}); await api.ready; await api.select('s2'); });
  expect(await page.evaluate(() => printing)).toBe('AbortError');
  expect(await page.evaluate(() => printSignal.aborted)).toBe(true);
  await page.evaluate(() => latePrint('<p>After destroy</p>'));
  await expect(page.locator('.cx-navigation-print')).toHaveCount(0);
  await expect(page.getByText('After destroy', { exact: true })).toHaveCount(0);
  await expect(page.locator('#panel-s2')).toBeVisible();
});

test('print loader failure rejects readiness and a retry can prepare without navigation', async ({ page }) => {
  await openUi(page, navigation(), init('tabs', `{ tabs: [{ id: 's1', loader: async () => {
    window.attempts = (window.attempts || 0) + 1; if (attempts === 1) throw new Error('Print unavailable'); return '<p>Print recovered</p>';
  } }] }`));
  expect(await page.evaluate(() => api.preparePrint().then(() => '', error => error.message))).toBe('Print unavailable');
  await expect(page.locator('.cx-navigation-print')).toHaveCount(0);
  await page.evaluate(async () => { await api.preparePrint(); });
  await expect(page.getByText('Print recovered', { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => api.getSelected())).toBe('s0');
});

test('print preparation waits for the pending live loader without starting a second load', async ({ page }) => {
  await openUi(page, navigation(), init('tabs', `{ tabs: [{ id: 's1', loader: () => {
    window.calls = (window.calls || 0) + 1; return new Promise(resolve => { window.liveLoad = resolve; });
  } }] }`));
  await page.evaluate(() => { window.navigating = api.select('s1'); });
  await expect(page.locator('#panel-s1')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => { window.printReady = false; window.printing = api.preparePrint().then(() => { printReady = true; }); });
  expect(await page.evaluate(() => ({ calls, printReady }))).toEqual({ calls: 1, printReady: false });
  await page.evaluate(async () => { liveLoad('<p>Live print content</p>'); await Promise.all([navigating, printing]); });
  await expect(page.getByText('Live print content', { exact: true })).toBeVisible();
  await expect(page.locator('#panel-s1 .cx-navigation-print')).toHaveCount(0);
  expect(await page.evaluate(() => calls)).toBe(1);
});

test('an aborted live loader cannot erase the replacement load busy state or content', async ({ page }) => {
  await openUi(page, navigation(), init('tabs', `{ tabs: [{ id: 's1', loader: (_item, signal) => new Promise(resolve => {
    (window.loads ||= []).push({ signal, resolve });
  }) }] }`));
  await page.evaluate(() => { window.oldLoad = api.select('s1'); });
  await expect.poll(() => page.evaluate(() => window.loads?.length)).toBe(1);
  await page.evaluate(async () => { await api.select('s0'); window.currentLoad = api.select('s1'); });
  await expect.poll(() => page.evaluate(() => loads.length)).toBe(2);
  expect(await page.evaluate(() => oldLoad)).toBe(false);
  await page.evaluate(() => loads[0].resolve('<p>Stale live body</p>'));
  await expect(page.locator('#panel-s1')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Stale live body', { exact: true })).toHaveCount(0);
  await page.evaluate(async () => { loads[1].resolve('<p>Current live body</p>'); await currentLoad; });
  await expect(page.locator('#panel-s1')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Current live body', { exact: true })).toBeVisible();
});

test('a print loader returning a connected node preserves its host form and current values', async ({ page }) => {
  const form = '<form id="host-form"><label>Host choice<select id="host-choice" name="choice"><option>A</option><option>B</option></select></label></form>';
  await openUi(page, form + navigation(), init('tabs', `{ tabs: [{ id: 's1', loader: () => document.querySelector('#host-choice') }] }`));
  await page.getByRole('combobox', { name: 'Host choice' }).selectOption({ label: 'B' });
  await page.evaluate(async () => { window.hostChoice = document.querySelector('#host-choice'); await api.preparePrint(); });
  await expect(page.locator('#panel-s1 .cx-navigation-print select')).toHaveValue('B');
  await expect(page.locator('#host-form #host-choice')).toHaveValue('B');
  expect(await page.evaluate(() => ({ same: hostChoice === document.querySelector('#host-choice'),
    data: Array.from(new FormData(document.querySelector('#host-form'))) }))).toEqual({ same: true, data: [['choice', 'B']] });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.cx-navigation-print')).toHaveCount(0);
});
