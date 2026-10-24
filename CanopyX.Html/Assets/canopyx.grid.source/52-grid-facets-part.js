  // ---------- the facet panel comes with a part (docs/facets.md) ----------
  // A view's facets (value lists with counts, and ranges with histograms, for the columns it names) show in a panel beside or
  // above the grid, which ships in canopyx-facets.js (Build/parts.json). A grid whose view or options declare facets loads
  // the part with its first query and is ready once both are. The panel's selections are the reader's own filters, so the
  // query, chips, saved views and exports carry them; the grid state also keeps whether the panel is open.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridFacetPanel: "Filter by", gridFacetPanelHide: "Hide the filter panel", gridFacetPanelShow: "Show the filter panel",
    gridFacetShowMore: "Show {count} more", gridFacetShowFewer: "Show fewer", gridFacetEmptyValue: "(Empty)",
    gridFacetFrom: "From", gridFacetTo: "To", gridFacetHistogram: "Distribution of {column}", gridFacetBin: "{from} to {to}: {count} rows",
    gridFacetNoChart: "Too many values to chart", gridFacetClear: "Clear {column}", gridFacetCustom: "Another condition filters this column.",
    gridFacetResult: "{count} matching rows", gridFacetSelected: "{count} selected", gridFacetValueCount: "{value}, {count} rows",
    gridFacetCollapse: "Collapse {column}", gridFacetExpand: "Expand {column}", gridFacetInvalid: "Enter a valid value.", gridFacetReversed: "From must not be after To."
  }));
  const GRID_FACETS = definePart(DataGrid, "facets", "facet panel", () => ({ DataGrid, h, setText, fill, gridButton, gridIcon, gridQueryStart,
    gridQueryRows, gridColumnProjection, gridScalar, gridOrder, gridKeyCompare, gridFacetKey, cellText, foldText, numberFormat, gridCellRenderer, gridFreeze }));
  Object.assign(DataGrid.prototype, {
    loadFacets() { return this.facetLoad ||= loadPart(GRID_FACETS).then(() => this.destroyed || this.startFacets()).catch(error => { this.facetLoad = null; throw error; }); },
    setFacetPanelOpen(open) { return this.loadFacets().then(() => this.setFacetPanelOpen(open)); },
    getFacetPanel() { return gridFreeze({ open: this.facetOpen ?? null, columns: (this.facetColumns || []).map(facet => facet.column) }); }
  });
  // The panel's open state travels with the grid state (saved views, the session), also before the part is in.
  const FACET_STATE = { get: DataGrid.prototype.getState, read: DataGrid.prototype.readGridState, apply: DataGrid.prototype.applyStatePresentation,
    init: DataGrid.prototype.initializeState };
  Object.assign(DataGrid.prototype, {
    getState() { const state = FACET_STATE.get.call(this); if ((this.view.facets || this.opts.facets) && this.facetOpen !== undefined) state.facets = { open: this.facetOpen }; return state; },
    readGridState(input) {
      const state = FACET_STATE.read.call(this, input);
      if (input.facets !== undefined) {
        const facets = input.facets;
        if (!facets || typeof facets !== "object" || Array.isArray(facets) || Object.keys(facets).some(key => key !== "open") || typeof facets.open !== "boolean")
          throw new Error("CanopyX: invalid saved facet panel state.");
        if (this.view.facets || this.opts.facets) state.facets = { open: facets.open };
      }
      return state;
    },
    applyStatePresentation(state) {
      // The base answers a promise when presentation work is asynchronous (formatting rules); setState waits for it.
      const applied = FACET_STATE.apply.call(this, state);
      if (state.facets && state.facets.open !== this.facetOpen && !this.destroyed) { if (this.facetPanel) this.setFacetPanelOpen(state.facets.open).catch(error => this.emit("error", { error })); else this.facetOpen = state.facets.open; }
      return applied;
    },
    initializeState() {
      if (this.initialState?.facets) this.facetOpen = this.initialState.facets.open;
      const ready = FACET_STATE.init.call(this);
      return this.view.facets || this.opts.facets ? Promise.all([ready, this.loadFacets().catch(error => this.emit("error", { error }))]).then(([result]) => result) : ready;
    }
  });
