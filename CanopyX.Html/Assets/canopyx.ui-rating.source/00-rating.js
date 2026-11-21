// A rating is a native radio group drawn as stars: arrow keys, form submission and reading without the runtime come from the
// browser. The runtime fills the stars up to the chosen (or hovered) one, lets a clearable rating go back to no answer by
// choosing its value again or pressing Delete, and reports changes. A read-only rating is plain markup (CanopyRating.Display).
UI_IMPL.rating = (root, options = {}, signal) => {
  const labels = UI_TOOLS.labels(options.labels), data = root.dataset;
  const max = Number(options.max ?? data.max ?? 5);
  if (!Number.isInteger(max) || max < 2 || max > 10) throw new Error('CanopyX: a rating has 2 to 10 steps.');
  const clearable = options.clearable ?? data.clearable !== 'false';
  root.classList.add('cx-rating'); root.dataset.cxPart = 'rating';
  let built = null, legend = null, inputs = [...root.querySelectorAll('input[type="radio"]')];
  // An empty element gets its group: a legend from options.label and one radio per step, named for form submission.
  if (!inputs.length) {
    const name = options.name || UI_TOOLS.id(root, 'cx-rating') + '-value';
    built = h('span', 'cx-rating-options');
    if (root.localName !== 'fieldset') { root.setAttribute('role', 'radiogroup'); if (options.label) root.setAttribute('aria-label', options.label); }
    else if (options.label && !root.querySelector(':scope > legend')) { legend = h('legend'); setText(legend, options.label); root.prepend(legend); }
    for (let step = 1; step <= max; step++) {
      const option = h('label', 'cx-rating-option'), input = h('input'), text = h('span', 'cx-rating-text');
      input.type = 'radio'; input.name = name; input.value = String(step);
      setText(text, fill(labels.ratingValue, { value: step, max }));
      option.append(input, text); built.append(option);
    }
    root.append(built);
    inputs = [...root.querySelectorAll('input[type="radio"]')];
  }
  if (inputs.length !== max) throw new Error('CanopyX: a rating needs one radio per step.');
  const options$ = inputs.map(input => input.closest('label') || input.parentElement);
  const read = () => { const checked = inputs.find(input => input.checked); return checked ? Number(checked.value) : null; };
  let value = read(), preview = null, pressed = null;
  if (options.value != null) set(options.value, false);
  function paint() {
    const shown = preview ?? value ?? 0;
    options$.forEach((option, at) => { option.dataset.filled = String(at < shown); option.dataset.preview = String(preview !== null && at < preview); });
    root.dataset.value = value === null ? '' : String(value);
  }
  function set(next, notify = true, source = 'api') {
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > max)) throw new Error('CanopyX: a rating value is a whole number from 1 to ' + max + '.');
    if (next === null && !clearable && value !== null) return false;
    const changed = next !== value;
    value = next;
    inputs.forEach(input => { input.checked = Number(input.value) === value; });
    paint();
    if (changed && notify) {
      options.onChange?.(value);
      UI_TOOLS.emit(root, 'rating', 'change', { value, source });
      // A clear leaves no checked radio to fire the browser's own input event, so forms and frameworks get one from the group.
      if (source !== 'api' && value === null) root.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return changed;
  }
  // A pointer press remembers whether it began on the checked star, which the click that follows would otherwise hide.
  root.addEventListener('pointerdown', event => {
    const input = event.target.matches?.('input') ? event.target : event.target.closest?.('label')?.querySelector('input');
    pressed = { input, checked: !!input?.checked };
  }, { signal });
  root.addEventListener('click', event => {
    const input = event.target.matches?.('input[type="radio"]') ? event.target : null;
    if (!input || !inputs.includes(input)) return;
    // Choosing the current value again clears a clearable rating.
    const pointer = pressed !== null, again = pointer && pressed.input === input && pressed.checked;
    pressed = null;
    if (again && clearable) { set(null, true, 'pointer'); return; }
    set(Number(input.value), true, pointer ? 'pointer' : 'keyboard');
  }, { signal });
  root.addEventListener('change', event => { if (inputs.includes(event.target)) set(read(), true, 'keyboard'); }, { signal });
  root.addEventListener('keydown', event => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && clearable && inputs.includes(event.target)) { event.preventDefault(); set(null, true, 'keyboard'); event.target.focus(); }
  }, { signal });
  // A form reset restores the radios after its reset event, without a change event: read them once it has run.
  root.closest('form')?.addEventListener('reset', () => setTimeout(() => { if (!signal?.aborted) { value = read(); paint(); } }), { signal });
  root.addEventListener('pointerover', event => { const at = options$.findIndex(option => option.contains(event.target)); if (at >= 0 && event.pointerType === 'mouse' && !inputs[at].matches(':disabled')) { preview = at + 1; paint(); } }, { signal });
  root.addEventListener('pointerleave', () => { preview = null; paint(); }, { signal });
  signal?.addEventListener('abort', () => {
    built?.remove(); legend?.remove();
    for (const option of options$) { delete option.dataset.filled; delete option.dataset.preview; }
    delete root.dataset.value;
  }, { once: true });
  paint();
  return { select: next => set(next == null ? null : Number(next)), clear: () => set(null), getState: () => ({ value, max }) };
};
