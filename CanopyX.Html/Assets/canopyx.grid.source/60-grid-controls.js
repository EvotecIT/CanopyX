  // ---------- grid toolbar, column layout and named views ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridFilters: "Filters", gridColumn: "Column", gridOperator: "Condition",
    gridValueType: "Raw value type", gridText: "Text", gridBoolean: "Boolean",
    gridRemoveFilter: "Remove {column} filter", gridApply: "Apply", gridClearFilters: "Clear all filters",
    gridFitAllColumns: "Fit all columns",
    gridViews: "Views", gridViewName: "View name", gridSaveView: "Save view", gridRemoveView: "Remove view",
    gridResetView: "Reset view", gridChooseView: "Choose a saved view", gridInvalidFilter: "Enter a valid filter value.",
    gridContains: "contains", gridStartsWith: "starts with", gridIn: "is any of", gridIsNull: "is missing", gridIsNotNull: "is present",
    gridFindColumn: "Find a column…", gridShowAllColumns: "Show all", gridResetColumns: "Reset columns",
    gridReorderColumn: "{column}: drag, or press Alt+Up or Alt+Down to move", gridPinnedLeft: "Pinned left", gridPinnedRight: "Pinned right"
  }));

  Object.assign(DataGrid.prototype, TOOLBAR_PANELS, {
    // A control switched off in the toolbar options is never built; its API methods stay available.
    buildGridControls() {
      this.startMenus();
      this.buildGridFilters();
      if (this.tools.columns !== false) this.buildGridColumns();
      if (this.tools.views !== false) {
        this.buildSavedViews();
        this.toolbar.querySelector(".cx-grid-views .cx-grid-panel").appendChild(gridButton(this.labels.gridResetView, () => this.resetView().catch(() => {})));
      }
      this.buildExportControls();
    },

    // The Columns menu body ships with the optional editor and renders on first open.
    buildGridColumns() { this.controlPanel(this.labels.columns, "cx-grid-columns", panel => this.renderGridColumns(panel)); },
    syncColumnControls() {},
    async renderGridColumns(panel) {
      setText(panel, this.labels.loading);
      try { await loadGridFilterEditor(); if (!this.destroyed && panel.parentElement.open) { this.renderGridColumns(panel); this.controlFlyouts.forEach(item => item.position()); } }
      catch (error) { if (!this.destroyed) { setText(panel, this.labels.gridLoadFailed); this.emit("error", { error }); } }
    },
    showAllColumns() {
      for (const column of this.columns) column.hidden = false;
      this.buildHeader(); this.syncColumnControls(); this.render(); this.noteViewPreferenceIntent?.(); this.stateChanged();
    },
    resetColumns() {
      const state = this.getState(); this.restorePreferenceIntent = this.viewPreferenceIntent;
      this.applyStatePresentation({ ...state, columns: this.readGridState({ ...state, columns: this.defaultState.columns }).columns });
      this.noteViewPreferenceIntent?.(); this.stateChanged();
    }
  });
