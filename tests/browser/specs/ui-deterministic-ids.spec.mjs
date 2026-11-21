// Components without an id get one from page order (cx-<kind>-N, skipping ids already taken), never from chance, so the
// same page renders the same markup on every load.
import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
const gallery = `<div class="cx-gallery" data-cx-lightbox><a data-lightbox-item href="${image}"><img src="${image}" alt="Rack"></a></div>`;
const select = `<div class="cx-select" data-cx-select><select name="site" aria-label="Site"><option value="a">A</option><option value="b">B</option></select></div>`;
const rating = `<fieldset class="cx-rating" data-cx-rating data-max="3"><legend>Score</legend></fieldset>`;
const markup = `<span id="cx-select-1"></span>${gallery}${gallery}${select}${select}${rating}${rating}`;

async function ids(page) {
  return page.evaluate(() => ({
    lightboxes: [...document.querySelectorAll('dialog.cx-lightbox')].map(dialog => dialog.id),
    selects: [...document.querySelectorAll('[role="combobox"]')].map(input => input.id),
    ratings: [...document.querySelectorAll('.cx-rating')].map(group => group.querySelector('input[type="radio"]').name)
  }));
}

test('fallback ids follow page order and stay the same from load to load', async ({ page }) => {
  await openUi(page, markup);
  const first = await ids(page);
  expect(first).toEqual({ lightboxes: ['cx-lightbox-1-viewer', 'cx-lightbox-2-viewer'], selects: ['cx-select-2-combo', 'cx-select-3-combo'],
    ratings: ['cx-rating-1-value', 'cx-rating-2-value'] });
  await page.reload();
  await page.evaluate(() => Promise.all(CanopyX.mountUi(document).map(api => api.ready)));
  expect(await ids(page)).toEqual(first);
});
