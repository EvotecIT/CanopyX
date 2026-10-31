import { test, expect } from '@playwright/test';
import { uiPage, openUi } from './ui-support.mjs';

test.use({ viewport: { width: 1280, height: 900 } });

// Mirror the public .NET markup contract, including headings and local IDs.
// Tests exercise the public controllers and real keyboard/picker interactions.
function tabs(id = 'sections', extra = '', entries = [
  { id: 'overview', label: 'Overview' }, { id: 'checks', label: 'Checks', badge: '3' },
  { id: 'locked', label: 'Locked', disabled: true }, { id: 'audit', label: 'Audit' }
]) {
  return `<div id="${id}" class="cx-tabs cx-tabs--underline" data-cx-tabs data-hfx-part="tabs" data-print="all" ${extra}>
    <div class="cx-tablist" role="tablist" aria-label="Sections" aria-orientation="horizontal">${entries.map((item, index) => `
      <button type="button" class="cx-tab" role="tab" data-hfx-part="tab" id="${id}-tab-${item.id}" data-tab-id="${item.id}"
        aria-controls="${id}-panel-${item.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" ${item.disabled ? 'aria-disabled="true"' : ''}>
        <span class="cx-tab-label">${item.label}</span>${item.badge ? `<span class="cx-tab-badge" data-hfx-part="badge">${item.badge}</span>` : ''}</button>`).join('')}
    </div>${entries.map(item => `<section id="${id}-panel-${item.id}" class="cx-tabpanel" data-hfx-part="tabpanel" role="tabpanel" aria-labelledby="${id}-tab-${item.id}" tabindex="0">
      <h3 class="cx-tabpanel-heading" data-hfx-part="title">${item.label}</h3>${item.body || `<p>${item.label} content</p>`}</section>`).join('')}</div>`;
}

function stepper(extra = '') {
  const entries = [{ id: 'scope', label: 'Scope' }, { id: 'details', label: 'Details', optional: true }, { id: 'review', label: 'Review' }];
  return `<div id="wizard" class="cx-stepper-host" data-cx-stepper data-linear="true" data-mode="interactive" ${extra}>
    <ol class="cx-stepper cx-stepper--horizontal" aria-label="Setup">${entries.map((item, index) => `
      <li id="wizard-step-${item.id}" class="cx-step" data-hfx-part="step" data-step-id="${item.id}" data-optional="${!!item.optional}" data-visited="false"
        data-state="${index ? 'upcoming' : 'current'}" ${index ? '' : 'aria-current="step"'}>
        <span class="cx-step-marker" data-hfx-part="step-marker" aria-hidden="true">${index + 1}</span><span class="cx-step-label">${item.label}</span>
        <span class="cx-visually-hidden">Step ${index + 1}</span></li>`).join('')}</ol>
    ${entries.map(item => `<section id="wizard-panel-${item.id}" class="cx-step-panel" data-hfx-part="step-panel" aria-labelledby="wizard-heading-${item.id}">
      <h3 id="wizard-heading-${item.id}" data-hfx-part="title" tabindex="-1">${item.label}</h3>
      ${item.id === 'scope' ? '<label>Tenant<input id="tenant" required aria-describedby="tenant-help"></label><p id="tenant-help">Choose a tenant</p>' : `<p>${item.label} content</p>`}</section>`).join('')}
    <div class="cx-stepper-footer" data-hfx-part="footer"><span class="cx-step-position">Step 1 of 3</span><button type="button" data-cx-stepper-action="next">Next</button></div>
    <div class="cx-visually-hidden" aria-live="polite" aria-atomic="true">Step 1 of 3: Scope</div></div>`;
}

const initTabs = options => `window.tabs = CanopyX.tabs(document.querySelector('#sections'), ${options});`;
const initStepper = options => `window.wizard = CanopyX.stepper(document.querySelector('#wizard'), ${options});`;

test('tabs keep disabled tabs focusable without activating them', async ({ page }) => {
  await openUi(page, tabs(), initTabs('{}'));
  const overview = page.getByRole('tab', { name: 'Overview' });
  await overview.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Checks 3' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Locked' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Locked' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Checks 3' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tabpanel', { name: 'Audit' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(overview).toHaveAttribute('aria-selected', 'true');
});

