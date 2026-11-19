import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 900, height: 700 } });

// Mirrors the .NET select: a label, a native select with option data, inside a form.
const select = (extra = '', multiple = false, selected = []) => `<form id="form"><label for="country">Country</label>
  <div id="picker" class="cx-select" data-cx-select ${extra}><select id="country" name="country" ${multiple ? 'multiple' : ''}>
    ${multiple ? '' : '<option value="">Choose…</option>'}
    <optgroup label="Europe"><option value="pl" data-flag="pl" data-description="Warsaw"${selected.includes('pl') ? ' selected' : ''}>Poland</option>
    <option value="de" data-flag="de" data-badge="EU" data-tone="info"${selected.includes('de') ? ' selected' : ''}>Germany</option>
    <option value="fr" data-flag="fr" disabled>France</option></optgroup>
    <optgroup label="Americas"><option value="us" data-flag="us"${selected.includes('us') ? ' selected' : ''}>United States</option>
    <option value="br" data-avatar="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"${selected.includes('br') ? ' selected' : ''}>Brasil · São Paulo</option></optgroup>
  </select></div></form>`;
const combo = page => page.getByRole('combobox', { name: 'Country' });
const options = page => page.getByRole('listbox', { name: 'Country' }).getByRole('option');
const submitted = page => page.evaluate(() => new FormData(document.getElementById('form')).getAll('country'));

test('typing filters without case or accents, the keyboard picks, and the native select submits the answer', async ({ page }) => {
  await openUi(page, select());
  await expect(combo(page)).toHaveAttribute('aria-expanded', 'false');
  await combo(page).focus();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(5);
  await page.keyboard.press('Escape');
  await combo(page).fill('SAO');
  await expect(options(page)).toHaveText(['Brasil · São Paulo']);
  await expect(page.getByRole('status')).toHaveText('Results: 1');
  await combo(page).fill('');
  await expect(options(page)).toHaveCount(5);
  await expect(page.locator('.cx-select-group')).toHaveText(['Europe', 'Americas']);
  await expect(page.locator('.cx-select-flag').first()).toHaveText('🇵🇱');
  await expect(options(page).nth(1)).toContainText('EU');
  await page.keyboard.press('ArrowDown');
  await expect(combo(page)).toHaveAttribute('aria-activedescendant', /-o1$/);
  await page.keyboard.press('ArrowDown');
  // France is disabled: the keyboard skips it.
  await expect(combo(page)).toHaveAttribute('aria-activedescendant', /-o3$/);
  await page.keyboard.press('Enter');
  await expect(combo(page)).toHaveValue('United States');
  await expect(combo(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await submitted(page)).toEqual(['us']);
  await combo(page).focus();
  await page.evaluate(() => document.addEventListener('keydown', event => { window.prevented = event.defaultPrevented; }));
  await page.keyboard.press('Escape');
  expect(await submitted(page)).toEqual(['']);
  expect(await page.evaluate(() => window.prevented)).toBe(true);
  // A closed, empty select leaves Escape to a containing dialog or drawer.
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.prevented)).toBe(false);
});

test('a multiple select shows chips that Backspace and their buttons remove, and reports changes', async ({ page }) => {
  await openUi(page, select('', true, ['pl', 'de']));
  await expect(page.locator('.cx-select-chip')).toHaveText(['🇵🇱Poland', '🇩🇪Germany']);
  await expect(page.locator('[data-cx-part="listbox"]')).toHaveAttribute('aria-multiselectable', 'true');
  await page.evaluate(() => { window.changes = []; document.addEventListener('cx-select:change', event => window.changes.push(event.detail.value.join('+') + ':' + event.detail.source)); });
  await combo(page).click();
  await options(page).filter({ hasText: 'United States' }).click();
  expect(await submitted(page)).toEqual(['pl', 'de', 'us']);
  await expect(combo(page)).toBeFocused();
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Remove Poland' }).click();
  expect(await submitted(page)).toEqual(['de']);
  expect(await page.evaluate(() => window.changes)).toEqual(['pl+de+us:pointer', 'pl+de:keyboard', 'de:chip']);
});

