  // ---------- flows: createFlow and the forms and flow parts (docs/flow.md) ----------
  // The flow entry point and the grid entry points both carry this shell. The steps, fields, review and proposal ship in the
  // flow part (canopyx-flow.js) and the editors and field checks in the forms part (canopyx-forms.js), which grid editing
  // shares (Build/parts.json). createFlow answers at once with the flow's API; its ready promise settles once the parts are in
  // and the first step is painted. Async calls wait for it; synchronous calls require the implementation to be available.
  class FlowHost {}
  const FORMS_IMPL = {}, FLOW_IMPL = {}, activeFlows = new WeakMap();
  const FORMS_PART = definePart(FlowHost, "forms", "forms", () => ({ FORMS_IMPL, h, setText, fill, gridFreeze, gridMomentFromParts, boundedPattern, foldText }));
  const FLOW_PART = definePart(FlowHost, "flow", "flow view", () => ({ FLOW_IMPL, FORMS_IMPL, h, setText, fill, plural, foldText, boundedPattern, numberFormat, gridFreeze }));
  // Grid editing requires the same forms part: one definition, one load, one install.
  if (typeof DataGrid === "function") DataGrid.prototype.parts.forms = FORMS_PART;
  const FLOW_ASYNC_METHODS = ["next", "back", "goTo", "setState", "validate", "submit"];
  const FLOW_SYNC_METHODS = ["getStep", "getValues", "setValues", "getState", "isDirty", "reset", "setFieldError", "setProgress", "complete"];

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
    let impl = null, destroyed = false, mountError = null;
    const destroyedError = () => new Error("CanopyX: this flow has been destroyed.");
    const requireImpl = name => {
      if (destroyed) throw destroyedError();
      if (!impl) throw new Error("CanopyX: flow is not ready; await api.ready before calling " + name + "().");
      return impl;
    };
    // Plugins registered on the page lend their editors; the flow's own editors option wins over them.
    const editors = Object.assign({}, ...[...PLUGINS.values()].map(item => item.editors || {}));
    const ready = loadPart(FLOW_PART).then(() => {
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
      destroyed = true;
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