test('manual activation and RTL arrows preserve the panel until Enter', async ({ page }) => {
  await openUi(page, tabs('sections', 'dir="rtl"'), initTabs("{ activation: 'manual' }"));
  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Checks 3' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('tab', { name: 'Checks 3' })).toBeFocused();
});

test('pending guards leave selection stable and the latest request wins', async ({ page }) => {
  await openUi(page, tabs(), initTabs(`{ beforeChange: (from, to) => new Promise(resolve => { (window.guards ||= {})[to.id] = resolve; }) }`));
  await page.evaluate(() => { window.first = tabs.select('checks'); });
  await expect(page.getByRole('tab', { name: 'Checks 3' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
  await page.evaluate(() => { window.second = tabs.select('audit'); });
  await page.evaluate(() => guards.audit(true));
  await expect(page.getByRole('tabpanel', { name: 'Audit' })).toBeVisible();
  await page.evaluate(() => guards.checks(true));
  expect(await page.evaluate(() => first)).toBe(false);
  await expect(page.getByRole('tabpanel', { name: 'Audit' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Checks 3' })).not.toHaveAttribute('aria-busy', 'true');
});

test('sync event cancellation and async cancellation return focus to the selected tab', async ({ page }) => {
  await openUi(page, tabs(), initTabs(`{ beforeChange: async () => false }`));
  await page.getByRole('tab', { name: 'Checks 3' }).click();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
  expect(await page.evaluate(() => tabs.getSelected())).toBe('overview');
  await page.evaluate(async () => {
    tabs.destroy();
    document.querySelector('#sections').addEventListener('cx-tabs:beforechange', event => event.preventDefault());
    window.tabs = CanopyX.tabs(document.querySelector('#sections'), {}); await tabs.ready;
    window.cancelled = await tabs.select('audit');
  });
  expect(await page.evaluate(() => cancelled)).toBe(false);
  await expect(page.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
});

test('deferred templates keep live content across revisits and loaders retry failures', async ({ page }) => {
  const markup = tabs('sections', '', [{ id: 'overview', label: 'Overview' },
    { id: 'checks', label: 'Checks', body: '<template><label>Note<input value="initial"></label></template>' }, { id: 'audit', label: 'Audit' }]);
  await openUi(page, markup, initTabs(`{ tabs: [{ id: 'audit', deferred: true, loader: async () => {
    window.attempts = (window.attempts || 0) + 1; if (attempts === 1) throw new Error('Service unavailable'); return '<p>Loaded audit</p>';
  } }] }`));
  await page.getByRole('tab', { name: 'Checks' }).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Keep this note');
  await page.getByRole('tab', { name: 'Overview' }).click(); await page.getByRole('tab', { name: 'Checks' }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Keep this note');
  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByRole('alert')).toContainText('Service unavailable');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Loaded audit', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => attempts)).toBe(2);
});

test('late deferred results cannot overwrite a newer selection or survive destroy', async ({ page }) => {
  await openUi(page, tabs(), initTabs(`{ tabs: [{ id: 'checks', deferred: true, loader: () => new Promise(resolve => { window.loaded = resolve; }) }] }`));
  await page.getByRole('tab', { name: 'Checks 3' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Audit' }).click();
  await page.evaluate(() => loaded('<p>Stale content</p>'));
  await expect(page.getByText('Stale content')).toHaveCount(0);
  await expect(page.getByRole('tabpanel', { name: 'Audit' })).toBeVisible();
  await page.evaluate(() => { window.waiting = tabs.select('checks'); });
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => { tabs.destroy(); loaded('<p>After destroy</p>'); });
  expect(await page.evaluate(() => waiting)).toBe(false);
  await expect(page.getByText('After destroy')).toHaveCount(0);
});

test('keepAlive false reloads deferred content after leaving', async ({ page }) => {
  await openUi(page, tabs(), initTabs(`{ keepAlive: false, tabs: [{ id: 'checks', deferred: true,
    loader: async () => '<p>Visit ' + (window.visits = (window.visits || 0) + 1) + '</p>' }] }`));
  await page.getByRole('tab', { name: 'Checks 3' }).click();
  await expect(page.getByText('Visit 1', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click(); await page.getByRole('tab', { name: 'Checks 3' }).click();
  await expect(page.getByText('Visit 2', { exact: true })).toBeVisible();
});

test('two hash tab sets preserve each other and respond to hashchange', async ({ page }) => {
  await openUi(page, tabs() + tabs('other'), `history.replaceState(null, '', '#sections=checks&other=audit');
    ${initTabs('{ hash: true }')} window.other = CanopyX.tabs(document.querySelector('#other'), { hash: true });`);
  await expect(page.locator('#sections-panel-checks')).toBeVisible();
  await expect(page.locator('#other-panel-audit')).toBeVisible();
  await page.locator('#sections-tab-audit').click();
  expect(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('other'))).toBe('audit');
  await page.evaluate(() => { location.hash = 'sections=overview&other=checks'; });
  await expect(page.locator('#sections-panel-overview')).toBeVisible();
  await expect(page.locator('#other-panel-checks')).toBeVisible();
});

test('tabs collapse only at measured overflow with resize hysteresis and focus return', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:620px">${tabs()}</div>`, initTabs('{}'));
  const list = page.getByRole('tablist'); await expect(list).toBeVisible();
  const required = await list.evaluate(element => {
    const tabs = [...element.querySelectorAll('[role="tab"]')];
    return tabs.reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0) + (tabs.length - 1) * parseFloat(getComputedStyle(element).gap);
  });
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  const resize = width => page.evaluate(width => { document.querySelector('#container').style.width = width + 'px'; }, width);
  await resize(required - 2); await expect(list).toBeHidden();
  const picker = page.locator('.cx-tabs-phone-picker .cx-picker-trigger'); await expect(picker).toBeFocused();
  await resize(required + 4); await expect(list).toBeHidden();
  await resize(required + 12); await expect(list).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeFocused();
});

test('overflow menus keep visible tabs before a measured narrow-container picker', async ({ page }) => {
  const entries = Array.from({ length: 8 }, (_, i) => ({ id: 'section-' + i, label: 'Workspace ' + i }));
  await openUi(page, `<div id="container" style="width:620px">${tabs('sections', '', entries)}</div>`, initTabs("{ overflow: 'menu' }"));
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.locator('.cx-tabs-more .cx-picker-trigger')).toBeVisible();
  const visible = await page.getByRole('tab').count(); expect(visible).toBeGreaterThanOrEqual(3); expect(visible).toBeLessThan(8);
  const more = page.locator('.cx-tabs-more .cx-picker-trigger'); await more.click();
  await page.getByRole('menuitemradio', { name: 'Workspace 7', exact: true }).click();
  await expect(more).toContainText('Workspace 7'); await more.focus();
  const minimum = await page.locator('#sections').evaluate(element => {
    const list = element.querySelector('[role="tablist"]'), gap = parseFloat(getComputedStyle(list).gap);
    return [...list.querySelectorAll('[role="tab"]')].slice(0,3).reduce((sum,tab) => sum + tab.getBoundingClientRect().width + gap, 0)
      + element.querySelector('.cx-tabs-more').getBoundingClientRect().width;
  });
  await page.evaluate(width => { document.querySelector('#container').style.width = width + 'px'; }, minimum - 2);
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(page.locator('.cx-tabs-phone-picker .cx-picker-trigger')).toBeVisible();
  await expect(page.locator('.cx-tabs-phone-picker .cx-picker-trigger')).toBeFocused();
});

test('tabs collapse on container resize and the picker retains badges', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openUi(page, `<div id="container" style="width:900px">${tabs()}</div>`, initTabs('{}'));
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.evaluate(() => { document.querySelector('#container').style.width = '260px'; });
  await expect(page.getByRole('tablist')).toBeHidden();
  const picker = page.locator('.cx-tabs-phone-picker').getByRole('button');
  await picker.click();
  await page.getByRole('menuitemradio', { name: /Checks.*3/ }).click();
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toBeVisible();
  await expect(picker).toContainText('3');
  await page.evaluate(() => { document.querySelector('#container').style.width = '900px'; });
  await expect(page.getByRole('tab', { name: 'Checks 3' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tablist')).toBeVisible();
});

test('overflow menu can select a hidden tab while pills wrap without a menu', async ({ page }) => {
  const entries = Array.from({ length: 8 }, (_, index) => ({ id: 's' + index, label: 'Long section ' + index, badge: String(index) }));
  await openUi(page, `<div style="width:700px">${tabs('sections', 'data-collapse="none"', entries)}</div>`, initTabs("{ overflow: 'menu' }"));
  await page.locator('.cx-tabs-more').getByRole('button').click();
  await page.getByRole('menuitemradio', { name: /Long section 7/ }).click();
  await expect(page.getByRole('tabpanel', { name: 'Long section 7' })).toBeVisible();
  await expect(page.locator('.cx-tabs-more')).toContainText('Long section 7');
  await page.evaluate(async () => { tabs.destroy(); window.tabs = CanopyX.tabs(document.querySelector('#sections'), { style: 'pills', overflow: 'wrap', collapse: 'none' }); await tabs.ready; });
  await expect(page.getByRole('tab')).toHaveCount(8);
  expect(await page.getByRole('tab').last().evaluate(el => el.getBoundingClientRect().top > el.parentElement.firstElementChild.getBoundingClientRect().top)).toBe(true);
});

test('auto progress pauses, resumes and stops after user selection', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-23T12:00:01Z'));
  await openUi(page, tabs(), initTabs('{ autoProgress: { interval: 2000, pauseOnHover: true, pauseOnFocus: true } }'));
  await page.mouse.move(1200, 800);
  await page.clock.runFor(2100);
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.mouse.move(1200, 800); await page.getByRole('button', { name: 'Play', exact: true }).blur();
  await page.clock.runFor(5000);
  await expect(page.getByRole('tabpanel', { name: 'Checks' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).blur(); await page.mouse.move(1200, 800);
  await page.clock.runFor(2100);
  await expect(page.getByRole('tabpanel', { name: 'Audit' })).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click(); await page.getByRole('tab', { name: 'Overview' }).blur();
  await page.mouse.move(1200, 800); await page.clock.runFor(5000);
  await expect(page.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
});

test('stepper validates, links and focuses errors, then completes and skips steps', async ({ page }) => {
  await openUi(page, stepper(), initStepper("{ validate: () => document.querySelector('#tenant').value ? true : ['Choose a tenant'] }"));
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Choose a tenant'); await expect(alert).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Tenant' })).toHaveAttribute('aria-describedby', /tenant-help.*validation/);
  await expect(page.locator('#wizard-step-scope')).toHaveAttribute('data-state', 'error');
  await page.getByRole('textbox', { name: 'Tenant' }).fill('Lab');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#wizard-heading-details')).toBeFocused();
  await expect(page.locator('#wizard-step-scope')).toHaveAttribute('data-state', 'done');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('#wizard-step-details')).toHaveAttribute('data-state', 'skipped');
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeVisible();
  await page.evaluate(() => { window.finished = 0; document.querySelector('#wizard').addEventListener('cx-stepper:finish', () => finished++); });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  expect(await page.evaluate(() => wizard.getState().finished)).toBe(true);
  expect(await page.evaluate(() => finished)).toBe(1);
});

test('linear navigation locks forward jumps and preserves ordinary button tab order', async ({ page }) => {
  await openUi(page, stepper(), initStepper('{}'));
  expect(await page.evaluate(() => wizard.select('review'))).toBe(false);
  await expect(page.locator('#wizard-step-review button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const scope = page.locator('#wizard-step-scope button');
  await expect(scope).toHaveAccessibleName(/Scope.*Step 1.*Completed/);
  await expect(scope).not.toHaveAttribute('tabindex', '-1');
  await scope.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#wizard-heading-scope')).toBeFocused();
  await expect(page.locator('#wizard-step-details button')).toBeVisible();
});

test('late step validation cannot advance after a newer back action', async ({ page }) => {
  await openUi(page, stepper(), initStepper(`{ validate: step => step.id === 'details' ? new Promise(resolve => { window.validated = resolve; }) : true }`));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#wizard-step-review')).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#wizard-panel-scope')).toBeVisible();
  await page.evaluate(() => validated(['Late failure']));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#wizard-step-details')).not.toHaveAttribute('data-state', 'error');
});

test('cancelling step leave does not mark a step done', async ({ page }) => {
  await openUi(page, stepper(), initStepper('{ beforeChange: async () => false }'));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#wizard-panel-scope')).toBeVisible();
  await expect(page.locator('#wizard-step-scope')).toHaveAttribute('data-state', 'current');
  expect(await page.evaluate(() => wizard.getState().steps.find(step => step.id === 'scope').state)).not.toBe('done');
});

test('late Finish validation cannot finish after Back and resetting forward state locks it again', async ({ page }) => {
  await openUi(page, stepper(), initStepper(`{ resetForwardOnBack: true, validate: step => step.id === 'review'
    ? new Promise(resolve => { window.finishValidation = resolve; }) : true }`));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.evaluate(() => { window.finishEvents = 0; document.querySelector('#wizard').addEventListener('cx-stepper:finish', () => finishEvents++); });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('#wizard-step-review')).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.evaluate(() => finishValidation(true));
  expect(await page.evaluate(() => finishEvents)).toBe(0);
  expect(await page.evaluate(() => wizard.getState().finished)).toBe(false);
  expect(await page.evaluate(() => wizard.select('review'))).toBe(false);
  await expect(page.locator('#wizard-step-review button')).toHaveCount(0);
});

test('report and static modes keep their server markup free of generated controls', async ({ page }) => {
  const report = `<div class="cx-stepper-host" data-cx-stepper data-mode="report">
    <section class="cx-step-panel"><h3><span class="cx-step-marker">✓</span>Scope</h3><p class="cx-step-state">Completed</p><p>Report scope</p></section>
    <section class="cx-step-panel"><h3>Details</h3><p class="cx-step-state">Skipped</p><p>Report details</p></section></div>`;
  const staticHeader = `<div class="cx-stepper-host" data-cx-stepper data-mode="static"><ol class="cx-stepper" aria-label="Static progress">
    <li class="cx-step" data-state="current" aria-current="step"><span class="cx-step-marker">1</span><span class="cx-step-label">Scope</span></li></ol></div>`;
  await openUi(page, report + staticHeader);
  await expect(page.getByText('Report scope')).toBeVisible();
  await expect(page.getByText('Report details')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Static progress' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('phone stepper uses the shared picker with locked steps and progress', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openUi(page, `<div id="container" style="width:900px">${stepper()}</div>`, initStepper('{}'));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.evaluate(() => { document.querySelector('#container').style.width = '390px'; });
  await expect(page.locator('ol.cx-stepper')).toBeHidden();
  await page.locator('.cx-stepper-phone [data-hfx-part="picker"]').getByRole('button').click();
  await expect(page.getByRole('menuitemradio', { name: /Review/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('menuitemradio', { name: /Scope/ }).click();
  await expect(page.locator('#wizard-panel-scope')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 1 of 3');
});

test('vertical inline stepper preserves live form nodes through resize and print shows every panel', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:900px">${stepper()}</div>`, initStepper("{ vertical: 'inline', linear: false }"));
  await page.getByRole('textbox', { name: 'Tenant' }).fill('Preserved');
  await page.evaluate(async () => { await wizard.select('review'); await wizard.select('scope'); });
  await expect(page.getByRole('textbox', { name: 'Tenant' })).toHaveValue('Preserved');
  await page.evaluate(() => { document.querySelector('#container').style.width = '390px'; });
  await expect(page.locator('#wizard > #wizard-panel-scope')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  for (const id of ['scope', 'details', 'review']) await expect(page.locator('#wizard-panel-' + id)).toBeVisible();
  await expect(page.locator('.cx-stepper-footer')).toBeHidden();
});

test('reduced motion uses instant panel changes and printing exposes all tab headings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUi(page, tabs(), initTabs("{ transition: 'slide' }"));
  await page.getByRole('tab', { name: 'Audit' }).click();
  expect(await page.locator('#sections-panel-audit').evaluate(el => el.getAnimations().length)).toBe(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('tabpanel')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeHidden();
});

test('without JavaScript every tab panel remains readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setContent(await uiPage(tabs()));
    for (const name of ['Overview', 'Checks', 'Locked', 'Audit']) await expect(page.getByRole('tabpanel', { name })).toBeVisible();
  } finally { await context.close(); }
});
