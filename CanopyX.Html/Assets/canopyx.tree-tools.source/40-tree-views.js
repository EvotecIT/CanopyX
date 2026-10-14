  // ---------- tree tools: named views and column order ----------
  // A tree with a stateKey remembers its state for the browser session; the Views menu adds up to 20 named snapshots of
  // that state (expansion, selection, columns, sort, filters, time zone, pin) beside it, and Reset view returns to the
  // view's declared presentation and expansion. The Columns menu reorders columns; the tree column always stays first.
  Object.assign(TreeGrid.prototype, {
    prepareSavedViews() {
      this.savedViews = new Map();
      if (this.stateKey()) try {
        const stored = JSON.parse(sessionStorage.getItem(this.stateKey() + ":views") || "[]");
        for (const entry of Array.isArray(stored) ? stored.slice(0, 20) : []) if (this.readState(entry && entry.state)) this.savedViews.set(this.viewName(entry.name), entry.state);
      } catch (error) { /* Unavailable storage or an invalid entry leaves the views that could be read. */ }
    },
    writeSavedViews() {
      if (this.stateKey()) try { sessionStorage.setItem(this.stateKey() + ":views", JSON.stringify([...this.savedViews].map(([name, state]) => ({ name, state })))); }
      catch (error) { /* A disabled or full storage leaves the current session usable. */ }
    },
    viewName(name) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("CanopyX: view names need 1 to 100 nonblank characters.");
      return name.trim();
    },
    getSavedViews() { return [...this.savedViews.keys()]; },
    saveView(name) {
      name = this.viewName(name);
      if (!this.savedViews.has(name) && this.savedViews.size >= 20) throw new Error("CanopyX: maximum 20 saved views.");
      this.savedViews.set(name, this.getState()); this.writeSavedViews(); this.syncSavedViews();
      if (this.savedChoice) this.savedChoice.value = name;
    },
    async applySavedView(name) {
      const state = this.savedViews.get(this.viewName(name));
      if (!state) throw new Error("CanopyX: the saved view does not exist.");
      return this.setState(state);
    },
    removeSavedView(name) { this.savedViews.delete(this.viewName(name)); this.writeSavedViews(); this.syncSavedViews(); },
    resetView() { return this.setState(this.declaredState()); },

    // The view as declared: its column widths and visibility, no sort or filters, and the nodes it declares expanded.
    declaredState() {
      const expanded = [], walk = parent => this.modelChildren(parent).forEach(w => { if (w.h.expanded && this.expandable(w)) { expanded.push(this.pathOf(w)); walk(w); } });
      walk(this.root);
      return { version: 1, expanded, selection: [], columns: this.declaredColumns(), sort: null, filters: [], timeZone: this.view.timeZone === "local" ? "local" : "utc",
        pinTreeColumn: !!this.view.pinTreeColumn || this.columns[0].pinned !== null, focus: null, anchor: null };
    },
    declaredColumns() {
      return this.view.columns.map((declared, index) => ({ id: declared.id, width: columnWidth(this.columns.find(column => column.id === declared.id), declared.width ?? 160),
        hidden: index > 0 && !!declared.hidden }));
    },

    setColumnOrder(ids) {
      if (!Array.isArray(ids) || ids.length !== this.columns.length || new Set(ids).size !== ids.length || ids.some(id => !this.columns.some(column => column.id === id)))
        throw new Error("CanopyX: name each column once.");
      if (this.cancelResize) this.cancelResize();
      const identity = this.columns[0];
      this.columns = [identity, ...ids.filter(id => id !== identity.id).map(id => this.columns.find(column => column.id === id))];
      for (const column of this.columns) column.pin = column === identity ? "left" : "none";
      this.columnsChanged();
    },
    showAllColumns() { for (const column of this.columns) column.hidden = false; this.columnsChanged(); },
    resetColumns() {
      const declared = this.declaredColumns();
      this.columns = declared.map(saved => Object.assign(this.columns.find(column => column.id === saved.id), { width: saved.width, hidden: saved.hidden, sized: false }));
      this.columnsChanged();
    },
    columnsChanged() { this.buildHeader(); this.syncColumnControls(); this.relayout(); this.stateChanged(); }
  });
