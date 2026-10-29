  // Pivot intent and its opt-in stay in the reporting entry. Calculation and UI install only on first use.
  const GRID_PIVOT = {};
  const pivotEnabled = view => !!view.reporting?.pivot || !!view.reporting?.pivotable;
  function pivotDefinition(view, input) {
    if (!pivotEnabled(view) || !input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["rows", "columns", "values", "maxColumns", "topNColumns", "sortByTotal"].includes(key))) throw new Error("CanopyX: invalid pivot definition.");
    const axis = (value, max) => {
      if (!Array.isArray(value) || value.length > max) throw new Error("CanopyX: invalid pivot axis.");
      const levels = reportingGroupLevels(view, value);
      if (levels.some(level => level.aggregate !== undefined || view.columns.find(column => column.id === level.column).filterable === false)) throw new Error("CanopyX: pivot axes need sortable and filterable columns.");
      return levels;
    };
    const rows = axis(input.rows, 4), columns = axis(input.columns, 2), values = input.values, maxColumns = input.maxColumns ?? 200, topNColumns = input.topNColumns;
    if (!Array.isArray(values) || !values.length || values.length > 32 || new Set(values).size !== values.length ||
        values.some(id => !view.reporting.aggregates?.some(aggregate => aggregate.id === id)) ||
        !Number.isInteger(maxColumns) || maxColumns < 1 || maxColumns > 200 ||
        topNColumns !== undefined && (!Number.isInteger(topNColumns) || topNColumns < 1 || topNColumns > 200)) throw new Error("CanopyX: invalid pivot values or column limit.");
    const sort = input.sortByTotal;
    if (sort !== undefined && (!sort || typeof sort !== "object" || Array.isArray(sort) || Object.keys(sort).some(key => !["aggregate", "direction"].includes(key)) ||
        !values.includes(sort.aggregate) || !["asc", "desc"].includes(sort.direction))) throw new Error("CanopyX: invalid pivot total sort.");
    return gridFreeze({ rows, columns, values: [...values], maxColumns, ...(topNColumns === undefined ? {} : { topNColumns }), ...(sort === undefined ? {} : { sortByTotal: { ...sort } }) });
  }
  GRID_REPORTING.pivotDefinition = pivotDefinition;
  GRID_REPORTING.preparePivotExport = (grid, options) => {
    if (!GRID_PIVOT.prepareExport) throw new Error("CanopyX: pivot table capture needs an accepted active pivot.");
    return GRID_PIVOT.prepareExport(grid, options, column => {
      const numeric = column.kind === "number";
      return { ...column, width: { unit: "css-px", preferred: numeric ? 120 : 240, minimum: 40 },
        wrap: !numeric, alignment: numeric ? "right" : "left" };
    });
  };
  function pivotDefaultState(view) {
    return view.reporting?.pivot ? { ...pivotDefinition(view, view.reporting.pivot), active: true, collapsedRows: [], collapsedColumns: [] } : null;
  }
  function pivotIntent(grid) {
    if (grid.pivotState === undefined) grid.pivotState = pivotDefaultState(grid.view);
    return grid.pivotState;
  }
  function pivotRequestOf(grid, query, revision, state = pivotIntent(grid)) {
    const { active, collapsedRows, collapsedColumns, columnKey, ...definition } = state;
    return { query: gridQuery(grid.view, { ...query, revision }), definition: pivotDefinition(grid.view, definition) };
  }
  const PIVOT_PART = definePart(DataGrid, "pivot", "pivot analysis", () => ({ DataGrid, GRID_PIVOT, GRID_ROWS, GRID_SHOW_AS, GRID_SHOW_AS_MODES, GRID_BUCKETS, GRID_CALCULATIONS,
    UI_IMPL, UI_TOOLS, h, setText, fill, gridButton, gridFreeze, gridQuery, gridQueryStart, gridQueryRows, gridScalar, cellValue, cellText, gridKeyCompare, gridOrder,
    reportingAggregateName, reportingValueText, numberFormat, formatting, gridExportSignal, validateGridPage, checkDocument, validStructuralCount, gridOperationActive, pivotDefinition, pivotIntent, pivotRequestOf, showAsMode, showAsCaption }));
  const PIVOT_VALIDATE = GRID_REPORTING.validate, PIVOT_CHROME = DataGrid.prototype.buildGridChrome, PIVOT_REQUEST = DataGrid.prototype.requestPage;
  GRID_REPORTING.validate = view => {
    PIVOT_VALIDATE(view);
    if (view.reporting.pivotable !== undefined && typeof view.reporting.pivotable !== "boolean" || pivotEnabled(view) && (!view.reporting.aggregates?.length || view.source.navigation === "cursor")) throw new Error("CanopyX: pivots need offset reporting with declared aggregates.");
    if (view.reporting.pivot !== undefined) pivotDefinition(view, view.reporting.pivot);
  };
  Object.assign(DataGrid.prototype, {
    async loadPivot() { await this.loadRows(); await loadPart(VALUES_PART); await loadPart(BUCKETS_PART); await loadPart(PIVOT_PART); },
    buildGridChrome() {
      PIVOT_CHROME.call(this);
      if (!pivotEnabled(this.view)) return;
      const button = gridButton(this.labels.gridPivot, () => this.loadPivot().then(() => this.configurePivot(button)).catch(error => this.emit("error", { error })));
      button.classList.add("cx-pivot-toggle"); this.toolbar.append(button); this.pivotButton = button;
    },
    async requestPage(query, signal) {
      const restore = this.stateQueryRestore?.epoch === this.queryEpoch ? this.stateQueryRestore : null;
      const state = restore ? restore.state.pivot || pivotDefaultState(this.view) : pivotIntent(this);
      if (!pivotEnabled(this.view) || !state?.active || signal !== this.dataLifetime.signal) return PIVOT_REQUEST.call(this, query, signal);
      await this.loadPivot();
      const page = validateGridPage(await GRID_ROWS.base.requestPage.call(this, query, signal), this.view, query);
      await this.requestPivot(query, page, signal, restore, state); return page;
    },
    async setPivot(input) {
      if (!pivotEnabled(this.view)) throw new Error("CanopyX: this view does not enable pivots.");
      const current = pivotIntent(this);
      if (input !== false) pivotDefinition(this.view, input);
      await this.loadPivot();
      if (this.destroyed || this.pendingQuery) throw new Error("CanopyX: change pivot on an accepted view.");
      const previous = current && JSON.parse(JSON.stringify(current));
      this.pivotState = input === false ? current && { ...current, active: false } : { ...pivotDefinition(this.view, input), active: true, collapsedRows: [], collapsedColumns: [] };
      try { await this.setQuery(gridQueryStart(this.queryForChange(true), {})); }
      catch (error) { this.pivotState = previous; this.render(); throw error; }
      this.noteViewPreferenceIntent?.(); this.stateChanged(); this.emit("pivot", { pivot: this.getPivot() });
    },
    getPivot() { const state = pivotIntent(this); return state ? gridFreeze(JSON.parse(JSON.stringify(state))) : null; }
  });
  const PIVOT_STATE = { get: DataGrid.prototype.getState, read: DataGrid.prototype.readGridState, apply: DataGrid.prototype.applyStatePresentation, share: DataGrid.prototype.getShareState };
  Object.assign(DataGrid.prototype, {
    getState() { const state = PIVOT_STATE.get.call(this), pivot = pivotEnabled(this.view) && this.getPivot(); if (pivot) state.pivot = pivot; return state; },
    readGridState(input) {
      const state = PIVOT_STATE.read.call(this, input);
      if (input.pivot === undefined) return state;
      const { active, collapsedRows = [], collapsedColumns = [], columnKey, ...definition } = input.pivot || {};
      const keys = values => Array.isArray(values) && values.length <= 10000 && values.every(value => typeof value === "string" && value.length > 0 && value.length <= 65536);
      if (typeof active !== "boolean" || !keys(collapsedRows) || !keys(collapsedColumns) || columnKey !== undefined && (typeof columnKey !== "string" || columnKey.length > 65536)) throw new Error("CanopyX: invalid saved pivot state.");
      state.pivot = { ...pivotDefinition(this.view, definition), active, collapsedRows: [...new Set(collapsedRows)], collapsedColumns: [...new Set(collapsedColumns)], ...(columnKey === undefined ? {} : { columnKey }) }; return state;
    },
    applyStatePresentation(state) {
      const restore = this.stateQueryRestore;
      if (restore?.state === state && restore.pivotCandidate) this.pivotCandidate = restore.pivotCandidate;
      this.pivotState = state.pivot ? JSON.parse(JSON.stringify(state.pivot)) : undefined;
      return PIVOT_STATE.apply.call(this, state);
    },
    getShareState() { const state = PIVOT_STATE.share.call(this), pivot = pivotEnabled(this.view) && this.getPivot(); return pivot ? gridFreeze({ ...state, pivot }) : state; }
  });
  const PIVOT_API = GRID_REPORTING.api;
  GRID_REPORTING.api = (api, grid) => {
    PIVOT_API?.(api, grid);
    if (!pivotEnabled(grid.view)) return;
    api.getPivot = () => grid.getPivot(); api.setPivot = definition => grid.setPivot(definition);
    api.getPivotResult = () => grid.pivotResult || null;
    api.getPivotExport = () => grid.loadPivot().then(() => grid.pivotExport());
    api.setPivotCollapsed = (axis, key, collapsed) => grid.loadPivot().then(() => grid.setPivotCollapsed(axis, key, collapsed));
  };
