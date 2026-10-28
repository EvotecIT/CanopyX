import { test, expect } from '@playwright/test';
import { uiPage, openUi } from './ui-support.mjs';
test.use({ viewport: { width: 1600, height: 1000 } });

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


const wideTabs = () => tabs('sections', '', Array.from({ length: 8 }, (_, i) => ({ id: 's' + (i + 1), label: 'Workspace ' + (i + 1), body: '<label>Note<input value="unchanged"></label>' })));
const resize = (page, width) => page.locator('#container').evaluate((el, width) => { el.style.width = width + 'px'; }, width);

test('tabs retain focus when the selected tab enters More and More disappears', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:1500px">${wideTabs()}</div>`, initTabs("{ overflow: 'menu' }"));
  await page.evaluate(async () => { await tabs.select('s7'); });
  const selected = page.getByRole('tab', { name: 'Workspace 7', exact: true });
  const more = page.locator('.cx-tabs-more > button');
  await selected.focus(); await resize(page, 620);
  await expect(more).toBeVisible(); await expect(more).toBeFocused();
  expect(await page.evaluate(() => tabs.getSelected())).toBe('s7');
  await resize(page, 1500);
  await expect(more).toBeHidden(); await expect(selected).toBeFocused();
});

test('tabs expanding from the full picker focus More for an overflowed selection and retain panel focus', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:390px">${wideTabs()}</div>`, initTabs("{ overflow: 'menu' }"));
  await page.evaluate(async () => { await tabs.select('s7'); });
  const phone = page.locator('.cx-tabs-phone-picker > button'), more = page.locator('.cx-tabs-more > button');
  await phone.focus(); await resize(page, 620);
  await expect(phone).toBeHidden(); await expect(more).toBeFocused();
  await resize(page, 390); await expect(phone).toBeFocused();
  const note = page.getByRole('tabpanel', { name: 'Workspace 7' }).getByRole('textbox', { name: 'Note' });
  await note.focus(); await resize(page, 1500);
  await expect(page.getByRole('tablist')).toBeVisible(); await expect(note).toBeFocused();
  await resize(page, 390); await expect(phone).toBeVisible(); await expect(note).toBeFocused();
});

test('stepper moves focus between its desktop navigation and phone picker', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:900px">${stepper()}</div>`, initStepper('{ linear: false }'));
  await page.evaluate(async () => { await wizard.select('review'); });
  await page.locator('#wizard-step-scope > .cx-step-btn').focus();
  const picker = page.locator('.cx-stepper-phone [data-hfx-part="picker"] > button');
  await resize(page, 390); await expect(picker).toBeVisible(); await expect(picker).toBeFocused();
  await resize(page, 900); await expect(picker).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeFocused();
});

for (const vertical of [false, 'inline']) test(`stepper keeps live form, footer and outside focus during ${vertical || 'horizontal'} resizing`, async ({ page }) => {
  await openUi(page, `<label>Outside<input id="outside"></label><div id="container" style="width:900px">${stepper()}</div>`, initStepper(JSON.stringify({ linear: false, vertical })));
  const input = page.getByRole('textbox', { name: 'Tenant' }), footer = page.locator('.cx-stepper-footer [data-cx-stepper-action="next"]');
  await input.fill('Preserved');
  for (const width of [390, 900]) { await resize(page, width); await expect(page.locator('#wizard')).toHaveAttribute('data-phone', String(width < 640)); await expect(input).toBeFocused(); }
  await expect(input).toHaveValue('Preserved');
  await footer.focus();
  for (const width of [390, 900]) { await resize(page, width); await expect(page.locator('#wizard')).toHaveAttribute('data-phone', String(width < 640)); await expect(footer).toBeFocused(); }
  const outside = page.getByRole('textbox', { name: 'Outside' }); await outside.focus();
  await resize(page, 390); await expect(page.locator('#wizard')).toHaveAttribute('data-phone', 'true'); await expect(outside).toBeFocused();
});

for (const [from, to, control] of [[620, 1500, 'tab'], [390, 620, 'more'], [390, 1500, 'tab'], [620, 390, 'phone']]) {
  test(`tabs retain portaled picker choice focus from ${from} to ${to}`, async ({ page }) => {
    await openUi(page, `<div id="container" style="width:${from}px">${wideTabs()}</div>`, initTabs("{ overflow: 'menu' }"));
    const more = page.locator('.cx-tabs-more > button'), phone = page.locator('.cx-tabs-phone-picker > button');
    await (from === 620 ? more : phone).click(); await page.getByRole('menuitemradio', { name: 'Workspace 7', exact: true }).focus();
    await resize(page, to);
    const target = control === 'tab' ? page.getByRole('tab', { name: 'Workspace 7', exact: true }) : control === 'more' ? more : phone;
    await expect(target).toBeFocused(); expect(await page.evaluate(() => tabs.getSelected())).toBe('s1');
  });
}

for (const width of [900, 360]) test(`stepper retains portaled picker focus when resized to ${width}`, async ({ page }) => {
  await openUi(page, `<div id="container" style="width:390px">${stepper()}</div>`, initStepper('{ linear: false }'));
  const picker = page.locator('.cx-stepper-phone [data-hfx-part="picker"] > button');
  await picker.click(); await page.getByRole('menuitemradio', { name: /Review/ }).focus(); await resize(page, width);
  await expect(width < 640 ? picker : page.getByRole('heading', { name: 'Scope', exact: true })).toBeFocused();
  expect(await page.evaluate(() => wizard.getSelected())).toBe('scope');
});

test('stepper renders the back, completed and skipped glyphs as single intended characters', async ({ page }) => {
  await openUi(page, `<div id="container" style="width:390px">${stepper()}</div>`, initStepper('{ linear: false }'));
  await page.evaluate(async () => { await wizard.select('review'); wizard.setStepState('scope', 'done'); wizard.setStepState('details', 'skipped'); });
  await expect(page.locator('.cx-stepper-phone-back')).toHaveText('\u2039');
  await expect(page.locator('#wizard-step-scope .cx-step-marker')).toHaveText('\u2713');
  await expect(page.locator('#wizard-step-details .cx-step-marker')).toHaveText('\u2013');
});
