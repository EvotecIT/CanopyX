// Deferred bodies preserve server-rendered headings and use host-trusted HTML,
// exactly like the .NET ContentHtml contract. Loaders also receive AbortSignal.
UI_TOOLS.navigation.deferred = (root, prefix, options, life, retry) => {
  const bodies = new Map();
  const printCache = new Map(), projections = new Map();
  let printJob, destroyed = false;
  const n = UI_TOOLS.navigation, labels = UI_TOOLS.labels(options.labels);
  const templateFor = panel => Array.from(panel.children).find(el => el.tagName === 'TEMPLATE');
  function bodyFor(item) {
    if (!item.panel) return null;
    if (!bodies.has(item.panel)) {
      const template = templateFor(item.panel);
      const body = document.createElement('div');
      body.className = 'cx-navigation-body';
      for (const child of Array.from(item.panel.childNodes)) {
        if (child === template || child.nodeType === 1 && child.matches('h3,[data-hfx-part="title"],.cx-step-print-state,.cx-step-errors,.cx-navigation-print')) continue;
        body.append(child);
      }
      item.panel.append(body);
      bodies.set(item.panel, { body, template, loaded: false });
    }
    return bodies.get(item.panel);
  }
  function isDeferred(item) { return !!item && (item.deferred ?? (options.deferred || !!item.loader || !!item.panel?.querySelector('template'))); }
  async function load(item, signal, live) {
    if (destroyed || life.signal.aborted || signal.aborted || !live()) return false;
    if (!isDeferred(item) || !item.panel) { n.panelTabStop(item.panel); return true; }
    const entry = bodyFor(item);
    if (entry.loaded && (item.keepAlive ?? options.keepAlive) !== false) return true;
    removeProjection(item.panel); printCache.delete(item.panel);
    entry.loaded = false;
    const { body, template } = entry;
    body.replaceChildren();
    const status = document.createElement('div');
    status.className = 'cx-navigation-loading'; status.setAttribute('role', 'status');
    const spinner = document.createElement('span'); spinner.className = 'cx-navigation-spinner';
    spinner.setAttribute('aria-hidden', 'true'); status.append(spinner, document.createTextNode(labels.stateLoading));
    const skeleton = h('div', 'cx-navigation-skeleton'); skeleton.setAttribute('aria-hidden', 'true');
    skeleton.append(h('span'), h('span'), h('span'));
    body.append(status, skeleton); item.panel.setAttribute('aria-busy', 'true'); item.panel.dataset.state = 'loading';
    const token = {}; token.done = new Promise(resolve => { token.resolve = resolve; }); entry.pending = token;
    const interrupted = () => {
      if (entry.pending !== token) return;
      token.resolve();
      if (destroyed || life.signal.aborted) return;
      item.panel.removeAttribute('aria-busy');
      const again = n.button(labels.stateRetry, 'cx-navigation-retry');
      again.addEventListener('click', () => retry(item.id), { signal: life.signal });
      body.replaceChildren(again); item.panel.dataset.state = 'selected';
    };
    signal.addEventListener('abort', interrupted, { once: true });
    try {
      const loader = item.loader || options.loader;
      const content = loader ? await loader(item, signal) : template?.content.cloneNode(true);
      if (entry.pending !== token || !live() || signal.aborted || life.signal.aborted) return false;
      body.replaceChildren();
      if (content != null) UI_TOOLS.content(body, content);
      entry.loaded = true; item.panel.dataset.state = 'selected';
      UI_TOOLS.emit(root, prefix, 'load', { item, panel: item.panel });
      n.panelTabStop(item.panel);
      return true;
    } catch (error) {
      if (entry.pending !== token || !live() || signal.aborted || life.signal.aborted) return false;
      item.panel.dataset.state = 'error';
      const alert = document.createElement('div'); alert.setAttribute('role', 'alert');
      alert.className = 'cx-navigation-error'; setText(alert, error?.message || labels.stateDetails);
      const again = n.button(labels.stateRetry, 'cx-navigation-retry');
      again.addEventListener('click', () => retry(item.id), { signal: life.signal });
      body.replaceChildren(alert, again);
      UI_TOOLS.emit(root, prefix, 'error', { item, error });
      n.panelTabStop(item.panel);
      return false;
    } finally {
      signal.removeEventListener('abort', interrupted);
      token.resolve();
      if (entry.pending === token) {
        entry.pending = null;
        if (live()) item.panel.removeAttribute('aria-busy');
      }
    }
  }
  function leave(item) {
    const entry = item && bodies.get(item.panel);
    item?.panel?.removeAttribute('aria-busy');
    if (entry && (item.keepAlive ?? options.keepAlive) === false) {
      // Retain a detached print snapshot before disposing the interactive body.
      if (entry.loaded) printCache.set(item.panel, snapshot(entry.body));
      entry.body.replaceChildren(); entry.loaded = false;
    }
  }
  function snapshot(body) {
    const fragment = document.createDocumentFragment();
    for (const child of body.childNodes) fragment.append(cloneForPrint(child));
    return fragment;
  }
  function cloneForPrint(node) {
    const copy = node.cloneNode(true), selector = 'input,textarea,select';
    // cloneNode does not preserve all current form properties (notably selects).
    const fields = el => [...(el.matches?.(selector) ? [el] : []), ...(el.querySelectorAll?.(selector) || [])];
    const source = fields(node), copies = fields(copy);
    source.forEach((field, index) => {
      const target = copies[index];
      if (field.tagName === 'SELECT') Array.from(field.options).forEach((option, i) => { target.options[i].selected = option.selected; });
      else {
        if (field.type !== 'file') target.value = field.value;
        if (field.tagName === 'INPUT') target.checked = field.checked;
      }
    });
    return copy;
  }
  function removeProjection(panel) { projections.get(panel)?.remove(); projections.delete(panel); }
  function printItems() {
    // Discovery for printing must not invoke renderIcon or change host markup.
    return n.records(root, prefix, { ...options, renderIcon: undefined }).filter(item => item.panel &&
      (root.dataset.print !== 'selected' || !item.panel.hidden));
  }
  function project(item, content) {
    removeProjection(item.panel);
    const projection = h('div', 'cx-navigation-print');
    projection.setAttribute('aria-hidden', 'true'); projection.inert = true;
    // A loader may return a connected node. Never move host-owned content.
    if (content != null) UI_TOOLS.content(projection, content?.nodeType ? cloneForPrint(content) : content);
    // Inert projections must not join live radio groups or form submissions.
    for (const field of projection.querySelectorAll('input,textarea,select,button')) {
      field.removeAttribute('name'); field.removeAttribute('form');
    }
    for (const element of projection.querySelectorAll('[id]')) element.removeAttribute('id');
    // Give unvisited fallback content the same body boundary as live loads.
    // Print CSS hides that body while retaining headings and step state.
    bodyFor(item);
    item.panel.append(projection); projections.set(item.panel, projection);
  }
  function projectLocal() {
    if (destroyed || life.signal.aborted) return;
    const items = printItems(), panels = new Set(items.map(item => item.panel));
    for (const panel of projections.keys()) if (!panels.has(panel) || bodies.get(panel)?.loaded) removeProjection(panel);
    for (const item of items) {
      if (!isDeferred(item) || bodies.get(item.panel)?.loaded || projections.has(item.panel)) continue;
      const content = printCache.get(item.panel) || (!(item.loader || options.loader) && templateFor(item.panel)?.content);
      if (content) project(item, content);
    }
  }
  function cancelPrint(clearCache = true) {
    printJob?.controller.abort(); printJob = null;
    for (const panel of projections.keys()) removeProjection(panel);
    if (clearCache) printCache.clear();
  }
  function waitForPrint(value, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Print preparation cancelled', 'AbortError'));
      const task = Promise.resolve(value);
      if (signal.aborted) { task.catch(() => {}); abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  async function preparePrint() {
    if (destroyed || life.signal.aborted) throw new DOMException('UI component destroyed', 'AbortError');
    if (printJob) return printJob.task;
    const job = { controller: new AbortController() }; printJob = job;
    const signal = job.controller.signal;
    job.task = (async () => {
      projectLocal();
      for (const item of printItems()) {
        if (!isDeferred(item)) continue;
        const entry = bodies.get(item.panel);
        if (entry?.pending) await waitForPrint(entry.pending.done, signal);
        if (entry?.loaded || projections.has(item.panel)) continue;
        const loader = item.loader || options.loader;
        const content = loader ? await waitForPrint(loader(item, signal), signal) : templateFor(item.panel)?.content;
        if (signal.aborted || destroyed || life.signal.aborted) throw new DOMException('Print preparation cancelled', 'AbortError');
        // Selection can change while a print-only loader is pending.
        if (!printItems().some(current => current.panel === item.panel) || bodies.get(item.panel)?.loaded) continue;
        project(item, content);
      }
      projectLocal();
    })().catch(error => {
      if (printJob === job) cancelPrint(false);
      throw error;
    }).finally(() => { if (printJob === job) printJob = null; });
    return job.task;
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; cancelPrint();
    for (const [panel, entry] of bodies) { panel.removeAttribute('aria-busy'); entry.pending?.resolve(); }
    bodies.clear();
  }
  window.addEventListener('beforeprint', projectLocal, { signal: life.signal });
  window.addEventListener('afterprint', cancelPrint, { signal: life.signal });
  life.signal.addEventListener('abort', destroy, { once: true });
  return { load, leave, destroy, isDeferred, preparePrint };
};
