import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

test.use({ viewport: { width: 900, height: 600 } });

// Mirrors the .NET rating: a fieldset with a legend and one native radio per step, inside a form.
const rating = (extra = '', checked = 0) => `<form id="survey"><fieldset id="quality" class="cx-rating" data-cx-rating data-max="5" ${extra}><legend>Service quality</legend>
  <span class="cx-rating-options">${[1, 2, 3, 4, 5].map(value => `<label class="cx-rating-option"><input type="radio" name="quality" value="${value}"${value === checked ? ' checked' : ''}><span class="cx-rating-text">${value} of 5</span></label>`).join('')}</span></fieldset></form>`;
const filled = page => page.locator('.cx-rating-option[data-filled="true"]');
const value = page => page.evaluate(() => new FormData(document.getElementById('survey')).get('quality'));

test('a choice fills the stars up to it, submits with the form and reports the change', async ({ page }) => {
  await openUi(page, rating('', 2));
  await expect(page.getByRole('group', { name: 'Service quality' })).toBeVisible();
  await expect(filled(page)).toHaveCount(2);
  await page.evaluate(() => { window.changes = []; document.addEventListener('cx-rating:change', event => window.changes.push(event.detail.value + ':' + event.detail.source)); });
  await page.locator('.cx-rating-option').nth(3).click();
  await page.mouse.move(800, 500);
  await expect(filled(page)).toHaveCount(4);
  expect(await value(page)).toBe('4');
  await page.getByRole('radio', { name: '4 of 5' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '3 of 5' })).toBeChecked();
  await expect(filled(page)).toHaveCount(3);
  expect(await page.evaluate(() => window.changes)).toEqual(['4:pointer', '3:keyboard']);
});

test('choosing the value again or pressing Delete clears a clearable rating; a required one keeps its value', async ({ page }) => {
  await openUi(page, rating('', 3));
  await page.getByRole('radio', { name: '3 of 5' }).click({ force: true });
  expect(await value(page)).toBeNull();
  // The pointer still over the stars previews them; away from them the empty rating shows.
  await page.mouse.move(800, 500);
  await expect(filled(page)).toHaveCount(0);
  await page.getByRole('radio', { name: '5 of 5' }).click({ force: true });
  await page.getByRole('radio', { name: '5 of 5' }).focus();
  await page.keyboard.press('Delete');
  expect(await value(page)).toBeNull();
  await openUi(page, rating('data-clearable="false"', 3));
  await page.getByRole('radio', { name: '3 of 5' }).click({ force: true });
  expect(await value(page)).toBe('3');
});

test('hover previews the stars without choosing, and the controller sets and clears values', async ({ page }) => {
  await openUi(page, rating('', 1));
  await page.getByText('5 of 5').hover({ force: true });
  await expect(page.locator('.cx-rating-option[data-preview="true"]')).toHaveCount(5);
  await page.mouse.move(800, 500);
  await expect(filled(page)).toHaveCount(1);
  expect(await page.evaluate(() => { const control = CanopyX.rating('#quality'); control.select(4); return control.getState(); })).toEqual({ value: 4, max: 5 });
  expect(await value(page)).toBe('4');
  expect(await page.evaluate(() => { try { CanopyX.rating('#quality').select(9); } catch (error) { return error.message; } })).toBe('CanopyX: a rating value is a whole number from 1 to 5.');
});

test('an empty element gets its radio group in the page language', async ({ page }) => {
  await openUi(page, '<div id="stars"></div>');
  await page.evaluate(() => CanopyX.rating('#stars', { max: 3, name: 'stars', label: 'Ease of setup', value: 2, labels: { ratingValue: '{value} / {max}' } }).ready);
  await expect(page.getByRole('radiogroup', { name: 'Ease of setup' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '2 / 3' })).toBeChecked();
  await page.evaluate(() => CanopyX.rating('#stars').destroy());
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('a form reset brings the stars back to the written value, and a generated fieldset gets its legend', async ({ page }) => {
  await openUi(page, rating('', 2));
  await page.locator('.cx-rating-option').nth(3).click();
  await page.mouse.move(800, 500);
  await expect(filled(page)).toHaveCount(4);
  await page.evaluate(() => document.getElementById('survey').reset());
  await expect(filled(page)).toHaveCount(2);
  expect(await page.evaluate(() => CanopyX.rating('#quality').getState().value)).toBe(2);
  await openUi(page, '<fieldset id="blank"></fieldset>');
  await page.evaluate(() => CanopyX.rating('#blank', { label: 'Ease of setup' }).ready);
  await expect(page.getByRole('group', { name: 'Ease of setup' })).toBeVisible();
});

test('a disabled rating still shows its value', async ({ page }) => {
  await openUi(page, rating('disabled', 3));
  const colour = index => page.locator('.cx-rating-option').nth(index).evaluate(element => getComputedStyle(element).color);
  expect(await colour(2)).not.toBe(await colour(3));
});
