UI_IMPL.contextMenu = (target, itemsOrFactory, options = {}) => {
  const lifetime = new AbortController(), signal = lifetime.signal;
  const delegated = typeof target === 'string', listener = delegated ? document : target;
  const editable = 'a[href],area[href],input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
  let current, pressTimer, press, suppressClick = false, destroyed = false;
  const nodeOf = event => event?.target?.nodeType === 1 ? event.target : event?.target?.parentElement;
  const match = event => {
    const node = nodeOf(event), element = delegated ? node?.closest(target) : target.contains(node) ? target : null;
    return element && (options.match ? options.match(event, element) : element);
  };
  const keyboard = event => event?.type === 'keydown' || event?.type === 'contextmenu' && event.button !== 2 && event.clientX === 0 && event.clientY === 0;
  const nativeMenu = event => !!event && ((event.shiftKey && !keyboard(event)) || !!nodeOf(event)?.closest(editable) || !!document.getSelection()?.toString());
  function clearPress() { clearTimeout(pressTimer); pressTimer = null; press = null; }
  function release(entry, reason) {
    if (current !== entry) return;
    current = null; entry.surface.removeEventListener(entry.closeEvent, entry.closed);
    entry.surface.removeEventListener('contextmenu', entry.native);
    entry.controller?.destroy(); entry.menu.remove(); entry.sheet?.remove();
    for (const [name, value] of entry.before) {
      // Never overwrite an attribute the host changed while its menu was open.
      const now = entry.anchor.getAttribute(name);
      if (now !== entry.written.get(name)) continue;
      if (value === null) entry.anchor.removeAttribute(name); else entry.anchor.setAttribute(name, value);
    }
    options.onClose?.({ ...entry.detail, reason });
  }
  function close(reason = 'close', restoreFocus = true, force = false) {
    clearPress();
    return current ? current.controller.close(reason, restoreFocus, force) : true;
  }
  function open(event, element, settings = {}) {
    if (destroyed || event?.defaultPrevented && !settings.touch || nativeMenu(event) || !element?.isConnected) return false;
    const prepared = options.beforeOpen?.(event, element, settings);
    if (prepared === false || destroyed) return false;
    if (prepared?.nodeType === 1) element = prepared;
    if (!element.isConnected) return false;
    const items = typeof itemsOrFactory === 'function' ? itemsOrFactory(event, element) : itemsOrFactory;
    if (!items?.length || destroyed || !element.isConnected) return false;
    close('replace', false, true);
    const menu = h('div', 'cx-menu'); menu.hidden = true; menu.dataset.contextMenu = '';
    menu.setAttribute('role', 'menu'); menu.dataset.hfxPart = 'menu';
    if (options.variant) menu.dataset.hfxVariant = options.variant;
    document.body.append(menu); UI_TOOLS.menuItems(menu, items, options);
    const touch = !!settings.touch, byKey = settings.keyboard ?? keyboard(event);
    const label = (typeof options.label === 'function' ? options.label(event, element) : options.label) ||
      element.getAttribute('aria-label') || element.textContent.trim() || UI_TOOLS.labels(options.labels).stateDetails;
    let sheet;
    if (touch) {
      sheet = h('dialog', 'cx-drawer cx-context-sheet'); sheet.dataset.side = 'bottom';
      sheet.dataset.hfxPart = 'drawer'; sheet.hidden = true; sheet.setAttribute('aria-label', label);
      document.body.append(sheet); sheet.append(menu);
    }
    const anchor = options.anchor?.(event, element) || (byKey && !options.match && nodeOf(event)) || element;
    const before = ['tabindex'].map(name => [name, anchor.getAttribute(name)]);
    if (!anchor.matches('button,input,select,textarea,a[href],[tabindex]')) anchor.tabIndex = -1;
    const surface = sheet || menu, detail = { menu, surface, element, event, touch };
    const entry = current = { menu, sheet, surface, anchor, before, detail, written: new Map(), closeEvent: sheet ? 'cx-drawer:close' : 'cx-menu:close' };
    entry.controller = UI_IMPL.menu(menu, { ...options, trigger: anchor, host: options.host || element,
      eventRoot: options.eventRoot || options.host || element, surface: sheet, bindTrigger: false, decorateTrigger: false, label }, signal);
    entry.closed = ev => { if (ev.target === surface) release(entry, ev.detail.reason); };
    entry.native = ev => { if (!nativeMenu(ev)) ev.preventDefault(); };
    surface.addEventListener(entry.closeEvent, entry.closed);
    surface.addEventListener('contextmenu', entry.native);
    entry.written = new Map(before.map(([name]) => [name, anchor.getAttribute(name)]));
    const opened = entry.controller.open({ modal: touch, point: settings.point ||
      (!byKey && !touch && event ? { x: event.clientX, y: event.clientY } : undefined) });
    if (current !== entry) return false;
    entry.written = new Map(before.map(([name]) => [name, anchor.getAttribute(name)]));
    if (!opened) { release(entry, 'cancel'); return false; }
    options.onOpen?.(detail);
    return current === entry;
  }
  listener.addEventListener('contextmenu', event => {
    if (event.defaultPrevented || nativeMenu(event)) return;
    // A key can also raise contextmenu on the newly focused menu item.
    if (current?.surface.contains(event.target)) { event.preventDefault(); return; }
    const element = match(event); if (!element) return;
    if (suppressClick || press || event.pointerType === 'touch') { event.preventDefault(); return; }
    if (open(event, element)) event.preventDefault();
  }, { signal });
  listener.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    const element = match(event);
    if (element && open(event, element, { keyboard: true })) { event.preventDefault(); event.stopPropagation(); }
  }, { signal });
  listener.addEventListener('pointerdown', event => {
    clearPress(); suppressClick = false;
    const element = match(event);
    if (event.pointerType !== 'touch' || !element || nativeMenu(event) || event.isPrimary === false || options.gesture?.(event, element) === false) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    pressTimer = setTimeout(() => {
      if (press && open(event, element, { touch: true })) suppressClick = true;
      clearPress();
    }, 500);
  }, { signal });
  document.addEventListener('pointermove', event => {
    if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) clearPress();
  }, { signal, passive: true });
  for (const type of ['pointerup', 'pointercancel', 'scroll']) document.addEventListener(type, clearPress, { signal, capture: true, passive: true });
  listener.addEventListener('click', event => {
    if (suppressClick && match(event)) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }, { signal, capture: true });
  if (options.closeOnFocusOutside) document.addEventListener('focusin', event => {
    if (current && !current.surface.contains(event.target) && !current.anchor.contains(event.target)) close('blur', false);
  }, { signal });
  global.addEventListener('blur', clearPress, { signal });
  const dispose = () => { if (!destroyed) { destroyed = true; clearPress(); close('destroy', false, true); lifetime.abort(); } };
  dispose.open = open; dispose.close = close;
  return dispose;
};
