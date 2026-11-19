// A combobox over a native <select>: the select stays in the page (hidden) and holds the answer, so forms submit it and the page
// works without the runtime. The reader types to filter (or the host loads matches), picks with the mouse or the keyboard,
// sees chosen values as chips in a multiple select, and can create a value in tags mode. The WAI-ARIA combobox pattern: the
// input owns a listbox through aria-controls and aria-activedescendant, and a polite status says how many options match.
UI_IMPL.select = (root, options = {}, signal) => {
  const labels = UI_TOOLS.labels(options.labels), data = root.dataset;
  const native = root.querySelector('select');
  if (!native) throw new Error('CanopyX: a select needs a <select> element.');
  const multiple = native.multiple, tags = options.tags ?? data.tags === 'true', search = tags || (options.search ?? data.search !== 'false');
  const max = Number(options.max ?? data.max ?? 0) || Infinity, minLength = Number(options.minLength ?? data.minLength ?? (search && (options.load || data.source || options.source) ? 1 : 0));
  const renderIcon = options.renderIcon, loader = selectLoader(options, root), id = (native.id || 'cx-select-' + Math.random().toString(36).slice(2)) + '-combo';
  let all = options.options ? options.options.map(selectOption) : selectReadNative(native), shown = [], active = -1, open = false, timer = 0, query = '';
  // The native select's selected values, matched by value so options.options may differ in order; a value they lack is kept.
  const written = () => new Map([...native.selectedOptions].filter(item => multiple || item.value !== '').map(item => {
    let option = all.find(entry => entry.value === item.value);
    if (!option) all.push(option = selectNativeOption(item));
    return [option.value, option];
  }));
  let chosen = written();

  root.classList.add('cx-select'); root.dataset.cxPart = 'select'; root.dataset.multiple = String(multiple);
  native.classList.add('cx-select-native'); native.tabIndex = -1; native.setAttribute('aria-hidden', 'true');
  // A dialog's first-field focus, or a host's focus(), reaches the hidden select; the combobox takes it instead.
  native.addEventListener('focus', () => input.focus(), { signal });
  const field = h('div', 'cx-select-field'), chips = h('span', 'cx-select-chips'), input = h('input', 'cx-select-input'), toggle = h('button', 'cx-select-toggle');
  const popup = h('div', 'cx-select-popup'), list = h('div', 'cx-select-list'), note = h('div', 'cx-select-note'), status = h('span', 'cx-visually-hidden');
  field.dataset.cxPart = 'field'; chips.dataset.cxPart = 'chips'; popup.dataset.cxPart = 'popup'; list.dataset.cxPart = 'listbox';
  input.id = id; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', search ? 'list' : 'none'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', id + '-list');
  input.readOnly = !search; input.disabled = native.disabled;
  const placeholder = options.placeholder ?? data.placeholder; if (placeholder) input.placeholder = placeholder;
  // The hidden select's validation state and messages belong to the combobox now, also when the host changes them later.
  const validation = ['aria-invalid', 'aria-describedby', 'aria-errormessage', 'aria-required'], copyValidation = () => {
    for (const name of validation) { const value = native.getAttribute(name); if (value === null) input.removeAttribute(name); else input.setAttribute(name, value); }
    if (native.required) input.setAttribute('aria-required', 'true');
    // A host that enables or disables the select later changes the combobox with it.
    input.disabled = toggle.disabled = native.disabled; if (native.disabled && open) hide();
    for (const remove of chips.querySelectorAll('.cx-select-remove')) remove.disabled = native.disabled;
  };
  copyValidation();
  const watcher = new MutationObserver(copyValidation); watcher.observe(native, { attributes: true, attributeFilter: [...validation, 'required', 'disabled'] });
  signal?.addEventListener('abort', () => watcher.disconnect(), { once: true });
  // The select's aria-labelledby or its label (for= or wrapping) names the combobox; aria-label on the select or the label option work too.
  const label = native.labels?.[0], named = native.getAttribute('aria-labelledby');
  if (label) { label.id ||= id + '-label'; label.addEventListener('click', event => {
    // A link or control inside the label keeps its own action, such as a help link.
    const inner = event.target.closest?.('a[href],button,input,select,textarea,summary,[contenteditable],[tabindex]');
    if (inner && inner !== label && label.contains(inner)) return;
    event.preventDefault(); input.focus();
  }, { signal }); }
  if (named || label) input.setAttribute('aria-labelledby', named || label.id);
  else if (native.getAttribute('aria-label') || options.label) input.setAttribute('aria-label', options.label || native.getAttribute('aria-label'));
  toggle.type = 'button'; toggle.tabIndex = -1; toggle.setAttribute('aria-hidden', 'true'); toggle.disabled = native.disabled; toggle.dataset.cxPart = 'toggle';
  list.id = id + '-list'; list.setAttribute('role', 'listbox'); if (multiple) list.setAttribute('aria-multiselectable', 'true');
  if (input.getAttribute('aria-labelledby')) list.setAttribute('aria-labelledby', input.getAttribute('aria-labelledby')); else if (input.getAttribute('aria-label')) list.setAttribute('aria-label', input.getAttribute('aria-label'));
  status.setAttribute('role', 'status'); note.setAttribute('aria-hidden', 'true');
  popup.popover = 'manual'; popup.hidden = true; popup.append(note, list);
  field.append(chips, input, toggle); root.append(field, status, popup);
  if (!popup.showPopover) popup.removeAttribute('popover');

  /** Writes the answer back to the native select, adding options the host loaded or the reader created. */
  function sync(source) {
    writeNative(); paintChosen();
    if (source === 'api' && !options.notifyApi) return;
    native.dispatchEvent(new Event('input', { bubbles: true })); native.dispatchEvent(new Event('change', { bubbles: true }));
    const values = [...chosen.keys()];
    options.onChange?.(multiple ? values : values[0] ?? null);
    UI_TOOLS.emit(root, 'select', 'change', { value: multiple ? values : values[0] ?? null, source });
  }
  function writeNative() {
    for (const option of chosen.values()) if (![...native.options].some(item => item.value === option.value)) {
      // An added option keeps the host's disabled state, so it is left out of submission like a disabled native option.
      const item = new Option(option.label, option.value); item.disabled = !!option.disabled; native.add(item);
    }
    // A chosen option's native twin takes the host's disabled state, so the form submits only what the field offers as enabled.
    for (const item of native.options) { const record = chosen.get(item.value); item.selected = !!record; if (record && item.matches(':disabled') !== record.disabled) item.disabled = record.disabled; }
    // An empty single select with no placeholder option is cleared outright, or the browser would select its first option again.
    if (!multiple && !chosen.size) { if (native.options[0]?.value === '') native.options[0].selected = true; else native.selectedIndex = -1; }
  }
  function paintChosen() {
    chips.replaceChildren(...(multiple ? [...chosen.values()].map(option => {
      const chip = h('span', 'cx-select-chip'), remove = h('button', 'cx-select-remove');
      chip.dataset.cxPart = 'chip'; chip.append(...selectContent(option, renderIcon, false));
      remove.type = 'button'; remove.tabIndex = -1; remove.setAttribute('aria-label', fill(labels.selectRemove, { label: option.label }));
      remove.disabled = native.disabled;
      remove.addEventListener('click', event => { event.stopPropagation(); if (native.matches(':disabled')) return; chosen.delete(option.value); sync('chip'); input.focus(); });
      chip.append(remove); return chip;
    }) : []));
    if (!multiple && !open) input.value = chosen.values().next().value?.label ?? '';
    root.dataset.empty = String(!chosen.size);
    list.querySelectorAll('[role=option]').forEach((row, at) => row.setAttribute('aria-selected', String(chosen.has(shown[at]?.value))));
    // Chips read with the field: the input describes the chosen values for screen readers.
    if (multiple) input.setAttribute('aria-description', [...chosen.values()].map(option => option.label).join(', ')); else input.removeAttribute('aria-description');
  }
  function paintList(message) {
    list.replaceChildren(); let group = null;
    shown.forEach((option, at) => {
      if (option.group && option.group !== group) { group = option.group; const heading = h('div', 'cx-select-group'); heading.setAttribute('role', 'presentation'); setText(heading, group); list.append(heading); }
      const row = h('div', 'cx-select-option'); row.id = id + '-o' + at; row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(chosen.has(option.value))); if (option.disabled) row.setAttribute('aria-disabled', 'true');
      if (option.created) row.dataset.created = 'true';
      row.append(...selectContent(option, renderIcon, true));
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('click', () => choose(at, 'pointer'));
      list.append(row);
    });
    setText(note, message || ''); note.hidden = !message;
    setText(status, message || fill(labels.selectResults, { count: shown.filter(option => !option.created).length }));
    highlight();
  }
  function highlight() {
    [...list.querySelectorAll('[role=option]')].forEach((row, at) => row.classList.toggle('cx-select-active', at === active));
    if (open && active >= 0) { input.setAttribute('aria-activedescendant', id + '-o' + active); list.querySelector('#' + CSS.escape(id + '-o' + active))?.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function show() {
    if (native.disabled) return;
    // New results change the popup's size, so an open popup is placed again.
    if (!open) { open = true; popup.hidden = false; popup.showPopover?.(); input.setAttribute('aria-expanded', 'true'); root.dataset.state = 'open'; }
    place(); highlight();
  }
  /** Closes the list; keep leaves the typed text and query, as when a query falls below minLength. */
  function hide(keep) {
    clearTimeout(timer); loader?.cancel();
    if (open) {
      open = false; if (popup.matches?.(':popover-open')) popup.hidePopover(); popup.hidden = true;
      input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); delete root.dataset.state;
    }
    if (keep) return;
    // Closing ends the search: a single select shows its value again, a multiple select an empty field.
    input.value = multiple ? '' : chosen.values().next().value?.label ?? '';
    query = '';
  }
  function place() {
    popup.style.minInlineSize = field.getBoundingClientRect().width + 'px';
    // A short screen or an open on-screen keyboard leaves less room than the list's usual height; the list then fits what is visible.
    popup.style.setProperty('--cx-ui-select-room', (visualViewport?.height ?? innerHeight) + 'px');
    UI_TOOLS.position(popup, field, 'bottom-start');
  }
  /** Filters the options for the typed text, or asks the host; tags mode offers the text itself as a new value. */
  function filter(text, keep) {
    query = text; clearTimeout(timer); loader?.cancel();
    const offer = items => {
      // Every known value counts, so a tag never stands in for an existing option the filter left out, a disabled one included.
      const exact = [...all, ...items].some(option => selectFold(option.label) === selectFold(text.trim()) || option.value === text.trim());
      shown = tags && text.trim() && !exact ? [...items, { value: text.trim(), label: fill(labels.selectCreate, { text: text.trim() }), created: true }] : items;
      active = shown.findIndex(option => !option.disabled && (!keep || chosen.has(option.value)));
      if (active < 0) active = shown.findIndex(option => !option.disabled);
      paintList(shown.length ? null : labels.selectNoMatches); show();
    };
    if (loader) {
      if (text.trim().length < minLength) { shown = []; paintList(null); hide(true); return; }
      shown = []; paintList(labels.stateLoading); show();
      timer = setTimeout(() => loader.fetch(text.trim()).then(items => {
        // The latest answer wins, so a value the host renamed or disabled shows its new record when chosen later.
        for (const item of items) { const at = all.findIndex(option => option.value === item.value); if (at < 0) all.push(item); else all[at] = item; }
        // Tags the reader created stay choices even when the host does not know them.
        const fold = selectFold(text.trim());
        offer([...items, ...all.filter(option => option.local && selectFold(option.label).includes(fold) && !items.some(item => item.value === option.value))]);
      }, error => { if (error?.name !== 'AbortError') { shown = []; paintList(error?.message || labels.stateDetails); } }), Number(options.delay ?? 250));
      return;
    }
    const folded = selectFold(text.trim());
    // An empty value is a single select's placeholder; in a multiple select it is a real choice.
    offer(all.filter(option => (multiple || option.value !== '') && (!folded || selectFold(option.label).includes(folded) || selectFold(option.description).includes(folded))));
  }
  function choose(at, source) {
    const option = shown[at];
    // A disabled fieldset around the select disables it without a change to the select itself; a choice then only closes the list.
    if (native.matches(':disabled')) { hide(); return; }
    if (!option || option.disabled) return;
    if (multiple && chosen.has(option.value)) { if (!option.created) chosen.delete(option.value); }
    else if (multiple && chosen.size >= max) return;
    else {
      const made = option.created ? selectOption({ value: option.value, label: option.value }) : option;
      if (option.created && !all.some(entry => entry.value === made.value)) { made.local = true; all.push(made); }
      if (!multiple) chosen.clear(); chosen.set(made.value, made);
    }
    sync(source);
    if (multiple) { input.value = ''; filter('', true); } else hide();
  }
  function move(step) {
    if (!open) { filter(multiple ? '' : search ? '' : query, true); return; }
    const enabled = shown.map((option, at) => option.disabled ? -1 : at).filter(at => at >= 0);
    if (!enabled.length) return;
    const now = enabled.indexOf(active);
    active = step === 'first' ? enabled[0] : step === 'last' ? enabled.at(-1) : enabled[Math.max(0, Math.min(enabled.length - 1, (now < 0 ? -1 : now) + step))];
    highlight();
  }

  input.addEventListener('input', () => filter(input.value), { signal });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    const keys = { ArrowDown: () => move(1), ArrowUp: () => move(-1), Home: () => open && move('first'), End: () => open && move('last'),
      Enter: () => open ? active >= 0 && choose(active, 'keyboard') : move(1), Escape: () => open ? hide() : chosen.size && !multiple ? (chosen.clear(), sync('keyboard')) : 'type',
      ' ': () => !search ? (open && active >= 0 ? choose(active, 'keyboard') : filter('', true)) : 'type',
      Backspace: () => multiple && !input.value && chosen.size ? (chosen.delete([...chosen.keys()].at(-1)), sync('keyboard')) : 'type' };
    if (event.key === 'Tab') { hide(); return; }
    if ((event.key === 'Home' || event.key === 'End') && !open) return;
    const run = keys[event.key];
    if (!run || run() === 'type') return;
    event.preventDefault();
    if (event.key === 'Escape' && open) event.stopPropagation();
  }, { signal });
  input.addEventListener('click', () => open ? null : filter('', true), { signal });
  toggle.addEventListener('pointerdown', event => event.preventDefault(), { signal });
  toggle.addEventListener('click', () => { input.focus(); open ? hide() : filter('', true); }, { signal });
  field.addEventListener('click', event => { if (event.target === field || event.target === chips) input.focus(); }, { signal });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) hide(); }, { signal });
  document.addEventListener('pointerdown', event => { if (open && !root.contains(event.target)) hide(); }, { signal, capture: true });
  addEventListener('resize', () => open && place(), { signal });
  visualViewport?.addEventListener('resize', () => open && place(), { signal });
  document.addEventListener('scroll', () => open && place(), { signal, capture: true });
  // A single select written without a chosen option starts empty; after a reset the browser would select the first option,
  // perhaps one the reader loaded or created, so the empty start is restored.
  const startsEmpty = !multiple && ![...native.options].some(item => item.defaultSelected) && native.options[0]?.value !== '' && !chosen.size;
  native.form?.addEventListener('reset', event => setTimeout(() => {
    if (signal?.aborted || event.defaultPrevented) return;
    if (startsEmpty && ![...native.options].some(item => item.defaultSelected)) native.selectedIndex = -1;
    // A reset ends any search in progress, so the field shows the restored value and a pending load cannot answer the old query.
    hide(); chosen = written(); writeNative(); paintChosen();
  }), { signal });
  signal?.addEventListener('abort', () => {
    clearTimeout(timer); loader?.cancel(); hide(); field.remove(); status.remove(); popup.remove();
    native.classList.remove('cx-select-native'); native.removeAttribute('tabindex'); native.removeAttribute('aria-hidden');
  }, { once: true });
  // The host's records decide from the start which chosen values are disabled, without a change notification.
  writeNative(); paintChosen();
  return {
    select: value => {
      chosen.clear();
      for (const item of [].concat(value ?? [])) { if (chosen.size >= (multiple ? max : 1)) break; const option = all.find(entry => entry.value === String(item)); if (option) chosen.set(option.value, option); }
      sync('api'); return [...chosen.keys()];
    },
    clear: () => { chosen.clear(); sync('api'); return true; },
    open: () => { input.focus(); filter('', true); return true; }, close: () => { hide(); return true; },
    refresh: () => {
      const local = all.filter(option => option.local);
      all = options.options ? options.options.map(selectOption) : selectReadNative(native);
      for (const option of local) { const found = all.find(entry => entry.value === option.value); if (found) found.local = true; else all.push(option); }
      // Kept values take their refreshed records, so a changed label shows in the field and the chips too.
      const size = chosen.size;
      for (const value of [...chosen.keys()]) { const option = all.find(entry => entry.value === value); if (option) chosen.set(value, option); else chosen.delete(value); }
      // An unchanged selection still writes the native select, so a kept value the host disabled or enabled submits accordingly.
      if (chosen.size < size) sync('api'); else { writeNative(); paintChosen(); }
      if (open) filter(query, true);
    },
    getState: () => ({ value: multiple ? [...chosen.keys()] : [...chosen.keys()][0] ?? null, open, query })
  };
};
