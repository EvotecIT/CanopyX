  // ---------- explicit record identities and ephemeral accepted-query selection ----------
  const REPORTING_SELECTION_LIMIT = 10000, SELECTION_BASE = {}, SELECTION_API = GRID_REPORTING.api;
  for (const name of ["setSelection", "emit", "copyFocused", "readGridState"]) SELECTION_BASE[name] = DataGrid.prototype[name];
  GRID_REPORTING.api = (api, grid) => {
    SELECTION_API?.(api, grid);
    if (!grid.view.reporting?.selectionControls) return;
    for (const name of ["getSelectionDescriptor", "selectAllMatching", "selectPage", "setRowSelected", "selectRange"])
      api[name] = grid[name].bind(grid);
    const getIds = api.getSelection;
    api.getSelection = () => {
      if (grid.querySelection) throw new Error("CanopyX: all-matching selection uses getSelectionDescriptor(), not a materialized ID list.");
      return getIds();
    };
  };
  Object.assign(DataGrid.prototype, {
    readGridState(input) {
      const state = SELECTION_BASE.readGridState.call(this, input);
      if (this.view.reporting?.selectionControls && state.selection.length > REPORTING_SELECTION_LIMIT)
        throw new Error("CanopyX: explicit selection is bounded to 10,000 IDs.");
      return state;
    },
    requireReportingSelection(multiple = false) {
      if (this.destroyed || this.pendingQuery || !this.acceptedQuery || !this.view.reporting?.selectionControls ||
          this.view.selection === "none" || multiple && !this.multi)
        throw new Error("CanopyX: selection needs an accepted reporting query and an enabled selection mode.");
    },
    getSelectionDescriptor() {
      return this.querySelection ? gridFreeze({ ...this.querySelection, excludedIds: [...this.selectionExcluded] }) :
        gridFreeze({ kind: "ids", revision: this.snapshot?.revision ?? null, ids: [...this.selected] });
    },
    setSelection(ids) {
      if (this.view.reporting?.selectionControls && Array.isArray(ids) && ids.length > REPORTING_SELECTION_LIMIT)
        throw new Error("CanopyX: explicit selection is bounded to 10,000 IDs; use all-matching selection for large results.");
      // Validate before retiring an existing query selection.
      if (!Array.isArray(ids)) return SELECTION_BASE.setSelection.call(this, ids);
      ids.forEach(id => requireIdentifier(id, "selection ID"));
      if (this.view.selection === "none" && ids.length || !this.multi && new Set(ids).size > 1)
        throw new Error("CanopyX: selection exceeds the view's mode.");
      this.selectionController?.abort();
      this.selectionAnchor = null;
      this.querySelection = null; this.selectionExcluded = null;
      return SELECTION_BASE.setSelection.call(this, ids);
    },
    selectAllMatching() {
      this.requireReportingSelection(true);
      this.selectionController?.abort();
      const query = gridQuery(this.view, { ...this.acceptedQuery, offset: 0, cursor: undefined, limit: this.pageSize });
      this.querySelection = gridFreeze({ kind: "query", query, revision: this.snapshot.revision, matched: this.snapshot.matched });
      this.selectionExcluded = new Set(); this.selected.clear(); this.selectionAnchor = null;
      this.publishQuerySelection();
    },
    publishQuerySelection() {
      this.version++; this.scheduleRender(); this.emit("select", { ids: [], selection: this.getSelectionDescriptor() }); this.stateChanged();
    },
    reportingRowSelected(row) { return this.querySelection ? !this.selectionExcluded.has(row.key) : this.selected.has(row.key); },
    setReportingRowSelected(row, selected) {
      this.requireReportingSelection();
      if (!row || row.status || this.indexOf(row) < 0 || typeof selected !== "boolean")
        throw new Error("CanopyX: choose a loaded accepted record and a boolean selection intent.");
      this.selectionController?.abort();
      if (this.querySelection) {
        if (!selected && !this.selectionExcluded.has(row.key) && this.selectionExcluded.size >= REPORTING_SELECTION_LIMIT)
          throw new Error("CanopyX: query selection supports at most 10,000 exclusions.");
        if (selected) this.selectionExcluded.delete(row.key); else this.selectionExcluded.add(row.key);
        this.publishQuerySelection();
      } else {
        const ids = this.multi || !selected ? new Set(this.selected) : new Set();
        if (selected) ids.add(row.key); else ids.delete(row.key); this.setSelection([...ids]);
      }
      this.selectionAnchor = row._ri;
    },
    setRowSelected(id, selected) {
      requireIdentifier(id, "selection ID");
      return this.setReportingRowSelected([...this.rowCache.values()].find(row => row.key === id), selected);
    },
    emit(name, detail) {
      if (this.view.reporting?.selectionControls) {
        if (name === "query") {
          const key = JSON.stringify([detail.revision, gridResultShape(detail.query)]), previous = this.selectionScopeKey;
          if (previous !== undefined && previous !== key) {
            this.selectionAnchor = null;
            if (this.querySelection || this.selectionRevision !== detail.revision) this.clearSnapshotSelection();
          }
          this.selectionScopeKey = key; this.selectionRevision = detail.revision;
        }
        if (name === "select") detail = { ...detail, selection: this.getSelectionDescriptor() };
        if (name === "select" || name === "query" || name === "error") this.syncSelectionControls?.();
      }
      return SELECTION_BASE.emit.call(this, name, detail);
    },
    copyFocused(row, cell) { return this.querySelection ? this.copy({ scope: "selected" }) : SELECTION_BASE.copyFocused.call(this, row, cell); }
  });
