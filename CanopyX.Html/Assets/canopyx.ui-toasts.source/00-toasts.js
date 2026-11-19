// Notifications in a region: up to max toasts show at once and the rest wait in order. Each toast has a tone (the shared tone
// names), an optional title, a message, up to three actions and a timeout that pauses while the pointer is over the region,
// focus is inside it or the page is hidden. Screen readers hear each toast through a live region: polite, or assertive for
// danger. Showing a toast with an id that is already shown updates it in place, which suits a server pushing progress.
const TOAST_ROLES = { neutral: 'neutral', info: 'info', success: 'good', warning: 'warn', danger: 'bad', muted: 'neutral' };
const TOAST_POSITIONS = ['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end'];
let toastSequence = 0;

function toastNumber(value, fallback, what, low, high) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < low || number > high) throw new Error('CanopyX: toast ' + what + ' must be a whole number from ' + low + ' to ' + high + '.');
  return number;
}
function toastText(value, what, max, required) {
  if (value === undefined || value === null) { if (required) throw new Error('CanopyX: a toast needs ' + what + '.'); return null; }
  if (typeof value !== 'string' || value.length > max) throw new Error('CanopyX: a toast ' + what + ' is text of at most ' + max + ' characters.');
  return value;
}

/** Checks and normalises what show() receives: a message, or { id, tone, title, message, content, timeout, actions, dismissible }. */
function toastSpec(input, settings, taken = () => false) {
  const raw = typeof input === 'string' ? { message: input } : input;
  if (!raw || typeof raw !== 'object') throw new Error('CanopyX: show() needs a message or toast options.');
  const tone = raw.tone ?? 'info', actions = raw.actions ?? [];
  if (typeof tone !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(tone) || tone.endsWith('-bg')) throw new Error('CanopyX: unknown toast tone.');
  if (!Array.isArray(actions) || actions.length > 3) throw new Error('CanopyX: a toast has at most three actions.');
  let id = toastText(raw.id, 'id', 128);
  // A generated id never takes one the host uses, shown, queued or about to be read from the page.
  while (id === null) { const next = 'cx-toast-' + ++toastSequence; if (!taken(next)) id = next; }
  const spec = { id, tone, title: toastText(raw.title, 'title', 200),
    message: toastText(raw.message, 'message', 2000, raw.content == null), content: raw.content ?? null, dismissible: raw.dismissible !== false,
    onClose: typeof raw.onClose === 'function' ? raw.onClose : null,
    actions: actions.map((action, index) => {
      if (!action || typeof action !== 'object') throw new Error('CanopyX: a toast action needs a label.');
      if (action.href !== undefined && !/^(https?:|mailto:|\/|\.|#|[^:]*$)/i.test(String(action.href))) throw new Error('CanopyX: a toast action link must be a web address.');
      return { id: toastText(action.id, 'action id', 64) ?? 'action-' + index, label: toastText(action.label, 'action label', 60, true), href: action.href ?? null,
        onSelect: typeof action.onSelect === 'function' ? action.onSelect : null, close: action.close !== false };
    }) };
  // Errors and toasts that ask for a decision stay until the reader dismisses them, unless the host names a timeout.
  spec.timeout = toastNumber(raw.timeout, tone === 'danger' || spec.actions.length ? 0 : settings.timeout, 'timeout', 0, 600000);
  return spec;
}

UI_IMPL.toasts = (root, options = {}, signal) => {
  const labels = UI_TOOLS.labels(options.labels), data = root.dataset;
  const settings = { position: options.position ?? data.position ?? 'bottom-end', max: toastNumber(options.max ?? data.max, 3, 'max', 1, 10),
    timeout: toastNumber(options.timeout ?? data.timeout, 5000, 'timeout', 0, 600000) };
  if (!TOAST_POSITIONS.includes(settings.position)) throw new Error('CanopyX: unknown toast position.');
  const home = root.parentNode, homeNext = root.nextSibling, toasts = new Map(), queue = [], reserved = new Set();
  const list = root.querySelector(':scope > .cx-toasts-list') || root.appendChild(h('ol', 'cx-toasts-list'));
  const more = h('p', 'cx-toasts-more'), polite = h('div', 'cx-visually-hidden'), assertive = h('div', 'cx-visually-hidden');
  // Toasts written into the page (the .NET builder's) are read, then shown through the queue like any other.
  const written = [...list.children].filter(item => item.matches('.cx-toast')).map(item => ({ id: item.dataset.toastId || undefined,
    tone: item.dataset.tone || undefined, timeout: item.dataset.timeout, title: item.querySelector('.cx-toast-title')?.textContent ?? undefined,
    message: item.querySelector('.cx-toast-message')?.textContent ?? '' }));
  list.replaceChildren();
  root.classList.add('cx-toasts'); root.dataset.position = settings.position; root.dataset.cxPart = 'toasts';
  if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) { root.setAttribute('aria-label', labels.toastRegion); root.dataset.cxLabelled = 'true'; }
  if (!root.hasAttribute('role') && root.localName !== 'section') { root.setAttribute('role', 'region'); root.dataset.cxRole = 'true'; }
  more.hidden = true; more.dataset.cxPart = 'more';
  polite.setAttribute('aria-live', 'polite'); assertive.setAttribute('aria-live', 'assertive');
  for (const live of [polite, assertive]) { live.setAttribute('aria-atomic', 'false'); live.dataset.cxPart = 'announcer'; }
  root.append(more, polite, assertive);
  let hover = false, focus = false, outside = null;
  const paused = () => hover || focus || document.hidden;
  // The tone in words, so a reader who does not see the colour hears it; host tones read as a notice.
  const toneLabel = tone => labels[{ info: 'toastInfo', success: 'toastSuccess', warning: 'toastWarning', danger: 'toastDanger' }[tone] || 'toastNeutral'];

  // What a toast says: its tone in words, title and the rendered message, so HTML content is read as its text.
  const words = toast => [toneLabel(toast.spec.tone), toast.spec.title, toast.element.querySelector('.cx-toast-message')?.textContent.trim()].filter(Boolean).join(': ');
  function announce(toast) {
    const live = toast.spec.tone === 'danger' ? assertive : polite, line = h('p');
    setText(line, words(toast));
    // A new paragraph is an addition, so the same text said twice is announced twice; a few lines are kept for readers catching up.
    live.append(line); while (live.children.length > 3) live.firstElementChild.remove();
  }
  function arm(toast) {
    if (!toast.spec.timeout || toast.timer || paused() || !toast.element.isConnected) return;
    toast.started = performance.now();
    toast.timer = setTimeout(() => { toast.timer = 0; close(toast.spec.id, 'timeout'); }, toast.remaining);
  }
  function disarm(toast) {
    if (!toast.timer) return;
    clearTimeout(toast.timer); toast.timer = 0;
    toast.remaining = Math.max(0, toast.remaining - (performance.now() - toast.started));
  }
  const pause = () => toasts.forEach(disarm), resume = () => { if (!paused()) toasts.forEach(arm); };

  function paint(toast) {
    const { spec, element } = toast, known = Object.hasOwn(TOAST_ROLES, spec.tone);
    // An update repaints the toast; focus on one of its controls moves to the same control in the new paint.
    const active = element.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active && (active.dataset.actionId ? '[data-action-id="' + CSS.escape(active.dataset.actionId) + '"]' : active.dataset.cxPart ? '[data-cx-part="' + active.dataset.cxPart + '"]' : null);
    element.dataset.tone = spec.tone;
    // A host tone reads its colour from the theme, as tones in cells and badges do.
    if (known) element.style.removeProperty('--cx-toast-tone');
    else element.style.setProperty('--cx-toast-tone', 'var(--hfx-color-status-' + spec.tone + '-fg,var(--hfx-color-text-muted))');
    const icon = h('span', 'cx-toast-icon'), body = h('div', 'cx-toast-body'), tone = h('span', 'cx-visually-hidden');
    icon.setAttribute('aria-hidden', 'true'); icon.dataset.cxPart = 'icon';
    body.dataset.cxPart = 'body';
    setText(tone, toneLabel(spec.tone) + ': ');
    body.append(tone);
    if (spec.title) { const title = h('strong', 'cx-toast-title'); title.dataset.cxPart = 'title'; setText(title, spec.title); body.append(title); }
    const message = h('div', 'cx-toast-message'); message.dataset.cxPart = 'message';
    if (spec.content != null) UI_TOOLS.content(message, spec.content); else setText(message, spec.message);
    body.append(message);
    const parts = [icon, body];
    if (spec.actions.length) {
      const actions = h('div', 'cx-toast-actions'); actions.dataset.cxPart = 'actions';
      for (const action of spec.actions) {
        const control = h(action.href ? 'a' : 'button', 'cx-toast-action');
        if (action.href) control.href = action.href; else control.type = 'button';
        control.dataset.actionId = action.id; setText(control, action.label);
        control.addEventListener('click', event => select(toast, action, event));
        actions.append(control);
      }
      parts.push(actions);
    }
    if (spec.dismissible) {
      const dismiss = h('button', 'cx-toast-close'); dismiss.type = 'button'; dismiss.dataset.cxPart = 'close';
      dismiss.setAttribute('aria-label', labels.toastClose); dismiss.addEventListener('click', () => close(spec.id, 'close'));
      parts.push(dismiss);
    }
    element.replaceChildren(...parts);
    if (active) (focusKey && element.querySelector(focusKey) || element.querySelector('button,a[href]'))?.focus({ preventScroll: true });
  }
  function select(toast, action, event) {
    if (!UI_TOOLS.emit(root, 'toasts', 'action', { id: toast.spec.id, action: action.id }, true)) { event.preventDefault(); return; }
    action.onSelect?.({ id: toast.spec.id, action: action.id, event });
    if (action.close) close(toast.spec.id, 'action');
  }

  // Shown above an open modal dialog: everything outside the topmost one is inert, so the region joins it while it is open.
  function place() {
    // The topmost modal is the one opened last, whatever its place in the page. Modals already open when the region starts have no
    // opening order the page can read, so they count in document order.
    for (const dialog of [...modals]) if (!dialog.isConnected || !dialog.open || !dialog.matches(':modal')) modals.delete(dialog);
    for (const dialog of document.querySelectorAll('dialog[open]')) if (dialog.matches(':modal') && !modals.has(dialog) && !root.contains(dialog)) modals.add(dialog);
    const target = [...modals].at(-1) || home;
    if (target && root.parentNode !== target) target.insertBefore(root, target === home && homeNext?.parentNode === home ? homeNext : null);
  }
  function flush() {
    place();
    while (queue.length && list.children.length < settings.max) {
      const toast = queue.shift();
      list.append(toast.element); announce(toast); arm(toast);
      UI_TOOLS.emit(root, 'toasts', 'show', { id: toast.spec.id });
    }
    list.hidden = !list.children.length;
    more.hidden = !queue.length;
    setText(more, queue.length ? fill(labels.toastQueued, { count: queue.length }) : '');
  }

  function show(input) {
    if (signal?.aborted) throw new Error('CanopyX: UI component destroyed.');
    const spec = toastSpec(input, settings, id => toasts.has(id) || reserved.has(id)), current = toasts.get(spec.id);
    if (current) {
      // The same id updates the toast: its text, tone and actions change and its timeout starts again.
      const before = words(current);
      disarm(current); current.spec = spec; current.remaining = spec.timeout; paint(current);
      if (current.element.isConnected) { if (words(current) !== before) announce(current); arm(current); }
      return spec.id;
    }
    const element = h('li', 'cx-toast');
    element.dataset.toastId = spec.id; element.dataset.cxPart = 'toast';
    const toast = { spec, element, timer: 0, remaining: spec.timeout, started: 0 };
    paint(toast); toasts.set(spec.id, toast); queue.push(toast); flush();
    return spec.id;
  }
  function close(id, reason = 'api') {
    const toast = toasts.get(id);
    if (!toast) return false;
    const focused = toast.element.contains(document.activeElement), siblings = [...list.children], at = siblings.indexOf(toast.element);
    disarm(toast); toasts.delete(id);
    const waiting = queue.indexOf(toast);
    if (waiting >= 0) queue.splice(waiting, 1);
    toast.element.remove();
    flush();
    // Focus stays with the notifications while there are any, and otherwise goes back to where the reader came from.
    if (focused) {
      const next = list.children[Math.min(at, list.children.length - 1)];
      (next?.querySelector('button,a[href]') || (outside?.isConnected ? outside : null))?.focus({ preventScroll: true });
      // Not every engine sends focusout for a removed element: the region is unpaused once focus has left it.
      if (!root.contains(document.activeElement)) { focus = false; resume(); }
    }
    try { toast.spec.onClose?.({ id, reason }); } finally { UI_TOOLS.emit(root, 'toasts', 'close', { id, reason }); }
    if (!toasts.size) place();
    return true;
  }
  const clear = () => { for (const id of [...queue.map(toast => toast.spec.id).reverse(), ...[...list.children].map(item => item.dataset.toastId)]) close(id, 'clear'); };

  root.addEventListener('pointerenter', () => { hover = true; pause(); }, { signal });
  root.addEventListener('pointerleave', () => { hover = false; resume(); }, { signal });
  root.addEventListener('focusin', event => { if (!focus && !root.contains(event.relatedTarget)) outside = event.relatedTarget; focus = true; pause(); }, { signal });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) { focus = false; resume(); } }, { signal });
  root.addEventListener('keydown', event => {
    const item = event.target.closest?.('.cx-toast');
    if (event.key === 'Escape' && item && toasts.get(item.dataset.toastId)?.spec.dismissible) { event.preventDefault(); event.stopPropagation(); close(item.dataset.toastId, 'close'); }
  }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); }, { signal });
  // A modal dialog opening makes the region inert, and one closing leaves it inside a hidden element: either way it moves.
  // A modal dialog removed from the page takes the region with it; the region goes back home with its toasts.
  const modals = new Set();
  const dialogs = new MutationObserver(records => {
    // Only an opening (no open attribute before) moves a modal to the top; rewriting the attribute of an open one keeps its place.
    for (const record of records) if (record.type === 'attributes' && record.target.localName === 'dialog') {
      if (!record.target.open) modals.delete(record.target);
      else if (record.oldValue === null && record.target.matches(':modal') && !root.contains(record.target)) { modals.delete(record.target); modals.add(record.target); }
    }
    if (toasts.size && (!root.isConnected || records.some(record => record.target.localName === 'dialog'))) place();
  });
  dialogs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['open'] });
  document.addEventListener('close', () => queueMicrotask(place), { capture: true, signal });
  signal?.addEventListener('abort', () => {
    dialogs.disconnect(); toasts.forEach(disarm); toasts.clear(); queue.length = 0; list.replaceChildren(); more.remove(); polite.remove(); assertive.remove();
    if (root.dataset.cxLabelled) { root.removeAttribute('aria-label'); delete root.dataset.cxLabelled; }
    if (root.dataset.cxRole) { root.removeAttribute('role'); delete root.dataset.cxRole; }
    if (home && root.parentNode !== home) home.insertBefore(root, homeNext?.parentNode === home ? homeNext : null);
  }, { once: true });
  list.hidden = true;
  for (const id of written.map(item => item.id).filter(Boolean)) reserved.add(id);
  for (const spec of written) { reserved.delete(spec.id); show(spec); }
  return { show, close, clear, getState: () => ({ visible: [...list.children].map(item => item.dataset.toastId), queued: queue.map(toast => toast.spec.id) }) };
};
