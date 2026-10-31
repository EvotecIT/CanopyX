  // ---------- flat-grid entry point ----------
  LINK_IMPL.DataGrid = DataGrid; LINK_IMPL.gridQueryStart = gridQueryStart; linkMethods(DataGrid); linkGridPart(DataGrid);
  /** Creates a flat grid. A host source implements query(gridQuery, { signal }) and returns a complete gridPage. */
  function createDataGrid(host, options) {
    if (!host || !options || !options.view) throw new Error("CanopyX: createDataGrid needs a host element and a grid document.");
    if (options.recordDrawerModal !== undefined && typeof options.recordDrawerModal !== "boolean")
      throw new Error("CanopyX: recordDrawerModal must be a Boolean.");
    const existing = activeGrids.get(host);
    if (existing) return existing;
    const grid = new DataGrid(host, options);
    const api = {
      element: host, view: grid.view, ready: startPlugins(grid, () => api),
      getTimeZone: () => grid.local ? "local" : "utc",
      getSelection: () => [...grid.selected], clearSelection: () => grid.setSelection([]),
      // The loaded records among ids, as copies of { id, cells }; a record not loaded now is left out. Never fetches.
      getLoadedRows: ids => {
        const wanted = new Set(Array.isArray(ids) ? ids : []), rows = [];
        for (const row of grid.rowCache.values()) if (wanted.has(row.key)) rows.push({ id: row.key, cells: JSON.parse(JSON.stringify(row.h.cells || {})) });
        return rows;
      },
      focus: () => grid.setFocus(grid.focused || grid.rowItem(grid.rowAt(grid.logicalTop())), true),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      reload: () => grid.setQuery(gridQueryStart(grid.queryForChange(true)), grid.pendingPaging &&
        { pageLength: grid.pendingPaging.pageLength, allRows: grid.pendingPaging.allRows }),
      destroy: () => { grid.destroy(); if (activeGrids.get(host) === api) activeGrids.delete(host); if (host.canopyx === api) delete host.canopyx; }
    };
    for (const name of ["getQuery", "setQuery", "sort", "getPaging", "goToPage", "setPageLength", "firstPage", "previousPage", "nextPage",
      "getOnlyChanges", "setOnlyChanges", "setColumnWidth", "autoFitColumn", "autoFitColumns", "autoSizeColumns", "setColumnPriority", "resetColumns", "setColumnPinned", "setColumnVisible", "setColumnOrder", "getState", "setState", "resetView", "getSavedViews", "saveView",
      "applySavedView", "removeSavedView", "setTimeZone", "setSelection", "prepareExport", "toCsv", "copy", "exportToHost", "exportAs", "print", "openDetails", "openRecord", "scrollToRow", "retry", "closeMenus", "getFormatRules", "setFormatRules", "openFormatRules", "getCalculatedColumns", "setCalculatedColumns", "openCalculatedColumn",
      "getLayout", "setLayout", "getMatches", "setSearchHighlight", "nextMatch", "previousMatch", ...GRID_EDIT_API, ...GRID_LIVE_API, ...GRID_CALENDAR_API, "getLiveState", "getFacetPanel", "setFacetPanelOpen"])
      // Each call looks the method up, so a part installed later (editing, linked views and others) serves the API it replaces.
      api[name] = (...args) => grid[name](...args);
    // Part actions (column groups, cell ranges) answer with a promise, also when the call throws.
    for (const [, read, ...names] of GRID_PART_API) {
      api[read] = (...args) => grid[read](...args);
      for (const name of names) api[name] = (...args) => { try { return Promise.resolve(grid[name](...args)); } catch (error) { return Promise.reject(error); } };
    }
    GRID_REPORTING.api?.(api, grid);
    for (const name of ["getViewIntent", "validateViewIntent", "previewViewIntent", "applyViewIntent"])
      api[name] = (...args) => { try { return Promise.resolve(grid[name](...args)); } catch (error) { return Promise.reject(error); } };
    Object.assign(api, linkApi(grid));
    api.ready = linkReady(grid, api.ready);
    Object.freeze(api);
    activeGrids.set(host, api); host.setAttribute("data-canopyx-mounted", "true"); host.canopyx = api; recordStart(grid); return api;
  }
