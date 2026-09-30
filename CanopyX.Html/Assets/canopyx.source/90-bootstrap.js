
  // ---------- public API and auto-mount ----------
  /**
   * Creates a tree grid in a host element.
   * @param {HTMLElement} host The element that receives the grid.
   * @param {{ view: object, source?: object, renderers?: Object<string, Function>, renderDetail?: Function,
   *           onSelect?: Function, onToggle?: Function, onLoad?: Function }} options
   *   `view` is a canopyx/1 view document. Callbacks are optional; the same events are also dispatched on the host
   *   as canopyx:select, canopyx:toggle, canopyx:load, canopyx:error, and canopyx:ready.
   *   renderers maps a column id to a function (node, element, context) that returns true when it drew the cell
   *   itself; context is { column, level, expanded, index }, where index is the column's position in view.columns.
   *   Columns without a renderer are painted by the runtime and reuse their cells while scrolling.
   *   renderDetail(node, element) returns true when it drew the detail row;
   *   element is the body of the row, which stays inside the visible width of the grid.
   */
  function createTreeGrid(host, options) {
    if (!host || !options || !options.view) {
      throw new Error("CanopyX: createTreeGrid needs a host element and a view document.");
    }
    const existing = activeGrids.get(host);
    if (existing) return existing;
    const grid = new TreeGrid(host, options);
    const api = Object.freeze({
      element: host,
      view: grid.view,
      ready: grid.ready,
      expandPath: (ids, o) => grid.expandPath(ids, o),
      setFilter: (filter, o) => grid.setFilter(filter, o),
      setFilterActive: (id, active) => grid.setFilterActive(id, active),
      sort: (columnId, direction) => grid.sort(columnId, direction),
      setColumnVisible: (columnId, visible) => grid.setColumnVisible(columnId, visible),
      setTimeZone: (zone) => grid.setTimeZone(zone),
      getTimeZone: () => (grid.local ? "local" : "utc"),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      getSelected: () => Array.from(grid.selected).map((w) => w.h),
      focus: () => {
        if (grid.destroyed) return;
        const target = grid.indexOf(grid.focused) >= 0 ? grid.focused : grid.rows[0];
        if (target) grid.setFocus(target, true);
        else grid.grid.focus({ preventScroll: true });
      },
      visibleRows: () => grid.visibleRows(),
      toOutline: () => grid.toOutline(),
      getState: () => ({ expanded: grid.getExpandedPaths() }),
      setState: (state) => grid.setState(state),
      search: (query, limit) => grid.search(query, limit || (grid.view.search && grid.view.search.maxResults) || 20),
      loadMore: (id) => {
        const w = id == null ? grid.root : grid.keyMap.get(id);
        return w ? grid.loadMore(w) : Promise.resolve();
      },
      applyCounts: (doc) => grid.applyCounts(doc),
      refreshCounts: (ids) => grid.refreshCounts(ids),
      destroy: () => {
        grid.destroy();
        if (activeGrids.get(host) === api) activeGrids.delete(host);
        if (host.canopyx === api) delete host.canopyx;
      }
    });
    activeGrids.set(host, api);
    host.setAttribute("data-canopyx-mounted", "true");
    host.canopyx = api;
    return api;
  }

  /** Mounts every [data-canopyx-host] element under root that has a JSON configuration script. */
  function mount(root) {
    const scope = root || document;
    const created = [];
    const showError = (host, err, api) => {
      if (api) {
        api.destroy();
        if (host.canopyx === api) delete host.canopyx;
      }
      const message = err && err.message ? err.message : String(err);
      const notice = document.createElement("div");
      notice.className = "cx-mount-error";
      notice.setAttribute("role", "alert");
      setText(notice, "This view could not be displayed: " + message);
      host.classList.add("cx-host");
      host.setAttribute("data-canopyx-mounted", "true");
      host.setAttribute("data-cx-error", message);
      host.appendChild(notice);
      if (global.console) global.console.error(err);
    };
    scope.querySelectorAll("[data-canopyx-host]:not([data-canopyx-mounted])").forEach((host) => {
      const config = host.querySelector("script.cx-config");
      if (!config) {
        return;
      }
      host.setAttribute("data-canopyx-mounted", "true");
      try {
        const api = createTreeGrid(host, { view: JSON.parse(config.textContent) });
        created.push(api);
        api.ready.catch((err) => {
          if (activeGrids.get(host) === api && host.canopyx === api) showError(host, err, api);
        });
      } catch (err) {
        showError(host, err);
      }
    });
    return created;
  }

  global.CanopyX = Object.freeze({
    protocol: PROTOCOL,
    createTreeGrid: createTreeGrid,
    mount: mount,
    sources: Object.freeze({ inline: inlineSource, sidecar: sidecarSource, remote: remoteSource })
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(document));
  } else {
    mount(document);
  }
})(typeof window !== "undefined" ? window : this);
