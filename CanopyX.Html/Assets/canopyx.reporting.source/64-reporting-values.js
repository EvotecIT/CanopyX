  // Aggregate mode metadata and saved intent stay small; display math and its menu load on first use.
  const GRID_SHOW_AS = {}, GRID_SHOW_AS_MODES = ["value", "percentGrandTotal", "percentParent", "percentColumn", "percentRow", "runningTotal", "rank", "difference", "percentChange"];
  const VALUES_PART = definePart(DataGrid, "values", "aggregate display modes", () => ({ DataGrid, GRID_SHOW_AS, GRID_SHOW_AS_MODES, h, setText, gridFreeze, reportingAggregateParts }));
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridShowAs: "Show values as", gridShowAsValue: "Value", gridShowAsPercentGrandTotal: "as % of total", gridShowAsPercentParent: "as % of parent",
    gridShowAsPercentColumn: "as % of column", gridShowAsPercentRow: "as % of row", gridShowAsRunningTotal: "as running total", gridShowAsRank: "as rank",
    gridShowAsDifference: "as difference from previous", gridShowAsPercentChange: "as % change from previous"
  }));
  const showAsMode = (grid, aggregate) => grid.aggregateShowAs?.[aggregate.id] ?? aggregate.showAs ?? "value";
  const showAsCaption = (grid, mode) => mode === "value" ? "" : grid.labels["gridShowAs" + mode[0].toUpperCase() + mode.slice(1)];
  const VALUES_VALIDATE = GRID_REPORTING.validate;
  GRID_REPORTING.validate = view => {
    VALUES_VALIDATE(view);
    if (view.reporting?.aggregates?.some(aggregate => aggregate.showAs !== undefined && !GRID_SHOW_AS_MODES.includes(aggregate.showAs))) throw new Error("CanopyX: unknown aggregate display mode.");
  };
  const VALUES_PAGE = DataGrid.prototype.requestPage;
  DataGrid.prototype.requestPage = async function (query, signal) {
    if (this.view.reporting?.aggregates?.some(aggregate => showAsMode(this, aggregate) !== "value")) await loadPart(VALUES_PART);
    return VALUES_PAGE.call(this, query, signal);
  };
  Object.assign(DataGrid.prototype, {
    async showAggregateMenu(column, aggregates, values, button) {
      await loadPart(VALUES_PART); await this.requirePart("filter-editor");
      if (!this.destroyed && !this.pendingQuery) this.openAggregateMenu(column, aggregates, values, button);
    },
    async setAggregateShowAs(id, mode) {
      await loadPart(VALUES_PART);
      if (this.destroyed || this.pendingQuery || !this.view.reporting?.aggregates?.some(aggregate => aggregate.id === id) || !GRID_SHOW_AS_MODES.includes(mode)) throw new Error("CanopyX: choose a declared aggregate and display mode on an accepted view.");
      this.aggregateShowAs = Object.assign(Object.create(null), this.aggregateShowAs, { [id]: mode });
      this.aggregateDisplayCache = null; this.version++; this.render(); this.syncSummaryControls?.(); this.stateChanged(); this.noteViewPreferenceIntent?.();
      this.emit("aggregateDisplay", { aggregate: id, mode });
    },
    async getDisplaySummary() { await loadPart(VALUES_PART); return this.summary ? GRID_SHOW_AS.summary(this, this.summary).result : null; }
  });
  const VALUES_STATE = { get: DataGrid.prototype.getState, read: DataGrid.prototype.readGridState, apply: DataGrid.prototype.applyStatePresentation, share: DataGrid.prototype.getShareState };
  Object.assign(DataGrid.prototype, {
    getState() {
      const state = VALUES_STATE.get.call(this);
      if (this.aggregateShowAs && Object.keys(this.aggregateShowAs).length) state.aggregateShowAs = { ...this.aggregateShowAs };
      return state;
    },
    readGridState(input) {
      const state = VALUES_STATE.read.call(this, input), modes = input.aggregateShowAs;
      if (modes === undefined) return state;
      if (!modes || typeof modes !== "object" || Array.isArray(modes) || Object.keys(modes).length > 32 || Object.values(modes).some(mode => !GRID_SHOW_AS_MODES.includes(mode))) throw new Error("CanopyX: invalid saved aggregate display modes.");
      state.aggregateShowAs = Object.fromEntries(Object.entries(modes).filter(([id]) => this.view.reporting?.aggregates?.some(aggregate => aggregate.id === id)));
      return state;
    },
    applyStatePresentation(state) {
      this.aggregateShowAs = Object.assign(Object.create(null), state.aggregateShowAs); this.aggregateDisplayCache = null;
      return VALUES_STATE.apply.call(this, state);
    },
    getShareState() {
      const state = VALUES_STATE.share.call(this);
      return this.aggregateShowAs && Object.keys(this.aggregateShowAs).length ? gridFreeze({ ...state, aggregateShowAs: { ...this.aggregateShowAs } }) : state;
    }
  });
  const VALUES_API = GRID_REPORTING.api;
  GRID_REPORTING.api = (api, grid) => {
    VALUES_API?.(api, grid);
    if (grid.view.reporting?.aggregates?.length) {
      api.setAggregateShowAs = (id, mode) => grid.setAggregateShowAs(id, mode);
      api.getDisplaySummary = () => grid.getDisplaySummary();
    }
  };
