  // ---------- flows: createFlow and the forms and flow parts (docs/flow.md) ----------
  // The flow entry point and the grid entry points both carry this shell. The steps, fields, review and proposal ship in the
  // flow part (canopyx-flow.js) and the editors and field checks in the forms part (canopyx-forms.js), which grid editing
  // shares (Build/parts.json); the host-connected features each ship in a part of their own. createFlow answers at once with
  // the flow's API; its ready promise settles once the parts are in
  // and the first step is painted. Async calls wait for it; synchronous calls require the implementation to be available.
  class FlowHost {}
  const FORMS_IMPL = {}, FLOW_IMPL = {}, activeFlows = new WeakMap();
  const FORMS_PART = definePart(FlowHost, "forms", "forms", () => ({ FORMS_IMPL, h, setText, fill, gridFreeze, gridMomentFromParts, boundedPattern, foldText }));
  // Pick steps embed a grid or a tree: the grid entry points lend the flow part their factories (88-grid-flow-views.js); the
  // flow entry has neither.
  const FLOW_VIEWS = typeof FLOW_GRID_VIEWS === "object" ? FLOW_GRID_VIEWS : Object.freeze({ grid: null, tree: null, reporting: false });
  const FLOW_PART = definePart(FlowHost, "flow", "flow view", () => ({ FLOW_IMPL, FORMS_IMPL, h, setText, fill, plural, foldText, boundedPattern, numberFormat, gridFreeze }));
  // The host-connected features ship in parts of their own, each loaded only for a flow that uses it (Build/parts.json).
  const FLOW_FEATURES = {};
  for (const name of ["host", "checks", "options", "pick", "records", "drafts", "preview", "command", "tasks", "dialog", "links", "endpoint", "consent", "facts"])
    FLOW_FEATURES[name] = definePart(FlowHost, "flow-" + name, "flow " + name, () => ({ FLOW_IMPL, FORMS_IMPL, h, setText, fill, plural, numberFormat, FLOW_VIEWS }));
  // Grid editing requires the same forms part: one definition, one load, one install.
  if (typeof DataGrid === "function") DataGrid.prototype.parts.forms = FORMS_PART;
  // The flow-wide keys of host-connected flows, the parts that read them, and the values that need no part.
  const FLOW_DOC_PARTS = { command: "command", presets: "drafts", draft: "drafts", deepLinks: "links", endpoint: "endpoint" }, FLOW_DOC_PLAIN = { draft: "none", deepLinks: false };

  /**
   * The feature parts a flow loads with the flow part, before its document is read: the ones whose keys the document uses (the
   * same decisions as C#'s CanopyHtmlPart), and the ones the host's hooks add. Parts the document names are required; a part
   * only a hook asks for (a preview, a preset store) is optional, so a page that cannot load it still shows the flow without
   * the feature. The strict reading of the document comes after.
   */
  function flowFeatures(doc, hooks) {
    const names = new Set(), add = (name, on) => on && names.add(name), list = value => Array.isArray(value) ? value : [];
    const object = value => value !== null && typeof value === "object" && !Array.isArray(value), has = (value, ...keys) => object(value) && keys.some(key => value[key] !== undefined);
    for (const [key, name] of Object.entries(FLOW_DOC_PARTS)) add(name, doc[key] !== undefined && doc[key] !== FLOW_DOC_PLAIN[key]);
    add("tasks", doc.mode === "tasks"); add("dialog", has(doc.layout, "launch") || has(doc.layout, "container") && doc.layout.container !== "inline"); add("preview", list(doc.endpoint?.routes).includes("preview"));
    for (const step of list(doc.steps).filter(object)) {
      add("facts", step.facts !== undefined); add("checks", step.checks !== undefined); add("pick", step.type === "pick"); add("preview", step.preview === true); add("consent", has(step, "confirm", "acknowledge"));
      for (const block of [step, ...list(step.sections)]) {
        if (block !== step) add("options", has(block, "source", "dependsOn"));
        for (const field of object(block) ? list(block.fields) : []) { add("options", has(field, "dependsOn") || has(field, "source") && field.source !== "document"); add("records", object(field) && field.type === "records"); }
      }
    }
    hooks = object(hooks) ? hooks : {};
    return { required: [...names], optional: [typeof hooks.preview === "function" && "preview", object(hooks.presetStore) && "drafts"].filter(name => name && !names.has(name)) };
  }
  const FLOW_ASYNC_METHODS = ["next", "back", "goTo", "setState", "validate", "submit", "runCheck", "refreshOptions", "saveDraft", "setPreset"];
  const FLOW_SYNC_METHODS = ["getStep", "getValues", "setValues", "getState", "isDirty", "reset", "setFieldError", "setProgress", "complete", "setStepState", "invalidateChecks", "open", "close"];

  /**
   * Creates a flow in a host element from a flow document (docs/flow.md).
   * @param {HTMLElement} host The element that receives the flow.
   * @param {{ flow: object, values?: object, labels?: object, hooks?: object, editors?: object, onReady?: Function, onStepChange?: Function,
   *           onValueChange?: Function, onSubmit?: Function, onSubmitted?: Function, onReload?: Function }} options
   */
  function createFlow(host, options) {
    if (!host || !options || !options.flow || typeof options.flow !== "object") throw new Error("CanopyX: createFlow needs a host element and a flow document.");
    const existing = activeFlows.get(host);
    if (existing) return existing;
    const disposeTheme = watchTheme(host);
    let impl = null, destroyed = false, mountError = null;
    const destroyedError = () => new Error("CanopyX: this flow has been destroyed.");
    const requireImpl = name => {
      if (destroyed) throw destroyedError();
      if (!impl) throw new Error("CanopyX: flow is not ready; await api.ready before calling " + name + "().");
      return impl;
    };
    // Plugins registered on the page lend their editors; the flow's own editors option wins over them.
    const editors = Object.assign({}, ...[...PLUGINS.values()].map(item => item.editors || {}));
    // The feature parts the document names load with the flow part; one that only a hook asks for may fail without stopping the flow.
    const { required, optional } = flowFeatures(options.flow, options.hooks);
    const ready = Promise.all([loadPart(FLOW_PART), ...required.map(name => loadPart(FLOW_FEATURES[name])), ...optional.map(name => loadPart(FLOW_FEATURES[name])
      .catch(error => host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook: "part" }, bubbles: true }))))]).then(async () => {
      if (destroyed) throw destroyedError();
      impl = FLOW_IMPL.create(host, options, editors);
      return impl.ready;
    });
    const api = { element: host, flow: options.flow, view: options.flow };
    for (const name of FLOW_SYNC_METHODS) api[name] = (...args) => requireImpl(name)[name](...args);
    for (const name of FLOW_ASYNC_METHODS) api[name] = (...args) => {
      if (destroyed) return Promise.reject(destroyedError());
      return ready.then(() => requireImpl(name)[name](...args));
    };
    api.ready = ready.then(() => { if (destroyed) throw destroyedError(); return api; });
    // The failure shows in the host and as canopyx:error; a host that never reads ready sees no unhandled rejection.
    api.ready.catch(() => {});
    api.destroy = () => {
      if (destroyed) return;
      destroyed = true; disposeTheme();
      try { impl?.destroy(); }
      finally {
        impl = null;
        mountError?.remove();
        if (activeFlows.get(host) === api) {
          activeFlows.delete(host);
          if (host.canopyx === api) delete host.canopyx;
          host.removeAttribute("data-canopyx-mounted");
          host.removeAttribute("data-cx-ready");
          host.removeAttribute("data-cx-error");
          host.classList.remove("cx-flow-host");
        }
      }
    };
    ready.catch(error => {
      if (destroyed) return;
      const notice = mountError = h("div", "cx-mount-error");
      notice.setAttribute("role", "alert");
      setText(notice, error && error.message ? error.message : String(error));
      host.appendChild(notice);
      host.setAttribute("data-cx-error", notice.textContent);
      host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error }, bubbles: true }));
    });
    Object.freeze(api);
    activeFlows.set(host, api);
    host.classList.add("cx-host", "cx-flow-host");
    host.setAttribute("data-canopyx-mounted", "true");
    host.canopyx = api;
    return api;
  }
  const FLOW_API = { createFlow };
