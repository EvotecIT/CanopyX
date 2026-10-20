  // ---------- flows: createFlow and the forms and flow parts (docs/flow.md) ----------
  // The flow entry point and the grid entry points both carry this shell. The steps, fields, review and proposal ship in the
  // flow part (canopyx-flow.js) and the editors and field checks in the forms part (canopyx-forms.js), which grid editing
  // shares (Build/parts.json). createFlow answers at once with the flow's API; its ready promise settles once the parts are in
  // and the first step is painted. Calls made before then wait for it.
  class FlowHost {}
  const FORMS_IMPL = {}, FLOW_IMPL = {}, activeFlows = new WeakMap();
  const FORMS_PART = definePart(FlowHost, "forms", "forms", () => ({ FORMS_IMPL, h, setText, fill, gridFreeze, gridMomentFromParts, boundedPattern, foldText }));
  const FLOW_PART = definePart(FlowHost, "flow", "flow view", () => ({ FLOW_IMPL, FORMS_IMPL, h, setText, fill, plural, foldText, boundedPattern, numberFormat, gridFreeze }));
  // Grid editing requires the same forms part: one definition, one load, one install.
  if (typeof DataGrid === "function") DataGrid.prototype.parts.forms = FORMS_PART;
  const FLOW_METHODS = ["next", "back", "goTo", "getStep", "getValues", "setValues", "getState", "setState", "isDirty", "reset", "validate",
    "setFieldError", "submit", "setProgress", "complete"];

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
    let impl = null, destroyed = false;
    // Plugins registered on the page lend their editors; the flow's own editors option wins over them.
    const editors = Object.assign({}, ...[...PLUGINS.values()].map(item => item.editors || {}));
    const ready = loadPart(FLOW_PART).then(() => {
      if (destroyed) return null;
      impl = FLOW_IMPL.create(host, options, editors);
      return impl.ready;
    });
    const api = { element: host, flow: options.flow, view: options.flow };
    for (const name of FLOW_METHODS) api[name] = (...args) => impl ? impl[name](...args) : ready.then(() => impl ? impl[name](...args) : undefined);
    api.ready = ready.then(() => api);
    // The failure shows in the host and as canopyx:error; a host that never reads ready sees no unhandled rejection.
    api.ready.catch(() => {});
    api.destroy = () => {
      destroyed = true;
      impl?.destroy();
      if (activeFlows.get(host) === api) activeFlows.delete(host);
      if (host.canopyx === api) delete host.canopyx;
    };
    ready.catch(error => {
      if (destroyed) return;
      const notice = h("div", "cx-mount-error");
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
