import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { repo } from './support.mjs';
import { openUi } from './ui-support.mjs';

// The .NET contract test compares these shared fixtures with actual builder output.
const contracts = fs.readFileSync(path.join(repo, 'CanopyX.Tests/Html/UiRuntimeContractTests.cs'), 'utf8');
const roles = fs.readFileSync(path.join(repo, 'tests/fixtures/hfx-role-host.css'), 'utf8');
function fixture(name) {
  const match = contracts.match(new RegExp(`private const string ${name} = """\\r?\\n([\\s\\S]*?)\\r?\\n\\s*""";`));
  if (!match) throw new Error('Missing typed stepper fixture: ' + name);
  return match[1].replace(/^ {8}/gm, '');
}
function markup(optionalActions = true, placement = 'side') {
  return `<style>${roles}</style><div id="container" style="width:900px;max-width:100%">` +
    fixture('StepperContractMarkup').replace('{{footer}}', fixture(optionalActions ? 'StepperLabelsFooter' : 'StepperOmittedFooter'))
      .replace('data-cx-stepper=""', `data-cx-stepper="" data-vertical="${placement}"`) + '</div>';
}
const init = (options = '{}') => `window.wizard = CanopyX.stepper('#wizard', ${options});`;
const action = (page, name) => page.locator(`.cx-stepper-footer [data-cx-stepper-action="${name}"]`);

test.use({ viewport: { width: 1200, height: 900 } });

