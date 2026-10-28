UI_TOOLS.tabsLayout = (root, list, options, labels, life, select) => {
  const n = UI_TOOLS.navigation;
  const phone = UI_TOOLS.picker(root, { lead: labels.tabsSection, items: [], selected: null, onSelect: select });
  phone.element.classList.add('cx-tabs-phone-picker');
  const position = h('div', 'cx-tabs-position'); position.setAttribute('aria-live', 'polite');
  const tools = h('div', 'cx-tabs-tools');
  const previous = n.button(labels.tabsScrollPrevious, 'cx-tabs-scroll cx-tabs-scroll--previous');
  const next = n.button(labels.tabsScrollNext, 'cx-tabs-scroll cx-tabs-scroll--next');
  for (const el of [previous, next]) {
    el.setAttribute('aria-label', el.textContent); el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1;
  }
  setText(previous, '‹'); setText(next, '›');
  const more = UI_TOOLS.picker(root, { lead: '', items: [], selected: null, onSelect: select });
  more.element.classList.add('cx-tabs-more');
  tools.append(previous, next, more.element);
  list?.before(phone.element, position); list?.after(tools);
  const indicator = h('span', 'cx-tabs-indicator'); indicator.setAttribute('aria-hidden', 'true'); list?.append(indicator);
  let items = [], current, narrow = false, updating = false, frame;
  function scroll(direction) {
    const rtl = getComputedStyle(root).direction === 'rtl' ? -1 : 1;
    list?.scrollBy({ left: direction * list.clientWidth * rtl,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  previous.addEventListener('click', () => scroll(-1), { signal: life.signal });
  next.addEventListener('click', () => scroll(1), { signal: life.signal });
  function edges() {
    if (!list) return;
    const scrollable = root.dataset.overflow === 'scroll' && !narrow;
    const tabs = items.filter(item => !item.element.hidden);
    const bounds = list.getBoundingClientRect(), rtl = getComputedStyle(root).direction === 'rtl';
    const first = tabs[0]?.element.getBoundingClientRect(), last = tabs.at(-1)?.element.getBoundingClientRect();
    const before = !!first && (rtl ? first.right > bounds.right + 1 : first.left < bounds.left - 1);
    const after = !!last && (rtl ? last.left < bounds.left - 1 : last.right > bounds.right + 1);
    previous.hidden = !scrollable || !before; next.hidden = !scrollable || !after;
    root.dataset.scrollStart = String(scrollable && before); root.dataset.scrollEnd = String(scrollable && after);
  }
  function update(nextItems = items, selected = current, reveal = false) {
    if (updating || life.signal.aborted || !list) return;
    updating = true; items = nextItems; current = selected;
    const focus = document.activeElement, fromMore = UI_TOOLS.owns(more.element, focus);
    const fromList = list.contains(focus) || fromMore, fromPicker = UI_TOOLS.owns(phone.element, focus);
    const choiceId = fromMore || fromPicker ? focus.closest('[data-item-id]')?.dataset.itemId : null;
    const focusedItem = items.find(item => item.element.contains(focus) || item.id === choiceId);
    const model = n.pickerItems(items, current?.id);
    // Measure intrinsic labels, icons and badges even while the real list is
    // collapsed. The inert clone never participates in layout or navigation.
    const measure = list.cloneNode(true); measure.hidden = false; measure.inert = true;
    measure.removeAttribute('id'); measure.setAttribute('aria-hidden', 'true');
    measure.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-flow:row nowrap;inline-size:max-content;max-inline-size:none;';
    const measuredTabs = [...measure.querySelectorAll('[role="tab"]')];
    measuredTabs.forEach(tab => { tab.hidden = false; tab.removeAttribute('id'); });
    root.append(measure);
    const gap = parseFloat(getComputedStyle(list).gap) || 0;
    const widths = measuredTabs.map(tab => tab.getBoundingClientRect().width + gap);
    measure.remove();
    const total = Math.max(0, widths.reduce((sum, value) => sum + value, 0) - gap);
    const play = tools.querySelector('.cx-tabs-play');
    const available = Math.max(0, root.clientWidth - (play ? play.getBoundingClientRect().width + gap : 0));
    function measureMore(selected) {
      more.update({ lead: selected ? fill(labels.tabsMoreSelected, { label: '' }).trim() : labels.tabsMore,
        items: model, selected: selected?.id ?? null });
      const clone = more.element.cloneNode(true); clone.hidden = false; clone.inert = true;
      clone.style.cssText = 'position:absolute;visibility:hidden;inline-size:max-content;';
      root.append(clone); const width = clone.getBoundingClientRect().width; clone.remove(); return width;
    }
    let moreWidth = measureMore(null);
    const selectedEnd = widths.slice(0, items.indexOf(current) + 1).reduce((sum, value) => sum + value, 0) - gap;
    if (root.dataset.overflow === 'menu' && total > available && selectedEnd > available - moreWidth - gap)
      moreWidth = measureMore(current);
    // Keep three choices plus More before using a full picker. The eight-pixel
    // resize deadband is layout tolerance, not theme spacing.
    const minimum = root.dataset.overflow === 'menu' && items.length > 3
      ? Math.min(total, widths.slice(0, 3).reduce((sum, value) => sum + value, 0) + moreWidth) : total;
    narrow = root.dataset.collapse === 'picker' && available < minimum + (narrow ? 8 : 0);
    root.dataset.phone = String(narrow);
    phone.update({ lead: labels.tabsSection, items: model, selected: current?.id });
    phone.element.hidden = !narrow; position.hidden = !narrow;
    list.hidden = narrow; tools.hidden = narrow && !tools.querySelector('.cx-tabs-play');
    setText(position, n.position(labels, 'tabsPosition', current?.index ?? 0, items.length));
    items.forEach(item => { item.element.hidden = false; });
    more.element.hidden = true;
    if (!narrow && root.dataset.overflow === 'menu') {
      // Measure every tab with its real icon/badge before moving excess items.
      if (widths.reduce((sum, value) => sum + value, 0) - gap > available) {
        more.element.hidden = false;
        const budget = Math.max(0, available - moreWidth - gap);
        let used = 0;
        const hidden = items.filter((item, index) => { used += widths[index]; item.element.hidden = used - gap > budget; return item.element.hidden; });
        const selectedHidden = hidden.includes(current);
        more.update({ lead: selectedHidden ? fill(labels.tabsMoreSelected, { label: '' }).trim() : labels.tabsMore,
          items: n.pickerItems(hidden, current?.id), selected: selectedHidden ? current.id : null });
        more.element.dataset.state = selectedHidden ? 'selected' : '';
      }
    }
    if (!narrow && !current?.element.hidden && root.dataset.overflow === 'scroll' && reveal) {
      current?.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (!narrow && current && !current.element.hidden) {
      const tab = current.element, css = getComputedStyle(tab);
      // These are measured layout coordinates, never theme/spacing constants.
      const inset = parseFloat(css.paddingInlineStart) || 0;
      indicator.style.setProperty('--cx-tabs-indicator-size', Math.max(0, tab.offsetWidth - inset * 2) + 'px');
      indicator.style.setProperty('--cx-tabs-indicator-start', (getComputedStyle(root).direction === 'rtl'
        ? list.scrollWidth - tab.offsetLeft - tab.offsetWidth + inset : tab.offsetLeft + inset) + 'px');
      indicator.hidden = false;
    } else indicator.hidden = true;
    edges(); updating = false;
    // A resize can hide one tab or More without changing the full-picker state.
    // Keep the same visible focus target, or use the control representing it.
    if ((fromList || fromPicker) && !focus.checkVisibility()) {
      const choice = focusedItem || current;
      const target = narrow ? phone.element.querySelector('button')
        : choice && !choice.element.hidden ? choice.element
        : !more.element.hidden ? more.element.querySelector('button')
        : items.find(item => !item.element.hidden)?.element;
      target?.focus({ preventScroll: true });
    }
  }
  list?.addEventListener('scroll', edges, { signal: life.signal, passive: true });
  const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => update()); };
  UI_TOOLS.observe(root, resize, life.signal);
  document.fonts?.ready.then(() => { if (!life.signal.aborted) resize(); });
  document.fonts?.addEventListener('loadingdone', resize, { signal: life.signal });
  function destroy() {
    cancelAnimationFrame(frame); phone.destroy(); more.destroy();
    phone.element.remove(); position.remove(); tools.remove(); indicator.remove();
    if (list) list.hidden = false;
    for (const key of ['phone', 'scrollStart', 'scrollEnd']) delete root.dataset[key];
  }
  return { update: (nextItems, selected) => update(nextItems, selected, selected !== current), destroy };
};
