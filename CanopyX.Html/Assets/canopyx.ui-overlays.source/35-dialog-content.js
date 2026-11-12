  // The body of a dialog or drawer: host content, or a loader(signal) with a busy state and an error with Retry, like tab panels.
  UI_TOOLS.dialogBody = (root, kind, options, labels, signal) => {
    const body = root.querySelector('[data-cx-part="body"]');
    let loader = options.loader, loaded = false, pending = null;
    const settle = () => { pending = null; root.removeAttribute("aria-busy"); };
    const abort = () => { if (pending) { pending.abort(); settle(); } };
    signal?.addEventListener("abort", abort, { once: true });
    const set = value => { abort(); loaded = false; if (body && value != null) UI_TOOLS.content(body, value); };
    async function load() {
      if (!loader || !body || signal?.aborted) return false;
      abort();
      const current = pending = new AbortController();
      const status = h("div", "cx-overlay-loading"), bars = h("div", "cx-overlay-skeleton");
      status.setAttribute("role", "status"); setText(status, labels.stateLoading);
      bars.setAttribute("aria-hidden", "true"); bars.append(h("span"), h("span"), h("span"));
      root.setAttribute("aria-busy", "true"); root.dataset.load = "loading"; body.replaceChildren(status, bars);
      try {
        const value = await loader(current.signal);
        if (current !== pending) return false;
        body.replaceChildren(); if (value != null) UI_TOOLS.content(body, value);
        loaded = true; root.dataset.load = "loaded";
        UI_TOOLS.emit(root, kind, "load", { body });
        return true;
      } catch (error) {
        if (current !== pending) return false;
        const message = h("div", "cx-overlay-error"), retry = h("button", "cx-overlay-retry");
        message.setAttribute("role", "alert"); setText(message, error?.message || labels.stateDetails);
        retry.type = "button"; setText(retry, labels.stateRetry); retry.addEventListener("click", () => load());
        root.dataset.load = "error"; body.replaceChildren(message, retry);
        UI_TOOLS.emit(root, kind, "error", { error });
        return false;
      } finally {
        if (current === pending) settle();
      }
    }
    // New content replaces the body; a new loader runs; the factory's loader runs until it has loaded once.
    const show = settings => {
      if (settings.content !== undefined) set(settings.content);
      else if (settings.loader) { loader = settings.loader; load(); }
      else if (loader && !loaded && !pending) load();
    };
    return { set, load, show, abort, get loading() { return !!pending; } };
  };

  // Previous and Next record buttons with an "n of N" position, shown when the host navigates records with options.records.
  UI_TOOLS.recordSteps = (root, options, labels, signal) => {
    const header = root.querySelector('[data-cx-part="header"]'), group = h("div", "cx-overlay-records"), position = h("span", "cx-overlay-position");
    let at = null;
    const step = direction => { if (!at || (direction < 0 ? at.current > 1 : at.current < at.total)) options.records(direction); };
    const button = (label, direction) => {
      const element = h("button", "cx-overlay-step"); element.type = "button"; element.dataset.direction = direction < 0 ? "previous" : "next";
      element.setAttribute("aria-label", label); element.addEventListener("click", () => step(direction)); return element;
    };
    const previous = button(labels.drawerPrevious, -1), next = button(labels.drawerNext, 1);
    group.dataset.cxPart = "records"; position.hidden = true; position.setAttribute("aria-live", "polite");
    group.append(previous, position, next);
    header?.insertBefore(group, header.querySelector(".cx-overlay-close"));
    signal?.addEventListener("abort", () => group.remove(), { once: true });
    return { step, position(value) {
      at = value; setText(position, fill(labels.tabsPosition, value)); position.hidden = false;
      previous.setAttribute("aria-disabled", String(value.current <= 1)); next.setAttribute("aria-disabled", String(value.current >= value.total));
    } };
  };

  // An overlay with an address: opening pushes it (or replaces it with push: false), Back closes the overlay, Forward reopens
  // it, and a page opened on the address opens it. A history entry the overlay added is marked in history.state.
  UI_TOOLS.overlayHistory = (root, kind, options, signal, reopen, isOpen, close) => {
    const key = root.id || "cx-" + kind, page = global.history;
    let entry = null, listening = false;
    const resolve = url => new URL(url, location.href).href;
    const marked = state => state?.cxOverlay === key;
    const own = () => Object.assign({}, page.state && typeof page.state === "object" ? page.state : null, { cxOverlay: key });
    const plain = () => { const state = Object.assign({}, page.state); delete state.cxOverlay; return state; };
    const listen = () => listening || (listening = true, global.addEventListener("popstate", event => {
      if (marked(event.state)) { if (!isOpen()) { entry = { pushed: true }; reopen(); } }
      else if (entry && isOpen()) { entry = null; close(); }
    }, { signal }));
    return {
      landed: () => !!options.history && resolve(options.history.url) === location.href,
      opened(config) {
        if (!config) return;
        const url = resolve(config.url); listen();
        if (entry) { if (url !== location.href || !marked(page.state)) page.replaceState(own(), "", url); return; }
        if (url === location.href && config.base != null) {
          // Landing on the address: the entry below becomes the page without the overlay, so Back closes it.
          page.replaceState(plain(), "", resolve(config.base)); page.pushState({ cxOverlay: key }, "", url); entry = { pushed: true };
        } else if (url === location.href || config.push === false) {
          entry = { before: url === location.href ? null : location.href }; page.replaceState(own(), "", url);
        } else { page.pushState({ cxOverlay: key }, "", url); entry = { pushed: true }; }
      },
      closed(reason) {
        const current = entry; entry = null;
        if (!current || !marked(page.state) || /^(history|destroy|hidden)$/.test(reason)) return;
        if (current.pushed) page.back();
        else page.replaceState(plain(), "", current.before || location.href);
      }
    };
  };
