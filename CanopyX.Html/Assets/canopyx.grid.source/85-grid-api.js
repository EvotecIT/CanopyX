  // ---------- flat-grid entry point ----------
  /** Creates a flat grid. A host source implements query(gridQuery, { signal }) and returns a complete gridPage. */
  function createDataGrid(host, options) {
    if (!host || !options || !options.view) throw new Error("CanopyX: createDataGrid needs a host element and a grid document.");
    const existing = activeGrids.get(host);
    if (existing) return existing;
    const grid = new DataGrid(host, options);
    const api = Object.freeze({
      element: host, view: grid.view, ready: grid.ready,
      getQuery: () => grid.getQuery(), setQuery: query => grid.setQuery(query), sort: sorts => grid.sort(sorts),
      setColumnWidth: (id, width) => grid.setColumnWidth(id, width), setColumnVisible: (id, visible) => grid.setColumnVisible(id, visible),
      setColumnOrder: ids => grid.setColumnOrder(ids),
      getState: () => grid.getState(), setState: state => grid.setState(state), resetView: () => grid.resetView(),
      getSavedViews: () => grid.getSavedViews(), saveView: name => grid.saveView(name),
      applySavedView: name => grid.applySavedView(name), removeSavedView: name => grid.removeSavedView(name),
      setTimeZone: zone => grid.setTimeZone(zone), getTimeZone: () => grid.local ? "local" : "utc",
      getSelection: () => [...grid.selected], setSelection: ids => grid.setSelection(ids), clearSelection: () => grid.setSelection([]),
      focus: () => grid.setFocus(grid.focused || grid.rowItem(grid.rowAt(grid.logicalTop())), true),
      retry: () => grid.retry(), refresh: () => { grid.version++; grid.scheduleRender(); },
      destroy: () => { grid.destroy(); if (activeGrids.get(host) === api) activeGrids.delete(host); if (host.canopyx === api) delete host.canopyx; }
    });
    activeGrids.set(host, api); host.setAttribute("data-canopyx-mounted", "true"); host.canopyx = api; return api;
  }