test('an open list follows values changed by Backspace or the controller, and the controller respects max', async ({ page }) => {
  await openUi(page, select('data-max="2"', true, ['pl', 'de']));
  await combo(page).click();
  const row = name => options(page).filter({ hasText: name });
  await expect(row('Germany')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Backspace');
  await expect(row('Germany')).toHaveAttribute('aria-selected', 'false');
  expect(await page.evaluate(() => CanopyX.select('#picker').select(['us', 'br', 'pl']))).toEqual(['us', 'br']);
  await expect(row('Poland')).toHaveAttribute('aria-selected', 'false');
  await expect(row('United States')).toHaveAttribute('aria-selected', 'true');
  expect(await submitted(page)).toEqual(['us', 'br']);
});

test('tags mode creates a value from the typed text and adds it to the native select', async ({ page }) => {
  await openUi(page, select('data-tags="true"', true));
  await combo(page).fill('Iceland');
  await expect(options(page).last()).toHaveText('Add “Iceland”');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  expect(await submitted(page)).toEqual(['Iceland']);
  await expect(page.locator('.cx-select-chip')).toHaveText(['Iceland']);
});

test('a created tag replaces a single value and respects the limit of a multiple select', async ({ page }) => {
  const create = async text => { await combo(page).fill(text); await page.keyboard.press('End'); await page.keyboard.press('Enter'); };
  await openUi(page, select('data-tags="true"'));
  await create('Iceland');
  await create('Norway');
  expect(await submitted(page)).toEqual(['Norway']);
  expect(await page.evaluate(() => CanopyX.select('#picker').getState().value)).toBe('Norway');
  await openUi(page, select('data-tags="true" data-max="1"', true, ['pl']));
  await create('Iceland');
  expect(await submitted(page)).toEqual(['pl']);
  await expect(page.locator('.cx-select-chip')).toHaveText(['🇵🇱Poland']);
});

test('host options match the native selection by value, and refresh unselects a removed value', async ({ page }) => {
  const markup = selected => `<form id="form"><label for="country">Country</label><div id="picker"><select id="country" name="country">
    <option value="">Choose…</option><option value="pl"${selected ? ' selected' : ''}>Poland</option></select></div></form>`;
  const open = (list = [{ value: 'de', label: 'Germany' }, { value: 'pl', label: 'Poland' }]) => page.evaluate(list => { window.hosted = { options: list }; return CanopyX.select('#picker', window.hosted).ready; }, list);
  await openUi(page, markup(false));
  await open();
  await expect(combo(page)).toHaveValue('');
  await openUi(page, markup(true));
  await open();
  await expect(combo(page)).toHaveValue('Poland');
  await page.evaluate(() => CanopyX.select('#picker').select('de'));
  await page.evaluate(() => document.getElementById('form').reset());
  await expect(combo(page)).toHaveValue('Poland');
  await page.evaluate(() => { window.hosted.options.pop(); CanopyX.select('#picker').refresh(); });
  expect(await submitted(page)).toEqual(['']);
  await expect(combo(page)).toHaveValue('');
  // Refreshing while the list is open rebuilds its rows.
  await combo(page).click();
  await expect(options(page)).toHaveText(['Germany']);
  await page.evaluate(() => { window.hosted.options[0].disabled = true; window.hosted.options.push({ value: 'at', label: 'Austria' }); CanopyX.select('#picker').refresh(); });
  await expect(options(page)).toHaveText(['Germany', 'Austria']);
  await expect(options(page).first()).toHaveAttribute('aria-disabled', 'true');
  await options(page).first().dispatchEvent('click');
  expect(await submitted(page)).toEqual(['']);
  // A selected native value the host options lack stays selected.
  await openUi(page, markup(true));
  await open([{ value: 'de', label: 'Germany' }]);
  await expect(combo(page)).toHaveValue('Poland');
  expect(await submitted(page)).toEqual(['pl']);
});

test('names come from aria-labelledby or a wrapping label, and a disabled group disables its options', async ({ page }) => {
  await openUi(page, `<label>Region <div data-cx-select><select id="region"><optgroup label="Closed" disabled><option value="x">Atlantis</option></optgroup>
    <option value="y" selected>Yukon</option></select></div></label><span id="team">Owner team</span><div data-cx-select><select aria-labelledby="team"><option>Ops</option></select></div>`);
  await expect(page.getByRole('combobox', { name: 'Owner team' })).toHaveCount(1);
  const region = page.getByRole('combobox', { name: /^Region/ });
  await region.click();
  await expect(page.getByRole('option', { name: 'Atlantis' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('option', { name: 'Atlantis' }).click();
  expect(await page.evaluate(() => document.getElementById('region').value)).toBe('y');
});

test('a host loader answers each query, cancels stale ones and shows its errors', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<label for="user">Owner</label><div id="owner"><select id="user" name="user"></select></div>');
  await page.evaluate(() => {
    window.queries = [];
    CanopyX.select('#owner', { load: async (query, signal) => {
      window.queries.push(query + (signal.aborted ? '!' : ''));
      if (query === 'err') throw new Error('Directory unavailable');
      return [{ value: 'ada', label: 'Ada Lovelace', description: 'ada@example.com', avatar: 'javascript:alert(1)' }, { value: 'alan', label: 'Alan Turing' }].filter(user => user.label.toLowerCase().includes(query));
    } });
  });
  const owner = page.getByRole('combobox', { name: 'Owner' });
  await owner.fill('a');
  await owner.fill('ad');
  await page.clock.runFor(300);
  await expect(page.getByRole('option')).toHaveText(['Ada Loveladeada@example.com'.replace('Lovelade', 'Lovelace')]);
  expect(await page.evaluate(() => window.queries)).toEqual(['ad']);
  // An unsafe avatar address is dropped.
  await expect(page.locator('.cx-select-avatar')).toHaveCount(0);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.getElementById('user').value)).toBe('ada');
  await owner.fill('err');
  await page.clock.runFor(300);
  await expect(page.locator('.cx-select-note')).toHaveText('Directory unavailable');
});

test('a newer query drops an older answer or failure, and the popup is placed again when results arrive', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<div style="block-size:560px"></div><label for="user">Owner</label><div id="owner"><select id="user" name="user"></select></div>');
  await page.evaluate(() => {
    window.pending = {};
    CanopyX.select('#owner', { load: query => new Promise((resolve, reject) => { window.pending[query] = { resolve, reject }; }) });
  });
  const settle = (query, how, value) => page.evaluate(async ([query, how, value]) => {
    window.pending[query][how](how === 'reject' ? new Error(value) : value);
    for (let step = 0; step < 10; step++) await null;
  }, [query, how, value]);
  const owner = page.getByRole('combobox', { name: 'Owner' });
  const users = Array.from({ length: 12 }, (_, at) => ({ value: 'u' + at, label: 'User ' + at }));
  await owner.fill('a');
  await page.clock.runFor(300);
  await owner.fill('ad');
  await settle('a', 'resolve', users);
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.clock.runFor(300);
  await owner.fill('adx');
  await page.clock.runFor(300);
  await settle('adx', 'resolve', users);
  await settle('ad', 'reject', 'Late failure');
  await expect(page.getByRole('option')).toHaveCount(12);
  await expect(page.locator('.cx-select-note')).toBeHidden();
  const box = await page.locator('.cx-select-popup').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(700);
});

