  // ---------- the flow entry point's API and automatic mount ----------
  // Fragments carry only the flow document, and the automatic mount runs before host code could call createFlow, so hosts
  // register hooks and callbacks for a flow id with configure, as they do for grids (docs/flow.md#javascript-api).
  const configured = new Map();
  const flowId = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value);

  /** Registers fragment options for a flow id and returns a disposer for this registration. */
  function configure(id, options) {
    if (!flowId(id) || !options || typeof options !== "object") throw new Error("CanopyX: configure needs a flow id and an options object.");
    if ([...document.querySelectorAll("[data-canopyx-mounted]")].some(host => host.canopyx?.view?.id === id))
      throw new Error("CanopyX: flow '" + id + "' is already mounted; configure it before the page has loaded, or mark its fragment data-cx-mount=\"manual\" and call CanopyX.mount.");
    const registration = Object.assign({}, configured.get(id), options, { flow: undefined });
    configured.set(id, registration);
    return () => { if (configured.get(id) === registration) configured.delete(id); };
  }

  /** Removes the options registered for future mounts of a flow. */
  function unconfigure(id) {
    if (!flowId(id)) throw new Error("CanopyX: unconfigure needs a flow id.");
    return configured.delete(id);
  }

  /** Registers a plugin's editors for the flows created from now on (docs/plugins.md); returns a disposer. */
  function use(value) {
    const item = Object.freeze({ ...value });
    if (!value || !partName(item.name) || Object.hasOwn(PARTS, item.name) || item.editors !== undefined && Object(item.editors) !== item.editors ||
        Object.values(item.editors || {}).some(editor => !editor || typeof editor.create !== "function"))
      throw new Error("CanopyX: invalid plugin '" + item.name + "'.");
    if (PLUGINS.has(item.name)) throw new Error("CanopyX: plugin '" + item.name + "' is already registered.");
    PLUGINS.set(item.name, item);
    return () => { if (PLUGINS.get(item.name) === item) PLUGINS.delete(item.name); };
  }

  // Fragments marked data-cx-mount="visible" mount when they come near the viewport, as grids do.
  let watcher = null;
  function mountWhenVisible(host) {
    watcher ||= new IntersectionObserver(entries => entries.forEach(entry => entry.isIntersecting && mount(entry.target)), { rootMargin: Math.ceil(global.innerHeight / 2) + "px 0px" });
    watcher.observe(host);
  }

  /** Mounts every flow fragment under root (or root itself); the automatic mount leaves data-cx-mount="manual" to the host. */
  function mount(root, automatic) {
    const scope = root || document, created = [], selector = "[data-canopyx-host]:not([data-canopyx-mounted])";
    (scope.matches?.(selector) ? [scope] : scope.querySelectorAll(selector)).forEach(host => {
      const config = host.querySelector("script.cx-config"), mode = host.getAttribute("data-cx-mount");
      if (!config || automatic === true && mode === "manual") return;
      if (mode === "visible" && host !== scope && global.IntersectionObserver) return mountWhenVisible(host);
      watcher?.unobserve(host);
      host.setAttribute("data-canopyx-mounted", "true");
      try {
        const flow = JSON.parse(config.textContent);
        if (!flow || flow.kind !== "flow") throw new Error("CanopyX: the flow entry point mounts flow documents only.");
        created.push(createFlow(host, Object.assign({}, configured.get(flow.id), { flow })));
      } catch (error) {
        const notice = h("div", "cx-mount-error");
        notice.setAttribute("role", "alert");
        setText(notice, error.message || String(error));
        host.classList.add("cx-host");
        host.setAttribute("data-cx-error", notice.textContent);
        host.appendChild(notice);
        if (global.console) global.console.error(error);
      }
    });
    return created;
  }

  global.CanopyX = Object.freeze({ createFlow, configure, unconfigure, mount: root => mount(root, false), use, registerPart, setNonce });

  // As the other entry points: wait for DOMContentLoaded unless the page has already been parsed.
  const navigation = global.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
  if (document.readyState === "loading" || (document.readyState === "interactive" && navigation && navigation.domContentLoadedEventStart === 0)) {
    document.addEventListener("DOMContentLoaded", () => mount(document, true));
  } else {
    mount(document, true);
  }
})(typeof window !== "undefined" ? window : this);
