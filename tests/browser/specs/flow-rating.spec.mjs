// Rating fields in flows (docs/flow.md#fields): stars over native radio buttons, the review text and the proposal's number.
import { test, expect } from '@playwright/test';
import { openFieldFlow } from './flow-page-support.mjs';

const openRatingFlow = (page, field, extra = {}) =>
  openFieldFlow(page, [Object.assign({ id: 'quality', type: 'rating', label: 'Service quality' }, field)], { extra: Object.assign({ id: 'survey', title: 'Service survey' }, extra) });
const stars = page => page.locator('.cx-flow-star.cx-flow-star-on');

test('a rating answer fills the stars, reads as words on the review page and submits as a number', async ({ page }) => {
  await openRatingFlow(page, { scale: 4, required: true });
  const group = page.getByRole('radiogroup', { name: 'Service quality' });
  await expect(group.getByRole('radio')).toHaveCount(4);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.cx-flow-error')).toContainText('Service quality');
  await page.locator('.cx-flow-star').nth(2).click();
  await expect(stars(page)).toHaveCount(3);
  await group.getByRole('radio', { name: '3 of 4' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: '4 of 4' })).toBeChecked();
  await expect(stars(page)).toHaveCount(4);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.cx-flow-review')).toContainText('4 of 4');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect.poll(() => page.evaluate(() => window.submitted)).toEqual([{ quality: 4 }]);
});

test('an optional rating clears when its value is chosen again or with Delete; a required one keeps it', async ({ page }) => {
  await openRatingFlow(page, { default: 2 });
  await expect(stars(page)).toHaveCount(2);
  await page.locator('.cx-flow-star').nth(1).click();
  await expect(stars(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.flow.getValues().quality ?? null)).toBeNull();
  await page.locator('.cx-flow-star').nth(4).click();
  await page.getByRole('radio', { name: '5 of 5' }).focus();
  await page.keyboard.press('Delete');
  await expect(stars(page)).toHaveCount(0);
  await openRatingFlow(page, { default: 2, required: true });
  await page.locator('.cx-flow-star').nth(1).click();
  await expect(stars(page)).toHaveCount(2);
});

test('the document refuses a scale on other fields and values outside the stars', async ({ page }) => {
  await openRatingFlow(page, {});
  // createFlow reads the document once its parts are in, so the errors come back from ready.
  const settled = await page.evaluate(async () => Promise.all([
    { id: 'a', type: 'text', label: 'A', scale: 4 }, { id: 'a', type: 'rating', label: 'A', scale: 12 }, { id: 'a', type: 'rating', label: 'A', default: 6 }
  ].map(field => CanopyX.createFlow(document.createElement('div'), { flow: { kind: 'flow', version: 1, id: 'x', title: 'X', steps: [{ id: 's', title: 'S', fields: [field] }] } })
    .ready.then(() => 'ready', error => error.message))));
  expect(settled).toEqual(['CanopyX: field a needs a scale of 2 to 10 stars, as a rating only.', 'CanopyX: field a needs a scale of 2 to 10 stars, as a rating only.',
    'CanopyX: field a has a default that does not fit it.']);
});
