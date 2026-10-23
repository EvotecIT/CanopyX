  // ---------- matrix view: createMatrix and the lazy matrix part (docs/matrix.md) ----------
  // The grid entry points carry this shell; the view itself ships in the matrix part (canopyx-matrix.js, Build/parts.json) and
  // loads when a matrix document mounts. createMatrix answers at once with the matrix's API; its ready promise settles once
  // the part is in and the first window is painted, and calls made before then wait for it.
  class MatrixHost {}
  const MATRIX_IMPL = {}, activeMatrices = new WeakMap();
  const MATRIX_PART = definePart(MatrixHost, "matrix", "matrix view", () => ({ MATRIX_IMPL, h, setText, fill, plural, foldText, numberFormat, gridFreeze, toneOf, applyTone, toneColors, AxisWindow, PROTOCOL }));
  const MATRIX_METHODS = ["sort", "group", "filter", "setSearch", "setAttentionOnly", "getState", "setState", "getVisible", "focusCell", "update"];

  /**
   * Creates a status matrix in a host element from a matrix document (docs/matrix.md).
   * @param {HTMLElement} host The element that receives the matrix.
   * @param {{ view: object, labels?: object, state?: object, onReady?: Function, onCell?: Function, onStateChange?: Function }} options
   */
  function createMatrix(host, options) {
    if (!host || !options || !options.view || typeof options.view !== "object") throw new Error("CanopyX: createMatrix needs a host element and a matrix document.");
    const existing = activeMatrices.get(host);
    if (existing) return existing;
    const addedClasses = ["cx-host", "cx-matrix-host"].filter(name => !host.classList.contains(name)), hadClass = host.hasAttribute("class");
    const previousError = host.getAttribute("data-cx-error");
    let stopTheme;
    let impl = null, destroyed = false, notice = null, errorText = null;
    const cancelled = () => new DOMException("Matrix was destroyed.", "AbortError");
    const ready = loadPart(MATRIX_PART).then(() => {
      if (destroyed) throw cancelled();
      impl = MATRIX_IMPL.create(host, options);
      return impl.ready;
    });
    // view is the document the matrix shows now: update replaces it.
    const api = { element: host };
    Object.defineProperty(api, "view", { enumerable: true, get: () => impl ? impl.document() : options.view });
    for (const name of MATRIX_METHODS) api[name] = (...args) => {
      const invoke = () => { if (destroyed) throw cancelled(); return impl[name](...args); };
      if (destroyed) throw cancelled();
      return impl ? invoke() : ready.then(invoke);
    };
    api.ready = ready.then(() => { if (destroyed) throw cancelled(); return api; });
    api.ready.catch(() => {});
    api.destroy = () => {
      if (destroyed) return;
      destroyed = true;
      impl?.destroy();
      stopTheme?.();
      if (activeMatrices.get(host) === api) activeMatrices.delete(host);
      if (host.canopyx === api) delete host.canopyx;
      host.removeAttribute("data-canopyx-mounted");
      notice?.remove();
      if (errorText !== null && host.getAttribute("data-cx-error") === errorText) {
        if (previousError === null) host.removeAttribute("data-cx-error"); else host.setAttribute("data-cx-error", previousError);
      }
      for (const name of addedClasses) host.classList.remove(name);
      if (!hadClass && !host.classList.length) host.removeAttribute("class");
    };
    ready.catch(error => {
      if (destroyed) return;
      notice = h("div", "cx-mount-error");
      notice.setAttribute("role", "alert");
      setText(notice, error && error.message ? error.message : String(error));
      host.appendChild(notice);
      errorText = notice.textContent; host.setAttribute("data-cx-error", errorText);
      host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error }, bubbles: true }));
    });
    Object.freeze(api);
    activeMatrices.set(host, api);
    host.classList.add("cx-host", "cx-matrix-host");
    stopTheme = watchTheme(host);
    host.setAttribute("data-canopyx-mounted", "true");
    host.canopyx = api;
    return api;
  }
  const MATRIX_API = { createMatrix };
