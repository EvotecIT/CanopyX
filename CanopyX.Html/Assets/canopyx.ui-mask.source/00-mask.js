// Live input masks for any text input (docs/ui-mask.md): separators appear as the reader types, characters a slot does not take
// are dropped, and the value never grows past the mask. A mask is slots and literals: 0 a digit, a a letter, A a letter made
// upper case, h a hex digit, * a letter or digit, and \ before a character makes it literal. Literals are inserted lazily, just
// before the next slot is filled, so Backspace never fights a separator. Named presets cover common shapes; ipv4 is its own
// mode (one to three digits per octet, each at most 255). The input keeps the formatted text; getState() also gives the raw one.
const MASK_PRESETS = { mac: 'hh:hh:hh:hh:hh:hh', guid: 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', date: '0000-00-00', time: '00:00', 'time-seconds': '00:00:00',
  'date-time': '0000-00-00 00:00', postcode: '00-000', 'credit-card': '0000 0000 0000 0000' };
const MASK_SLOTS = { 0: /\d/, a: /\p{L}/u, A: /\p{L}/u, h: /[0-9a-f]/i, '*': /[\p{L}\d]/u };

/** The mask as tokens: { slot, test, upper } or { literal }. */
function maskTokens(pattern) {
  const tokens = [];
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at];
    if (char === '\\' && at + 1 < pattern.length) tokens.push({ literal: pattern[++at] });
    else if (Object.hasOwn(MASK_SLOTS, char)) tokens.push({ slot: char, test: MASK_SLOTS[char], upper: char === 'A' });
    else tokens.push({ literal: char });
  }
  if (!tokens.some(token => token.slot)) throw new Error('CanopyX: a mask needs at least one slot (0, a, A, h or *).');
  return tokens;
}
/** Fits typed characters to the mask: { text, raw, complete }. Literal characters the reader typed are skipped. */
function maskApply(tokens, input) {
  let text = '', raw = '', pending = '', at = 0;
  for (const char of input) {
    while (at < tokens.length && tokens[at].literal !== undefined) { pending += tokens[at].literal; at++; }
    if (at >= tokens.length) break;
    if (!tokens[at].test.test(char)) continue;
    const value = tokens[at].upper ? char.toLocaleUpperCase() : char;
    text += pending + value; raw += value; pending = ''; at++;
  }
  return { text, raw, complete: !tokens.slice(at).some(token => token.slot) };
}
/** IPv4: digits and dots, a dot added after a third digit, octets above 255 refused, four octets at most. */
function maskIpv4(input) {
  const octets = [''];
  for (const char of input) {
    const last = octets.length - 1;
    if (char === '.') { if (octets[last] && octets.length < 4) octets.push(''); continue; }
    if (!/\d/.test(char)) continue;
    if (octets[last].length === 3 || Number(octets[last] + char) > 255) { if (octets.length === 4) continue; octets.push(''); }
    octets[octets.length - 1] += char;
    if (octets[octets.length - 1].length === 3 && octets.length < 4) octets.push('');
  }
  if (octets.at(-1) === '' && octets.length > 1 && !input.endsWith('.')) octets.pop();
  const text = octets.join('.');
  return { text, raw: text, complete: octets.length === 4 && octets.every(octet => octet !== '') };
}

UI_IMPL.mask = (root, options = {}, signal) => {
  const input = root.matches('input') ? root : root.querySelector('input');
  if (!input || !['text', 'tel', 'search', ''].includes(input.getAttribute('type') || '')) throw new Error('CanopyX: a mask needs a text input.');
  const spec = options.mask ?? input.dataset.cxMask ?? input.dataset.mask;
  if (typeof spec !== 'string' || !spec) throw new Error('CanopyX: a mask needs a pattern or a preset name.');
  const ipv4 = spec === 'ipv4', tokens = ipv4 ? null : maskTokens(MASK_PRESETS[spec] ?? spec);
  const format = text => ipv4 ? maskIpv4(text) : maskApply(tokens, text);
  const before = { inputMode: input.getAttribute('inputmode'), maxLength: input.getAttribute('maxlength'), placeholder: input.getAttribute('placeholder') };
  if (!before.inputMode && (ipv4 || tokens.every(token => token.literal !== undefined || token.slot === '0'))) input.inputMode = 'numeric';
  if (!ipv4) input.maxLength = tokens.length; else input.maxLength = 15;
  if (!before.placeholder && (options.placeholder ?? input.dataset.maskPlaceholder) !== undefined) input.placeholder = options.placeholder ?? input.dataset.maskPlaceholder;
  input.dataset.cxPart = input.dataset.cxPart || 'masked';
  let state = format(input.value);
  function apply(event) {
    const old = input.value, caret = input.selectionStart ?? old.length;
    // The caret stays after the same number of kept characters, whatever separators were added or removed before it.
    const kept = format(old.slice(0, caret)).text.length;
    state = format(old);
    if (state.text !== old) {
      input.value = state.text;
      const position = Math.min(kept, state.text.length);
      if (document.activeElement === input) input.setSelectionRange(position, position);
    }
    input.dataset.complete = String(state.complete);
    if (event) { options.onChange?.({ ...state }); UI_TOOLS.emit(root, 'mask', 'change', { ...state }); }
  }
  input.addEventListener('input', event => { if (!event.isComposing) apply(event); }, { signal });
  input.addEventListener('compositionend', apply, { signal });
  apply();
  signal?.addEventListener('abort', () => {
    for (const [name, attribute] of [['inputMode', 'inputmode'], ['maxLength', 'maxlength'], ['placeholder', 'placeholder']])
      if (before[name] === null) input.removeAttribute(attribute); else input.setAttribute(attribute, before[name]);
    delete input.dataset.complete;
  }, { once: true });
  return { getState: () => ({ ...state }), select: value => { input.value = value == null ? '' : String(value); apply(); return state.text; }, refresh: () => apply() };
};
