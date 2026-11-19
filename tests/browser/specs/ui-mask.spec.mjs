import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

const field = (mask, extra = '') => `<label for="f">Field</label><input id="f" type="text" data-cx-mask="${mask}" ${extra}>`;
const input = page => page.getByRole('textbox', { name: 'Field' });

test('separators appear as the reader types, other characters are dropped and the length is capped', async ({ page }) => {
  await openUi(page, field('mac'));
  await input(page).pressSequentially('001a2Bzz3c4d5e6f7');
  await expect(input(page)).toHaveValue('00:1a:2B:3c:4d:5e');
  await expect(input(page)).toHaveAttribute('data-complete', 'true');
  expect(await page.evaluate(() => CanopyX.mask('#f').getState())).toEqual({ text: '00:1a:2B:3c:4d:5e', raw: '001a2B3c4d5e', complete: true });
});

test('Backspace removes a separator with its slot instead of fighting it', async ({ page }) => {
  await openUi(page, field('00:00'));
  await input(page).pressSequentially('123');
  await expect(input(page)).toHaveValue('12:3');
  await page.keyboard.press('Backspace');
  await expect(input(page)).toHaveValue('12');
  await expect(input(page)).toHaveAttribute('data-complete', 'false');
  await expect(input(page)).toHaveAttribute('inputmode', 'numeric');
});

test('a pasted value is fitted, upper-case slots change case, and an edit in the middle keeps the caret', async ({ page }) => {
  await openUi(page, field('AAA-0000'));
  await input(page).fill('net0042');
  await expect(input(page)).toHaveValue('NET-0042');
  await input(page).evaluate(element => element.setSelectionRange(4, 4));
  await page.keyboard.press('Delete');
  await expect(input(page)).toHaveValue('NET-042');
  expect(await input(page).evaluate(element => element.selectionStart)).toBe(4);
});

test('the ipv4 preset adds dots after three digits and refuses octets above 255', async ({ page }) => {
  await openUi(page, field('ipv4'));
  await input(page).pressSequentially('19216801');
  await expect(input(page)).toHaveValue('192.168.01');
  await input(page).fill('');
  await input(page).pressSequentially('256.1.1.1.9');
  // 256 is too big for one octet, so 6 starts the next; a fifth octet is refused and the last one stops at three digits.
  await expect(input(page)).toHaveValue('25.6.1.119');  await expect(input(page)).toHaveAttribute('inputmode', 'decimal');
});

test('host masks report changes, refuse a mask without slots, and destroy restores the input', async ({ page }) => {
  await openUi(page, '<input id="code" type="text" aria-label="Code">');
  const result = await page.evaluate(async () => {
    const events = [];
    const mask = CanopyX.mask('#code', { mask: '\\#hhhhhh', onChange: state => events.push(state.text) });
    await mask.ready;
    const input = document.getElementById('code');
    input.value = 'ff00aa'; input.dispatchEvent(new Event('input', { bubbles: true }));
    let refused = null;
    try { await CanopyX.mask(document.body.appendChild(Object.assign(document.createElement('input'), { type: 'text' })), { mask: '--' }).ready; } catch (error) { refused = error.message; }
    mask.destroy();
    return { value: input.value, events, refused, maxLength: input.getAttribute('maxlength') };
  });
  expect(result).toEqual({ value: '#ff00aa', events: ['#ff00aa'], refused: 'CanopyX: a mask needs at least one slot (0, a, A, h or *).', maxLength: null });
});

test('a literal that could also fill the next slot formats to itself', async ({ page }) => {
  await openUi(page, field('+\\1 000'));
  await input(page).pressSequentially('234');
  await expect(input(page)).toHaveValue('+1 234');
  await input(page).press('End');
  await input(page).press('Backspace');
  await input(page).pressSequentially('5');
  await expect(input(page)).toHaveValue('+1 235');
  expect(await page.evaluate(() => CanopyX.mask('#f').getState())).toEqual({ text: '+1 235', raw: '235', complete: true });
});

test('a paste with spaces still fits, capitals that expand keep one slot, and a form reset clears the state', async ({ page }) => {
  await openUi(page, '<form id="form">' + field('postcode') + '<label for="code">Code</label><input id="code" data-cx-mask="AAA"><button type="reset">Reset</button></form>');
  await input(page).focus();
  await page.evaluate(() => document.execCommand('insertText', false, '12 - 345'));
  await expect(input(page)).toHaveValue('12-345');
  const code = page.getByRole('textbox', { name: 'Code' });
  await code.pressSequentially('ßab');
  await expect(code).toHaveValue('ßAB');
  await page.evaluate(async () => { const mask = CanopyX.mask('#code'); await mask.ready; await mask.refresh(); });
  await expect(code).toHaveValue('ßAB');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(input(page)).toHaveValue('');
  await expect(input(page)).toHaveAttribute('data-complete', 'false');
  expect(await page.evaluate(() => CanopyX.mask('#f').getState())).toEqual({ text: '', raw: '', complete: false });
});

test('a literal outside the basic plane stays whole when a complete value formats again', async ({ page }) => {
  await openUi(page, field('000🔒'));
  await input(page).pressSequentially('123');
  await expect(input(page)).toHaveValue('123🔒');
  expect(await page.evaluate(async () => { const mask = CanopyX.mask('#f'); await mask.refresh(); return mask.getState(); })).toEqual({ text: '123🔒', raw: '123', complete: true });
  await expect(input(page)).toHaveValue('123🔒');
});

test('Delete before a separator removes the next typed character', async ({ page }) => {
  await openUi(page, field('00:00'));
  await input(page).pressSequentially('1234');
  await input(page).evaluate(element => element.setSelectionRange(2, 2));
  await page.keyboard.press('Delete');
  await expect(input(page)).toHaveValue('12:4');
  expect(await input(page).evaluate(element => element.selectionStart)).toBe(2);
  await page.keyboard.press('Delete');
  await expect(input(page)).toHaveValue('12');
});

test('a mask that ends in literals closes the value, Backspace removes them with the last digit, and edits fire input events', async ({ page }) => {
  await openUi(page, field('(000)'));
  await page.evaluate(() => { window.inputs = []; document.getElementById('f').addEventListener('input', event => window.inputs.push(event.target.value)); });
  await input(page).pressSequentially('123');
  await expect(input(page)).toHaveValue('(123)');
  expect(await page.evaluate(() => CanopyX.mask('#f').getState())).toEqual({ text: '(123)', raw: '123', complete: true });
  await page.keyboard.press('Backspace');
  await expect(input(page)).toHaveValue('(12');
  await input(page).pressSequentially('3');
  await input(page).evaluate(element => element.setSelectionRange(3, 3));
  await page.keyboard.press('Delete');
  await expect(input(page)).toHaveValue('(12');
  expect(await page.evaluate(() => window.inputs.at(-1))).toBe('(12');
});
