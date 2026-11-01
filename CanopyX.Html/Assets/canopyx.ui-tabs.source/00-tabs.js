UI_IMPL.tabs = (root, options = {}, signal) => {
  const n = UI_TOOLS.navigation, life = n.scope(signal), labels = UI_TOOLS.labels(options.labels);
  const list = n.owned(root, '[role="tablist"]')[0];
  let items = [], current, layout, auto, destroyed = false;
  const style = options.style || ['vertical', 'segmented', 'pills'].find(s => root.classList.contains('cx-tabs--' + s)) || 'underline';
  for (const variant of ['underline', 'pills', 'segmented', 'vertical']) root.classList.toggle('cx-tabs--' + variant, variant === style);
  root.classList.add('cx-tabs');
  const effectiveStyle = style === 'segmented' && n.owned(root, '[role="tab"]').length > 5 ? 'pills' : style;
  if (effectiveStyle !== style) {
    root.classList.replace('cx-tabs--segmented', 'cx-tabs--pills');
    if (options.debug === true) console.warn('[CanopyX] tabs: segmented supports 2–5 options; rendering as pills');
  }
  root.dataset.overflow = options.overflow || root.dataset.overflow || 'scroll';
  if (root.dataset.overflow === 'wrap' && effectiveStyle !== 'pills') root.dataset.overflow = 'scroll';
  root.dataset.collapse = options.collapse || root.dataset.collapse || (effectiveStyle === 'segmented' ? 'none' : 'picker');
  root.dataset.print = options.print || root.dataset.print || 'all';
  root.dataset.transition = options.transition || 'none';
  root.dataset.justified = String(options.justified ?? root.dataset.justified === 'true');
  const remember = options.remember ?? root.dataset.remember;
  const storageKey = remember ? 'canopyx:tabs:' + (remember === true ? root.id : remember) : null;
  list?.setAttribute('aria-orientation', effectiveStyle === 'vertical' ? 'vertical' : 'horizontal');
  const deferred = n.deferred(root, 'tabs', options, life, id => select(id));
  function render() {
    for (const item of items) {
      const selected = item === current;
      item.element.setAttribute('aria-selected', String(selected));
      item.element.tabIndex = selected ? 0 : -1;
      item.element.dataset.state = item.disabled ? 'disabled' : selected ? 'selected' : '';
      if (item.panel) {
        item.panel.hidden = !selected;
        item.panel.dataset.state = selected ? 'selected' : '';
        n.panelTabStop(item.panel);
      }
    }
    layout?.update(items, current);
  }
  const selection = n.selection(root, 'tabs', options, life, () => current, async (from, to, loadSignal, live, source) => {
    if (from !== to) deferred.leave(from);
    current = to; render();
    if (options.hash && root.id) writeHash(to.id);
    // Private windows and full or blocked storage still work; the choice just is not remembered.
    if (storageKey && source !== 'auto') try { localStorage.setItem(storageKey, to.id); } catch { }
    if (from !== to) UI_TOOLS.emit(root, 'tabs', 'change', { from, to });
    const loaded = await deferred.load(to, loadSignal, live);
    if (live() && loaded) animate(to, from);
    if (live()) layout?.update(items, current);
  });
  function select(value, source = 'api') {
    if (destroyed) return Promise.resolve(false);
    if (source !== 'auto' && source !== 'initial') auto?.stop();
    const target = n.resolve(items, value);
    if (!target || target.disabled) { selection.cancel(); return Promise.resolve(false); }
    if (target === current && !deferred.isDeferred(target)) { selection.cancel(); return Promise.resolve(true); }
    return selection.request(target, undefined, source);
  }
  function step(direction) {
    const enabled = items.filter(item => !item.disabled);
    return select(enabled[enabled.indexOf(current) + direction]?.id);
  }
  function remembered() {
    try { return n.resolve(items, localStorage.getItem(storageKey)); } catch { return undefined; }
  }
  function animate(to, from) {
    if (!to.panel || root.dataset.transition === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    to.panel.getAnimations().forEach(animation => animation.cancel());
    const css = getComputedStyle(root), slide = root.dataset.transition === 'slide';
    const duration = css.getPropertyValue('--cx-tabs-motion-duration-' + (slide ? 'base' : 'fast')).trim();
    const ms = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    const distance = css.getPropertyValue('--cx-tabs-motion-distance').trim();
    const easing = css.getPropertyValue('--cx-tabs-motion-easing').trim();
    const sign = (to.index >= (from?.index ?? 0) ? 1 : -1) * (css.direction === 'rtl' ? -1 : 1);
    to.panel.animate([{ opacity: 0, transform: slide ? 'translateX(calc(' + distance + ' * ' + sign + '))' : 'none' },
      { opacity: 1, transform: 'none' }], { duration: ms || 0, easing });
  }
  function hashId() {
    try { return new URLSearchParams(location.hash.slice(1)).get(root.id); } catch { return null; }
  }
  function writeHash(id) {
    const params = new URLSearchParams(location.hash.slice(1)); params.set(root.id, id);
    const hash = '#' + params.toString();
    if (hash !== location.hash) history[options.hashHistory === 'push' ? 'pushState' : 'replaceState'](null, '', hash);
  }
  function refresh() {
    if (destroyed) return;
    selection.cancel();
    const id = current?.id;
    items = n.records(root, 'tabs', options);
    current = items.find(item => item.id === id && !item.disabled) || items.find(item => !item.disabled && item.element.getAttribute('aria-selected') === 'true') || items.find(item => !item.disabled);
    render(); auto?.reset();
  }
  root.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && items.some(item => item.element === tab)) select(tab.dataset.tabId, 'user');
  }, { signal: life.signal });
  list?.addEventListener('keydown', event => {
    const index = items.findIndex(item => item.element === event.target);
    if (index < 0) return;
    const visible = items.filter(item => !item.element.hidden), position = visible.indexOf(items[index]);
    const vertical = list.getAttribute('aria-orientation') === 'vertical';
    const rtl = getComputedStyle(root).direction === 'rtl';
    const forward = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
    let target;
    if (event.key === forward || event.key === back) target = visible[(position + (event.key === forward ? 1 : -1) + visible.length) % visible.length];
    if (event.key === 'Home') target = visible[0];
    if (event.key === 'End') target = visible[visible.length - 1];
    if (target) {
      event.preventDefault();
      items.forEach(item => { item.element.tabIndex = item === target ? 0 : -1; });
      target.element.focus(); target.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const activation = options.activation || root.dataset.activation;
      const manual = activation === 'manual' || activation !== 'automatic' && (options.beforeChange || items.some(deferred.isDeferred));
      if (!manual && !target.disabled) select(target.id, 'user');
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); select(items[index].id, 'user');
    }
  }, { signal: life.signal });
  list?.addEventListener('focusout', event => {
    if (!list.contains(event.relatedTarget)) items.forEach(item => { item.element.tabIndex = item === current ? 0 : -1; });
  }, { signal: life.signal });
  let touch;
  root.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && root.dataset.phone === 'true' && event.target.closest('.cx-tabpanel') &&
      !event.target.closest('a[href],button,input,select,textarea,[contenteditable="true"]') && !getSelection()?.toString()) touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }, { signal: life.signal });
  root.addEventListener('pointerup', event => {
    const start = touch; touch = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    // Swipe threshold is a gesture distance, not a visual spacing value.
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    const direction = (dx < 0 ? 1 : -1) * (getComputedStyle(root).direction === 'rtl' ? -1 : 1);
    const target = items.slice().filter(item => !item.disabled);
    const next = target[target.indexOf(current) + direction];
    if (next) select(next.id, 'user');
  }, { signal: life.signal });
  root.addEventListener('pointercancel', () => { touch = null; }, { signal: life.signal });
  if (options.hash) window.addEventListener('hashchange', () => {
    const target = n.resolve(items, hashId()); if (target && target !== current) select(target.id, 'hash');
  }, { signal: life.signal });
  function destroy() {
    if (destroyed) return;
    destroyed = true; life.abort(); auto?.destroy(); layout?.destroy(); deferred.destroy();
    root.removeAttribute('data-cx-ready');
    items.forEach(item => { item.element.hidden = false; item.element.removeAttribute('aria-busy');
      if (item.panel) { item.panel.hidden = false; item.panel.removeAttribute('aria-busy'); item.panel.getAnimations().forEach(a => a.cancel()); } });
  }
  refresh();
  layout = UI_TOOLS.tabsLayout(root, list, options, labels, life, id => select(id, 'user'));
  root.dataset.cxReady = 'true'; render();
  const requested = options.hash && n.resolve(items, hashId()) || storageKey && remembered() || n.resolve(items, options.selectedIndex ?? options.selected);
  const initial = requested && !requested.disabled ? requested : current;
  if (options.hash && root.id && initial === current && current) writeHash(current.id);
  const ready = select(initial?.id, 'initial');
  auto = UI_TOOLS.tabsAuto(root, list, options, labels, life, () => ({ items, current }),
    id => select(id, 'auto'), () => selection.cancel(), ready);
  signal?.addEventListener('abort', destroy, { once: true });
  return { select, next: () => step(1), back: () => step(-1), getSelected: () => current?.id ?? null, refresh, preparePrint: () => deferred.preparePrint(), destroy, ready };
};
