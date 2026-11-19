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

test('clearing a select without a placeholder submits nothing, a tag never replaces a disabled option, and focus on the select moves to the combobox', async ({ page }) => {
  await openUi(page, select('data-tags="true"').replace('<option value="">Choose…</option>', '').replace('<option value="us" data-flag="us"', '<option value="us" data-flag="us" selected').replace('</optgroup>\n  </select>', '<option value="x" disabled>Atlantis</option></optgroup>\n  </select>'));
  await expect(combo(page)).toHaveValue('United States');
  await page.evaluate(async () => { const picker = CanopyX.select('#picker'); await picker.ready; await picker.clear(); });
  expect(await submitted(page)).toEqual([]);
  await expect(page.locator('#country option[value="x"]')).toHaveCount(1);
  await combo(page).fill('x');
  await expect(options(page).filter({ hasText: 'Add' })).toHaveCount(0);
  await page.evaluate(() => document.getElementById('country').focus());
  await expect(combo(page)).toBeFocused();
});

test('validation state moves to the combobox, refreshed labels reach the field, and a host option enables its disabled native twin', async ({ page }) => {
  await openUi(page, '<form id="form"><label for="country">Country</label><div id="picker"><select id="country" name="country" required aria-invalid="true" aria-describedby="country-error">' +
    '<option value="">Choose…</option><option value="pl" selected>Poland</option><option value="x" disabled>Atlantis</option></select></div><p id="country-error">Pick a country</p></form>');
  await page.evaluate(() => { window.hostOptions = [{ value: 'pl', label: 'Poland' }, { value: 'x', label: 'Available' }]; window.picker = CanopyX.select('#picker', { options: window.hostOptions }); return window.picker.ready; });
  await expect(combo(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(combo(page)).toHaveAttribute('aria-required', 'true');
  await expect(combo(page)).toHaveAccessibleDescription('Pick a country');
  await page.evaluate(() => document.getElementById('country').removeAttribute('aria-invalid'));
  await expect(combo(page)).not.toHaveAttribute('aria-invalid');
  await page.evaluate(() => { window.hostOptions[0].label = 'Polska'; window.picker.refresh(); });
  await expect(combo(page)).toHaveValue('Polska');
  await combo(page).fill('avail');
  await options(page).filter({ hasText: 'Available' }).click();
  expect(await submitted(page)).toEqual(['x']);
});

test('a tag the loader does not know can be found and chosen again', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<label for="tag">Tags</label><div id="tags"><select id="tag" name="tag" multiple></select></div>');
  await page.evaluate(() => CanopyX.select('#tags', { tags: true, load: async () => [] }).ready);
  const tagsBox = page.getByRole('combobox', { name: 'Tags' });
  await tagsBox.fill('Iceland');
  await page.clock.runFor(300);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Iceland/ }).click();
  await tagsBox.fill('Ice');
  await page.clock.runFor(300);
  await expect(page.getByRole('option', { name: 'Iceland' })).toBeVisible();
});

test('a disabled selected option stays disabled, and a reset empties a select that started without options', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<form id="form">' + select('', true).replace('<form id="form">', '').replace('</form>', '').replace('<option value="fr" data-flag="fr" disabled>', '<option value="fr" data-flag="fr" disabled selected>') +
    '<label for="user">Owner</label><div id="owner"><select id="user" name="user"></select></div></form>');
  await combo(page).click();
  await options(page).filter({ hasText: 'Poland' }).click();
  expect(await page.evaluate(() => document.querySelector('#country option[value="fr"]').disabled)).toBe(true);
  expect(await submitted(page)).toEqual(['pl']);
  await page.evaluate(() => CanopyX.select('#owner', { tags: true, load: async () => [{ value: 'ada', label: 'Ada Lovelace' }] }).ready);
  const owner = page.getByRole('combobox', { name: 'Owner' });
  await owner.fill('ada');
  await page.clock.runFor(300);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.getElementById('user').value)).toBe('ada');
  await page.evaluate(() => document.getElementById('form').reset());
  await page.clock.runFor(10);
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).getAll('user'))).toEqual([]);
  await expect(owner).toHaveValue('');
});

test('the combobox follows the native select when the host enables or disables it', async ({ page }) => {
  await openUi(page, select().replace('<select id="country" name="country"', '<select id="country" name="country" disabled'));
  await expect(combo(page)).toBeDisabled();
  await page.evaluate(() => { document.getElementById('country').disabled = false; });
  await expect(combo(page)).toBeEnabled();
  await combo(page).click();
  await expect(options(page).first()).toBeVisible();
  await page.evaluate(() => { document.getElementById('country').disabled = true; });
  await expect(combo(page)).toBeDisabled();
  await expect(page.getByRole('listbox', { name: 'Country' })).toBeHidden();
});

test('options named by their label attribute keep that name, and an empty value is a choice in a multiple select', async ({ page }) => {
  await openUi(page, '<form id="form"><label for="country">Country</label><div id="picker" data-cx-select><select id="country" name="country" multiple>' +
    '<option value="">Unassigned</option><option value="us" label="United States"></option></select></div></form>');
  await combo(page).fill('united');
  await expect(options(page)).toHaveText(['United States']);
  await combo(page).fill('unass');
  await options(page).filter({ hasText: 'Unassigned' }).click();
  expect(await submitted(page)).toEqual(['']);
});

