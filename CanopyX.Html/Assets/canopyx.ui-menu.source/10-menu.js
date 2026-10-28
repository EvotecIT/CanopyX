UI_IMPL.menu = (root, options = {}, signal) => {
  const lifetime = new AbortController(), ownSignal = lifetime.signal;
  const trigger = options.trigger || document.getElementById(root.dataset.cxTrigger || root.getAttribute('aria-labelledby'));
  const surface = options.surface || root;
  const directionBefore = surface.getAttribute('dir'), rootDirectionBefore = root.getAttribute('dir');
  let entries = [], children = new Map(), active = null, hoverTimer, searchTimer, search = '', destroyed = false;
  let pointer, origin, pending, graceUntil = 0;
  root.classList.add('cx-menu'); root.setAttribute('role', 'menu'); root.tabIndex = -1;
  root.dataset.hfxPart = 'menu';
  if (!root.id) root.id = 'cx-ui-menu-' + ++uiMenuIdentity;
  if (trigger && options.decorateTrigger !== false) {
    if (!trigger.id) trigger.id = root.id + '-trigger';
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-controls', root.id);
    trigger.setAttribute('aria-expanded', 'false'); root.setAttribute('aria-labelledby', trigger.id);
  }
  if (options.label) { root.setAttribute('aria-label', options.label); root.removeAttribute('aria-labelledby'); }
  const overlay = UI_TOOLS.overlay(surface, { kind: options.surface ? 'drawer' : 'menu', trigger,
    host: options.host || trigger || root, portal: options.portal, anchored: options.anchored ?? !options.surface,
    decorateTrigger: options.decorateTrigger,
    placement: options.placement || root.dataset.placement || 'bottom-start',
    modal: !!options.surface, dismissible: true, initialFocus: () => root }, ownSignal);
  const owned = element => element?.closest('[role="menu"]') === root;
  function focus(item) {
    if (!item) { root.focus({ preventScroll: true }); return; }
    for (const entry of entries) entry.tabIndex = entry === item ? 0 : -1;
    active = item; item.focus({ preventScroll: true });
  }
  function closeChildren(except) {
    for (const [entry, controller] of children) if (entry !== except) controller.close('parent', false, true);
  }
  function openChild(item, keyboard) {
    if (item.getAttribute('aria-disabled') === 'true') return;
    const child = children.get(item); closeChildren(item);
    if (child && !child.opened()) child.open({ focus: keyboard ? 'first' : 'none' });
  }
  function clearHover() { clearTimeout(hoverTimer); pending = null; origin = null; }
  function hover(item) {
    clearTimeout(hoverTimer); pending = item;
    const attempt = () => {
      if (destroyed || !overlay.opened || !pending) return;
      const opened = [...children.values()].find(child => child.opened());
      if (opened && Date.now() < graceUntil && uiMenuTriangle(pointer, origin, opened.element.getBoundingClientRect())) {
        hoverTimer = setTimeout(attempt, 150); return;
      }
      focus(pending); openChild(pending, false); pending = null;
    };
    hoverTimer = setTimeout(attempt, 150);
  }
  function syncState(item) {
    item.dataset.state = item.getAttribute('aria-disabled') === 'true' ? 'disabled' :
      item.getAttribute('aria-checked') === 'true' ? 'selected' : '';
  }
  function activate(item, event) {
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    if (children.has(item)) { openChild(item, true); return; }
    const role = item.getAttribute('role'), model = uiMenuModels.get(item);
    if (role === 'menuitemcheckbox' || role === 'menuitemradio') {
      if (role === 'menuitemradio') {
        for (const peer of entries) if (peer.getAttribute('role') === role && peer.dataset.radioGroup === item.dataset.radioGroup) {
          peer.setAttribute('aria-checked', 'false'); syncState(peer);
        }
      }
      item.setAttribute('aria-checked', String(role === 'menuitemradio' || item.getAttribute('aria-checked') !== 'true'));
      syncState(item);
    }
    const checked = item.hasAttribute('aria-checked') ? item.getAttribute('aria-checked') === 'true' : undefined;
    const selected = { ...(model || { id: item.dataset.itemId,
      label: item.querySelector('.cx-menu-label')?.textContent || item.textContent }),
      ...(checked !== undefined ? { checked } : {}) };
    const detail = { id: item.dataset.itemId, item: selected, checked,
      element: item, originalEvent: event };
    if (role !== 'menuitemcheckbox') (options.closeAll || close)('select');
    UI_TOOLS.emit(options.eventRoot || root, 'menu', 'select', detail);
    options.onSelect?.(detail.item, event, item, detail);
  }
  function keydown(event) {
    if (!owned(event.target)) return;
    const index = entries.indexOf(event.target), rtl = getComputedStyle(root).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight', backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); clearHover();
      const at = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
      closeChildren(); focus(entries[at]);
    } else if (event.key === forward) { event.preventDefault(); clearHover(); openChild(event.target, true); }
    else if (event.key === backward && options.parentItem) { event.preventDefault(); close('back'); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event.target, event); }
    else if (event.key === 'Tab') {
      clearHover(); (options.closeAll || close)('tab', false);
      // Restore the traversal origin before the browser performs its normal Tab action.
      (options.tabTrigger || trigger)?.focus({ preventScroll: true });
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); clearTimeout(searchTimer); search += event.key.toLocaleLowerCase();
      const term = [...search].every(letter => letter === search[0]) ? search[0] : search;
      const start = term.length > 1 ? Math.max(index, 0) : index + 1;
      const ordered = entries.slice(start).concat(entries.slice(0, start));
      const found = ordered.find(item => (item.querySelector('.cx-menu-label')?.textContent || item.textContent).trim().toLocaleLowerCase().startsWith(term));
      if (found) { closeChildren(); focus(found); }
      searchTimer = setTimeout(() => { search = ''; }, 700);
    }
  }
  function refresh() {
    if (destroyed) return;
    clearHover();
    for (const child of children.values()) child.destroy(); children = new Map();
    entries = [...root.querySelectorAll(uiMenuItemSelector)].filter(owned);
    for (const entry of entries) {
      entry.classList.add('cx-menu-item'); entry.dataset.hfxPart = 'menu-item'; entry.tabIndex = -1;
      if (entry.disabled) { entry.disabled = false; entry.setAttribute('aria-disabled', 'true'); }
      syncState(entry);
      if (entry.hasAttribute('aria-checked')) {
        let icon = entry.querySelector('.cx-menu-icon');
        if (!icon) { icon = h('span', 'cx-menu-icon'); icon.setAttribute('aria-hidden', 'true'); entry.prepend(icon); }
        // The check is CSS-generated so toggling never destroys a host-rendered icon.
        if (icon.textContent.trim() === '✓') icon.textContent = '';
      }
      const icon = entry.querySelector('.cx-menu-icon[data-icon]');
      if (icon && !uiMenuModels.has(entry) && options.renderIcon) {
        const rendered = options.renderIcon(icon.dataset.icon, { id: entry.dataset.itemId });
        if (rendered?.nodeType) icon.replaceChildren(rendered.cloneNode(true));
        else if (rendered != null) setText(icon, rendered);
      }
      const childRoot = document.getElementById(entry.getAttribute('aria-controls'));
      if (childRoot?.getAttribute('role') === 'menu') {
        children.set(entry, UI_IMPL.menu(childRoot, { ...options, surface: null, trigger: entry, decorateTrigger: true, label: undefined,
          parentItem: entry, placement: getComputedStyle(options.host || trigger || root).direction === 'rtl' ? 'left' : 'right',
          tabTrigger: options.tabTrigger || trigger, eventRoot: options.eventRoot || root,
          closeAll: options.closeAll || close }, ownSignal));
      }
    }
    active = entries.includes(active) ? active : null;
    if (overlay.opened && root.contains(document.activeElement)) focus(active || entries[0]);
  }
  function open(settings = {}) {
    if (destroyed) return false;
    clearHover(); search = ''; clearTimeout(searchTimer);
    // Direction must survive a move out of a local RTL/LTR host into the top layer.
    surface.dir = root.dir = getComputedStyle(options.host || trigger || root).direction;
    if (options.surface) root.hidden = false;
    if (!overlay.open(settings)) return false;
    root.dataset.state = 'open';
    if (settings.focus === 'none') trigger?.focus({ preventScroll: true });
    else focus(settings.focus === 'last' ? entries.at(-1) : entries[0]);
    return true;
  }
  function close(reason = 'close', restoreFocus, force = false) {
    clearHover(); return overlay.close(reason, restoreFocus, force);
  }
  function destroy() {
    if (destroyed) return; destroyed = true; clearHover(); clearTimeout(searchTimer);
    for (const child of children.values()) child.destroy(); children.clear();
    overlay.destroy(); lifetime.abort();
    if (directionBefore === null) surface.removeAttribute('dir'); else surface.setAttribute('dir', directionBefore);
    if (rootDirectionBefore === null) root.removeAttribute('dir'); else root.setAttribute('dir', rootDirectionBefore);
    signal?.removeEventListener('abort', destroy);
  }
  root.addEventListener('keydown', keydown, { signal: ownSignal });
  root.addEventListener('click', event => {
    const item = event.target.closest(uiMenuItemSelector);
    if (owned(item)) { event.preventDefault(); clearHover(); activate(item, event); }
  }, { signal: ownSignal });
  root.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const item = event.target.closest(uiMenuItemSelector);
    if (owned(item) && !item.contains(event.relatedTarget)) hover(item);
  }, { signal: ownSignal });
  root.addEventListener('pointerout', event => {
    const item = event.target.closest(uiMenuItemSelector);
    if (owned(item) && !item.contains(event.relatedTarget)) {
      origin = pointer || { x: event.clientX, y: event.clientY }; graceUntil = Date.now() + 750;
    }
  }, { signal: ownSignal });
  document.addEventListener('pointermove', event => {
    if (!overlay.opened) return;
    pointer = { x: event.clientX, y: event.clientY };
    if ([...children.values()].some(child => child.opened() && child.element.contains(event.target))) clearHover();
    else if (!root.contains(event.target) && ![...children.values()].some(child => child.opened())) clearHover();
  }, { signal: ownSignal });
  surface.addEventListener(options.surface ? 'cx-drawer:close' : 'cx-menu:close', event => {
    if (event.target !== surface) return;
    clearHover(); search = ''; root.dataset.state = 'closed';
    for (const entry of entries) entry.tabIndex = -1;
  }, { signal: ownSignal });
  if (trigger && options.bindTrigger !== false && !options.parentItem) {
    trigger.addEventListener('click', () => overlay.opened ? close() : open(), { signal: ownSignal });
    trigger.addEventListener('keydown', event => {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); open({ focus: event.key === 'ArrowUp' ? 'last' : 'first' });
      }
    }, { signal: ownSignal });
  }
  signal?.addEventListener('abort', destroy, { once: true });
  refresh();
  if (signal?.aborted) destroy();
  return { element: root, open, close, refresh, destroy, opened: () => overlay.opened };
};
