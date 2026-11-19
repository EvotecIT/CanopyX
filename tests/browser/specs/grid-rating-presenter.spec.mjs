// The rating presenter (CanopyGridPresenter.Rating): read-only stars in cells and the record drawer, read as "4 / 5".
import { test, expect } from '@playwright/test';
import { runtimeAssets } from './support.mjs';

const view = {
  protocol: 'canopyx/2', type: 'grid', id: 'reviews', label: 'Vendor reviews', source: { kind: 'inline' }, pageSize: 50, selection: 'none',
  columns: [{ id: 'name', title: 'Vendor', kind: 'text', width: 160 }, { id: 'score', title: 'Score', kind: 'number', presenter: { kind: 'rating', maximum: 5 } }],
  rows: [{ id: 'a', cells: { name: 'Contoso', score: 4 } }, { id: 'b', cells: { name: 'Fabrikam', score: 2.6 } }, { id: 'c', cells: { name: 'Northwind', score: null } }]
};

async function open(page, grid = view) {
  const { script, style } = runtimeAssets('grid');
  await page.setContent('<!doctype html><html lang="en"><head><title>Reviews</title><style>' + style + '</style></head><body><main><div id="host"></div></main></body></html>');
  await page.addScriptTag({ content: script });
  return page.evaluate(async grid => {
    try { window.grid = CanopyX.createDataGrid(document.querySelector('#host'), { view: grid }); await window.grid.ready; return 'ready'; } catch (error) { return error.message; }
  }, grid);
}

test('a rating cell shows whole stars and reads as the value out of the maximum', async ({ page }) => {
  expect(await open(page)).toBe('ready');
  const first = page.getByRole('img', { name: '4 / 5' });
  await expect(first).toBeVisible();
  await expect(first).toHaveText('★★★★☆');
  await expect(page.getByRole('img', { name: '2.6 / 5' })).toHaveText('★★★☆☆');
  // An empty score stays empty rather than showing five empty stars.
  await expect(page.locator('.p-rating')).toHaveCount(2);
});

test('a rating presenter needs a numeric column and two to ten stars', async ({ page }) => {
  for (const columns of [
    [{ id: 'score', title: 'Score', kind: 'text', presenter: { kind: 'rating', maximum: 5 } }],
    [{ id: 'score', title: 'Score', kind: 'number', presenter: { kind: 'rating', maximum: 11 } }],
    [{ id: 'score', title: 'Score', kind: 'number', presenter: { kind: 'rating' } }]
  ]) expect(await open(page, { ...view, columns, rows: [] })).toContain('invalid grid presenter');
});