test('disabling a multiple select disables its chips, and closing it clears the search text', async ({ page }) => {
  await openUi(page, select('', true, ['pl']));
  await combo(page).fill('ger');
  await page.keyboard.press('Escape');
  await expect(combo(page)).toHaveValue('');
  await page.evaluate(() => { document.getElementById('country').disabled = true; });
  await expect(page.getByRole('button', { name: /Poland/ })).toBeDisabled();
  await page.evaluate(() => { document.getElementById('country').disabled = false; });
  await expect(page.getByRole('button', { name: /Poland/ })).toBeEnabled();
});

test('a disabled fieldset around an open select refuses the choice and closes the list', async ({ page }) => {
  await openUi(page, select().replace('<label for="country">', '<fieldset id="set"><label for="country">').replace('</select></div>', '</select></div></fieldset>'));
  await combo(page).click();
  const poland = options(page).filter({ hasText: 'Poland' });
  await expect(poland).toBeVisible();
  await page.evaluate(() => { document.getElementById('set').disabled = true; });
  // A click that reaches a row of the list after the fieldset was disabled.
  await page.evaluate(() => [...document.querySelectorAll('#picker [role="option"]')].find(row => row.textContent.includes('Poland')).click());
  expect(await submitted(page)).toEqual([]);
  await expect(page.getByRole('listbox', { name: 'Country' })).toBeHidden();
});

test('on a short screen the list fits the visible height, so its last option can be scrolled into view', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 160 });
  const many = Array.from({ length: 30 }, (_, at) => `<option value="v${at}">Value ${at + 1}</option>`).join('');
  await openUi(page, `<label for="long">Long</label><div class="cx-select" data-cx-select><select id="long" name="long">${many}</select></div>`);
  await page.getByRole('combobox', { name: 'Long' }).click();
  const list = page.getByRole('listbox', { name: 'Long' });
  await expect(list).toBeVisible();
  const box = await page.locator('.cx-select-popup').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(160);
  await list.getByRole('option', { name: 'Value 30' }).scrollIntoViewIfNeeded();
  await expect(list.getByRole('option', { name: 'Value 30' })).toBeInViewport();
});

test('a disabled host option chosen through select() stays disabled in the native select and is not submitted', async ({ page }) => {
  // The enabled native "old" option takes the host's disabled state.
  await openUi(page, '<form id="hosted"><label for="team">Team</label><div id="teams"><select id="team" name="team" multiple><option value="ops">Ops</option><option value="old">Old</option></select></div></form>');
  const result = await page.evaluate(async () => {
    const control = CanopyX.select('#teams', { options: [{ value: 'ops', label: 'Ops' }, { value: 'old', label: 'Retired', disabled: true }] });
    await control.ready; await control.select(['ops', 'old']);
    const added = document.querySelector('#team option[value="old"]');
    return { disabled: added?.disabled, submitted: new FormData(document.getElementById('hosted')).getAll('team') };
  });
  expect(result).toEqual({ disabled: true, submitted: ['ops'] });
});

test('a later loader answer replaces the record a value had before', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openUi(page, '<label for="owner-input">Owner</label><div id="owners"><select id="owner-input" name="owner"></select></div>');
  await page.evaluate(() => { window.owners = CanopyX.select('#owners', { load: async query => [{ value: 'x', label: query === 'old' ? 'Old name' : 'New name' }] }); return window.owners.ready; });
  const box = page.getByRole('combobox', { name: 'Owner' });
  await box.fill('old');
  await page.clock.runFor(300);
  await box.fill('new');
  await page.clock.runFor(300);
  await expect(page.getByRole('option', { name: 'New name' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.owners.select('x'));
  await expect(box).toHaveValue('New name');
});

test('refresh carries a kept value the host disables or enables to the native select', async ({ page }) => {
  await openUi(page, '<form id="hosted"><label for="team">Team</label><div id="teams"><select id="team" name="team" multiple><option value="ops" selected>Ops</option></select></div></form>');
  const refresh = disabled => page.evaluate(disabled => { window.teamOptions[0].disabled = disabled; window.teams.refresh(); return new FormData(document.getElementById('hosted')).getAll('team'); }, disabled);
  await page.evaluate(() => { window.teamOptions = [{ value: 'ops', label: 'Ops' }]; window.teams = CanopyX.select('#teams', { options: window.teamOptions }); return window.teams.ready; });
  expect(await refresh(true)).toEqual([]);
  expect(await refresh(false)).toEqual(['ops']);
});

test('host records set the disabled state of values the page already selected', async ({ page }) => {
  await openUi(page, '<form id="hosted"><label for="team">Team</label><div id="teams"><select id="team" name="team" multiple><option value="ops" selected>Ops</option><option value="old" selected disabled>Old</option></select></div></form>');
  const submitted = await page.evaluate(async () => {
    await CanopyX.select('#teams', { options: [{ value: 'ops', label: 'Ops', disabled: true }, { value: 'old', label: 'Old' }] }).ready;
    return new FormData(document.getElementById('hosted')).getAll('team');
  });
  expect(submitted).toEqual(['old']);
});