test('a query below the minimum closes the results and keeps the typed text', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<label for="user">Owner</label><div id="owner"><select id="user" name="user"></select></div>');
  await page.evaluate(() => CanopyX.select('#owner', { minLength: 2, load: async () => [{ value: 'pl', label: 'Poland' }] }).ready);
  const owner = page.getByRole('combobox', { name: 'Owner' });
  await owner.fill('po');
  await page.clock.runFor(300);
  await page.keyboard.press('Enter');
  await expect(owner).toHaveValue('Poland');
  await owner.fill('po');
  await page.clock.runFor(300);
  await expect(owner).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Backspace');
  await expect(owner).toHaveValue('p');
  await expect(owner).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(owner).toHaveValue('Poland');
});

test('a loader without search answers the empty query when the field opens', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<label for="user">Owner</label><div id="owner"><select id="user" name="user"></select></div>');
  await page.evaluate(() => CanopyX.select('#owner', { search: false, load: async query => [{ value: 'ada', label: 'Ada ' + JSON.stringify(query) }] }).ready);
  await page.getByRole('combobox', { name: 'Owner' }).click();
  await page.clock.runFor(300);
  await expect(page.getByRole('option')).toHaveText(['Ada ""']);
});

test('without search the field opens like a button and Space picks', async ({ page }) => {
  await openUi(page, select('data-search="false"'));
  await expect(combo(page)).toHaveAttribute('readonly', '');
  await combo(page).focus();
  await page.keyboard.press('Space');
  await expect(combo(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  expect(await submitted(page)).toEqual(['de']);
});

test('the controller sets and clears values, a form reset restores the written answer, and destroy restores the select', async ({ page }) => {
  await openUi(page, select('', true, ['pl']));
  expect(await page.evaluate(() => CanopyX.select('#picker').select(['us', 'br']))).toEqual(['us', 'br']);
  expect(await submitted(page)).toEqual(['us', 'br']);
  await page.evaluate(() => document.getElementById('form').reset());
  await expect(page.locator('.cx-select-chip')).toHaveText(['🇵🇱Poland']);
  await page.evaluate(() => CanopyX.select('#picker').destroy());
  await expect(page.locator('.cx-select-field')).toHaveCount(0);
  await expect(page.locator('#country')).not.toHaveAttribute('aria-hidden', 'true');
});

test('the list stays inside a phone screen and right to left keeps chips in reading order', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openUi(page, select('dir="rtl"', true, ['pl']));
  await combo(page).click();
  const box = await page.locator('.cx-select-popup').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  const chip = await page.locator('.cx-select-chip').boundingBox(), field = await page.locator('.cx-select-field').boundingBox();
  expect(chip.x + chip.width).toBeGreaterThan(field.x + field.width / 2);
});
