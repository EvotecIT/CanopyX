
  // ---------- public API and auto-mount ----------
  /**
   * Creates a tree grid in a host element.
   * @param {HTMLElement} host The element that receives the grid.
   * @param {{ view: object, source?: object, labels?: Object<string, string>, renderers?: Object<string, Function>, renderDetail?: Function,
   *           onSelect?: Function, onToggle?: Function, onLoad?: Function, isSelectable?: Function, beforeSelect?: Function,
   *           formatLink?: Function, parseLink?: Function, requestTimeoutMs?: number, retainedNodeLimit?: number, inactiveNodeLimit?: number }} options
   *   `view` is a canopyx/2 view document. `labels` translates the texts the grid writes itself, on top of the view's
   *   own `labels` (names and placeholders as in docs/data-protocol.md). Callbacks are optional; the same events are also dispatched on the host
   *   as canopyx:select, canopyx:toggle, canopyx:load, canopyx:error, and canopyx:ready. canopyx:filter reports
   *   the ids of the active declared filters whenever they change.
   *   isSelectable(node) returning false prevents adding that node; it remains focusable. beforeSelect(node, nodes,
   *   { previous, reason }) is a synchronous veto: false rejects the entire proposal. The cancelable
   *   canopyx:beforeselect event offers the same veto. Clearing selection notifies onSelect with node null and nodes [].
   *   A queryAware source receives { signal, query, revision } with each request and returns revision on pages,
   *   search results, and counts. setQuery, sort, and declared-filter methods return promises on that source.
   *   A new query stages its roots before replacing accepted rows; canopyx:query reports { query, revision }.
   *   renderers maps a column id to a function (node, element, context) that returns true when it drew the cell
   *   itself; context is { column, level, expanded, index }, where index is the column's position in view.columns.
   *   Columns without a renderer are painted by the runtime and reuse their cells while scrolling, and so do the rows
   *   where a renderer returns false without adding children or attributes to the element it was given (then that
   *   element is dropped, with any listener put on it: put listeners on content the renderer adds, or on the grid).
   *   renderDetail(node, element) returns true when it drew the detail row;
   *   element is the body of the row, which stays inside the visible width of the grid.
   *   With deepLink on the view, formatLink(path, node) returns the URL fragment for a selected row (without "#";
   *   null leaves the URL alone; with nothing selected path is empty and node null) and parseLink(fragment) returns
   *   the id path it names, a promise of it, or null. The two are given together. The grid follows hashchange and
   *   popstate; a host that writes the address itself with history.replaceState or pushState calls readLocation().
   */
  function createTreeGrid(host, options) {
    if (!host || !options || !options.view) {
      throw new Error("CanopyX: createTreeGrid needs a host element and a view document.");
    }
    const existing = activeGrids.get(host);
    if (existing) return existing;
    const grid = new TreeGrid(host, options);
    const api = Object.freeze(Object.assign({
      element: host,
      view: grid.view,
      ready: grid.ready,
      expandPath: (ids, o) => grid.expandPath(ids, o),
      // A host predicate replaces the declared filters, so their switches and getActiveFilters stay truthful.
      setFilter: (filter, o) => { if (!grid.queryAware) grid.clearDeclaredFilters(); grid.setFilter(filter, o); },
      setFilterActive: (id, active) => grid.setFilterActive(id, active),
      setActiveFilters: (ids) => grid.setActiveFilters(ids),
      updateActiveFilters: (change) => grid.updateActiveFilters(change),
      getActiveFilters: () => Array.from(grid.activeFilters),
      sort: (columnId, direction) => grid.sort(columnId, direction),
      getQuery: () => grid.getQuery(),
      setQuery: (query, options) => grid.setQuery(query, options),
      setColumnVisible: (columnId, visible) => grid.setColumnVisible(columnId, visible),
      setColumnWidth: (columnId, width) => grid.setColumnWidth(columnId, width),
      setTreeColumnPinned: (pinned) => grid.setTreeColumnPinned(pinned),
      setTimeZone: (zone) => grid.setTimeZone(zone),
      getTimeZone: () => (grid.local ? "local" : "utc"),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      reload: (id, options) => grid.reload(id, options),
      // For a host that changed the address itself (history.replaceState or pushState fire no event).
      readLocation: () => grid.readLocation(),
      getSelected: () => Array.from(grid.selected).map((w) => w.h),
      setSelection: (ids) => grid.setSelection(ids),
      clearSelection: () => grid.setSelection([]),
      selectAll: (options) => grid.selectAll(options),
      focus: () => {
        if (grid.destroyed) return;
        const target = grid.indexOf(grid.focused) >= 0 ? grid.focused : grid.rows[0];
        if (target) grid.setFocus(target, true);
        else grid.grid.focus({ preventScroll: true });
      },
      visibleRows: () => grid.visibleRows(),
      toOutline: () => grid.toOutline(),
      getState: () => grid.getState(),
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
    }, grid.interactionApi && grid.interactionApi()));
    activeGrids.set(host, api);
    host.setAttribute("data-canopyx-mounted", "true");
    host.canopyx = api;
    return api;
  }

  // Options a host registers for a view before its fragment is mounted. A fragment carries only the view document,
  // and the automatic mount runs before host code could call createTreeGrid, so this is how renderers, callbacks,
  // link hooks, or a data source reach a fragment.
  const configured = new Map();

  /** Registers fragment options and returns a disposer for this registration; a later call replaces the options it names. */
  function configure(viewId, options) {
    requireIdentifier(viewId, "view ID");
    if (!options || typeof options !== "object") {
      throw new Error("CanopyX: configure needs a view id and an options object.");
    }
    if (Array.from(document.querySelectorAll("[data-canopyx-mounted]")).some((host) => host.canopyx && host.canopyx.view.id === viewId)) {
      throw new Error("CanopyX: view '" + viewId + "' is already mounted; configure it before the page has loaded, or mark its fragment data-cx-mount=\"manual\" and call CanopyX.mount.");
    }
    const registration = Object.assign({}, configured.get(viewId), options, { view: undefined });
    configured.set(viewId, registration);
    return () => {
      if (configured.get(viewId) === registration) configured.delete(viewId);
    };
  }

  /** Removes the options registered for future mounts of a view, leaving any current grid intact. */
  function unconfigure(viewId) {
    requireIdentifier(viewId, "view ID");
    return configured.delete(viewId);
  }

  /**
   * Mounts every [data-canopyx-host] element under root that has a JSON configuration script. The automatic mount
   * when the page has loaded leaves fragments marked data-cx-mount="manual" to a later call by the host.
   */
  function mount(root, automatic) {
    const scope = root || document;
    const created = [];
    const showError = (host, err, api, view) => {
      if (api) {
        api.destroy();
        if (host.canopyx === api) delete host.canopyx;
      }
      const message = err && err.message ? err.message : String(err);
      // In the view's language when its labels could be read; the labels themselves may be what is wrong.
      let labels = DEFAULT_LABELS;
      for (const attempt of [() => labelsFor(view && view.labels, view && configured.has(view.id) ? configured.get(view.id).labels : null), () => labelsFor(view && view.labels)]) {
        try { labels = attempt(); break; } catch (e) { labels = DEFAULT_LABELS; }
      }
      const notice = document.createElement("div");
      notice.className = "cx-mount-error";
      notice.setAttribute("role", "alert");
      setText(notice, fill(labels.mountError, { error: message }));
      host.classList.add("cx-host");
      host.setAttribute("data-canopyx-mounted", "true");
      host.setAttribute("data-cx-error", message);
      host.appendChild(notice);
      if (global.console) global.console.error(err);
    };
    scope.querySelectorAll("[data-canopyx-host]:not([data-canopyx-mounted])").forEach((host) => {
      const config = host.querySelector("script.cx-config");
      if (!config || (automatic === true && host.getAttribute("data-cx-mount") === "manual")) {
        return;
      }
      host.setAttribute("data-canopyx-mounted", "true");
      let view = null;
      try {
        view = JSON.parse(config.textContent);
        const create = view && view.type === "grid" && typeof createDataGrid === "function" ? createDataGrid : createTreeGrid;
        const api = create(host, Object.assign({}, view && configured.get(view.id), { view: view }));
        created.push(api);
        api.ready.catch((err) => {
          // Grid query failures keep their retryable loading/error surface and accepted snapshot.
          if (view.type !== "grid" && activeGrids.get(host) === api && host.canopyx === api) showError(host, err, api, view);
        });
      } catch (err) {
        showError(host, err, null, view);
      }
    });
    return created;
  }

  global.CanopyX = Object.freeze(Object.assign({
    protocol: PROTOCOL,
    createTreeGrid: createTreeGrid,
    configure: configure,
    unconfigure: unconfigure,
    mount: (root) => mount(root, false),
    sources: Object.freeze({ inline: inlineSource, sidecar: sidecarSource, remote: remoteSource }),
    // A badge ({ text, tone?, title? }) drawn as the grid draws one, for cells and details a host renderer draws.
    badge: hostBadge,
    // The English texts and their names, for a host that builds its translations from them.
    labels: DEFAULT_LABELS
  }, typeof createDataGrid === "function" ? { createDataGrid: createDataGrid } : {}));

  // Fragments are mounted once the document is parsed. A deferred runtime script runs just before that moment, and
  // the host's own deferred scripts, which may call configure, run after it: so wait for DOMContentLoaded whenever it
  // has not been dispatched yet, and mount at once only when the runtime is added to a page that is already loaded.
  const navigation = global.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
  if (document.readyState === "loading" || (document.readyState === "interactive" && navigation && navigation.domContentLoadedEventStart === 0)) {
    document.addEventListener("DOMContentLoaded", () => mount(document, true));
  } else {
    mount(document, true);
  }
})(typeof window !== "undefined" ? window : this);
