  // Standalone UI uses the same versioned, nonce-aware parts loader as data views and plugins.
  function UiHost() {}
  const UI_IMPL = {}, UI_TOOLS = {}, uiInstances = new WeakMap();
  const UI_KINDS = { tabs: "ui-tabs", stepper: "ui-stepper", menu: "ui-menu", dialog: "ui-overlays", drawer: "ui-overlays", popover: "ui-overlays", tooltip: "ui-overlays" };
  const uiContext = () => ({ UI_IMPL, UI_TOOLS, h, setText, fill, watchTheme, overlayTheme, hostHtml });
  for (const name of ["ui-overlays", "ui-menu", "ui-picker", "ui-navigation", "ui-tabs", "ui-stepper"]) SHARED_PARTS[name] = definePart(UiHost, name, name.replace("ui-", "UI "), uiContext);

  function createUi(kind, target, options = {}) {
    const root = typeof target === "string" ? document.querySelector(target) : target;
    if (root?.nodeType !== 1) throw new Error("CanopyX: " + kind + " needs an element.");
    let registrations = uiInstances.get(root);
    if (!registrations) uiInstances.set(root, registrations = new Map());
    if (registrations.has(kind)) return registrations.get(kind);
    const lifetime = new AbortController();
    watchTheme(root, lifetime.signal);
    let instance = null;
    const ready = loadPart(SHARED_PARTS[UI_KINDS[kind]]).then(() => {
      if (lifetime.signal.aborted) throw new DOMException("UI component destroyed.", "AbortError");
      instance = UI_IMPL[kind](root, options, lifetime.signal);
      return instance.ready || instance;
    });
    const api = { element: root, ready: ready.then(() => api), destroy() {
      if (lifetime.signal.aborted) return;
      lifetime.abort(); instance?.destroy?.(); registrations.delete(kind);
    } };
    for (const name of ["select", "getSelected", "refresh", "preparePrint", "open", "close", "next", "back", "skip", "finish", "setStepState", "getState"]) api[name] = (...args) => {
      if (lifetime.signal.aborted) throw new Error("CanopyX: UI component destroyed.");
      return instance ? instance[name]?.(...args) : ready.then(() => instance[name]?.(...args));
    };
    api.ready.catch(error => { if (error.name !== "AbortError") root.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error }, bubbles: true })); });
    registrations.set(kind, Object.freeze(api));
    return api;
  }

  function bindContextMenu(target, items, options = {}) {
    if (typeof target !== "string" && target?.nodeType !== 1) throw new Error("CanopyX: contextMenu needs an element or selector.");
    if (typeof target === "string") document.documentElement.matches(target);
    let disposed = false, cleanup = null;
    const dispose = () => { disposed = true; cleanup?.(); };
    dispose.ready = loadPart(SHARED_PARTS["ui-menu"]).then(() => { if (!disposed) cleanup = UI_IMPL.contextMenu(target, items, options); });
    dispose.open = (...args) => disposed ? false : cleanup ? cleanup.open(...args) : dispose.ready.then(() => !disposed && cleanup.open(...args));
    dispose.close = (...args) => cleanup?.close(...args);
    return dispose;
  }

  function mountUi(root = document) {
    const mounted = [];
    for (const kind of Object.keys(UI_KINDS)) {
      const selector = "[data-cx-" + kind + "]", nodes = [...root.querySelectorAll(selector)];
      if (root.matches?.(selector)) nodes.unshift(root);
      for (const element of nodes) {
        if (kind === "menu" && element.parentElement?.closest(selector)) continue;
        if (kind === "stepper" && ["report", "static"].includes(element.dataset.mode)) continue;
        mounted.push(createUi(kind, element));
      }
    }
    return mounted;
  }
  const UI_API = { mountUi, contextMenu: bindContextMenu };
  for (const kind of Object.keys(UI_KINDS)) UI_API[kind] = (target, options) => createUi(kind, target, options);
