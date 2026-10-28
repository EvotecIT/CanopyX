import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

const markup = `<div id="sections" class="cx-tabs" data-cx-tabs>
  <div class="cx-tablist" role="tablist" aria-label="Sections">
    ${['first', 'second'].map((id, index) => `<button type="button" class="cx-tab" role="tab"
      id="tab-${id}" data-tab-id="${id}" aria-controls="panel-${id}"
      aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"><span class="cx-tab-label">${id}</span></button>`).join('')}
  </div>
  ${['first', 'second'].map(id => `<section id="panel-${id}" class="cx-tabpanel" role="tabpanel"
    aria-labelledby="tab-${id}"><p>${id} content</p></section>`).join('')}
</div><button id="outside">Outside</button>`;

for (const veto of ['callback', 'event']) {
  test(`an automatic ${veto} veto pauses until explicit Play without moving user focus`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.install(); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openUi(page, markup, `window.attempts = 0; window.allow = false;
      document.getElementById('sections').addEventListener('cx-tabs:beforechange', event => {
        window.attempts++;
        if ('${veto}' === 'event' && !window.allow) event.preventDefault();
      });
      window.sections = CanopyX.tabs('#sections', {
        autoProgress: { interval: 2000, pauseOnHover: false },
        beforeChange: () => '${veto}' !== 'callback' || window.allow
      });`);
    await page.locator('#outside').focus(); await page.clock.runFor(2100);
    expect(await page.evaluate(() => window.attempts)).toBe(1);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('#outside')).toBeFocused();
    await page.locator('#outside').focus(); await page.clock.runFor(6000);
    expect(await page.evaluate(() => window.attempts)).toBe(1);
    expect(await page.evaluate(() => sections.getSelected())).toBe('first');
    await page.evaluate(() => { window.allow = true; });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.locator('#outside').focus(); await page.clock.runFor(2100);
    expect(await page.evaluate(() => window.attempts)).toBe(2);
    expect(await page.evaluate(() => sections.getSelected())).toBe('second');
    expect(errors).toEqual([]);
  });
}
