  // ---------- flat-grid state: accepted queries and bounded session views ----------
  function gridStateColumns(grid, input) {
    if (!Array.isArray(input)) throw new Error("CanopyX: state columns must be an array.");
    const seen = new Set(), declared = new Map(grid.columns.map(column => [column.id, column]));
    const columns = input.map(column => {
      requireIdentifier(column && column.id, "state column ID");
      if (seen.has(column.id) || !Number.isFinite(column.width) || column.width < 40 || column.width > MAX_COLUMN_WIDTH || typeof column.hidden !== "boolean")
        throw new Error("CanopyX: invalid state column.");
      seen.add(column.id); return { id: column.id, width: column.width, hidden: column.hidden };
    }).filter(column => declared.has(column.id));
    for (const column of grid.columns) if (!seen.has(column.id)) columns.push({ id: column.id, width: column.width, hidden: !!column.hidden });
    if (!columns.some(column => !column.hidden)) throw new Error("CanopyX: keep at least one column visible.");
    return columns;
  }

  Object.assign(DataGrid.prototype, {
    prepareState() {
      this.storageKey = this.view.stateKey ? "cx:grid:" + this.view.stateKey + ":" + this.view.id : null;
      this.savedViews = new Map();
      this.defaultState = { version: 1, view: this.view.id,
        columns: this.columns.map(column => ({ id: column.id, width: column.width, hidden: !!column.hidden })),
        query: gridQuery(this.view, Object.assign({}, this.view.query || {}, { offset: 0, revision: undefined })),
        timeZone: this.local ? "local" : "utc", selection: [], scrollTop: 0 };
      const stored = this.readStoredState();
      if (stored && Array.isArray(stored.views)) {
        for (const entry of stored.views.slice(0, 20)) {
          try { this.savedViews.set(this.viewName(entry.name), this.readGridState(entry.state)); } catch (_) { /* Removed or invalid saved views are skipped. */ }
        }
      }
      try { this.initialState = stored && stored.current ? this.readGridState(stored.current) : null; } catch (_) { this.initialState = null; }
    },

    initializeState() { return this.initialState ? this.setState(this.initialState) : this.setQuery(this.view.query || {}); },
    getState() {
      const query = this.getQuery() || this.defaultState.query;
      return { version: 1, view: this.view.id,
        columns: this.columns.map(column => ({ id: column.id, width: column.width, hidden: !!column.hidden })),
        query: JSON.parse(JSON.stringify(Object.assign({}, query, { offset: 0, revision: undefined }))),
        timeZone: this.local ? "local" : "utc", selection: [...this.selected], scrollTop: this.grid ? this.logicalTop() : 0 };
    },

    readGridState(state) {
      if (!state || state.version !== 1 || state.view !== this.view.id || !["utc", "local"].includes(state.timeZone) ||
          !Number.isFinite(state.scrollTop) || state.scrollTop < 0 || state.scrollTop > MAX_PROTOCOL_INTEGER || !Array.isArray(state.selection))
        throw new Error("CanopyX: invalid or incompatible grid state.");
      const columns = gridStateColumns(this, state.columns);
      const selection = [...new Set(state.selection.map(id => { requireIdentifier(id, "state selection ID"); return id; }))];
      if (this.view.selection === "none" && selection.length || !this.multi && selection.length > 1) throw new Error("CanopyX: invalid state selection.");
      const input = state.query;
      if (!input || typeof input !== "object" || !Array.isArray(input.sort) || !Array.isArray(input.filters)) throw new Error("CanopyX: invalid state query.");
      const known = id => this.columns.some(column => column.id === id);
      const query = gridQuery(this.view, Object.assign({}, input, { offset: 0, revision: undefined,
        sort: input.sort.filter(sort => sort && known(sort.column)), filters: input.filters.filter(filter => filter && known(filter.column)) }));
      return { version: 1, view: this.view.id, columns: columns, query: query,
        timeZone: state.timeZone, selection: selection, scrollTop: state.scrollTop };
    },

    async setState(input) {
      const state = this.readGridState(input);
      clearTimeout(this.searchTimer);
      const pending = this.setQuery(state.query), epoch = this.queryEpoch;
      this.restoringEpoch = epoch;
      try {
        await pending;
        if (this.destroyed || epoch !== this.queryEpoch) throw new DOMException("Grid state was superseded.", "AbortError");
        if (this.cancelResize) this.cancelResize();
        const current = new Map(this.columns.map(column => [column.id, column]));
        this.columns = state.columns.map(saved => Object.assign(current.get(saved.id), { width: saved.width, hidden: saved.hidden }));
        this.setTimeZone(state.timeZone); this.setSelection(state.selection);
        this.buildHeader(); this.syncColumnControls(); this.setLogicalTop(state.scrollTop); this.render();
        return this.getQuery();
      } finally {
        if (this.restoringEpoch === epoch) { this.restoringEpoch = null; this.stateChanged(); }
      }
    },

    setColumnOrder(ids) {
      if (!Array.isArray(ids) || ids.length !== this.columns.length || new Set(ids).size !== ids.length ||
          ids.some(id => !this.columns.some(column => column.id === id))) throw new Error("CanopyX: column order must name every declared column exactly once.");
      if (this.cancelResize) this.cancelResize();
      const columns = new Map(this.columns.map(column => [column.id, column]));
      this.columns = ids.map(id => columns.get(id)); this.buildHeader(); this.syncColumnControls(); this.scheduleRender(); this.stateChanged();
    },

    viewName(name) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("CanopyX: a saved view needs a name of 1 to 100 characters.");
      return name.trim();
    },
    getSavedViews() { return [...this.savedViews.keys()]; },
    saveView(name) {
      name = this.viewName(name);
      if (!this.getQuery()) throw new Error("CanopyX: wait for an accepted query before saving a view.");
      if (!this.savedViews.has(name) && this.savedViews.size >= 20) throw new Error("CanopyX: at most 20 saved views are supported.");
      this.savedViews.set(name, this.getState()); this.writeStoredState(this.getState()); this.syncSavedViews();
      if (this.savedChoice) this.savedChoice.value = name;
    },
    applySavedView(name) {
      const state = this.savedViews.get(this.viewName(name));
      if (!state) throw new Error("CanopyX: the saved view does not exist.");
      return this.setState(state);
    },
    removeSavedView(name) { this.savedViews.delete(this.viewName(name)); this.writeStoredState(this.getState()); this.syncSavedViews(); },
    resetView() { return this.setState(this.defaultState); },
    readStoredState() {
      if (!this.storageKey) return null;
      try { return JSON.parse(global.sessionStorage.getItem(this.storageKey)); } catch (_) { return null; }
    },
    writeStoredState(state) {
      if (!this.storageKey || this.destroyed) return;
      try { global.sessionStorage.setItem(this.storageKey, JSON.stringify({ current: state, views: [...this.savedViews].map(([name, value]) => ({ name: name, state: value })) })); }
      catch (_) { /* A disabled or full storage leaves the current session usable. */ }
    }
  });
