  // ---------- flat-grid entry point ----------
  /** Creates a flat grid. A host source implements query(gridQuery, { signal }) and returns a complete gridPage. */
  function createDataGrid(host, options) {
    if (!host || !options || !options.view) throw new Error("CanopyX: createDataGrid needs a host element and a grid document.");
    const existing = activeGrids.get(host);
    if (existing) return existing;
    const grid = new DataGrid(host, options);
    const api = {
      element: host, view: grid.view, ready: startPlugins(grid, () => api),
      getTimeZone: () => grid.local ? "local" : "utc",
      getSelection: () => [...grid.selected], clearSelection: () => grid.setSelection([]),
      focus: () => grid.setFocus(grid.focused || grid.rowItem(grid.rowAt(grid.logicalTop())), true),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      reload: () => grid.setQuery(gridQueryStart(grid.acceptedQuery || grid.view.query)),
      destroy: () => { grid.destroy(); if (activeGrids.get(host) === api) activeGrids.delete(host); if (host.canopyx === api) delete host.canopyx; }
    };
    for (const name of ["getQuery", "setQuery", "sort", "getPaging", "goToPage", "setPageLength", "firstPage", "previousPage", "nextPage",
      "setColumnWidth", "autoFitColumn", "autoFitColumns", "autoSizeColumns", "setColumnPriority", "resetColumns", "setColumnPinned", "setColumnVisible", "setColumnOrder", "getState", "setState", "resetView", "getSavedViews", "saveView",
      "applySavedView", "removeSavedView", "setTimeZone", "setSelection", "prepareExport", "toCsv", "copy", "exportToHost", "exportAs", "openDetails", "scrollToRow", "retry", "closeMenus"])
      api[name] = grid[name].bind(grid);
    for (const name of GRID_EDIT_API) api[name] = (...args) => grid[name](...args);
    GRID_REPORTING.api?.(api, grid);
    Object.freeze(api);
    activeGrids.set(host, api); host.setAttribute("data-canopyx-mounted", "true"); host.canopyx = api; return api;
  }
