  // ---------- flat-grid state: accepted queries and bounded session views ----------
  function gridStateColumn(column) { return { id: column.id, width: column.width, hidden: !!column.hidden }; }
  function gridStateColumns(grid, input) {
    if (!Array.isArray(input)) throw new Error("CanopyX: invalid columns.");
    const seen = new Set(), declared = new Map(grid.columns.map(column => [column.id, column]));
    const columns = input.map(column => readStateColumn(column, seen)).filter(column => declared.has(column.id));
    for (const column of columns) column.width = columnWidth(declared.get(column.id), column.width);
    for (const column of grid.columns) if (!seen.has(column.id)) columns.push(gridStateColumn(column));
    if (!columns.some(column => !column.hidden)) throw new Error("CanopyX: keep at least one column visible.");
    return columns;
  }

  Object.assign(DataGrid.prototype, {
    prepareState() {
      this.storageKey = this.view.stateKey ? "cx:grid:" + this.view.stateKey + ":" + this.view.id : null;
      this.savedViews = new Map();
      this.defaultState = { version: 1, view: this.view.id,
        columns: this.columns.map(gridStateColumn),
        query: gridQuery(this.view, gridQueryStart(this.view.query)),
        timeZone: this.local ? "local" : "utc", selection: [], scrollTop: 0 };
      if (this.paged) this.defaultState.paging = { pageLength: this.pageLength, offset: 0 };
      const stored = this.readStoredState();
      if (stored && Array.isArray(stored.views)) {
        for (const entry of stored.views.slice(0, 20)) {
          try { this.savedViews.set(this.viewName(entry.name), this.readGridState(entry.state)); } catch (_) { /* Removed or invalid saved views are skipped. */ }
        }
      }
      try { this.initialState = stored && stored.current ? this.readGridState(stored.current) : null; } catch (_) { this.initialState = null; }
    },

    // A grid with conditional formatting is ready once its formatting part is too (52-grid-formatting.js).
    initializeState() {
      const ready = this.initialState ? this.setState(this.initialState) : this.setQuery(this.view.query || {});
      return this.view.formatRules || this.view.formatting ? Promise.all([ready, this.loadFormatting().catch(error => this.emit("error", { error }))]).then(([result]) => result) : ready;
    },
    getState() {
      const query = this.getQuery() || this.defaultState.query;
      const state = { version: 1, view: this.view.id,
        columns: this.columns.map(gridStateColumn),
        query: JSON.parse(JSON.stringify({ ...query, offset: this.cursor ? undefined : 0, cursor: undefined, revision: undefined })),
        timeZone: this.local ? "local" : "utc", selection: [...this.selected], scrollTop: this.grid ? this.logicalTop() : 0 };
      if (this.paged) state.paging = { pageLength: this.pageLength, offset: this.cursor ? 0 : this.pageOffset, ...this.pageAll?{allRows:true}:{} };
      // Rules edited at run time (52-grid-formatting.js) are part of the view a reader saves.
      if (this.formatEdited) state.formatRules = JSON.parse(JSON.stringify(this.formatRules));
      return state;
    },

    readGridState(state) {
      if (!state || state.version !== 1 || state.view !== this.view.id || !["utc", "local"].includes(state.timeZone) ||
          !Number.isFinite(state.scrollTop) || state.scrollTop < 0 || state.scrollTop > MAX_PROTOCOL_INTEGER * this.rowH || !Array.isArray(state.selection))
        throw new Error("CanopyX: invalid grid state.");
      const columns = gridStateColumns(this, state.columns);
      const selection = [...new Set(state.selection.map(id => { requireIdentifier(id, "state selection ID"); return id; }))];
      if (this.view.selection === "none" && selection.length || !this.multi && selection.length > 1) throw new Error("CanopyX: invalid state selection.");
      const input = state.query;
      if (!input || typeof input !== "object" || !Array.isArray(input.sort) || !Array.isArray(input.filters)) throw new Error("CanopyX: invalid state query.");
      const known = id => this.columns.some(column => column.id === id);
      const query = gridQuery(this.view, gridQueryStart(input, {
        sort: input.sort.filter(sort => sort && known(sort.column)), filters: input.filters.filter(filter => filter && known(filter.column)) }), true);
      const parsed = { version: 1, view: this.view.id, columns, query,
        timeZone: state.timeZone, selection, scrollTop: state.scrollTop, formatRules: state.formatRules };
      if (this.paged || state.paging) {
        const paging = state.paging || this.defaultState.paging;
        if (!paging || !Number.isInteger(paging.pageLength) || paging.pageLength < 1 || paging.pageLength > Math.max(10000,this.view.source.kind==="inline"?this.view.rows.length:0) || paging.allRows!==undefined&&(typeof paging.allRows!=="boolean"||paging.allRows&&this.view.source.kind!=="inline") ||
            !Number.isInteger(paging.offset) || paging.offset < 0 || paging.offset > MAX_PROTOCOL_INTEGER || this.cursor && paging.offset !== 0)
          throw new Error("CanopyX: invalid paged view state.");
        if (this.paged) {
          parsed.paging = { pageLength: paging.pageLength, offset: paging.offset, ...paging.allRows?{allRows:true}:{} };
          if (!state.paging) parsed.scrollTop = 0;
        } else parsed.scrollTop = Math.min(MAX_PROTOCOL_INTEGER * this.rowH, paging.offset * this.rowH + state.scrollTop);
      }
      return parsed;
    },

    async setState(input) {
      const state = this.readGridState(input);
      clearTimeout(this.searchTimer); this.searchTimer = null;
      const pending = this.setQuery({ ...state.query, offset: state.paging ? state.paging.offset : 0 }, state.paging), epoch = this.queryEpoch;
      this.restoringEpoch = epoch;
      try {
        await pending;
        if (this.destroyed || epoch !== this.queryEpoch) throw new DOMException("Grid state was superseded.", "AbortError");
        this.applyStatePresentation(state);
        return this.getQuery();
      } finally {
        if (this.restoringEpoch === epoch) { this.restoringEpoch = null; this.stateChanged(); }
      }
    },

    applyStatePresentation(state) {
      if (this.cancelResize) this.cancelResize();
      const current = new Map(this.columns.map(column => [column.id, column]));
      this.columns = state.columns.map(saved => {
        const column = current.get(saved.id);
        return Object.assign(column, { sized: false, priority: column.basePriority }, saved);
      });
      this.setTimeZone(state.timeZone); this.setSelection(state.selection);
      this.buildHeader(); this.syncColumnControls(); this.setLogicalTop(state.scrollTop); this.render();
      // Formatting rules travel untouched through readGridState; the formatting part validates them here.
      if (state.formatRules || this.formatEdited) this.setFormatRules(state.formatRules || this.view.formatRules || []).catch(error => this.emit("error", { error }));
    },

    setColumnOrder(ids) {
      if (!Array.isArray(ids) || ids.length !== this.columns.length || new Set(ids).size !== ids.length ||
          ids.some(id => !this.columns.some(column => column.id === id))) throw new Error("CanopyX: name each column once.");
      if (this.cancelResize) this.cancelResize();
      const columns = new Map(this.columns.map(column => [column.id, column]));
      this.columns = ids.map(id => columns.get(id));
      // An order is honoured as given: a pinned column moved into the scrolling centre stops being pinned.
      this.columns.forEach((column, index, all) => {
        if (column.pin === "left" && all.slice(0, index).some(item => item.pin !== "left") || column.pin === "right" && all.slice(index + 1).some(item => item.pin !== "right")) column.pin = "none";
      });
      this.buildHeader(); this.syncColumnControls(); this.scheduleRender(); this.stateChanged();
    },

    viewName(name) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("CanopyX: view names need 1 to 100 nonblank characters.");
      return name.trim();
    },
    getSavedViews() { return [...this.savedViews.keys()]; },
    saveView(name) {
      name = this.viewName(name);
      if (!this.getQuery()) throw new Error("CanopyX: saving needs an accepted query.");
      if (!this.savedViews.has(name) && this.savedViews.size >= 20) throw new Error("CanopyX: maximum 20 saved views.");
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
      try { global.sessionStorage.setItem(this.storageKey, JSON.stringify({ current: state, views: [...this.savedViews].map(([name, value]) => ({ name, state: value })) })); }
      catch (_) { /* A disabled or full storage leaves the current session usable. */ }
    }
  });
