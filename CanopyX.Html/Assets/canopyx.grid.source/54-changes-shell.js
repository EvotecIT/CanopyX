  // ---------- change views: createDiff, createChangeList, createPropagation and the lazy changes part (docs/changes.md) ----------
  // The grid entry points carry this shell; the views ship in the changes part (canopyx-changes.js, Build/parts.json) and load when a
  // change view mounts. Each create function answers at once with the view's API; its ready promise settles once the part is in and
  // the view is drawn, and calls made before then wait for it.
  class ChangesHost {}
  const CHANGES_IMPL = {}, activeChangeViews = new WeakMap();
  const CHANGES_PART = definePart(ChangesHost, "changes", "change views", () => ({ CHANGES_IMPL, h, setText, fill, plural, numberFormat, gridFreeze, toneOf, applyTone, svgIcon, PROTOCOL }));
  const CHANGE_VIEW_METHODS = { diff: ["getLayout", "setLayout", "next", "previous", "expandAll", "copy", "getHunks", "update"], changes: ["getState", "setState", "toggle", "focusItem", "update"], propagation: ["update"] };

  /** A create function for one kind of change view: "diff", "changes" (a change list) or "propagation". */
  function changeViewFactory(kind, name) {
    return function (host, options) {
      if (!host || !options || !options.view || typeof options.view !== "object") throw new Error("CanopyX: " + name + " needs a host element and a " + kind + " document.");
      const existing = activeChangeViews.get(host);
      if (existing) return existing;
      const addedClasses = ["cx-host", "cx-change-host"].filter(className => !host.classList.contains(className)), hadClass = host.hasAttribute("class"), previousError = host.getAttribute("data-cx-error");
      let stopTheme;
      let impl = null, destroyed = false, notice = null, errorText = null, failure = null, loaded = false, currentView = options.view;
      const cancelled = () => new DOMException("Change view was destroyed.", "AbortError");
      const clearError = () => {
        notice?.remove(); notice = null;
        if (errorText !== null && host.getAttribute("data-cx-error") === errorText) { if (previousError === null) host.removeAttribute("data-cx-error"); else host.setAttribute("data-cx-error", previousError); }
        errorText = null;
      };
      const showError = error => {
        if (destroyed) return;
        // Invalid updates must retire the preceding view and its Copy/JSON actions, rather than leave stale evidence usable.
        impl?.destroy(); impl = null; failure = error; clearError();
        notice = h("div", "cx-mount-error"); notice.setAttribute("role", "alert");
        setText(notice, error && error.message ? error.message : String(error));
        host.appendChild(notice); errorText = notice.textContent; host.setAttribute("data-cx-error", errorText);
        host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error }, bubbles: true }));
      };
      const mount = view => {
        clearError();
        impl = CHANGES_IMPL[kind](host, { ...options, view }); failure = null;
        return impl.ready;
      };
      const ready = loadPart(CHANGES_PART).then(() => { if (destroyed) throw cancelled(); loaded = true; return mount(currentView); });
      const api = { element: host };
      Object.defineProperty(api, "view", { enumerable: true, get: () => impl ? impl.document() : currentView });
      for (const method of CHANGE_VIEW_METHODS[kind]) api[method] = (...args) => {
        const invoke = () => {
          if (destroyed) throw cancelled();
          if (method === "update") {
            currentView = args[0];
            try { return impl ? impl.update(...args) : mount(currentView); }
            catch (error) { showError(error); throw error; }
          }
          if (failure) throw failure;
          return impl[method](...args);
        };
        if (destroyed) throw cancelled();
        return loaded ? invoke() : ready.then(invoke);
      };
      api.ready = ready.then(() => { if (destroyed) throw cancelled(); return api; });
      api.ready.catch(() => {});
      api.destroy = () => {
        if (destroyed) return;
        destroyed = true; impl?.destroy();
        stopTheme?.();
        if (activeChangeViews.get(host) === api) activeChangeViews.delete(host);
        if (host.canopyx === api) delete host.canopyx;
        host.removeAttribute("data-canopyx-mounted"); clearError();
        for (const className of addedClasses) host.classList.remove(className);
        if (!hadClass && !host.classList.length) host.removeAttribute("class");
      };
      ready.catch(showError);
      if (kind === "propagation") bindTimeSlider(api, options, kind, value => CHANGES_IMPL.validatePropagation(value), showError);
      Object.freeze(api);
      activeChangeViews.set(host, api);
      host.classList.add("cx-host", "cx-change-host"); host.setAttribute("data-canopyx-mounted", "true"); host.canopyx = api;
      stopTheme = watchTheme(host);
      return api;
    };
  }
  const CHANGES_API = { createDiff: changeViewFactory("diff", "createDiff"), createChangeList: changeViewFactory("changes", "createChangeList"), createPropagation: changeViewFactory("propagation", "createPropagation") };
  const CHANGE_VIEW_TYPES = { diff: CHANGES_API.createDiff, changes: CHANGES_API.createChangeList, propagation: CHANGES_API.createPropagation };
