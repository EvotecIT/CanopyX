// Section filtering and the copy-title action. Filtering hides sections without closing them, so clearing it restores
// what the reader had open. A filter reads the whole section header: label, badge and host actions.
UI_TOOLS.accordionQuery = text => text.replace(/\s+or\s+/gi, ' | ').split('|').map(part => part.trim()).filter(Boolean).map(part =>
  [...part.matchAll(/([!-]?)(?:"([^"]+)"|(\S+))/g)].map(match => ({ text: (match[2] || match[3] || '').toLowerCase(), negative: !!match[1] }))
    .filter(token => token.text && !/^(?:&&?|and)$/.test(token.text)));
UI_TOOLS.accordionTools = (root, options, labels, life) => {
  const n = UI_TOOLS.navigation, config = options.search ?? root.dataset.search === 'true';
  const settings = config && typeof config === 'object' ? config : {};
  const debounce = settings.debounce ?? (root.dataset.searchDebounce === undefined ? 150 : Number(root.dataset.searchDebounce));
  const copies = [];
  let items = [], query = '', timer = 0, control = null, input = null, empty = null;
  function matches(item, groups) {
    if (!groups.length) return true;
    const text = (item.section.querySelector('.cx-accordion-header')?.textContent || '').toLowerCase();
    return groups.some(tokens => tokens.every(token => text.includes(token.text) !== token.negative));
  }
  function filter(value = '') {
    if (life.signal.aborted) return 0;
    query = String(value).trim();
    const groups = UI_TOOLS.accordionQuery(query);
    let shown = 0;
    for (const item of items) {
      item.section.hidden = !matches(item, groups);
      shown += item.section.hidden ? 0 : 1;
    }
    if (input && input.value.trim() !== query) input.value = query;
    // The live region stays in the page, so its text is announced when it appears.
    if (empty) setText(empty, query && !shown ? labels.accordionNoMatches : '');
    return shown;
  }
  if (config) {
    control = h('div', 'cx-accordion-search');
    input = document.createElement('input');
    input.type = 'search'; input.setAttribute('aria-label', labels.accordionSearch);
    input.placeholder = settings.placeholder ?? root.dataset.searchPlaceholder ?? labels.accordionSearch;
    empty = h('div', 'cx-accordion-empty'); empty.setAttribute('role', 'status');
    control.append(input, empty); root.prepend(control);
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => filter(input.value), debounce); }, { signal: life.signal });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !input.value) return;
      event.preventDefault(); event.stopPropagation();
      clearTimeout(timer); input.value = ''; filter();
    }, { signal: life.signal });
  }
  async function write(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { }
    // A page over plain http has no clipboard API.
    const field = h('textarea', 'cx-visually-hidden');
    field.value = text; document.body.append(field); field.select();
    try { return document.execCommand('copy'); } catch { return false; } finally { field.remove(); }
  }
  function addCopy(item) {
    const wanted = options.copyTitle ?? item.section.dataset.copyTitle === 'true';
    const present = item.section.querySelector(':scope > .cx-accordion-header > .cx-accordion-copy');
    if (!wanted || present) return;
    const button = n.button('', 'cx-accordion-copy');
    button.setAttribute('aria-label', labels.accordionCopyTitle); button.title = labels.accordionCopyTitle;
    let reset = 0;
    button.addEventListener('click', async () => {
      const copied = await write(item.label);
      if (life.signal.aborted) return;
      clearTimeout(reset);
      button.dataset.copied = String(copied);
      if (copied) button.setAttribute('aria-label', labels.accordionCopied);
      // Feedback stays long enough to read, then the button returns to its action.
      reset = setTimeout(() => { delete button.dataset.copied; button.setAttribute('aria-label', labels.accordionCopyTitle); }, 1200);
    }, { signal: life.signal });
    item.element.closest('.cx-accordion-heading').after(button);
    copies.push(button);
  }
  function refresh(next) { items = next; items.forEach(addCopy); filter(query); }
  function destroy() {
    clearTimeout(timer); control?.remove();
    for (const button of copies) button.remove();
  }
  return { filter, refresh, destroy };
};
