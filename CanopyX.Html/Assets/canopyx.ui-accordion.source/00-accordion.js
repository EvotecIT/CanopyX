// Sections open independently, so a multiple accordion gives each section its own cancellable request. A single-open
// accordion shares one request, as tabs do: the newest choice cancels a pending guard or loader of the previous one.
UI_IMPL.accordion = (root, options = {}, signal) => {
  const n = UI_TOOLS.navigation, life = n.scope(signal), labels = UI_TOOLS.labels(options.labels);
  const multiple = options.multiple ?? root.dataset.multiple === 'true';
  const hash = !!root.id && (options.hash ?? root.dataset.hash === 'true');
  const transition = options.transition || root.dataset.transition || 'none';
  const remember = options.remember ?? root.dataset.remember;
  const storageKey = remember ? 'canopyx:accordion:' + (remember === true ? root.id : remember) : null;
  let items = [], destroyed = false;
  root.classList.add('cx-accordion');
  const style = options.style || ['flush', 'separated', 'section'].find(name => root.classList.contains('cx-accordion--' + name)) || 'default';
  for (const name of ['default', 'flush', 'separated', 'section']) root.classList.toggle('cx-accordion--' + name, name === style);
  root.dataset.indicator = options.indicator || root.dataset.indicator || 'chevron';
  root.dataset.indicatorPosition = options.indicatorPosition || root.dataset.indicatorPosition || 'end';
  root.dataset.print = options.print || root.dataset.print || 'all';
  const deferred = n.deferred(root, 'accordion', options, life, id => request(id, true, 'user'));
  const opened = () => items.find(item => item.open);
  const shared = multiple ? null : n.selection(root, 'accordion', options, life, opened, commit);
  const sectionRequests = new Map();
  function requests(item) {
    if (shared) return shared;
    if (!sectionRequests.has(item.id)) sectionRequests.set(item.id, n.selection(root, 'accordion', options, life, () => undefined, commit));
    return sectionRequests.get(item.id);
  }
  function animate(item, open) {
    const panel = item.panel;
    panel.getAnimations().forEach(animation => animation.cancel());
    delete panel.dataset.animating;
    if (open) panel.hidden = false;
    if (transition !== 'slide' || matchMedia('(prefers-reduced-motion: reduce)').matches) { panel.hidden = !open; return; }
    const css = getComputedStyle(root), duration = css.getPropertyValue('--cx-accordion-motion-duration').trim();
    const size = panel.getBoundingClientRect().height + 'px', frames = [{ blockSize: '0px', opacity: 0 }, { blockSize: size, opacity: 1 }];
    panel.dataset.animating = 'true';
    const animation = panel.animate(open ? frames : frames.reverse(), { duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) || 0,
      easing: css.getPropertyValue('--cx-accordion-motion-easing').trim() });
    animation.onfinish = () => { delete panel.dataset.animating; panel.hidden = !item.open; };
  }
  function paint(item, motion) {
    item.element.setAttribute('aria-expanded', String(item.open));
    item.section.dataset.state = item.disabled ? 'disabled' : item.open ? 'open' : '';
    if (motion) animate(item, item.open);
    else if (item.panel) item.panel.hidden = !item.open;
  }
  function apply(item, open) {
    if (item.open === open) return;
    item.open = open; paint(item, !!item.panel);
    if (!open) deferred.leave(item);
  }
  function save(source) {
    // A change that came from the address must not rewrite it while the rest of that address is still being applied.
    if (hash && source !== 'hash') writeHash();
    // Private windows and full or blocked storage still work; the state just is not remembered.
    if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(getOpen())); } catch { }
  }
  async function commit(from, to, loadSignal, live, source) {
    const item = n.resolve(items, to.id);
    if (!item) return;
    if (from && from !== item) apply(from, false);
    apply(item, to.open);
    if (!to.quiet) { save(source); UI_TOOLS.emit(root, 'accordion', 'change', { item, open: to.open, source }); }
    if (to.open) await deferred.load(item, loadSignal, live);
  }
  function request(value, open, source = 'api') {
    const item = destroyed ? null : n.resolve(items, value);
    if (!item || item.disabled) return Promise.resolve(false);
    const next = open ?? !item.open;
    if (item.open === next && !(next && deferred.isDeferred(item))) return Promise.resolve(true);
    return requests(item).request({ ...item, open: next }, undefined, source);
  }
  function hashIds() {
    try { return new URLSearchParams(location.hash.slice(1)).getAll(root.id); } catch { return []; }
  }
  function writeHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    params.delete(root.id);
    for (const id of getOpen()) params.append(root.id, id);
    const text = params.toString(), value = text ? '#' + text : '';
    if (value !== location.hash) history[options.hashHistory === 'push' ? 'pushState' : 'replaceState'](null, '', value || location.pathname + location.search);
  }
  function stored() {
    if (!storageKey) return null;
    try { const value = JSON.parse(localStorage.getItem(storageKey)); return Array.isArray(value) ? value : null; } catch { return null; }
  }
  function getOpen() { return items.filter(item => item.open).map(item => item.id); }
  function refresh() {
    if (destroyed) return;
    shared?.cancel(); sectionRequests.forEach(entry => entry.cancel()); sectionRequests.clear();
    items = n.records(root, 'accordion', options);
    let found = false;
    for (const item of items) {
      item.section = item.element.closest('.cx-accordion-item');
      if (item.open && !multiple) { item.open = !found; found = true; }
      paint(item, false);
    }
    search.refresh(items);
  }
  // A link or a reload wins over remembered state, and remembered state over the page's own defaults.
  function initial() {
    const linked = hash ? hashIds() : [];
    const chosen = linked.length ? linked : stored() || options.open?.map(value => n.resolve(items, value)?.id);
    if (!chosen) return;
    let found = false;
    for (const item of items) {
      if (item.disabled) continue;
      item.open = chosen.includes(item.id) && (multiple || !found);
      found ||= item.open;
    }
  }
  root.addEventListener('click', event => {
    const trigger = event.target.closest('.cx-accordion-trigger');
    const item = trigger && items.find(entry => entry.element === trigger);
    if (item) request(item.id, undefined, 'user');
  }, { signal: life.signal });
  root.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const visible = items.filter(item => !item.section.hidden), index = visible.findIndex(item => item.element === event.target);
    if (index < 0) return;
    const target = { ArrowDown: visible[(index + 1) % visible.length], ArrowUp: visible[(index - 1 + visible.length) % visible.length],
      Home: visible[0], End: visible[visible.length - 1] }[event.key];
    if (target) { event.preventDefault(); target.element.focus(); }
  }, { signal: life.signal });
  if (hash) window.addEventListener('hashchange', () => {
    const ids = hashIds(), wanted = items.filter(item => ids.includes(item.id));
    if (multiple) { for (const item of items) request(item.id, wanted.includes(item), 'hash'); return; }
    const target = wanted[0] || opened();
    if (target) request(target.id, !!wanted[0], 'hash');
  }, { signal: life.signal });
  const search = UI_TOOLS.accordionTools(root, options, labels, life);
  function destroy() {
    if (destroyed) return;
    destroyed = true; life.abort(); deferred.destroy(); search.destroy();
    root.removeAttribute('data-cx-ready');
    for (const item of items) {
      item.element.removeAttribute('aria-busy'); item.section.hidden = false;
      if (item.panel) {
        item.panel.getAnimations().forEach(animation => animation.cancel());
        delete item.panel.dataset.animating; item.panel.hidden = false; item.panel.removeAttribute('aria-busy');
      }
    }
  }
  refresh(); initial(); items.forEach(item => paint(item, false));
  root.dataset.cxReady = 'true';
  if (hash && getOpen().length) writeHash();
  const ready = Promise.all(items.filter(item => item.open && deferred.isDeferred(item))
    .map(item => requests(item).request({ ...item, disabled: false, quiet: true }, undefined, 'initial')));
  signal?.addEventListener('abort', destroy, { once: true });
  return { open: id => request(id, true), close: id => request(id, false), toggle: id => request(id), getOpen, filter: search.filter,
    refresh, preparePrint: () => deferred.preparePrint(), destroy, ready };
};
