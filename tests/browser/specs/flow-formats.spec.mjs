// Text field formats and masks (docs/flow.md#fields): the shared cases of tests/fixtures/flow-formats.json, which the server
// checks too, the hint under the label and the message.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { repo } from './support.mjs';
import { openFieldFlow } from './flow-page-support.mjs';

const cases = JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/flow-formats.json'), 'utf8'));
const formats = Object.keys(cases).filter(name => !name.startsWith('$'));

test('every shared case passes or fails as on the server', async ({ page }) => {
  await openFieldFlow(page, formats.map(format => ({ id: format, type: 'text', label: format, validation: { format } })));
  const results = await page.evaluate(async cases => {
    const outcome = {};
    for (const [format, { valid, invalid }] of Object.entries(cases)) {
      outcome[format] = { valid: [], invalid: [] };
      for (const value of [...valid, ...invalid]) {
        window.flow.setValues({ [format]: value });
        const result = await window.flow.validate('answers');
        const failed = result.errors.some(error => error.field === format);
        if (valid.includes(value) === failed) outcome[format][failed ? 'valid' : 'invalid'].push(value);
      }
    }
    return outcome;
  }, Object.fromEntries(formats.map(name => [name, cases[name]])));
  for (const format of formats) expect(results[format], format).toEqual({ valid: [], invalid: [] });
});

test('a format shows an example under the label and names it in the message; a mask shows its shape', async ({ page }) => {
  await openFieldFlow(page, [
    { id: 'mac', type: 'text', label: 'MAC address', required: true, validation: { format: 'mac' } },
    { id: 'tag', type: 'text', label: 'Asset tag', mask: 'AAA-0000', validation: { pattern: '[A-Z]{3}-[0-9]{4}' } },
    { id: 'phone', type: 'text', label: 'Phone', validation: { format: 'phone' } }
  ]);
  const mac = page.getByRole('textbox', { name: 'MAC address' });
  await expect(page.getByText('For example: 00:1A:2B:3C:4D:5E')).toBeVisible();
  await expect(page.getByText('Format: AAA-0000')).toBeVisible();
  await expect(mac).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByRole('textbox', { name: /Phone/ })).toHaveAttribute('inputmode', 'tel');
  await mac.fill('00:1A:2B');
  await mac.blur();
  await expect(page.locator('.cx-flow-error').first()).toHaveText('MAC address must look like 00:1A:2B:3C:4D:5E.');
  await expect(mac).toHaveAttribute('aria-invalid', 'true');
  await mac.fill('00:1a:2b:3c:4d:5e');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.cx-flow-review')).toContainText('00:1a:2b:3c:4d:5e');
});

test('the document refuses formats on other fields, unknown formats and long masks', async ({ page }) => {
  await openFieldFlow(page, [{ id: 'a', type: 'text', label: 'A' }]);
  const errors = await page.evaluate(async () => Promise.all([
    { id: 'a', type: 'number', label: 'A', validation: { format: 'ipv4' } }, { id: 'a', type: 'text', label: 'A', validation: { format: 'zip' } },
    { id: 'a', type: 'text', label: 'A', mask: 'A'.repeat(65) }, { id: 'a', type: 'textarea', label: 'A', mask: 'AAA' }
  ].map(field => CanopyX.createFlow(document.createElement('div'), { flow: { kind: 'flow', version: 1, id: 'x', title: 'X', steps: [{ id: 's', title: 'S', fields: [field] }] } })
    .ready.then(() => 'ready', error => error.message))));
  expect(errors).toEqual(['CanopyX: field a has an unknown format, or a format but is not a text field.', 'CanopyX: field a has an unknown format, or a format but is not a text field.',
    'CanopyX: field a needs a mask of at most 64 characters, as a text field only.', 'CanopyX: field a needs a mask of at most 64 characters, as a text field only.']);
});