for (const placement of ['side', 'inline']) {
  test(`vertical ${placement} preserves live forms through wide-phone-wide without overflow`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openUi(page, markup(true, placement), init());
    const root = page.locator('#wizard');
    await expect(root).toHaveAttribute('data-phone', 'false');
    await expect(root).toHaveAttribute('data-vertical', placement);
    await page.getByRole('textbox', { name: 'Note' }).fill('Keep this note');
    await page.evaluate(() => {
      window.originalInput = document.querySelector('#note');
      window.originalPanel = document.querySelector('#wizard-panel-first');
      window.edits = 0; originalInput.addEventListener('input', () => edits++);
    });
    const panelParent = () => page.locator('#wizard-panel-first').evaluate(el => el.parentElement.id);
    expect(await panelParent()).toBe(placement === 'inline' ? 'wizard-step-first' : 'wizard');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(root).toHaveAttribute('data-phone', 'true');
    await expect(root.locator(':scope > ol')).toBeHidden();
    await expect(root.locator(':scope > .cx-stepper-phone')).toBeVisible();
    expect(await panelParent()).toBe('wizard');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await root.evaluate(el => {
      const width = el.getBoundingClientRect().width;
      const panel = el.querySelector('#wizard-panel-first'), footer = el.querySelector('.cx-stepper-footer');
      return panel.getBoundingClientRect().width <= width && footer.getBoundingClientRect().width <= width &&
        getComputedStyle(panel).gridColumnStart === '1' && getComputedStyle(footer).gridColumnStart === '1';
    })).toBe(true);
    await page.getByRole('textbox', { name: 'Note' }).fill('Edited on phone');
    await action(page, 'next').click();
    await expect(page.locator('#wizard-panel-optional')).toBeVisible();
    await action(page, 'back').click();
    await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Edited on phone');

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(root).toHaveAttribute('data-phone', 'false');
    await expect(root.locator(':scope > ol')).toBeVisible();
    await expect.poll(panelParent).toBe(placement === 'inline' ? 'wizard-step-first' : 'wizard');
    await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Edited on phone');
    expect(await page.evaluate(() => document.querySelector('#note') === originalInput &&
      document.querySelector('#wizard-panel-first') === originalPanel && edits > 0)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('typed labels survive first to optional to last, and back to next', async ({ page }) => {
  await openUi(page, markup(), init());
  await expect(action(page, 'next')).toHaveText('Next "<&');
  await expect(action(page, 'save-draft')).toHaveText('Draft "<&');
  await expect(action(page, 'finish')).toHaveCount(0);
  await action(page, 'next').click();
  await expect(action(page, 'skip')).toBeVisible();
  await expect(action(page, 'skip')).toHaveText('Skip "<&');
  await expect(action(page, 'back')).toHaveText('Back "<&');
  await action(page, 'skip').click();
  await expect(action(page, 'finish')).toHaveText('Finish "<&');
  await expect(action(page, 'finish')).toBeVisible();
  await action(page, 'back').click();
  await expect(action(page, 'next')).toHaveText('Next "<&');
  await expect(action(page, 'next')).toBeVisible();
  expect(await page.locator('.cx-stepper-footer').evaluate(el => el.querySelector('script') === null &&
    Array.from(el.querySelectorAll('button')).every(button => button.childElementCount === 0))).toBe(true);
});

test('typed null labels keep optional actions omitted throughout navigation', async ({ page }) => {
  await openUi(page, markup(false), init());
  await action(page, 'next').click();
  await expect(page.locator('#wizard-panel-optional')).toBeVisible();
  await expect(action(page, 'skip')).toHaveCount(0);
  await expect(action(page, 'save-draft')).toHaveCount(0);
  await action(page, 'next').click();
  await expect(action(page, 'finish')).toHaveText('Finish "<&');
  await action(page, 'back').click();
  await expect(page.locator('#wizard-panel-optional')).toBeVisible();
  await expect(action(page, 'skip')).toHaveCount(0);
});

test('explicit runtime labels and skip intent override typed footer metadata', async ({ page }) => {
  await openUi(page, markup(false, 'inline'), init(`{
    vertical: 'side', skip: true, skipLabel: 'Runtime skip', saveDraftLabel: 'Runtime draft',
    backLabel: 'Runtime back', nextLabel: 'Runtime next', finishLabel: 'Runtime finish'
  }`));
  await expect(page.locator('#wizard')).toHaveAttribute('data-vertical', 'side');
  await expect(action(page, 'save-draft')).toHaveText('Runtime draft');
  await expect(action(page, 'next')).toHaveText('Runtime next');
  await action(page, 'next').click();
  await expect(action(page, 'skip')).toHaveText('Runtime skip');
  await expect(action(page, 'back')).toHaveText('Runtime back');
  await action(page, 'skip').click();
  await expect(action(page, 'finish')).toHaveText('Runtime finish');
});

test('runtime skip false suppresses the typed optional action', async ({ page }) => {
  await openUi(page, markup(), init('{ skip: false }'));
  await action(page, 'next').click();
  await expect(page.locator('#wizard-panel-optional')).toBeVisible();
  await expect(action(page, 'skip')).toHaveCount(0);
});

test('preparePrint forwards to deferred loading without navigating or visiting steps', async ({ page }) => {
  await openUi(page, markup(), `window.printLoads = []; window.printChanges = 0;
    document.querySelector('#wizard').addEventListener('cx-stepper:change', () => printChanges++);
    ${init(`{ steps: [{ id: 'optional', deferred: true, loader: item => {
      printLoads.push({ id: item.id, state: item.state, visited: item.visited });
      return '<p>Prepared optional print content</p>';
    } }] }`)}
  `);
  const before = await page.evaluate(() => wizard.getState());
  await page.evaluate(() => wizard.preparePrint());
  expect(await page.evaluate(() => wizard.getState())).toEqual(before);
  expect(await page.evaluate(() => printChanges)).toBe(0);
  expect(await page.evaluate(() => printLoads)).toEqual([{ id: 'optional', state: 'upcoming', visited: false }]);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Prepared optional print content', { exact: true })).toBeVisible();
});

test('callback and event records agree with current state across validation, loaders, changes and reset', async ({ page }) => {
  await openUi(page, markup(), `
    window.samples = []; window.callbackRecords = new Map();
    window.invalid = true; window.failLoader = true; window.throwGuard = false;
    const root = document.querySelector('#wizard');
    window.capture = (kind, records) => {
      records.filter(Boolean).forEach(item => callbackRecords.set(item.id, item));
      const actual = records.filter(Boolean).map(({ id, state, visited }) => ({ id, state, visited }));
      const dom = records.filter(Boolean).map(item => ({ id: item.id, state: item.element.dataset.state, visited: item.element.dataset.visited === 'true' }));
      const state = wizard.getState();
      const expected = actual.map(item => {
        const step = state.steps.find(step => step.id === item.id);
        return { id: step.id, state: step.state, visited: step.visited };
      });
      samples.push({ kind, actual, expected, dom });
    };
    for (const kind of ['beforechange', 'change', 'load', 'error', 'finish']) root.addEventListener('cx-stepper:' + kind, event => {
      const detail = event.detail;
      capture(kind, [detail.from, detail.to, detail.item, detail.step]);
    });
    ${init(`{
      resetForwardOnBack: true,
      validate: item => { capture('validate', [item]); return invalid ? ['Fix the note'] : true; },
      beforeChange: (from, to) => {
        capture('guard', [from, to]); if (throwGuard) throw new Error('Guard failed'); return true;
      },
      steps: [{ id: 'optional', deferred: true, loader: item => {
        capture('loader', [item]); if (failLoader) throw new Error('Load failed'); return '<p>Loaded optional</p>';
      } }]
    }`)}
  `);
  expect(await page.evaluate(() => wizard.next())).toBe(false);
  await expect(page.locator('#wizard-step-first')).toHaveAttribute('data-state', 'error');
  expect(await page.evaluate(async () => { invalid = false; return wizard.next(); })).toBe(true);
  await expect(page.getByRole('alert')).toContainText('Load failed');
  await page.evaluate(() => { failLoader = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Loaded optional', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => wizard.setStepState('optional', 'error'))).toBe(true);
  expect(await page.evaluate(() => {
    const { state, visited } = callbackRecords.get('optional');
    return { state, visited };
  })).toEqual({ state: 'error', visited: true });
  expect(await page.evaluate(() => wizard.next())).toBe(true);
  expect(await page.evaluate(() => wizard.back())).toBe(true);
  expect(await page.evaluate(() => wizard.back())).toBe(true);
  expect(await page.evaluate(() => wizard.getState().steps.slice(1).map(step => [step.state, step.visited]))).toEqual([
    ['upcoming', false], ['upcoming', false]
  ]);
  expect(await page.evaluate(async () => { throwGuard = true; return wizard.next(); })).toBe(false);
  expect(await page.evaluate(async () => { throwGuard = false; return wizard.next(); })).toBe(true);
  expect(await page.evaluate(() => wizard.skip())).toBe(true);
  expect(await page.evaluate(() => wizard.finish())).toBe(true);
  const samples = await page.evaluate(() => samples);
  expect(new Set(samples.map(sample => sample.kind))).toEqual(new Set(['validate', 'beforechange', 'guard', 'change', 'loader', 'load', 'error', 'finish']));
  for (const sample of samples) {
    expect(sample.actual, sample.kind).toEqual(sample.expected);
    expect(sample.dom, sample.kind).toEqual(sample.expected.map(({ id, state, visited }) => ({ id, state, visited })));
  }
  expect(samples.some(sample => sample.kind === 'validate' && sample.actual[0].state === 'error')).toBe(true);
  expect(samples.find(sample => sample.kind === 'finish').actual[0]).toMatchObject({ state: 'done', visited: true });
});
