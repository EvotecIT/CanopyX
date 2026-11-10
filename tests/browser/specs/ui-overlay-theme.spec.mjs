import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

for (const kind of ['popover', 'tooltip', 'menu', 'dialog']) test(`an open ${kind} follows root and nested roles and preserves authored styles through close and destroy`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const tag = kind === 'dialog' ? 'dialog' : 'div';
  const content = kind === 'menu' ? '<button role="menuitem" class="cx-menu-item">Inspect<span class="cx-menu-badge">2</span></button>' : '<h2 data-hfx-part="title">Report scope</h2><div data-hfx-part="body"><div data-cx-tabs><div role="tablist" aria-label="Report sections"><button role="tab" aria-controls="report-panel">Summary</button></div><section id="report-panel" role="tabpanel">Report scope</section></div></div>';
  await openUi(page, `<style>#scope{margin-top:180px}.cx-tooltip{margin-top:8px}html{color-scheme:light;--hfx-color-surface:#fff;--hfx-color-surface-raised:#fff;--hfx-color-text:#16181c;--hfx-type-small-size:13px;--hfx-type-small-line:1.4;--hfx-type-body-size:14px;--hfx-type-body-line:1.5;--hfx-type-heading-size:18px;--hfx-type-heading-line:1.2;--hfx-type-caption-size:12px;--hfx-type-caption-line:1.25;--hfx-control-font-size:13px;--hfx-radius-overlay:10px;--hfx-elevation-2:0 2px 4px rgb(1,2,3)}
    html[data-theme=dark],#scope[data-theme=dark]{color-scheme:dark;--hfx-color-surface:#202a34;--hfx-color-surface-raised:#202a34;--hfx-color-text:#f4f5f6}
    #scope[data-theme=light]{color-scheme:light;--hfx-color-surface:#f0e8df;--hfx-color-surface-raised:#f0e8df;--hfx-color-text:#302820}</style>
    <section id="scope"><button id="trigger">Report scope</button><${tag} id="surface" class="cx-${kind}" data-cx-${kind} data-cx-trigger="trigger" role="${kind === 'tooltip' ? 'tooltip' : kind === 'menu' ? 'menu' : 'dialog'}" aria-label="Report scope" style="--hfx-border-width:2px !important;text-align:right" ${kind === 'dialog' ? '' : 'hidden'}>${content}</${tag}></section>`);
  await page.evaluate(async kind => { window.portalApi = CanopyX[kind]('#surface'); await portalApi.ready; await portalApi.open(); }, kind);
  const surface = page.locator('#surface'), type = ['dialog','popover'].includes(kind) ? surface.locator('[data-hfx-part=body]') : surface;
  const roles = async (target, size, radius, shadow) => page.evaluate(({ target, size, radius, shadow }) => {
    const style = document.querySelector(target).style;
    for (const role of ['small', 'heading', 'body', 'caption']) style.setProperty('--hfx-type-' + role + '-line-height', '1.75');
    style.setProperty('--hfx-type-small-size', size + 'px'); style.setProperty('--hfx-control-font-size', size + 'px');
    style.setProperty('--hfx-radius-overlay', radius + 'px'); style.setProperty('--hfx-elevation-2', shadow);
  }, { target, size, radius, shadow });
  const check = async (size, radius, shadow) => { await expect(type).toHaveCSS('font-size', size + 'px');
    if (kind === 'menu') await expect(surface.locator('.cx-menu-badge')).toHaveCSS('line-height', '21px');
    else { await expect(type).toHaveCSS('line-height', size * 1.75 + 'px');
      if (kind !== 'tooltip') { await expect(surface.locator('[data-hfx-part=title]')).toHaveCSS('line-height', '31.5px');
        await expect(surface.locator('[data-cx-tabs]')).toHaveCSS('line-height', '24.5px'); } }
    await expect(surface).toHaveCSS('border-radius', radius + 'px'); await expect(surface).toHaveCSS('box-shadow', shadow);
    if (kind === 'tooltip') await expect.poll(() => surface.evaluate(el => document.querySelector('#trigger').getBoundingClientRect().top - el.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(7.5);
  };
  await expect(surface).toBeVisible(); await expect(type).toHaveCSS('font-size', '13px');
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await expect(surface).toHaveCSS('background-color', 'rgb(32, 42, 52)'); await expect(surface).toHaveCSS('color-scheme', 'dark');
  await roles('html', 15, 18, '0 5px 9px rgb(7,8,9)'); await check(15, 18, 'rgb(7, 8, 9) 0px 5px 9px 0px');
  await page.evaluate(() => document.querySelector('#scope').dataset.theme = 'light');
  await roles('#scope', 17, 21, '0 7px 11px rgb(11,12,13)'); await check(17, 21, 'rgb(11, 12, 13) 0px 7px 11px 0px');
  await expect(surface).toHaveCSS('background-color', 'rgb(240, 232, 223)'); await expect(surface).toHaveCSS('color-scheme', 'light');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light'); await expect(type).toHaveCSS('font-size', '17px');
  await page.evaluate(() => { const scope = document.querySelector('#scope'); scope.removeAttribute('style'); scope.dataset.theme = 'dark'; });
  await expect(surface).toHaveCSS('background-color', 'rgb(32, 42, 52)'); await check(15, 18, 'rgb(7, 8, 9) 0px 5px 9px 0px');
  await page.evaluate(() => { const style = document.querySelector('#surface').style; style.setProperty('--hfx-radius-overlay', '31px', 'important'); style.textAlign = 'center'; });
  await roles('html', 19, 25, '0 5px 9px rgb(7,8,9)'); await expect(type).toHaveCSS('font-size', '19px'); await expect(surface).toHaveCSS('border-radius', '31px');
  for (const name of ['--hfx-radius-overlay','--hfx-border-width']) expect(await surface.evaluate((el,name) => el.style.getPropertyPriority(name), name)).toBe('important');
  for (const action of ['close', 'destroy']) {
    if (action === 'destroy') await page.evaluate(() => portalApi.open());
    await page.evaluate(action => portalApi[action](), action); await expect(surface).toBeHidden();
    expect(await surface.evaluate(el => el.parentElement.id)).toBe('scope');
    const saved = await surface.evaluate(el => ({ css:el.style.cssText, small:el.style.getPropertyValue('--hfx-type-small-size'),scheme:el.style.colorScheme,align:el.style.textAlign }));
    expect(saved).toMatchObject({ small:'',scheme:'',align:'center' });
    await roles('html', action === 'close' ? 29 : 33, action === 'close' ? 35 : 39, '0 9px 13px rgb(19,20,21)');
    await page.evaluate(action => document.querySelector('#scope').dataset.theme = action === 'close' ? 'light' : 'dark', action);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await surface.evaluate(el => el.style.cssText)).toBe(saved.css);
  }
  expect(errors).toEqual([]);
});
